import type { CardDefinition, Deck } from '../types/card';

export type PlayerId = 'player' | 'opponent';

export type Phase =
  | 'START_OF_TURN'
  | 'DRAW'
  | 'MANA_CHARGE'
  | 'MAIN'
  | 'ATTACK'
  | 'END_OF_TURN';

export type AttackTarget =
  | { type: 'shield'; index: number }
  | { type: 'creature'; instanceId: string }
  | { type: 'player' };

export interface CardInstance {
  instanceId: string;
  card: CardDefinition;
  owner: PlayerId;
}

export interface CreatureInstance {
  instanceId: string;
  card: CardDefinition;
  owner: PlayerId;
  isTapped: boolean;
  summonedTurn: number;
  powerModifier: number;
  evolvedOn?: CardInstance[];
}

export interface ShieldInstance {
  id: string;
  card: CardDefinition;
  isBroken: boolean;
}

export interface ManaCardInstance {
  instanceId: string;
  card: CardDefinition;
  isTapped: boolean;
}

export interface PlayerState {
  deck: CardInstance[];
  hand: CardInstance[];
  shields: ShieldInstance[];
  manaZone: ManaCardInstance[];
  battleZone: CreatureInstance[];
  graveyard: CardInstance[];
  manaChargedThisTurn: boolean;
}

export type CombatStage =
  | 'DECLARE'
  | 'BLOCK'
  | 'BATTLE'
  | 'SHIELD_BREAK'
  | 'RESOLVED';

export interface CombatState {
  attackerId: string;
  target: AttackTarget;
  blockerId: string | null;
  stage: CombatStage;
}

export interface BlockerChoiceInteraction {
  type: 'BLOCK_DECLARATION' | 'BLOCKER_CHOICE';
  defendingPlayer: PlayerId;
  attackerId: string;
  validBlockerIds: string[];
}

export interface ShieldTriggerChoiceInteraction {
  type: 'SHIELD_TRIGGER_RESOLUTION' | 'SHIELD_TRIGGER_CHOICE';
  player: PlayerId;
  shieldCards: CardInstance[];
  triggers?: Array<{ shieldId: string; card: CardDefinition }>;
}

export interface TargetSelectionInteraction {
  type: 'TARGET_SELECTION';
  player: PlayerId;
  actionType: 'SPELL_TARGET' | 'CREATURE_ATTACK' | 'EFFECT_TARGET';
  sourceCardId: string;
  validTargetIds: string[];
  minTargets: number;
  maxTargets: number;
  prompt: string;
}

export type PendingInteraction =
  | BlockerChoiceInteraction
  | ShieldTriggerChoiceInteraction
  | TargetSelectionInteraction;

export interface GameState {
  turn: number;
  activePlayer: PlayerId;
  phase: Phase;
  players: Record<PlayerId, PlayerState>;
  combatState: CombatState | null;
  pendingInteraction: PendingInteraction | null;
  winner: PlayerId | null;
  actionLog: string[];
}

export type GameAction =
  | { type: 'CHARGE_MANA'; player?: PlayerId; cardInstanceId: string }
  | {
      type: 'SUMMON_CREATURE';
      player?: PlayerId;
      cardInstanceId: string;
      baitInstanceId?: string;
    }
  | {
      type: 'CAST_SPELL';
      player?: PlayerId;
      cardInstanceId: string;
      targets?: string[];
    }
  | {
      type: 'DECLARE_ATTACK';
      player?: PlayerId;
      attackerId?: string;
      attackerInstanceId?: string;
      target: AttackTarget;
    }
  | {
      type: 'DECLARE_BLOCK';
      player?: PlayerId;
      blockerId?: string | null;
      blockerInstanceId?: string | null;
    }
  | {
      type: 'RESOLVE_SHIELD_TRIGGER';
      player?: PlayerId;
      shieldId: string;
      activate?: boolean;
      playTrigger?: boolean;
      targets?: string[];
    }
  | {
      type: 'RESOLVE_TRIGGER';
      player?: PlayerId;
      shieldId: string;
      playTrigger?: boolean;
      activate?: boolean;
      targets?: string[];
    }
  | { type: 'SELECT_TARGETS'; player?: PlayerId; selectedIds: string[] }
  | {
      type: 'PASS_PHASE';
      player?: PlayerId;
      targetPhase?: Phase | 'END_TURN';
    }
  | {
      type: 'NEXT_PHASE';
      player?: PlayerId;
      targetPhase?: Phase | 'END_TURN';
    }
  | { type: 'END_TURN'; player?: PlayerId }
  | { type: 'START_TURN'; player?: PlayerId };

export type { CardDefinition, Deck };
