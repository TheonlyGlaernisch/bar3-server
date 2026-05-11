# Bar 3 Client

This is the web interface for [Bar 3](https://github.com/TheonlyGlaernisch/bar3-server). It is written in Vue and is built using a framework called Vuetify.
**If you are looking to use Bar 3, you need to use the link above.**

## Project setup
```
npm install
```

### Compiles and hot-reloads for development
```
npm run serve
```

### Compiles and minifies for production
```
npm run build
```

### Lints and fixes files
```
npm run lint
```

## Auth/cookie configuration for Safari/iOS with two domains

If your frontend and backend use different domains, Safari/iOS may block third-party cookies for
Discord session checks. Set:

- `VUE_APP_API_URL` to your backend API domain
- `VUE_APP_AUTH_URL` to a same-site frontend-domain reverse proxy that forwards `/auth/*` and
  `/api/bot/*` to the backend

This keeps cookie-authenticated requests first-party on Apple devices while leaving API routing
configurable.

## Required server-side changes (bar3-server)

One file in `TheonlyGlaernisch/bar3-server` **must** be edited for the Dashboard to work
correctly for v2 (MongoDB-backed) users. Two additional edits are optional but recommended.

> **Note on analytics:** `src/api/routers/v2/analytics.ts` already returns full
> `clickHistory` and `viewHistory` arrays — no changes needed there.

---

### ✅ Required – Push v2 automation sent-messages into per-user state (`src/services/v2AutomationRunner.ts`)

The automation runner currently discards the return value of `sendMessageWithConfig`, so
`/api/appData` never sees any v2-sent messages and the *Messages Sent* card is always empty.
Two additions are needed:

**a) Add imports at the top of the file:**

```diff
+import { Config } from '../interfaces/types';
+import state from '../services/state';
 import superagent from 'superagent';
```

**b) Inside the per-account send loop, capture the result and push it to the session:**

```diff
-    await messagesService.sendMessageWithConfig(configLike, nation).catch(() => undefined);
-    seen.add(nation.nation_id);
+    const msg = await messagesService.sendMessageWithConfig(configLike, nation).catch(() => undefined);
+    if (msg) {
+      // Ensure a per-user session slot exists so /api/appData can return the message.
+      if (!state.userKeys[pwKey]) {
+        state.userKeys[pwKey] = { sentMessages: [], config: new Config(), applicationOn: false, apiDetails: { used: 0, max: 0 } };
+      }
+      state.userKeys[pwKey].sentMessages.push(msg);
+    }
+    seen.add(nation.nation_id);
```

---

### ⚪ Optional – Add `apiDetails` to `UserKeyState` (`src/services/state.ts`)

> **Note:** The client now always queries the P&W GraphQL API directly with the stored API
> key to retrieve request usage, so the server no longer needs to supply this value.
> These two changes are recommended only as a defensive fallback (e.g. if the browser
> cannot reach `api.politicsandwar.com`).

The per-user session object is missing an `apiDetails` slot. The `/appData` route currently
falls back to the global `state.requestsUsed / requestsMax` counters, which are always `0`
for v2 users.

```diff
 interface UserKeyState {
   sentMessages: unknown[];
   config: Config;
   applicationOn: boolean; // per-user runtime toggle (NOT persisted)
+  apiDetails: { used: number; max: number };
 }
```

Then in `src/api/index.ts`, two edits:

**a) `ensureSession()` — initialise the new field:**

```diff
     state.userKeys[apiKey] = {
       sentMessages: [],
       config: sessionConfig,
       applicationOn: false,
+      apiDetails: { used: 0, max: 0 },
     };
```

**b) `GET /api/appData` — return per-user details instead of the global counters:**

```diff
-    apiDetails: {
-      used: state.requestsUsed,
-      max: state.requestsMax,
-    },
+    apiDetails: scopedSession.apiDetails ?? { used: state.requestsUsed, max: state.requestsMax },
```
