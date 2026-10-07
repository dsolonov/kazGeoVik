'use strict';

// Relative URLs also work when GitHub Pages hosts the game under /repository/.
const cachePrefix = `kazgeovik-${self.registration.scope}-`;
const cacheName = `${cachePrefix}v6`;
const assets = [
    './',
    './index.php',
    './style.css?v=6',
    './game.js?v=6',
    './map.js?v=5',
    './ui.js?v=6',
    './location-guide.js?v=6',
    './locations-info.json?v=6',
    './app.js?v=6',
    './manifest.json?v=5',
    './kazakhstan_border.json'
].map(path => new URL(path, self.registration.scope).href);

self.addEventListener('install', event => {
    event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(assets)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
    event.waitUntil(caches.keys().then(keys => Promise.all(
        keys.filter(key => key.startsWith(cachePrefix) && key !== cacheName).map(key => caches.delete(key))
    )).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET' || !assets.includes(event.request.url)) return;
    // Always prefer the published version; only fall back to this game's own cache offline.
    event.respondWith((async () => {
        const cache = await caches.open(cacheName);
        try {
            const response = await fetch(event.request);
            if (response.ok) {
                try { await cache.put(event.request, response.clone()); } catch { /* Storage may be full. */ }
            }
            return response;
        } catch (error) {
            const cached = await cache.match(event.request);
            if (cached) return cached;
            throw error;
        }
    })());
});
