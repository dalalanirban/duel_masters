import type { Civilization } from '../types/card.ts';
import type { CivAudioPatch } from './audioTypes.ts';

/**
 * Distinct timbre & harmonic pitch signatures for all 5 Duel Masters civilizations.
 */
export const CIVILIZATION_AUDIO_PATCHES: Record<Civilization, CivAudioPatch> = {
  Fire: {
    civilization: 'Fire',
    oscType: 'sawtooth',
    modType: 'sine',
    freqs: [349.23, 523.25], // F4 + C5 fiery power fifth
    modRatio: 2.0,
    modDepth: 110,
    filterType: 'lowpass',
    filterFreq: 2200,
    filterQ: 4.5,
    attackSec: 0.008,
    decaySec: 0.24,
    noiseLevel: 0.14
  },
  Water: {
    civilization: 'Water',
    oscType: 'sine',
    modType: 'sine',
    freqs: [587.33, 880.0], // D5 + A5 crystalline water bell
    modRatio: 3.5,
    modDepth: 65,
    filterType: 'bandpass',
    filterFreq: 1900,
    filterQ: 2.2,
    attackSec: 0.004,
    decaySec: 0.34,
    noiseLevel: 0.04
  },
  Light: {
    civilization: 'Light',
    oscType: 'triangle',
    modType: 'sine',
    freqs: [659.25, 987.77, 1318.51], // E5 + B5 + E6 radiant brass stack
    modRatio: 1.0,
    modDepth: 25,
    filterType: 'highpass',
    filterFreq: 420,
    filterQ: 0.9,
    attackSec: 0.02,
    decaySec: 0.32,
    noiseLevel: 0.02
  },
  Darkness: {
    civilization: 'Darkness',
    oscType: 'triangle',
    modType: 'square',
    freqs: [110.0, 155.56], // A2 + Eb3 abyssal tritone
    modRatio: 1.414,
    modDepth: 48,
    filterType: 'lowpass',
    filterFreq: 460,
    filterQ: 3.2,
    attackSec: 0.015,
    decaySec: 0.4,
    noiseLevel: 0.1
  },
  Nature: {
    civilization: 'Nature',
    oscType: 'sine',
    modType: 'triangle',
    freqs: [196.0, 293.66, 440.0], // G3 + D4 + A4 primal organic stack
    modRatio: 1.5,
    modDepth: 32,
    filterType: 'lowpass',
    filterFreq: 1150,
    filterQ: 1.8,
    attackSec: 0.01,
    decaySec: 0.3,
    noiseLevel: 0.06
  }
};
