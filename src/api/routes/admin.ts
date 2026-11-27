import { Hono } from 'hono';
import type { AdminEnv } from '../middleware/admin';
import { requireAdmin } from '../middleware/admin';
import { adminAuthRoutes } from './admin-auth';
import { adminCategoryRoutes } from './admin-categories';
import { adminCouponRoutes } from './admin-coupons';
import { adminImageRoutes } from './admin-images';
import { adminBlocklistRoutes, adminOrderRoutes } from './admin-orders';
import { adminPresetRoutes } from './admin-presets';
import { adminProductRoutes } from './admin-products';
import { adminSettingsRoutes } from './admin-settings';
import { adminSetupRoutes } from './admin-setup';
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
adminRoutes.route('/orders', adminOrderRoutes);
adminRoutes.route('/blocklist', adminBlocklistRoutes);
adminRoutes.route('/coupons', adminCouponRoutes);
adminRoutes.route('/settings', adminSettingsRoutes);
adminRoutes.route('/setup', adminSetupRoutes);
adminRoutes.route('/presets', adminPresetRoutes);
adminRoutes.route('/', adminImageRoutes);
