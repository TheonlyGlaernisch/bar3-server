<template>
  <v-app style="background: #0f0f0f;" />
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { discordAuth } from '@/utilities/discordAuth';
import { normalizeReturnTo } from '@/utilities/serverUrls';

@Component
export default class DiscordLogin extends Vue {
  loading = true;
  error = '';
  errorCode = '';
  errorHint = '';

  private buildServerLoginUrl(): string {
    const params = new URLSearchParams();
    const returnTo = normalizeReturnTo(this.$route.query.returnTo);
    if (returnTo) {
      params.set('returnTo', returnTo);
    }

    const queryError = this.$route.query.error;
    if (typeof queryError === 'string' && queryError) {
      params.set('error', queryError);
    }

    const query = params.toString();
    return query ? `/auth/login?${query}` : '/auth/login';
  }

  private mapAuthError(rawError: string): string {
    this.errorCode = '';
    this.errorHint = '';
    const normalized = rawError.toLowerCase();
    if (normalized.startsWith('role_check_failed')) {
      this.errorCode = rawError;
      this.errorHint =
        'If you already have the correct role, this is usually a temporary backend issue (flame_bot unreachable, API key mismatch, or bot cache not ready).';
      return 'Role verification is temporarily unavailable. Please try again in a moment.';
    }
    if (normalized === 'no_role') {
      return 'Your Discord account is signed in, but it does not currently have access to Bar 3.';
    }
    if (normalized === 'auth_failed') {
      return 'Discord sign-in failed. Please try again.';
    }
    if (normalized === 'no_code') {
      return 'No authorization code was received from Discord. Please try again.';
    }
    return rawError;
  }

  created() {
    // If already authenticated, go straight to the app.
    // Otherwise, force the server-rendered /discord-login page, which includes
    // the public PnW native auth UI.
    discordAuth.isAuthed().then(authed => {
      if (authed) {
        this.$router.replace('/');
        return;
      }
      window.location.replace(this.buildServerLoginUrl());
    });

    // Surface any error message passed as a query param (e.g. from the callback).
    const queryError = this.$route.query.error;
    if (typeof queryError === 'string' && queryError) {
      this.error = this.mapAuthError(queryError);
    }
  }

  login() {
    discordAuth.redirectToDiscord(normalizeReturnTo(this.$route.query.returnTo));
  }
}
</script>

<style scoped>
.discord-login-card {
  border: 1px solid rgba(88, 101, 242, 0.3) !important;
  border-radius: 16px !important;
}

.discord-btn {
  border-radius: 8px !important;
  font-weight: 600;
  letter-spacing: 0.03em;
}
</style>
