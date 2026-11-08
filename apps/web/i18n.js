import { cardSearchParams } from './cube-url.js';
import { english } from './messages.js';

export const localeStorageKey = 'print-room.locale';
export const supportedLocales = ['zh-CN', 'en'];
export function normalizeLocale(value) {
  if (typeof value !== 'string') return null;
  if (/^zh(?:-|$)/i.test(value)) return 'zh-CN';
  if (/^en(?:-|$)/i.test(value)) return 'en';
  return null;
}
export function resolveLocale({ query, saved, browser } = {}) {
  return normalizeLocale(query) || normalizeLocale(saved) || normalizeLocale(browser) || 'en';
}
function savedLocale() { try { return localStorage.getItem(localeStorageKey); } catch { return null; } }
const browser = typeof window !== 'undefined';
let locale = browser ? resolveLocale({ query: cardSearchParams(location.search).get('lang'), saved: savedLocale(), browser: navigator.language }) : 'zh-CN';
const listeners = new Set();
export const getLocale = () => locale;
export function t(key, ...values) {
  const message = locale === 'en' ? english[key] ?? key : key;
  return message.replace(/\{(\d+)\}/g, (match, index) => index < values.length ? String(values[index]) : match);
}
// Only used for UI notifications captured before an asynchronous operation completes.
const sources = new Map(Object.entries(english).map(([key, value]) => [value, key]));
export const sourceKey = value => sources.get(value) || value;
export function onLocaleChange(callback) { listeners.add(callback); return () => listeners.delete(callback); }
export function setLocale(value) {
  const next = normalizeLocale(value); if (!next) return;
  if (browser) {
    try { localStorage.setItem(localeStorageKey, next); } catch { /* Sandboxed cards can still use ?lang=. */ }
    const url = new URL(location.href); url.search=cardSearchParams(location.search).toString(); url.searchParams.set('lang', next); history.replaceState(null, '', url);
  }
  locale = next;
  if (browser) document.documentElement.lang = locale;
  for (const callback of listeners) callback(locale);
}

// Bind the original static HTML text nodes once. Inputs and their surrounding DOM are retained.
// Dynamic printer/job/material nodes are never scanned or translated.
export function bindStatic(root = document) {
  const bindings = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode, key = node.textContent.trim();
    if (['SCRIPT', 'STYLE'].includes(node.parentElement?.tagName) || !Object.hasOwn(english, key)) continue;
    const prefix = node.textContent.match(/^\s*/)[0], suffix = node.textContent.match(/\s*$/)[0];
    bindings.push({ node, key, prefix, suffix, last: node.textContent });
  }
  const attributes = [];
  for (const node of root.querySelectorAll('[aria-label], [title], [placeholder], [alt]')) {
    for (const attribute of ['aria-label', 'title', 'placeholder', 'alt']) {
      const key = node.getAttribute(attribute);
      if (key && Object.hasOwn(english, key)) attributes.push({ node, attribute, key, last: key });
    }
  }
  const update = () => {
    document.documentElement.lang = locale;
    for (const item of bindings) if (item.node.isConnected && item.node.textContent === item.last) {
      item.last = item.prefix + t(item.key) + item.suffix; item.node.textContent = item.last;
    }
    for (const item of attributes) if (item.node.isConnected && item.node.getAttribute(item.attribute) === item.last) {
      item.last = t(item.key); item.node.setAttribute(item.attribute, item.last);
    }
    for (const node of root.querySelectorAll('a[href]')) {
      const url = new URL(node.getAttribute('href'), location.href);
      if (url.origin === location.origin && ['/', '/setup', '/preview', '/card'].includes(url.pathname)) {
        url.searchParams.set('lang', locale); node.setAttribute('href', url.pathname + url.search + url.hash);
      }
    }
  };
  update(); onLocaleChange(update);
}
if (browser) document.documentElement.lang = locale;
