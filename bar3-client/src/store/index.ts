import { GitHubRelease } from '@/types';
import Vue from 'vue'
import Vuex from 'vuex'

Vue.use(Vuex)

import analytics from './modules/analytics';
import { API_BASE_URL } from '@/utilities/serverUrls';

export default new Vuex.Store({
  state: {
    isApplicationOn: false,
    serverIP: API_BASE_URL,
    sentMessages: [],
    lastRefreshed: 0,
    packageVersion: process.env.PACKAGE_VERSION || '0',
    serverVersion: '',
    apiDetails: {
      used: 0,
      max: 0,
    },
    newUpdate: null as null | GitHubRelease,
    isLoggedIn: !!localStorage.getItem('apiKey'),
    isDiscordAuthed: false,
    isAdmin: false,
    discordRoles: {
      verified: false,
      bar3Client: false,
      bar3Server: false,
      memberGuild: false,
    },
    isBotAuthed: false
  },
  getters: {
    applicationOn(state) {
      return state.isApplicationOn;
    },

    serverIP(state) {
      return state.serverIP;
    },
    isLoggedIn: (state) => state.isLoggedIn,
    isDiscordAuthed: (state) => state.isDiscordAuthed,
    isAdmin: (state) => state.isAdmin,
    discordRoles: (state) => state.discordRoles,
    hasClientRole: (state) => state.discordRoles.bar3Client || state.discordRoles.bar3Server || state.isAdmin,
    hasMemberRole: (state) => state.discordRoles.memberGuild,
    isBotAuthed: (state) => state.isBotAuthed,

    sentMessages(state) {
      return state.sentMessages;

      const twoHours = 7200000;

      return [{
        nation: {
          name: 'One',
          leader: 'One',
        },
        sentTimeMilliseconds: Date.now(),
        successful: true
      },
      {
        nation: {
          name: 'Two',
          leader: 'Two',
        },
        sentTimeMilliseconds: Date.now() + twoHours * 1.5,
        successful: true
      },
      {
        nation: {
          name: 'Three',
          leader: 'Three',
        },
        sentTimeMilliseconds: Date.now() + twoHours * 5,
        successful: true
      },
      {
        nation: {
          name: 'Three',
          leader: 'Three',
        },
        sentTimeMilliseconds: Date.now() + twoHours * 5.2,
        successful: true
      },
      {
        nation: {
          name: 'Three',
          leader: 'Three',
        },
        sentTimeMilliseconds: Date.now() + twoHours * 5.3,
        successful: true
      },
      {
        nation: {
          name: 'Four',
          leader: 'Four',
        },
        sentTimeMilliseconds: Date.now() + twoHours * 7.8,
        successful: false,
        error: 'Nation too new!'
      }];
    },

    appVersion: (state) => {
      return state.packageVersion;
    },

    serverVersion: (state) => {
      return state.serverVersion;
    },

    apiDetails: (state) => {
      return state.apiDetails;
    },

    lastRefreshed: (state) => {
      return state.lastRefreshed;
    },

    newUpdate: (state) => {
      return state.newUpdate;
    }
  },
  mutations: {
    setApplicationState(state, isOn) {
      state.isApplicationOn = isOn;
    },
    setLoggedIn(state, isLoggedIn) {
    state.isLoggedIn = isLoggedIn;
    },
    setDiscordAuthed(state, value: boolean) {
      state.isDiscordAuthed = value;
    },
    setIsAdmin(state, value: boolean) {
      state.isAdmin = value;
    },
    setDiscordRoles(state, value: {
      verified?: boolean;
      bar3Client?: boolean;
      bar3Server?: boolean;
      memberGuild?: boolean;
    }) {
      state.discordRoles = {
        verified: value?.verified === true,
        bar3Client: value?.bar3Client === true,
        bar3Server: value?.bar3Server === true,
        memberGuild: value?.memberGuild === true,
      };
    },
    setBotAuthed(state, value: boolean) {
      state.isBotAuthed = value;
    },

    setSentMessages(state, sentMessagesRefresh) {
      state.sentMessages = sentMessagesRefresh;
    },

    setAPIDetails(state, newAPIDetails: {used: number; max: number}) {
        state.apiDetails = newAPIDetails;
    },

    setLastRefreshed: (state, time: number) => {
      state.lastRefreshed = time;
    },

    setNewUpdate(state, update: GitHubRelease) {
      state.newUpdate = update;
    },

    setServerVersion(state, newServerVersion: string) {
      state.serverVersion = newServerVersion;
    }
  },
  actions: {
  },
  modules: {
    analytics
  }
})
