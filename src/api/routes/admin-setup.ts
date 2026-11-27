import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import {
  completeSetup,
  setupSchema,
} from '../../lib/admin-settings';
import { slugify } from '../../lib/slug';
import type { AdminEnv } from '../middleware/admin';
import { validationErrorResponse } from '../validation';

export const adminSetupRoutes = new Hono<AdminEnv>();

adminSetupRoutes.post(
  '/',
  zValidator('json', setupSchema, (result, c) => {
    if (!result.success) return validationErrorResponse(c, result.error);
  }),
  async (c) => {
    const input = c.req.valid('json');
    const categorySlug = slugify(input.first_category.name) || 'first-category';

    await completeSetup(c.env.DB, input, categorySlug);

    return c.json({
      ok: true,
      data: {
        setup_completed: true,
        category_slug: categorySlug,
      },
    });
  },
);
