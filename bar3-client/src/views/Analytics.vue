<template>
  <div class="view-small-inner-wrapper view-padding-inner-wrapper fill-height mb-10">

    <!-- V2 Analytics Graph Section -->
    <div v-if="v2LoggedIn && v2AnalyticsLoaded">
      <v-row>
        <v-col cols="12">
          <h1>Analytics</h1>
        </v-col>
      </v-row>
      <div class="mb-4 mt-4">
        <analytics-graph-card :campaign="v2Campaign" class="mt-4"/>
      </div>
      <v-row>
        <v-col cols="12" md="4">
          <v-card variant="outlined" height="250px">
            <v-card-title>Views</v-card-title>
            <v-card-text>
              <h4>Total Message Views</h4>
              <h2>{{ v2ViewsTotal }}</h2>
            </v-card-text>
          </v-card>
        </v-col>
        <v-col cols="12" md="8">
          <v-card height="250px" variant="outlined">
            <v-card-title>Links</v-card-title>
            <v-divider/>
            <v-list density="compact" class="scrolling-list">
              <div v-for="l in v2Analytics.links" :key="l.shortId">
                <v-list-item>
                  <template #prepend><v-icon>mdi-link-variant</v-icon></template>
                  <div>
                    <v-list-item-title>{{ linkName(l.url) }}</v-list-item-title>
                    <v-list-item-subtitle>{{ l.clickCount }} Clicks</v-list-item-subtitle>
                  </div>
                </v-list-item>
                <v-divider/>
              </div>
              <div v-if="v2Analytics.links.length === 0" class="ml-4 pa-2 text-grey">
                No tracked links yet.
              </div>
            </v-list>
          </v-card>
        </v-col>
      </v-row>
    </div>

    <!-- Legacy campaign analytics section -->
    <div v-if="enabled" class="mt-8">
      <v-row>
        <v-col cols="12" md="8">
          <h2>Campaign Analytics</h2>
        </v-col>
        <v-col cols="12" md="4">
          <v-select
            class="ml-auto"
            :items="campaigns"
            v-model="selectedCampaign"
            return-object
            v-if="loaded"
            variant="filled"
            hide-details
            item-title="name"
            label="Select a Campaign"
            append-icon="mdi-plus-circle"
            @click:append="openCreateDialog()"
          >
          </v-select>
        </v-col>
      </v-row>
      <div class="mb-4 mt-4">
        <analytics-graph-card v-if="loaded" :campaign="selectedCampaign" class="mt-4"/>
      </div>
      <v-row>
      <v-col cols="12" md="4">
        <v-card
          variant="outlined"
          height="250px"
          v-if="loaded"
        >
            <v-card-title>
              Views
            </v-card-title>
            <v-card-text>
              <h4>
                Viewed to Sent Messages Ratio
              </h4>
              <h2>
                {{ selectedCampaign.messagePixel.readCount }} / {{ selectedCampaign.sentCount }}
              </h2>
            </v-card-text>
          </v-card>
        </v-col>
        <v-col cols="12" md="8">
          <analytics-link-card v-if="loaded" :campaign="selectedCampaign"/>
        </v-col>
      </v-row>

      <create-campaign-dialog v-model="createCampaignDialog" @created="createdNewCampaign()"/>
    </div>

    <v-container class="fill-height" fluid v-else-if="loaded && !v2LoggedIn">
      <v-row class="text-center mt-n16">
        <v-col class="ma-auto" style="max-width: fit-content" xs="10" md="7">
          <h2>
            Analytics
          </h2>
          <div>
            Enable analytics in <router-link to="/config">Configuration</router-link> to get access to message analytics.
            Message Analytics allows you to track the number of views and clicks of links inside your messages
            over time.
          </div>
        </v-col>
      </v-row>
    </v-container>

    <div v-if="!loaded && !v2AnalyticsLoaded">
      <v-skeleton-loader
        class="mx-auto"
        type="image"
      ></v-skeleton-loader>
      <v-row class="mt-6">
        <v-col cols="12" md="6">
          <v-skeleton-loader
            class="mx-auto"
            type="image"
          ></v-skeleton-loader>
        </v-col>
        <v-col cols="12" md="6">
          <v-skeleton-loader
            class="mx-auto"
            type="image"
          ></v-skeleton-loader>
        </v-col>
      </v-row>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import AnalyticsGraphCard from '@/components/AnalyticsGraphCard.vue';
import AnalyticsLinkCard from '@/components/AnalyticsLinksCard.vue';
import CreateCampaignDialog from '@/components/CreateAnalyticsCampaignDialog.vue';
import getCampaigns from '@/actions/getAnalyticalCampaigns';
import getConfig from '@/actions/getConfig';
import { AnalyticalCampaign } from '@/interfaces/analytics';
import { v2Api } from '@/utilities/v2Api';

export default defineComponent({
  name: 'AnalyticsManager',
  components: {
    AnalyticsGraphCard,
    AnalyticsLinkCard,
    CreateCampaignDialog
  },
  data() {
    return {
      loaded: false,
      enabled: false,
      selectedCampaign: null as AnalyticalCampaign | null,
      createCampaignDialog: false,
      v2AnalyticsLoaded: false,
      v2Analytics: { links: [], messages: [] } as any,
    };
  },
  computed: {
    v2LoggedIn(): boolean {
      return this.$store.getters.isLoggedIn;
    },
    v2ViewsTotal(): number {
      return (this.v2Analytics?.messages || []).reduce((sum: number, m: any) => sum + (m.viewCount || 0), 0);
    },
    v2ClicksTotal(): number {
      return (this.v2Analytics?.links || []).reduce((sum: number, l: any) => sum + (l.clickCount || 0), 0);
    },
    /** Build a synthetic AnalyticalCampaign from v2 data for the graph card. */
    v2Campaign(): AnalyticalCampaign {
      const links = (this.v2Analytics?.links || []) as any[];
      const messages = (this.v2Analytics?.messages || []) as any[];

      // Collect all view timestamps across messages (full history if server returns it,
      // otherwise fall back to lastViewedAt as a single-point proxy).
      const allViewTimes: number[] = [];
      for (const m of messages) {
        if (Array.isArray(m.viewHistory) && m.viewHistory.length) {
          for (const t of m.viewHistory) allViewTimes.push(new Date(t).getTime());
        } else if (m.lastViewedAt) {
          allViewTimes.push(new Date(m.lastViewedAt).getTime());
        }
      }
      allViewTimes.sort((a, b) => a - b);

      const mappedLinks = links.map((l: any) => {
        const clickTimes: number[] = [];
        if (Array.isArray(l.clickHistory) && l.clickHistory.length) {
          for (const t of l.clickHistory) clickTimes.push(new Date(t).getTime());
        } else if (l.lastClickedAt) {
          clickTimes.push(new Date(l.lastClickedAt).getTime());
        }
        clickTimes.sort((a, b) => a - b);
        return {
          url: l.url,
          id: l.shortId,
          auth: '',
          readCount: l.clickCount || 0,
          readHistory: clickTimes,
        };
      });

      return {
        _id: 'v2',
        name: 'Message Analytics',
        sentCount: 0,
        createdTime: allViewTimes[0] || Date.now(),
        links: mappedLinks,
        messagePixel: {
          id: 'v2',
          auth: '',
          readCount: this.v2ViewsTotal,
          readHistory: allViewTimes,
        },
      };
    },
    campaigns() {
      return this.$store.getters['analytics/campaigns'];
    },
  },
  methods: {
    linkName(urlString: string): string {
      try {
        const url = new URL(urlString);
        return url.hostname + url.pathname;
      } catch {
        return urlString;
      }
    },
    openCreateDialog() {
      this.createCampaignDialog = true;
    },
    createdNewCampaign() {
      this.loaded = false;

      this.loadAnalytics();
    },
    async loadAnalytics() {
      this.enabled = true;

      await getCampaigns();

      if (this.campaigns.length > 0) {
        this.selectedCampaign = this.campaigns[this.campaigns.length - 1];
        this.loaded = true;
      } else {
        this.openCreateDialog();
      }
    },
  },
  async mounted() {
    if (this.v2LoggedIn) {
      try {
        this.v2Analytics = await v2Api.getMyAnalytics();
      } finally {
        this.v2AnalyticsLoaded = true;
      }
    }

    const config = await getConfig();

    if (config && !(config instanceof Error) && config.analyticsEnabled) {
      await this.loadAnalytics();
    } else {
      this.loaded = true;
    }
  },
});
</script>

<style scoped>
/* Stat number accent */
:deep(.v-card-text h2) {
  color: #FF9500;
}

/* Links list row hover */
:deep(.v-list-item:hover) {
  background: rgba(255, 255, 255, 0.03) !important;
  transition: background 0.15s ease;
}
</style>
