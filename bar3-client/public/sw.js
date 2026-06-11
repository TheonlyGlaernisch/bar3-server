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

function requiresInteraction() {
  const ua = navigator.userAgent.toLowerCase();
  // Opera and some Chromium-based browsers silently drop notifications
  // with requireInteraction: true
  if (/iphone|ipad|ipod/.test(ua)) return false;
  if (/opr\/|opera/.test(ua)) return false;
  return true;
}

// ── Push event ────────────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  console.log('[sw] Push event received');
  
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
      console.log('[sw] Parsed push data:', data);
    } catch (e) {
      data = { body: event.data.text() };
      console.log('[sw] Failed to parse JSON, using text:', data.body);
    }
  } else {
    console.log('[sw] No data in push event');
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
    requireInteraction: requiresInteraction(),
    data: { url: '/chat' },
  };

  console.log('[sw] Showing notification with title:', title, 'options:', options);

  event.waitUntil(
    self.registration
      .showNotification(title, options)
      .then(() => {
        console.log('[sw] Notification shown successfully');
      })
      .catch((err) => {
        console.error('[sw] Error showing notification:', err);
      })
  );
});

// ── Notification click ────────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  console.log('[sw] Notification clicked');
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
  console.log('[sw] Service Worker activated');
  event.waitUntil(self.clients.claim());
});
