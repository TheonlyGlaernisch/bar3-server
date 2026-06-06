import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router';

import Home from '@/views/Home.vue';
import Configuration from '@/views/Configuration.vue';
import MessageCreator from '@/views/MessageCreator.vue';
import Analytics from '@/views/Analytics.vue';
import AccountManager from '@/components/AccountManager.vue';
import About from '@/views/About.vue';
import Help from '@/views/Help.vue';
import ConstitutionView from '@/views/ConstitutionView.vue';
import DiscordCallback from '@/views/DiscordCallback.vue';
import BotPanel from '@/views/BotPanel.vue';
import Nation from '@/views/Nation.vue';
import Alliance from '@/views/Alliance.vue';
import Chat from '@/components/Chat.vue';
import { discordAuth } from '@/utilities/discordAuth';
import { normalizeReturnTo } from '@/utilities/serverUrls';

const DISCORD_PUBLIC_PATHS = ['/auth/discord/callback'];

const routes: Array<RouteRecordRaw> = [
  { path: '/', redirect: '/dashboard' },
  { path: '/dashboard', name: 'Dashboard', component: Home, meta: { requiresClientAccess: true } },
  { path: '/automation', name: 'Automation', component: MessageCreator, meta: { requiresClientAccess: true } },
  { path: '/config', name: 'Configuration', component: Configuration, meta: { requiresClientAccess: true } },
  { path: '/message-creator', name: 'Message Creator', component: MessageCreator, meta: { requiresClientAccess: true } },
  { path: '/analytics', name: 'Analytics', component: Analytics, meta: { requiresClientAccess: true } },
  { path: '/account', name: 'Account', component: AccountManager, meta: { requiresClientAccess: true } },
  { path: '/nation', name: 'Nation', component: Nation, meta: { requiresMemberAccess: true } },
  { path: '/alliance', name: 'Alliance', component: Alliance, meta: { requiresMemberAccess: true } },
  { path: '/chat', name: 'Chat', component: Chat, meta: { requiresMemberAccess: true } },
  { path: '/about', name: 'About', component: About },
  { path: '/help', name: 'Help', component: Help },
  { path: '/constitution', name: 'Constitution', component: ConstitutionView, meta: { requiresMemberAccess: true } },
  { path: '/auth/discord/callback', name: 'Discord Callback', component: DiscordCallback, meta: { public: true } },
  { path: '/bot', name: 'Bot Panel', component: BotPanel, meta: { requiresBotAuth: true } },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach(async (to) => {
  if (to.meta?.public || DISCORD_PUBLIC_PATHS.includes(to.path)) {
    return true;
  }

  const session = await discordAuth.getSession();
  if (!session.authenticated) {
    const loginParams = new URLSearchParams();
    const returnTo = normalizeReturnTo(to.fullPath);
    if (returnTo) {
      loginParams.set('returnTo', returnTo);
    }
    window.location.assign(`/auth/login?${loginParams.toString()}`);
    return false;
  }

  const hasClientAccess = session.roles.bar3Client || session.roles.bar3Server || session.isAdmin;
  const hasMemberAccess = session.roles.memberGuild || session.isAdmin;

  if (to.meta?.requiresClientAccess && !hasClientAccess) {
    return hasMemberAccess ? '/nation' : '/about';
  }

  if (to.meta?.requiresMemberAccess && !hasMemberAccess) {
    return hasClientAccess ? '/dashboard' : '/about';
  }

  if (to.meta?.requiresBotAuth && !session.isAdmin) {
    return hasClientAccess ? '/dashboard' : (hasMemberAccess ? '/nation' : '/about');
  }

  if (to.query.returnTo) {
    const returnTo = normalizeReturnTo(to.query.returnTo);
    if (returnTo) {
      return { path: returnTo, replace: true };
    }
  }

  return true;
});

export default router;
