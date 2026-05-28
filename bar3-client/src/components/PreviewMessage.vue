<template>
  <div class="red-msg">
    <div v-html="safeHtmlPreview" class="pa-3"></div>
  </div>
</template>
<script lang="ts">
  import { defineComponent } from 'vue';
  import { sanitizeHtml } from '@/utilities/sanitizeHtml';

  export default defineComponent({
    name: 'PreviewMessage',
    props: {
      htmlPreview: {
        type: String,
        default: '',
      },
    },
    computed: {
      safeHtmlPreview(): string {
        return sanitizeHtml(this.htmlPreview || '');
      },
    },
  });
</script>
<style scoped>
  .red-msg {
    background-color: #e4b6ae;
  }
</style>
