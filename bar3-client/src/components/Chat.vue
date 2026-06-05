<template>
  <div class="chat-container">
    <div class="chat-header">
      <h2>Real-time Chat</h2>
      <div class="user-info">
        <span v-if="username">{{ username }}</span>
        <span v-else>Loading...</span>
      </div>
    </div>

    <div class="chat-messages" ref="messagesContainer">
      <div 
        v-for="message in messages" 
        :key="message.timestamp"
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

    <div class="chat-input-container">
      <div class="input-wrapper">
        <input
          v-model="newMessage"
          @keypress.enter="sendMessage"
          placeholder="Type your message..."
          :disabled="!connected || !isAuthenticated"
          class="message-input"
        />
        <button 
          @click="sendMessage" 
          :disabled="!connected || !isAuthenticated || !newMessage.trim()"
          class="send-button"
        >
          Send
        </button>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, onMounted, onUnmounted, nextTick } from 'vue';
import { useStore } from 'vuex';

export default defineComponent({
  name: 'Chat',
  setup() {
    const store = useStore();
    const messagesContainer = ref<HTMLElement | null>(null);
    const newMessage = ref('');
    const isConnected = ref(false);
    const username = ref('');
    const connected = ref(false);
    const isAuthenticated = ref(false);

    let ws: WebSocket | null = null;
    const messages = ref<any[]>([]);
    const chatHistory = ref<any[]>([]);

    // Format timestamp as readable date
    const formatTimestamp = (timestamp: number) => {
      const date = new Date(timestamp);
      return date.toLocaleTimeString();
    };

    // Handle incoming messages from WebSocket
    const handleWebSocketMessage = (event: MessageEvent) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'history') {
        // Load initial history
        chatHistory.value = [...data.messages];
        messages.value = [...data.messages];
        nextTick(() => {
          scrollToBottom();
        });
      } else if (data.type === 'history_more') {
        // Load more messages
        messages.value = [...data.messages, ...messages.value];
        nextTick(() => {
          scrollToBottom();
        });
      } else {
        // Regular message or system event
        messages.value.push(data);
        nextTick(() => {
          scrollToBottom();
        });
      }
    };

    const scrollToBottom = () => {
      if (messagesContainer.value) {
        messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
      }
    };

    const connectWebSocket = () => {
      if (!store.getters.isDiscordAuthed || !store.getters.hasMemberRole) {
        return;
      }

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/api/chat/ws`;
      
      try {
        ws = new WebSocket(wsUrl);
        
        ws.onopen = () => {
          connected.value = true;
          console.log('Connected to chat server');
        };

        ws.onmessage = (event) => {
          handleWebSocketMessage(event);
        };

        ws.onclose = () => {
          connected.value = false;
          console.log('Disconnected from chat server');
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          connected.value = false;
        };
      } catch (error) {
        console.error('Failed to connect to WebSocket:', error);
        connected.value = false;
      }
    };

    const sendMessage = () => {
      if (!ws || !connected.value || !newMessage.value.trim()) return;

      const messageData = {
        type: 'message',
        text: newMessage.value.trim(),
        timestamp: Date.now()
      };

      ws.send(JSON.stringify(messageData));
      newMessage.value = '';
    };

    // Load initial chat history
    const loadInitialHistory = () => {
      if (!ws || !connected.value) return;
      
      const historyRequest = {
        type: 'history'
      };
      
      ws.send(JSON.stringify(historyRequest));
    };

    // Check authentication status
    const checkAuthStatus = () => {
      isAuthenticated.value = store.getters.isDiscordAuthed && store.getters.hasMemberRole;
      if (isAuthenticated.value) {
        connectWebSocket();
      } else {
        connected.value = false;
        if (ws) {
          ws.close();
        }
      }
    };

    // Watch for authentication changes
    onMounted(() => {
      checkAuthStatus();
      
      // Listen to store changes
      const authCheckInterval = setInterval(() => {
        checkAuthStatus();
      }, 1000);
      
      // Scroll to bottom when messages update
      watch(messages, () => {
        scrollToBottom();
      });
    });

    onUnmounted(() => {
      if (ws) {
        ws.close();
      }
    });

    return {
      messages,
      newMessage,
      connected,
      isAuthenticated,
      username,
      formatTimestamp,
      sendMessage,
      messagesContainer
    };
  }
});
</script>

<style scoped>
.chat-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: #2d2d2d;
  border-radius: 8px;
  overflow: hidden;
}

.chat-header {
  padding: 16px;
  border-bottom: 1px solid #444;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: #1a1a1a;
  color: white;
}

.user-info {
  font-size: 0.9em;
  opacity: 0.8;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.message {
  max-width: 70%;
  padding: 12px 16px;
  border-radius: 18px;
  line-height: 1.4;
  position: relative;
  word-wrap: break-word;
}

.message-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
  font-size: 0.85em;
  opacity: 0.9;
}

.username {
  font-weight: bold;
  color: #ff6b00;
}

.timestamp {
  font-size: 0.75em;
  opacity: 0.7;
}

.message-content {
  font-size: 1em;
}

.message.system {
  background-color: #333;
  text-align: center;
  max-width: 90%;
  margin: 0 auto;
  padding: 8px 16px;
}

.chat-input-container {
  padding: 16px;
  border-top: 1px solid #444;
  background-color: #1a1a1a;
}

.input-wrapper {
  display: flex;
  gap: 8px;
}

.message-input {
  flex: 1;
  padding: 12px 16px;
  border-radius: 24px;
  border: none;
  background-color: #333;
  color: white;
  font-size: 1em;
}

.message-input:focus {
  outline: none;
  box-shadow: 0 0 0 2px #ff6b00;
}

.send-button {
  padding: 12px 24px;
  border-radius: 24px;
  border: none;
  background-color: #ff6b00;
  color: white;
  font-weight: bold;
  cursor: pointer;
  transition: background-color 0.2s;
}

.send-button:hover:not(:disabled) {
  background-color: #ff8c33;
}

.send-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (max-width: 768px) {
  .chat-container {
    height: calc(100vh - 120px);
  }
  
  .message {
    max-width: 90%;
  }
  
  .input-wrapper {
    flex-direction: column;
  }
  
  .send-button {
    width: 100%;
  }
}
</style>