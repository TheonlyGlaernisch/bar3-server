import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import store from './store';
import vuetify from './plugins/vuetify';
import '@mdi/font/css/materialdesignicons.css';
import './styles/tailwind.css';
import { ensureGoogleTag } from '@/utilities/googleTag';

ensureGoogleTag();
document.title = 'TRF owns this thing';

const app = createApp(App);


if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => undefined);
}

app.use(store);
app.use(router);
app.use(vuetify);
app.mount('#app');
