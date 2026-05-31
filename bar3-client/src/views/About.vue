<template>
  <div class="about view-small-inner-wrapper view-padding-inner-wrapper">
    <h1 class="mb-4">About</h1>
    <update-available-banner/>
    <v-card
      variant="outlined"
      class="mt-10"
    >
      <v-card-item>
        <div class="text-h5 font-weight-medium d-flex align-center">
          <v-img
            class="shrink mr-2"
            contain
            src="/src/favicon.ico"
            width="45"
          />
          <div class="ml-2">
            Bar 3
          </div>
        </div>
      </v-card-item>
      <v-divider/>
      <v-card-text class="d-flex flex-wrap pa-3" style="gap: 16px;">
        <v-btn
          color="primary"
          variant="flat"
          href="https://github.com/bsnk-dev/bar3-server"
          target="_blank"
        >
          <v-icon start>
            mdi-github
          </v-icon>
          GitHub
        </v-btn>
        <v-btn
          variant="outlined"
          href="https://TRF-tech.onrender.com"
          target="_blank"
        >
          <v-icon start>
            mdi-web
          </v-icon>
          Web
        </v-btn>
      </v-card-text>
    </v-card>
    <v-card
      variant="outlined"
      class="mt-10"
    >
      <v-card-title>
        Bar 3
      </v-card-title>
      <v-card-subtitle>
        <div>Client — {{ appVersion }}</div>
        <div>Server — {{ serverVersion }}</div>
      </v-card-subtitle>
      <v-card-text>
        <div>Bar 3 is offered by bsnk-dev.</div>
        <div class="mt-2 provided-by-text font-weight-medium">Provided by Glaernisch and The Reclaimed Flame.</div>
        <div class="mt-2">&copy; Copyright 2021 bsnk-dev. All rights reserved.</div>
        <a href="mailto:admin@bsnk.dev">Email</a>
      </v-card-text>
    </v-card>
  </div>
</template>

<script lang="ts">
import { computed, defineComponent } from 'vue';
import { useStore } from 'vuex';
import UpdateAvailableBanner from '@/components/UpdateAvailableBanner.vue';

export default defineComponent({
  name: 'AboutView',
  components: {
    UpdateAvailableBanner,
  },
  setup() {
    const store = useStore();
    const appVersion = computed(() => store.getters.appVersion);
    const serverVersion = computed(() => store.getters.serverVersion);

    return {
      appVersion,
      serverVersion,
    };
  },
});
</script>

<style scoped>
.provided-by-text {
  color: #ff9500;
}
</style>
