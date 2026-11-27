import type { Civilization } from '../types/card.ts';

export interface CivPaletteEntry {
  primaryHex: string;
  secondaryHex: string;
  primaryRgb: [number, number, number];
  secondaryRgb: [number, number, number];
  glowRgba: string;
  gradientClass: string;
}

export const CIV_PALETTE: Record<Civilization, CivPaletteEntry> = {
  Fire: {
    primaryHex: '#f97316',
    secondaryHex: '#ef4444',
    primaryRgb: [0.98, 0.45, 0.09],
    secondaryRgb: [0.94, 0.27, 0.27],
    glowRgba: 'rgba(249, 115, 22, 0.65)',
    gradientClass: 'from-orange-600/90 via-red-600/85 to-amber-500/85'
  },
  Water: {
    primaryHex: '#38bdf8',
    secondaryHex: '#2563eb',
    primaryRgb: [0.22, 0.74, 0.97],
    secondaryRgb: [0.15, 0.39, 0.92],
    glowRgba: 'rgba(56, 189, 248, 0.65)',
    gradientClass: 'from-cyan-500/90 via-sky-600/85 to-blue-700/85'
  },
  Light: {
    primaryHex: '#fbbf24',
    secondaryHex: '#fef08a',
    primaryRgb: [0.98, 0.75, 0.14],
    secondaryRgb: [1.0, 0.94, 0.54],
    glowRgba: 'rgba(251, 191, 36, 0.68)',
    gradientClass: 'from-amber-400/90 via-yellow-500/85 to-amber-600/85'
  },
  Darkness: {
    primaryHex: '#a855f7',
    secondaryHex: '#4c1d95',
    primaryRgb: [0.66, 0.33, 0.97],
    secondaryRgb: [0.3, 0.11, 0.58],
    glowRgba: 'rgba(168, 85, 247, 0.65)',
    gradientClass: 'from-purple-600/90 via-violet-800/90 to-fuchsia-700/85'
  },
  Nature: {
    primaryHex: '#22c55e',
    secondaryHex: '#84cc16',
    primaryRgb: [0.13, 0.77, 0.37],
    secondaryRgb: [0.52, 0.8, 0.09],
    glowRgba: 'rgba(34, 197, 94, 0.65)',
    gradientClass: 'from-emerald-600/90 via-green-600/85 to-lime-500/85'
  }
};

export function getCivPalette(civs?: Civilization[]): {
  primary: CivPaletteEntry;
  secondary: CivPaletteEntry;
} {
  const first = civs?.[0] && CIV_PALETTE[civs[0]] ? CIV_PALETTE[civs[0]] : CIV_PALETTE.Fire;
  const second = civs?.[1] && CIV_PALETTE[civs[1]] ? CIV_PALETTE[civs[1]] : first;
  return { primary: first, secondary: second };
}
