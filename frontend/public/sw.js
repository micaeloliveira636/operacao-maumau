/* Service Worker — Operação Maumau
   Responsável por:
   - cache do app shell (funciona offline / instalável)
   - receber push e exibir notificações
   - focar/abrir a aba ao clicar na notificação
*/

const CACHE = 'maumau-shell-v3';
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Estratégia:
// - navegações (HTML): network-first com fallback pro shell em cache (SPA offline)
// - demais GET: stale-while-revalidate leve para assets estáticos
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Nunca cachear chamadas de API (outra origem / rotas dinâmicas).
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((resp) => {
          if (resp && resp.status === 200 && resp.type === 'basic') {
            const copy = resp.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return resp;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

// Push recebido do backend (web-push / VAPID)
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { titulo: 'Maumau', mensagem: event.data ? event.data.text() : '' };
  }

  const titulo = data.titulo || 'Operação Maumau';
  const options = {
    body: data.mensagem || '',
    icon: '/icon-192.png',
    badge: '/icon-badge.png',
    tag: data.demandaId ? `demanda-${data.demandaId}` : undefined,
    renotify: true,
    data: { url: data.url || '/' },
    vibrate: [80, 40, 80],
  };

  event.waitUntil(self.registration.showNotification(titulo, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      for (const client of clientsArr) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client) client.navigate(target).catch(() => {});
          return;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});
