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
  /* ── App bar glassmorphism ──────────────────────────────────── */
  .app-bar-glass {
    background: rgba(26, 26, 26, 0.88) !important;
    backdrop-filter: blur(12px) !important;
    -webkit-backdrop-filter: blur(12px) !important;
  }
  
  /* ── Bar 3 title ────────────────────────────────────────────── */
  .bar3-title {
    letter-spacing: 0.08em;
    text-shadow: 0 0 18px rgba(255, 107, 0, 0.35);
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

    background: rgba(26, 26, 26, 0.9);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 107, 0, 0.15);
    border-left: 4px solid #FF6B00;

    border-radius: 12px;

    padding: 12px 36px 12px 14px;

    box-shadow:
      0 0 0 1px rgba(255, 107, 0, 0.1),
      0 10px 25px rgba(0,0,0,.45),
      0 0 20px rgba(255, 107, 0, 0.08);

    display: flex;
    flex-direction: column;

    cursor: pointer;

    transition:
      transform .15s ease,
      box-shadow .15s ease,
      opacity .15s ease;
  }

  .mention-toast:hover {
    transform: translateY(-2px);

    box-shadow:
      0 14px 30px rgba(0,0,0,.45);
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
    border-bottom: 1px solid transparent !important;
    background-image:
      linear-gradient(#1a1a1a, #1a1a1a),
      linear-gradient(90deg, transparent, rgba(255,107,0,0.5), transparent) !important;
    background-origin: border-box !important;
    background-clip: padding-box, border-box !important;
  }

  /* Global rounded corners for cards */
  .v-card {
    border-radius: 12px !important;
    background: rgba(26, 26, 26, 0.85) !important;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 107, 0, 0.1) !important;
    transition:
      box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1),
      border-color 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }
  
  .v-card:hover {
    border-color: rgba(255, 107, 0, 0.22) !important;
    box-shadow:
      0 0 20px rgba(255, 107, 0, 0.1),
      0 8px 32px rgba(0,0,0,0.4) !important;
  }

  /* Primary button glow */
  .v-btn.v-btn--variant-flat[class*="bg-primary"],
  .v-btn.v-btn--variant-flat .v-btn__overlay {
    transition: box-shadow 0.25s ease, filter 0.25s ease;
  }
  
  .v-btn.v-btn--variant-flat[class*="bg-primary"]:hover {
    box-shadow: 0 0 16px rgba(255, 107, 0, 0.45) !important;
    filter: brightness(1.1);
  }
  
  /* Outlined button hover glow */
  .v-btn--variant-outlined:hover {
    box-shadow: 0 0 12px rgba(255, 107, 0, 0.25) !important;
    border-color: rgba(255, 107, 0, 0.6) !important;
    transition: box-shadow 0.25s ease;
  }
  
  /* Text field focus glow */
  .v-field--focused .v-field__outline {
    --v-field-border-opacity: 1;
    box-shadow: 0 0 0 2px rgba(255, 107, 0, 0.2);
  }
  
  /* Table semi-transparent background */
  .v-table {
    background: rgba(26, 26, 26, 0.6) !important;
  }
  
  .v-table tbody tr:hover td {
    background: rgba(255, 107, 0, 0.04) !important;
    transition: background 0.2s ease;
  }

  .v-text-field .v-input__control .v-input__slot {
    border-radius: 8px !important;
  }

  .v-btn:not(.v-btn--fab):not(.v-btn--icon) {
    border-radius: 8px !important;
  }
</style>
