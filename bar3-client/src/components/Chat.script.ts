import { computed, defineComponent, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useStore } from 'vuex';
import { chatService } from '@/utilities/chatService';

// ── Emoji data ────────────────────────────────────────────────────────────────
const EMOJI_CATEGORIES: { label: string; icon: string; emojis: string[] }[] = [
  {
    label: 'Smileys',
    icon: '😀',
    emojis: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🫢','🫣','🤫','🤔','🫡','🤐','🤨','😐','😑','😶','🫥','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸','😎','🤓','🧐'],
  },
  {
    label: 'Gestures',
    icon: '👋',
    emojis: ['👋','🤚','🖐','✋','🖖','🫱','🫲','🫳','🫴','👌','🤌','🤏','✌️','🤞','🫰','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','🫵','👍','👎','✊','👊','🤛','🤜','👏','🙌','🫶','👐','🤲','🤝','🙏','✍️','💪','🦵','🦶','👂','🦻','👃','🫀','🫁','🧠','🦷','🦴','👀','👁','👅','👄','🫦'],
  },
  {
    label: 'Animals',
    icon: '🐶',
    emojis: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐔','🐧','🐦','🐤','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🪱','🐛','🦋','🐌','🐞','🐜','🪲','🦟','🦗','🪳','🕷','🦂','🐢','🐍','🦎','🦖','🦕','🐙','🦑','🦐','🦞','🦀','🐡','🐠','🐟','🐬','🐳','🐋','🦈','🐊','🐅','🐆','🦓','🦍','🦧','🦣','🐘','🦛','🦏','🐪','🐫','🦒','🦘','🦬','🐃','🐂','🐄','🐎','🐖','🐏','🐑','🦙','🐐'],
  },
  {
    label: 'Food',
    icon: '🍕',
    emojis: ['🍕','🍔','🌭','🌮','🌯','🥙','🧆','🥚','🍳','🥘','🍲','🫕','🥣','🥗','🍿','🧈','🧂','🥫','🍱','🍘','🍙','🍚','🍛','🍜','🍝','🍠','🍢','🍣','🍤','🍥','🥮','🍡','🥟','🥠','🥡','🦪','🍦','🍧','🍨','🍩','🍪','🎂','🍰','🧁','🥧','🍫','🍬','🍭','🍮','🍯','🍼','🥛','☕','🫖','🍵','🧃','🥤','🧋','🍶','🍺','🍻','🥂','🍷','🫗','🥃','🍸','🍹','🧉','🍾'],
  },
  {
    label: 'Objects',
    icon: '💎',
    emojis: ['💎','⚔️','🛡','🔧','🔨','⚙️','🔑','🗝','🔒','🔓','🔔','🔕','📢','📣','📯','🔊','🔉','🔈','🔇','📻','📺','📷','📸','📹','🎥','📽','🎞','📞','☎️','📟','📠','🔋','🪫','🔌','💡','🔦','🕯','🪔','🧯','🛢','💰','💴','💵','💶','💷','💸','💳','🪙','💹','✉️','📧','📨','📩','📤','📥','📦','📫','📪','📬','📭','📮','🗳','✏️','✒️','🖋','🖊','📝','📁','📂','🗂','📅','📆','🗒','🗓','📇','📈','📉','📊','📋','📌','📍','✂️','🗃','🗄','🗑'],
  },
  {
    label: 'Symbols',
    icon: '❤️',
    emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','❤️‍🩹','❣️','💕','💞','💓','💗','💖','💘','💝','💟','☮️','✝️','☪️','🕉','☸️','✡️','🔯','🕎','☯️','☦️','🛐','⛎','♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓','🆔','⚛️','🉑','☢️','☣️','📴','📳','🈶','🈚','🈸','🈺','🈷️','✴️','🆚','💮','🉐','㊙️','㊗️','🈴','🈵','🈹','🈲','🅰️','🅱️','🆎','🆑','🅾️','🆘','❌','⭕','🛑','⛔','📛','🚫','💯','💢','♨️','🚷','🚯','🚳','🚱','🔞','📵','🚭','❗','❕','❓','❔','‼️','⁉️','🔅','🔆','〽️','⚠️','🚸','🔱','⚜️','🔰','♻️','✅','🈯','💹','❎','🌐','💠','Ⓜ️','🌀','💤','🏧','🚾','♿','🅿️','🛗','🈳','🈹','🚺','🚹','🚼','⚧','🚻','🚮','🎦','📶','🈁','🔣','ℹ️','🔤','🔡','🔠','🆖','🆗','🆙','🆒','🆕','🆓','0️⃣','1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟','🔢','#️⃣','*️⃣','⏏️','▶️','⏸','⏹','⏺','⏭','⏮','⏩','⏪','⏫','⏬','◀️','🔼','🔽','➡️','⬅️','⬆️','⬇️','↗️','↘️','↙️','↖️','↕️','↔️','↪️','↩️','⤴️','⤵️','🔀','🔁','🔂','🔃','🎵','🎶','➕','➖','➗','✖️','🟰','♾️','💲','❗','🔘','🔲','🔳','🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪','🟤','🔺','🔻','🔸','🔹','🔶','🔷','🔳','🔲','▪️','▫️','◾','◽','◼️','◻️','🟥','🟧','🟨','🟩','🟦','🟪','⬛','⬜','🟫'],
  },
];

// Quick-reaction emoji bar shown on hover
const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '👏', '🎉'];

// ── Types ─────────────────────────────────────────────────────────────────────
interface Reaction {
  emoji: string;
  count: number;
  myReaction: boolean;
}

// Map of message key → emoji → Reaction
type ReactionsMap = Map<string, Map<string, Reaction>>;

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

    // ── Reactions ─────────────────────────────────────────────────────────────
    const reactions = computed(() => store.getters['chat/reactions']);
    const hoveredMessageKey = ref<string | null>(null);
    let hoverLeaveTimer: ReturnType<typeof setTimeout> | null = null;

    function messageKey(msg: any, idx: number): string {
      return `${msg.timestamp}-${msg.username || msg.type}-${idx}`;
    }

    
    function getReactions(key: string) {
      const map = reactions.value[key];
      if (!map) return [];
      return Object.values(map).filter((r: any) => r.count > 0);
    }

    function toggleReaction(key: string, emoji: string) {
  // Optimistic local update
      store.commit('chat/toggleReactionOptimistic', { messageKey: key, emoji });
  // Send to server
      chatService.sendReaction(key, emoji);
     }

    function onMessageMouseEnter(key: string) {
      if (hoverLeaveTimer) {
        clearTimeout(hoverLeaveTimer);
        hoverLeaveTimer = null;
      }
      hoveredMessageKey.value = key;
    }

    function onMessageMouseLeave() {
      hoverLeaveTimer = setTimeout(() => {
        hoveredMessageKey.value = null;
      }, 300);
    }

    function onReactionBarMouseEnter() {
      if (hoverLeaveTimer) {
        clearTimeout(hoverLeaveTimer);
        hoverLeaveTimer = null;
      }
    }

    // ── Emoji picker ──────────────────────────────────────────────────────────
    const showEmojiPicker = ref(false);
    const emojiSearchQuery = ref('');
    const activeCategoryIndex = ref(0);

    const filteredEmojis = computed(() => {
      const q = emojiSearchQuery.value.trim().toLowerCase();
      if (!q) return EMOJI_CATEGORIES[activeCategoryIndex.value]?.emojis ?? [];
      const all = EMOJI_CATEGORIES.flatMap((c) => c.emojis);
      // Very basic: return emojis whose category label or position matches query
      // In practice you'd need an emoji name db; we just return all on search
      return all.slice(0, 120);
    });

    function insertEmoji(emoji: string) {
      const el = inputRef.value;
      if (!el) {
        newMessage.value += emoji;
        return;
      }
      const start = el.selectionStart ?? newMessage.value.length;
      const end = el.selectionEnd ?? newMessage.value.length;
      newMessage.value =
        newMessage.value.slice(0, start) + emoji + newMessage.value.slice(end);
      nextTick(() => {
        el.focus();
        const pos = start + [...emoji].length;
        el.setSelectionRange(pos, pos);
      });
    }

    function toggleEmojiPicker() {
      showEmojiPicker.value = !showEmojiPicker.value;
      if (showEmojiPicker.value) emojiSearchQuery.value = '';
    }

    function closeEmojiPicker() {
      showEmojiPicker.value = false;
    }

    // ── Scroll ────────────────────────────────────────────────────────────────
    const SCROLL_THRESHOLD = 200;

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

    watch(mentionToasts, (toasts, prev) => {
      const prevIds = new Set((prev ?? []).map((t: any) => t.id));
      for (const toast of toasts) {
        if (!prevIds.has(toast.id)) {
          window.setTimeout(() => dismissToast(toast.id), 5000);
        }
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
      if (showEmojiPicker.value && e.key === 'Escape') {
        closeEmojiPicker();
        return;
      }
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
    const handleDocumentClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.emoji-picker-container') && !target.closest('.emoji-picker-btn')) {
        closeEmojiPicker();
      }
      showOnlineUsers.value = false;
    };

    onMounted(() => {
      void nextTick().then(scrollToBottom);
      requestNotificationPermission();
      document.addEventListener('click', handleDocumentClick);
    });

    onUnmounted(() => {
      chatService.sendTypingStop();
      document.removeEventListener('click', handleDocumentClick);
      if (hoverLeaveTimer) clearTimeout(hoverLeaveTimer);
    });

    return {
      // chat state
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
      // reactions
      reactions,
      hoveredMessageKey,
      messageKey,
      getReactions,
      toggleReaction,
      onMessageMouseEnter,
      onMessageMouseLeave,
      onReactionBarMouseEnter,
      QUICK_REACTIONS,
      // emoji picker
      showEmojiPicker,
      emojiSearchQuery,
      activeCategoryIndex,
      filteredEmojis,
      EMOJI_CATEGORIES,
      insertEmoji,
      toggleEmojiPicker,
      closeEmojiPicker,
      // helpers
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
