import { ChatMessage } from '@/utilities/chatService';

export type MentionToast = {
  id: number;
  from: string;
  text: string;
};

interface ChatState {
  messages: ChatMessage[];
  connected: boolean;
  connecting: boolean;
  statusMessage: string;
  statusType: 'info' | 'error';
  onlineUsers: { username: string; isAdmin: boolean }[];
  typingUsers: string[];
  myUsername: string;
  mentionToasts: MentionToast[];
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
    typingUsers: [],
    myUsername: '',
    mentionToasts: [],
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
    typingUsers: (state: ChatState) => state.typingUsers,
    myUsername: (state: ChatState) => state.myUsername,
    mentionToasts: (state: ChatState) => state.mentionToasts,
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
  },
};
