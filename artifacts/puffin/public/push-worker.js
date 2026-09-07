/* eslint-disable no-restricted-globals */
// PUFFIN SRL - Push Notification Worker (Compatible con iOS PWA Standalone, Android y Desktop)

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {
    title: 'PUFFIN SRL',
    body: 'Nuevo mensaje recibido en el sistema.',
    url: '/whatsapp',
    badgeCount: 1,
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      payload = { ...payload, ...parsed };
    } catch (e) {
      try {
        payload.body = event.data.text();
      } catch {}
    }
  }

  const title = payload.title || 'PUFFIN SRL';
  const body = payload.body || 'Tenés una nueva notificación.';
  const targetUrl = payload.data?.url || payload.url || '/whatsapp';

  // Opciones compatibles con iOS Safari y Android
  const options = {
    body: body,
    tag: payload.tag || 'puffin-' + Date.now(),
    data: {
      url: targetUrl,
      timestamp: Date.now(),
    },
  };

  const isApple = /iPhone|iPad|iPod/.test(navigator.userAgent || '');
  if (!isApple) {
    options.icon = '/pwa-192x192.png';
    options.badge = '/pwa-192x192.png';
    options.vibrate = [200, 100, 200];
  }

  // Actualizar el número de badge en el icono de la aplicación en el celular (iOS PWA / Android)
  const badgeVal = payload.badgeCount ?? payload.data?.badgeCount ?? 1;
  const num = typeof badgeVal === 'number' ? badgeVal : parseInt(badgeVal, 10);
  const targetBadge = !isNaN(num) && num > 0 ? num : 1;

  const badgePromise = ('setAppBadge' in self.navigator)
    ? self.navigator.setAppBadge(targetBadge).catch((err) => console.warn('[SW] setAppBadge error:', err))
    : Promise.resolve();

  const notifPromise = self.registration.showNotification(title, options).catch((err) => {
    console.warn('[SW Push] Fallback a notificación mínima:', err);
    return self.registration.showNotification(title, {
      body: body,
      data: { url: targetUrl },
    });
  });

  event.waitUntil(Promise.all([notifPromise, badgePromise]));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // Limpiar o decrementar badge al abrir la notificación
  if ('clearAppBadge' in self.navigator) {
    try { self.navigator.clearAppBadge().catch(() => {}); } catch {}
  }

  const targetUrl = event.notification.data?.url || '/whatsapp';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          if ('navigate' in client && targetUrl) {
            client.navigate(targetUrl);
          }
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
