// CUBE OS 2.15.0 appends ?ihost_env= even when the registered src has a query.
// Normalize this host suffix before reading layout or language; encoded values stay intact.
export function cardSearchParams(search) {
 return new URLSearchParams(search.replace(/^\?/, '').replace(/\?(?=ihost_env=)/g, '&'));
}
