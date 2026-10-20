// Service worker mínimo: permite instalar o site como app. Sempre busca a versão nova na rede
// primeiro e só usa a cópia guardada se a rede falhar, então nunca prende uma versão antiga.
// Só cuida dos arquivos do próprio site (tarkov.dev, relays e vídeo passam direto).

const CACHE = 'tela-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
