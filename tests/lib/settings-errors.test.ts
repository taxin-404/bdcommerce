import { describe, expect, it } from 'vitest';
import defaultConfig from '../../site.config';
import { settingsUpdateSchema } from '../../src/lib/admin-settings';
import { DEFAULT_HOME_SECTIONS, parseHomeSections } from '../../src/lib/sections';
import { formatIssues, labelForPath, type SettingsIssue } from '../../src/lib/settings-errors';
import { buildSettingsLabels } from '../../src/lib/settings-labels';

const en = buildSettingsLabels('en');
const bn = buildSettingsLabels('bn');

function issuesFor(input: unknown): SettingsIssue[] {
  const result = settingsUpdateSchema.safeParse(input);
  if (result.success) return [];
  return result.error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
}

function payments(overrides: Record<string, unknown>) {
  return {
    ...defaultConfig.payments,
    ...overrides,
  };
}

describe('settings validation -> readable field errors', () => {
  it('names the social field and keeps the server problem', () => {
    const issues = issuesFor({
      social: { ...defaultConfig.social, facebook: 'facebook.com/shop' },
    });
    expect(formatIssues(issues, en)).toEqual([
      'Facebook: Expected a site-relative path or an http(s) URL',
    ]);
    expect(formatIssues(issues, bn)[0]?.startsWith('ফেসবুক:')).toBe(true);
  });

  it('names enabled wallet numbers, including the wallet name', () => {
    const issues = issuesFor({
      payments: payments({
        bkash: { ...defaultConfig.payments.bkash, enabled: true, number: '' },
      }),
    });
    expect(issues).toEqual([
      { path: 'payments.bkash.number', message: 'An enabled wallet needs a number' },
    ]);
    expect(formatIssues(issues, en)).toEqual([
      'bKash Wallet number: An enabled wallet needs a number',
    ]);
  });

  it('names zone fields and their index', () => {
    const issues = issuesFor({
      shipping: {
        ...defaultConfig.shipping,
        zones: [{ ...defaultConfig.shipping.zones[0], fee: 60.5 }],
        districtZones: { Dhaka: 'dhaka' },
        fallbackZone: 'dhaka',
      },
    });
    expect(issues[0]?.path).toBe('shipping.zones.0.fee');
    expect(formatIssues(issues, en)[0]).toMatch(/^Zone #1: Fee \(BDT\): /);
  });

  it('maps image, inventory, contact, section, and unknown paths', () => {
    expect(labelForPath('images.address', en)).toBe('Image address (R2 public URL)');
    expect(labelForPath('inventory.lowStockThreshold', en)).toBe('Low-stock threshold');
    expect(labelForPath('contact.email', en)).toBe('Email');
    expect(labelForPath('home_sections.0.type', en)).toBe('Homepage sections');
    expect(labelForPath('shipping.districtZones.Cumilla', en)).toBe('District → zone (Cumilla)');
    expect(labelForPath('something.unexpected', en)).toBe('something.unexpected');
  });
});

describe('settings validation cases', () => {
  it('accepts the user Nagad case on a fresh config', () => {
    expect(
      issuesFor({
        payments: payments({
          nagad: { ...defaultConfig.payments.nagad, enabled: true, number: '01812345678' },
        }),
      }),
    ).toEqual([]);
  });

  it('accepts bKash off + Nagad on with a number', () => {
    expect(
      issuesFor({
        payments: payments({
          bkash: { ...defaultConfig.payments.bkash, enabled: false },
          nagad: { ...defaultConfig.payments.nagad, enabled: true, number: '01812345678' },
        }),
      }),
    ).toEqual([]);
  });

  it('accepts bKash on with a number and Nagad off', () => {
    expect(
      issuesFor({
        payments: payments({
          bkash: { ...defaultConfig.payments.bkash, enabled: true, number: '01712345678' },
          nagad: { ...defaultConfig.payments.nagad, enabled: false, number: '' },
        }),
      }),
    ).toEqual([]);
  });

  it('rejects an invalid wallet type without weakening the enum', () => {
    const issues = issuesFor({
      payments: payments({
        nagad: { ...defaultConfig.payments.nagad, enabled: true, number: '01812345678', type: 'business' },
      }),
    });
    expect(issues[0]?.path).toBe('payments.nagad.type');
  });

  it('accepts a blank zone fee as 0 and a blank free-shipping value as null', () => {
    expect(
      issuesFor({
        shipping: {
          ...defaultConfig.shipping,
          zones: [{ ...defaultConfig.shipping.zones[0], fee: 0 }],
          districtZones: { Dhaka: 'dhaka' },
          fallbackZone: 'dhaka',
          freeShippingOver: null,
        },
      }),
    ).toEqual([]);
  });

  it('accepts one zone when it is also the fallback', () => {
    expect(
      issuesFor({
        shipping: {
          zones: [defaultConfig.shipping.zones[0]],
          districtZones: { Dhaka: 'dhaka' },
          fallbackZone: 'dhaka',
          freeShippingOver: null,
        },
      }),
    ).toEqual([]);
  });

  it('accepts empty and valid image addresses and rejects insecure ones', () => {
    expect(issuesFor({ images: { address: '' } })).toEqual([]);
    expect(issuesFor({ images: { address: 'https://images.example.com' } })).toEqual([]);
    const issues = issuesFor({ images: { address: 'http://images.example.com' } });
    expect(issues[0]?.path).toBe('images.address');
    expect(formatIssues(issues, en)[0]).toMatch(/^Image address \(R2 public URL\): /);
  });

  it('accepts social links with https and old saved homepage sections', () => {
    expect(
      issuesFor({
        social: { ...defaultConfig.social, facebook: 'https://facebook.com/shop' },
        home_sections: parseHomeSections(
          JSON.stringify([
            { type: 'hero' },
            { type: 'featured', title: { en: 'Featured', bn: 'ফিচার্ড' } },
          ]),
        ),
      }),
    ).toEqual([]);
    expect(issuesFor({ home_sections: DEFAULT_HOME_SECTIONS })).toEqual([]);
  });
});