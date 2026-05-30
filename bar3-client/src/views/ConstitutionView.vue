<template>
  <main :class="['constitution-shell', { dark: isDarkMode }]">
    <a
      v-if="showLoginHomeLink"
      class="constitution-login-home"
      href="/auth/login"
      aria-label="Back to login"
      title="Back to login"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
      </svg>
    </a>

    <section class="constitution-hero">
      <div class="constitution-hero__seal">B3</div>
      <p class="constitution-hero__eyebrow">The Bar 3 Codex</p>
      <h1>Constitution</h1>
      <p class="constitution-hero__lede">
        The living charter for conduct, lore, and amendments. This page is rendered from a standalone markdown source so the law can evolve without rebuilding the presentation layer.
      </p>
      <div class="constitution-hero__actions">
        <button class="constitution-theme-button" type="button" @click="isDarkMode = !isDarkMode">
          {{ isDarkMode ? 'Light parchment' : 'Dark codex' }}
        </button>
        <a class="constitution-theme-button constitution-theme-button--ghost" href="#preamble">Begin reading</a>
      </div>
    </section>

    <div class="constitution-layout">
      <aside class="constitution-sidebar" aria-label="Constitution table of contents">
        <div class="constitution-sidebar__card">
          <div class="constitution-sidebar__title">Articles</div>
          <nav>
            <a
              v-for="item in toc"
              :key="item.id"
              :class="['constitution-toc-link', `constitution-toc-link--level-${item.level}`, { 'constitution-toc-link--active': activeSection === item.id }]"
              :href="`#${item.id}`"
              @click="onTocClick(item.id)"
            >
              <span>{{ item.title }}</span>
            </a>
          </nav>
        </div>
      </aside>

      <section class="constitution-mobile-toc">
        <button class="constitution-mobile-toc__button" type="button" @click="mobileTocOpen = !mobileTocOpen">
          <span>Table of contents</span>
          <span>{{ mobileTocOpen ? '−' : '+' }}</span>
        </button>
        <nav v-if="mobileTocOpen" class="constitution-mobile-toc__panel">
          <a
            v-for="item in toc"
            :key="item.id"
            :class="['constitution-toc-link', `constitution-toc-link--level-${item.level}`, { 'constitution-toc-link--active': activeSection === item.id }]"
            :href="`#${item.id}`"
            @click="onTocClick(item.id)"
          >
            <span>{{ item.title }}</span>
          </a>
        </nav>
      </section>

      <article class="constitution-document" aria-live="polite">
        <div v-if="loading" class="constitution-loading">Illuminating the codex…</div>
        <template v-else>
          <template v-for="(block, index) in blocks" :key="`${block.type}-${index}`">
            <div v-if="block.type === 'html'" class="constitution-prose" v-html="block.html" />
            <law-block v-else-if="block.type === 'law'" :html="block.html" :severity="block.severity" />
            <lore-box v-else-if="block.type === 'lore'" :html="block.html" />
            <amendment-note v-else :html="block.html" :version="block.version" />
          </template>
        </template>
      </article>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { discordAuth } from '@/utilities/discordAuth';
import AmendmentNote from '@/components/constitution/AmendmentNote.vue';
import LawBlock from '@/components/constitution/LawBlock.vue';
import LoreBox from '@/components/constitution/LoreBox.vue';
import { getConstitutionMarkdown } from '@/services/constitutionSource';
import { ConstitutionBlock, renderConstitutionMarkdown, TocItem } from '@/services/constitutionRenderer';

const route = useRoute();

const activeSection = ref('');
const blocks = ref<ConstitutionBlock[]>([]);
const isDarkMode = ref(false);
const loading = ref(true);
const mobileTocOpen = ref(false);
const toc = ref<TocItem[]>([]);
const showLoginHomeLink = ref(false);

let observer: IntersectionObserver | null = null;
let mediaQuery: MediaQueryList | null = null;
let colorSchemeListener: ((event: MediaQueryListEvent) => void) | null = null;

const sectionIds = computed(() => toc.value.map((item) => item.id));

function scrollToSection(id: string) {
  const target = document.getElementById(id);
  if (!target) return;
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  history.replaceState(null, '', `${route.path}#${id}`);
  activeSection.value = id;
}

function onTocClick(id: string) {
  mobileTocOpen.value = false;
  scrollToSection(id);
}

function setupScrollSpy() {
  observer?.disconnect();
  observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];

      if (!visible?.target.id) return;
      activeSection.value = visible.target.id;
      history.replaceState(null, '', `${route.path}#${visible.target.id}`);
    },
    {
      rootMargin: '-22% 0px -65% 0px',
      threshold: [0, 1],
    },
  );

  sectionIds.value.forEach((id) => {
    const element = document.getElementById(id);
    if (element) observer?.observe(element);
  });
}

function setupColorScheme() {
  mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  isDarkMode.value = mediaQuery.matches;
  colorSchemeListener = (event: MediaQueryListEvent) => {
    isDarkMode.value = event.matches;
  };
  mediaQuery.addEventListener('change', colorSchemeListener);
}

onMounted(async () => {
  setupColorScheme();
  discordAuth.getSession()
    .then((session) => { showLoginHomeLink.value = !session.authenticated; })
    .catch(() => { showLoginHomeLink.value = true; });
  const markdown = await getConstitutionMarkdown();
  const rendered = renderConstitutionMarkdown(markdown);
  blocks.value = rendered.blocks;
  toc.value = rendered.toc;
  activeSection.value = rendered.toc[0]?.id ?? '';
  loading.value = false;

  await nextTick();
  setupScrollSpy();

  const hash = decodeURIComponent(window.location.hash.replace(/^#/, ''));
  if (hash) {
    window.setTimeout(() => scrollToSection(hash), 50);
  }
});

onBeforeUnmount(() => {
  observer?.disconnect();
  if (mediaQuery && colorSchemeListener) {
    mediaQuery.removeEventListener('change', colorSchemeListener);
  }
});
</script>

<style scoped>
.constitution-shell {
  @apply min-h-screen bg-gradient-to-br from-codex-parchment via-codex-vellum to-amber-100 px-4 py-8 text-codex-ink transition-colors duration-300 md:px-8;
}

.constitution-shell.dark {
  @apply from-codex-night via-zinc-950 to-codex-steel text-stone-100;
}

.constitution-login-home {
  @apply fixed left-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-codex-gold/50 bg-white/80 text-codex-wax shadow-md backdrop-blur transition hover:-translate-y-0.5 hover:bg-codex-wax hover:text-white dark:border-amber-300/30 dark:bg-zinc-950/85 dark:text-amber-200 dark:hover:bg-amber-300 dark:hover:text-codex-ink;
}

.constitution-login-home svg {
  @apply h-5 w-5 fill-current;
}

.constitution-hero {
  @apply mx-auto mb-8 max-w-5xl rounded-[2rem] border border-codex-gold/40 bg-white/55 px-6 py-10 text-center shadow-codex backdrop-blur dark:border-amber-300/20 dark:bg-zinc-950/70 md:px-12;
}

.constitution-hero__seal {
  @apply mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border-4 border-double border-codex-gold bg-codex-wax font-constitution text-xl font-black text-amber-100 shadow-seal;
}

.constitution-hero__eyebrow {
  @apply mb-3 font-interface text-xs font-black uppercase tracking-[0.35em] text-codex-wax dark:text-amber-300;
}

.constitution-hero h1 {
  @apply m-0 font-constitution text-5xl font-bold tracking-tight md:text-7xl;
}

.constitution-hero__lede {
  @apply mx-auto mt-5 max-w-3xl font-interface text-base leading-8 text-stone-700 dark:text-stone-300 md:text-lg;
}

.constitution-hero__actions {
  @apply mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row;
}

.constitution-theme-button {
  @apply rounded-full border border-codex-wax bg-codex-wax px-5 py-2.5 font-interface text-sm font-bold uppercase tracking-[0.16em] text-white transition hover:-translate-y-0.5 hover:bg-codex-ember hover:shadow-lg dark:border-amber-300 dark:bg-amber-300 dark:text-codex-ink;
}

.constitution-theme-button--ghost {
  @apply bg-transparent text-codex-wax hover:text-white dark:text-amber-200;
}

.constitution-layout {
  @apply mx-auto grid max-w-7xl gap-8 lg:grid-cols-[18rem_minmax(0,1fr)];
}

.constitution-sidebar {
  @apply hidden lg:block;
}

.constitution-sidebar__card {
  @apply sticky top-24 max-h-[calc(100vh-7rem)] overflow-auto rounded-2xl border border-codex-gold/40 bg-white/70 p-4 shadow-seal backdrop-blur dark:border-amber-300/20 dark:bg-zinc-950/80;
}

.constitution-sidebar__title {
  @apply mb-3 border-b border-codex-gold/30 pb-3 font-interface text-xs font-black uppercase tracking-[0.28em] text-codex-wax dark:text-amber-300;
}

.constitution-mobile-toc {
  @apply lg:hidden;
}

.constitution-mobile-toc__button {
  @apply flex w-full items-center justify-between rounded-2xl border border-codex-gold/50 bg-white/80 px-5 py-4 font-interface text-sm font-black uppercase tracking-[0.18em] text-codex-wax shadow-md dark:bg-zinc-950/80 dark:text-amber-200;
}

.constitution-mobile-toc__panel {
  @apply mt-3 rounded-2xl border border-codex-gold/40 bg-white/90 p-3 shadow-lg dark:bg-zinc-950/95;
}

.constitution-toc-link {
  @apply mb-1 flex rounded-xl px-3 py-2 font-interface text-sm font-semibold text-stone-700 transition hover:bg-codex-gold/15 hover:text-codex-wax dark:text-stone-300 dark:hover:text-amber-200;
}

.constitution-toc-link--level-2 { @apply pl-6 text-xs; }
.constitution-toc-link--level-3 { @apply pl-9 text-xs opacity-80; }
.constitution-toc-link--level-4 { @apply pl-12 text-xs opacity-70; }

.constitution-toc-link--active {
  @apply bg-codex-wax text-white shadow-md hover:bg-codex-wax hover:text-white dark:bg-amber-300 dark:text-codex-ink;
}

.constitution-document {
  counter-reset: article;
  @apply mx-auto w-full max-w-4xl rounded-[2rem] border border-codex-gold/40 bg-codex-vellum/90 px-5 py-8 shadow-codex dark:border-amber-300/20 dark:bg-zinc-950/80 md:px-10 md:py-12;
}

.constitution-loading {
  @apply py-20 text-center font-interface text-sm uppercase tracking-[0.24em] text-codex-wax dark:text-amber-300;
}

.constitution-prose {
  @apply font-constitution text-lg leading-9 text-stone-800 dark:text-stone-100;
}

.constitution-prose :deep(.constitution-heading) {
  @apply relative mt-12 border-t border-codex-gold/30 pt-8 font-constitution font-bold leading-tight text-codex-ink dark:text-amber-50;
}

.constitution-prose :deep(h1.constitution-heading) {
  @apply text-4xl md:text-5xl;
}

.constitution-prose :deep(h1.constitution-heading--article) {
  counter-increment: article;
}

.constitution-prose :deep(h1.constitution-heading--article::before) {
  content: 'Article ' counter(article, upper-roman);
  @apply mb-2 block font-interface text-xs font-black uppercase tracking-[0.28em] text-codex-wax dark:text-amber-300;
}

.constitution-prose :deep(h2.constitution-heading) { @apply text-3xl; }
.constitution-prose :deep(h3.constitution-heading) { @apply text-2xl; }
.constitution-prose :deep(h4.constitution-heading) { @apply text-xl; }

.constitution-prose :deep(.constitution-anchor) {
  @apply absolute -left-5 top-8 font-interface text-codex-gold opacity-0 no-underline transition hover:text-codex-wax;
}

.constitution-prose :deep(.constitution-heading:hover .constitution-anchor) {
  @apply opacity-100;
}

.constitution-prose :deep(p) {
  @apply my-5;
}

.constitution-prose :deep(ul),
.constitution-prose :deep(ol) {
  @apply my-5 pl-8;
}

.constitution-prose :deep(li) {
  @apply mb-2;
}

.constitution-prose :deep(strong) {
  @apply text-codex-wax dark:text-amber-300;
}

.constitution-prose :deep(hr) {
  @apply my-10 border-0 border-t border-codex-gold/40;
}
</style>
