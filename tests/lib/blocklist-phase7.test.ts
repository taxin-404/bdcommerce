import { describe, expect, it } from 'vitest';
import {
  blockPhone,
  clearPhoneFlag,
  listBlocklist,
  listPhoneFlags,
  setPhoneFlag,
  unblockPhone,
} from '../../src/lib/blocklist';
import { createTestDb } from '../helpers/d1-sqlite';

describe('blocklist', () => {
  it('normalizes, upserts, lists, and removes a phone', async () => {
    const { db } = createTestDb();

    expect(await blockPhone({ db, phone: '+880 1712-345678' })).toEqual({
      phone: '01712345678',
    });
    await blockPhone({ db, phone: '01712345678', reason: 'second reason' });

    const rows = await listBlocklist(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ phone: '01712345678', reason: 'second reason' });

    expect(await unblockPhone(db, '+8801712345678')).toBe(true);
    expect(await unblockPhone(db, '01712345678')).toBe(false);
    expect(await listBlocklist(db)).toHaveLength(0);
  });

  it('rejects an invalid phone', async () => {
    const { db } = createTestDb();
    expect(await blockPhone({ db, phone: '123' })).toBeNull();
    expect(await unblockPhone(db, '123')).toBe(false);
  });
});

describe('phone flags', () => {
  it('sets, lists, and clears advance-payment flags', async () => {
    const { db } = createTestDb();

    expect(await setPhoneFlag({ db, phone: '01812345678', reason: 'watch' })).toEqual({
      phone: '01812345678',
    });
    await setPhoneFlag({ db, phone: '01812345678', reason: 'updated' });

    const rows = await listPhoneFlags(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ phone: '01812345678', reason: 'updated' });

    expect(await clearPhoneFlag(db, '01812345678')).toBe(true);
    expect(await clearPhoneFlag(db, '01812345678')).toBe(false);
    expect(await listPhoneFlags(db)).toHaveLength(0);
  });

  it('rejects an invalid phone', async () => {
    const { db } = createTestDb();
    expect(await setPhoneFlag({ db, phone: 'bad' })).toBeNull();
    expect(await clearPhoneFlag(db, 'bad')).toBe(false);
  });
});
