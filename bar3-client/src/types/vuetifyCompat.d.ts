import { ComponentCustomProperties } from 'vue';

declare module '@vue/runtime-core' {
  interface ComponentCustomProperties {
    $vuetify: {
      breakpoint: {
        mobile: boolean;
        name: string;
        mdAndUp: boolean;
      };
    };
  }
}

export {};
