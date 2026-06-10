import { ChatMessage } from '@/utilities/chatService';

export type MentionToast = {
  id: number;
  from: string;
  text: string;
};

export type Reaction = {
  emoji: string;
  count: number;
  myReaction: boolean;
};

export type ReactionsMap = Record<string, Record<string, Reaction>>;

interface ChatState {
  messages: ChatMessage[];
  connected: boolean;
  connecting: boolean;
  statusMessage: string;
  statusType: 'info' | 'error';
  onlineUsers: { username: string; isAdmin: boolean }[];
  /** Admins who have ever connected — includes currently-offline admins. */
  knownAdmins: string[];
  typingUsers: string[];
  myUsername: string;
  mentionToasts: MentionToast[];
  reactions: ReactionsMap;
}

export default {
  namespaced: true,

  state: (): ChatState => ({
    messages: [],
    connected: false,
    connecting: false,
    statusMessage: '',
    statusType: 'info',
    onlineUsers: [],
    knownAdmins: [],
    typingUsers: [],
    myUsername: '',
    mentionToasts: [],
    reactions: {},
  }),

  getters: {
    messages: (state: ChatState) => state.messages,
    connected: (state: ChatState) => state.connected,
    connecting: (state: ChatState) => state.connecting,
    connectionLabel: (state: ChatState) => {
      if (state.connected) return 'Connected';
      if (state.connecting) return 'Connecting';
      return 'Disconnected';
    },
    connectionClass: (state: ChatState) => ({
      connected: state.connected,
      connecting: state.connecting,
      disconnected: !state.connected && !state.connecting,
    }),
    statusMessage: (state: ChatState) => state.statusMessage,
    statusType: (state: ChatState) => state.statusType,
    onlineUsers: (state: ChatState) => state.onlineUsers,
    /** All known admins including offline ones, for @mention autocomplete. */
    knownAdmins: (state: ChatState) => state.knownAdmins,
    typingUsers: (state: ChatState) => state.typingUsers,
    myUsername: (state: ChatState) => state.myUsername,
    mentionToasts: (state: ChatState) => state.mentionToasts,
    reactions: (state: ChatState) => state.reactions,
  },

  mutations: {
    setMessages(state: ChatState, messages: ChatMessage[]) {
      state.messages = messages;
    },
    pushMessage(state: ChatState, message: ChatMessage) {
      state.messages.push(message);
    },
    setConnected(state: ChatState, value: boolean) {
      state.connected = value;
    },
    setConnecting(state: ChatState, value: boolean) {
      state.connecting = value;
    },
    setStatusMessage(state: ChatState, value: string) {
      state.statusMessage = value;
    },
    setStatusType(state: ChatState, value: 'info' | 'error') {
      state.statusType = value;
    },
    setOnlineUsers(state: ChatState, users: { username: string; isAdmin: boolean }[]) {
      state.onlineUsers = users;
    },
    setKnownAdmins(state: ChatState, admins: string[]) {
      state.knownAdmins = Array.isArray(admins) ? admins : [];
    },
    setTypingUsers(state: ChatState, users: string[]) {
      state.typingUsers = users;
    },
    setMyUsername(state: ChatState, username: string) {
      state.myUsername = username;
    },
    pushMentionToast(state: ChatState, toast: MentionToast) {
      state.mentionToasts.push(toast);
    },
    dismissMentionToast(state: ChatState, id: number) {
      state.mentionToasts = state.mentionToasts.filter((t) => t.id !== id);
    },

    applyReactionDelta(
      state: ChatState,
      payload: { messageKey: string; emoji: string; username: string; delta: 1 | -1 }
    ) {
      const { messageKey, emoji, username, delta } = payload;
      const myUsername = state.myUsername;

      const msgReactions = { ...(state.reactions[messageKey] ?? {}) };
      const existing: Reaction = msgReactions[emoji]
        ? { ...msgReactions[emoji] }
        : { emoji, count: 0, myReaction: false };

      existing.count = Math.max(0, existing.count + delta);

      if (username === myUsername) {
        existing.myReaction = delta === 1;
      }

      if (existing.count === 0) {
        delete msgReactions[emoji];
      } else {
        msgReactions[emoji] = existing;
      }

      state.reactions = { ...state.reactions, [messageKey]: msgReactions };
    },

    setReactionsSnapshot(
      state: ChatState,
      snapshot: Record<string, Record<string, string[]>>
    ) {
      const myUsername = state.myUsername;
      const next: ReactionsMap = {};
      for (const [msgKey, emojiMap] of Object.entries(snapshot)) {
        next[msgKey] = {};
        for (const [emoji, users] of Object.entries(emojiMap)) {
          if (!Array.isArray(users) || users.length === 0) continue;
          next[msgKey][emoji] = {
            emoji,
            count: users.length,
            myReaction: users.includes(myUsername),
          };
        }
      }
      state.reactions = next;
    },

    toggleReactionOptimistic(
      state: ChatState,
      payload: { messageKey: string; emoji: string }
    ) {
      const { messageKey, emoji } = payload;
      const msgReactions = { ...(state.reactions[messageKey] ?? {}) };
      const existing: Reaction = msgReactions[emoji]
        ? { ...msgReactions[emoji] }
        : { emoji, count: 0, myReaction: false };

      if (existing.myReaction) {
        existing.count = Math.max(0, existing.count - 1);
        existing.myReaction = false;
      } else {
        existing.count += 1;
        existing.myReaction = true;
      }

      if (existing.count === 0) {
        delete msgReactions[emoji];
      } else {
        msgReactions[emoji] = existing;
      }

      state.reactions = { ...state.reactions, [messageKey]: msgReactions };
    },

    clearReactions(state: ChatState) {
      state.reactions = {};
    },
  },
};
