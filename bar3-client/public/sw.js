/**
 * Bar 3 Service Worker
 *
 * Handles:
 *  - Web Push notifications (server-sent, works even when the app is closed)
 *  - notificationclick to focus/open the chat tab
 *
 * iOS note: as of iOS 16.4+ PWAs added to the Home Screen support Web Push
 * when the app has been granted notification permission. The app MUST be added
 * to the Home Screen AND the user must have granted permission inside the PWA.
 */

// Detect if running on iOS
function isIOS() {
  const ua = navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(ua);
}

// ── Push event ────────────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { body: event.data.text() };
    }
  }

  const title = data.title || 'Bar 3';
  const options = {
    body: data.body || '',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: data.tag || 'bar3-mention',
    // renotify: show a new notification even if one with the same tag exists
    renotify: true,
    // iOS: works fine with false, actually prefers it
    // Desktop Chrome: needs true for reliable delivery
    requireInteraction: !isIOS(),
    data: { url: '/chat' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ── Notification click ────────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = new URL('/chat', self.location.origin).href;

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // If the chat tab is already open, just bring it to the front
        for (const client of windowClients) {
          if (client.url === targetUrl && 'focus' in client) {
            return client.focus();
          }
        }
        // Otherwise open a new tab/window
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
  );
});

// ── Activate ───────────────────────────────────────────────────────────────
// Claim existing clients immediately so the updated SW takes effect without
// a page reload. This ensures the push subscription is always tied to the
// active SW registration.
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
