<template>
  <v-card
    outlined
    min-height="500px"
  >
    <v-row class="blue darken-2 white--text ma-0 align-center pb-4">
      <v-col cols="12" sm="6">
        <div class="text-h6">
          {{ campaign.name }}
        </div>
        <div class="text-subtitle-1">
          Created {{ new Date(campaign.createdTime).toLocaleDateString() }}
        </div>
      </v-col>

      <v-col cols="3" sm="2" lg="1" :class="(!['xs','sm'].includes($vuetify.breakpoint.name)) ? 'ml-auto' : ''">
        <div class="text-md-h6" style="opacity: 0.8">
          Sent
        </div>
        <div class="text-md-h5 font-weight-bold">
          {{ campaign.sentCount }}
        </div>
      </v-col>
      <v-col cols="3" sm="2" lg="1">
        <div class="text-md-h6" style="opacity: 0.8">
          Views
        </div>
        <div class="text-md-h5 font-weight-bold">
          {{ campaign.messagePixel.readCount.toLocaleString() }}
        </div>
      </v-col>
      <v-col cols="3" sm="2" lg="1" class="ml-0 text-md-h4 font-weight-bold">
        <div class="text-md-h6" style="opacity: 0.8">
          Clicks
        </div>
        <div class="text-md-h5 font-weight-bold">
          {{ totalLinkClicks.toLocaleString() }}
        </div>
      </v-col>
    </v-row>
    <v-row class="ma-5" style="height: 350px">
      <line-chart style="width: 100%; height: 100%;" v-if="loaded" :data="chartData"/>
    </v-row>
  </v-card>
</template>

<script lang="ts">
import { defineComponent, PropType } from 'vue';
import { AnalyticalCampaign } from '@/interfaces/analytics';
import { VueLineChart } from '@/types';
import LineChart from '@/components/LineChart.vue';

export default defineComponent({
  name: 'AnalyticsGraphCard',
  components: {
    LineChart,
  },
  props: {
    campaign: {
      type: Object as PropType<AnalyticalCampaign>,
      required: true,
    },
  },
  data() {
    return {
      chartData: new VueLineChart.ChartData(),
      loaded: false,
      totalLinkClicks: 0,
    };
  },
  methods: {
    generateViewsHistory() {
      const dataset = new VueLineChart.Dataset();
      dataset.borderColor = `rgb(255, 107, 0)`;
      dataset.label = 'Message Views';
      dataset.fill = false;

      if (this.campaign.messagePixel.readCount == 0) {
        this.chartData.datasets.push(dataset);
        return [];
      }

      const history = this.campaign.messagePixel.readHistory;

      // Single data point: show total views on that day
      if (history.length === 1) {
        dataset.data.push({ x: new Date(history[0]).toLocaleDateString('en-US'), y: this.campaign.messagePixel.readCount });
        this.chartData.datasets.push(dataset);
        return;
      }

      const firstRead = history[0];

      const dayInMiliseconds = 24 * 60 * 60 * 1000;
      const totalIncrements = Math.ceil((history[history.length - 1] - firstRead) / dayInMiliseconds) + 1;

      let lastReadIndex = 0;

      for (let i = 1; i <= totalIncrements; i++) {
        let messagesAtIncrement = 0;
        while (history[lastReadIndex] && history[lastReadIndex] < (i * dayInMiliseconds) + firstRead) {
          messagesAtIncrement++;
          lastReadIndex++;
        }

        dataset.data.push({ x: (new Date((i * dayInMiliseconds) + firstRead).toLocaleDateString('en-US')), y: messagesAtIncrement });
      }

      this.chartData.datasets.push(dataset);
    },
    generateLinkClicksGraph() {
      let colorIncremeter = 0;
      const maxColorIndex = VueLineChart.color.length;

      for (const link of this.campaign.links) {
        colorIncremeter++;
        if (colorIncremeter >= maxColorIndex) colorIncremeter = 0;

        const urlInfo = new URL(link.url);

        const dataset = new VueLineChart.Dataset();
        dataset.label = urlInfo.hostname + urlInfo.pathname;
        dataset.borderColor = VueLineChart.color[colorIncremeter];
        dataset.fill = false;

        if (link.readCount == 0) {
          this.chartData.datasets.push(dataset);
          continue;
        }

        const history = link.readHistory;

        // Single data point: show total clicks on that day
        if (history.length === 1) {
          dataset.data.push({ x: new Date(history[0]).toLocaleDateString('en-US'), y: link.readCount });
          this.chartData.datasets.push(dataset);
          continue;
        }

        const firstRead = history[0];

        const dayInMiliseconds = 24 * 60 * 60 * 1000;
        const totalIncrements = Math.ceil((history[history.length - 1] - firstRead) / dayInMiliseconds) + 1;

        let lastReadIndex = 0;

        for (let i = 1; i <= totalIncrements; i++) {
          let readsAtIncrement = 0;
          while (history[lastReadIndex] && history[lastReadIndex] < (i * dayInMiliseconds) + firstRead) {
            readsAtIncrement++;
            lastReadIndex++;
          }

          dataset.data.push({ x: (new Date((i * dayInMiliseconds) + firstRead).toLocaleDateString('en-US')), y: readsAtIncrement });
        }

        this.chartData.datasets.push(dataset);
      }
    },
    getTotalLinkClicks() {
      this.totalLinkClicks = 0;

      for (const link of this.campaign.links) {
        this.totalLinkClicks += link.readCount;
      }
    },
    generateData() {
      this.chartData = new VueLineChart.ChartData();

      this.getTotalLinkClicks();
      this.generateViewsHistory();
      this.generateLinkClicksGraph();

      this.loaded = true;
    },
  },
  watch: {
    campaign() {
      this.loaded = false;
      this.generateData();
    },
  },
  mounted() {
    this.generateData();
  },
});
</script>