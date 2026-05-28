<template>
  <div v-if="modelValue">
    <template v-if="$vuetify.breakpoint.name == 'xs'">
      <bottom-sheet
        v-model="bottomSheetState"
        v-if="bottomSheetState != 'close'"
      >
        <v-card-title>
          Test Your Message
        </v-card-title>
        <v-card-text>
          <div class="mt-2 mb-4">
            Send your message to someone you know to see how it turns out.
            You can't send it to yourself.
          </div>
          <v-text-field
            label="Nation ID"
            type="number"
            class="mt-2 mb-2"
            outlined
            v-model="nationDetails.nationID"
          />
          <v-text-field
            label="Nation Name"
            class="mt-2 mb-2"
            outlined
            v-model="nationDetails.nationName"
          />
          <v-text-field
            label="Leader Name"
            class="mt-2 mb-2"
            outlined
            v-model="nationDetails.leaderName"
          />
          <div class="d-flex">
            <v-btn
              class="ml-auto"
              color="primary"
              depressed
              dark
              @click="send()"
            >
              Send
            </v-btn>
          </div>
        </v-card-text>
      </bottom-sheet>
    </template>
    <template v-else>
      <v-dialog
        v-model="isShowing"
        width="500"
      >
        <v-card>
          <v-card-title>
            Test Your Message
          </v-card-title>
          <v-card-text>
            <div class="mt-2 mb-4">
              Send your message to someone you know to see how it turns out.
              You can't send it to yourself.
            </div>
            <v-text-field
              label="Nation ID"
              type="number"
              class="mt-2 mb-2"
              outlined
              v-model="nationDetails.nationID"
            />
            <v-text-field
              label="Nation Name"
              class="mt-2 mb-2"
              outlined
              v-model="nationDetails.nationName"
            />
            <v-text-field
              label="Leader Name"
              class="mt-2 mb-2"
              outlined
              v-model="nationDetails.leaderName"
            />
            <div class="d-flex">
              <v-btn
                class="ml-auto"
                color="primary"
                depressed
                dark
                @click="send()"
              >
                Send
              </v-btn>
            </div>
          </v-card-text>
        </v-card>
      </v-dialog>
    </template>
  </div>
</template>

<script lang="ts">
  import { defineComponent } from 'vue';
  import BottomSheet from '@/components/BottomSheet.vue';

  export default defineComponent({
    name: 'TestMessageDialog',
    components: {
      BottomSheet,
    },
    emits: ['update:modelValue', 'send'],
    props: {
      modelValue: {
        type: Boolean,
        default: false,
      },
      disabled: {
        type: Boolean,
        default: false,
      },
    },
    data() {
      return {
        isShowing: false,
        bottomSheetState: 'close',
        nationDetails: {
          nationID: 0,
          nationName: 'TestNationName',
          leaderName: 'TestLeaderName',
        },
      };
    },
    computed: {
      config() {
        return this.$store.getters.config;
      },
    },
    watch: {
      modelValue(val: boolean) {
        this.isShowing = val;
        if (val) this.bottomSheetState = 'open';
      },
      isShowing(val: boolean) {
        this.$emit('update:modelValue', val);
      },
      bottomSheetState(val: string) {
        if (val == 'close') {
          this.$emit('update:modelValue', false);
        }
      },
    },
    mounted() {
      this.isShowing = this.modelValue;
      if (this.modelValue) this.bottomSheetState = 'open';
    },
    methods: {
      send() {
        this.$emit('send', this.nationDetails);
      },
    },
  });
</script>