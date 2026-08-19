<template>
  <div class="view-small-inner-wrapper view-padding-inner-wrapper">
    <h1>Banking</h1>
    <div class="d-flex align-center mt-4 mb-4">
      <v-btn color="primary" size="small" :loading="loading" :disabled="loading || !canRefresh" @click="refresh">
        <v-icon class="mr-1" size="small">mdi-refresh</v-icon>
        Refresh
      </v-btn>
      <span class="ml-3 caption text-grey-lighten-1">{{ cacheText }}</span>
    </div>

    <div v-if="loading" class="d-flex justify-center py-6">
      <v-progress-circular indeterminate color="primary" />
    </div>
    <v-alert v-else-if="error" type="error" density="compact">{{ error }}</v-alert>
    <v-card v-else-if="!context.registered" class="info-card pa-4">
      <div class="text-subtitle-1 text-white font-weight-medium mb-2">No registered nation found</div>
      <div class="text-body-2">Link your Discord account with <code>/register</code></div>
    </v-card>
    <v-card v-else-if="!context.alliance" class="info-card pa-4">
      <div class="text-subtitle-1 text-white font-weight-medium">No alliance found for your nation</div>
    </v-card>
    <v-card v-else-if="!context.banking" class="info-card pa-4">
      <div class="text-subtitle-1 text-white font-weight-medium">No banking data available</div>
    </v-card>
    <v-container v-else fluid class="pa-0">
      <v-row dense>
        <!-- Balance -->
        <v-col cols="12" md="6">
          <v-card class="info-card h-100">
            <div class="card-header">
              <v-icon size="small" class="mr-1">mdi-bank</v-icon>
              Offshore Balance
            </div>
            <div class="card-content">
              <div v-if="nonZeroBalanceEntries.length" class="balance-grid">
                <div v-for="[key, amount] in nonZeroBalanceEntries" :key="key" class="balance-item">
                  <div class="stat-label">{{ formatResourceLabel(key) }}</div>
                  <div class="stat-number balance-amount">{{ amount.toLocaleString() }}</div>
                </div>
              </div>
              <div v-else class="history-message">No balance on record.</div>
            </div>
          </v-card>
        </v-col>

        <!-- Last Activity -->
        <v-col cols="12" md="6">
          <v-card class="info-card h-100">
            <div class="card-header">Last Activity</div>
            <div class="card-content">
              <template v-if="context.banking.lastActivity">
                <div class="info-label">Type</div>
                <div class="info-value">{{ context.banking.lastActivity.type }}</div>
                <div class="info-label mt-3">Status</div>
                <div class="info-value">
                  <v-chip size="small" :color="statusColor(context.banking.lastActivity.status)" variant="tonal">
                    {{ context.banking.lastActivity.status }}
                  </v-chip>
                </div>
                <div class="info-label mt-3">Updated</div>
                <div class="info-value">{{ new Date(context.banking.lastActivity.updatedAt).toLocaleString() }}</div>
              </template>
              <div v-else class="history-message">No recent banking activity.</div>
            </div>
          </v-card>
        </v-col>

        <!-- Withdraw -->
        <v-col cols="12">
          <v-card class="info-card mt-6">
            <div class="card-header">
              <v-icon size="small" class="mr-1">mdi-cash-fast</v-icon>
              Withdraw
            </div>
            <div class="card-content">
              <v-row dense>
                <v-col v-for="key in resourceKeys" :key="key" cols="6" sm="4" md="3">
                  <v-text-field
                    v-model.number="withdrawAmounts[key]"
                    :label="formatResourceLabel(key)"
                    type="number"
                    min="0"
                    density="compact"
                    variant="outlined"
                    hide-details
                  />
                </v-col>
              </v-row>
              <v-text-field
                v-model="withdrawDestinationNationId"
                label="Send to a different nation ID (optional — defaults to your own)"
                type="number"
                min="1"
                density="compact"
                variant="outlined"
                class="mt-4"
                hide-details
              />
              <v-alert v-if="withdrawError" type="error" density="compact" class="mt-3">{{ withdrawError }}</v-alert>
              <v-alert v-if="withdrawSuccess" type="success" density="compact" class="mt-3">Withdrawal completed.</v-alert>
              <v-btn
                color="primary"
                class="mt-4"
                :loading="withdrawLoading"
                :disabled="withdrawLoading || !hasPositiveWithdrawAmount"
                @click="submitWithdraw"
              >
                <v-icon class="mr-1">mdi-cash-fast</v-icon>
                Withdraw
              </v-btn>
            </div>
          </v-card>
        </v-col>
      </v-row>
    </v-container>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { getMemberNationContext, MemberNationContextResponse, withdrawFunds } from '@/utilities/memberNationApi';

type BankingViewContext = MemberNationContextResponse;

const RESOURCE_KEYS = ['money', 'food', 'coal', 'oil', 'uranium', 'iron', 'bauxite', 'lead', 'gasoline', 'munitions', 'steel', 'aluminum'];

export default defineComponent({
  name: 'BankingView',
  data() {
    return {
      loading: false,
      error: '',
      context: {
        registered: false,
        nation: null,
        alliance: null,
        activeDefensiveWars: [],
        nationDefensiveWars: [],
        counterRequests: [],
      } as BankingViewContext,

      // Withdraw form
      resourceKeys: RESOURCE_KEYS,
      withdrawAmounts: {} as Record<string, number | null>,
      withdrawDestinationNationId: '',
      withdrawLoading: false,
      withdrawError: '',
      withdrawSuccess: false,
    };
  },
  computed: {
    canRefresh(): boolean {
      return this.context.cache?.canRefreshNow !== false;
    },
    cacheText(): string {
      if (!this.context.cache?.cachedAt) return 'Not loaded yet';
      const source = this.context.cache.source === 'cache' ? 'cached' : 'fresh';
      const nextRefresh = this.context.cache.nextRefreshAt ? new Date(this.context.cache.nextRefreshAt).toLocaleTimeString() : '';
      if (this.context.cache.canRefreshNow) {
        return `Last updated ${new Date(this.context.cache.cachedAt).toLocaleTimeString()} (${source})`;
      }
      return `Last updated ${new Date(this.context.cache.cachedAt).toLocaleTimeString()} (${source}) · refresh after ${nextRefresh}`;
    },
    nonZeroBalanceEntries(): Array<[string, number]> {
      const balance = this.context.banking?.nationBalance ?? {};
      return Object.entries(balance).filter(([, amount]) => Number(amount) > 0) as Array<[string, number]>;
    },
    hasPositiveWithdrawAmount(): boolean {
      return Object.values(this.withdrawAmounts).some((amount) => typeof amount === 'number' && amount > 0);
    },
  },
  async mounted() {
    await this.load(false);
  },
  methods: {
    async refresh() {
      await this.load(true);
    },
    async load(refresh: boolean) {
      this.loading = true;
      this.error = '';
      try {
        this.context = await getMemberNationContext(refresh);
      } catch (e) {
        this.error = e instanceof Error ? e.message : 'Failed to load banking information';
      } finally {
        this.loading = false;
      }
    },
    formatResourceLabel(key: string): string {
      return key.charAt(0).toUpperCase() + key.slice(1);
    },
    statusColor(status: string): string {
      const normalized = status.toLowerCase();
      if (normalized.includes('complete') || normalized.includes('success')) return 'success';
      if (normalized.includes('fail') || normalized.includes('error') || normalized.includes('reject')) return 'error';
      if (normalized.includes('pending') || normalized.includes('progress')) return 'warning';
      return 'primary';
    },
    async submitWithdraw() {
      this.withdrawError = '';
      this.withdrawSuccess = false;
      const resources: Record<string, number> = {};
      for (const key of this.resourceKeys) {
        const amount = this.withdrawAmounts[key];
        if (typeof amount === 'number' && amount > 0) resources[key] = amount;
      }
      if (Object.keys(resources).length === 0) {
        this.withdrawError = 'Enter at least one resource amount greater than zero.';
        return;
      }
      const destinationNationId = this.withdrawDestinationNationId
        ? parseInt(this.withdrawDestinationNationId, 10)
        : null;
      if (this.withdrawDestinationNationId && (!Number.isInteger(destinationNationId) || (destinationNationId ?? 0) <= 0)) {
        this.withdrawError = 'Destination nation ID must be a positive integer.';
        return;
      }
      this.withdrawLoading = true;
      try {
        await withdrawFunds(resources, destinationNationId);
        this.withdrawSuccess = true;
        this.withdrawAmounts = {};
        this.withdrawDestinationNationId = '';
        await this.load(true);
      } catch (e) {
        this.withdrawError = e instanceof Error ? e.message : 'Failed to withdraw funds';
      } finally {
        this.withdrawLoading = false;
      }
    },
  },
});
</script>

<style scoped>
.info-card {
  border-radius: 10px !important;
  background: #1a1a1a !important;
  border: 1px solid #2a2a2a !important;
  box-shadow: none !important;
  transition: border-color 0.2s ease;
}

.info-card:hover {
  border-color: #3a3a3a !important;
}

.card-header {
  font-size: 0.95rem;
  font-weight: 600;
  color: #FF9500;
  padding: 14px 16px 10px;
  border-bottom: 1px solid #2a2a2a;
  letter-spacing: 0.02em;
  display: flex;
  align-items: center;
}

.card-content {
  padding: 16px;
}

.info-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.info-value {
  font-size: 0.95rem;
  color: #e8e8e8;
  margin-top: 4px;
  word-break: break-word;
}

.stat-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.stat-number {
  font-size: 1.25rem;
  font-weight: 700;
  color: #FF6B00;
}

.balance-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 16px;
}

.balance-item {
  background: #1f1f1f;
  border: 1px solid #262626;
  border-radius: 8px;
  padding: 10px 12px;
}

.balance-amount {
  margin-top: 2px;
}

.history-message {
  color: #888;
  font-size: 0.9rem;
  text-align: center;
  padding: 20px;
}
</style>
