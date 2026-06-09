/**
 * chatService.ts — singleton WebSocket chat that persists across route changes.
 *
 * Usage:
 *   chatService.init(store)        // call once from App.vue after auth
 *   chatService.send(text)         // send a message
 *   chatService.sendTypingStart()
 *   chatService.sendTypingStop()
 *   chatService.disconnect()       // call on logout
 *
 * The service writes its state into the Vuex store (module 'chat') so any
 * component can read it reactively without owning the socket lifecycle.
 */

import { Store } from 'vuex';
import { getChatRegistrationStatus } from '@/utilities/chatApi';
import { AUTH_BASE_URL } from '@/utilities/serverUrls';

export type ChatMessage = {
  type: 'message' | 'system';
  username?: string;
  isAdmin?: boolean;
  text: string;
  timestamp: number;
};

type OnlineUser = { username: string; isAdmin: boolean };

const RECONNECT_DELAY_MS = 5_000;
const REJECTED_CLOSE_CODES = new Set([4001, 4003]);

// ── Server-push helpers ───────────────────────────────────────────────────────

/**
 * Convert a base64url string to a Uint8Array (needed for applicationServerKey).
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

/**
 * Fetch the server's VAPID public key.
 * Returns null when the server hasn't configured push (503 or network error).
 */
async function fetchVapidPublicKey(): Promise<string | null> {
  try {
    const res = await fetch(`${AUTH_BASE_URL}/api/v2/push/vapid-key`, {
      credentials: 'include',
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.publicKey === 'string' ? data.publicKey : null;
  } catch {
    return null;
  }
}

/**
 * Register the active ServiceWorker's push subscription with the server.
 * Silently no-ops when:
 *  - Notifications are not granted
 *  - Push API is not supported (non-HTTPS, old browser)
 *  - Server hasn't configured VAPID keys
 *
 * Must be called AFTER Notification.requestPermission() resolves to 'granted'.
 */
async function registerServerPushSubscription(): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  if (Notification.permission !== 'granted') return;

  const vapidPublicKey = await fetchVapidPublicKey();
  if (!vapidPublicKey) return; // server push not configured

  try {
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
    }

    // Send subscription to the server so it can push to us when offline
    const sub = subscription.toJSON() as {
      endpoint: string;
      keys?: { p256dh?: string; auth?: string };
    };

    if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) return;

    await fetch(`${AUTH_BASE_URL}/api/v2/push/subscribe`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: sub.endpoint,
        keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
      }),
    });
  } catch (err) {
    // Push subscription can fail for many benign reasons (blocked by OS, etc.)
    console.warn('[chatService] Could not register server push subscription:', err);
  }
}

// ── ChatService class ─────────────────────────────────────────────────────────

class ChatService {
  private ws: WebSocket | null = null;
  private store: Store<any> | null = null;
  private reconnectTimer: number | null = null;
  private typingDebounceTimer: number | null = null;
  private lastCloseWasRejected = false;
  private registrationCheckInFlight: Promise<boolean> | null = null;
  private started = false;

  // ── Public API ──────────────────────────────────────────────────────────────

  init(store: Store<any>): void {
    this.store = store;
    if (!this.started) {
      this.started = true;
      this.connect();
    }
  }

  send(text: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ text }));
    this.sendTypingStop();
  }

  sendTypingStart(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    if (this.typingDebounceTimer !== null) window.clearTimeout(this.typingDebounceTimer);
    this.ws.send(JSON.stringify({ type: 'typing_start' }));
    this.typingDebounceTimer = window.setTimeout(() => {
      this.typingDebounceTimer = null;
    }, 400);
  }

  sendTypingStop(): void {
    if (this.typingDebounceTimer !== null) {
      window.clearTimeout(this.typingDebounceTimer);
      this.typingDebounceTimer = null;
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'typing_stop' }));
    }
  }

  sendReaction(messageKey: string, emoji: string, delta: 1 | -1): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: 'reaction', messageKey, emoji, delta }));
  }

  disconnect(): void {
    this.started = false;
    this.closeSocket();
    this.commit('setConnected', false);
    this.commit('setConnecting', false);
    this.commit('setStatusMessage', '');
    this.commit('setOnlineUsers', []);
    this.commit('setTypingUsers', []);
  }

  /**
   * Request notification permission and, if granted, register a server-push
   * subscription so @mentions arrive even when the app is closed / backgrounded.
   *
   * On iOS 16.4+ (PWA added to Home Screen) this is the call that enables
   * true background push. On other platforms it enables both in-app toasts
   * and OS-level notifications.
   */
  async requestNotificationPermission(): Promise<NotificationPermission> {
    if (!('Notification' in window)) return 'denied';

    let permission = Notification.permission;

    if (permission === 'default') {
      permission = await Notification.requestPermission();
    }

    if (permission === 'granted') {
      // Register server push regardless of whether we just asked or it was
      // already granted — handles the case where the SW updated.
      await registerServerPushSubscription();
    }

    return permission;
  }

  // ── Internals ───────────────────────────────────────────────────────────────

  private commit(mutation: string, payload: any): void {
    this.store?.commit(`chat/${mutation}`, payload);
  }

  private setStatus(message: string, type: 'info' | 'error' = 'info'): void {
    this.commit('setStatusMessage', message);
    this.commit('setStatusType', type);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    if (!this.started || this.lastCloseWasRejected) return;
    this.reconnectTimer = window.setTimeout(() => {
      if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
        this.connect();
      }
    }, RECONNECT_DELAY_MS);
  }

  private closeSocket(): void {
    this.clearReconnectTimer();
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.close();
      this.ws = null;
    }
    this.commit('setConnected', false);
    this.commit('setConnecting', false);
  }

  private async verifyRegistration(): Promise<boolean> {
    if (this.registrationCheckInFlight) return this.registrationCheckInFlight;
    this.registrationCheckInFlight = getChatRegistrationStatus()
      .then((status) => {
        if (!status.authenticated || !status.registered) {
          this.closeSocket();
          this.setStatus(
            'Register or sign in with a registered Politics & War nation to use chat.',
            'error'
          );
          return false;
        }
        return true;
      })
      .catch(() => true)
      .finally(() => {
        this.registrationCheckInFlight = null;
      });
    return this.registrationCheckInFlight;
  }

  private connect(): void {
    if (this.ws || !this.started) return;

    this.commit('setConnecting', true);
    this.setStatus('Checking chat registration...', 'info');

    this.verifyRegistration().then((registered) => {
      if (!registered || this.ws || !this.started) return;

      this.setStatus('Connecting to chat...', 'info');
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/api/chat/ws`;
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.lastCloseWasRejected = false;
        this.commit('setConnected', true);
        this.commit('setConnecting', false);
        this.setStatus('', 'info');
      };

      this.ws.onmessage = (event: MessageEvent) => this.handleMessage(event);

      this.ws.onclose = (event: CloseEvent) => {
        if (REJECTED_CLOSE_CODES.has(event.code)) this.lastCloseWasRejected = true;
        this.ws = null;
        this.commit('setConnected', false);
        this.commit('setConnecting', false);
        this.commit('setOnlineUsers', []);
        this.commit('setTypingUsers', []);
        this.setStatus(
          this.lastCloseWasRejected
            ? 'Chat access was rejected. Register or sign in with a registered nation in the tracked alliance.'
            : 'Chat disconnected. Reconnecting in 5 seconds...',
          'error'
        );
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this.commit('setConnected', false);
        this.commit('setConnecting', false);
        this.setStatus('Unable to connect to chat right now.', 'error');
      };
    });
  }

  private handleMessage(event: MessageEvent): void {
    let data: any;
    try {
      data = JSON.parse(event.data);
    } catch {
      return;
    }

    if ((data.type === 'connected' || data.type === 'self') && data.username) {
      this.commit('setMyUsername', data.username);
      return;
    }

    if (data.type === 'history' && Array.isArray(data.messages)) {
      this.commit(
        'setMessages',
        data.messages.map((m: any) => ({
          ...m,
          text: m.text ?? '',
          isAdmin: m.isAdmin === true,
        }))
      );
      return;
    }

    if (data.type === 'reaction_update') {
      this.commit('applyReactionDelta', {
        messageKey: data.messageKey,
        emoji: data.emoji,
        username: data.username,
        delta: data.delta,
      });
      return;
    }

    if (data.type === 'reactions_snapshot') {
      this.commit('setReactionsSnapshot', data.snapshot);
      return;
    }

    if (data.type === 'message' || data.type === 'system') {
      if (typeof data.text !== 'string' || typeof data.timestamp !== 'number') return;
      const msg: ChatMessage = {
        type: data.type,
        username: data.username,
        isAdmin: data.isAdmin === true,
        text: data.text,
        timestamp: data.timestamp,
      };
      this.commit('pushMessage', msg);

      // In-app mention: show a toast + play a sound when the app is open.
      // The OS-level notification for offline/background is handled server-side
      // via the stored push subscription (server/services/pushService.ts).
      const myUsername: string = this.store?.state.chat?.myUsername ?? '';
      if (data.type === 'message' && data.username !== myUsername && myUsername) {
        const escaped = myUsername.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (new RegExp(`@${escaped}(?:[^a-zA-Z0-9_]|$)`, 'i').test(data.text)) {
          this.commit('pushMentionToast', {
            id: Date.now() + Math.random(),
            from: data.username || 'Someone',
            text: data.text.slice(0, 120),
          });
          this.playMentionSound();
          // Only show an OS notification when the page is not focused
          // (server-push handles the truly-offline / backgrounded case)
          this.showFocusedPageNotification(data.username || 'Someone', data.text);
        }
      }
      return;
    }

    if (data.type === 'users_list') {
      this.commit('setOnlineUsers', Array.isArray(data.users) ? data.users : []);
      return;
    }

    if (data.type === 'typing_update') {
      this.commit('setTypingUsers', Array.isArray(data.typing) ? data.typing : []);
    }
  }

  private playMentionSound(): void {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.35);
      osc.onended = () => ctx.close();
    } catch {
      // AudioContext unavailable
    }
  }

  /**
   * Show a native OS notification when the page doesn't have focus.
   * This covers the "app is open in another tab" case.
   * The "app is completely closed / backgrounded on iOS" case is handled by
   * the server sending a Web Push to the stored subscription.
   */
  private showFocusedPageNotification(from: string, text: string): void {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (document.hasFocus()) return; // already visible — toast is enough

    try {
      const n = new Notification(`${from} mentioned you`, {
        body: text.slice(0, 100),
        icon: '/favicon.ico',
        tag: `bar3-mention-${Date.now()}`,
      });
      n.onclick = () => {
        window.focus();
        n.close();
      };
    } catch {
      // Notification constructor not available (e.g. SW-only contexts)
    }
  }
}

export const chatService = new ChatService();
