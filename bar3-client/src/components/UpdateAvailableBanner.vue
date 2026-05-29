<template>
    <v-alert
      type="info"
      v-if="update"
      prominent
      variant="outlined"
    >

      <v-row align="center">
        <v-col class="grow">
          <h3>Update</h3>
        </v-col>
        <v-col class="shrink d-flex">
          <v-btn
            :href="`https://github.com/bsnk-dev/bar3-server/releases/${update.tag_name}`"
            :target="_blank"
            color="primary"
            variant="flat"
            class="ml-auto"
          >
            Download
          </v-btn>
        </v-col>
      </v-row>
      <v-row>
        <v-col class="grow">
          Bar 3 {{ update.name }} is available for download.
          It is recommended you update to the newest version to get the latest patches,
          features, and security fixes.
        </v-col>
      </v-row>
    </v-alert>
</template>

<script lang="ts">
import {GitHubRelease} from '@/types';
import {computed, defineComponent} from 'vue';
import {useStore} from 'vuex';

export default defineComponent({
  name: 'UpdateAvailableBanner',
  setup() {
    const store = useStore();
    const update = computed(() => store.getters.newUpdate as GitHubRelease | null);

    return {
      update,
    };
  },
});
</script>