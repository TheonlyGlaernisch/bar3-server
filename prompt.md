# GitHub Copilot Prompt — PnW Native Authentication

## Context

This is a Node.js/TypeScript web application called **Bar3** (`bar3-server`). It is a Discord bot + web server for the browser game [Politics and War](https://politicsandwar.com). The stack is:

- **Runtime:** Node.js 20+, TypeScript 5
- **Framework:** Express 4
- **Database:** MongoDB via Mongoose
- **Auth (existing):** Discord OAuth2 with `express-session`
- **Bot:** `flame_bot_ts` — a separate Discord.js bot that exposes an internal HTTP API

The project root has two main source trees:
- `src/` — the main Express server (bar3-server)
- `flame_bot_ts/src/` — the Discord bot

---

## What to implement

Add a **PnW-native authentication flow** so that users without a Discord account can register and log in using their **Politics and War nation ID** and a **username + password** they choose. Verification is done by sending a 6-digit one-time code to the nation's **in-game inbox** via the PnW message API.

---

## Files to create

### 1. `src/interfaces/schemas/PnwNativeAccountSchema.ts`
Mongoose schema and model for native accounts.

```typescript
// Fields: nationId (number, unique), username (string, unique, lowercase),
// passwordHash (string, bcrypt), lastLoginAt (Date)
// Collection name: 'pnw_native_accounts'
// Timestamps: createdAt only
```

### 2. `src/interfaces/sessionPnwNative.ts`
Augment `express-session`'s `SessionData` interface with:
```typescript
pnwNativeAuthenticated?: boolean;
pnwNativeAccountId?: string;
pnwNativeNationId?: number;
pnwNativeUsername?: string;
```

### 3. `src/services/pnwNativeAuthService.ts`
Service with three exported async functions:

- **`startVerification(nationId, username, password)`**
  - Validate inputs (username: 3–32 chars, alphanumeric + `_-`; password: 8–128 chars)
  - Check uniqueness of `nationId` and `username` in MongoDB
  - Verify the nation exists via PnW GraphQL (`PNW_API_KEY` env var)
  - Hash the password with bcrypt (12 rounds)
  - Generate a 6-digit code with `crypto.randomInt`
  - Send the code via `POST https://politicsandwar.com/api/send-message`
  - Store the pending verification in a module-level `Map<number, PendingVerification>` with 10-minute TTL
  - Return `{ ok: true }` or `{ ok: false, status, error }`

- **`confirmVerification(nationId, code)`**
  - Look up the pending entry, check TTL
  - Use `crypto.timingSafeEqual` for code comparison
  - Re-check uniqueness (race guard), then `PnwNativeAccount.create(...)`
  - Return `{ ok: true, account }` or `{ ok: false, status, error }`

- **`login(username, password)`**
  - Look up by `username` (lowercase), run `bcrypt.compare`
  - Always run bcrypt even on missing user (prevent timing attacks)
  - Return `{ ok: true, account }` or `{ ok: false, status, error }`

Clean up expired pending entries with `setInterval` every 60 seconds.

### 4. `src/api/routers/pnwNativeAuth.ts`
Express router to mount at `/auth/pnw`. Endpoints:

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/auth/pnw/register` | Call `startVerification`, return `200 { ok, message }` |
| `POST` | `/auth/pnw/verify` | Call `confirmVerification`, set session, return `200 { ok }` |
| `POST` | `/auth/pnw/login` | Call `login`, set session, return `200 { ok }` |
| `POST` | `/auth/pnw/logout` | Destroy session |
| `GET`  | `/auth/pnw/session` | Return current native session info |

**Session shape after login/verify** — set these fields so the existing
`requireDiscordAuth` middleware accepts the session as a `member_guild` user:
```typescript
req.session.discordAuthenticated = true;
req.session.discordUserId = `pnw:${nationId}`;   // synthetic, no real Discord ID
req.session.discordUsername = username;
req.session.discordRoles = {
  verified: false, bar3_client: false, bar3_server: false, member_guild: true,
};
req.session.pnwNativeAuthenticated = true;
req.session.pnwNativeAccountId = account._id.toString();
req.session.pnwNativeNationId = account.nationId;
req.session.pnwNativeUsername = account.username;
```

Use `req.session.regenerate()` before writing to prevent session fixation.

Apply `express-rate-limit`:
- `/register` — 5 requests per 15 min per IP
- `/verify` — 10 requests per 10 min per IP
- `/login` — 10 requests per 15 min per IP

### 5. `src/api/routers/discordLogin.ts`
Replace (or supplement) the existing `GET /discord-login` route with a
**tabbed login page** that has two tabs:

- **Discord tab** — existing "Login with Discord" button pointing to `/auth/discord`
- **Nation Account tab** — a two-step registration form + a login form:
  - Step 1 (Register): nation ID + username + password → calls `POST /auth/pnw/register`
  - Step 2 (Register): 6-digit code input → calls `POST /auth/pnw/verify`
  - Login form: username + password → calls `POST /auth/pnw/login`

The page must be a single self-contained HTML string (inline CSS + vanilla JS,
no external dependencies). Style to match the existing dark theme
(`background: #1a1a2e`, `card background: #16213e`, accent `#5865F2`).

---

## Wiring in `src/index.ts`

Add these imports and mounts **before** `app.use(requireDiscordAuth)`:

```typescript
import pnwNativeAuthRouter from './api/routers/pnwNativeAuth';
import discordLoginRouter from './api/routers/discordLogin';
import './interfaces/sessionPnwNative';   // session type augmentation

// Mount before the Discord auth guard
app.use('/auth/pnw', pnwNativeAuthRouter);
app.use('/discord-login', discordLoginRouter);  // replaces old static handler
```

---

## Environment variables used

| Variable | Purpose |
|----------|---------|
| `PNW_API_KEY` | Sending in-game messages + GraphQL nation lookup |
| `API_KEY_ENC_SECRET` | Already used by `cryptoBox.ts` (no change needed) |

No new env vars required.

---

## Dependencies to install

```bash
npm install bcrypt
npm install --save-dev @types/bcrypt
```

---

## Constraints

- Do **not** modify existing Discord OAuth routes (`src/api/routers/discord/auth.ts`)
- Do **not** change the `requireDiscordAuth` middleware — the synthetic session fields make it transparent
- Username must be stored and compared **lowercase** to prevent case-sensitivity collisions
- Passwords must **never** be logged
- The in-game message body must clearly state the code and a 10-minute expiry warning
- All error responses must be `{ error: string }` JSON
- All success responses must be `{ ok: true, ... }` JSON
