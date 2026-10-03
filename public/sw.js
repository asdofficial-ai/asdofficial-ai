self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
// Never cache private conversations, credentials, or API responses.
self.addEventListener('fetch', event => { if (event.request.method === 'GET' && new URL(event.request.url).origin === self.location.origin) event.respondWith(fetch(event.request)); });
