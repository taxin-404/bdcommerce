import { Hono } from 'hono';
import type { AdminEnv } from './middleware/admin';
import { adminRoutes } from './routes/admin';
import { healthRoutes } from './routes/health';
import { imageRoutes } from './routes/images';

export const app = new Hono<AdminEnv>();

app.route('/api', healthRoutes);
app.route('/api/admin', adminRoutes);
app.route('/img', imageRoutes);

app.notFound((c) =>
  c.json({ ok: false, error: { code: 'not_found', message: 'Not found' } }, 404),
);

app.onError((error, c) => {
  console.error(error);
  return c.json(
    { ok: false, error: { code: 'internal_error', message: 'Something went wrong' } },
    500,
  );
});
