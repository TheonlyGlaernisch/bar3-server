<template>
  <div class="view-small-inner-wrapper view-padding-inner-wrapper">
    <h1>Configuration</h1>
    <h2 class="mb-3 mt-8">
      API Details
    </h2>
    <article>
      To send messages Bar 3 requires your API key from Politics and War.
      To retrieve the key go to <a target="_blank" href="https://politicsandwar.com/account">the account page</a>.
      Additionally, you need to set how often you want to check for new nations. Just set the minutes to update in the second box.
    </article>

    <v-text-field
      label="API Key"
      class="mt-6"
      variant="outlined"
      v-model="apiKey"
      @input="changes()"
    />

    <v-text-field
      label="Minutes to Update"
      type="number"
      variant="outlined"
      v-model="minutesToUpdate"
      @input="changes()"
    />

    <h2 class="mb-3 mt-8">
      Analytics
    </h2>
    <article>
      Analytics, found on the analytics page on the navbar gives you insights into how many times your messages are viewed and how many times links inside them are clicked.
    </article>

    <v-checkbox
      label="Message Analytics"
      class="mb-16"
      v-model="analyticsEnabled"
      @change="changes()"
    />

    <div class="d-flex align-center">
      <h2 class="mb-3 mt-2">
        Your Message
      </h2>
      <v-btn
        class="ml-auto"
        color="primary"
        variant="outlined"
        @click="$router.push('/message-creator')"
      >
        Edit
      </v-btn>
    </div>
    <h5>
      Preview
    </h5>
    <preview-message :html-preview="config.messageHTML" class="preview"/>
    <saved-changes-card
      v-model="saveChangesOpen"
      @save="save()"
    />
  </div>
</template>

<script lang="ts">
  import { defineComponent } from 'vue';
  import getConfig from '@/actions/getConfig';
  import sendConfig from '@/actions/sendConfig';
  import { Config, DefaultConfig } from '@/types';
  import PreviewMessage from '@/components/PreviewMessage.vue';
  import SavedChangesCard from '@/components/SavedChangesCard.vue';

  export default defineComponent({
    name: 'ConfigurationView',
    components: {
      PreviewMessage,
      SavedChangesCard,
    },
    data() {
      return {
        config: new DefaultConfig() as Config,
        minutesToUpdate: 0,
        apiKey: '',
        analyticsEnabled: false,
        saveChangesOpen: false,
        error: false,
      };
    },
    methods: {
      async save() {
        const newConfig = {
          apiKey: this.apiKey,
          analyticsEnabled: this.analyticsEnabled,
          updatePeriodMilliseconds: this.minutesToUpdate * 60000
        };

        const res = await sendConfig(newConfig);
        Object.assign(this.config, newConfig);

        if (!res) {
          this.error = true;
          alert('Couldn\'t update config! Please try again and verify the server is running.');
        } else {
          this.saveChangesOpen = false;
        }
      },
      changes() {
        if (this.apiKey != this.config.apiKey) {
          this.saveChangesOpen = true;
          return;
        }

        if (this.minutesToUpdate != (this.config.updatePeriodMilliseconds || 0) / 60000) {
          this.saveChangesOpen = true;
          return;
        }

        if (this.analyticsEnabled != this.config.analyticsEnabled) {
          this.saveChangesOpen = true;
          return;
        }

        this.saveChangesOpen = false;
      },
    },
    async mounted() {
      const config = await getConfig();
      if (config && !(config instanceof Error)) {
        this.config = config;
        this.analyticsEnabled = config.analyticsEnabled || false;
        this.minutesToUpdate = (config.updatePeriodMilliseconds || 0) / 60000;
        this.apiKey = config.apiKey || '';
      } else {
        alert('Couldn\'t retrieve your config!');
      }
    },
  });
</script>

<style scoped>
  .preview {
    border-radius: 5px;
    padding: 10px;
    min-height: 200px;
    width: 100%;
    font-family: "Roboto",Arial;
    background: rgba(26, 26, 26, 0.85) !important;
backdrop-filter: blur(10px);
-webkit-backdrop-filter: blur(10px);
border: 1px solid rgba(255, 107, 0, 0.15) !important;
}

/* Section header styling */
h2 {
  letter-spacing: 0.04em;
  background: linear-gradient(
    90deg,
    #ffffff 0%,
    rgba(255, 149, 0, 0.85) 100%
  );
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

/* Text field focus glow */
:deep(.v-field--focused .v-field__outline) {
  box-shadow: 0 0 0 2px rgba(255, 107, 0, 0.2);
}
</style>
