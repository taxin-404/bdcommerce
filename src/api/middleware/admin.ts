import { createMiddleware } from 'hono/factory';
import { validateAdminPassphrase } from '../../lib/admin-passphrase';
import type { AdminSession } from '../../lib/auth';
import { ADMIN_COOKIE_NAME, parseCookieHeader, verifySessionCookie } from '../../lib/auth';
import { isAllowedOrigin } from '../../lib/http';

export type AdminEnv = {
  Bindings: Env;
  Variables: {
    admin: AdminSession;
  };
};

export const requireAdmin = createMiddleware<AdminEnv>(async (c, next) => {
  if (!isAllowedOrigin(c.req.raw)) {
    return c.json(
      { ok: false, error: { code: 'bad_origin', message: 'Cross-origin request rejected' } },
      403,
    );
  }

  const configured = validateAdminPassphrase(c.env.ADMIN_PASSPHRASE);
  if (!configured.ok) {
    return c.json(
      {
        ok: false,
        error: {
          code: 'admin_passphrase_invalid',
          reason: configured.reason,
          message:
            'Admin login is disabled: ADMIN_PASSPHRASE must be a random passphrase of at least 16 characters',
        },
      },
      503,
    );
  }

  const cookie = parseCookieHeader(c.req.header('cookie') ?? null, ADMIN_COOKIE_NAME);
  const session = cookie
    ? await verifySessionCookie(cookie, c.env.DB, configured.passphrase)
    : null;
  if (!session) {
    return c.json(
      { ok: false, error: { code: 'unauthorized', message: 'Sign in to continue' } },
      401,
    );
  }

  c.set('admin', session);
  return next();
});
