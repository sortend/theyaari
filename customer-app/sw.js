const CACHE = 'shahi-darbar-order-v10';
const FILES = [
  './index.html','./app.js','./menu-data.js','./manifest.json',
  './restaurant-building.jpg','./restaurant-interior-1.jpg',
  './restaurant-interior-2.jpg','./restaurant-interior-3.jpg',
  './logo-crest.png','./icon-192.png','./icon-512.png'
];

self.addEventListener('install', e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).catch(()=>{}));
  self.skipWaiting();
});

self.addEventListener('activate', e=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

// Network-first: always try to get the latest version when online.
// Falls back to cache only when offline, so updates are never "stuck".
self.addEventListener('fetch', e=>{
  if(e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(res=>{
        const resClone = res.clone();
        caches.open(CACHE).then(c=>c.put(e.request, resClone)).catch(()=>{});
        return res;
      })
      .catch(()=> caches.match(e.request))
  );
});
