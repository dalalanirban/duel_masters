import type { Civilization } from '../types/card.ts';

export type AudioBusName = 'sfx' | 'ui' | 'ambience';

export type UiTickKind = 'tap' | 'untap' | 'select' | 'error';

export interface CivAudioPatch {
  civilization: Civilization;
  oscType: OscillatorType;
  modType: OscillatorType;
  freqs: number[];
  modRatio: number;
  modDepth: number;
  filterType: BiquadFilterType;
  filterFreq: number;
  filterQ: number;
  attackSec: number;
  decaySec: number;
  noiseLevel: number;
}
