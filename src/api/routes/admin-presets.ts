import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import { applyPreset } from '../../lib/presets';
import type { AdminEnv } from '../middleware/admin';
import { notFound, validationErrorResponse } from '../validation';

const applySchema = z.object({
  preset: z.enum(['clothing', 'food', 'electronics', 'baby-gifts']),
});

export const adminPresetRoutes = new Hono<AdminEnv>();

adminPresetRoutes.post(
  '/apply',
  zValidator('json', applySchema, (result, c) => {
    if (!result.success) return validationErrorResponse(c, result.error);
  }),
  async (c) => {
    const { preset } = c.req.valid('json');
    const result = await applyPreset(c.env.DB, preset);
    if (!result) return notFound(c, 'preset_not_found', 'Preset not found');
    return c.json({ ok: true, data: result });
  },
);
