<template>
  <v-dialog v-model="isOpen" max-width="400px">
    <v-card>
      <v-card-title class="text-h6">
        Confirm Bulk Send
      </v-card-title>
      <v-card-text>
        {{ message }}
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn text @click="cancel">
          Cancel
        </v-btn>
        <v-btn color="primary" @click="confirm">
          Send
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

@Component
export default class ConfirmDialog extends Vue {
  @Prop(String) message = '';
  @Prop(Boolean) value = false;

  get isOpen(): boolean {
    return this.value;
  }

  set isOpen(val: boolean) {
    this.$emit('input', val);
  }

  confirm() {
    this.$emit('confirm', true);
    this.isOpen = false;
  }

  cancel() {
    this.$emit('confirm', false);
    this.isOpen = false;
  }
}
</script>
