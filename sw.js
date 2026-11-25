// The old address's last service worker (kevinlande.github.io/liblande/):
// it replaces LibLande's offline copy and removes itself, so the next visit
// gets the page that forwards to /linden/. The caches are left alone: they
// belong to the whole site (kevinlande.github.io), and Linden uses the
// papers kept in them.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', ev => ev.waitUntil(self.registration.unregister()));
