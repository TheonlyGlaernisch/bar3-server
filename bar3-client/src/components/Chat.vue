<template>
  <div class="chat-page">
    <section class="chat-container">
      <div class="chat-header">
        <div>
          <h2>Alliance Chat</h2>
          <p class="chat-subtitle">provided by TRF or something</p>
        </div>
        <div class="connection-pill" :class="connectionClass">
          {{ connectionLabel }}
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
            <span class="username">{{ message.username }}</span>
            <span class="timestamp">{{ formatTimestamp(message.timestamp) }}</span>
          </div>
          <div class="message-content" :class="{ system: message.type === 'system' }">
            {{ message.text }}
          </div>
        </div>
      </div>

      <form class="chat-input-container" @submit.prevent="sendMessage">
        <label class="sr-only" for="chat-message-input">Chat message</label>
        <input
          id="chat-message-input"
          v-model="newMessage"
          placeholder="Type your message..."
          :disabled="!canSend"
          maxlength="500"
          class="message-input"
          autocomplete="off"
        />
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
  messages?: ChatMessage[];
};

type ChatMessage = {
  type: 'message' | 'system';
  username?: string;
  isAdmin?: boolean;   // ADD THIS
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

    const RECONNECT_DELAY_MS = 5 * 1000;
    const REJECTED_CLOSE_CODES = new Set([4001, 4003]);

    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let lastCloseWasRejected = false;
    let registrationCheckInFlight: Promise<boolean> | null = null;

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
        .finally(() => {
          registrationCheckInFlight = null;
        });

      return registrationCheckInFlight;
    };

    const handleWebSocketMessage = (event: MessageEvent) => {
      let data: ChatPayload;
      try {
        data = JSON.parse(event.data) as ChatPayload;
      } catch {
        return;
      }

      if (data.type === 'history' && Array.isArray(data.messages)) {
        messages.value = data.messages;
      } else if (data.type === 'message' || data.type === 'system') {
        if (typeof data.text !== 'string' || typeof data.timestamp !== 'number') return;
        messages.value.push({
          type: data.type,
          username: data.username,
          isAdmin: data.isAdmin,   // ADD THIS
          text: data.text,
          timestamp: data.timestamp,
        });
      }

      void nextTick().then(scrollToBottom);
    };

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
          if (REJECTED_CLOSE_CODES.has(event.code)) {
            lastCloseWasRejected = true;
          }

          ws = null;
          connected.value = false;
          connecting.value = false;
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
    };

    onMounted(() => {
      connectWebSocket();
    });

    onUnmounted(() => {
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

    watch(messages, () => {
      void nextTick().then(scrollToBottom);
    });

    return {
      messages,
      newMessage,
      canSend,
      connected,
      connectionLabel,
      connectionClass,
      statusMessage,
      statusType,
      formatTimestamp,
      sendMessage,
      messagesContainer,
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
