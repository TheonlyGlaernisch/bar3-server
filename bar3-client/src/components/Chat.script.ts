import { computed, defineComponent, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useStore } from 'vuex';
import { chatService } from '@/utilities/chatService';

export default defineComponent({
  name: 'AllianceChat',
  setup() {
    const store = useStore();
    const messagesContainer = ref<HTMLElement | null>(null);
    const newMessage = ref('');
    const notificationPermission = ref<NotificationPermission>('default');
    const showOnlineUsers = ref(false);
    const inputRef = ref<HTMLInputElement | null>(null);
    const mentionIndex = ref(0);
    const mentionSuggestions = ref<{ username: string; isAdmin: boolean }[]>([]);
    const showScrollButton = ref(false);
    let mentionStart = -1;

    // How many px from the bottom before the button appears
    const SCROLL_THRESHOLD = 200;

    // ── Read all reactive state from store ────────────────────────────────────
    const messages = computed(() => store.getters['chat/messages']);
    const connected = computed(() => store.getters['chat/connected']);
    const connecting = computed(() => store.getters['chat/connecting']);
    const connectionLabel = computed(() => store.getters['chat/connectionLabel']);
    const connectionClass = computed(() => store.getters['chat/connectionClass']);
    const statusMessage = computed(() => store.getters['chat/statusMessage']);
    const statusType = computed(() => store.getters['chat/statusType']);
    const onlineUsers = computed(() => store.getters['chat/onlineUsers'] ?? []);
    const typingUsers = computed(() => store.getters['chat/typingUsers'] ?? []);
    const myUsername = computed(() => store.getters['chat/myUsername'] ?? '');
    const mentionToasts = computed(() => store.getters['chat/mentionToasts'] ?? []);

    const canSend = computed(() => connected.value && store.getters.isDiscordAuthed);

    // ── Scroll helpers ────────────────────────────────────────────────────────
    const isNearBottom = (): boolean => {
      const el = messagesContainer.value;
      if (!el) return true;
      return el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_THRESHOLD;
    };

    const scrollToBottom = () => {
      const el = messagesContainer.value;
      if (!el) return;
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      showScrollButton.value = false;
    };

    const onScroll = () => {
      showScrollButton.value = !isNearBottom();
    };

    // When new messages arrive, auto-scroll only if already near bottom;
    // otherwise show the button so the user knows there's something new.
    watch(messages, () => {
      void nextTick().then(() => {
        if (isNearBottom()) {
          scrollToBottom();
        } else {
          showScrollButton.value = true;
        }
      });
    });

    // ── Mention toasts ────────────────────────────────────────────────────────
    const dismissToast = (id: number) => {
      store.commit('chat/dismissMentionToast', id);
    };

    watch(mentionToasts, (toasts) => {
      for (const toast of toasts) {
        window.setTimeout(() => dismissToast(toast.id), 5000);
      }
    });

    // ── Notifications ─────────────────────────────────────────────────────────
    const requestNotificationPermission = async () => {
      if (!('Notification' in window)) return;
      if (Notification.permission === 'default') {
        const result = await Notification.requestPermission();
        notificationPermission.value = result;
      } else {
        notificationPermission.value = Notification.permission;
      }
    };

    // ── Send ──────────────────────────────────────────────────────────────────
    const sendMessage = () => {
      const text = newMessage.value.trim();
      if (!text || !canSend.value) return;
      chatService.send(text);
      newMessage.value = '';
      void nextTick().then(scrollToBottom);
    };

    // ── Typing indicators ─────────────────────────────────────────────────────
    const sendTypingStart = () => chatService.sendTypingStart();
    const sendTypingStop = () => chatService.sendTypingStop();

    // ── Mention autocomplete ──────────────────────────────────────────────────
    const onInputChange = () => {
      sendTypingStart();
      const val = newMessage.value;
      const cursor = inputRef.value?.selectionStart ?? val.length;
      const slice = val.slice(0, cursor);
      const atPos = slice.lastIndexOf('@');

      if (atPos !== -1 && (atPos === 0 || /\s/.test(val[atPos - 1]))) {
        const query = slice.slice(atPos + 1).toLowerCase();
        if (!query.includes(' ')) {
          mentionStart = atPos;
          mentionSuggestions.value = (onlineUsers.value ?? []).filter((u: { username: string }) =>
            u.username.toLowerCase().startsWith(query)
          );
          mentionIndex.value = 0;
          return;
        }
      }

      mentionSuggestions.value = [];
      mentionStart = -1;
    };

    const onInputKeydown = (e: KeyboardEvent) => {
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
    };

    const insertMention = (username: string) => {
      const val = newMessage.value;
      const cursor = inputRef.value?.selectionStart ?? val.length;
      newMessage.value = val.slice(0, mentionStart) + `@${username} ` + val.slice(cursor);
      mentionSuggestions.value = [];
      mentionStart = -1;
      nextTick(() => inputRef.value?.focus());
    };

    // ── Text rendering ────────────────────────────────────────────────────────
    const renderText = (text: string): string => {
      if (!text) return '';
      const escaped = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      return escaped.replace(/@(\w+)/g, (_, name: string) => {
        const isSelf = myUsername.value && name.toLowerCase() === myUsername.value.toLowerCase();
        return `<span class="mention${isSelf ? ' mention--self' : ''}">@${name}</span>`;
      });
    };

    const formatTimestamp = (timestamp: number) => new Date(timestamp).toLocaleTimeString();

    // ── Lifecycle ─────────────────────────────────────────────────────────────
    onMounted(() => {
      void nextTick().then(scrollToBottom);
      requestNotificationPermission();
      document.addEventListener('click', () => { showOnlineUsers.value = false; });
    });

    onUnmounted(() => {
      chatService.sendTypingStop();
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
      onlineUsers,
      typingUsers,
      mentionToasts,
      notificationPermission,
      myUsername,
      showScrollButton,
      formatTimestamp,
      sendMessage,
      sendTypingStart,
      sendTypingStop,
      scrollToBottom,
      onScroll,
      messagesContainer,
      showOnlineUsers,
      inputRef,
      mentionSuggestions,
      mentionIndex,
      onInputChange,
      onInputKeydown,
      insertMention,
      renderText,
      dismissToast,
      requestNotificationPermission,
    };
  },
});
