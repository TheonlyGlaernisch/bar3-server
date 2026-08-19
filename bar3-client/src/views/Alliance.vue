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
    <v-card v-else-if="!context.registered" class="info-card pa-4">
      <div class="text-subtitle-1 text-white font-weight-medium mb-2">No registered nation found</div>
      <div class="text-body-2">Link your Discord account with <code>/register</code></div>
    </v-card>
    <v-card v-else-if="!context.alliance" class="info-card pa-4">
      <div class="text-subtitle-1 text-white font-weight-medium">No alliance found for your nation</div>
    </v-card>
    <div v-else>
      <!-- Alliance Overview Grid -->
      <div class="alliance-grid">
        <!-- Alliance Info Card -->
        <v-card class="info-card">
          <div class="card-header">Alliance</div>
          <div class="card-content">
            <div class="info-label">Name</div>
            <div class="info-value">
              <a :href="context.alliance.url" target="_blank" rel="noopener noreferrer">
                {{ context.alliance.name }} <span v-if="context.alliance.acronym">({{ context.alliance.acronym }})</span>
              </a>
            </div>
            <div class="info-label mt-3">Rank</div>
            <div class="info-value">#{{ context.alliance.rank }}</div>
          </div>
        </v-card>

        <!-- Membership Card -->
        <v-card class="info-card">
          <div class="card-header">Membership</div>
          <div class="card-content">
            <div class="stat-row">
              <div class="stat-label">Members</div>
              <div class="stat-number">{{ context.alliance.numMembers }}</div>
            </div>
            <div class="stat-row mt-3">
              <div class="stat-label">Total Cities</div>
              <div class="stat-number">{{ context.alliance.totalCities }}</div>
            </div>
          </div>
        </v-card>

        <!-- Score Card -->
        <v-card class="info-card">
          <div class="card-header">Score</div>
          <div class="card-content">
            <div class="stat-row">
              <div class="stat-label">Total Score</div>
              <div class="stat-number">{{ context.alliance.score.toFixed(2) }}</div>
            </div>
            <div class="stat-row mt-3">
              <div class="stat-label">Average Score</div>
              <div class="stat-number">{{ context.alliance.averageScore.toFixed(2) }}</div>
            </div>
          </div>
        </v-card>
      </div>

      <!-- Score & Rank History -->
      <alliance-history-card
        :alliance-id="context.alliance.allianceId"
        :current-score="context.alliance.score"
        :current-rank="context.alliance.rank"
        class="mt-6"
      />

      <!-- Active Defensive Wars -->
      <v-card class="info-card mt-6">
        <div class="card-header">Active Defensive Wars</div>
        <div class="card-content">
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
          <div v-else class="history-message">No active defensive wars found.</div>
        </div>
      </v-card>

      <!-- Requested Counters -->
      <v-card class="info-card mt-6">
        <div class="card-header">Requested Counters</div>
        <div class="card-content">
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
          <div v-else class="history-message">No requested counters in active wars.</div>
        </div>
      </v-card>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { getMemberNationContext, MemberNationContextResponse, requestCounterForWar } from '@/utilities/memberNationApi';
import AllianceHistoryCard from '@/components/AllianceHistoryCard.vue';

type AllianceViewContext = MemberNationContextResponse;

export default defineComponent({
  name: 'AllianceView',
  components: {
    AllianceHistoryCard,
  },
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
  },
});
</script>

<style scoped>
.alliance-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 20px;
}

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

.info-value a {
  color: #FF6B00;
  text-decoration: none;
  transition: color 0.15s ease;
}

.info-value a:hover {
  color: #FF9500;
  text-decoration: underline;
}

.stat-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.stat-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.stat-number {
  font-size: 1.5rem;
  font-weight: 700;
  color: #FF6B00;
}

.history-message {
  color: #888;
  font-size: 0.9rem;
  text-align: center;
  padding: 20px;
}

:deep(.v-list-item) {
  border-bottom: 1px solid #232323;
}

:deep(.v-list-item:last-child) {
  border-bottom: none;
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .alliance-grid {
    grid-template-columns: 1fr;
  }
}
</style>
