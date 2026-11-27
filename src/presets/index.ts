import { babyGiftsPreset } from './baby-gifts';
import { clothingPreset } from './clothing';
import { electronicsPreset } from './electronics';
import { foodPreset } from './food';
import type { BusinessPreset } from './types';

export const PRESETS = [
  clothingPreset,
  foodPreset,
  electronicsPreset,
  babyGiftsPreset,
] as const satisfies readonly BusinessPreset[];

export const PRESET_IDS = PRESETS.map((preset) => preset.id);

export function findPreset(id: string): BusinessPreset | null {
  return PRESETS.find((preset) => preset.id === id) ?? null;
}

export type { BusinessPreset } from './types';
