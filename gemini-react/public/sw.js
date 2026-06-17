// Service Worker for Nemon PWA
const CACHE_NAME = 'nemon-pwa-cache-v1';

// Install event
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// Activate event
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Fetch event (required for PWA installability check in Chrome)
self.addEventListener('fetch', (event) => {
  // Pass-through strategy to avoid caching conflicts while fulfilling PWA requirements
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});
