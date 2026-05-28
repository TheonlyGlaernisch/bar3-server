<template>
  <v-card
    outlined
    width="400px"
    height="380px"
    class="graph-card"
  >
    <template v-if="graphType == 'messagesSentOverTime'">
      <v-card-title class="card-title-orange">
        Message Sending Activity
      </v-card-title>
      <div
        class="pa-4"
      >
        <line-chart :height="300" v-if="loaded" :data="chartData"/>
      </div>
    </template>
    <template v-if="graphType == 'apiRequests'">
      <v-card-title class="card-title-orange">
        API Requests
      </v-card-title>
      <v-card-text>
        <h4>
          Your Used API Requests
        </h4>
        <h2>
          {{ APIRequests.used }} / {{ APIRequests.max }}
        </h2>
      </v-card-text>
      <div
        class="pa-4 d-flex"
      >
          <v-progress-circular
            :size="200"
            :width="30"
            :value="((APIRequests.used / APIRequests.max) * 100) || 0"
            color="primary"
            class="ml-auto mr-auto"
          >
            {{ (((APIRequests.used / APIRequests.max) * 100) || 0).toFixed(2) }}%
          </v-progress-circular>
      </div>
    </template>
  </v-card>
</template>

<script lang="ts">
import { computed, defineComponent, onMounted, ref, watch } from 'vue';
import { useStore } from 'vuex';
import { Message, VueLineChart } from '@/types';
import LineChart from '@/components/LineChart.vue';

export default defineComponent({
  name: 'GraphCard',
  components: {
    LineChart,
  },
  props: {
    graphType: {
      type: String,
      required: true,
    },
  },
  setup(props) {
    const store = useStore();
    const loaded = ref(false);
    const chartData = ref(new VueLineChart.ChartData());
    const sentMessages = computed(() => store.getters.sentMessages as Message[]);
    const APIRequests = computed(() => store.getters.apiDetails as {max: number; used: number});

    const generateSentMessagesChartData = () => {
      const dataset = new VueLineChart.Dataset();
      dataset.label = 'Message Count';
      dataset.borderColor = 'rgb(255, 107, 0)';
      dataset.fill = false;

      const data = new VueLineChart.ChartData();

      if (sentMessages.value.length === 0) {
        data.datasets.push(dataset);
        chartData.value = data;
        loaded.value = true;
        return;
      }

      const firstMessage = sentMessages.value[0];
      const twoHours = 7200000;
      const totalIncrements = Math.ceil((Date.now() - firstMessage.sentTimeMilliseconds) / twoHours);

      let lastMessageIndex = 0;

      /**
       * Go through all of the two hour increments, find the amount of messages in them, and then push it to the graph
       */
      for (let i = 1; i <= totalIncrements; i++) {
        let messagesAtIncrement = 0;
        while (
          sentMessages.value[lastMessageIndex] &&
          sentMessages.value[lastMessageIndex].sentTimeMilliseconds < (i * twoHours) + firstMessage.sentTimeMilliseconds
        ) {
          messagesAtIncrement++;
          lastMessageIndex++;
        }

        dataset.data.push({ x: new Date((i * twoHours) + firstMessage.sentTimeMilliseconds).toLocaleDateString('en-US'), y: messagesAtIncrement });
      }

      data.datasets.push(dataset);
      chartData.value = data;
      loaded.value = true;
    };

    const generateData = () => {
      if (props.graphType === 'messagesSentOverTime') {
        generateSentMessagesChartData();
      }
    };

    watch(sentMessages, () => {
      if (props.graphType === 'messagesSentOverTime') {
        loaded.value = false;
        generateSentMessagesChartData();
      }
    });

    onMounted(() => {
      generateData();
    });

    return {
      loaded,
      chartData,
      APIRequests,
    };
  },
});
</script>

<style scoped>
  .graph-card {
    border-radius: 12px !important;
  }

  .card-title-orange {
    color: #FF6B00;
    font-weight: 600;
  }
</style>
