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

    async function requestNotificationPermission() {
      if ('Notification' in window && Notification.permission === 'default') {
        await Notification.requestPermission();
      }
    }

    function notifyMention(fromUsername: string, text: string) {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      if (document.visibilityState === 'visible') return;
      const n = new Notification(`${fromUsername} mentioned you`, {
        body: text.slice(0, 100),
        icon: '/src/favicon.ico',
        tag: 'bar3-chat-mention',
      });
      n.onclick = () => { window.focus(); n.close(); };
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

    const myUsername = ref('');

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
          text: message.text ?? '',
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
        if (
          data.type === 'message' &&
          myUsername.value &&
          typeof data.text === 'string' &&
          data.text.toLowerCase().includes(`@${myUsername.value.toLowerCase()}`)
        ) {
          notifyMention(data.username || 'Someone', data.text);
        }
      } else if ((data as any).type === 'users_list') {
        onlineUsers.value = Array.isArray((data as any).users) ? (data as any).users : [];
        if (!myUsername.value && onlineUsers.value.length > 0) {
          const storeUsername = (store.state as any)?.discordUsername as string | undefined;
          const match = storeUsername
            ? (onlineUsers.value.find(u => u.username === storeUsername) ?? null)
            : null;
          if (match) myUsername.value = match.username;
        }
        return;
      } else if ((data as any).type === 'typing_update') {
        typingUsers.value = Array.isArray((data as any).typing) ? (data as any).typing : [];
        return;
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

    const showOnlineUsers = ref(false);

    onMounted(() => {
      document.addEventListener('click', () => { showOnlineUsers.value = false; });
    });

    const inputRef = ref<HTMLInputElement | null>(null);
    const mentionSuggestions = ref<{ username: string; isAdmin: boolean }[]>([]);
    const mentionIndex = ref(0);
    let mentionStart = -1;

    function onInputChange() {
      sendTypingStart();

      const val = newMessage.value;
      const cursor = inputRef.value?.selectionStart ?? val.length;
      const slice = val.slice(0, cursor);
      const atPos = slice.lastIndexOf('@');

      if (atPos !== -1 && (atPos === 0 || /\s/.test(val[atPos - 1]))) {
        const query = slice.slice(atPos + 1).toLowerCase();
        if (!query.includes(' ')) {
          mentionStart = atPos;
          mentionSuggestions.value = onlineUsers.value.filter(u =>
            u.username.toLowerCase().startsWith(query)
          );
          mentionIndex.value = 0;
          return;
        }
      }

      mentionSuggestions.value = [];
      mentionStart = -1;
    }

    function onInputKeydown(e: KeyboardEvent) {
      if (!mentionSuggestions.value.length) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        mentionIndex.value = (mentionIndex.value + 1) % mentionSuggestions.value.length;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        mentionIndex.value = (mentionIndex.value - 1 + mentionSuggestions.value.length) % mentionSuggestions.value.length;
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(mentionSuggestions.value[mentionIndex.value].username);
      } else if (e.key === 'Escape') {
        mentionSuggestions.value = [];
      }
    }

    function insertMention(username: string) {
      const val = newMessage.value;
      const cursor = inputRef.value?.selectionStart ?? val.length;
      newMessage.value = val.slice(0, mentionStart) + `@${username} ` + val.slice(cursor);
      mentionSuggestions.value = [];
      mentionStart = -1;
      nextTick(() => inputRef.value?.focus());
    }

    watch(connected, (val) => {
      if (val && onlineUsers.value.length === 1) {
        myUsername.value = onlineUsers.value[0].username;
      }
    });

    function renderText(text: string): string {
      if (!text) return '';
      const escaped = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      return escaped.replace(/@(\w+)/g, (_, name: string) => {
        const isSelf = myUsername.value && name.toLowerCase() === myUsername.value.toLowerCase();
        return `<span class="mention${isSelf ? ' mention--self' : ''}">@${name}</span>`;
      });
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
    };
  },
});
