<template>
  <v-card
    variant="outlined"
    width="400px"
    height="380px"
  >
    <v-card-title>
      Sent Messages
    </v-card-title>
    <v-divider/>
    <v-list
      density="compact"
      class="scrolling-list"
    >
      <div
        v-for="(messageItem, index) in messageItems"
        :key="index"
      >
        <v-list-item>
          <template #prepend>
            <template v-if="messageItem.successful">
              <v-icon
                color="green"

              >
                mdi-check
              </v-icon>
            </template>
            <template v-else>
              <v-tooltip location="top">
                <template #activator="{ props }">
                  <v-icon
                    color="red"

                    v-bind="props"
                  >
                    mdi-close
                  </v-icon>
                </template>
                <span>{{ messageItem.error }}</span>
              </v-tooltip>
            </template>
          </template>
          <div>
            <v-list-item-title>
              {{ messageItem.nation.leader }}
            </v-list-item-title>
            <v-list-item-subtitle>
              {{ new Date(messageItem.sentTimeMilliseconds).toLocaleString() }}
            </v-list-item-subtitle>
          </div>
        </v-list-item>
        <v-divider/>
      </div>
      <div v-if="messageItems.length === 0" class="ml-4">
        No messages sent since you started Bar 3.
      </div>
    </v-list>
  </v-card>
</template>

<script lang="ts">
import { computed, defineComponent } from 'vue';
import { useStore } from 'vuex';
import { Message } from '@/types';

export default defineComponent({
  name: 'MessagesSentCard',
  setup() {
    const store = useStore();

    const messageItems = computed(() => (store.getters.sentMessages as Message[]).slice().reverse());

    return {
      messageItems,
    };
  },
});
</script>

<style scoped>
  .scrolling-list {
    max-height: 300px;
    overflow-y: auto;
  }
</style>