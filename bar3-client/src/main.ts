import Vue from 'vue'
import App from './App.vue'
import router from './router'
import store from './store'
import vuetify from './plugins/vuetify'
import { ensureGoogleTag } from '@/utilities/googleTag'

Vue.config.productionTip = false

ensureGoogleTag();
new Vue({
  router,
  store,
  vuetify,
  render: h => h(App)
}).$mount('#app')
