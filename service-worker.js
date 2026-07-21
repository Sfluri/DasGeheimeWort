const CACHE = 'das-geheime-wort-v6.1.0';
const ASSETS = [
  './', './index.html', './css/app.css', './data/words.js', './js/app.js', './manifest.webmanifest',
  './assets/hero.jpg',
  './assets/role-team.jpg', './assets/role-traitor.jpg', './assets/discussion.jpg',
  './assets/result.jpg', './assets/icon-180.png', './assets/icon-192.png', './assets/icon-512.png'
];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    const copy = response.clone();
    caches.open(CACHE).then(cache => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match('./index.html'))));
});
