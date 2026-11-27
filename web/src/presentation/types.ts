import type { CardDefinition, Civilization } from '../types/card.ts';
import type { GameState, PlayerId } from '../engine/types.ts';

export type VisualMode = 'lite' | 'drama';

export type PresentationEventType =
  | 'DRAW'
  | 'CHARGE_MANA'
  | 'SUMMON_CREATURE'
  | 'CAST_SPELL'
  | 'EVOLVE'
  | 'DECLARE_ATTACK'
  | 'BLOCK'
  | 'SHIELD_BROKEN'
  | 'SHIELD_TRIGGER'
  | 'CREATURE_DESTROYED'
  | 'GAME_OVER';

export interface PresentationAnchorRef {
  player: PlayerId;
  zone: 'deck' | 'hand' | 'manaZone' | 'shields' | 'battleZone' | 'graveyard';
  instanceId?: string;
  shieldIndex?: number;
}

export interface CutInSpec {
  kind: 'EVOLUTION' | 'VORTEX_EVOLUTION' | 'BOSS_SUMMON' | 'SHIELD_TRIGGER' | 'FINAL_BLOW';
  title: string;
  subtitle: string;
  card: CardDefinition;
  civilizations: Civilization[];
}

export interface PresentationEvent {
  type: PresentationEventType;
  actor: PlayerId;
  card?: CardDefinition;
  civilizations?: Civilization[];
  source?: PresentationAnchorRef;
  targets?: PresentationAnchorRef[];
  meta?: {
    isVortex?: boolean;
    breakerCount?: number;
    powerDelta?: number;
    isShieldBurn?: boolean;
  };
}

export interface PresentationBeat {
  id: string;
  event: PresentationEvent;
  displayState: GameState;
  durationMs: { lite: number; drama: number };
  hitStopMs: number;
  trauma: number;
  cutIn?: CutInSpec;
}

export interface BeatTimingConfig {
  lite: number;
  drama: number;
  hitStopMs: number;
  trauma: number;
}

export const BEAT_TIMING_PRESETS: Record<PresentationEventType, BeatTimingConfig> = {
  DRAW: { lite: 150, drama: 260, hitStopMs: 0, trauma: 0 },
  CHARGE_MANA: { lite: 160, drama: 450, hitStopMs: 0, trauma: 0.12 },
  SUMMON_CREATURE: { lite: 180, drama: 520, hitStopMs: 40, trauma: 0.28 },
  CAST_SPELL: { lite: 180, drama: 560, hitStopMs: 45, trauma: 0.30 },
  EVOLVE: { lite: 220, drama: 850, hitStopMs: 80, trauma: 0.52 },
  BLOCK: { lite: 150, drama: 450, hitStopMs: 45, trauma: 0.30 },
  DECLARE_ATTACK: { lite: 180, drama: 520, hitStopMs: 75, trauma: 0.48 },
  SHIELD_BROKEN: { lite: 200, drama: 720, hitStopMs: 85, trauma: 0.58 },
  SHIELD_TRIGGER: { lite: 220, drama: 900, hitStopMs: 60, trauma: 0.40 },
  CREATURE_DESTROYED: { lite: 180, drama: 540, hitStopMs: 50, trauma: 0.36 },
  GAME_OVER: { lite: 220, drama: 900, hitStopMs: 90, trauma: 0.70 }
};
