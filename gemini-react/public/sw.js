// Service Worker for Nemon PWA
const CACHE_NAME = 'nemon-pwa-cache-v2';

// Install event - activate immediately
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// Activate event - clean old caches and take control
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event (required for PWA installability check in Chrome)
self.addEventListener('fetch', (event) => {
  // 1. Intercepta APENAS requisições GET
  // Requisições POST, PUT, DELETE, OPTIONS (como chamadas de API, streaming, etc.) NUNCA devem ser interceptadas
  if (event.request.method !== 'GET') {
    return;
  }

  let url;
  try {
    url = new URL(event.request.url);
  } catch (e) {
    return;
  }

  // 2. NUNCA intercepta APIs externas, Firebase, Google APIs, AI Routers ou streaming
  // Deixa a pilha de rede nativa do navegador processar diretamente sem interferência
  if (
    url.origin !== self.location.origin ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('firebase') ||
    url.hostname.includes('orcarouter') ||
    url.hostname.includes('openrouter') ||
    url.hostname.includes('duckduckgo') ||
    url.searchParams.has('alt')
  ) {
    return;
  }

  // 3. Para arquivos locais estáticos da mesma origem, faz pass-through com fallback seguro
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});
