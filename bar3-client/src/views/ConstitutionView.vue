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
      <p class="constitution-hero__eyebrow">The TRF Codex</p>
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

      <form class="constitution-search" role="search" @submit.prevent="goToFirstSearchResult">
        <label class="constitution-search__label" for="constitution-search">Search constitution</label>
        <div class="constitution-search__control">
          <input
            id="constitution-search"
            v-model="searchQuery"
            type="search"
            autocomplete="off"
            placeholder="Search articles, rules, amendments..."
          >
          <button v-if="searchQuery" type="button" @click="searchQuery = ''">Clear</button>
        </div>
        <div v-if="searchQuery" class="constitution-search__results" aria-live="polite">
          <button
            v-for="result in searchResults"
            :key="result.id"
            class="constitution-search__result"
            type="button"
            @click="onSearchResultClick(result.id)"
          >
            <span class="constitution-search__result-title">{{ result.title }}</span>
            <span class="constitution-search__result-snippet">{{ result.snippet }}</span>
          </button>
          <div v-if="searchResults.length === 0" class="constitution-search__empty">
            No matching sections found.
          </div>
        </div>
      </form>
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
const constitutionMarkdown = ref('');
const isDarkMode = ref(false);
const loading = ref(true);
const mobileTocOpen = ref(false);
const searchQuery = ref('');
const toc = ref<TocItem[]>([]);
const showLoginHomeLink = ref(false);

interface SearchableSection extends TocItem {
  text: string;
}

interface SearchResult extends TocItem {
  snippet: string;
}

let observer: IntersectionObserver | null = null;
let mediaQuery: MediaQueryList | null = null;
let colorSchemeListener: ((event: MediaQueryListEvent) => void) | null = null;

const sectionIds = computed(() => toc.value.map((item) => item.id));
const searchableSections = computed(() => buildSearchableSections(constitutionMarkdown.value, toc.value));
const searchResults = computed<SearchResult[]>(() => {
  const query = normalizeSearchText(searchQuery.value);
  if (!query) return [];

  return searchableSections.value
    .filter((section) => normalizeSearchText(`${section.title} ${section.text}`).includes(query))
    .slice(0, 8)
    .map((section) => ({
      id: section.id,
      level: section.level,
      title: section.title,
      snippet: buildSearchSnippet(section, query),
    }));
});

function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function stripSearchMarkdown(value: string): string {
  return value
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#*_~>:-]/g, ' ')
    .replace(/&mdash;/gi, '—')
    .replace(/&ndash;/gi, '–')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildSearchableSections(markdown: string, items: TocItem[]): SearchableSection[] {
  const sections: SearchableSection[] = [];
  let current: SearchableSection | null = null;
  let tocIndex = 0;
  let containerDepth = 0;

  markdown.split(/\r?\n/).forEach((line) => {
    const trimmedLine = line.trim();
    if (/^:::\s*(law|lore|amendment)\b/.test(trimmedLine)) {
      containerDepth += 1;
    } else if (containerDepth > 0 && trimmedLine === ':::') {
      containerDepth -= 1;
    }

    const headingMatch = containerDepth === 0 ? /^(#{1,4})\s+(.+?)\s*#*\s*$/.exec(line) : null;
    if (headingMatch) {
      const item = items[tocIndex];
      tocIndex += 1;
      if (!item) return;

      current = { ...item, text: item.title };
      sections.push(current);
      return;
    }

    if (current) {
      current.text = `${current.text} ${stripSearchMarkdown(line)}`.trim();
    }
  });

  return sections;
}

function buildSearchSnippet(section: SearchableSection, normalizedQuery: string): string {
  const text = stripSearchMarkdown(section.text);
  const normalizedText = normalizeSearchText(text);
  const matchIndex = normalizedText.indexOf(normalizedQuery);
  if (matchIndex === -1) return text.slice(0, 140);

  const start = Math.max(0, matchIndex - 45);
  const end = Math.min(text.length, matchIndex + normalizedQuery.length + 95);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return `${prefix}${text.slice(start, end).trim()}${suffix}`;
}

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

function onSearchResultClick(id: string) {
  mobileTocOpen.value = false;
  scrollToSection(id);
}

function goToFirstSearchResult() {
  const [firstResult] = searchResults.value;
  if (firstResult) scrollToSection(firstResult.id);
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
  constitutionMarkdown.value = markdown;
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

.constitution-search {
  @apply mx-auto mt-7 max-w-2xl text-left;
}

.constitution-search__label {
  @apply mb-2 block font-interface text-xs font-black uppercase tracking-[0.22em] text-codex-wax dark:text-amber-300;
}

.constitution-search__control {
  @apply flex overflow-hidden rounded-2xl border border-codex-gold/50 bg-white/85 shadow-md dark:border-amber-300/25 dark:bg-zinc-950/85;
}

.constitution-search__control input {
  @apply min-w-0 flex-1 bg-transparent px-4 py-3 font-interface text-sm text-codex-ink outline-none placeholder:text-stone-500 dark:text-stone-100 dark:placeholder:text-stone-500;
}

.constitution-search__control button {
  @apply border-l border-codex-gold/30 px-4 font-interface text-xs font-black uppercase tracking-[0.14em] text-codex-wax transition hover:bg-codex-gold/15 dark:border-amber-300/20 dark:text-amber-200;
}

.constitution-search__results {
  @apply mt-3 max-h-80 overflow-auto rounded-2xl border border-codex-gold/40 bg-white/95 p-2 shadow-lg dark:border-amber-300/20 dark:bg-zinc-950/95;
}

.constitution-search__result {
  @apply mb-2 block w-full rounded-xl px-3 py-2 text-left transition hover:bg-codex-gold/15 focus:bg-codex-gold/15 focus:outline-none dark:hover:bg-amber-300/10 dark:focus:bg-amber-300/10;
}

.constitution-search__result-title {
  @apply block font-interface text-sm font-black text-codex-wax dark:text-amber-200;
}

.constitution-search__result-snippet {
  @apply mt-1 block font-interface text-xs leading-5 text-stone-700 dark:text-stone-300;
}

.constitution-search__empty {
  @apply px-3 py-4 text-center font-interface text-sm text-stone-600 dark:text-stone-300;
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
