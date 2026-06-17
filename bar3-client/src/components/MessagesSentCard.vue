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
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 107, 0, 0.4) transparent;
  }
  
  .scrolling-list::-webkit-scrollbar { width: 4px; }
  
  .scrolling-list::-webkit-scrollbar-track {
    background: rgba(255,255,255,0.03);
  }
  
  .scrolling-list::-webkit-scrollbar-thumb {
    background: rgba(255, 107, 0, 0.4);
    border-radius: 2px;
  }
  
  .scrolling-list::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 107, 0, 0.65);
  }
  
  /* Card glassmorphism (applied to the root v-card) */
  :deep(.v-card) {
    background: rgba(26, 26, 26, 0.85) !important;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 107, 0, 0.12) !important;
  }
  
  /* Row hover */
  :deep(.v-list-item:hover) {
    background: rgba(255, 107, 0, 0.05) !important;
    transition: background 0.2s ease;
  }
  
  /* Gradient list dividers */
  :deep(.v-divider) {
    border: none !important;
    height: 1px;
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(255, 107, 0, 0.2) 50%,
      transparent 100%
    );
  }
  
  /* Icon glow */
  :deep(.v-icon[style*="color: green"]),
  :deep(.v-icon.text-green) {
    filter: drop-shadow(0 0 5px rgba(76, 175, 80, 0.6));
  }
  
  :deep(.v-icon[style*="color: red"]),
  :deep(.v-icon.text-red) {
    filter: drop-shadow(0 0 5px rgba(255, 82, 82, 0.6));
  }
</style>
