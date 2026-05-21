import Vue from 'vue'
import VueRouter, { RouteConfig } from 'vue-router'

import Home from '@/views/Home.vue'
import Configuration from '@/views/Configuration.vue'
import MessageCreator from '@/views/MessageCreator.vue'
import Analytics from '@/views/Analytics.vue'
import AccountManager from '@/components/AccountManager.vue'
import About from '@/views/About.vue'
import Help from '@/views/Help.vue'
import DiscordCallback from '@/views/DiscordCallback.vue'
import BotPanel from '@/views/BotPanel.vue'
import Nation from '@/views/Nation.vue'
import Alliance from '@/views/Alliance.vue'
import { discordAuth } from '@/utilities/discordAuth'
import { normalizeReturnTo } from '@/utilities/serverUrls'

Vue.use(VueRouter)

const DISCORD_PUBLIC_PATHS = ['/auth/discord/callback'];

const routes: Array<RouteConfig> = [
  { path: '/', redirect: '/dashboard' },
  { path: '/dashboard', name: 'Dashboard', component: Home, meta: { requiresClientAccess: true } },
  { path: '/automation', name: 'Automation', component: MessageCreator, meta: { requiresClientAccess: true } },
  { path: '/config', name: 'Configuration', component: Configuration, meta: { requiresClientAccess: true } },
  { path: '/message-creator', name: 'Message Creator', component: MessageCreator, meta: { requiresClientAccess: true } },
  { path: '/analytics', name: 'Analytics', component: Analytics, meta: { requiresClientAccess: true } },
  { path: '/account', name: 'Account', component: AccountManager, meta: { requiresClientAccess: true } },
  { path: '/nation', name: 'Nation', component: Nation, meta: { requiresMemberAccess: true } },
  { path: '/alliance', name: 'Alliance', component: Alliance, meta: { requiresMemberAccess: true } },
  { path: '/about', name: 'About', component: About },
  { path: '/help', name: 'Help', component: Help },
  { path: '/auth/discord/callback', name: 'Discord Callback', component: DiscordCallback },
  { path: '/bot', name: 'Bot Panel', component: BotPanel, meta: { requiresBotAuth: true } },
]

const router = new VueRouter({
  mode: 'history',
  routes
})

router.beforeEach(async (to, _from, next) => {
  if (DISCORD_PUBLIC_PATHS.includes(to.path)) {
    next();
    return;
  }

  const session = await discordAuth.getSession();
  if (!session.authenticated) {
    const loginParams = new URLSearchParams();
    const returnTo = normalizeReturnTo(to.fullPath);
    if (returnTo) {
      loginParams.set('returnTo', returnTo);
    }
    window.location.assign(`/auth/login?${loginParams.toString()}`);
    next(false);
    return;
  }

  const hasClientAccess = session.roles.bar3Client || session.roles.bar3Server || session.isAdmin;
  const hasMemberAccess = session.roles.memberGuild;

  if (to.meta?.requiresClientAccess && !hasClientAccess) {
    next(hasMemberAccess ? '/nation' : '/about');
    return;
  }

  if (to.meta?.requiresMemberAccess && !hasMemberAccess) {
    next(hasClientAccess ? '/dashboard' : '/about');
    return;
  }

  // Bot panel access is controlled by ADMIN_DISCORD_IDS.
  if (to.meta?.requiresBotAuth) {
    if (!session.isAdmin) {
      next(hasClientAccess ? '/dashboard' : (hasMemberAccess ? '/nation' : '/about'));
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
