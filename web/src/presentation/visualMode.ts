import type { VisualMode } from './types.ts';

export const VISUAL_MODE_STORAGE_KEY = 'dm_visual_mode';

export interface VisualEnvironment {
  viewportWidth: number;
  prefersReducedMotion: boolean;
  supportsWebGL2: boolean;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Safely checks whether WebGL2 is available in the current browser context.
 */
export function probeWebGL2(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    return Boolean(gl);
  } catch {
    return false;
  }
}

/**
 * Reads runtime viewport, reduced-motion preference, and WebGL2 support.
 */
export function detectEnvironmentCapabilities(): VisualEnvironment {
  if (typeof window === 'undefined') {
    return {
      viewportWidth: 1440,
      prefersReducedMotion: false,
      supportsWebGL2: false
    };
  }
  const prefersReducedMotion =
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;
  return {
    viewportWidth: window.innerWidth,
    prefersReducedMotion,
    supportsWebGL2: probeWebGL2()
  };
}

/**
 * Computes smart device default:
 * - 'drama' on desktop (>= 1024px) with WebGL2 and no reduced-motion preference
 * - 'lite' otherwise (mobile viewports, reduced motion, or missing WebGL2)
 */
export function detectDefaultVisualMode(env: VisualEnvironment): VisualMode {
  if (env.prefersReducedMotion || env.viewportWidth < 1024 || !env.supportsWebGL2) {
    return 'lite';
  }
  return 'drama';
}

function getDefaultStorage(): StorageLike | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readStoredVisualMode(storage: StorageLike | null = getDefaultStorage()): VisualMode | null {
  if (!storage) return null;
  try {
    const val = storage.getItem(VISUAL_MODE_STORAGE_KEY);
    return val === 'lite' || val === 'drama' ? val : null;
  } catch {
    return null;
  }
}

export function persistVisualMode(
  mode: VisualMode,
  storage: StorageLike | null = getDefaultStorage()
): void {
  if (!storage) return;
  try {
    storage.setItem(VISUAL_MODE_STORAGE_KEY, mode);
  } catch {
    // Ignore storage quota / privacy mode errors cleanly
  }
}

/**
 * Resolves the initial visual mode from saved override (downgrading drama->lite if WebGL2
 * is unavailable) or falls back to smart environment heuristic.
 */
export function resolveInitialVisualMode(
  storage: StorageLike | null = getDefaultStorage(),
  env: VisualEnvironment = detectEnvironmentCapabilities()
): VisualMode {
  const saved = readStoredVisualMode(storage);
  if (saved) {
    if (saved === 'drama' && !env.supportsWebGL2) {
      return 'lite';
    }
    return saved;
  }
  return detectDefaultVisualMode(env);
}
