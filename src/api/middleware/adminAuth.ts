import {Request, Response, NextFunction} from 'express';

/** Paths under /admin that are always accessible without admin authentication. */
const ADMIN_PUBLIC_PATHS = ['/admin/login'];

/**
 * Express middleware that enforces admin password authentication for all /admin/* routes.
 *
 * - Requests to the login page are passed straight through.
 * - Browser requests to protected paths with no admin session are redirected to /admin/login.
 * - Non-browser (API) requests without a session receive HTTP 401.
 * @param {Request} req - Express request
 * @param {Response} res - Express response
 * @param {NextFunction} next - Express next function
 * @return {void}
 */
export function requireAdminAuth(req: Request, res: Response, next: NextFunction): void {
  for (const prefix of ADMIN_PUBLIC_PATHS) {
    if (req.path === prefix || req.path.startsWith(prefix + '/')) {
      return next();
    }
  }

  if (req.session?.adminAuthenticated === true) {
    return next();
  }

  const acceptsHtml = req.headers.accept?.includes('text/html') ?? false;
  if (!acceptsHtml) {
    res.status(401).json({error: 'Admin authentication required'});
    return;
  }

  res.redirect('/admin/login');
}
