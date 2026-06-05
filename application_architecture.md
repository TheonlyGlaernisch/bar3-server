
# Architecture Overview

This document outlines the core functionality, architecture, and API endpoints of the application.

## Core Components

### 1. Configuration System
- Manages application settings via `Config` class.
- Stores API key, message subject, HTML content, analytics settings, update intervals, and queue timing.
- Supports versioning (`configVersion`) and configurable editor state.

### 2. Message & Nation Data Model
- `Message` interface defines message metadata: sent time, nation details, success status, and error messages.
- `NationAPICall` namespace contains interfaces for API responses:
  - `Nation`: Full nation data including leader, cities, military units, alliances, and timestamps.
  - `ApiRequest`, `ApiKeyDetails`, `ApiDetails`: API metadata for rate limiting and versioning.

### 3. Queuing & Processing
- `QueuedNation` interface tracks nations awaiting processing with timestamp.
- `searchLoop` and `clearQueue` jobs manage background processing:
  - `searchLoop`: Starts a PnW WebSocket subscription to receive nation-create events in real time.
  - `clearQueue`: Periodically sends queued nations and removes stale entries.

### 4. Analytics System
- Tracks message views and link clicks via `/analytics/v2` endpoints.
- Supports:
  - Public link tracking: `/analytics/v2/l/:shortId` redirects with click logging.
  - Message view tracking: `/analytics/v2/p/:messageId` returns a 1x1 transparent GIF with view logging.
  - Authenticated analytics dashboard: `/analytics/v2/me` returns recent link clicks and message views.

### 5. Account & Authentication
- `AccountService` manages account lifecycle and API key handling.
- `/account` endpoint returns account details (API key, creation date) after API key authentication.
- Legacy API key creation is disabled via `/api-key/create` (returns 410).
- v2 session-based authentication is available via `/api/v2/auth/login` and `/api/v2/auth/logout`.
- Discord OAuth2 authentication is handled via `/auth/discord` and `/auth/discord/callback`, delegating role checks to the flame_bot HTTP API.

### 6. Discord Bot (flame_bot)

The Discord bot is a **separate Node.js process** (`discord-bot/`) that runs independently from the main server. The two services communicate only via HTTP.

- **Bot Core**: Built using `discord.js` v14, connects to Discord via the gateway and handles slash commands and button interactions.
- **Actual Bot Commands** (selected examples):
  - `/register <nation_id>`: Links a Discord account to a PnW nation after verifying the in-game Discord field.
  - `/unregister`: Removes a nation registration.
  - `/whois <query>`: Looks up a nation by ID, name, or @mention.
  - `/alliance_info <query>`, `/alliance_members <query>`, `/alliance_lots_of_info <query>`: Alliance lookup commands.
  - `/slots`: Shows open defensive war slots for configured alliances.
  - `/war_range_targets`, `/spy_target_find`, `/missile_targets_find`: Combat targeting tools.
  - `/damage_leaderboard`: 7-day ranked damage output for the primary alliance.
  - `/revenue`, `/infra`, `/city_cost`: Economic calculators.
  - `/request_grant`: Submits a grant request to a configured channel.
  - `/counter`: Records counter-war requests.
  - `/help`: Lists all commands by category.
- **Event Listeners**:
  - `interactionCreate`: Handles slash commands and button/modal interactions.
  - `messageCreate`: Handles per-channel translation (English ↔ Croatian).
  - `guildMemberAdd`: Sends configurable welcome messages.
  - `ready`: Syncs slash commands and persists guild metadata on startup.
- **bar3 HTTP API**: When `API_KEY` is set, the bot exposes an HTTP API on `API_PORT` (default 8080) used by the main server to check Discord roles after OAuth login (`GET /api/roles/:discord_id`).

### 7. API Endpoints Summary

| Endpoint | Method | Description |
|---|---|---|
| `GET /analytics/v2/l/:shortId` | Public | Redirects to target URL after logging a click. Validates redirect URL. |
| `GET /analytics/v2/p/:messageId` | Public | Returns a 1x1 transparent GIF to log message views. Accepts optional `a` query param for account ID. |
| `GET /analytics/v2/me` | Authenticated | Returns recent analytics: link click history and message view history. Requires valid PwAccount session. |
| `GET /account` | Authenticated | Returns account details (API key, creation time) after API key validation. |
| `POST /api-key/create` | Public | Disabled. Returns 410 Gone. |
| `GET /auth/discord` | Public | Redirects browser to Discord OAuth2 authorization. |
| `GET /auth/discord/callback` | Public | Handles OAuth2 callback; checks roles via flame_bot and issues a session. |
| `GET /auth/session` | Public | Returns current Discord session state for the SPA. |
| `POST /api/v2/auth/login` | Public | Logs in with a PnW API key and creates a server-side session. |
| `GET /api/bot/servers` | Admin | Proxies to flame_bot; returns guilds the bot is in. |
| `GET /api/bot/commands/usage` | Admin | Proxies to flame_bot; returns ranked slash command usage counts. |
| `POST /api/bot/send` | Admin | Proxies to flame_bot; sends a message to all configured welcome channels. |
| `GET /api/member/nation` | Member | Proxies to flame_bot; returns nation/war context for the authenticated member. |

### 8. Background Jobs
- `searchLoop`: Starts a PnW WebSocket subscription (`PnWNationSubscriptionClient`) to receive nation-create events.
- `clearQueue`: Runs periodically to send queued nations and remove stale entries.
- `startAutomationLoop`: Starts a second PnW WebSocket subscription for the v2 multi-user automation system, dispatching new nations to all accounts with automation enabled.

### 9. Security & Validation
- All public redirects are validated using `isSafeRedirectUrl` to prevent open redirect vulnerabilities.
- API key authentication is enforced via `authenticateApiKey` and `requirePwSession` middleware.
- Discord OAuth2 uses PKCE and session regeneration to prevent fixation attacks.
- Analytics data is stored with account-scoped access.
- Discord bot commands enforce role-based access (`hasGovAccess`, `hasMemberAccess`, `hasAdminCommandAccess`).
- Same-origin enforcement is applied to all unsafe HTTP methods via `isTrustedOrigin`.

### 10. Data Flow
1. Nation-create events arrive via the PnW WebSocket subscription.
2. Nations are queued by `messages.addNationToQueue()` and sent by `clearQueue`.
3. Messages are sent to PnW with optional tracking links and view pixels injected by `injectTrackingIntoHtml`.
4. Analytics data is collected and stored in MongoDB via `TrackingLink` and `MessageView` models.
5. Users retrieve analytics via `/analytics/v2/me`.
6. Discord users authenticate via `/auth/discord`; the main server asks flame_bot for role data.
7. The flame_bot independently handles guild interactions: war alerts, counter requests, welcome messages, and grant requests.

### 11. Extensibility
- The modular design allows for easy addition of new tracking types, message delivery methods, and analytics integrations.
- The bot's guild configuration (alliances, channels, roles) is stored per-guild in MongoDB and modifiable via slash commands without redeployment.

### 12. Two-Service Architecture
The application runs as two independent services:

- **Main server** (`server/`): Handles the bar3 web UI, PnW message sending, analytics, v2 templates/automation, and Discord OAuth login.
- **flame_bot** (`discord-bot/`): Handles all Discord gateway interactions, PnW nation/alliance lookups, war alerts, and exposes the role-check HTTP API consumed by the main server.

The two services share a MongoDB Atlas cluster (`TRF` database for bot data, default database for server data) but share no code or in-process state.

Here's the corrected and expanded section:

---

## bar3-client Architecture

The client is a Vue 3 single-page application built with Vuetify 3 (dark theme, orange primary), TypeScript, and Tailwind CSS. It is deployed as a static site on Render with all routes rewritten to `index.html`.

### File Index

```
bar3-client/
├── src/
│   ├── actions/          API call helpers (getAppData, sendConfig, etc.)
│   ├── assets/           Static markdown content (help page)
│   ├── components/       Reusable Vue components
│   │   └── constitution/ Constitution-specific block components
│   ├── content/          Bundled fallback markdown (constitution.md)
│   ├── interfaces/       TypeScript interfaces (analytics)
│   ├── plugins/          Vuetify plugin setup
│   ├── router/           Vue Router with auth guards
│   ├── services/         Business logic (constitution renderer/source)
│   ├── store/            Vuex store and analytics module
│   ├── styles/           Global CSS (tailwind entry, view layout)
│   ├── types/            TypeScript type declarations and compat shims
│   ├── utilities/        Fetch wrappers, auth, sanitize, URL helpers
│   ├── views/            Top-level page components
│   ├── App.vue           Root component, app bar, sidebar, session init
│   ├── main.ts           App bootstrap (Vue + Vuetify + Router + Vuex)
│   └── types.ts          Shared interfaces (Config, Message, NationAPICall)
├── scripts/              Shell utilities (flame_bot API health check)
├── .env.example          Environment variable documentation
├── render.yaml           Render static site deployment config
├── tailwind.config.js    Tailwind theme (codex colour palette for constitution)
└── vue.config.js         Webpack config (version injection, transpile list)
```

### Authentication & Session Model

Two independent auth layers coexist.

**Discord OAuth2** (`discordAuth`): the primary gate. The server handles the OAuth exchange and sets a session cookie. The client calls `/auth/session` once per page load, caches the result in `sessionStorage`, and parses role flags (`bar3Client`, `bar3Server`, `memberGuild`) from the response. These flags drive route guards and sidebar visibility. On 429 responses the client falls back to the cached session rather than clearing auth state.

**PnW API Key** (`v2Api`): a secondary credential stored in `localStorage` and sent as `x-api-key`. Required for message sending, automation, and template management. Login hits `/api/v2/auth/login`; the session is server-side. `hasV2Credentials()` checks `localStorage` to determine whether to show PnW-specific UI.

### State Management (Vuex)

A single flat store holds application on/off state, sent messages, API usage counters, server and client version strings, update availability, Discord auth state, and role flags. An `analytics` submodule holds legacy campaign data. There are no async Vuex actions; all async work is done in components or composables before committing mutations.

### API Layer

Three fetch wrappers cover different concerns.

`apiFetch` attaches the PnW API key header and `credentials: include`; used for legacy `/api/*` endpoints. `v2Fetch` (internal to `v2Api`) follows the same pattern for all `/api/v2/*` endpoints. `botFetch` (internal to `botApi`) uses `AUTH_BASE_URL`, which can differ from `API_BASE_URL` to work around Safari's same-site cookie restriction via a reverse proxy.

URL roots are resolved from `VUE_APP_API_URL`, `VUE_APP_AUTH_URL`, and `VUE_APP_SERVER_URL`, with `window.location.origin` as the fallback.

### Router & Access Control

| Route | Access | Description |
|---|---|---|
| `/dashboard` | Client | Sent messages, API usage charts |
| `/automation` | Client | Bulk send tools (active+unallied, Discord filter, by nation ID) |
| `/config` | Client | API key, update interval, analytics toggle |
| `/message-creator` | Client | WYSIWYG (Quill) and advanced (HTML/CSS) editors |
| `/analytics` | Client | v2 analytics graph + legacy campaign view |
| `/account` | Client | PnW API key login/logout |
| `/nation` | Member | Registered nation details and defensive war table |
| `/alliance` | Member | Alliance stats and counter-war request UI |
| `/bot` | Admin | Bot server list, command usage, broadcast panel |
| `/constitution` | Member | Rendered constitution with ToC, search, dark mode |
| `/about`, `/help` | Public | Static informational pages |
| `/auth/discord/callback` | Public | Finalises OAuth and redirects |

Unauthenticated users are redirected to `/auth/login`. Role mismatches redirect to the best accessible route rather than a blank error.

### Message Editor Pipeline

The message creator supports two modes selected by a tab. Basic mode uses Quill, which produces a raw HTML fragment. Advanced mode accepts hand-written HTML and CSS, which are inlined via `juice` and previewed in `PreviewMessage`. Both paths pass through `sanitizeHtml`, which parses the markup into a `<template>` element, walks the DOM, removes dangerous tags (`script`, `iframe`, `form`, etc.), strips `on*` event attributes, sanitises inline styles, and rejects unsafe URL schemes. On save, the result is written to both the legacy config endpoint and, when a v2 session exists, to MongoDB via `/api/v2/templates`.

### Analytics

The `Analytics` view merges two data sources: v2 analytics fetched from `/analytics/v2/me` (converted into a synthetic `AnalyticalCampaign` object for reuse by `AnalyticsGraphCard`) and the legacy campaign system from `/analytics/campaigns`. Chart data is produced by `vue-chartjs` wrapping Chart.js, with daily-bucketing logic applied client-side before the data reaches the chart.

### Constitution Renderer

The constitution page is a self-contained rendering pipeline.

`constitutionSource.ts` fetches from a Google Doc via the backend when `VUE_APP_CONSTITUTION_GOOGLE_DOC_URL` is set, falling back to the bundled `constitution.md`. `constitutionRenderer.ts` parses the markdown line-by-line, extracting `:::law`, `:::lore`, and `:::amendment` container blocks into a typed `ConstitutionBlock[]` array alongside a `TocItem[]` table of contents. Heading slugs are deduplicated with a counter map and headings inside containers are excluded from the ToC. The view renders blocks using three specialised components (`LawBlock`, `LoreBox`, `AmendmentNote`) and plain `v-html` for prose. An `IntersectionObserver` drives scroll-spy ToC highlighting. Full-text search operates over a pre-built per-section index extracted from the raw markdown at render time, with context snippets centred on the match position.


### Client Startup Flow

Application startup is orchestrated from `main.ts`, which creates the Vue application, installs Vuetify, Vue Router, and Vuex, and mounts `App.vue`.

`App.vue` acts as the primary initialization coordinator. During startup the client:

1. Loads environment-derived API endpoints.
2. Checks the current Discord session via `/auth/session`.
3. Restores cached auth state from `sessionStorage` when appropriate.
4. Loads application configuration and server status information.
5. Fetches message history and analytics summaries for authenticated users.
6. Populates Vuex state used by the dashboard, sidebar, and status indicators.
7. Registers route guards and role-based navigation visibility.

The application is designed to tolerate temporary backend failures during startup by preserving cached session state where possible rather than immediately forcing reauthentication.

### Actions Layer

The `src/actions/` directory contains thin API orchestration helpers used by components. These actions centralise request construction, response handling, and state updates while keeping UI components focused on presentation and user interaction.

Representative actions include:

- `getAppData.ts` — retrieves dashboard and application state.
- `getConfig.ts` / `sendConfig.ts` — configuration retrieval and persistence.
- `sendMessage.ts` — manual message submission workflow.
- `createNewCampaign.ts` — analytics campaign creation.
- `getAnalyticalCampaigns.ts` — analytics retrieval.
- `checkForUpdates.ts` — client/server version comparison.
- `setApplicationState.ts` — automation and runtime state toggles.

This layer functions as the primary bridge between Vue components and backend API endpoints.

### Update Detection System

Client and server versions are tracked independently. The update system periodically compares the running frontend version against the version reported by the backend.

When a version mismatch is detected:

- Update state is committed to Vuex.
- `UpdateAvailableBanner.vue` becomes visible.
- Users are prompted to refresh or reload the application.

This mechanism allows deployments to notify active users without requiring manual version checks.

### Analytics Campaign Workflow

The analytics subsystem supports both legacy campaign tracking and newer v2 analytics reporting.

Campaign creation originates from `CreateAnalyticsCampaignDialog.vue`, which gathers campaign metadata and submits it through the actions layer. Campaign data is later retrieved through `getAnalyticalCampaigns.ts` and rendered using analytics-specific components such as:

- `AnalyticsGraphCard.vue`
- `AnalyticsLinksCard.vue`
- `MessagesSentCard.vue`
- `LineChart.vue`

The frontend transforms raw analytics responses into presentation-friendly structures before rendering charts and summaries.

### Account Management

`AccountManager.vue` provides the primary interface for account-related operations.

Responsibilities include:

- Displaying current account status.
- Managing PnW API key authentication.
- Handling account-specific configuration.
- Coordinating logout and session cleanup flows.
- Exposing account metadata returned by the backend.

Account state is shared across the application through Vuex and session-aware API wrappers.

### Automation User Interface

Automation controls are exposed through dedicated components including `V2AutomationToggle.vue`.

The frontend automation layer allows users to:

- Enable or disable automation features.
- Configure automated message behaviour.
- Manage automation-related settings.
- Monitor automation status.

These controls communicate with the backend automation system implemented in `server/services/v2AutomationRunner.ts`.

The client itself performs no automation logic; all automation execution occurs server-side.

### State Ownership & Source of Truth

The application intentionally separates ownership of state across multiple storage layers.

| Data | Source of Truth | Client Cache |
|---|---|---|
| Discord authentication | Server session | `sessionStorage` + Vuex |
| PnW API key | Browser storage | `localStorage` |
| User configuration | Backend API | Vuex |
| Message history | Backend API | Vuex |
| Analytics data | MongoDB via API | Vuex/component state |
| Automation settings | Backend API | Vuex |
| Constitution content | Google Doc or bundled markdown | In-memory render model |

This separation ensures sensitive authentication state remains server-controlled while still allowing responsive client-side rendering.

### Cross-Service Interactions

The frontend never communicates directly with Politics & War or Discord.

All external interactions flow through backend services:

#### Discord Authentication Flow

1. User initiates Discord login.
2. Browser is redirected to the backend OAuth endpoint.
3. Backend completes OAuth exchange.
4. Backend queries flame_bot for role information.
5. Backend establishes session state.
6. Frontend retrieves session details via `/auth/session`.

#### Messaging Flow

1. User creates or edits a message.
2. Frontend submits content to backend APIs.
3. Backend performs sanitisation, storage, analytics injection, and delivery.
4. Politics & War receives the final message.

#### Automation Flow

1. User updates automation settings.
2. Frontend submits configuration to the server.
3. Server stores automation configuration.
4. `v2AutomationRunner` processes future nation events.
5. Results are exposed through analytics and status APIs.

This architecture keeps all privileged operations on trusted backend services while the frontend remains a presentation and orchestration layer.
