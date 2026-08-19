<template>
  <div class="view-small-inner-wrapper view-padding-inner-wrapper">
    <h1 class="mb-4">Leaderboard</h1>

    <div class="d-flex align-center mb-4" style="gap: 12px;">
      <v-btn-toggle v-model="rankType" mandatory color="primary" density="compact">
        <v-btn value="points">
          <v-icon start size="small">mdi-star</v-icon>
          Points
        </v-btn>
        <v-btn value="wins">
          <v-icon start size="small">mdi-trophy</v-icon>
          Wins
        </v-btn>
      </v-btn-toggle>
    </div>

    <div v-if="loading" class="d-flex justify-center py-8">
      <v-progress-circular indeterminate color="primary" />
    </div>

    <v-alert v-else-if="error" type="error" density="compact" class="mb-4">
      {{ error }}
    </v-alert>

    <v-table v-else density="compact" class="leaderboard-table">
      <thead>
        <tr>
          <th class="text-left">Rank</th>
          <th class="text-left">Player</th>
          <th class="text-right">Total Points</th>
          <th class="text-right">Total Wins</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="entry in entries" :key="entry.user_id">
          <td>
            <span :class="['rank-badge', rankClass(entry.rank)]">
              {{ entry.rank }}
            </span>
          </td>
          <td>{{ entry.user_name }}</td>
          <td class="text-right">{{ entry.total_points.toLocaleString() }}</td>
          <td class="text-right">{{ entry.total_wins.toLocaleString() }}</td>
        </tr>
        <tr v-if="entries.length === 0">
          <td colspan="4" class="text-center text-medium-emphasis py-6">
            No leaderboard data yet.
          </td>
        </tr>
      </tbody>
    </v-table>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { fetchLeaderboard, LeaderboardEntry } from '@/utilities/leaderboardApi';

export default defineComponent({
  name: 'LeaderboardView',
  data() {
    return {
      loading: false,
      error: '',
      rankType: 'points' as 'points' | 'wins',
      entries: [] as LeaderboardEntry[],
    };
  },
  watch: {
    rankType() {
      this.load();
    },
  },
  async mounted() {
    await this.load();
  },
  methods: {
    async load() {
      this.loading = true;
      this.error = '';
      try {
        this.entries = await fetchLeaderboard({ type: this.rankType, limit: 50 });
      } catch (e) {
        this.error = e instanceof Error ? e.message : 'Failed to load leaderboard';
      } finally {
        this.loading = false;
      }
    },
    rankClass(rank: number): string {
      if (rank === 1) return 'rank-badge--gold';
      if (rank === 2) return 'rank-badge--silver';
      if (rank === 3) return 'rank-badge--bronze';
      return '';
    },
  },
});
</script>

<style scoped>
.leaderboard-table {
  border: 1px solid #2a2a2a;
  border-radius: 8px;
  background: transparent !important;
}
.leaderboard-table tbody tr:hover td {
  background: rgba(255, 255, 255, 0.03) !important;
  transition: background 0.15s ease;
}

.rank-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  font-weight: 700;
  font-size: 0.85rem;
}

.rank-badge--gold {
  background: rgba(255, 215, 0, 0.15);
  color: #ffd700;
  border: 1px solid rgba(255, 215, 0, 0.4);
}

.rank-badge--silver {
  background: rgba(192, 192, 192, 0.15);
  color: #c0c0c0;
  border: 1px solid rgba(192, 192, 192, 0.4);
}

.rank-badge--bronze {
  background: rgba(205, 127, 50, 0.15);
  color: #cd7f32;
  border: 1px solid rgba(205, 127, 50, 0.4);
}

/* v-btn-toggle segmented styling */
:deep(.v-btn-toggle) {
  background: #1a1a1a !important;
  border: 1px solid #2a2a2a !important;
  border-radius: 8px !important;
}

:deep(.v-btn-toggle .v-btn--active) {
  background: rgba(255, 107, 0, 0.15) !important;
}
</style>
