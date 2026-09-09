// Only the app shell is cached. Never cache sessions, API responses or meal photos.
const VERSION='food-tracker-v2-2';
const FILES=['/','/index.html','/app.css','/app.js','/sync-core.js','/model.js','/cloud.js','/photo.js','/config.js','/manifest.webmanifest','/icon-192.png','/icon-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(VERSION).then(cache=>cache.addAll(FILES))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('food-tracker-')&&k!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);if(url.origin!==self.location.origin||event.request.method!=='GET'||url.pathname.startsWith('/api/'))return;
 if(event.request.mode==='navigate'){event.respondWith(caches.match('/').then(hit=>hit||fetch(event.request)));return;}
 if(FILES.includes(url.pathname))event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request)));
});
