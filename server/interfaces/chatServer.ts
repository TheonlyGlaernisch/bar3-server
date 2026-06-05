export interface SessionStore {
  get(
    sid: string,
    callback: (err: unknown, session: Record<string, unknown> | null) => void
  ): void;
}