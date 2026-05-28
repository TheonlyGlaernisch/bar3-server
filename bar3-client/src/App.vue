<template>
  <v-app>
    <template v-if="isDiscordAuthed">
      <v-app-bar
        app
        color="#1A1A1A"
        dark
        flat
      >
        <v-app-bar-nav-icon
          v-if="$vuetify.breakpoint.mobile"
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
          <div class="ml-2 white--text text-h6 font-weight-medium">
            Bar 3
          </div>
        </div>

        <v-spacer />

        <v2-automation-toggle class="mr-2" />
      </v-app-bar>

      <side-bar v-model="sideBarOpen" :disabled="false"/>
    </template>

    <v-main>
      <router-view />
    </v-main>
  </v-app>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import SideBar from '@/components/SideBar.vue';
import V2AutomationToggle from '@/components/V2AutomationToggle.vue';
import { hasV2Credentials, v2Api } from '@/utilities/v2Api';
import { discordAuth } from '@/utilities/discordAuth';

export default defineComponent({
  name: 'App',
  components: {
    SideBar,
    V2AutomationToggle,
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

  .v-toolbar__content {
    border-bottom: thin solid rgba(255, 107, 0, 0.3) !important;
  }

  /* Global rounded corners for cards */
  .v-card {
    border-radius: 12px !important;
  }

  .v-text-field .v-input__control .v-input__slot {
    border-radius: 8px !important;
  }

  .v-btn:not(.v-btn--fab):not(.v-btn--icon) {
    border-radius: 8px !important;
  }
</style>
