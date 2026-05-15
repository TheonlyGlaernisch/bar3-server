<template>
  <div class="view-small-inner-wrapper view-padding-inner-wrapper">
    <h1>Alliance</h1>
    <div class="d-flex align-center mt-4 mb-4">
      <v-btn color="primary" small :loading="loading" :disabled="loading || !canRefresh" @click="refresh">
        <v-icon left small>mdi-refresh</v-icon>
        Refresh
      </v-btn>
      <span class="ml-3 caption grey--text text--lighten-1">{{ cacheText }}</span>
    </div>

    <div v-if="loading" class="d-flex justify-center py-6">
      <v-progress-circular indeterminate color="primary" />
    </div>
    <v-alert v-else-if="error" type="error" dense>{{ error }}</v-alert>
    <v-card v-else-if="!context.registered" dark color="#1A1A1A" class="pa-4">
      <div class="text-subtitle-1 white--text font-weight-medium mb-2">No registered nation found</div>
      <div class="text-body-2">
        Link your Discord account with <code>/register &lt;nation_id&gt;</code> in flame_bot, then refresh.
      </div>
    </v-card>
    <v-card v-else-if="!context.alliance" dark color="#1A1A1A" class="pa-4">
      <div class="text-subtitle-1 white--text font-weight-medium">No alliance found for your nation</div>
    </v-card>
    <div v-else>
      <v-card dark color="#1A1A1A" class="pa-4 mb-4">
        <div class="text-subtitle-1 white--text font-weight-medium mb-3">
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

      <v-card dark color="#1A1A1A" class="pa-4">
        <div class="text-subtitle-1 white--text font-weight-medium mb-3">Active Defensive Wars</div>
        <v-list v-if="context.activeDefensiveWars.length" dense dark color="transparent">
          <v-list-item v-for="war in context.activeDefensiveWars" :key="war.warId" class="px-0">
            <v-list-item-content>
              <v-list-item-title class="white--text">
                <a :href="war.url" target="_blank" rel="noopener noreferrer">War #{{ war.warId }}</a>
              </v-list-item-title>
              <v-list-item-subtitle>
                {{ war.attackerName }} ({{ war.attackerAllianceName || war.attackerAllianceId }})
                vs
                {{ war.defenderName }} ({{ war.defenderAllianceName || war.defenderAllianceId }})
              </v-list-item-subtitle>
            </v-list-item-content>
          </v-list-item>
        </v-list>
        <div v-else class="caption grey--text text--lighten-1">No active defensive wars found.</div>
      </v-card>
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { getMemberNationContext, MemberNationContextResponse } from '@/utilities/memberNationApi';

type AllianceViewContext = MemberNationContextResponse;

@Component
export default class Alliance extends Vue {
  loading = false;
  error = '';
  context: AllianceViewContext = { registered: false, nation: null, alliance: null, activeDefensiveWars: [] };

  get canRefresh(): boolean {
    return this.context.cache?.canRefreshNow !== false;
  }

  get cacheText(): string {
    if (!this.context.cache?.cachedAt) return 'Not loaded yet';
    const source = this.context.cache.source === 'cache' ? 'cached' : 'fresh';
    const nextRefresh = this.context.cache.nextRefreshAt ? new Date(this.context.cache.nextRefreshAt).toLocaleTimeString() : '';
    if (this.context.cache.canRefreshNow) {
      return `Last updated ${new Date(this.context.cache.cachedAt).toLocaleTimeString()} (${source})`;
    }
    return `Last updated ${new Date(this.context.cache.cachedAt).toLocaleTimeString()} (${source}) · refresh after ${nextRefresh}`;
  }

  async mounted() {
    await this.load(false);
  }

  async refresh() {
    await this.load(true);
  }

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
  }
}
</script>
