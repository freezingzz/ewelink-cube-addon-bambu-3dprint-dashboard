// Local-only review server. Every page is rendered from the current Markdown file.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { Marked } from 'marked';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.README_PREVIEW_PORT || 3040);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw Error('Invalid preview port');
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
const slug = (text) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');
const markdown = new Marked({
  gfm: true,
  renderer: {
    heading({ depth, text, tokens }) {
      return `<h${depth} id="${escape(slug(text))}">${this.parser.parseInline(tokens)}</h${depth}>`;
    },
  },
});
// Only public documentation and chosen synthetic images are accessible here.
const documents = new Set(['README.md', 'NOTICE.md', 'CHANGELOG.md', 'docs/INSTALL.md']);
const rawFiles = new Set([
  'LICENSE',
  'packages/printer-bambu/NOTICE.md',
  'packages/printer-bambu/UPSTREAM_LICENSE',
]);
const images = new Set([
  'cast-status-en.png',
  'cast-materials-en.png',
  'cast-job-en.png',
  'cast-status-zh.png',
  'cast-materials-zh.png',
  'cast-job-zh.png',
  'web-dashboard-idle.jpg',
  'cube-dashboard-idle.png',
  'cube-detail-ams-idle.png',
  'cast-panel-idle.jpg',
]);
function shell(source, locale, title) {
  const zh = locale === 'zh-CN';
  const body = markdown.parse(source);
  return `<!doctype html>
<html lang="${locale}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(title)} · README</title><link rel="stylesheet" href="/preview.css"></head>
<body><main class="readme-file">
<header class="file-header"><span>README.md</span><span class="file-actions">${zh ? '本地 Markdown 预览' : 'Local Markdown preview'} <a href="/README.md">${zh ? '查看原文' : 'Raw'}</a></span></header>
<article class="markdown">${body}</article>
</main></body></html>`;
}
const server = http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; img-src 'self'; style-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  );
  try {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    if (
      !['127.0.0.1', 'localhost', '[::1]'].includes(
        new URL('http://' + req.headers.host).hostname,
      )
    ) {
      res.writeHead(403);
      return res.end('Local preview only');
    }
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405);
      return res.end();
    }
    const locale = url.searchParams.get('lang') === 'en' ? 'en' : 'zh-CN';
    let type = 'text/html; charset=utf-8',
      content;
    const path = decodeURIComponent(url.pathname).slice(1);
    if (!path) {
      const full = await readFile(resolve(root, 'README.md'), 'utf8');
      content = shell(full, locale, 'Bambu 3DPrint Dashboard');
    } else if (path === 'README.md') {
      content = await readFile(resolve(root, path));
      type = 'text/plain; charset=utf-8';
    } else if (documents.has(path)) {
      content = shell(
        await readFile(resolve(root, path), 'utf8'),
        locale,
        path,
      );
    } else if (rawFiles.has(path)) {
      content = await readFile(resolve(root, path));
      type = 'text/plain; charset=utf-8';
    } else if (path === 'preview.css') {
      content = await readFile(
        new URL('./readme-preview.css', import.meta.url),
      );
      type = 'text/css; charset=utf-8';
    } else if (
      path.startsWith('docs/images/') &&
      images.has(path.slice('docs/images/'.length))
    ) {
      content = await readFile(resolve(root, path));
      type = path.endsWith('.jpg') ? 'image/jpeg' : 'image/png';
    } else {
      res.writeHead(404);
      return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': type });
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch {
    res.writeHead(500);
    res.end('Preview unavailable');
  }
});
server.listen(port, '127.0.0.1', () =>
  console.log(`README preview: http://127.0.0.1:${port}/`),
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => server.close(() => process.exit(0)));
