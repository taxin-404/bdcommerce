import type { SiteConfig } from './config';

export const THEME_PRESETS = ['clean', 'bold', 'soft', 'dark'] as const;
export type ThemePreset = (typeof THEME_PRESETS)[number];

/** Inline CSS variables; every value is validated by `themeSchema` first. */
export function themeStyle(theme: SiteConfig['theme']): string {
  return [
    `--color-primary:${theme.primary}`,
    `--color-accent:${theme.accent}`,
    `--radius:${theme.radius}`,
    `--font-family:${theme.font}`,
  ].join(';');
}
