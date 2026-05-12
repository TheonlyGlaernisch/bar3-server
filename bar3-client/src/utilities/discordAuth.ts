import { AUTH_BASE_URL, normalizeReturnTo } from '@/utilities/serverUrls';

interface SessionData {
  authenticated: boolean;
  isAdmin: boolean;
  roles: {
    verified: boolean;
    bar3Client: boolean;
    bar3Server: boolean;
    memberGuild: boolean;
  };
}

const SESSION_STORAGE_KEY = 'bar3.discordSession';
const DEFAULT_ROLES: SessionData['roles'] = {
  verified: false,
  bar3Client: false,
  bar3Server: false,
  memberGuild: false,
};

function parseSessionData(data: unknown): SessionData | null {
  if (!data || typeof data !== 'object') return null;
  const source = data as Record<string, unknown>;
  const sourceRoles =
    source.roles && typeof source.roles === 'object'
      ? (source.roles as Record<string, unknown>)
      : {};
  const authenticated = source.authenticated === true;
  const roles: SessionData['roles'] = {
    verified: sourceRoles.verified === true,
    bar3Client: sourceRoles.bar3_client === true,
    bar3Server: sourceRoles.bar3_server === true,
    memberGuild: sourceRoles.member_guild === true,
  };
  return {
    authenticated,
    isAdmin: source.isAdmin === true,
    roles,
  };
}

function readSessionCache(): SessionData | null {
  if (typeof window === 'undefined' || !window.sessionStorage) return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    return parseSessionData(JSON.parse(raw));
  } catch {
    return null;
  }
}

function writeSessionCache(value: SessionData | null): void {
  if (typeof window === 'undefined' || !window.sessionStorage) return;
  try {
    if (value) {
      window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(value));
      return;
    }
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // ignore storage write errors
  }
}

// In-memory cache so the server is only contacted once per page load.
let sessionCache: SessionData | null = readSessionCache();

export const discordAuth = {
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
      });
      if (res.ok) {
        const data = await res.json();
        const payload = data as Record<string, unknown>;
        const parsed = parseSessionData(data) || {
          authenticated: false,
          isAdmin: false,
          roles: { ...DEFAULT_ROLES },
        };
        const legacyRoles = Array.isArray(payload.roles) ? payload.roles : [];
        const roleBasedAdmin = legacyRoles.some((role: unknown) => {
          if (typeof role === 'string') return role.toLowerCase() === 'admin';
          if (role && typeof role === 'object' && 'name' in role) {
            const name = (role as { name?: unknown }).name;
            return typeof name === 'string' && name.toLowerCase() === 'admin';
          }
          return false;
        });

        sessionCache = {
          authenticated: parsed.authenticated,
          isAdmin: parsed.isAdmin || roleBasedAdmin,
          roles: parsed.roles,
        };
        writeSessionCache(sessionCache);
      } else if (res.status === 429) {
        // Preserve prior auth state on temporary rate-limit responses.
        sessionCache = readSessionCache() || {
          authenticated: false,
          isAdmin: false,
          roles: { ...DEFAULT_ROLES },
        };
      } else {
        sessionCache = { authenticated: false, isAdmin: false, roles: { ...DEFAULT_ROLES } };
        writeSessionCache(null);
      }
    } catch {
      sessionCache = readSessionCache() || {
        authenticated: false,
        isAdmin: false,
        roles: { ...DEFAULT_ROLES },
      };
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
    writeSessionCache(null);
    window.location.href = `${AUTH_BASE_URL}/auth/logout`;
  },
};
