self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
// Never cache private conversations, credentials, or API responses.
self.addEventListener('fetch', event => { if (event.request.method === 'GET' && new URL(event.request.url).origin === self.location.origin) event.respondWith(fetch(event.request)); });
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => { const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true }); const cockpit = windows.find(client => new URL(client.url).pathname === '/'); if (cockpit) await cockpit.focus(); else await self.clients.openWindow('/'); })());
});
