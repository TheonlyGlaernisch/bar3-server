# Backend Prompt — Bot Panel

## Overview

The Bar 3 client has a new **Bot Panel** tab that is only visible to a small set of privileged
Discord users.  The panel is gated by a separate auth-check endpoint and exposes three pieces
of functionality backed by the Discord bot that is associated with the Bar 3 service:

1. **Send a message** through the bot to a specific Discord channel.
2. **List the Discord servers** the bot is currently a member of.
3. **List the most-often-used bot commands** sorted by usage count.

---

## Auth — Bot Session Check

### `GET /auth/bot/session`

Checks whether the authenticated user's Discord session has **bot-panel access** (a role or
an explicit allow-list that is separate from the general Bar 3 member role).

| Attribute | Value |
|-----------|-------|
| Auth required | Discord session cookie (`credentials: 'include'`) |
| Success | `200 OK` (empty body or `{ ok: true }`) |
| Not authorised | `403 Forbidden` |
| Not authenticated at all | `401 Unauthorized` |

**Implementation notes**

- Re-use the existing Discord session cookie infrastructure (`/auth/discord`).
- Maintain a separate allow-list (e.g. a dedicated Discord role ID, a hard-coded list of
  Discord user IDs, or a flag in the user record) that controls who passes this check.
- Because the client caches the result in memory, there is no need for a short TTL on the
  server — a plain boolean response is sufficient.

---

## Bot API Endpoints

All endpoints below require the Discord session cookie **and** the user must pass the
`/auth/bot/session` check.  Return `403 Forbidden` if either condition is not met.

---

### `GET /api/bot/servers`

Returns a list of Discord guilds (servers) that the bot is currently a member of.

**Response `200 OK`**

```json
[
  {
    "id": "123456789012345678",
    "name": "My Alliance Server",
    "icon": "a_abcdef1234567890abcdef1234567890",
    "memberCount": 412
  }
]
```

| Field | Type | Notes |
|-------|------|-------|
| `id` | `string` | Discord guild snowflake |
| `name` | `string` | Guild display name |
| `icon` | `string \| null` | Icon hash (use `null` when not set) |
| `memberCount` | `number` | Approximate member count |

**Implementation notes**

- Call `GET https://discord.com/api/v10/users/@me/guilds` with the bot token, or use the
  cached guild list maintained by the bot's gateway connection.
- Prefer the cached gateway state to avoid hitting Discord rate limits.

---

### `GET /api/bot/commands/usage`

Returns the most-used bot commands, sorted by usage count descending.

**Response `200 OK`**

```json
[
  {
    "name": "ping",
    "usageCount": 1042,
    "description": "Check the bot's latency"
  },
  {
    "name": "nation",
    "usageCount": 876,
    "description": "Look up a Politics & War nation"
  }
]
```

| Field | Type | Notes |
|-------|------|-------|
| `name` | `string` | Command name without the leading `/` |
| `usageCount` | `number` | Total invocations recorded |
| `description` | `string` | Short human-readable description |

**Implementation notes**

- Store a command-usage counter in the database (increment on every successful slash-command
  invocation inside the bot's `interactionCreate` handler).
- Return the top N results (e.g. 20) ordered by `usageCount DESC`.
- If no data exists yet, return an empty array `[]`.

---

### `POST /api/bot/send`

Sends a message through the bot to a Discord channel.

**Request body**

```json
{
  "channelId": "123456789012345678",
  "content": "Hello from Bar 3!"
}
```

| Field | Type | Notes |
|-------|------|-------|
| `channelId` | `string` | Discord channel snowflake |
| `content` | `string` | Message text (max 2 000 chars) |

**Response**

| Status | Meaning |
|--------|---------|
| `204 No Content` | Message sent successfully |
| `400 Bad Request` | Missing or invalid fields; body: `{ "error": "..." }` |
| `403 Forbidden` | Caller not authorised |
| `502 Bad Gateway` | Discord API call failed; body: `{ "error": "..." }` |

**Implementation notes**

- Validate that `content` is non-empty and at most 2 000 characters.
- Use `POST https://discord.com/api/v10/channels/{channelId}/messages` with the bot token.
- Optionally verify that the bot is actually a member of the guild that owns `channelId`
  before sending (prevents the panel from being used to message arbitrary channels).
- Log the sender's Discord user ID and the target channel for auditing.

---

## Security Notes

- All `/api/bot/*` routes must verify both the standard Discord session cookie **and** the
  bot-panel allow-list check before executing any logic.
- Do not expose the raw Discord bot token in any API response.
- Enforce a rate limit on `POST /api/bot/send` (e.g. 10 requests / minute per user) to
  prevent abuse.
