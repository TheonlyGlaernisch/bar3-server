<template>
  <div>
    <!-- Sidebar -->
    <v-navigation-drawer
      v-model="isShowing"
      :permanent="!$vuetify.breakpoint.mobile"
      :temporary="$vuetify.breakpoint.mobile"
      app
      dark
      color="#1A1A1A"
      class="elevation-0"
    >
      <v-list-item style="height: 63px;">
        <div class="text-h5 mt-3 mb-3 font-weight-medium d-flex align-center" @click="$router.push({'path': '/'})">
          <v-img
            class="shrink mr-2"
            contain
            src="/src/favicon.ico"
            transition="scale-transition"
            width="45"
          />
          <div class="ml-2 white--text">
            Bar 3
          </div>
        </div>
      </v-list-item>

      <v-divider style="border-color: rgba(255, 107, 0, 0.4);"></v-divider>

      <v-list
        dense
        nav
        shaped
        class="pl-0"
      >
        <v-list-item-group
          v-model="selectedItem"
          mandatory
          color="primary"
        >
          <v-list-item
            v-for="item in items"
            :key="item.title"
            :disabled="disabled"
            @click="goto(item.path)"
            dark
          >
            <v-list-item-icon>
              <v-icon>{{ item.icon }}</v-icon>
            </v-list-item-icon>

            <v-list-item-content>
              <v-list-item-title>{{ item.title }}</v-list-item-title>
            </v-list-item-content>
          </v-list-item>
        </v-list-item-group>
      </v-list>
    </v-navigation-drawer>

  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { SideBarItem } from '@/types';

export default defineComponent({
  name: 'SideBar',
  emits: ['update:modelValue'],
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
      selectedItem: 0,
    };
  },
  computed: {
    isAdmin(): boolean {
      return this.$store.getters.isAdmin;
    },
    hasClientRole(): boolean {
      return this.$store.getters.hasClientRole;
    },
    hasMemberRole(): boolean {
      return this.$store.getters.hasMemberRole;
    },
    items(): SideBarItem[] {
      const base: SideBarItem[] = [];
      if (this.hasClientRole) {
        base.push(
          {
            title: 'Dashboard',
            icon: 'mdi-view-dashboard',
            path: '/dashboard',
          },
          {
            title: 'Automation',
            icon: 'mdi-robot-outline',
            path: '/automation',
          },
          {
            title: 'Configuration',
            icon: 'mdi-cog',
            path: '/config',
          },
          {
            title: 'Compose',
            icon: 'mdi-email-edit',
            path: '/message-creator',
          },
          {
            title: 'Analytics',
            icon: 'mdi-chart-line',
            path: '/analytics',
          },
          {
            title: 'Account',
            icon: 'mdi-account-circle',
            path: '/account',
          },
        );
      }
      if (this.hasMemberRole) {
        base.push(
          {
            title: 'Nation',
            icon: 'mdi-flag',
            path: '/nation',
          },
          {
            title: 'Alliance',
            icon: 'mdi-shield-account',
            path: '/alliance',
          },
        );
      }
      base.push(
        {
          title: 'About',
          icon: 'mdi-information',
          path: '/about',
        },
        {
          title: 'Help',
          icon: 'mdi-help-circle',
          path: '/help',
        },
      );
      if (this.isAdmin) {
        base.push({
          title: 'Bot',
          icon: 'mdi-robot',
          path: '/bot',
        });
      }
      return base;
    },
  },
  watch: {
    modelValue(val: boolean) {
      this.isShowing = val;
    },
    isShowing(val: boolean) {
      this.$emit('update:modelValue', val);
    },
    '$route.path': {
      handler(value: string) {
        let option;
        let index;
        for ([index, option] of Object.entries(this.items)) {
          if (option.path === value) {
            this.selectedItem = parseInt(index);
            break;
          }
        }
      },
      immediate: true,
    },
  },
  mounted() {
    this.isShowing = this.modelValue;
  },
  methods: {
    goto(path: string) {
      if (this.$route.path != path) {
        this.$router.push({'path': path});
      }
      if (this.$vuetify.breakpoint.mobile) this.isShowing = false;
    },
  },
});
</script>
