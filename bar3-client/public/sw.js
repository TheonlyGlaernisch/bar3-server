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

  const targetUrl = new URL('/chat', self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // Check if the chat window/app is already open
        for (let i = 0; i < windowClients.length; i++) {
          const client = windowClients[i];
          if (client.url === targetUrl && 'focus' in client) {
            // Bring the existing minimized web app back to the front
            return client.focus();
          }
        }
        // If it is completely closed, open a new instance safely
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
  );
});

