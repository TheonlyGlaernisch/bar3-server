<template>
  <div class="home view-small-inner-wrapper view-padding-inner-wrapper">
    <h1>Dashboard</h1>
    <div class="text-subtitle-1 text-grey-lighten-1">Last refreshed {{ refreshedSecondsAgo }} second{{ refreshedSecondsAgo !== 1 ? 's' : '' }} ago</div>
    <update-available-banner class="mt-4"/>
    <div class="dashboard-cards-container mt-6">
      <graph-card class="dashboard-card" graphType="messagesSentOverTime"/>
      <graph-card class="dashboard-card" graphType="apiRequests"/>
      <messages-sent-card class="dashboard-card"/>
    </div>
    <v-btn
      class="dashboard-refresh-button"
      color="primary"
      icon="mdi-refresh"
      size="large"
      aria-label="Refresh dashboard data"
      :loading="isRefreshing"
      @click="refreshData"
    />
  </div>
</template>

<script lang="ts">
import { computed, defineComponent, onBeforeUnmount, onMounted, ref } from 'vue';
import { useStore } from 'vuex';
import GraphCard from '@/components/GraphCard.vue';
import MessagesSentCard from '@/components/MessagesSentCard.vue';
import UpdateAvailableBanner from '@/components/UpdateAvailableBanner.vue';
import getAppData from '@/actions/getAppData';
import { getPwApiKeyDetails } from '@/utilities/pwApi';

export default defineComponent({
  name: 'HomeView',
  components: {
    GraphCard,
    MessagesSentCard,
    UpdateAvailableBanner,
  },
  setup() {
    const store = useStore();
    const refreshedSecondsAgo = ref(0);
    const isRefreshing = ref(false);
    const lastRefreshed = computed(() => store.getters.lastRefreshed as number);
    let refreshTimer: number | undefined;

    const updateLastRefreshed = () => {
      refreshedSecondsAgo.value = Math.floor((Date.now() - lastRefreshed.value) / 1000);
    };

    const fetchApiDetails = async () => {
      const apiKey = localStorage.getItem('apiKey');
      if (!apiKey) return;

      // Fetch sent messages and app state from the server.
      const data = await getAppData();
      if (data) {
        store.commit('setSentMessages', data.sentMessages);
      }

      // Always query P&W directly with the stored API key so the dashboard
      // shows accurate usage regardless of what the server reports.
      const details = await getPwApiKeyDetails(apiKey).catch(() => ({ used: 0, max: 0 }));
      if (details.max > 0) {
        store.commit('setAPIDetails', details);
      } else if (data && data.apiDetails.max > 0) {
        store.commit('setAPIDetails', data.apiDetails);
      }
    };

    const refreshData = async () => {
      if (isRefreshing.value) return;

      isRefreshing.value = true;
      try {
        await fetchApiDetails();
        store.commit('setLastRefreshed', Date.now());
        updateLastRefreshed();
      } finally {
        isRefreshing.value = false;
      }
    };

    onMounted(async () => {
      updateLastRefreshed();
      refreshTimer = window.setInterval(updateLastRefreshed, 1000);
      await refreshData();
    });

    onBeforeUnmount(() => {
      if (refreshTimer) {
        window.clearInterval(refreshTimer);
      }
    });

    return {
      refreshedSecondsAgo,
      isRefreshing,
      refreshData,
    };
  },
});
</script>

<style scoped>
  .dashboard-cards-container {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
  }

  .dashboard-card {
    margin-top: 16px;
  }

  .dashboard-refresh-button {
    position: fixed;
    right: 24px;
    bottom: 24px;
    z-index: 10;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4) !important;
    transition: transform 0.15s ease !important;
  }

  .dashboard-refresh-button:hover {
    transform: scale(1.06);
  }

  .home {
    min-height: 100%;
  }

  @media only screen and (min-width: 450px) {
    .dashboard-card {
      margin-right: 0px;
    }
  }
</style>
