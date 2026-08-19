<template>
  <v-app>
    <template v-if="isDiscordAuthed">
      <v-app-bar
        color="#1A1A1A"
        elevation="0"
      >
        <v-app-bar-nav-icon
          v-if="isMobile"
          @click.stop="sideBarOpen = !sideBarOpen"
        />
        <div class="d-flex align-center">
          <v-img
            class="shrink mr-2"
            contain
            src="/src/favicon.ico"
            transition="scale-transition"
            width="45"
          />
          <div class="ml-2 text-white text-h6 font-weight-medium bar3-title">
            Bar 3
          </div>
        </div>

        <v-spacer />

        <v2-automation-toggle class="mr-2" />
      </v-app-bar>

      <side-bar v-model="sideBarOpen" :disabled="false"/>
    </template>

            <!-- in App.vue template, inside <v-app> at the top level -->
    <TransitionGroup name="toast" tag="div" class="mention-toasts mention-toasts--global">
      <div
        v-for="toast in mentionToasts"
        :key="toast.id"
        class="mention-toast"
        @click="dismissToast(toast.id)"
      >
        <span class="mention-toast__from">{{ toast.from }}</span>
        <span class="mention-toast__text">{{ toast.text }}</span>
        <button class="mention-toast__close" @click.stop="dismissToast(toast.id)">×</button>
      </div>
    </TransitionGroup>

    <v-main>
      <router-view />
    </v-main>
  </v-app>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { useDisplay } from 'vuetify';
import SideBar from '@/components/SideBar.vue';
import V2AutomationToggle from '@/components/V2AutomationToggle.vue';
import { hasV2Credentials, v2Api } from '@/utilities/v2Api';
import { discordAuth } from '@/utilities/discordAuth';
import { chatService } from '@/utilities/chatService';
import { useStore } from 'vuex';
import { computed } from 'vue';

  
export default defineComponent({
  name: 'App',
  components: {
    SideBar,
    V2AutomationToggle,
  },
  setup() {
  const { mobile: isMobile } = useDisplay();

  const store = useStore();
  const mentionToasts = computed(
    () => store.getters['chat/mentionToasts'] ?? []
  );

  const dismissToast = (id: number) =>
    store.commit('chat/dismissMentionToast', id);

  return {
    isMobile,
    mentionToasts,
    dismissToast,
  };
},
  data() {
    return {
      sideBarOpen: false,
    };
  },
  computed: {
    isDiscordAuthed(): boolean {
      return this.$store.getters.isDiscordAuthed;
    },
  },
  async mounted() {
    const session = await discordAuth.getSession();
    this.$store.commit('setDiscordAuthed', session.authenticated);
    this.$store.commit('setIsAdmin', session.isAdmin);
    this.$store.commit('setDiscordRoles', session.roles);

    if (!session.authenticated) {
      return;
    }
    const hasMemberAccess = session.roles.memberGuild || session.isAdmin;
      if (hasMemberAccess) {
      chatService.init(this.$store);
     }
    

    await Promise.all([
      (async () => {
        if (!hasV2Credentials()) return;
        try {
          const state = await v2Api.getAutomationState();
          this.$store.commit('setApplicationState', !!state.enabled);
        } catch {
          // ignore
        }
      })(),
    ]);
  },
});
</script>

<style>
  @import url('styles/viewStyle.css');

  /* ── Bar 3 title ────────────────────────────────────────────── */
  .bar3-title {
    letter-spacing: 0.02em;
  }


  .mention-toasts--global {
    position: fixed;
    bottom: 24px;
    right: 16px;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: 8px;
    pointer-events: none;
  }

  .mention-toast {
    pointer-events: auto;
    position: relative;

    min-width: 280px;
    max-width: 420px;

    background: #1e1e1e;
    border: 1px solid #2c2c2c;
    border-left: 3px solid #FF6B00;

    border-radius: 8px;

    padding: 12px 36px 12px 14px;

    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.35);

    display: flex;
    flex-direction: column;

    cursor: pointer;

    transition: transform .15s ease, opacity .15s ease;
  }

  .mention-toast:hover {
    transform: translateY(-2px);
  }

  .mention-toast:active {
    opacity: 0.75;
    transform: translateY(0);
  }

  .mention-toast__from {
    font-weight: 700;
    color: #FF9500;
  }

  .mention-toast__text {
    margin-top: 4px;
    color: rgba(255,255,255,.85);
    word-break: break-word;
  }

  .mention-toast__close {
    position: absolute;
    top: 8px;
    right: 10px;

    border: none;
    background: transparent;

    color: rgba(255,255,255,.45);
    font-size: 1.1rem;
    line-height: 1;

    cursor: pointer;
    transition: color .1s ease;
  }

  .mention-toast__close:hover {
    color: rgba(255,255,255,.85);
  }

  .toast-enter-active,
  .toast-leave-active {
    transition: all .25s ease;
  }
  
  .toast-enter-from {
    opacity: 0;
    transform: translateX(20px);
  }
  
  .toast-leave-to {
    opacity: 0;
    transform: translateX(20px);
  }


  .v-toolbar__content {
    border-bottom: 1px solid #262626 !important;
  }

  /* ── Cards: one flat, consistent surface ───────────────────── */
  .v-card {
    border-radius: 10px !important;
    background: #1a1a1a !important;
    border: 1px solid #2a2a2a !important;
    box-shadow: none !important;
    transition: border-color 0.2s ease;
  }

  .v-card:hover {
    border-color: #3a3a3a !important;
  }

  /* Text field focus ring */
  .v-field--focused .v-field__outline {
    --v-field-border-opacity: 1;
  }

  /* Tables */
  .v-table {
    background: transparent !important;
  }

  .v-table tbody tr:hover td {
    background: rgba(255, 255, 255, 0.03) !important;
    transition: background 0.15s ease;
  }

  .v-text-field .v-input__control .v-input__slot {
    border-radius: 8px !important;
  }

  .v-btn:not(.v-btn--fab):not(.v-btn--icon) {
    border-radius: 8px !important;
    letter-spacing: 0.01em;
    box-shadow: none !important;
  }
</style>
