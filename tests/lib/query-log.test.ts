import { describe, expect, it } from 'vitest';
import { countCalls, countRoundTrips } from '../../src/lib/query-log';

describe('countCalls', () => {
  it('counts method calls and forwards arguments', () => {
    const fake = {
      prepare: (sql: string) => sql,
      batch: (items: unknown[]) => items.length,
    };
    const counted = countCalls(fake);

    expect(counted.value.prepare('a')).toBe('a');
    counted.value.prepare('b');
    expect(counted.value.batch([1, 2])).toBe(2);
    expect(counted.count()).toBe(3);
  });

  it('passes non-function properties through', () => {
    const fake = { label: 'db' } as { label: string };
    const counted = countCalls(fake);
    expect(counted.value.label).toBe('db');
  });
});

describe('countRoundTrips', () => {
  it('counts executions rather than local prepare/bind calls', () => {
    const statement = {
      params: [] as unknown[],
      bind(...params: unknown[]) {
        return { ...this, params };
      },
      async all() {
        return { results: [], success: true };
      },
      async first() {
        return null;
      },
    };
    const fake = {
      prepare: (_sql: string) => statement,
      batch: async (items: unknown[]) => items,
      exec: async (_sql: string) => ({ count: 1 }),
    };
    const counted = countRoundTrips(fake);

    const prepared = counted.value.prepare('SELECT 1');
    expect(counted.count()).toBe(0);

    const bound = prepared.bind(1);
    expect(counted.count()).toBe(0);

    void bound.all();
    expect(counted.count()).toBe(1);

    void prepared.first();
    expect(counted.count()).toBe(2);

    void counted.value.batch([prepared]);
    expect(counted.count()).toBe(3);

    void counted.value.exec('SELECT 1');
    expect(counted.count()).toBe(4);
  });
});
