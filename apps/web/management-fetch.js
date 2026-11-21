// Web storage is scoped to this add-on's origin, including the published port.
export async function managementFetch(path, init = {}) {
  const headers = new Headers(init.headers);
  const session = localStorage.getItem('print-room.management');
  const challenge = sessionStorage.getItem('print-room.challenge');
  if (session) headers.set('X-Print-Room-Session', session);
  if (challenge) headers.set('X-Print-Room-Challenge', challenge);
  const response = await fetch(path, { ...init, headers });
  if (response.ok) {
    const issued = response.headers.get('X-Print-Room-Session');
    const pending = response.headers.get('X-Print-Room-Challenge');
    if (issued === 'signed-out') localStorage.removeItem('print-room.management');
    else if (issued) localStorage.setItem('print-room.management', issued);
    if (pending) sessionStorage.setItem('print-room.challenge', pending);
    if (issued || path === '/api/v1/setup/logout') sessionStorage.removeItem('print-room.challenge');
  }
  return response;
}
