<template>
  <v-dialog
    v-model="dialog"
    width="500"
  >
    <v-card>
      <v-card-title>
        <div class="d-flex align-center mb-2 mt-2">
          <v-avatar
            color="primary"
            size="40"
          >
            <v-icon

            >
              mdi-chart-timeline-variant
            </v-icon>
          </v-avatar>

          <v-card-title class="headline font-weight-medium">
            Create a new Campaign
          </v-card-title>
        </div>
      </v-card-title>

      <v-card-text>
        <div class="mb-8">
          Creating a new campaign will allow you to begin recording new information about your current message setup.
          It gives you insights on how many views your messages has and how many times and when links inside your messages have been clicked.
        </div>
        <v-text-field
          filled
          label="New Campaign Name"
          v-model="campaignName"
        >

        </v-text-field>
      </v-card-text>


      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn
          color="primary"
          variant="text"
          @click="dialog = false"
        >
          Cancel
        </v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :loading="loading"
          @click="createCampaign()"
        >
          Create
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import createNewCampaign from '@/actions/createNewCampaign';

export default defineComponent({
  name: 'CreateAnalyticsCampaignDialog',
  emits: ['update:modelValue', 'created'],
  props: {
    modelValue: {
      type: Boolean,
      default: false,
    },
  },
  data() {
    return {
      loading: false,
      campaignName: '',
    };
  },
  computed: {
    dialog: {
      get(): boolean {
        return this.modelValue;
      },
      set(val: boolean) {
        this.$emit('update:modelValue', val);
      },
    },
  },
  methods: {
    async createCampaign() {
      this.loading = true;

      let error = false;
      await createNewCampaign(this.campaignName).catch(() => {
        this.loading = false;
        alert('Failed to create campaign, make sure your campaign\'s name is unique or the server is running. Otherwise contact us or try again later.');
        error = true;
      });

      if (!error) {
        this.dialog = false;
        this.$emit('created');
      }

      this.loading = false;
    },
  },
});
</script>