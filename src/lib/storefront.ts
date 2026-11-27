import type { SiteConfig } from './config';
import { loadConfigFromRows } from './config';
import { parseHomeSections, type HomeSection } from './sections';

export interface StorefrontSettings {
  config: SiteConfig;
  sections: HomeSection[];
}

/** Reads the settings table once for both config overrides and home sections. */
export async function loadStorefront(db: D1Database): Promise<StorefrontSettings> {
  const { results } = await db
    .prepare('SELECT key, value FROM settings')
    .all<{ key: string; value: string }>();

  return {
    config: loadConfigFromRows(results),
    sections: parseHomeSections(results.find((row) => row.key === 'home_sections')?.value),
  };
}
