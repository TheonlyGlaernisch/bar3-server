<template>
  <div class="about view-small-inner-wrapper view-padding-inner-wrapper">
    <h1 class="mb-4">About</h1>
    <update-available-banner/>
    <v-card
      outlined
      class="mt-10"
    >
     <v-list-item style="height: 63px;">
        <div class="text-h5 mt-3 mb-3 font-weight-medium d-flex align-center">
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
      </v-list-item>
      <v-divider/>
      <v-list-item class="pa-3">
        <v-btn
          color="primary"
          depressed
          dark
          href="https://github.com/bsnk-dev/bar3-server"
          target="_blank"
        >
          <v-icon
            left
            dark
          >
            mdi-github
          </v-icon>
          GitHub
        </v-btn>
        <v-btn
          depressed
          class="ml-4"
          href="https://bar3.bsnk.dev"
          target="_blank"
        >
          <v-icon
            left
          >
            mdi-web
          </v-icon>
          Web
        </v-btn>
      </v-list-item>
    </v-card>
    <v-card
      outlined
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
        <div class="mt-2 orange--text font-weight-medium">Provided by Glaernisch and The Reclaimed Flame.</div>
        <div class="mt-2">&copy; Copyright 2021 bsnk-dev. All rights reserved.</div>
        <a href = "mailto: admin@bsnk.dev">Email</a>
      </v-card-text>
    </v-card>
  </div>
</template>

<script lang="ts">
  import { Component, Vue } from 'vue-property-decorator';
  import UpdateAvailableBanner from '@/components/UpdateAvailableBanner.vue';
  
  @Component({
    components: {
      UpdateAvailableBanner
    }
  })
  export default class About extends Vue {
    get appVersion() {
      return this.$store.getters.appVersion;
    }

    get serverVersion() {
      return this.$store.getters.serverVersion;
    }
  }
</script>
