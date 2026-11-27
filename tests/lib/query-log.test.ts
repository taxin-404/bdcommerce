import { describe, expect, it } from 'vitest';
import { countCalls } from '../../src/lib/query-log';

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
