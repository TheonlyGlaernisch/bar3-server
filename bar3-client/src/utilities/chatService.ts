/**
 * chatService.ts — singleton WebSocket chat that persists across route changes.
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

const RECONNECT_DELAY_MS = 5_000;
const REJECTED_CLOSE_CODES = new Set([4001, 4003]);

// ── Server-push helpers ───────────────────────────────────────────────────────

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

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

async function registerServerPushSubscription(): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('[chatService] ServiceWorker or PushManager not available');
    return;
  }
  if (Notification.permission !== 'granted') {
    console.warn('[chatService] Notification permission not granted:', Notification.permission);
    return;
  }

  const vapidPublicKey = await fetchVapidPublicKey();
  if (!vapidPublicKey) {
    console.warn('[chatService] Failed to fetch VAPID public key');
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    console.log('[chatService] SW registration ready');

    let subscription = await registration.pushManager.getSubscription();
    console.log('[chatService] Existing subscription:', subscription ? 'found' : 'not found');

    if (!subscription) {
      try {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        });
        console.log('[chatService] New subscription created:', subscription.endpoint.slice(0, 50) + '...');
      } catch (subErr) {
        console.error('[chatService] Failed to create subscription:', subErr);
        throw subErr;
      }
    }

    const sub = subscription.toJSON() as {
      endpoint: string;
      keys?: { p256dh?: string; auth?: string };
    };

    if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
      console.warn('[chatService] Subscription missing required fields');
      return;
    }

    const resp = await fetch(`${AUTH_BASE_URL}/api/v2/push/subscribe`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: sub.endpoint,
        keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
      }),
    });

    if (!resp.ok) {
      console.error('[chatService] Server rejected subscription:', await resp.text());
    } else {
      console.log('[chatService] Subscription registered with server');
    }
  } catch (err) {
    console.error('[chatService] Full subscription error:', err);
  }
}

/**
 * Show a notification via the Service Worker registration.
 * This works on desktop Chrome/Firefox/Safari even when a SW push subscription
 * is active — unlike `new Notification()` which is blocked in that context.
 * Falls back to `new Notification()` when no SW is available.
 */
async function showNotificationViaSwOrFallback(title: string, body: string, tag: string): Promise<void> {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(title, {
        body,
        icon: '/favicon.ico',
        tag,
        renotify: true,
      });
      return;
    } catch {
      // SW path failed — fall through to direct Notification
    }
  }
  // Fallback: direct Notification API (non-SW environments, e.g. localhost dev)
  try {
    const n = new Notification(title, { body, icon: '/favicon.ico', tag });
    n.onclick = () => { window.focus(); n.close(); };
  } catch {
    // Notification not available at all
  }
}

// ── ChatService ───────────────────────────────────────────────────────────────

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
   * Request notification permission and register a server-push subscription.
   * Must be called from a user gesture (button click) on iOS.
   */
  async requestNotificationPermission(): Promise<NotificationPermission> {
    if (!('Notification' in window)) return 'denied';

    let permission = Notification.permission;
    if (permission === 'default') {
      permission = await Notification.requestPermission();
    }

    if (permission === 'granted') {
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

  private async handleMessage(event: MessageEvent): Promise<void> {
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

    // Known admins list — includes offline admins so they appear in @autocomplete
    if (data.type === 'admin_users' && Array.isArray(data.admins)) {
      this.commit('setKnownAdmins', data.admins);
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

      // In-app mention notification (app is open and focused-ish)
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

          // Show OS notification only when the page isn't focused.
          // If a push subscription exists, the server handles delivery via SW push —
          // using showNotification() or new Notification() here would double-notify.
          if (!document.hasFocus() && Notification.permission === 'granted') {
            let swReg = null;
            let hasPushSub = false;

            try {
              if ('serviceWorker' in navigator) {
                swReg = await navigator.serviceWorker.ready;
                hasPushSub = !!(await swReg.pushManager.getSubscription());
              }
            } catch (e) {
              console.warn('[chatService] Failed to check push subscription:', e);
            }

            // Only show local notification if NO push subscription exists
            // (server will handle delivery via web push)
            if (!hasPushSub) {
              try {
                await showNotificationViaSwOrFallback(
                  `${data.username || 'Someone'} mentioned you`,
                  data.text.slice(0, 100),
                  `bar3-mention-${Date.now()}`
                );
              } catch (e) {
                console.warn('[chatService] Failed to show local notification:', e);
              }
            }
          }
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
}

export const chatService = new ChatService();
