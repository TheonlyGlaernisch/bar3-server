<template>
  <v-app style="background: #0f0f0f;">
    <v-main>
      <v-container class="fill-height" fluid>
        <v-row align="center" justify="center">
          <v-col cols="12" sm="8" md="5" lg="4">
            <v-card class="pa-8" dark color="#1A1A1A" style="border-radius: 16px !important;">
              <div class="text-center">
                <v-progress-circular
                  indeterminate
                  color="#5865F2"
                  size="56"
                  class="mb-4"
                />
                <div class="text-h6 white--text font-weight-medium mb-2">
                  Signing you in…
                </div>
                <div class="body-2 text--secondary">
                  Please wait a moment.
                </div>
              </div>
            </v-card>
          </v-col>
        </v-row>
      </v-container>
    </v-main>
  </v-app>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { discordAuth } from '@/utilities/discordAuth';
import { normalizeReturnTo } from '@/utilities/serverUrls';

@Component
export default class DiscordCallback extends Vue {
  async created() {
    const discordToken = this.$route.query.discordToken;
    if (typeof discordToken === 'string' && discordToken.trim()) {
      discordAuth.setSessionToken(discordToken);
    }

    const authed = await discordAuth.isAuthed();

    if (!authed) {
      // The session cookie was not set — most likely blocked by Safari/iOS ITP
      // or the OAuth flow failed on the server. Show a helpful error on the
      // login page rather than silently looping back here.
      this.$router.replace(
        '/discord-login?error=' +
          encodeURIComponent(
            'Sign-in failed. If you are on iOS or Safari, try opening the site in Chrome or check that third-party cookies are allowed.'
          )
      );
      return;
    }

    // Forward any ?returnTo= the server attached to this callback URL, but
    // only accept relative paths to prevent open-redirect attacks.
    const target = normalizeReturnTo(this.$route.query.returnTo) || '/';
    this.$router.replace(target);
  }
}
</script>
