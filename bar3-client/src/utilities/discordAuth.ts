import { AUTH_BASE_URL, normalizeReturnTo } from '@/utilities/serverUrls';
import {
  clearDiscordToken,
  getDiscordAuthHeaders,
  getDiscordToken,
  setDiscordToken,
} from '@/utilities/discordToken';

interface SessionData {
  authenticated: boolean;
  isAdmin: boolean;
}

// In-memory cache so the server is only contacted once per page load.
let sessionCache: SessionData | null = null;

export const discordAuth = {
  setSessionToken(token: string): void {
    setDiscordToken(token);
    sessionCache = null;
  },

  /**
   * Redirect the browser to the server-controlled Discord OAuth start.
   * The server handles PKCE/secret exchange and sets a session cookie on return.
   * An optional `returnTo` path can be passed so the server can redirect back
   * to the original page after a successful login.
   */
  redirectToDiscord(returnTo?: string): void {
    const url = new URL(`${AUTH_BASE_URL}/auth/discord`);
    const safeReturnTo = normalizeReturnTo(returnTo);
    if (safeReturnTo) {
      url.searchParams.set('returnTo', safeReturnTo);
    }
    window.location.href = url.toString();
  },

  /**
   * Ask the server whether the current session cookie is authenticated.
   * Parses the JSON response to also capture the `isAdmin` flag.
   * The result is cached in memory for the lifetime of the page to avoid
   * repeated server calls during in-app navigation.
   */
  async getSession(): Promise<SessionData> {
    if (sessionCache !== null) return sessionCache;
    try {
      const res = await fetch(`${AUTH_BASE_URL}/auth/session`, {
        credentials: 'include',
        headers: {
          ...getDiscordAuthHeaders(),
        },
      });
      if (res.ok) {
        const data = await res.json();
        const roles = Array.isArray(data?.roles) ? data.roles : [];
        const roleBasedAdmin = roles.some((role: unknown) => {
          if (typeof role === 'string') return role.toLowerCase() === 'admin';
          if (role && typeof role === 'object' && 'name' in role) {
            const name = (role as { name?: unknown }).name;
            return typeof name === 'string' && name.toLowerCase() === 'admin';
          }
          return false;
        });

        sessionCache = {
          authenticated: data?.authenticated === true,
          isAdmin: data?.isAdmin === true || roleBasedAdmin,
        };
      } else if (res.status === 429 && !!getDiscordToken()) {
        // Rate-limited auth checks should not force a hard logged-out state
        // when we already have a valid token-based auth flow in progress.
        sessionCache = { authenticated: true, isAdmin: false };
      } else {
        sessionCache = { authenticated: false, isAdmin: false };
      }
    } catch {
      sessionCache = { authenticated: false, isAdmin: false };
    }
    return sessionCache;
  },

  /**
   * Convenience wrapper that returns only the authenticated flag.
   */
  async isAuthed(): Promise<boolean> {
    return (await discordAuth.getSession()).authenticated;
  },

  /**
   * Clear the in-memory cache, any legacy client-side tokens, and redirect to
   * the server logout endpoint so the server can invalidate the session cookie.
   */
  logout(): void {
    sessionCache = null;
    clearDiscordToken();
    window.location.href = `${AUTH_BASE_URL}/auth/logout`;
  },
};
