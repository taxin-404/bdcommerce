import type { SiteConfig } from './config';
import { loadConfigFromRows } from './config';
import { parseHomeSections, type HomeSection } from './sections';

export interface StorefrontSettings {
  config: SiteConfig;
  sections: HomeSection[];
  setupCompleted: boolean;
}

function isSetupComplete(rows: { key: string; value: string }[]): boolean {
  const row = rows.find((item) => item.key === 'setup_completed');
  if (!row) return false;
  try {
    return JSON.parse(row.value) === true;
  } catch {
    return row.value === 'true' || row.value === '1';
  }
}

/** Reads the settings table once for config overrides, home sections and setup state. */
export async function loadStorefront(db: D1Database): Promise<StorefrontSettings> {
  const { results } = await db
    .prepare('SELECT key, value FROM settings')
    .all<{ key: string; value: string }>();

  return {
    config: loadConfigFromRows(results),
    sections: parseHomeSections(results.find((row) => row.key === 'home_sections')?.value),
    setupCompleted: isSetupComplete(results),
  };
}
