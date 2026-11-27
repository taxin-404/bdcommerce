import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AdminEnv } from './middleware/admin';
import { adminRoutes } from './routes/admin';
import { cartRoutes } from './routes/cart';
import { checkoutRoutes } from './routes/checkout';
import { healthRoutes } from './routes/health';
import { imageRoutes } from './routes/images';
import { trackRoutes } from './routes/track';

export const app = new Hono<AdminEnv>();

app.use('/api/cart/*', async (c, next) => {
  await next();
  c.header('Cache-Control', 'no-store');
});

app.use('/api/checkout', async (c, next) => {
  await next();
  c.header('Cache-Control', 'no-store');
  c.header('X-Content-Type-Options', 'nosniff');
});

app.use('/api/track', async (c, next) => {
  await next();
  c.header('Cache-Control', 'no-store');
  c.header('X-Content-Type-Options', 'nosniff');
});

app.route('/api', healthRoutes);
app.route('/api', cartRoutes);
app.route('/api', checkoutRoutes);
app.route('/api', trackRoutes);

app.use('/api/admin/*', async (c, next) => {
  await next();
  c.header('Cache-Control', 'no-store');
  c.header('X-Content-Type-Options', 'nosniff');
});

app.route('/api/admin', adminRoutes);
app.route('/img', imageRoutes);

app.notFound((c) =>
  c.json({ ok: false, error: { code: 'not_found', message: 'Not found' } }, 404),
);

app.onError((error, c) => {
  if (error instanceof HTTPException) {
    const code = error.status === 400 ? 'invalid_request' : 'http_error';
    return c.json(
      { ok: false, error: { code, message: error.message || 'Request rejected' } },
      error.status,
    );
  }

  console.error(error);
  return c.json(
    { ok: false, error: { code: 'internal_error', message: 'Something went wrong' } },
    500,
  );
});
