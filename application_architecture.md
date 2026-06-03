# Application Architecture Overview

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
  - `searchLoop`: Continuously searches for nations to process.
  - `clearQueue`: Clears outdated or stale entries from the queue.

### 4. Analytics System
- Tracks message views and link clicks via `/analytics` endpoints.
- Supports:
  - Public link tracking: `/l/:shortId` redirects with click logging.
  - Message view tracking: `/p/:messageId` returns a 1x1 transparent GIF with view logging.
  - Authenticated analytics dashboard: `/me` returns recent link clicks and message views.

### 5. Account & Authentication
- `AccountService` manages account lifecycle and API key handling.
- `/account` endpoint returns account details (API key, creation date) after API key authentication.
- Legacy API key creation is disabled via `/api-key/create` (returns 410).

### 6. Discord Bot Integration
- **Discord Bot Core**: Built using the `discord.js` library, handles real-time interactions with Discord servers.
- **Bot Commands**:
  - `/send-message`: Sends a message to a specified Discord channel. Accepts message content, embeds, and attachments.
  - `/status`: Returns the current status of the bot (online, processing, idle).
  - `/config`: Allows users to configure bot behavior (e.g., message frequency, notification channels).
  - `/analytics`: Returns recent message delivery statistics (e.g., messages sent, failures, success rate).
- **Event Listeners**:
  - `messageCreate`: Listens for new messages in configured channels. Triggers message processing if the message contains a valid command.
  - `interactionCreate`: Handles slash command interactions (e.g., `/send-message`, `/status`).
  - `ready`: Fires when the bot is fully initialized and ready to receive events.
- **Permissions & Roles**:
  - Bot requires `Send Messages`, `Embed Links`, `Attach Files`, and `Manage Messages` permissions in target channels.
  - Only users with `Administrator` or `Manage Messages` roles can use configuration commands.
- **Message Delivery Pipeline**:
  - Messages are queued via `QueuedNation` and processed by `searchLoop`.
  - When a message is ready, the bot uses `Discord.js`'s `channel.send()` method to deliver it.
  - Delivery status (success/failure) is logged in the `Message` model and reflected in analytics.

### 7. API Endpoints Summary

| Endpoint | Method | Description |
|--------|--------|-----------|
| `GET /l/:shortId` | Public | Redirects to target URL after logging a click. Validates redirect URL. |
| `GET /p/:messageId` | Public | Returns a 1x1 transparent GIF to log message views. Accepts optional `a` query param for account ID. |
| `GET /me` | Authenticated | Returns recent analytics: link click history and message view history. Requires valid session. |
| `GET /account` | Authenticated | Returns account details (API key, creation time) after API key validation. |
| `POST /api-key/create` | Public | Disabled. Returns 410 Gone. Legacy key creation is no longer supported. |
| `POST /discord/webhook` | Public | Accepts incoming webhook data from Discord. Used to trigger message processing or status updates. |
| `GET /discord/status` | Public | Returns the current status of the Discord bot (e.g., online, offline, processing). |

### 8. Background Jobs
- `searchLoop`: Runs continuously to discover and process new nations.
- `clearQueue`: Runs periodically to clean up expired or stale queue entries.
- `discordHeartbeat`: Runs every 30 seconds to ping the bot’s status endpoint and ensure it remains active.

### 9. Security & Validation
- All public redirects are validated using `isSafeRedirectUrl` to prevent open redirect vulnerabilities.
- API key authentication is enforced via `authenticateApiKey` middleware.
- Analytics data is stored securely with account-scoped access.
- Discord bot commands are restricted to authorized users via role-based access control (RBAC).
- Incoming webhook payloads are validated using a secret token to prevent unauthorized access.

### 10. Data Flow
1. Nation data is fetched via API calls (handled by `NationAPICall`).
2. Nations are queued and processed by `searchLoop`.
3. Messages are sent with tracking links and view pixels.
4. Analytics data is collected and stored in MongoDB via `TrackingLink` and `MessageView` models.
5. Users can retrieve analytics via `/me` endpoint.
6. Discord bot receives commands via slash commands or direct messages.
7. Messages are delivered to Discord channels using `Discord.js` methods.
8. Delivery status is logged and reflected in the analytics system.

### 11. Extensibility
- The modular design allows for:
  - Easy addition of new tracking types.
  - Support for multiple message types or delivery methods.
  - Future integration with external analytics platforms.
  - Support for additional messaging platforms (e.g., Slack, Telegram) via plugin architecture.
  - Custom bot commands and event handlers can be added via configuration.

### 12. Overlapping Features
- **Analytics System & Discord Bot**: Both systems track message delivery status. The Discord bot logs delivery success/failure and forwards this data to the central analytics system via `/analytics` endpoints.
- **Queuing System & Discord Bot**: The `searchLoop` job processes nations and triggers message delivery, which is then handled by the Discord bot. The `QueuedNation` model is shared between both systems.
- **Authentication & Discord Integration**: Both systems use API key authentication. The Discord bot validates the API key before processing any message, ensuring only authorized users can send messages.

This architecture supports scalable, secure, and maintainable message delivery with comprehensive analytics and background processing. The integration with Discord enhances real-time communication and user interaction, while maintaining consistency with the existing data model and security practices.
```