<template>
  <div class="pa-4">
    <div class="text-h5 text-white font-weight-medium mb-6">
      <v-icon color="primary" class="mr-2">mdi-robot</v-icon>
      Bot Panel
    </div>

    <!-- Send message section -->
    <v-card color="#1A1A1A" class="mb-6 pa-4">
      <div class="text-subtitle-1 text-white font-weight-medium mb-3">
        <v-icon size="small" class="mr-1">mdi-send</v-icon>
        Send Bot Message
      </div>
      <v-textarea
        v-model="messageContent"
        label="Message content"

        density="compact"
        variant="outlined"
        color="primary"
        rows="3"
        auto-grow
        :disabled="sendLoading"
        class="mb-2"
      />
      <v-alert v-if="sendError" type="error" density="compact" class="mb-2">{{ sendError }}</v-alert>
      <v-alert v-if="sendSuccess" type="success" density="compact" class="mb-2">Message sent!</v-alert>
      <v-btn
        color="primary"
        :loading="sendLoading"
        :disabled="!messageContent.trim()"
        @click="sendMessage"
      >
        <v-icon class="mr-1">mdi-send</v-icon>
        Send
      </v-btn>
    </v-card>

    <!-- Banking section -->
    <v-card color="#1A1A1A" class="mb-6 pa-4">
      <div class="d-flex align-center justify-space-between flex-wrap ga-3 mb-3">
        <div>
          <div class="text-subtitle-1 text-white font-weight-medium">
            <v-icon size="small" class="mr-1">mdi-bank</v-icon>
            Discord Banking
          </div>
          <div class="text-medium-emphasis caption">
            Enable or disable banking commands and offshore automation for guilds managed by the bot.
          </div>
        </div>
        <v-switch
          v-model="bankingEnabled"
          color="primary"
          hide-details
          inset
          :loading="bankingLoading || bankingSaving"
          :disabled="bankingLoading || bankingSaving"
          :label="bankingEnabled ? 'Enabled' : 'Disabled'"
          @update:model-value="updateBankingEnabled"
        />
      </div>
      <v-alert v-if="bankingError" type="error" density="compact" class="mb-2">{{ bankingError }}</v-alert>
      <v-alert v-if="bankingSuccess" type="success" density="compact" class="mb-2">Banking setting updated.</v-alert>
      <div v-if="Object.keys(bankingEnabledByGuild).length" class="text-medium-emphasis caption">
        Per-server status:
        <span v-for="(enabled, guildId) in bankingEnabledByGuild" :key="guildId" class="mr-3">
          <code>{{ guildId }}</code>: {{ enabled ? 'enabled' : 'disabled' }}
        </span>
      </div>
    </v-card>

    <!-- Alliance pool withdraw section -->
    <v-card color="#1A1A1A" class="mb-6 pa-4">
      <div class="text-subtitle-1 text-white font-weight-medium mb-1">
        <v-icon size="small" class="mr-1">mdi-cash-multiple</v-icon>
        Alliance Pool Withdraw
      </div>
      <div class="text-medium-emphasis caption mb-3">
        Withdraw from the alliance's unassigned pool balance (unregistered-nation deposits) to a nation.
      </div>
      <v-text-field
        v-model="poolWithdrawNationId"
        label="Destination nation ID"
        type="number"
        min="1"
        density="compact"
        variant="outlined"
        class="mb-2"
        hide-details
      />
      <v-row dense>
        <v-col v-for="key in resourceKeys" :key="key" cols="6" sm="4" md="3">
          <v-text-field
            v-model.number="poolWithdrawAmounts[key]"
            :label="key.charAt(0).toUpperCase() + key.slice(1)"
            type="number"
            min="0"
            density="compact"
            variant="outlined"
            hide-details
          />
        </v-col>
      </v-row>
      <v-alert v-if="poolWithdrawError" type="error" density="compact" class="mt-3">{{ poolWithdrawError }}</v-alert>
      <v-alert v-if="poolWithdrawSuccess" type="success" density="compact" class="mt-3">Withdrawal completed.</v-alert>
      <v-btn
        color="primary"
        class="mt-3"
        :loading="poolWithdrawLoading"
        :disabled="poolWithdrawLoading || !poolWithdrawNationId || !hasPositivePoolWithdrawAmount"
        @click="submitPoolWithdraw"
      >
        <v-icon class="mr-1">mdi-cash-fast</v-icon>
        Withdraw
      </v-btn>
    </v-card>

    <!-- Servers section -->
    <v-card color="#1A1A1A" class="mb-6 pa-4">
      <div class="text-subtitle-1 text-white font-weight-medium mb-3">
        <v-icon size="small" class="mr-1">mdi-server</v-icon>
        Servers
      </div>
      <div v-if="serversLoading" class="d-flex justify-center py-4">
        <v-progress-circular indeterminate color="primary" />
      </div>
      <v-alert v-else-if="serversError" type="error" density="compact">{{ serversError }}</v-alert>
      <v-list v-else-if="servers.length" density="compact" color="transparent">
        <v-list-item v-for="server in servers" :key="server.id" class="px-0">
          <template #prepend>
            <v-avatar size="36" color="#2a2a2a">
              <v-img v-if="server.icon" :src="serverIconUrl(server)" />
              <v-icon v-else size="small">mdi-discord</v-icon>
            </v-avatar>
          </template>
          <div>
            <v-list-item-title class="text-white">{{ server.name }}</v-list-item-title>
            <v-list-item-subtitle>{{ server.memberCount.toLocaleString() }} members</v-list-item-subtitle>
          </div>
        </v-list-item>
      </v-list>
      <div v-else class="text-medium-emphasis caption">No servers found.</div>
    </v-card>

    <!-- Command usage section -->
    <v-card color="#1A1A1A" class="pa-4">
      <div class="text-subtitle-1 text-white font-weight-medium mb-3">
        <v-icon size="small" class="mr-1">mdi-slash-forward-box</v-icon>
        Most Used Commands
      </div>
      <div v-if="commandsLoading" class="d-flex justify-center py-4">
        <v-progress-circular indeterminate color="primary" />
      </div>
      <v-alert v-else-if="commandsError" type="error" density="compact">{{ commandsError }}</v-alert>
      <v-list v-else-if="commands.length" density="compact" color="transparent">
        <v-list-item v-for="cmd in commands" :key="cmd.name" class="px-0">
          <div>
            <v-list-item-title class="text-white">
              <span class="text-primary font-weight-bold">/{{ cmd.name }}</span>
              <span class="text-medium-emphasis caption ml-2">{{ cmd.description }}</span>
            </v-list-item-title>
          </div>
          <template #append>
            <v-chip size="small" color="primary">{{ cmd.usageCount.toLocaleString() }}</v-chip>
          </template>
        </v-list-item>
      </v-list>
      <div v-else class="text-medium-emphasis caption">No command usage data found.</div>
    </v-card>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { botApi, BotServer, BotCommand, BotBankingEnabledState } from '@/utilities/botApi';

const RESOURCE_KEYS = ['money', 'food', 'coal', 'oil', 'uranium', 'iron', 'bauxite', 'lead', 'gasoline', 'munitions', 'steel', 'aluminum'];

export default defineComponent({
  name: 'BotPanel',
  data() {
    return {
      // Send message
      messageContent: '',
      sendLoading: false,
      sendError: '',
      sendSuccess: false,

      // Banking
      bankingEnabled: false,
      bankingEnabledByGuild: {} as Record<string, boolean>,
      bankingLoading: false,
      bankingSaving: false,
      bankingError: '',
      bankingSuccess: false,

      // Alliance pool withdraw
      resourceKeys: RESOURCE_KEYS,
      poolWithdrawNationId: '',
      poolWithdrawAmounts: {} as Record<string, number | null>,
      poolWithdrawLoading: false,
      poolWithdrawError: '',
      poolWithdrawSuccess: false,

      // Servers
      servers: [] as BotServer[],
      serversLoading: false,
      serversError: '',

      // Commands
      commands: [] as BotCommand[],
      commandsLoading: false,
      commandsError: '',
    };
  },
  computed: {
    hasPositivePoolWithdrawAmount(): boolean {
      return Object.values(this.poolWithdrawAmounts).some((amount) => typeof amount === 'number' && amount > 0);
    },
  },
  async created() {
    await Promise.all([this.loadServers(), this.loadCommands(), this.loadBankingEnabled()]);
  },
  methods: {
    serverIconUrl(server: BotServer): string {
      if (!server.icon || server.icon.includes('{')) return '';
      if (/^https?:\/\//.test(server.icon)) return server.icon;
      return `https://cdn.discordapp.com/icons/${server.id}/${server.icon}.png?size=64`;
    },
    applyBankingState(state: BotBankingEnabledState) {
      this.bankingEnabledByGuild = state.enabledByGuild ?? {};
      if (typeof state.enabled === 'boolean') {
        this.bankingEnabled = state.enabled;
        return;
      }
      const values = Object.values(this.bankingEnabledByGuild);
      this.bankingEnabled = values.length > 0 && values.every(Boolean);
    },
    async loadBankingEnabled() {
      this.bankingLoading = true;
      this.bankingError = '';
      try {
        this.applyBankingState(await botApi.getBankingEnabled());
      } catch (e) {
        this.bankingError = (e as any)?.message || 'Failed to load banking status';
      } finally {
        this.bankingLoading = false;
      }
    },
    async updateBankingEnabled(value: boolean | null) {
      const enabled = value === true;
      this.bankingSaving = true;
      this.bankingError = '';
      this.bankingSuccess = false;
      try {
        this.applyBankingState(await botApi.setBankingEnabled(enabled));
        this.bankingSuccess = true;
      } catch (e) {
        this.bankingError = (e as any)?.message || 'Failed to update banking status';
        await this.loadBankingEnabled();
      } finally {
        this.bankingSaving = false;
      }
    },
    async loadServers() {
      this.serversLoading = true;
      this.serversError = '';
      try {
        this.servers = await botApi.getServers();
      } catch (e) {
        this.serversError = (e as any)?.message || 'Failed to load servers';
      } finally {
        this.serversLoading = false;
      }
    },
    async loadCommands() {
      this.commandsLoading = true;
      this.commandsError = '';
      try {
        this.commands = await botApi.getCommandUsage();
      } catch (e) {
        this.commandsError = (e as any)?.message || 'Failed to load command usage';
      } finally {
        this.commandsLoading = false;
      }
    },
    async sendMessage() {
      if (!this.messageContent.trim()) return;
      this.sendLoading = true;
      this.sendError = '';
      this.sendSuccess = false;
      try {
        await botApi.sendMessage(this.messageContent.trim());
        this.sendSuccess = true;
        this.messageContent = '';
      } catch (e) {
        this.sendError = (e as any)?.message || 'Failed to send message';
      } finally {
        this.sendLoading = false;
      }
    },
    async submitPoolWithdraw() {
      this.poolWithdrawError = '';
      this.poolWithdrawSuccess = false;
      const nationId = parseInt(this.poolWithdrawNationId, 10);
      if (!Number.isInteger(nationId) || nationId <= 0) {
        this.poolWithdrawError = 'Destination nation ID must be a positive integer.';
        return;
      }
      const resources: Record<string, number> = {};
      for (const key of this.resourceKeys) {
        const amount = this.poolWithdrawAmounts[key];
        if (typeof amount === 'number' && amount > 0) resources[key] = amount;
      }
      if (Object.keys(resources).length === 0) {
        this.poolWithdrawError = 'Enter at least one resource amount greater than zero.';
        return;
      }
      this.poolWithdrawLoading = true;
      try {
        await botApi.allianceBankPoolWithdraw(nationId, resources);
        this.poolWithdrawSuccess = true;
        this.poolWithdrawAmounts = {};
        this.poolWithdrawNationId = '';
      } catch (e) {
        this.poolWithdrawError = (e as any)?.message || 'Failed to withdraw from alliance pool';
      } finally {
        this.poolWithdrawLoading = false;
      }
    },
  },
});
</script>
