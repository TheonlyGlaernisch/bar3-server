

<template>
  <div class="view-small-inner-wrapper view-padding-inner-wrapper">
    <div class="d-flex align-center mb-4">
      <h1 class="">{{ isAutomationPage ? 'Automation' : 'Message Creator' }}</h1>
      <v-btn
        v-if="!isAutomationPage"
        variant="outlined"
        color="primary"
        class="ml-auto"
        @click="testDialog = true"
      >
        Test
      </v-btn>
    </div>
    <update-available-banner/>
    <v-text-field
      v-if="!isAutomationPage"
      density="compact"
      variant="outlined"
      placeholder="Subject Line"
      maxlength="40"
      v-model="subject"
      @change="changes()"
      class="mt-4 mb-4"
    />
    <div v-if="!isAutomationPage" class="mt-2 mb-2">
      The editor allows you to easily create your own custom message. You can either choose between the Basic Editor with WYSIWYG controls,
      or the advanced editor with HTML and CSS. With both editors it is recommended you use the test button to try out sending a message before
      you turn on Bar 3 and send it to new nations. Finally, you can use two variables in your messages. Use <code>\(nation)</code> to substitute the
      nation name, and use <code>\(leader)</code> to substitute the leader name in your messages or subject line.
    </div>

    <v-card v-if="isAutomationPage" variant="outlined" class="pa-4 mt-4 mb-4">
      <h3 class="mb-3">Automation Bulk Send</h3>
      <div class="d-flex align-center flex-wrap" style="gap: 12px;">
        <v-text-field
          density="compact"
          variant="outlined"
          hide-details
          class="city-filter-input"
          type="number"
          min="0"
          v-model.number="minCities"
          label="Min Cities"
        />
        <v-text-field
          density="compact"
          variant="outlined"
          hide-details
          class="city-filter-input"
          type="number"
          min="0"
          v-model.number="maxCities"
          label="Max Cities"
        />
        <v-select
          density="compact"
          variant="outlined"
          hide-details
          class="discord-filter-select"
          :items="discordFilterOptions"
          item-title="label"
          item-value="value"
          v-model="discordFilterHasDiscord"
          label="Discord Filter"
        />
      </div>

      <div class="d-flex flex-wrap mt-3" style="gap: 12px;">
        <v-btn
          color="primary"
          :loading="bulkActionLoading === 'unallied'"
          :disabled="!!bulkActionLoading"
          @click="runUnalliedBulkSend"
        >
          Send to Active (24h) + No Alliance
        </v-btn>
        <v-btn
          color="primary"
          variant="outlined"
          :loading="bulkActionLoading === 'discord'"
          :disabled="!!bulkActionLoading"
          @click="runDiscordBulkSend"
        >
          Send to Discord Filter
        </v-btn>
      </div>

      <v-alert
        v-if="bulkError"
        type="error"
        density="compact"
        variant="outlined"
        class="mt-3 mb-0"
      >
        {{ bulkError }}
      </v-alert>

      <v-divider class="my-4" />

      <h3 class="mb-3">Send by Nation IDs</h3>
      <v-text-field
        density="compact"
        variant="outlined"
        v-model="nationIdsInput"
        label="Nation IDs (comma-separated)"
        placeholder="12345, 67890, 11223"
        hint="Enter one or more nation IDs separated by commas."
        persistent-hint
      />
      <v-btn
        color="primary"
        class="mt-2"
        :loading="bulkActionLoading === 'nation-ids'"
        :disabled="!!bulkActionLoading"
        @click="runNationIdSend()"
      >
        Send
      </v-btn>

      <div v-if="bulkPreview" class="mt-4">
        <h4 class="mb-1">Preview</h4>
        <div class="text-medium-emphasis">
          {{ bulkPreview.totalCandidates }} candidate{{ bulkPreview.totalCandidates === 1 ? '' : 's' }}
        </div>
        <v-list density="compact" class="preview-list mt-2">
          <v-list-item v-for="(row, idx) in bulkPreviewRows" :key="`preview-${idx}`" :title="row" />
          <v-list-item v-if="bulkPreviewRows.length === 0" class="text-medium-emphasis" title="No preview rows returned." />
        </v-list>
      </div>

      <div v-if="bulkResult" class="mt-4">
        <h4 class="mb-1">Last Send Result</h4>
        <div>Attempted: {{ bulkResult.attempted }}</div>
        <div>Sent: {{ bulkResult.sent }}</div>
        <div>Failed: {{ bulkResult.failed }}</div>
        <v-list density="compact" v-if="bulkResultFailures.length > 0" class="preview-list mt-2">
          <v-list-subheader>Failures (first {{ bulkResultFailures.length }})</v-list-subheader>
          <v-list-item v-for="(failure, idx) in bulkResultFailures" :key="`failure-${idx}`" :title="failure" />
        </v-list>
      </div>
    </v-card>

    <div v-else class="editor-tabs-wrapper mt-2" style="margin-bottom: 200px">
      <v-tabs
        v-model="editorTab"
        class="editor-tabs"
        :direction="mdAndUp ? 'vertical' : 'horizontal'"
        show-arrows
        @update:modelValue="changes()"
      >
        <v-tab :value="0" class="editor-tab">
          Basic Editor
        </v-tab>
        <v-tab :value="1" class="editor-tab">
          Advanced Editor
        </v-tab>
      </v-tabs>

      <v-window v-model="editorTab" class="editor-tabs-window mt-2">
        <v-window-item :value="0">
          <message-creator
            @change="messageHTML.quill = $event; changes()"
            :inputHTML="config.messageHTML"
          />
        </v-window-item>
        <v-window-item :value="1">
          <advanced-message-creator
            @change="messageHTML.advanced = $event; changes()"
            :inputHTML="config.advancedRaw.html"
            :inputCSS="config.advancedRaw.css"
            @html="advancedRaw.html = $event; changes()"
            @css="advancedRaw.css = $event; changes()"
          />
        </v-window-item>
      </v-window>
    </div>
    <saved-changes-card
      v-if="!isAutomationPage"
      v-model="saveChangesOpen"
      @save="save($event)"
    />
    <test-message-dialog v-model="testDialog" @send="testMessage($event)"/>
    <confirm-dialog
  v-model="confirmDialogOpen"
  :message="confirmDialogMessage"
  @confirm="handleConfirmDialogResponse"
/>
  </div>
</template>

<script lang="ts">
import { computed, defineComponent, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useStore } from 'vuex';
import { useDisplay } from 'vuetify';
import getConfig from '@/actions/getConfig';
import sendConfig from '@/actions/sendConfig';
import { Config, DefaultConfig } from '@/types';
import MessageCreator from '@/components/MessageCreator.vue';
import AdvancedMessageCreator from '@/components/AdvancedMessageCreator.vue';
import SavedChangesCard from '@/components/SavedChangesCard.vue';
import TestMessageDialog from '@/components/TestMessageDialog.vue';
import sendMessage from '@/actions/sendMessage';
import UpdateAvailableBanner from '@/components/UpdateAvailableBanner.vue';
import { hasV2Credentials, v2Api } from '@/utilities/v2Api';
import ConfirmDialog from '@/components/ConfirmDialog.vue';

export default defineComponent({
  name: 'MessageDesignerView',
  components: {
    MessageCreator,
    AdvancedMessageCreator,
    SavedChangesCard,
    TestMessageDialog,
    UpdateAvailableBanner,
    ConfirmDialog,
  },
  setup() {
    const route = useRoute();
    const store = useStore();
    const { mdAndUp } = useDisplay();

    const config = ref<Config>(new DefaultConfig());
    const messageHTML = ref({
      quill: '',
      advanced: '',
    });
    const advancedRaw = ref({
      html: '',
      css: '',
    });
    const editorTab = ref(0);
    const subject = ref('');
    const saveChangesOpen = ref(false);
    const error = ref(false);
    const testDialog = ref(false);
    const bulkActionLoading = ref<null | 'unallied' | 'discord' | 'nation-ids'>(null);
    const discordFilterHasDiscord = ref(true);
    const nationIdsInput = ref('');
    const minCities = ref<number | null>(null);
    const maxCities = ref<number | null>(null);
    const bulkPreview = ref<null | { totalCandidates: number; previewRows: any[] }>(null);
    const bulkResult = ref<null | { attempted: number; sent: number; failed: number; failures: any[] }>(null);
    const bulkError = ref('');
    const confirmDialogOpen = ref(false);
    const confirmDialogMessage = ref('');
    const confirmDialogResolve = ref<((value: boolean) => void) | null>(null);

    const discordFilterOptions = [
      { label: 'Has Discord', value: true },
      { label: 'No Discord', value: false },
    ];

    const isAutomationPage = computed(() => route.path === '/automation');
    const bulkPreviewRows = computed(() => (bulkPreview.value?.previewRows || []).slice(0, 15).map((row: any) => formatNationRow(row)));
    const bulkResultFailures = computed(() => (bulkResult.value?.failures || []).slice(0, 5).map((row: any) => {
      const nation = row?.nation || row?.nationName || row?.leader || row?.id || 'Unknown nation';
      const errorMsg = row?.error || row?.reason || 'Unknown error';
      return `${nation}: ${errorMsg}`;
    }));

    const changes = () => {
      if (isAutomationPage.value) {
        saveChangesOpen.value = false;
        return;
      }

      if (editorTab.value === 0 && messageHTML.value.quill !== config.value.messageHTML) {
        saveChangesOpen.value = true;
        return;
      }

      if (
        editorTab.value === 1 &&
        (
          advancedRaw.value.html !== (config.value.advancedRaw && config.value.advancedRaw.html) ||
          advancedRaw.value.css !== (config.value.advancedRaw && config.value.advancedRaw.css)
        )
      ) {
        saveChangesOpen.value = true;
        return;
      }

      if (subject.value !== config.value.messageSubject) {
        saveChangesOpen.value = true;
        return;
      }

      const selectedEditor = editorTab.value === 1 ? 1 : 0;
      if (editorTab.value !== 0 && selectedEditor !== config.value.currentEditor) {
        saveChangesOpen.value = true;
        return;
      }

      saveChangesOpen.value = false;
    };

    const save = async () => {
      if (!store.getters.isLoggedIn) {
        alert('You must log in (Account tab) before saving to the cloud.');
        return;
      }

      const selectedEditor = editorTab.value === 1 ? 1 : 0;
      const newConfig = {
        messageSubject: subject.value,
        messageHTML: selectedEditor === 0 ? messageHTML.value.quill : messageHTML.value.advanced,
        advancedRaw: {
          html: advancedRaw.value.html,
          css: advancedRaw.value.css,
        },
        currentEditor: selectedEditor,
      };

      const res = await sendConfig(newConfig);
      Object.assign(config.value, newConfig);

      if (!res) {
        error.value = true;
        alert('Couldn\'t update config! Please try again and verify the server is running.');
      } else {
        saveChangesOpen.value = false;
      }

      // v2 per-user template save (MongoDB). This is what automation uses.
      if (!hasV2Credentials()) {
        alert('To save your auto-message to MongoDB, go to Account and log in first.');
        return;
      }

      try {
        await v2Api.upsertTemplate({
          subject: subject.value,
          bodyHtml: selectedEditor === 0 ? messageHTML.value.quill : advancedRaw.value.html,
          bodyCss: selectedEditor === 0 ? undefined : advancedRaw.value.css,
          bodyText: undefined,
          currentEditor: selectedEditor,
        });
      } catch {
        alert('Saved locally, but failed to save to MongoDB. Please try again.');
      }
    };

    const testMessage = async (nationDetails: {nationName: string; nationID: string; leaderName: string}) => {
      const selectedEditor = editorTab.value === 1 ? 1 : 0;
      const success = await sendMessage(selectedEditor === 0 ? messageHTML.value.quill : messageHTML.value.advanced, nationDetails);
      if (!success) alert('Couldn\'t send your message!');
    };

    const formatNationRow = (row: any): string => {
      if (!row || typeof row !== 'object') return String(row);
      const nation = row.nation || row.nationName || row.name || row.nation_id || row.id;
      const leader = row.leader || row.leaderName;
      const discord = row.discord || row.hasDiscord;
      const cities = row.cities;
      const pieces = [nation ? `Nation: ${nation}` : '', leader ? `Leader: ${leader}` : ''].filter(Boolean);
      if (typeof cities === 'number') {
        pieces.push(`Cities: ${cities}`);
      }
      if (discord !== undefined && discord !== null) {
        pieces.push(`Discord: ${discord ? 'Yes' : 'No'}`);
      }
      return pieces.length > 0 ? pieces.join(' | ') : JSON.stringify(row);
    };

    const normalizePreview = (data: any): { totalCandidates: number; previewRows: any[] } => {
      const previewRows = data?.preview || data?.candidates || data?.rows || [];
      const totalCandidates = Number(data?.totalCandidates ?? previewRows.length ?? 0);
      return {
        totalCandidates,
        previewRows: Array.isArray(previewRows) ? previewRows : [],
      };
    };

    const normalizeResult = (data: any): { attempted: number; sent: number; failed: number; failures: any[] } => ({
      attempted: Number(data?.attempted || 0),
      sent: Number(data?.sent || 0),
      failed: Number(data?.failed || 0),
      failures: Array.isArray(data?.failures) ? data.failures : [],
    });

    const getCityPayload = (): { minCities?: number; maxCities?: number } => {
      const payload: { minCities?: number; maxCities?: number } = {};
      if (typeof minCities.value === 'number' && Number.isFinite(minCities.value)) {
        payload.minCities = minCities.value;
      }
      if (typeof maxCities.value === 'number' && Number.isFinite(maxCities.value)) {
        payload.maxCities = maxCities.value;
      }
      return payload;
    };

    const hasValidCityRange = (): boolean => {
      if (typeof minCities.value === 'number' && minCities.value < 0) return false;
      if (typeof maxCities.value === 'number' && maxCities.value < 0) return false;
      if (typeof minCities.value === 'number' && typeof maxCities.value === 'number' && minCities.value > maxCities.value) {
        return false;
      }
      return true;
    };

    const showConfirmDialog = (message: string): Promise<boolean> => new Promise((resolve) => {
      confirmDialogMessage.value = message;
      confirmDialogResolve.value = resolve;
      confirmDialogOpen.value = true;
    });

    const handleConfirmDialogResponse = (confirmed: boolean) => {
      if (confirmDialogResolve.value) {
        confirmDialogResolve.value(confirmed);
        confirmDialogResolve.value = null;
      }
    };

    const runBulkSend = async (mode: 'unallied' | 'discord') => {
      bulkActionLoading.value = mode;
      bulkResult.value = null;
      bulkError.value = '';
      try {
        if (!hasV2Credentials()) {
          bulkError.value = 'Unauthorized: please log in from Account with your Politics & War API key.';
          return;
        }

        if (!hasValidCityRange()) {
          bulkError.value = 'Invalid city filter. Ensure min/max are >= 0 and min is not greater than max.';
          return;
        }

        const cityPayload = getCityPayload();
        const previewResponse = mode === 'unallied'
          ? await v2Api.sendActiveUnallied({ dryRun: true, ...cityPayload })
          : await v2Api.sendActiveUnalliedDiscord({ dryRun: true, hasDiscord: discordFilterHasDiscord.value, ...cityPayload });

        bulkPreview.value = normalizePreview(previewResponse);
        const confirmed = await showConfirmDialog(`Send to ${bulkPreview.value.totalCandidates} nations?`);
        if (!confirmed) return;

        const sendResponse = mode === 'unallied'
          ? await v2Api.sendActiveUnallied({ dryRun: false, ...cityPayload })
          : await v2Api.sendActiveUnalliedDiscord({ dryRun: false, hasDiscord: discordFilterHasDiscord.value, ...cityPayload });

        bulkResult.value = normalizeResult(sendResponse);
      } catch (e) {
        const message = typeof e === 'object' && e !== null && 'message' in e ? String((e as any).message) : 'Request failed';
        if (message.includes('Failed to fetch target nations from Politics & War API')) {
          bulkError.value = 'Failed to fetch target nations from Politics & War API. Please retry in a moment. If this persists, contact the server admin to verify backend Politics & War lookup configuration.';
        } else {
          bulkError.value = message;
        }
      } finally {
        bulkActionLoading.value = null;
      }
    };

    const runUnalliedBulkSend = () => {
      runBulkSend('unallied');
    };

    const runDiscordBulkSend = () => {
      runBulkSend('discord');
    };

    const parseNationIds = (): number[] => nationIdsInput.value
      .split(/[,\n\r\t ]+/)
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isInteger(value) && value > 0);

    const runNationIdSend = async () => {
      bulkActionLoading.value = 'nation-ids';
      bulkResult.value = null;
      bulkError.value = '';
      try {
        if (!hasV2Credentials()) {
          bulkError.value = 'Unauthorized: please log in from Account with your Politics & War API key.';
          return;
        }

        const nationIds = parseNationIds();
        if (nationIds.length === 0) {
          bulkError.value = 'Enter at least one valid nation ID separated by commas.';
          return;
        }

        const nationIdsCsv = nationIds.join(',');
        const previewResponse = await v2Api.sendByNationIds({ dryRun: true, nationIds: nationIdsCsv });
        bulkPreview.value = normalizePreview(previewResponse);

        const confirmed = await showConfirmDialog(`Send to ${bulkPreview.value.totalCandidates} nations?`);
        if (!confirmed) return;

        const sendResponse = await v2Api.sendByNationIds({ dryRun: false, nationIds: nationIdsCsv });
        bulkResult.value = normalizeResult(sendResponse);
      } catch (e) {
        const message = typeof e === 'object' && e !== null && 'message' in e ? String((e as any).message) : 'Request failed';
        bulkError.value = message;
      } finally {
        bulkActionLoading.value = null;
      }
    };

    watch(
      () => route.path,
      () => {
        if (isAutomationPage.value) {
          saveChangesOpen.value = false;
          return;
        }
        editorTab.value = config.value.currentEditor || 0;
        changes();
      }
    );

    onMounted(async () => {
      const loadedConfig = await getConfig();
      if (loadedConfig && !(loadedConfig instanceof Error)) {
        advancedRaw.value.html = (loadedConfig.advancedRaw && loadedConfig.advancedRaw.html) || '';
        advancedRaw.value.css = (loadedConfig.advancedRaw && loadedConfig.advancedRaw.css) || '';
        messageHTML.value.quill = loadedConfig.messageHTML || '';
        subject.value = loadedConfig.messageSubject || '';
        config.value = loadedConfig;
        editorTab.value = route.path === '/automation' ? 0 : (loadedConfig.currentEditor || 0);
        changes();
      } else {
        alert('Couldn\'t retrieve your config!');
      }
    });

    return {
      config,
      messageHTML,
      advancedRaw,
      editorTab,
      subject,
      saveChangesOpen,
      error,
      testDialog,
      bulkActionLoading,
      discordFilterHasDiscord,
      nationIdsInput,
      minCities,
      maxCities,
      bulkPreview,
      bulkResult,
      bulkError,
      confirmDialogOpen,
      confirmDialogMessage,
      discordFilterOptions,
      bulkPreviewRows,
      bulkResultFailures,
      isAutomationPage,
      mdAndUp,
      changes,
      save,
      testMessage,
      runUnalliedBulkSend,
      runDiscordBulkSend,
      runNationIdSend,
      handleConfirmDialogResponse,
    };
  },
});
</script>

<style>
  .save-changes-card {
    position: fixed;
    bottom: 50px;
    right: 50px;
    width: 300px;
  }

  @media only screen and (max-width: 450px) {
    .save-changes-card {
      width: calc(100% - 20px);
      right: 10px;
      left: 10px;
    }
  }
</style>

<style scoped>
.discord-filter-select {
  max-width: 260px;
  min-width: 220px;
}

.city-filter-input {
  max-width: 150px;
}

.preview-list {
  max-height: 220px;
  overflow-y: auto;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 4px;
}

.editor-tabs-wrapper {
  width: 100%;
}

.editor-tabs {
  width: 100%;
}

.editor-tabs-window {
  width: 100%;
}

@media only screen and (max-width: 959px) {
  .editor-tabs :deep(.v-slide-group__wrapper) {
    overflow-x: auto;
    scroll-snap-type: x proximity;
    -webkit-overflow-scrolling: touch;
  }

  .editor-tabs :deep(.v-tab) {
    scroll-snap-align: start;
    white-space: nowrap;
  }
}
</style>

<style>
  .slideup-enter-active, .slideup-leave-active {
    transition: bottom 0.2s ease-out
  }
  .slideup-enter, .slideup-leave-to {
    bottom: -200px;
  }
</style>
