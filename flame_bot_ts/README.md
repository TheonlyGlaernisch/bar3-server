# flame_bot_ts

A Discord bot for the **bar3** client/server system that integrates with [Politics and War](https://politicsandwar.com).

This is the TypeScript port of `flame_bot` (Python). It is the active production version.

## Features

| Command | Description |
|---|---|
| `/register <nation_id>` | Link your Discord account to your PnW nation (with verification) |
| `/unregister` | Remove your registration |
| `/whois <query>` | Look up a nation by ID, name, mention, or Discord username |
| `/alliance_info <query>` | Show alliance statistics by ID or name |
| `/alliance_members <query>` | List top alliance members by score |
| `/alliance_lots_of_info <query>` | Detailed briefing: militarization, city tier graph, and extended member list |
| `/slots` | Show open defensive war slots for configured alliances |
| `/war_range_targets` | Slotter alliance targets within your war score range |
| `/spy_target_find` | Slotter alliance targets within your spy range |
| `/missile_targets_find` | Slotter alliance targets ranked by estimated infra |
| `/damage_leaderboard` | 7-day ranked damage output for the primary alliance |
| `/color` | Check member color compliance for the primary alliance |
| `/revenue [query]` | Estimated daily revenue for your registered nation |
| `/infra <from> <to>` | Infrastructure purchase cost calculator |
| `/city_cost <current>` | City purchase cost calculator |
| `/send ...resources` | Compose a Locutus transfer command |
| `/request_grant` | Submit a grant request to the configured channel |
| `/gov` | Show current gov role assignments |
| `/fun_quote` | Return a random legacy quote |
| `/help` | List all available commands |

### bar3 HTTP API

When `API_KEY` is set, the bot exposes a small HTTP API on `API_PORT` (default `8080`) that
the bar3 website can call after a user logs in via Discord OAuth.

**`GET /api/roles/{discord_id}`**

Query the role status for a Discord user ID.

```
curl -H "X-API-Key: <your_api_key>" http://localhost:8080/api/roles/123456789
```

```json
{
  "discord_id": "123456789",
  "roles": {
    "verified":    true,
    "bar3_client": true,
    "bar3_server": false
  }
}
```

| Field | Description |
|---|---|
| `roles.verified` | Whether the user holds the `VERIFIED_ROLE_ID` Discord role |
| `roles.bar3_client` | Whether the user holds the `BAR3_CLIENT_ROLE_ID` Discord role |
| `roles.bar3_server` | Whether the user holds the `BAR3_SERVER_ROLE_ID` Discord role |

Error responses: `401 Unauthorized` (missing/wrong key), `400 Bad Request` (invalid ID),
`503 Service Unavailable` (bot not yet ready).

### Discord OAuth2 auth flow

When `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET` are set, the bot also exposes a
web login flow used by the bar3 SPA.

| Endpoint | Description |
|---|---|
| `GET /auth/login` | HTML login page with a "Login with Discord" button |
| `GET /auth/discord` | Redirect to Discord's OAuth2 authorization endpoint |
| `GET /auth/discord/callback` | Handle the OAuth callback, issue a session token |
| `GET /auth/session?token=<token>` | Validate a session token and return user + role info |
| `POST /auth/logout` | Revoke a session token |
| `GET /auth/mobile-session?token=<token>` | Alias for `/auth/session` (bar3-client compat) |

### Verification flow (`/register`)

1. User runs `/register <their_nation_id>`.
2. The bot fetches the nation from the PnW API.
3. It checks that the nation's **in-game Discord field** matches the user's Discord username.
4. If it matches, the registration is stored and the **Verified** role is granted.
5. If it doesn't match, the user is told exactly what to fix on their nation page.

---

## Setup

### Prerequisites

- Node.js 20+
- A [Discord application/bot](https://discord.com/developers/applications) with the **Server Members** and **Message Content** intents enabled
- A [Politics and War API key](https://politicsandwar.com/account)
- A [MongoDB Atlas](https://cloud.mongodb.com/) cluster (or any MongoDB URI)

### Install dependencies

```bash
cd flame_bot_ts
npm install
```

### Configure environment variables

```bash
cp .env.example .env
# edit .env and fill in all values
```

| Variable | Required | Description |
|---|---|---|
| `DISCORD_TOKEN` | ✅ | Bot token from the Discord developer portal |
| `PNW_API_KEY` | ✅ | Your PnW API key |
| `PNW_TEST_API_KEY` | ✅ | API key for the PnW test server |
| `MONGODB_PASSWORD` | ✅ | Password for the MongoDB Atlas user |
| `GUILD_ID` | ☑️ | Numeric Discord server ID — required when `API_KEY` is set |
| `VERIFIED_ROLE_ID` | ☑️ | Role ID granted after a successful `/register` |
| `BAR3_CLIENT_ROLE_ID` | ☑️ | bar3 client role ID |
| `BAR3_SERVER_ROLE_ID` | ☑️ | bar3 server role ID |
| `API_KEY` | ☑️ | Secret key for the bar3 HTTP API; if unset the API server does not start |
| `API_PORT` | ☑️ | Port for the bar3 HTTP API (default: `8080`) |
| `ADMIN_DISCORD_IDS` | ☑️ | Comma-separated Discord IDs that bypass role checks |
| `PW_SCAN_API_KEY` | ☑️ | PnW API key used for war/recruiter WebSocket streams (falls back to `PNW_API_KEY`) |
| `DISCORD_CLIENT_ID` | ☑️ | Discord OAuth2 client ID — required for the `/auth/*` web login flow |
| `DISCORD_CLIENT_SECRET` | ☑️ | Discord OAuth2 client secret — required for the `/auth/*` web login flow |
| `DISCORD_REDIRECT_URI` | ☑️ | OAuth2 callback URI (default: `http://localhost:8080/auth/discord/callback`) |
| `CLIENT_APP_URL` | ☑️ | URL of the bar3 SPA; browser is redirected here after login |
| `LOG_LEVEL` | ☑️ | Set to `DEBUG` for verbose logging (default: `INFO`) |

> ☑️ = optional but recommended

### Build and run

```bash
# Development (incremental TypeScript compiler)
npm run dev

# Production
npm run build
npm start
```

---

## Running tests

```bash
npm test
```

Tests use Node's built-in `node:test` runner and a lightweight in-memory MongoDB mock — no external services required.

---

## Project layout

```
src/
  index.ts        – main entry point; all slash commands; Discord event handlers
  api.ts          – Express HTTP API server (bar3 integration + OAuth2 auth flow)
  config.ts       – reads .env variables
  database.ts     – MongoDB storage for registrations and guild config
  pnw_api.ts      – async Politics and War GraphQL client
  commandDocs.ts  – slash command documentation for /help
test_core.mjs     – unit tests for pnw_api helpers
test_api.mjs      – unit tests for the bar3 HTTP API
test_db.mjs       – unit tests for the database layer
.env.example      – environment variable template
tsconfig.json
package.json
```
