<!-- eslint-disable vue/multi-word-component-names -->
<template>
  <div class="chat-page">

    <!-- ── Notification permission nudge ─────────────────────────────────── -->
    <div v-if="notificationPermission === 'default'" class="notif-nudge">
      <span>Enable push notifications to get pinged when you're mentioned while away.</span>
      <button @click="requestNotificationPermission">Enable</button>
    </div>
    <div v-else-if="notificationPermission === 'denied'" class="notif-nudge notif-nudge--denied">
      Push notifications are blocked. You'll still see in-app alerts when mentioned.
    </div>

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

      <!-- Mention toasts -->
      <TransitionGroup name="toast" tag="div" class="toast-stack">
        <div
          v-for="toast in mentionToasts"
          :key="toast.id"
          class="mention-toast"
          @click="dismissToast(toast.id)"
        >
          <span class="mention-toast__from">{{ toast.from }} mentioned you</span>
          <span class="mention-toast__text">{{ toast.text }}</span>
        </div>
      </TransitionGroup>

      <div v-if="statusMessage" class="chat-status" :class="statusType">
        {{ statusMessage }}
      </div>

      <div class="chat-messages-wrapper">
        <div class="chat-messages" ref="messagesContainer" aria-live="polite" @scroll="onScroll">
          <div v-if="messages.length === 0" class="empty-state">
            No messages yet. Start the conversation below.
          </div>

          <div
            v-for="(message, idx) in messages"
            :key="`${message.timestamp}-${message.username || message.type}-${idx}`"
            :class="['message-row', message.type]"
            @mouseenter="onMessageMouseEnter(messageKey(message, idx))"
            @mouseleave="onMessageMouseLeave()"
          >
            <div :class="['message', message.type]">
              <div class="message-header" v-if="message.type === 'message'">
                <span :class="['username', { 'username--admin': message.isAdmin }]">{{ message.username }}</span>
                <span class="timestamp">{{ formatTimestamp(message.timestamp) }}</span>
              </div>
              <div
                class="message-content"
                :class="{ system: message.type === 'system' }"
                v-html="renderText(message.text)"
              />

              <!-- Existing reactions on the message -->
              <div
                v-if="getReactions(messageKey(message, idx)).length"
                class="reaction-chips"
                @mouseenter="onReactionBarMouseEnter()"
              >
                <button
                  v-for="r in getReactions(messageKey(message, idx))"
                  :key="r.emoji"
                  :class="['reaction-chip', { 'reaction-chip--mine': r.myReaction }]"
                  @click.stop="toggleReaction(messageKey(message, idx), r.emoji)"
                  :title="r.myReaction ? 'Remove reaction' : 'Add reaction'"
                >
                  {{ r.emoji }} <span class="reaction-chip__count">{{ r.count }}</span>
                </button>
              </div>
            </div>

            <!-- Quick-reaction hover bar -->
            <Transition name="reaction-bar">
              <div
                v-if="hoveredMessageKey === messageKey(message, idx) && message.type === 'message'"
                class="quick-reaction-bar"
                @mouseenter="onReactionBarMouseEnter()"
                @mouseleave="onMessageMouseLeave()"
              >
                <button
                  v-for="emoji in QUICK_REACTIONS"
                  :key="emoji"
                  class="quick-reaction-btn"
                  :class="{ 'quick-reaction-btn--active': getReactions(messageKey(message, idx)).some(r => r.emoji === emoji && r.myReaction) }"
                  @click.stop="toggleReaction(messageKey(message, idx), emoji)"
                  :title="`React with ${emoji}`"
                >
                  {{ emoji }}
                </button>
              </div>
            </Transition>
          </div>
        </div>

        <!-- Scroll-to-bottom button -->
        <Transition name="scroll-btn">
          <button
            v-if="showScrollButton"
            class="scroll-to-bottom"
            aria-label="Jump to latest message"
            @click="scrollToBottom"
          >
            ↓ New messages
          </button>
        </Transition>
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
                <span class="online-dot online-dot--sm" :style="u.offline ? 'background:#666' : ''" />
                {{ u.username }}
                <span v-if="u.isAdmin" class="online-panel__admin-badge">admin</span>
                <span v-if="u.offline" class="offline-badge">offline</span>
              </li>
            </ul>
          </Transition>

          <!-- Emoji picker panel -->
          <Transition name="panel">
            <div v-if="showEmojiPicker" class="emoji-picker-container" @click.stop>
              <div class="emoji-picker__search">
                <input
                  v-model="emojiSearchQuery"
                  type="text"
                  placeholder="Search emoji…"
                  class="emoji-picker__search-input"
                  autocomplete="off"
                />
              </div>
              <div v-if="!emojiSearchQuery" class="emoji-picker__categories">
                <button
                  v-for="(cat, ci) in EMOJI_CATEGORIES"
                  :key="cat.label"
                  :class="['emoji-picker__cat-btn', { 'emoji-picker__cat-btn--active': activeCategoryIndex === ci }]"
                  :title="cat.label"
                  @click.prevent="activeCategoryIndex = ci"
                >
                  {{ cat.icon }}
                </button>
              </div>
              <div class="emoji-picker__grid">
                <button
                  v-for="emoji in filteredEmojis"
                  :key="emoji"
                  class="emoji-picker__emoji"
                  @click.prevent="insertEmoji(emoji)"
                  :title="emoji"
                >
                  {{ emoji }}
                </button>
              </div>
            </div>
          </Transition>

          <input
            id="chat-message-input"
            ref="inputRef"
            v-model="newMessage"
            placeholder="Type your message…"
            :disabled="!canSend"
            maxlength="500"
            class="message-input"
            autocomplete="off"
            @input="onInputChange"
            @keydown="onInputKeydown"
            @blur="sendTypingStop"
          />

          <!-- Emoji picker toggle button -->
          <button
            type="button"
            class="emoji-picker-btn"
            :disabled="!canSend"
            :class="{ 'emoji-picker-btn--active': showEmojiPicker }"
            :aria-label="showEmojiPicker ? 'Close emoji picker' : 'Open emoji picker'"
            @click.stop="toggleEmojiPicker"
          >
            😊
          </button>
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

<script lang="ts" src="./Chat.script.ts"></script>

<style scoped>
/* ── Notification nudge bar ──────────────────────────────────────────────── */
.notif-nudge {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 8px 16px;
  background: rgba(255, 107, 0, 0.12);
  border-bottom: 1px solid rgba(255, 107, 0, 0.25);
  font-size: 0.82rem;
  color: #ccc;
}

.notif-nudge--denied {
  background: rgba(80, 80, 80, 0.12);
  border-color: rgba(255, 255, 255, 0.08);
  color: #888;
}

.notif-nudge button {
  padding: 4px 12px;
  border-radius: 999px;
  border: 1px solid #ff6b00;
  background: transparent;
  color: #ff9b4a;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}

.notif-nudge button:hover {
  background: rgba(255, 107, 0, 0.18);
}

  

/* ── Mention toasts ──────────────────────────────────────────────────────── */
.mention-toast {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 10px 14px;
  background: #1a1a1a;
  border: 1px solid rgba(255, 107, 0, 0.5);
  border-radius: 10px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  font-size: 0.82rem;
  color: #e0e0e0;
  max-width: 280px;
  pointer-events: all;
}

.mention-toast__from {
  font-weight: 700;
  color: #ff9b4a;
  white-space: nowrap;
  flex-shrink: 0;
}

.mention-toast__text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #bbb;
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.toast-enter-from { opacity: 0; transform: translateY(-6px); }
.toast-leave-to   { opacity: 0; transform: translateY(-6px); }

/* ── Page layout ─────────────────────────────────────────────────────────── */
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
  position: relative;
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

.chat-header h2 { margin: 0; font-size: 1.35rem; }
.chat-subtitle   { margin: 4px 0 0; color: #bdbdbd; font-size: 0.92rem; }

.connection-pill {
  flex-shrink: 0;
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.connection-pill.connected   { background: rgba(46, 204, 113, 0.18); color: #6ee7a2; }
.connection-pill.connecting  { background: rgba(255, 193, 7,  0.18); color: #ffd166; }
.connection-pill.disconnected{ background: rgba(231, 76,  60, 0.18); color: #ff8a80; }

.chat-status { padding: 10px 20px; border-bottom: 1px solid #444; font-size: 0.92rem; }
.chat-status.info  { color: #e0e0e0; background: rgba(255,255,255,0.05); }
.chat-status.error { color: #ffd0cb; background: rgba(231,76,60,0.14); }

/* ── Messages ────────────────────────────────────────────────────────────── */
.chat-messages-wrapper {
  flex: 1;
  position: relative;
  min-height: 0;
}

.chat-messages {
  height: 100%;
  overflow-y: auto;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.empty-state { margin: auto; color: #aaa; text-align: center; }

/* ── Message row (wraps bubble + reaction bar) ───────────────────────────── */
.message-row {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 4px 0;
}

.message-row.system { align-items: center; }

.message {
  max-width: 72%;
  padding: 10px 14px;
  border-radius: 18px;
  line-height: 1.4;
  word-wrap: break-word;
  color: #fff;
  background: #3a3a3a;
  position: relative;
}

.message.message { align-self: flex-start; }

.message-header {
  display: flex;
  gap: 12px;
  justify-content: space-between;
  margin-bottom: 4px;
  font-size: 0.85em;
  opacity: 0.9;
}

.username       { font-weight: bold; color: #ff9b4a; }
.username--admin{ color: #3fb950; }
.timestamp      { font-size: 0.75em; opacity: 0.7; }
.message-content{ white-space: pre-wrap; }

.message.system {
  background-color: #1f1f1f;
  color: #cfcfcf;
  text-align: center;
  max-width: 90%;
  margin: 0 auto;
  padding: 8px 16px;
}

/* ── Reaction chips ──────────────────────────────────────────────────────── */
.reaction-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}

.reaction-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.06);
  color: #ddd;
  font-size: 0.82rem;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s, transform 0.1s;
  line-height: 1.4;
}

.reaction-chip:hover {
  background: rgba(255,255,255,0.12);
  transform: scale(1.08);
}

.reaction-chip--mine {
  border-color: rgba(255, 107, 0, 0.6);
  background: rgba(255, 107, 0, 0.15);
  color: #ff9b4a;
}

.reaction-chip--mine:hover {
  background: rgba(255, 107, 0, 0.24);
}

.reaction-chip__count {
  font-size: 0.75rem;
  font-weight: 700;
  opacity: 0.85;
}

/* ── Quick reaction hover bar ────────────────────────────────────────────── */
.quick-reaction-bar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px 6px;
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 24px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.5);
  z-index: 20;
  pointer-events: all;
}

.quick-reaction-btn {
  font-size: 1.05rem;
  padding: 4px 5px;
  border-radius: 50%;
  border: none;
  background: transparent;
  cursor: pointer;
  transition: transform 0.1s, background 0.1s;
  line-height: 1;
}

.quick-reaction-btn:hover {
  transform: scale(1.3);
  background: rgba(255,255,255,0.08);
}

.quick-reaction-btn--active {
  background: rgba(255, 107, 0, 0.2);
}

.reaction-bar-enter-active,
.reaction-bar-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.reaction-bar-enter-from,
.reaction-bar-leave-to {
  opacity: 0;
  transform: translateY(4px) scale(0.95);
}

/* ── Scroll-to-bottom button ─────────────────────────────────────────────── */
.scroll-to-bottom {
  position: absolute;
  bottom: 14px;
  left: 50%;
  transform: translateX(-50%);
  background: #ff6b00;
  color: #fff;
  border: none;
  border-radius: 999px;
  padding: 7px 18px;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(0,0,0,0.4);
  white-space: nowrap;
  transition: background 0.15s, transform 0.15s;
  z-index: 10;
}

.scroll-to-bottom:hover {
  background: #ff8c33;
  transform: translateX(-50%) translateY(-2px);
}

.scroll-btn-enter-active,
.scroll-btn-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.scroll-btn-enter-from   { opacity: 0; transform: translateX(-50%) translateY(8px); }
.scroll-btn-leave-to     { opacity: 0; transform: translateX(-50%) translateY(8px); }

/* ── Input area ──────────────────────────────────────────────────────────── */
.chat-input-container {
  display: flex;
  gap: 10px;
  padding: 16px;
  border-top: 1px solid #444;
  background-color: #1a1a1a;
}

.input-wrapper {
  flex: 1;
  position: relative;
  min-width: 0;
  display: flex;
  align-items: center;
  background: #333;
  border: 1px solid #4b4b4b;
  border-radius: 24px;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.input-wrapper:focus-within {
  border-color: #ff6b00;
  box-shadow: 0 0 0 2px rgba(255, 107, 0, 0.22);
}

.message-input {
  flex: 1;
  min-width: 0;
  padding: 12px 8px 12px 16px;
  border: none;
  border-radius: 24px;
  background: transparent;
  color: white;
  font-size: 1rem;
  outline: none;
}

.message-input::placeholder { color: #888; }
.message-input:disabled { opacity: 0.65; }

/* ── Emoji picker button ─────────────────────────────────────────────────── */
.emoji-picker-btn {
  flex-shrink: 0;
  padding: 8px 12px;
  border: none;
  background: transparent;
  font-size: 1.25rem;
  cursor: pointer;
  border-radius: 50%;
  line-height: 1;
  transition: transform 0.1s, background 0.1s;
  opacity: 0.7;
}

.emoji-picker-btn:hover:not(:disabled) {
  transform: scale(1.15);
  opacity: 1;
  background: rgba(255,255,255,0.06);
}

.emoji-picker-btn--active {
  opacity: 1;
  background: rgba(255, 107, 0, 0.18);
}

.emoji-picker-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* ── Emoji picker panel ──────────────────────────────────────────────────── */
.emoji-picker-container {
  position: absolute;
  bottom: calc(100% + 10px);
  right: 0;
  width: 320px;
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 14px;
  padding: 10px;
  box-shadow: 0 12px 36px rgba(0,0,0,0.55);
  z-index: 200;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.emoji-picker__search-input {
  width: 100%;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid #333;
  background: #111;
  color: #e0e0e0;
  font-size: 0.85rem;
  outline: none;
}

.emoji-picker__search-input:focus {
  border-color: #ff6b00;
}

.emoji-picker__categories {
  display: flex;
  gap: 2px;
  flex-wrap: wrap;
  border-bottom: 1px solid #2a2a2a;
  padding-bottom: 8px;
}

.emoji-picker__cat-btn {
  padding: 5px 8px;
  border-radius: 8px;
  border: none;
  background: transparent;
  font-size: 1.1rem;
  cursor: pointer;
  transition: background 0.1s, transform 0.1s;
  line-height: 1;
}

.emoji-picker__cat-btn:hover {
  background: rgba(255,255,255,0.08);
  transform: scale(1.12);
}

.emoji-picker__cat-btn--active {
  background: rgba(255, 107, 0, 0.2);
}

.emoji-picker__grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 2px;
  max-height: 200px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #333 transparent;
}

.emoji-picker__emoji {
  padding: 5px;
  border: none;
  background: transparent;
  font-size: 1.25rem;
  cursor: pointer;
  border-radius: 6px;
  line-height: 1;
  transition: transform 0.08s, background 0.08s;
  text-align: center;
}

.emoji-picker__emoji:hover {
  transform: scale(1.25);
  background: rgba(255,255,255,0.08);
}

/* ── Send button ─────────────────────────────────────────────────────────── */
.send-button {
  padding: 0 24px;
  border-radius: 24px;
  border: none;
  background-color: #ff6b00;
  color: white;
  font-weight: bold;
  cursor: pointer;
  transition: background-color 0.2s, opacity 0.2s;
  flex-shrink: 0;
}

.send-button:hover:not(:disabled) { background-color: #ff8c33; }
.send-button:disabled              { opacity: 0.5; cursor: not-allowed; }

.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0;
  margin: -1px; overflow: hidden; clip: rect(0,0,0,0);
  white-space: nowrap; border: 0;
}

/* ── Online users panel ──────────────────────────────────────────────────── */
.online-panel-wrapper { position: relative; }

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
  width: 8px; height: 8px;
  border-radius: 50%; background: #4caf50;
  display: inline-block; flex-shrink: 0;
}
.online-dot--sm { width: 6px; height: 6px; }

.online-panel {
  position: absolute;
  top: calc(100% + 8px); right: 0;
  max-height: 40vh; overflow-y: auto;
  min-width: 180px;
  background: #1a1a1a;
  border: 1px solid #333; border-radius: 10px;
  padding: 6px 0; list-style: none; margin: 0;
  z-index: 100;
  box-shadow: 0 8px 24px rgba(0,0,0,0.5);
}

.online-panel__user {
  display: flex; align-items: center; gap: 8px;
  padding: 7px 14px; font-size: 0.85rem; color: #ccc;
}
.online-panel__user--admin { color: #3fb950; }

.online-panel__admin-badge {
  margin-left: auto; font-size: 0.65rem;
  padding: 1px 6px; border-radius: 4px;
  background: rgba(63,185,80,0.15); color: #3fb950;
  border: 1px solid rgba(63,185,80,0.3);
}

.online-panel__empty {
  padding: 8px 14px; font-size: 0.8rem; color: #666;
}

/* ── Mention autocomplete ────────────────────────────────────────────────── */
.mention-menu {
  position: absolute;
  bottom: calc(100% + 6px); left: 0;
  min-width: 200px;
  background: #1a1a1a; border: 1px solid #333;
  border-radius: 10px; padding: 6px 0;
  list-style: none; margin: 0;
  z-index: 100;
  box-shadow: 0 8px 24px rgba(0,0,0,0.5);
}
.offline-badge {
  margin-left: auto;
  font-size: 0.65rem;
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(255,255,255,0.08);
  color: #666;
  border: 1px solid #333;
}

.mention-menu__item {
  display: flex; align-items: center; gap: 8px;
  padding: 7px 14px; cursor: pointer;
  font-size: 0.85rem; color: #ccc; transition: background 0.1s;
}
.mention-menu__item--active,
.mention-menu__item:hover {
  background: rgba(255,255,255,0.07); color: #fff;
}

.mention {
  background: rgba(88,166,255,0.15); color: #58a6ff;
  border-radius: 3px; padding: 0 3px; font-weight: 500;
}
.mention--self {
  background: rgba(255,107,0,0.18); color: #ff9b4a;
}

/* ── Typing indicator ────────────────────────────────────────────────────── */
.typing-indicator {
  min-height: 20px; padding: 2px 20px 4px;
  font-size: 0.8rem; color: #aaa;
  background-color: #1a1a1a;
}

/* ── Toast stack ─────────────────────────────────────────────────────────── */
.toast-stack {
  position: absolute;
  top: 70px; right: 16px; z-index: 50;
  display: flex; flex-direction: column; gap: 8px;
  pointer-events: none;
}

/* ── Panel transition ────────────────────────────────────────────────────── */
.panel-enter-active,
.panel-leave-active { transition: opacity 0.15s, transform 0.15s; }
.panel-enter-from,
.panel-leave-to     { opacity: 0; transform: translateY(-4px); }

/* ── Mobile ──────────────────────────────────────────────────────────────── */
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

  .message { max-width: 92%; }

  .chat-input-container { flex-direction: column; }
  .send-button { min-height: 44px; width: 100%; }

  .emoji-picker-container {
    width: calc(100vw - 40px);
    right: -8px;
  }

  .emoji-picker__grid { grid-template-columns: repeat(7, 1fr); }

  .online-panel {
    right: auto; left: 0;
    min-width: 160px; max-width: calc(100vw - 24px);
  }
}
</style>
