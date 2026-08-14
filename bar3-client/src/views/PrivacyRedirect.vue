<template>
  <div class="privacy-redirect">
    Loading Privacy Policy&hellip;
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

// The Privacy Policy is server-rendered directly from PRIVACY.md (see
// server/api/routers/privacy.ts) so there is a single source of truth
// instead of a copy baked into the client bundle. This view just performs
// a full browser navigation to that route. It's public (see router config)
// so it also works for users who aren't signed in yet.
export default defineComponent({
  name: 'PrivacyRedirect',
  created() {
    window.location.replace('/privacy');
  },
});
</script>

<style scoped>
.privacy-redirect {
  padding: 24px;
  color: #cfd3ea;
}
</style>
