import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import store from './store';
import vuetify from './plugins/vuetify';
import '@mdi/font/css/materialdesignicons.css';
import { ensureGoogleTag } from '@/utilities/googleTag';

ensureGoogleTag();
document.title = 'TRF owns this thing';

const app = createApp(App);

const display = (vuetify as any)?.display;
app.config.globalProperties.$vuetify = {
  breakpoint: {
    get mobile() {
      return !!display?.mobile?.value;
    },
    get name() {
      return display?.name?.value || 'md';
    },
    get mdAndUp() {
      return !!display?.mdAndUp?.value;
    },
  },
};

app.use(store);
app.use(router);
app.use(vuetify);
app.mount('#app');
