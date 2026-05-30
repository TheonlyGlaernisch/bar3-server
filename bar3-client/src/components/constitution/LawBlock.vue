<template>
  <aside :class="['law-block', severityClass]">
    <div class="law-block__rail" />
    <div class="law-block__body">
      <div class="law-block__header">
        <span class="law-block__seal">§</span>
        <span class="law-block__label">Binding Law</span>
        <span class="law-block__severity">{{ severityLabel }}</span>
      </div>
      <div class="law-block__content" v-html="html" />
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  html: string;
  severity?: string;
}>();

const severity = computed(() => props.severity ?? 'standard');
const severityClass = computed(() => `law-block--${severity.value}`);
const severityLabel = computed(() => severity.value.replace(/-/g, ' ').toUpperCase());
</script>

<style scoped>
.law-block {
  @apply relative my-8 overflow-hidden rounded-2xl border bg-white/85 shadow-seal backdrop-blur dark:bg-zinc-950/80;
  border-color: rgba(139, 30, 30, 0.25);
}

.law-block__rail {
  @apply absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-codex-wax via-codex-ember to-codex-gold;
}

.law-block__body {
  @apply p-5 pl-7 md:p-7 md:pl-9;
}

.law-block__header {
  @apply mb-3 flex flex-wrap items-center gap-3 font-interface text-xs font-bold uppercase tracking-[0.24em] text-codex-wax dark:text-amber-300;
}

.law-block__seal {
  @apply flex h-8 w-8 items-center justify-center rounded-full bg-codex-wax text-lg text-white shadow-md;
}

.law-block__severity {
  @apply rounded-full border border-codex-wax/30 bg-codex-wax/10 px-3 py-1 text-[0.65rem] text-codex-wax dark:border-amber-300/40 dark:bg-amber-300/10 dark:text-amber-200;
}

.law-block--high {
  @apply ring-2 ring-codex-wax/25;
}

.law-block--high .law-block__severity {
  @apply bg-codex-wax text-white dark:bg-red-500;
}

.law-block__content :deep(p) {
  @apply m-0 text-lg leading-8 text-stone-800 dark:text-stone-100;
}
</style>
