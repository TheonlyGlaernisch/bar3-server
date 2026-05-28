<template>
  <v-btn
    :color="!isLoggedIn ? 'grey' : (enabled ? 'green' : 'red')"
    depressed
    small
    :disabled="loading"
    @click="toggle()"
  >
    <v-icon left>mdi-power</v-icon>
    {{ !isLoggedIn ? 'Login to enable Bar3' : (enabled ? 'Turn Bar3 Off' : 'Turn Bar3 On') }}
  </v-btn>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { v2Api } from '@/utilities/v2Api';
import setApplicationState from '@/actions/setApplicationState';

export default defineComponent({
  name: 'V2AutomationToggle',
  data() {
    return {
      loading: false,
    };
  },
  computed: {
    isLoggedIn(): boolean {
      return this.$store.getters.isLoggedIn;
    },
    enabled(): boolean {
      return this.$store.getters.applicationOn;
    },
  },
  methods: {
    async refresh() {
      if (!this.isLoggedIn) return;
      this.loading = true;
      try {
        const state = await v2Api.getAutomationState();
        this.$store.commit('setApplicationState', !!state.enabled);
      } finally {
        this.loading = false;
      }
    },
    async toggle() {
      if (!this.isLoggedIn) {
        if (this.$route.path !== '/account') this.$router.push({ path: '/account' });
        return;
      }
      const next = !this.enabled;
      this.$store.commit('setApplicationState', next); // optimistic
      try {
        await setApplicationState(next);
      } catch {
        this.$store.commit('setApplicationState', !next);
      }
    },
  },
  mounted() {
    this.refresh();
  },
});
</script>
