import { describe, expect, it } from 'vitest';
import { app } from '../../src/api/app';

describe('GET /api/health', () => {
  it('returns the standard success envelope', async () => {
    const response = await app.request('/api/health');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      data: { status: 'ok' },
    });
  });
});
