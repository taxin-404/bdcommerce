import { Hono } from 'hono';
import { healthRoutes } from './routes/health';

export const app = new Hono<{ Bindings: Env }>();

app.route('/api', healthRoutes);

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
