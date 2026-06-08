self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  self.registration.showNotification(data.title || 'Bar 3', {
    body: data.body || '',
    icon: '/favicon.ico',
    tag: data.tag || 'bar3-mention',
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow('/chat'));
});
