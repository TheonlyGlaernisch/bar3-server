<template>
  <div v-html="marked" class="view-small-inner-wrapper view-padding-inner-wrapper">

  </div>
</template>

<script lang="ts">
  import {Component, Vue} from 'vue-property-decorator';
  import MarkdownIt from 'markdown-it';
  import main from '!!raw-loader!@/assets/help/index.md';
  import { sanitizeHtml } from '@/utilities/sanitizeHtml';

  const markdownParser = new MarkdownIt({
    html: true,
    linkify: true,
    breaks: true,
  });

  @Component
  export default class Help extends Vue {
    get marked() {
      return sanitizeHtml(markdownParser.render(main));
    }
  }
</script>
