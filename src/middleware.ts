import { defineMiddleware } from 'astro:middleware';
import { env } from 'cloudflare:workers';
import { ADMIN_COOKIE_NAME, verifySessionCookie } from './lib/auth';

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname, search } = context.url;
  if (!pathname.startsWith('/admin') || pathname === '/admin/login') {
    return next();
  }

  const cookie = context.cookies.get(ADMIN_COOKIE_NAME)?.value;
  const passphrase = env.ADMIN_PASSPHRASE;
  const session =
    passphrase && cookie ? await verifySessionCookie(cookie, env.DB, passphrase) : null;

  if (!session) {
    const target = encodeURIComponent(pathname + search);
    return context.redirect(`/admin/login?next=${target}`);
  }

  context.locals.admin = session;
  return next();
});
