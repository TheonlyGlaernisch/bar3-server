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

### 6. API Endpoints Summary

| Endpoint | Method | Description |
|--------|--------|-----------|
| `GET /l/:shortId` | Public | Redirects to target URL after logging a click. Validates redirect URL. |
| `GET /p/:messageId` | Public | Returns a 1x1 transparent GIF to log message views. Accepts optional `a` query param for account ID. |
| `GET /me` | Authenticated | Returns recent analytics: link click history and message view history. Requires valid session. |
| `GET /account` | Authenticated | Returns account details (API key, creation time) after API key validation. |
| `POST /api-key/create` | Public | Disabled. Returns 410 Gone. Legacy key creation is no longer supported. |

### 7. Background Jobs
- `searchLoop`: Runs continuously to discover and process new nations.
- `clearQueue`: Runs periodically to clean up expired or stale queue entries.

### 8. Security & Validation
- All public redirects are validated using `isSafeRedirectUrl` to prevent open redirect vulnerabilities.
- API key authentication is enforced via `authenticateApiKey` middleware.
- Analytics data is stored securely with account-scoped access.

### 9. Data Flow
1. Nation data is fetched via API calls (handled by `NationAPICall`).
2. Nations are queued and processed by `searchLoop`.
3. Messages are sent with tracking links and view pixels.
4. Analytics data is collected and stored in MongoDB via `TrackingLink` and `MessageView` models.
5. Users can retrieve analytics via `/me` endpoint.

### 10. Extensibility
- The modular design allows for:
  - Easy addition of new tracking types.
  - Support for multiple message types or delivery methods.
  - Future integration with external analytics platforms.

This architecture supports scalable, secure, and maintainable message delivery with comprehensive analytics and background processing.
