<template>
  <div v-html="marked" class="view-small-inner-wrapper view-padding-inner-wrapper">

  </div>
</template>

<script lang="ts">
  import { defineComponent } from 'vue';
  import MarkdownIt from 'markdown-it';
  import main from '!!raw-loader!@/assets/help/index.md';
  import { sanitizeHtml } from '@/utilities/sanitizeHtml';

  const markdownParser = new MarkdownIt({
    html: true,
    linkify: true,
    breaks: true,
  });

  export default defineComponent({
    name: 'HelpView',
    computed: {
      marked() {
        return sanitizeHtml(markdownParser.render(main));
      },
    },
  });
</script>
