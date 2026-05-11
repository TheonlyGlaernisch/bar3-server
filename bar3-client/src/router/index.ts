import Vue from 'vue'
import VueRouter, { RouteConfig } from 'vue-router'

import Home from '@/views/Home.vue'
import Configuration from '@/views/Configuration.vue'
import MessageCreator from '@/views/MessageCreator.vue'
import Analytics from '@/views/Analytics.vue'
import AccountManager from '@/components/AccountManager.vue'
import About from '@/views/About.vue'
import Help from '@/views/Help.vue'
import DiscordLogin from '@/views/DiscordLogin.vue'
import DiscordCallback from '@/views/DiscordCallback.vue'
import BotPanel from '@/views/BotPanel.vue'
import { discordAuth } from '@/utilities/discordAuth'
import { normalizeReturnTo } from '@/utilities/serverUrls'

Vue.use(VueRouter)

const DISCORD_PUBLIC_PATHS = ['/discord-login', '/auth/discord/callback'];

const routes: Array<RouteConfig> = [
  { path: '/', redirect: '/dashboard' },
  { path: '/dashboard', name: 'Dashboard', component: Home },
  { path: '/automation', name: 'Automation', component: MessageCreator },
  { path: '/config', name: 'Configuration', component: Configuration },
  { path: '/message-creator', name: 'Message Creator', component: MessageCreator },
  { path: '/analytics', name: 'Analytics', component: Analytics },
  { path: '/account', name: 'Account', component: AccountManager },
  { path: '/about', name: 'About', component: About },
  { path: '/help', name: 'Help', component: Help },
  { path: '/discord-login', name: 'Discord Login', component: DiscordLogin },
  { path: '/auth/discord/callback', name: 'Discord Callback', component: DiscordCallback },
  { path: '/bot', name: 'Bot Panel', component: BotPanel, meta: { requiresBotAuth: true } },
]

const router = new VueRouter({
  mode: 'history',
  routes
})

router.beforeEach(async (to, _from, next) => {
  const queryDiscordToken = to.query.discordToken;
  if (typeof queryDiscordToken === 'string' && queryDiscordToken.trim()) {
    discordAuth.setSessionToken(queryDiscordToken);
    const cleanedQuery = { ...to.query };
    delete cleanedQuery.discordToken;
    next({ path: to.path, query: cleanedQuery, replace: true });
    return;
  }

  if (DISCORD_PUBLIC_PATHS.includes(to.path)) {
    next();
    return;
  }

  const authed = await discordAuth.isAuthed();
  if (!authed) {
    next(`/discord-login?returnTo=${encodeURIComponent(to.fullPath)}`);
    return;
  }

  // Bot panel access is controlled by the Discord session admin flag.
  if (to.meta?.requiresBotAuth) {
    const session = await discordAuth.getSession();
    if (!session.isAdmin) {
      next('/dashboard');
      return;
    }
  }

  // Consume a ?returnTo= parameter left by the server after OAuth, but only
  // accept relative paths to prevent open-redirect attacks.
  if (to.query.returnTo) {
    const returnTo = normalizeReturnTo(to.query.returnTo);
    if (returnTo) {
      next({ path: returnTo, replace: true });
      return;
    }
  }

  next();
});

export default router
