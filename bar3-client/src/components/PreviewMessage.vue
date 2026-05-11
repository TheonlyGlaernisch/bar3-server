<template>
  <div class="red-msg">
    <div v-html="safeHtmlPreview" class="pa-3"></div>
  </div>
</template>
<script lang="ts">
  import Vue from 'vue';
  import Component from "vue-class-component";
  import { Prop } from 'vue-property-decorator';
  import { sanitizeHtml } from '@/utilities/sanitizeHtml';

  @Component
  export default class Preview extends Vue {
    @Prop(String) htmlPreview!: string

    get safeHtmlPreview(): string {
      return sanitizeHtml(this.htmlPreview || '');
    }
  }
</script>
<style scoped>
  .red-msg {
    background-color: #e4b6ae;
  }
</style>
