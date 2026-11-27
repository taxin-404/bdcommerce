import { describe, expect, it } from 'vitest';
import { DEFAULT_HOME_SECTIONS, parseHomeSections } from '../../src/lib/sections';

describe('parseHomeSections', () => {
  it('returns the default sections when the setting is absent', () => {
    expect(parseHomeSections(undefined)).toEqual(DEFAULT_HOME_SECTIONS);
  });

  it('parses a valid ordered section list', () => {
    const sections = parseHomeSections(
      JSON.stringify([
        { type: 'announcement', text: { en: 'Eid sale', bn: 'ঈদ অফার' } },
        { type: 'categories' },
        { type: 'featured' },
      ]),
    );

    expect(sections.map((section) => section.type)).toEqual([
      'announcement',
      'categories',
      'featured',
    ]);
    expect(sections[0]?.text?.bn).toBe('ঈদ অফার');
  });

  it('falls back to defaults for malformed JSON', () => {
    expect(parseHomeSections('{')).toEqual(DEFAULT_HOME_SECTIONS);
  });

  it('falls back to defaults for an unknown section type', () => {
    expect(parseHomeSections(JSON.stringify([{ type: 'carousel' }]))).toEqual(
      DEFAULT_HOME_SECTIONS,
    );
  });

  it('falls back to defaults for an empty list', () => {
    expect(parseHomeSections('[]')).toEqual(DEFAULT_HOME_SECTIONS);
  });
});

describe('section link safety', () => {
  it('accepts site-relative and https links', () => {
    const sections = parseHomeSections(
      JSON.stringify([
        { type: 'banner', text: { en: 'Sale', bn: 'সেল' }, href: '/shop?sort=price-asc' },
        { type: 'banner', text: { en: 'More', bn: 'আরও' }, href: 'https://example.com' },
      ]),
    );

    expect(sections[0]?.href).toBe('/shop?sort=price-asc');
    expect(sections[1]?.href).toBe('https://example.com');
  });

  it('rejects javascript: links and falls back to defaults', () => {
    const sections = parseHomeSections(
      JSON.stringify([{ type: 'banner', href: 'javascript:alert(1)' }]),
    );

    expect(sections).toEqual(DEFAULT_HOME_SECTIONS);
  });

  it('rejects protocol-relative links', () => {
    const sections = parseHomeSections(
      JSON.stringify([{ type: 'banner', href: '//evil.example/phish' }]),
    );

    expect(sections).toEqual(DEFAULT_HOME_SECTIONS);
  });
});
