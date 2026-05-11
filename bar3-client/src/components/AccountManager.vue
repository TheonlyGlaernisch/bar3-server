<template>
  <div class="account-manager">
    <h2>Account</h2>

    <article class="api-help">
      Enter your Politics &amp; War API key to log in. This key is stored encrypted in MongoDB and is only used to send messages on your behalf.
      You can find it on
      <a target="_blank" href="https://politicsandwar.com/account">the Politics &amp; War account page</a>.
    </article>
      <div class="api-key-section">
      <label for="apiKey">Politics &amp; War API Key:</label>
      <input
        id="apiKey"
        v-model="apiKey"
        type="password"
        placeholder="Enter your API key"
        @keyup.enter="loginV2"
      />
      <button @click="loginV2" :disabled="!apiKey">Log in</button>
      <button class="ml-2" @click="logoutV2" :disabled="!v2Session">Logout</button>
    </div>

    <v-alert v-if="v2Session" type="success" dense class="mt-4">
      Logged in
    </v-alert>

    <v-alert v-if="statusMessage" :type="statusMessage.type === 'success' ? 'success' : 'info'" dense class="mt-4">
      {{ statusMessage.text }}
    </v-alert>

    <v-alert v-if="error" type="error" dense class="mt-4">
      {{ error }}
    </v-alert>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { hasV2Credentials, v2Api } from '../utilities/v2Api';
import { API_BASE_URL } from '@/utilities/serverUrls';

@Component
export default class AccountManager extends Vue {
  apiKey = localStorage.getItem('apiKey') || '';
  error = '';
  statusMessage: { type: string; text: string } | null = null;
  v2Session = hasV2Credentials();

  async loginV2() {
    this.error = '';
    this.statusMessage = null;
    try {
      await v2Api.loginWithPwApiKey(this.apiKey);
      localStorage.setItem('apiKey', this.apiKey);
      this.v2Session = hasV2Credentials();
      this.$store.commit('setLoggedIn', true);
      this.$router.push({ path: '/' });
      this.statusMessage = { type: 'success', text: 'User loaded successfully' };

      // Immediately sync the top-right toggle state after login.
      const state = await v2Api.getAutomationState().catch(() => null);
      if (state) this.$store.commit('setApplicationState', !!state.enabled);
    } catch (e) {
      const maybeMessage =
        typeof e === 'object' && e !== null && 'message' in e ? (e as any).message : undefined;
      this.error = maybeMessage || 'Login failed';
      this.v2Session = hasV2Credentials();
    }
  }

  async logoutV2() {
    await fetch(`${API_BASE_URL}/api/v2/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    }).catch(() => undefined);
    localStorage.removeItem('apiKey');
    this.apiKey = '';
    this.v2Session = false;
    this.$store.commit('setLoggedIn', false);
    this.$store.commit('setApplicationState', false);
    this.statusMessage = { type: 'success', text: 'Logged out' };
  }

  mounted() {
    // Don’t auto-login; keep current behavior predictable.
  }
}
</script>

<style scoped>
.account-manager {
  max-width: 600px;
  margin: 20px auto;
  padding: 20px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 4px;
}

.api-key-section,
.message-section {
  margin: 20px 0;
}

label {
  display: block;
  margin-bottom: 8px;
  font-weight: bold;
}

input,
textarea {
  width: 100%;
  padding: 8px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 4px;
  font-family: monospace;
  background-color: transparent;
  color: inherit;
}

button {
  margin-top: 10px;
  padding: 10px 20px;
  background-color: #4caf50;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

button:hover:not(:disabled) {
  background-color: #45a049;
}

button:disabled {
  background-color: #555;
  color: #999;
  cursor: not-allowed;
}
</style>
