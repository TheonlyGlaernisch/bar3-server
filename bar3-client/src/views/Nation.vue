<template>
  <div class="view-small-inner-wrapper view-padding-inner-wrapper">
    <h1>Nation</h1>
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
      <div class="text-body-2">Link your Discord account with <code>/register</code></div>
    </v-card>
    <v-card v-else-if="context.nation" dark color="#1A1A1A" class="pa-4">
      <div class="text-subtitle-1 white--text font-weight-medium mb-3">
        <a :href="context.nation.url" target="_blank" rel="noopener noreferrer">{{ context.nation.nationName }}</a>
      </div>
      <div class="text-body-2 mb-1"><strong>Leader:</strong> {{ context.nation.leaderName }}</div>
      <div class="text-body-2 mb-1"><strong>Cities:</strong> {{ context.nation.numCities }}</div>
      <div class="text-body-2 mb-1"><strong>Score:</strong> {{ context.nation.score.toFixed(2) }}</div>
      <div class="text-body-2 mb-1">
        <strong>Alliance:</strong>
        <span v-if="context.alliance">
          <a :href="context.alliance.url" target="_blank" rel="noopener noreferrer">{{ context.alliance.name }}</a>
        </span>
        <span v-else>{{ context.nation.allianceName || 'None' }}</span>
      </div>
      <div class="text-body-2"><strong>Position:</strong> {{ context.nation.alliancePosition || 'N/A' }}</div>
    </v-card>
    <v-card v-if="context.nation" dark color="#1A1A1A" class="pa-4 mt-4">
      <div class="text-subtitle-1 white--text font-weight-medium mb-3">Defensive Wars</div>
      <v-alert v-if="counterNotice" type="success" dense class="mb-3">{{ counterNotice }}</v-alert>
      <v-simple-table v-if="context.nationDefensiveWars.length" dark>
        <template v-slot:default>
          <thead>
            <tr>
              <th class="text-left">War</th>
              <th class="text-left">Reason</th>
              <th class="text-left">Attacker Cities</th>
              <th class="text-left">Units</th>
              <th class="text-left">Action</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="war in context.nationDefensiveWars" :key="war.warId">
              <td>
                <a :href="war.url" target="_blank" rel="noopener noreferrer">War #{{ war.warId }}</a>
              </td>
              <td>{{ war.reason }}</td>
              <td>{{ war.attackerCities }}</td>
              <td>
                S: {{ war.attackerUnits.soldiers.toLocaleString() }} ·
                T: {{ war.attackerUnits.tanks.toLocaleString() }} ·
                A: {{ war.attackerUnits.aircraft.toLocaleString() }} ·
                Sh: {{ war.attackerUnits.ships.toLocaleString() }} ·
                M: {{ war.attackerUnits.missiles.toLocaleString() }} ·
                N: {{ war.attackerUnits.nukes.toLocaleString() }}
              </td>
              <td>
                <v-btn x-small color="primary" @click="requestCounter(war)">Request Counter</v-btn>
              </td>
            </tr>
          </tbody>
        </template>
      </v-simple-table>
      <div v-else class="caption grey--text text--lighten-1">
        No active defensive wars right now.
      </div>
    </v-card>
    <v-card v-else dark color="#1A1A1A" class="pa-4">
      <div class="text-subtitle-2">This account is registered, but nation details are currently unavailable.</div>
    </v-card>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { getMemberNationContext, MemberNationContextResponse } from '@/utilities/memberNationApi';

type NationViewContext = MemberNationContextResponse;

export default defineComponent({
  name: 'NationView',
  data() {
    return {
      loading: false,
      error: '',
      counterNotice: '',
      context: {
        registered: false,
        nation: null,
        alliance: null,
        activeDefensiveWars: [],
        nationDefensiveWars: [],
        counterRequests: [],
      } as NationViewContext,
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
  },
  async mounted() {
    await this.load(false);
  },
  methods: {
    async refresh() {
      await this.load(true);
    },
    async requestCounter(war: NationViewContext['nationDefensiveWars'][number]) {
      const text = `Request counter: war #${war.warId} vs ${war.attackerName} (${war.url})`;
      try {
        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
          this.counterNotice = 'Counter request copied to clipboard.';
        } else {
          this.counterNotice = text;
        }
      } catch {
        this.counterNotice = text;
      }
      setTimeout(() => {
        this.counterNotice = '';
      }, 3000);
    },
    async load(refresh: boolean) {
      this.loading = true;
      this.error = '';
      try {
        this.context = await getMemberNationContext(refresh);
      } catch (e) {
        this.error = e instanceof Error ? e.message : 'Failed to load nation information';
      } finally {
        this.loading = false;
      }
    },
  },
});
</script>
