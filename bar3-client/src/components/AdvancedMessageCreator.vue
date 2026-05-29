<template>
  <div>
    <div class="text-subtitle-1 font-weight-medium mb-2">
      Your HTML
    </div>
    <v-textarea
      v-model="html"
      class="editor-field"
      variant="outlined"
      rows="12"
      no-resize
      spellcheck="false"
      @update:model-value="debouncedDigest()"
    />

    <div class="text-subtitle-1 font-weight-medium mt-4 mb-2">
      Your CSS
    </div>
    <v-textarea
      v-model="css"
      class="editor-field"
      variant="outlined"
      rows="12"
      no-resize
      spellcheck="false"
      @update:model-value="debouncedDigest()"
    />

    <div class="text-subtitle-1 font-weight-medium mt-4 mb-2">
      Preview
    </div>
    <div>
      <preview-message :htmlPreview="digested" class="preview"/>
    </div>
  </div>
</template>
<script lang="ts">
  import { defineComponent } from 'vue';
  import PreviewMessage from '@/components/PreviewMessage.vue';
  import juice from 'juice';
  import { debounce } from 'debounce';
  import { sanitizeHtml } from '@/utilities/sanitizeHtml';

  export default defineComponent({
    name: 'AdvancedMessageCreator',
    components: {
      PreviewMessage,
    },
    props: {
      inputHTML: {
        type: String,
        default: '',
      },
      inputCSS: {
        type: String,
        default: '',
      },
    },
    emits: ['change', 'css', 'html'],
    data() {
      return {
        html: '<div></div>',
        css: '',
        digested: '',
        debouncedDigest: (() => {}) as () => void,
      };
    },
    created() {
      this.debouncedDigest = debounce(this.digest, 500) as () => void;
    },
    mounted() {
      this.html = this.inputHTML || '';
      this.css = this.inputCSS || '';

      this.digest();
    },
    watch: {
      inputHTML(value: string) {
        this.html = value || '';
        this.debouncedDigest();
      },
      inputCSS(value: string) {
        this.css = value || '';
        this.debouncedDigest();
      },
    },
    methods: {
      digest() {
        const digested = juice(sanitizeHtml(this.html), {
          extraCss: this.css.replace(/\n/g, ''),
          preserveMediaQueries: false,
          preserveFontFaces: false,
          preserveKeyFrames: false,
        });

        this.digested = digested;
        this.$emit('change', digested);
        this.$emit('css', this.css);
        this.$emit('html', this.html);
      },
    },
  });
</script>
<style scoped>
  .preview {
    border-radius: 5px;
    padding: 10px;
    min-height: 200px;
    width: 100%;
    font-family: "Roboto", Arial, sans-serif;
  }

  .editor-field :deep(textarea) {
    font-family: "Fira Code", "Fira Mono", Consolas, Menlo, Courier, monospace;
    font-size: 14px;
    line-height: 1.5;
  }
</style>
