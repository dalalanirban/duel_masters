import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  detectDefaultVisualMode,
  persistVisualMode,
  readStoredVisualMode,
  resolveInitialVisualMode
} from '../visualMode.ts';

describe('Presentation Visual Mode Selection', () => {
  it('defaults to lite when prefers-reduced-motion is active even on WebGL2 desktop', () => {
    const mode = detectDefaultVisualMode({
      viewportWidth: 1440,
      prefersReducedMotion: true,
      supportsWebGL2: true
    });
    assert.equal(mode, 'lite');
  });

  it('defaults to lite on narrow mobile viewports (< 1024px) even with WebGL2 support', () => {
    const mode = detectDefaultVisualMode({
      viewportWidth: 390,
      prefersReducedMotion: false,
      supportsWebGL2: true
    });
    assert.equal(mode, 'lite');
  });

  it('defaults to lite when WebGL2 is unavailable on desktop', () => {
    const mode = detectDefaultVisualMode({
      viewportWidth: 1440,
      prefersReducedMotion: false,
      supportsWebGL2: false
    });
    assert.equal(mode, 'lite');
  });

  it('defaults to drama on desktop (>= 1024px) with WebGL2 and no reduced-motion', () => {
    const mode = detectDefaultVisualMode({
      viewportWidth: 1440,
      prefersReducedMotion: false,
      supportsWebGL2: true
    });
    assert.equal(mode, 'drama');
  });

  it('downgrades stored drama preference to lite if runtime WebGL2 is missing', () => {
    const storageMap = new Map([['dm_visual_mode', 'drama']]);
    const storage = {
      getItem: (k) => storageMap.get(k) ?? null,
      setItem: (k, v) => storageMap.set(k, v)
    };
    const resolved = resolveInitialVisualMode(storage, {
      viewportWidth: 1440,
      prefersReducedMotion: false,
      supportsWebGL2: false
    });
    assert.equal(resolved, 'lite');
  });

  it('persists explicit user mode override safely', () => {
    const storageMap = new Map();
    const storage = {
      getItem: (k) => storageMap.get(k) ?? null,
      setItem: (k, v) => storageMap.set(k, v)
    };
    persistVisualMode('lite', storage);
    assert.equal(readStoredVisualMode(storage), 'lite');

    persistVisualMode('drama', storage);
    assert.equal(readStoredVisualMode(storage), 'drama');

    const resolved = resolveInitialVisualMode(storage, {
      viewportWidth: 390,
      prefersReducedMotion: false,
      supportsWebGL2: true
    });
    assert.equal(resolved, 'drama');
  });
});
