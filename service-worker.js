const CACHE = 'das-geheime-wort-v7.2.6';
const ASSETS = [
  './index.html', './css/app.css?v=7.2.6', './data/words.js', './js/app.js?v=7.2.6', './manifest.webmanifest',
  './assets/hero.jpg', './assets/role-team.jpg', './assets/role-traitor.jpg',
  './assets/discussion.jpg', './assets/result.jpg',
  './assets/comic/hero.png', './assets/comic/team.png', './assets/comic/traitor.png',
  './assets/comic/discussion.png', './assets/comic/result.png',
  './assets/comic/avatars/Comic_Avatar01.PNG',
  './assets/comic/avatars/Comic_Avatar02.PNG',
  './assets/comic/avatars/Comic_Avatar03.PNG',
  './assets/comic/avatars/Comic_Avatar04.PNG',
  './assets/comic/avatars/Comic_Avatar05.PNG',
  './assets/comic/avatars/Comic_Avatar06.PNG',
  './assets/comic/avatars/Comic_Avatar07.PNG',
  './assets/comic/avatars/Comic_Avatar08.PNG',
  './assets/comic/avatars/Comic_Avatar09.PNG',
  './assets/comic/avatars/Comic_Avatar10.PNG',
  './assets/comic/avatars/Comic_Avatar11.PNG',
  './assets/comic/avatars/Comic_Avatar12.PNG',
  './assets/comic/avatars/Comic_Avatar13.PNG',
  './assets/comic/avatars/Comic_Avatar14.PNG',
  './assets/comic/avatars/Comic_Avatar15.PNG',
  './assets/comic/avatars/Comic_Avatar16.PNG',
  './assets/comic/avatars/Comic_Avatar17.PNG',
  './assets/comic/avatars/Comic_Avatar18.PNG',
  './assets/comic/avatars/Comic_Avatar19.PNG',
  './assets/comic/avatars/Comic_Avatar20.PNG',
  './assets/comic/avatars/Comic_Avatar21.PNG',
  './assets/comic/avatars/Comic_Avatar22.PNG',
  './assets/comic/avatars/Comic_Avatar23.PNG',
  './assets/comic/avatars/Comic_Avatar24.PNG',
  './assets/comic/avatars/Comic_Avatar25.PNG',
  './assets/comic/avatars/Comic_Avatar26.PNG',
  './assets/comic/avatars/Comic_Avatar27.PNG',
  './assets/comic/avatars/Comic_Avatar28.PNG',
  './assets/comic/avatars/Comic_Avatar29.PNG',
  './assets/comic/avatars/Comic_Avatar30.PNG',
  './assets/icon-180.png', './assets/icon-192.png', './assets/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const request = event.request;
  const isNavigation = request.mode === 'navigate';

  if (isNavigation) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put('./index.html', copy));
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request))
  );
});
