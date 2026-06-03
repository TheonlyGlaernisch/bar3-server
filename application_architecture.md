# Application Architecture Overview

## 1. File that starts the application
- `server/index.ts`

## 2. File that creates the Express app
- `server/api/index.ts`

## 3. Registered routers
- `AccountRoutes` (from `server/api/AccountRoutes.ts`)
- `AnalyticsRoutes` (from `server/api/routers/v2/analytics.ts`)
- `NationRoutes` (from `server/api/routers/v2/nation.ts`)
- `MessageRoutes` (from `server/api/routers/v2/message.ts`)

## 4. Server listening port
- `3000`
