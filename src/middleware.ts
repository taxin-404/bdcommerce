import { defineMiddleware } from 'astro:middleware';
import { env } from 'cloudflare:workers';
import { ADMIN_COOKIE_NAME, verifySessionCookie } from './lib/auth';

function harden(response: Response): Response {
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Content-Security-Policy', "frame-ancestors 'none'");
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname, search } = context.url;
  if (!pathname.startsWith('/admin')) {
    return next();
  }

  if (pathname === '/admin/login') {
    return harden(await next());
  }

  const cookie = context.cookies.get(ADMIN_COOKIE_NAME)?.value;
  const passphrase = env.ADMIN_PASSPHRASE;
  const session =
    passphrase && cookie ? await verifySessionCookie(cookie, env.DB, passphrase) : null;

  if (!session) {
    const target = encodeURIComponent(pathname + search);
    return harden(context.redirect(`/admin/login?next=${target}`));
  }

  context.locals.admin = session;
  return harden(await next());
});
