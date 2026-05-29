<template>
  <v-btn
    :color="applicationOn ? 'green' : 'red'"
    variant="flat"
    :disabled="disabled"
    @click="toggleApplication()"
  >
    <v-icon
      class="mr-1"
    >
      mdi-power
    </v-icon>
    {{ applicationOn ? 'Turn Bar3 Off' : 'Turn Bar3 On' }}
  </v-btn>
</template>

<script lang="ts">
  import { defineComponent } from 'vue';
  import setApplicationState from '@/actions/setApplicationState';

  export default defineComponent({
    name: 'ApplicationOnControl',
    props: {
      disabled: {
        type: Boolean,
        default: false,
      },
    },
    computed: {
      applicationOn() {
        return this.$store.getters.applicationOn;
      },
    },
    methods: {
      toggleApplication() {
        this.$store.commit('setApplicationState', !this.applicationOn);
        setApplicationState(this.applicationOn);
      },
    },
  });
</script>