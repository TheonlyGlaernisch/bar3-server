<template>
  <v-app>
    <template v-if="isDiscordAuthed">
      <v-app-bar
        app
        color="#1A1A1A"
        dark
        flat
      >
        <div class="d-flex align-center">
          <v-img
            class="shrink mr-2"
            contain
            src="@/assets/bar3.png"
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
import Vue from 'vue';
import Component from 'vue-class-component';
import SideBar from '@/components/SideBar.vue';
import V2AutomationToggle from '@/components/V2AutomationToggle.vue';
import { clearV2Token, hasV2Credentials, v2Api } from '@/utilities/v2Api';
import { discordAuth } from '@/utilities/discordAuth';

@Component({
  name: 'App',
  components: {
    SideBar,
    V2AutomationToggle,
  }
})
export default class App extends Vue {
  sideBarOpen = false;

  get isDiscordAuthed(): boolean {
    return this.$store.getters.isDiscordAuthed;
  }

  async mounted() {
    const session = await discordAuth.getSession();
    this.$store.commit('setDiscordAuthed', session.authenticated);
    this.$store.commit('setIsAdmin', session.isAdmin);

    if (!session.authenticated) {
      // Avoid hitting protected API endpoints with stale local tokens when the
      // Discord session cookie is not authenticated.
      clearV2Token();
      localStorage.removeItem('pwSessionToken');
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
  }
}
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
