<template>
  <div class="chat-page">
    <section class="chat-container">
      <div class="chat-header">
        <div>
          <h2>Alliance Chat</h2>
          <p class="chat-subtitle">provided by TRF or something</p>
        </div>
        <div class="d-flex align-center gap-8">
          <div class="online-panel-wrapper" v-if="onlineUsers.length">
            <button
              class="online-pill"
              :class="{ 'online-pill--active': showOnlineUsers }"
              @click.stop="showOnlineUsers = !showOnlineUsers"
              :aria-expanded="showOnlineUsers"
              aria-label="Toggle online users list"
            >
              <span class="online-dot" />
              {{ onlineUsers.length }} online
            </button>
            <Transition name="panel">
              <ul v-if="showOnlineUsers" class="online-panel" role="listbox">
                <li
                  v-for="user in onlineUsers"
                  :key="user.username"
                  class="online-panel__user"
                  :class="{ 'online-panel__user--admin': user.isAdmin }"
                >
                  <span class="online-dot online-dot--sm" />
                  {{ user.username }}
                  <span v-if="user.isAdmin" class="online-panel__admin-badge">admin</span>
                </li>
                <li v-if="!onlineUsers.length" class="online-panel__empty">Nobody online</li>
              </ul>
            </Transition>
          </div>
          <div class="connection-pill" :class="connectionClass">
            {{ connectionLabel }}
          </div>
        </div>
      </div>

      <div v-if="statusMessage" class="chat-status" :class="statusType">
        {{ statusMessage }}
      </div>

      <div class="chat-messages" ref="messagesContainer" aria-live="polite">
        <div v-if="messages.length === 0" class="empty-state">
          No messages yet. Start the conversation below.
        </div>
        <div
          v-for="message in messages"
          :key="`${message.timestamp}-${message.username || message.type}-${message.text}`"
          :class="['message', message.type]"
        >
          <div class="message-header" v-if="message.type === 'message'">
            <span :class="['username', { 'username--admin': message.isAdmin }]">{{ message.username }}</span>
            <span class="timestamp">{{ formatTimestamp(message.timestamp) }}</span>
          </div>
          <div
            class="message-content"
            :class="{ system: message.type === 'system' }"
            v-html="renderText(message.text)"
          />
        </div>
      </div>
      <div class="typing-indicator">
        <template v-if="typingUsers.length === 1">
          <span class="dots"><span>.</span><span>.</span><span>.</span></span>
          {{ typingUsers[0] }} is typing
        </template>
        <template v-else-if="typingUsers.length === 2">
          <span class="dots"><span>.</span><span>.</span><span>.</span></span>
          {{ typingUsers[0] }} and {{ typingUsers[1] }} are typing
        </template>
        <template v-else-if="typingUsers.length > 2">
          <span class="dots"><span>.</span><span>.</span><span>.</span></span>
          Several people are typing
        </template>
      </div>
      <form class="chat-input-container" @submit.prevent="sendMessage">
        <label class="sr-only" for="chat-message-input">Chat message</label>
        <div class="input-wrapper">
          <Transition name="panel">
            <ul v-if="mentionSuggestions.length" class="mention-menu" role="listbox">
              <li
                v-for="(u, i) in mentionSuggestions"
                :key="u.username"
                class="mention-menu__item"
                :class="{ 'mention-menu__item--active': i === mentionIndex }"
                @mousedown.prevent="insertMention(u.username)"
                role="option"
              >
                <span class="online-dot online-dot--sm" />
                {{ u.username }}
                <span v-if="u.isAdmin" class="online-panel__admin-badge">admin</span>
              </li>
            </ul>
          </Transition>
          <input
            id="chat-message-input"
            ref="inputRef"
            v-model="newMessage"
            placeholder="Type your message..."
            :disabled="!canSend"
            maxlength="500"
            class="message-input"
            autocomplete="off"
            @input="onInputChange"
            @keydown="onInputKeydown"
            @blur="sendTypingStop"
          />
        </div>
        <button
          type="submit"
          :disabled="!canSend || !newMessage.trim()"
          class="send-button"
        >
          Send
        </button>
      </form>
    </section>
  </div>
</template>

<script lang="ts">
import { computed, defineComponent, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useStore } from 'vuex';
import { getChatRegistrationStatus } from '@/utilities/chatApi';

type ChatPayload = {
  type: 'message' | 'system' | 'history';
  username?: string;
  text?: string;
  timestamp?: number;
  isAdmin?: boolean;
  messages?: ChatMessage[];
};

type ChatMessage = {
  type: 'message' | 'system';
  username?: string;
  isAdmin?: boolean;
  text: string;
  timestamp: number;
};

export default defineComponent({
  name: 'AllianceChat',
  setup() {
    const store = useStore();
    const messagesContainer = ref<HTMLElement | null>(null);
    const messages = ref<ChatMessage[]>([]);
    const newMessage = ref('');
    const connected = ref(false);
    const connecting = ref(false);
    const statusMessage = ref('Connecting to chat...');
    const statusType = ref<'info' | 'error'>('info');
    const onlineUsers = ref<{ username: string; isAdmin: boolean }[]>([]);
    const typingUsers = ref<string[]>([]);

    const RECONNECT_DELAY_MS = 5 * 1000;
    const REJECTED_CLOSE_CODES = new Set([4001, 4003]);
    // after the existing imports, inside setup()

    // ── Push notifications ────────────────────────────────────────────────────
    async function requestNotificationPermission() {
      if ('Notification' in window && Notification.permission === 'default') {
        await Notification.requestPermission()
      }
    }
    
    function notifyMention(fromUsername: string, text: string) {
      if (!('Notification' in window) || Notification.permission !== 'granted') return
      if (document.visibilityState === 'visible') return  // already looking at the tab
      const n = new Notification(`${fromUsername} mentioned you`, {
        body: text.slice(0, 100),
        icon: '/src/favicon.ico',
        tag: 'bar3-chat-mention',   // replaces previous instead of stacking
      })
      n.onclick = () => { window.focus(); n.close() }
    }
    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let lastCloseWasRejected = false;
    let registrationCheckInFlight: Promise<boolean> | null = null;
    let typingDebounceTimer: number | null = null;

    const isAuthenticated = computed(() => store.getters.isDiscordAuthed);
    const canSend = computed(() => connected.value && isAuthenticated.value);
    const connectionLabel = computed(() => {
      if (connected.value) return 'Connected';
      if (connecting.value) return 'Connecting';
      return 'Disconnected';
    });
    const connectionClass = computed(() => ({
      connected: connected.value,
      connecting: connecting.value,
      disconnected: !connected.value && !connecting.value,
    }));

    const formatTimestamp = (timestamp: number) => new Date(timestamp).toLocaleTimeString();

    const scrollToBottom = () => {
      if (!messagesContainer.value) return;
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
    };

    const setStatus = (message: string, type: 'info' | 'error' = 'info') => {
      statusMessage.value = message;
      statusType.value = type;
    };

    const clearReconnectTimer = () => {
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const scheduleReconnect = () => {
      clearReconnectTimer();
      if (!isAuthenticated.value || lastCloseWasRejected) return;
      reconnectTimer = window.setTimeout(() => {
        if (!ws || ws.readyState === WebSocket.CLOSED) {
          connectWebSocket();
        }
      }, RECONNECT_DELAY_MS);
    };

    const closeSocket = () => {
      clearReconnectTimer();
      if (ws) {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onclose = null;
        ws.onerror = null;
        ws.close();
        ws = null;
      }
      connected.value = false;
      connecting.value = false;
    };

    const verifyRegistration = async (): Promise<boolean> => {
      if (registrationCheckInFlight) return registrationCheckInFlight;
      registrationCheckInFlight = getChatRegistrationStatus()
        .then((status) => {
          if (!status.authenticated || !status.registered) {
            closeSocket();
            setStatus('Register or sign in with a registered Politics & War nation to use chat.', 'error');
            return false;
          }
          return true;
        })
        .catch(() => true)
        .finally(() => { registrationCheckInFlight = null; });
      return registrationCheckInFlight;
    };

    const sendTypingStop = () => {
      if (typingDebounceTimer !== null) {
        window.clearTimeout(typingDebounceTimer);
        typingDebounceTimer = null;
      }
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'typing_stop' }));
      }
    };

    const sendTypingStart = () => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      if (typingDebounceTimer !== null) window.clearTimeout(typingDebounceTimer);
      ws.send(JSON.stringify({ type: 'typing_start' }));
      typingDebounceTimer = window.setTimeout(() => {
        typingDebounceTimer = null;
      }, 400);
    };

    const handleWebSocketMessage = (event: MessageEvent) => {
      let data: ChatPayload & { users?: { username: string; isAdmin: boolean }[]; typing?: string[] };
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }

      if (data.type === 'history' && Array.isArray((data as any).messages)) {
        messages.value = (data as any).messages.map((message: ChatMessage) => ({
          ...message,
          isAdmin: message.isAdmin === true,
        }));
      } else if (data.type === 'message' || data.type === 'system') {
        if (typeof data.text !== 'string' || typeof data.timestamp !== 'number') return;
        messages.value.push({
          type: data.type,
          username: data.username,
          isAdmin: data.isAdmin === true,
          text: data.text,
          timestamp: data.timestamp,
        });
        // in handleWebSocketMessage, inside the `users_list` branch:
      } else if ((data as any).type === 'users_list') {
        onlineUsers.value = Array.isArray((data as any).users) ? (data as any).users : []
        // If we just connected and don't know our name yet, the server sends
        // users_list immediately after open — our name is the most-recently-joined.
        // A cleaner heuristic: match against discordUsername from the store.
        if (!myUsername.value && onlineUsers.value.length > 0) {
          const storeUsername = store.state?.discordUsername  // if available
          const match = storeUsername
            ? onlineUsers.value.find(u => u.username === storeUsername)
            : null
          if (match) myUsername.value = match.username
        }
        return
      } else if ((data as any).type === 'typing_update') {
        typingUsers.value = Array.isArray((data as any).typing) ? (data as any).typing : [];
        return;
      }

      void nextTick().then(scrollToBottom);
    };
    // We need the current user's username to highlight self-mentions.
    // It comes from the users_list — find ourselves by checking onlineUsers
    // against the session username stored in the chat server. Since the server
    // sets the username from the registered nation name we expose it via a
    // computed that picks the first user whose name matches what the server
    // echoed back in our own join message. A simpler approach: track it when
    // the websocket opens by reading the first system message that contains "joined".
    // For now we store it as a ref updated on connect.
    const myUsername = ref('')
    const connectWebSocket = () => {
      if (!isAuthenticated.value) {
        closeSocket();
        setStatus('Sign in as a registered alliance nation to use chat.', 'error');
        return;
      }
      if (ws || connecting.value || connected.value) return;

      clearReconnectTimer();
      connecting.value = true;
      setStatus('Checking chat registration...', 'info');

      void verifyRegistration().then((registered) => {
        if (!registered || ws || connected.value || !connecting.value) return;
        setStatus('Connecting to chat...', 'info');

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/api/chat/ws`;
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          lastCloseWasRejected = false;
          connected.value = true;
          connecting.value = false;
          setStatus('', 'info');
        };

        ws.onmessage = handleWebSocketMessage;

        ws.onclose = (event) => {
          if (REJECTED_CLOSE_CODES.has(event.code)) lastCloseWasRejected = true;
          ws = null;
          connected.value = false;
          connecting.value = false;
          onlineUsers.value = [];
          typingUsers.value = [];
          setStatus(
            lastCloseWasRejected
              ? 'Chat access was rejected. Register or sign in with a registered nation in the tracked alliance.'
              : 'Chat disconnected. Reconnecting in 5 seconds...',
            'error'
          );
          scheduleReconnect();
        };

        ws.onerror = () => {
          connected.value = false;
          connecting.value = false;
          setStatus('Unable to connect to chat right now.', 'error');
        };
      });
    };

    const sendMessage = () => {
      const text = newMessage.value.trim();
      if (!ws || !canSend.value || !text) return;
      ws.send(JSON.stringify({ text }));
      newMessage.value = '';
      sendTypingStop();
    };

    onMounted(() => { connectWebSocket(); requestNotificationPermission(); });

    onUnmounted(() => {
      if (typingDebounceTimer !== null) window.clearTimeout(typingDebounceTimer);
      closeSocket();
    });

    watch(isAuthenticated, (authenticated) => {
      if (authenticated) {
        connectWebSocket();
      } else {
        closeSocket();
        setStatus('Sign in as a registered alliance nation to use chat.', 'error');
      }
    });

    watch(messages, () => { void nextTick().then(scrollToBottom); });
    // ── Online panel ──────────────────────────────────────────────
    const showOnlineUsers = ref(false)
    
    // Close the panel when clicking anywhere outside it
    onMounted(() => {
      document.addEventListener('click', () => { showOnlineUsers.value = false })
    })
    
    // ── @mention autocomplete ─────────────────────────────────────
    const inputRef = ref<HTMLInputElement | null>(null)
    const mentionSuggestions = ref<{ username: string; isAdmin: boolean }[]>([])
    const mentionIndex = ref(0)
    let mentionStart = -1
    
    function onInputChange() {
      // fire the existing typing signal too
      sendTypingStart()
    
      const val = newMessage.value
      const cursor = inputRef.value?.selectionStart ?? val.length
      const slice = val.slice(0, cursor)
      const atPos = slice.lastIndexOf('@')
    
      if (atPos !== -1 && (atPos === 0 || /\s/.test(val[atPos - 1]))) {
        const query = slice.slice(atPos + 1).toLowerCase()
        if (!query.includes(' ')) {
          mentionStart = atPos
          mentionSuggestions.value = onlineUsers.value.filter(u =>
            u.username.toLowerCase().startsWith(query)
          )
          mentionIndex.value = 0
          return
        }
      }
    
      mentionSuggestions.value = []
      mentionStart = -1
    }
    
    function onInputKeydown(e: KeyboardEvent) {
      if (!mentionSuggestions.value.length) return
    
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        mentionIndex.value = (mentionIndex.value + 1) % mentionSuggestions.value.length
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        mentionIndex.value = (mentionIndex.value - 1 + mentionSuggestions.value.length) % mentionSuggestions.value.length
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        insertMention(mentionSuggestions.value[mentionIndex.value].username)
      } else if (e.key === 'Escape') {
        mentionSuggestions.value = []
      }
    }
    
    function insertMention(username: string) {
      const val = newMessage.value
      const cursor = inputRef.value?.selectionStart ?? val.length
      newMessage.value = val.slice(0, mentionStart) + `@${username} ` + val.slice(cursor)
      mentionSuggestions.value = []
      mentionStart = -1
      nextTick(() => inputRef.value?.focus())
    }
    
    // ── Mention rendering ─────────────────────────────────────────
  
    
    // Capture our username from the first system "joined" message we receive.
    // Patch handleWebSocketMessage: after pushing the system message, check:
    //   if (data.text?.endsWith(' joined') && !myUsername.value) {
    //     // The last join before anyone else is us (optimistic — good enough)
    //   }
    // A cleaner hook: set it when ws.onopen fires and we already know the name
    // from the access resolution. Since we can't easily get it from the client,
    // we just look it up from the users_list after connection.
    watch(connected, (val) => {
      if (val && onlineUsers.value.length === 1) {
        myUsername.value = onlineUsers.value[0].username
      }
    })
    
    function renderText(text: string): string {
      // 1. Escape HTML to prevent injection
      const escaped = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
      // 2. Highlight @mentions
      return escaped.replace(/@(\w+)/g, (_, name: string) => {
        const isSelf = myUsername.value && name.toLowerCase() === myUsername.value.toLowerCase()
        return `<span class="mention${isSelf ? ' mention--self' : ''}">@${name}</span>`
      })
    }
    return {
      messages,
      newMessage,
      canSend,
      connected,
      connectionLabel,
      connectionClass,
      statusMessage,
      statusType,
      onlineUsers,
      typingUsers,
      formatTimestamp,
      sendMessage,
      sendTypingStart,
      sendTypingStop,
      messagesContainer,
      showOnlineUsers,
      inputRef,
      mentionSuggestions,
      mentionIndex,
      onInputChange,
      onInputKeydown,
      insertMention,
      renderText,
      }
    };
  },
});
</script>

<style scoped>
.chat-page {
  min-height: calc(100vh - 64px);
  padding: 24px;
  background: #202020;
}

.chat-container {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 112px);
  min-height: 520px;
  max-width: 1100px;
  margin: 0 auto;
  background-color: #2d2d2d;
  border: 1px solid rgba(255, 107, 0, 0.24);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.28);
}

.chat-header {
  padding: 18px 20px;
  border-bottom: 1px solid #444;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  background-color: #1a1a1a;
  color: white;
}

.chat-header h2 {
  margin: 0;
  font-size: 1.35rem;
}

.chat-subtitle {
  margin: 4px 0 0;
  color: #bdbdbd;
  font-size: 0.92rem;
}

.connection-pill {
  flex-shrink: 0;
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.connection-pill.connected {
  background: rgba(46, 204, 113, 0.18);
  color: #6ee7a2;
}

.connection-pill.connecting {
  background: rgba(255, 193, 7, 0.18);
  color: #ffd166;
}

.connection-pill.disconnected {
  background: rgba(231, 76, 60, 0.18);
  color: #ff8a80;
}

.chat-status {
  padding: 10px 20px;
  border-bottom: 1px solid #444;
  font-size: 0.92rem;
}

.chat-status.info {
  color: #e0e0e0;
  background: rgba(255, 255, 255, 0.05);
}

.chat-status.error {
  color: #ffd0cb;
  background: rgba(231, 76, 60, 0.14);
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.empty-state {
  margin: auto;
  color: #aaa;
  text-align: center;
}

.message {
  max-width: 72%;
  padding: 12px 16px;
  border-radius: 18px;
  line-height: 1.4;
  word-wrap: break-word;
  color: #fff;
  background: #3a3a3a;
}

.message.message {
  align-self: flex-start;
}

.message-header {
  display: flex;
  gap: 12px;
  justify-content: space-between;
  margin-bottom: 4px;
  font-size: 0.85em;
  opacity: 0.9;
}

.username {
  font-weight: bold;
  color: #ff9b4a;
}

.username--admin {
  color: #3fb950;   /* green, matches the badge-green color used in admin panel */
}

  
.timestamp {
  font-size: 0.75em;
  opacity: 0.7;
}

.message-content {
  white-space: pre-wrap;
}

.message.system {
  background-color: #1f1f1f;
  color: #cfcfcf;
  text-align: center;
  max-width: 90%;
  margin: 0 auto;
  padding: 8px 16px;
}

.chat-input-container {
  display: flex;
  gap: 10px;
  padding: 16px;
  border-top: 1px solid #444;
  background-color: #1a1a1a;
}

.message-input {
  flex: 1;
  min-width: 0;
  padding: 13px 16px;
  border-radius: 24px;
  border: 1px solid #4b4b4b;
  background-color: #333;
  color: white;
  font-size: 1rem;
}

.message-input:focus {
  outline: none;
  border-color: #ff6b00;
  box-shadow: 0 0 0 2px rgba(255, 107, 0, 0.22);
}

.message-input:disabled {
  opacity: 0.65;
}

.send-button {
  padding: 0 24px;
  border-radius: 24px;
  border: none;
  background-color: #ff6b00;
  color: white;
  font-weight: bold;
  cursor: pointer;
  transition: background-color 0.2s, opacity 0.2s;
}

.send-button:hover:not(:disabled) {
  background-color: #ff8c33;
}

.send-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
/* ── Online panel ─────────────────────────── */
.online-panel-wrapper {
  position: relative;
}

.online-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.1);
  background: transparent;
  color: #ccc;
  font-size: 0.8rem;
  cursor: pointer;
  transition: background 0.15s;
}
.online-pill:hover,
.online-pill--active { background: rgba(255,255,255,0.08); }

.online-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #4caf50;
  display: inline-block;
  flex-shrink: 0;
}
.online-dot--sm { width: 6px; height: 6px; }

.online-panel {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  min-width: 180px;
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 10px;
  padding: 6px 0;
  list-style: none;
  margin: 0;
  z-index: 100;
  box-shadow: 0 8px 24px rgba(0,0,0,0.5);
}

.online-panel__user {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 14px;
  font-size: 0.85rem;
  color: #ccc;
}
.online-panel__user--admin { color: #3fb950; }

.online-panel__admin-badge {
  margin-left: auto;
  font-size: 0.65rem;
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(63,185,80,0.15);
  color: #3fb950;
  border: 1px solid rgba(63,185,80,0.3);
}

.online-panel__empty {
  padding: 8px 14px;
  font-size: 0.8rem;
  color: #666;
}

/* ── Mention autocomplete ─────────────────── */
.input-wrapper {
  flex: 1;
  position: relative;
  min-width: 0;
}

.input-wrapper .message-input {
  width: 100%;
}

.mention-menu {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
  min-width: 200px;
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 10px;
  padding: 6px 0;
  list-style: none;
  margin: 0;
  z-index: 100;
  box-shadow: 0 8px 24px rgba(0,0,0,0.5);
}

.mention-menu__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 14px;
  cursor: pointer;
  font-size: 0.85rem;
  color: #ccc;
  transition: background 0.1s;
}
.mention-menu__item--active,
.mention-menu__item:hover {
  background: rgba(255,255,255,0.07);
  color: #fff;
}

/* ── @mention highlights in messages ─────── */
.mention {
  background: rgba(88,166,255,0.15);
  color: #58a6ff;
  border-radius: 3px;
  padding: 0 3px;
  font-weight: 500;
}
.mention--self {
  background: rgba(255,107,0,0.18);
  color: #ff9b4a;
}

/* ── Shared panel transition ──────────────── */
.panel-enter-active,
.panel-leave-active { transition: opacity 0.15s, transform 0.15s; }
.panel-enter-from,
.panel-leave-to { opacity: 0; transform: translateY(-4px); }

@media (max-width: 768px) {
  .chat-page {
    min-height: calc(100vh - 56px);
    padding: 12px;
  }

  .chat-container {
    height: calc(100vh - 80px);
    min-height: 420px;
  }

  .chat-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .message {
    max-width: 92%;
  }

  .chat-input-container {
    flex-direction: column;
  }

  .send-button {
    min-height: 44px;
    width: 100%;
  }
}
</style>
