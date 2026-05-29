<template>
  <transition name="slideup">
    <v-card class="save-changes-card elevation-5" v-if="modelValue">
      <v-card-title>
        Save Your Changes
      </v-card-title>
      <v-card-text>
        <v-btn
          variant="flat"
          block
          color="primary"
          @click="save()"
        >
          <v-icon
            class="mr-1"
          >
            mdi-check
          </v-icon>
          Save
        </v-btn>
      </v-card-text>
    </v-card>
  </transition>
</template>

<script lang="ts">
  import { defineComponent } from 'vue';

  export default defineComponent({
    name: 'SavedChangesCard',
    emits: ['save'],
    props: {
      modelValue: {
        type: Boolean,
        default: false,
      },
    },
    methods: {
      save() {
        this.$emit('save');
      },
    },
  });
</script>

<style>
  .save-changes-card {
    position: fixed;
    bottom: 50px;
    right: 50px;
    width: 300px;
  }

  @media only screen and (max-width: 450px) {
    .save-changes-card {
      width: calc(100% - 20px);
      right: 10px;
      left: 10px;
    }
  }

  .slideup-enter-active, .slideup-leave-active {
    transition: bottom 0.2s ease-out
  }
  .slideup-enter, .slideup-leave-to {
    bottom: -200px;
  }
</style>