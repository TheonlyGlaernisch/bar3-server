import 'express-session';

declare module 'express-session' {
  interface SessionData {
    /** Set to true once the user has successfully authenticated via Discord. */
    discordAuthenticated?: boolean;
    /** Discord user ID of the authenticated user. */
    discordUserId?: string;
    /** Discord username of the authenticated user. */
    discordUsername?: string;
    /** bar3 roles as reported by flame_bot. */
    discordRoles?: {
      verified: boolean;
      bar3_client: boolean;
      bar3_server: boolean;
    };
    /** URL the user was trying to reach before being redirected to login. */
    discordReturnTo?: string;
  }
}
