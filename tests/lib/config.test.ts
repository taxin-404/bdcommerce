import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import defaultConfig from '../../site.config';
import { loadConfig, mergeConfig } from '../../src/lib/config';

function fakeDb(rows: { key: string; value: string }[]): D1Database {
  return {
    prepare: () => ({
      all: async () => ({ results: rows, success: true, meta: {} }),
    }),
  } as unknown as D1Database;
}

describe('mergeConfig', () => {
  it('deep-merges settings overrides over the defaults', () => {
    const merged = mergeConfig(defaultConfig, { theme: { primary: '#000000' } });

    expect(merged.theme.primary).toBe('#000000');
    expect(merged.theme.accent).toBe(defaultConfig.theme.accent);
  });

  it('replaces arrays instead of merging them', () => {
    const merged = mergeConfig(defaultConfig, {
      shipping: {
        zones: [{ id: 'dhaka', label: { en: 'Dhaka', bn: 'ঢাকা' }, fee: 80 }],
      },
    });

    expect(merged.shipping.zones).toHaveLength(1);
    expect(merged.shipping.zones[0]?.fee).toBe(80);
  });

  it('does not mutate the base config', () => {
    const before = defaultConfig.theme.primary;
    mergeConfig(defaultConfig, { theme: { primary: '#111111' } });

    expect(defaultConfig.theme.primary).toBe(before);
  });

  it('rejects overrides that do not match the schema', () => {
    expect(() => mergeConfig(defaultConfig, { theme: { primary: 123 } })).toThrow();
  });
});

describe('loadConfig', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('merges settings rows over the defaults', async () => {
    const config = await loadConfig(
      fakeDb([{ key: 'theme', value: '{"primary":"#123456"}' }]),
    );

    expect(config.theme.primary).toBe('#123456');
    expect(config.theme.accent).toBe(defaultConfig.theme.accent);
  });

  it('returns defaults when the settings table is empty', async () => {
    const config = await loadConfig(fakeDb([]));

    expect(config).toEqual(defaultConfig);
  });

  it('falls back to defaults for malformed settings JSON', async () => {
    const config = await loadConfig(fakeDb([{ key: 'theme', value: '{' }]));

    expect(config.theme.primary).toBe(defaultConfig.theme.primary);
  });

  it('ignores settings rows that are not config sections', async () => {
    const config = await loadConfig(
      fakeDb([{ key: 'home_sections', value: '["hero","featured"]' }]),
    );

    expect(config).toEqual(defaultConfig);
  });

  it('ignores settings rows that fail schema validation', async () => {
    const config = await loadConfig(fakeDb([{ key: 'theme', value: '{"primary":123}' }]));

    expect(config.theme.primary).toBe(defaultConfig.theme.primary);
  });

  it('applies valid rows and skips invalid ones', async () => {
    const config = await loadConfig(
      fakeDb([
        { key: 'theme', value: '{"primary":"#123456"}' },
        { key: 'shipping', value: '{"zones":[]}' },
      ]),
    );

    expect(config.theme.primary).toBe('#123456');
    expect(config.shipping.zones).toEqual(defaultConfig.shipping.zones);
  });
});
