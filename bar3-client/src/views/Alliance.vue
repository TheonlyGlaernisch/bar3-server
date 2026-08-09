<template>
  <div class="view-small-inner-wrapper view-padding-inner-wrapper">
    <h1>Alliance</h1>
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
    <v-card v-else-if="!context.registered" color="#1A1A1A" class="pa-4">
      <div class="text-subtitle-1 text-white font-weight-medium mb-2">No registered nation found</div>
      <div class="text-body-2">Link your Discord account with <code>/register</code></div>
    </v-card>
    <v-card v-else-if="!context.alliance" color="#1A1A1A" class="pa-4">
      <div class="text-subtitle-1 text-white font-weight-medium">No alliance found for your nation</div>
    </v-card>
    <div v-else>
      <v-card color="#1A1A1A" class="pa-4 mb-4">
        <div class="text-subtitle-1 text-white font-weight-medium mb-3">
          <a :href="context.alliance.url" target="_blank" rel="noopener noreferrer">
            {{ context.alliance.name }} <span v-if="context.alliance.acronym">({{ context.alliance.acronym }})</span>
          </a>
        </div>
        <div class="text-body-2 mb-1"><strong>Rank:</strong> {{ context.alliance.rank }}</div>
        <div class="text-body-2 mb-1"><strong>Members:</strong> {{ context.alliance.numMembers }}</div>
        <div class="text-body-2 mb-1"><strong>Total Cities:</strong> {{ context.alliance.totalCities }}</div>
        <div class="text-body-2 mb-1"><strong>Score:</strong> {{ context.alliance.score.toFixed(2) }}</div>
        <div class="text-body-2"><strong>Average Score:</strong> {{ context.alliance.averageScore.toFixed(2) }}</div>
      </v-card>

      <v-card v-if="context.banking" color="#1A1A1A" class="pa-4 mb-4">
        <div class="text-subtitle-1 text-white font-weight-medium mb-3">
          <v-icon size="small" class="mr-1">mdi-bank</v-icon>
          Banking
        </div>
        <div class="mb-3">
          <div class="caption text-grey-lighten-1 mb-1">Your offshore balance</div>
          <div v-if="nonZeroBalanceEntries.length" class="d-flex flex-wrap ga-2">
            <v-chip v-for="[key, amount] in nonZeroBalanceEntries" :key="key" size="small" color="primary" variant="tonal">
              {{ formatResourceLabel(key) }}: {{ amount.toLocaleString() }}
            </v-chip>
          </div>
          <div v-else class="caption text-grey-lighten-1">No balance on record.</div>
        </div>
        <div v-if="context.banking.lastActivity" class="caption text-grey-lighten-1 mb-3">
          Last activity: {{ context.banking.lastActivity.type }} ({{ context.banking.lastActivity.status }})
          · {{ new Date(context.banking.lastActivity.updatedAt).toLocaleString() }}
        </div>

        <v-divider class="mb-3" />
        <div class="text-body-2 font-weight-medium mb-2">Withdraw</div>
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
          class="mt-3"
          hide-details
        />
        <v-alert v-if="withdrawError" type="error" density="compact" class="mt-3">{{ withdrawError }}</v-alert>
        <v-alert v-if="withdrawSuccess" type="success" density="compact" class="mt-3">Withdrawal completed.</v-alert>
        <v-btn
          color="primary"
          class="mt-3"
          :loading="withdrawLoading"
          :disabled="withdrawLoading || !hasPositiveWithdrawAmount"
          @click="submitWithdraw"
        >
          <v-icon class="mr-1">mdi-cash-fast</v-icon>
          Withdraw
        </v-btn>
      </v-card>

      <v-card color="#1A1A1A" class="pa-4">
        <div class="text-subtitle-1 text-white font-weight-medium mb-3">Active Defensive Wars</div>
        <v-list v-if="context.activeDefensiveWars.length" density="compact" color="transparent">
          <v-list-item v-for="war in context.activeDefensiveWars" :key="war.warId" class="px-0">
            <div>
              <v-list-item-title class="text-white">
                <a :href="war.url" target="_blank" rel="noopener noreferrer">War #{{ war.warId }}</a>
              </v-list-item-title>
              <v-list-item-subtitle>
                {{ war.attackerName }} ({{ war.attackerAllianceName || war.attackerAllianceId }})
                vs
                {{ war.defenderName }} ({{ war.defenderAllianceName || war.defenderAllianceId }})
              </v-list-item-subtitle>
              <v-list-item-subtitle v-if="war.counterRequested" class="text-green-lighten-2">
                Counter requested{{ war.counterRequestedAt ? ` · ${new Date(war.counterRequestedAt).toLocaleString()}` : '' }}
              </v-list-item-subtitle>
            </div>
            <template v-if="canRequestCounter(war)" #append>
              <v-btn
                size="x-small"
                color="primary"
                :loading="requestingWarId === war.warId"
                :disabled="requestingWarId === war.warId || war.counterRequested"
                @click="requestCounter(war.warId)"
              >
                {{ war.counterRequested ? 'Requested' : 'Request Counter' }}
              </v-btn>
            </template>
          </v-list-item>
        </v-list>
        <div v-else class="caption text-grey-lighten-1">No active defensive wars found.</div>
      </v-card>

      <v-card color="#1A1A1A" class="pa-4 mt-4">
        <div class="text-subtitle-1 text-white font-weight-medium mb-3">Requested Counters</div>
        <v-list v-if="requestedCounterWars.length" density="compact" color="transparent">
          <v-list-item v-for="war in requestedCounterWars" :key="`counter-${war.warId}`" class="px-0">
            <div>
              <v-list-item-title class="text-white">
                <a :href="war.url" target="_blank" rel="noopener noreferrer">War #{{ war.warId }}</a>
              </v-list-item-title>
              <v-list-item-subtitle>
                {{ war.attackerName }} ({{ war.attackerAllianceName || war.attackerAllianceId }})
                vs
                {{ war.defenderName }} ({{ war.defenderAllianceName || war.defenderAllianceId }})
              </v-list-item-subtitle>
              <v-list-item-subtitle class="text-green-lighten-2">
                Requested{{ war.counterRequestedAt ? ` · ${new Date(war.counterRequestedAt).toLocaleString()}` : '' }}
              </v-list-item-subtitle>
            </div>
          </v-list-item>
        </v-list>
        <div v-else class="caption text-grey-lighten-1">No requested counters in active wars.</div>
      </v-card>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { getMemberNationContext, MemberNationContextResponse, requestCounterForWar, withdrawFunds } from '@/utilities/memberNationApi';

type AllianceViewContext = MemberNationContextResponse;

const RESOURCE_KEYS = ['money', 'food', 'coal', 'oil', 'uranium', 'iron', 'bauxite', 'lead', 'gasoline', 'munitions', 'steel', 'aluminum'];

export default defineComponent({
  name: 'AllianceView',
  data() {
    return {
      loading: false,
      error: '',
      requestingWarId: null as number | null,
      context: {
        registered: false,
        nation: null,
        alliance: null,
        activeDefensiveWars: [],
        nationDefensiveWars: [],
        counterRequests: [],
      } as AllianceViewContext,

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
    requestedCounterWars() {
      return this.context.activeDefensiveWars.filter((war) => war.counterRequested);
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
    canRequestCounter(war: AllianceViewContext['activeDefensiveWars'][number]): boolean {
      const nationId = this.context.nation?.nationId;
      return !!nationId && war.defenderId === nationId;
    },
    async refresh() {
      await this.load(true);
    },
    async load(refresh: boolean) {
      this.loading = true;
      this.error = '';
      try {
        this.context = await getMemberNationContext(refresh);
      } catch (e) {
        this.error = e instanceof Error ? e.message : 'Failed to load alliance information';
      } finally {
        this.loading = false;
      }
    },
    async requestCounter(warId: number) {
      this.requestingWarId = warId;
      this.error = '';
      try {
        await requestCounterForWar(warId);
        await this.load(true);
      } catch (e) {
        this.error = e instanceof Error ? e.message : 'Failed to request counter';
      } finally {
        this.requestingWarId = null;
      }
    },
    formatResourceLabel(key: string): string {
      return key.charAt(0).toUpperCase() + key.slice(1);
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
