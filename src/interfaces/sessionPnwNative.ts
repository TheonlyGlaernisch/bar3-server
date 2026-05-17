import 'express-session';

declare module 'express-session' {
  interface SessionData {
    pnwNativeAuthenticated?: boolean;
    pnwNativeAccountId?: string;
    pnwNativeNationId?: number;
    pnwNativeUsername?: string;
  }
}
