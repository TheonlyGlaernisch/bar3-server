<template>
  <Line :data="normalizedData" :options="chartOptions" :height="height" />
</template>

<script lang="ts">
import { defineComponent } from 'vue';
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

ChartJS.register(Title, Tooltip, Legend, LineElement, PointElement, CategoryScale, LinearScale);

export default defineComponent({
  name: 'line-chart',
  components: { Line },
  props: {
    data: {
      type: Object,
      required: true,
    },
    height: {
      type: Number,
      default: 300,
    },
  },
  computed: {
    normalizedData(): Record<string, unknown> {
      return (this.data as Record<string, unknown>) || { labels: [], datasets: [] };
    },
    chartOptions(): Record<string, unknown> {
      return {
        scales: {
          y: {
            min: 0,
            ticks: {
              precision: 0,
            },
          },
          x: {
            grid: {
              display: false,
            },
          },
        },
        plugins: {
          legend: {
            display: true,
            labels: {
              font: {
                size: 11,
              },
              boxWidth: 20,
              padding: 5,
            },
          },
        },
        responsive: true,
        maintainAspectRatio: false,
      };
    },
  },
});
</script>
