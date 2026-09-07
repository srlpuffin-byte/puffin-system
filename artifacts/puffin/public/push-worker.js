/* eslint-disable no-restricted-globals */
// PUFFIN SRL - Push Notification Worker (Compatible con iOS PWA Standalone, Android y Desktop)

self.addEventListener('push', (event) => {
  let data = {
    title: 'PUFFIN SRL',
    body: 'Tenés una nueva notificación en el sistema.',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: 'puffin-notification',
    url: '/panel',
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const title = data.title || 'PUFFIN SRL';
  const targetUrl = data.data?.url || data.url || '/whatsapp';

  const options = {
    body: data.body || 'Nuevo aviso en Puffin.',
    icon: data.icon || '/pwa-192x192.png',
    badge: data.badge || '/pwa-192x192.png',
    tag: data.tag || 'puffin-' + Date.now(),
    data: {
      url: targetUrl,
      timestamp: Date.now(),
    },
    vibrate: [200, 100, 200],
    requireInteraction: true,
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
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
