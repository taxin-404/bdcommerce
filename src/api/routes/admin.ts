import { Hono } from 'hono';
import type { AdminEnv } from '../middleware/admin';
import { requireAdmin } from '../middleware/admin';
import { adminAuthRoutes } from './admin-auth';
import { adminCategoryRoutes } from './admin-categories';
import { adminImageRoutes } from './admin-images';
import { adminProductRoutes } from './admin-products';
import { reindexProductFts } from '../../lib/search';

export const adminRoutes = new Hono<AdminEnv>();

adminRoutes.route('/', adminAuthRoutes);

adminRoutes.use('*', requireAdmin);

adminRoutes.get('/session', (c) => {
  const session = c.get('admin');
  return c.json({
    ok: true,
    data: { issued_at: session.iat, expires_at: session.exp },
  });
});

adminRoutes.post('/search/reindex', async (c) => {
  const products = await reindexProductFts(c.env.DB);
  return c.json({ ok: true, data: { products } });
});

adminRoutes.route('/categories', adminCategoryRoutes);
adminRoutes.route('/products', adminProductRoutes);
adminRoutes.route('/', adminImageRoutes);
