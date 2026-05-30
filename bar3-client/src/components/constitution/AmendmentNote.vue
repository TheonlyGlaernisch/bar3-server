<template>
  <aside class="amendment-note">
    <div class="amendment-note__badge">Amendment {{ version }}</div>
    <div class="amendment-note__content" v-html="html" />
  </aside>
</template>

<script setup lang="ts">
defineProps<{
  html: string;
  version?: string;
}>();
</script>

<style scoped>
.amendment-note {
  @apply my-7 rounded-xl border border-codex-gold/40 bg-codex-gold/10 p-5 font-interface shadow-sm dark:border-amber-300/30 dark:bg-amber-300/10;
}

.amendment-note__badge {
  @apply mb-2 inline-flex rounded-full bg-codex-gold px-3 py-1 text-xs font-black uppercase tracking-[0.2em] text-codex-ink dark:bg-amber-300;
}

.amendment-note__content :deep(p) {
  @apply m-0 text-sm leading-7 text-stone-700 dark:text-stone-200;
}
</style>
