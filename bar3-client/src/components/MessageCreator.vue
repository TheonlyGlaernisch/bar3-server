<template>
  <div>
    <div id="toolbar">
    </div>

    <div id="editor" class="editor no-overflow" ref="editor">
    </div>
  </div>
</template>
<script lang="ts">
  import { defineComponent } from 'vue';
  import Quill from 'quill';
  import 'quill/dist/quill.snow.css';
  import juice from 'juice';
  import quillStyles from '!!raw-loader!quill/dist/quill.snow.css';
  import { debounce } from 'debounce';
  import { sanitizeHtml } from '@/utilities/sanitizeHtml';

  export default defineComponent({
    name: 'MessageCreator',
    props: {
      inputHTML: {
        type: String,
        default: '',
      },
    },
    emits: ['change'],
    data() {
      return {
        messageQuill: '',
        editor: null as Quill | null,
        toolbarOptions: [
      ['bold', 'italic', 'underline', 'strike'],        // toggled buttons
      ['blockquote', 'code-block'],

      // [{ 'header': 1 }, { 'header': 2 }],               // custom button values
      [{ 'list': 'ordered'}, { 'list': 'bullet' }],
      // [{ 'script': 'sub'}, { 'script': 'super' }],      // superscript/subscript
      // [{ 'indent': '-1'}, { 'indent': '+1' }],          // outdent/indent
      [{ 'direction': 'rtl' }],                         // text direction

      // [{ 'size': ['small', false, 'large', 'huge'] }],  // custom dropdown
      [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
      [ 'link', 'video'],

      [{ 'color': [] }, { 'background': [] }],          // dropdown with defaults from theme
      [{ 'font': [] }],
      [{ 'align': [] }],

      ['clean']                                         // remove formatting button
        ],
      };
    },
    watch: {
      inputHTML(value: string) {
        this.messageQuill = sanitizeHtml(value || '');
        this.editor?.clipboard.dangerouslyPasteHTML(this.messageQuill);
      },
    },
    mounted() {
      this.editor = new Quill('#editor', {
        modules: { toolbar: this.toolbarOptions },
        theme: 'snow',
      });

      this.editor.on('text-change', debounce((delta: any, oldContents: any, source: string) => {
        if (source != 'user') return;

        this.digestQuill((this.$refs.editor as Element).children[0].innerHTML);
      }, 120));

      this.messageQuill = this.inputHTML || '';
      this.editor?.setText(this.messageQuill);
    },
    beforeUnmount() {
      this.editor?.disable();
      this.digestQuill((this.$refs.editor as Element).children[0].innerHTML);
    },
    methods: {
      digestQuill(html: string) {
        const digested = juice(sanitizeHtml(html), {
          extraCss: quillStyles,
          preserveMediaQueries: false,
          preserveFontFaces: false,
          preserveKeyFrames: false,
        });

        this.$emit('change', digested);
      },
    },
  });
</script>

<style scoped>
  .editor {
    min-height: 30vh;
    color: black;
  }
</style>

<style>
  .v-window {
      overflow: visible !important;
  }
</style>
