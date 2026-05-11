<template>
  <div>
    <!-- Desktop sidebar (md and above) -->
    <v-navigation-drawer
      v-if="!$vuetify.breakpoint.smAndDown"
      permanent
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
            src="@/assets/bar3.png"
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

    <!-- Mobile bottom navigation (sm and below) - always visible, never collapses -->
    <v-bottom-navigation
      v-if="$vuetify.breakpoint.smAndDown"
      app
      fixed
      dark
      color="primary"
      background-color="#1A1A1A"
      :value="selectedItem"
    >
      <v-btn
        v-for="(item, index) in items"
        :key="item.title"
        :value="index"
        :disabled="disabled"
        @click="goto(item.path)"
        text
        small
      >
        <span style="font-size: 11px;">{{ item.title }}</span>
        <v-icon small>{{ item.icon }}</v-icon>
      </v-btn>
    </v-bottom-navigation>
  </div>
</template>

<script lang="ts">
  import { SideBarItem } from '@/types';
import Vue from 'vue';
  import Component from "vue-class-component";
  import { Prop, Watch } from "vue-property-decorator";

  @Component
  export default class SideBar extends Vue {
    isShowing = false;

    get isAdmin(): boolean {
      return this.$store.getters.isAdmin;
    }


    get items(): SideBarItem[] {
      const base: SideBarItem[] = [
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
];
      if (this.isAdmin) {
        base.push({
          title: 'Bot',
          icon: 'mdi-robot',
          path: '/bot',
        });
      }
      return base;
    }

    selectedItem = 0;

    goto(path: string) {
      if (this.$route.path != path) {
        this.$router.push({'path': path})
      }
    }

    @Prop(Boolean) value!: boolean;
    @Prop(Boolean) disabled!: boolean;

    mounted() {
      this.isShowing = this.value;
    }

    @Watch('value')
    valueChanged(val: boolean) {
      this.isShowing = val;
    }

    @Watch('isShowing')
    isShowingChanged(val: boolean) {
      this.$emit('input', val); 
    }

    @Watch('$route.path', { immediate: true, deep: true })
    onPathChange(value: string) {
      let option;
      let index;
      for ([index, option] of Object.entries(this.items)) {
        if (option.path === value) {
          this.selectedItem = parseInt(index);
          break;
        }
      }
    }
  }
</script>
