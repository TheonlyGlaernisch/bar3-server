import { SessionData } from 'express-session';

export interface SessionStore {
  get(
    sid: string,
    callback: (err: unknown, session?: SessionData | null) => void
  ): void;
}
