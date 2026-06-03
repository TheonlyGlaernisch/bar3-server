
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
