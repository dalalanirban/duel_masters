import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { computeAudioGain, createAudioEngine } from '../AudioEngine.ts';
import { CIVILIZATION_AUDIO_PATCHES } from '../civilizationPatches.ts';

describe('Procedural Web Audio Engine & 5-Civilization Patches', () => {
  it('defines distinct timbre profiles for all 5 Duel Masters civilizations', () => {
    const civs = ['Fire', 'Water', 'Light', 'Darkness', 'Nature'];
    for (const civ of civs) {
      const patch = CIVILIZATION_AUDIO_PATCHES[civ];
      assert.ok(patch, `Missing patch for ${civ}`);
      assert.ok(Array.isArray(patch.freqs) && patch.freqs.length >= 2);
      assert.ok(patch.oscType);
      assert.ok(patch.filterFreq > 0);
    }
    const baseFreqs = new Set(civs.map((c) => CIVILIZATION_AUDIO_PATCHES[c].freqs[0]));
    assert.equal(baseFreqs.size, 5, 'Each civilization should have a distinct fundamental frequency');
  });

  it('computes perceptual gain via squared curve and true zero when muted', () => {
    assert.equal(computeAudioGain(0, false), 0);
    assert.equal(computeAudioGain(1, true), 0);
    assert.equal(computeAudioGain(0.5, false), 0.25);
    assert.equal(computeAudioGain(1, false), 1);
    assert.equal(computeAudioGain(2, false), 1);
    assert.equal(computeAudioGain(-1, false), 0);
  });

  it('safely no-ops in headless/non-browser environments without allocating or throwing', () => {
    const engine = createAudioEngine();
    assert.doesNotThrow(() => {
      engine.playUiTick('tap');
      engine.playUiTick('select');
      engine.setMasterVolume(0.6);
      engine.setMuted(true);
      engine.setMuted(false);
      engine.playBeat({
        id: 'test-beat',
        event: {
          type: 'SHIELD_BROKEN',
          actor: 'player',
          civilizations: ['Fire'],
          targets: [
            { player: 'opponent', zone: 'shields', shieldIndex: 0 },
            { player: 'opponent', zone: 'shields', shieldIndex: 1 },
            { player: 'opponent', zone: 'shields', shieldIndex: 2 }
          ]
        },
        displayState: {},
        durationMs: { lite: 200, drama: 720 },
        hitStopMs: 85,
        trauma: 0.58
      });
      engine.dispose();
    });
    assert.equal(engine.getActiveVoiceCount(), 0);
  });
});
