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

  disconnect(): void {
    this.started = false;
    this.closeSocket();
    this.commit('setConnected', false);
    this.commit('setConnecting', false);
    this.commit('setStatusMessage', '');
    this.commit('setOnlineUsers', []);
    this.commit('setTypingUsers', []);
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
      this.commit('setMessages', data.messages.map((m: any) => ({
        ...m,
        text: m.text ?? '',
        isAdmin: m.isAdmin === true,
      })));
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

      // Mention notification
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
          this.sendPushNotification(data.username || 'Someone', data.text);
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

  private async sendPushNotification(from: string, text: string): Promise<void> {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (document.hasFocus()) return;

  // Try service worker first (works in Opera and modern browsers)
  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.ready.catch(() => null);
    if (registration) {
      await registration.showNotification(`${from} mentioned you`, {
        body: text.slice(0, 100),
        icon: '/favicon.ico',
        tag: `bar3-mention-${Date.now()}`,
      }).catch(() => undefined);
      return;
    }
  }

  // Fallback to basic Notification API
  try {
    const n = new Notification(`${from} mentioned you`, {
      body: text.slice(0, 100),
      icon: '/favicon.ico',
      tag: `bar3-mention-${Date.now()}`,
    });
    n.onclick = () => { window.focus(); n.close(); };
  } catch {
    // Notification constructor blocked (Opera without SW, etc.)
  }
}

export const chatService = new ChatService();
