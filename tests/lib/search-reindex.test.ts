import { describe, expect, it } from 'vitest';
import { reindexProductFts } from '../../src/lib/search';

function fakeDb() {
  const calls: string[] = [];
  let batched = 0;

  const db = {
    prepare(sql: string) {
      calls.push(sql.trim());
      return {
        first: async () => ({ count: 3 }),
      };
    },
    async batch(statements: unknown[]) {
      batched = statements.length;
      return [];
    },
  } as unknown as D1Database;

  return { db, calls, batched: () => batched };
}

describe('reindexProductFts', () => {
  it('clears and repopulates the whole index in one batch', async () => {
    const { db, calls, batched } = fakeDb();

    const count = await reindexProductFts(db);

    expect(count).toBe(3);
    expect(calls.some((sql) => sql === 'DELETE FROM product_fts')).toBe(true);
    expect(calls.some((sql) => sql.includes('INSERT INTO product_fts'))).toBe(true);
    expect(calls.some((sql) => sql.includes('FROM products p'))).toBe(true);
    expect(batched()).toBe(2);
  });
});
