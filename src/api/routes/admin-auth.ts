import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import {
  ADMIN_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  constantTimeEqual,
  createSessionCookie,
} from '../../lib/auth';
import { isAllowedOrigin } from '../../lib/http';
import {
  clearLoginFailures,
  clientIp,
  hashClientIp,
  isLoginRateLimited,
  recordLoginFailure,
} from '../../lib/login-rate-limit';
import { loginSchema } from '../../lib/validation/admin';
import type { AdminEnv } from '../middleware/admin';

function sessionCookie(value: string, maxAge: number, secure: boolean): string {
  const parts = [
    `${ADMIN_COOKIE_NAME}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export const adminAuthRoutes = new Hono<AdminEnv>();

adminAuthRoutes.use('*', async (c, next) => {
  if (!isAllowedOrigin(c.req.raw)) {
    return c.json(
      { ok: false, error: { code: 'bad_origin', message: 'Cross-origin request rejected' } },
      403,
    );
  }
  return next();
});

adminAuthRoutes.post('/login', zValidator('json', loginSchema), async (c) => {
  const { passphrase } = c.req.valid('json');
  const db = c.env.DB;
  const ipHash = await hashClientIp(clientIp(c.req.raw));

  if (await isLoginRateLimited(db, ipHash)) {
    return c.json(
      {
        ok: false,
        error: {
          code: 'rate_limited',
          message: 'Too many failed attempts. Try again in a few minutes.',
        },
      },
      429,
    );
  }

  const expected = c.env.ADMIN_PASSPHRASE;
  if (!expected) {
    return c.json(
      {
        ok: false,
        error: {
          code: 'admin_not_configured',
          message: 'ADMIN_PASSPHRASE is not set for this deployment',
        },
      },
      503,
    );
  }

  if (!(await constantTimeEqual(passphrase, expected))) {
    await recordLoginFailure(db, ipHash);
    return c.json(
      { ok: false, error: { code: 'bad_credentials', message: 'Wrong passphrase' } },
      401,
    );
  }

  await clearLoginFailures(db, ipHash);
  const cookie = await createSessionCookie(db, expected);
  const secure = new URL(c.req.url).protocol === 'https:';
  c.header('Set-Cookie', sessionCookie(cookie, SESSION_TTL_SECONDS, secure));

  return c.json({ ok: true, data: { expiresIn: SESSION_TTL_SECONDS } });
});

adminAuthRoutes.post('/logout', (c) => {
  const secure = new URL(c.req.url).protocol === 'https:';
  c.header('Set-Cookie', sessionCookie('', 0, secure));
  return c.json({ ok: true, data: null });
});
