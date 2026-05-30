<template>
  <aside class="lore-box">
    <div class="lore-box__kicker">Archive Lore</div>
    <div class="lore-box__content" v-html="html" />
  </aside>
</template>

<script setup lang="ts">
defineProps<{
  html: string;
}>();
</script>

<style scoped>
.lore-box {
  @apply my-8 rounded-2xl border border-indigo-300/40 bg-gradient-to-br from-indigo-50 via-slate-50 to-cyan-50 p-6 shadow-lg dark:border-cyan-300/20 dark:from-indigo-950/60 dark:via-slate-950 dark:to-cyan-950/50;
}

.lore-box__kicker {
  @apply mb-3 font-interface text-xs font-black uppercase tracking-[0.3em] text-indigo-700 dark:text-cyan-200;
}

.lore-box__content :deep(p) {
  @apply m-0 text-base italic leading-8 text-slate-700 dark:text-slate-200;
}
</style>
