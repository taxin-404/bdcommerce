import { describe, expect, it } from 'vitest';
import { syncProductFts } from '../../src/lib/search';

interface Call {
  sql: string;
  args: unknown[];
}

function fakeDb(product: Record<string, unknown> | null) {
  const calls: Call[] = [];

  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          calls.push({ sql, args });
          return {
            first: async () => product,
            all: async () => ({ results: [{ sku: 'DRAFT-1', active: 1 }] }),
            run: async () => ({ success: true }),
          };
        },
      };
    },
  } as unknown as D1Database;

  return { db, calls };
}

describe('syncProductFts', () => {
  it('indexes drafts as well as active products and includes the slug', async () => {
    const { db, calls } = fakeDb({
      slug: 'draft-product',
      title: 'Draft Product',
      title_bn: null,
      description: null,
      description_bn: null,
    });

    await syncProductFts(db, 7);

    expect(calls[0]?.sql).toContain('DELETE FROM product_fts WHERE rowid = ?');
    expect(calls[0]?.args).toEqual([7]);
    expect(calls[1]?.sql).not.toContain("status = 'active'");
    expect(calls[3]?.sql).toContain('INSERT INTO product_fts');
    expect(calls[3]?.sql).toContain('slug');
    expect(calls[3]?.args).toContain('draft-product');
    expect(calls[3]?.args).toContain('DRAFT-1');
  });

  it('removes a missing product without inserting a row', async () => {
    const { db, calls } = fakeDb(null);

    await syncProductFts(db, 9);

    expect(calls).toHaveLength(2);
    expect(calls[1]?.sql).not.toContain('INSERT INTO product_fts');
  });
});
