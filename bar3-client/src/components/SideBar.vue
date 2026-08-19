<template>
  <div>
    <v-navigation-drawer
      v-model="drawerOpen"
      :permanent="!isMobile"
      :temporary="isMobile"
      color="#1A1A1A"
      class="elevation-0"
    >
      <v-list-item style="height: 63px;">
        <div class="text-h5 mt-3 mb-3 font-weight-medium d-flex align-center" @click="$router.push({'path': '/'})">
          <v-img
            class="shrink mr-2"
            contain
            src="/src/favicon.ico"
            transition="scale-transition"
            width="45"
          />
          <div class="ml-2 text-white">
            Bar 3
          </div>
        </div>
      </v-list-item>

      <v-divider/>

      <v-list
        density="compact"
        nav
        class="pl-0"
      >
        <v-list-item
          v-for="item in items"
          :key="item.title"
          :active="$route.path === item.path"
          :disabled="disabled"
          :prepend-icon="item.icon"
          :title="item.title"
          color="primary"
          @click="goto(item.path)"
        />
      </v-list>
    </v-navigation-drawer>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { useDisplay } from 'vuetify';
import { SideBarItem } from '@/types';

export default defineComponent({
  name: 'SideBar',
  emits: ['update:modelValue'],
  props: {
    modelValue: {
      type: Boolean,
      default: false,
    },
    disabled: {
      type: Boolean,
      default: false,
    },
  },
  setup() {
    const { mobile: isMobile } = useDisplay();
    return { isMobile };
  },
  computed: {
    drawerOpen: {
      get(): boolean {
        return !this.isMobile || this.modelValue;
      },
      set(value: boolean) {
        if (this.isMobile) {
          this.$emit('update:modelValue', value);
        }
      },
    },
    isAdmin(): boolean {
      return this.$store.getters.isAdmin;
    },
    hasClientRole(): boolean {
      return this.$store.getters.hasClientRole;
    },
    hasMemberRole(): boolean {
      return this.$store.getters.hasMemberRole;
    },
    items(): SideBarItem[] {
      const base: SideBarItem[] = [];
      if (this.hasClientRole) {
        base.push(
          {
            title: 'Dashboard',
            icon: 'mdi-view-dashboard',
            path: '/dashboard',
          },
          {
            title: 'Automation',
            icon: 'mdi-robot-outline',
            path: '/automation',
          },
          {
            title: 'Configuration',
            icon: 'mdi-cog',
            path: '/config',
          },
          {
            title: 'Compose',
            icon: 'mdi-email-edit',
            path: '/message-creator',
          },
          {
            title: 'Analytics',
            icon: 'mdi-chart-line',
            path: '/analytics',
          },
          {
            title: 'Account',
            icon: 'mdi-account-circle',
            path: '/account',
          },
        );
      }
      if (this.hasMemberRole) {
        base.push(
          {
            title: 'Nation',
            icon: 'mdi-flag',
            path: '/nation',
          },
          {
            title: 'Alliance',
            icon: 'mdi-shield-account',
            path: '/alliance',
          },
          {
            title: 'Banking',
            icon: 'mdi-bank',
            path: '/banking',
          },
          {
            title: 'Chat',
            icon: 'mdi-chat',
            path: '/chat',
          },
        );
      }
      base.push(
        {
          title: 'About',
          icon: 'mdi-information',
          path: '/about',
        },
        {
          title: 'Leaderboard',
          icon: 'mdi-podium',
          path: '/leaderboard',
        },
        {
          title: 'Help',
          icon: 'mdi-help-circle',
          path: '/help',
        },
        {
          title: 'Constitution',
          icon: 'mdi-book-open-page-variant',
          path: '/constitution',
        },
        {
          title: 'Privacy Policy',
          icon: 'mdi-shield-lock-outline',
          path: '/privacy',
        },
      );
      if (this.isAdmin) {
        base.push({
          title: 'Bot',
          icon: 'mdi-robot',
          path: '/bot',
        });
      }
      return base;
    },
  },
  methods: {
    goto(path: string) {
      if (this.$route.path != path) {
        this.$router.push({'path': path});
      }
      if (this.isMobile) this.$emit('update:modelValue', false);
    },
  },
});
</script>
<style scoped>
/* Nav item base transition */
:deep(.v-list-item) {
  transition: background 0.15s ease, border-color 0.15s ease;
  border-left: 3px solid transparent;
  margin-left: 4px;
  border-radius: 0 8px 8px 0 !important;
}

/* Hover state */
:deep(.v-list-item:hover) {
  background: rgba(255, 255, 255, 0.04) !important;
}

/* Active / selected state */
:deep(.v-list-item--active) {
  background: rgba(255, 107, 0, 0.1) !important;
  border-left-color: #FF6B00;
}
</style>
