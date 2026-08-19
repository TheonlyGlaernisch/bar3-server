<template>
  <v-card class="history-card">
    <div class="card-header">Score &amp; Rank History</div>
    <div class="card-content">
      <div v-if="loading" class="d-flex justify-center py-6">
        <v-progress-circular indeterminate color="primary" size="28" />
      </div>
      <div v-else-if="error" class="history-message">{{ error }}</div>
      <div v-else-if="!chartPoints.length" class="history-message">No history data available for this alliance yet.</div>
      <template v-else>
        <div class="chart-block">
          <div class="chart-label">
            Score
            <span class="chart-value">{{ latestScore.toLocaleString() }}</span>
          </div>
          <div class="chart-wrap">
            <Line :data="scoreChartData" :options="scoreChartOptions" />
          </div>
        </div>
        <div class="chart-block mt-6">
          <div class="chart-label">
            Rank
            <span class="chart-value">#{{ latestRank }}</span>
          </div>
          <div class="chart-wrap">
            <Line :data="rankChartData" :options="rankChartOptions" />
          </div>
        </div>
      </template>
    </div>
  </v-card>
</template>

<script lang="ts">
import { defineComponent, PropType, computed, ref, watch, onMounted } from 'vue';
import {
  Chart as ChartJS,
  Title,
  Tooltip,
  Legend,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
} from 'chart.js';
import { Line } from 'vue-chartjs';
import { getAllianceHistory, AllianceHistoryPoint } from '@/utilities/allianceHistoryApi';

ChartJS.register(Title, Tooltip, Legend, LineElement, PointElement, CategoryScale, LinearScale);

export default defineComponent({
  name: 'AllianceHistoryCard',
  components: { Line },
  props: {
    allianceId: {
      type: Number as PropType<number | null>,
      default: null,
    },
    // Live values straight from the alliance table/API - always shown as the
    // most recent point, since they're more up to date than the sheet history.
    currentScore: {
      type: Number as PropType<number | null>,
      default: null,
    },
    currentRank: {
      type: Number as PropType<number | null>,
      default: null,
    },
  },
  setup(props) {
    const loading = ref(false);
    const error = ref('');
    const points = ref<AllianceHistoryPoint[]>([]);

    // Merge in the live table values as the newest point so the chart's
    // latest reading always matches what's shown elsewhere on the page.
    const chartPoints = computed(() => {
      const merged = [...points.value];
      if (props.currentScore != null && props.currentRank != null) {
        const last = merged[merged.length - 1];
        const isSameAsLast = last && last.score === props.currentScore && last.rank === props.currentRank;
        if (!isSameAsLast) {
          merged.push({
            date: 'now',
            score: props.currentScore,
            rank: props.currentRank,
          });
        }
      }
      return merged;
    });

    const latestScore = computed(() => {
      const p = chartPoints.value[chartPoints.value.length - 1];
      return p ? p.score : 0;
    });

    const latestRank = computed(() => {
      const p = chartPoints.value[chartPoints.value.length - 1];
      return p ? p.rank : 0;
    });

    const labels = computed(() => chartPoints.value.map((p) => {
      if (p.date === 'now') return 'Now';
      const d = new Date(p.date);
      return Number.isNaN(d.getTime()) ? p.date : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }));

    const baseOptions = {
      responsive: true,
      maintainAspectRatio: false,
      resizeDelay: 100,
      animation: false as const,
      plugins: {
        legend: { display: false },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#888', maxRotation: 0, autoSkip: true, maxTicksLimit: 8 },
        },
      },
    };

    const scoreChartData = computed(() => ({
      labels: labels.value,
      datasets: [
        {
          label: 'Score',
          data: chartPoints.value.map((p) => p.score),
          borderColor: '#FF6B00',
          backgroundColor: 'rgba(255, 107, 0, 0.12)',
          fill: true,
          tension: 0,
          pointRadius: 3,
          pointHoverRadius: 5,
          pointBackgroundColor: '#FF6B00',
          pointBorderColor: '#1a1a1a',
          pointBorderWidth: 1,
          pointHitRadius: 8,
        },
      ],
    }));

    const scoreChartOptions = computed(() => ({
      ...baseOptions,
      scales: {
        ...baseOptions.scales,
        y: {
          ticks: { color: '#888' },
          grid: { color: '#262626' },
        },
      },
    }));

    const rankChartData = computed(() => ({
      labels: labels.value,
      datasets: [
        {
          label: 'Rank',
          data: chartPoints.value.map((p) => p.rank),
          borderColor: '#FF9500',
          backgroundColor: 'rgba(255, 149, 0, 0.12)',
          fill: true,
          tension: 0,
          pointRadius: 3,
          pointHoverRadius: 5,
          pointBackgroundColor: '#FF9500',
          pointBorderColor: '#1a1a1a',
          pointBorderWidth: 1,
          pointHitRadius: 8,
        },
      ],
    }));

    const rankChartOptions = computed(() => ({
      ...baseOptions,
      scales: {
        ...baseOptions.scales,
        // Lower rank number is better, so flip the axis: #1 sits at the top.
        y: {
          reverse: true,
          ticks: { color: '#888', precision: 0 },
          grid: { color: '#262626' },
        },
      },
    }));

    const load = async () => {
      if (!props.allianceId) {
        points.value = [];
        return;
      }
      loading.value = true;
      error.value = '';
      try {
        points.value = await getAllianceHistory(props.allianceId);
      } catch (e) {
        error.value = e instanceof Error ? e.message : 'Failed to load history';
      } finally {
        loading.value = false;
      }
    };

    watch(() => props.allianceId, load);
    onMounted(load);

    return {
      loading,
      error,
      chartPoints,
      latestScore,
      latestRank,
      scoreChartData,
      scoreChartOptions,
      rankChartData,
      rankChartOptions,
    };
  },
});
</script>

<style scoped>
.history-card {
  border-radius: 10px !important;
  background: #1a1a1a !important;
  border: 1px solid #2a2a2a !important;
  box-shadow: none !important;
  transition: border-color 0.2s ease;
}

.history-card:hover {
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

.chart-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 8px;
}

.chart-value {
  color: #e8e8e8;
  font-weight: 700;
  font-size: 0.85rem;
  text-transform: none;
  letter-spacing: normal;
  margin-left: 6px;
}

/* Fixed-size wrapper so chart.js has a stable box to measure against -
   without this, responsive canvases can enter a resize feedback loop
   inside flex/grid parents. */
.chart-wrap {
  position: relative;
  height: 220px;
  width: 100%;
}

.history-message {
  color: #888;
  font-size: 0.9rem;
  text-align: center;
  padding: 20px;
}
</style>
