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


app.use(store);
app.use(router);
app.use(vuetify);
app.mount('#app');
