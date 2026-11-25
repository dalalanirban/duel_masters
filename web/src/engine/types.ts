import type { CardDefinition, Civilization, Deck } from '../types/card';

export type PlayerId = 'player' | 'opponent';

export type Phase =
  | 'START_OF_TURN'
  | 'DRAW'
  | 'MANA_CHARGE'
  | 'MAIN'
  | 'ATTACK'
  | 'END_OF_TURN';

export type AttackTarget =
  | { type: 'shield'; index?: number; indices?: number[] }
  | { type: 'creature'; instanceId: string }
  | { type: 'player' };

export interface CardInstance {
  instanceId: string;
  card: CardDefinition;
  owner: PlayerId;
  summonedTurn?: number;
  evolvedOn?: CardInstance[];
}

export interface CreatureInstance {
  instanceId: string;
  card: CardDefinition;
  owner: PlayerId;
  isTapped: boolean;
  summonedTurn: number;
  powerModifier: number;
  evolvedOn?: CardInstance[];
  tempPowerAttackerBonus?: number;
  tempDoubleBreaker?: boolean;
  tempTripleBreaker?: boolean;
  tempSlayer?: boolean;
  tempSpeedAttacker?: boolean;
  tempUnblockable?: boolean;
  tempCanAttackUntapped?: boolean;
  tempCantAttack?: boolean;
  tempCantAttackPlayers?: boolean;
  tempAttacksIfAble?: boolean;
  tempMustBlockTargetId?: string;
  tempDestroyAfterBattle?: boolean;
  tempUntapOnWinBattle?: boolean;
  tempUntapAtEndTurn?: boolean;
  tempBreakShieldOnBlocked?: boolean;
  tempBounceOnDestroy?: boolean;
  tempManaOnDestroy?: boolean;
  tempExtraRaces?: string[];
  tempDestroyAtEndTurn?: boolean;
}

export interface ShieldInstance {
  id: string;
  shieldId?: string;
  card: CardDefinition;
  isBroken: boolean;
  isFaceUp?: boolean;
}

export interface ManaCardInstance {
  instanceId: string;
  card: CardDefinition;
  isTapped: boolean;
  /** True once spent on a spell/summon or entered tapped (multi-civ) this turn; cannot be manually untapped until start of turn. */
  isSpent?: boolean;
  /** True when manually pre-tapped (staged) by the player to pay for the upcoming play. */
  isStaged?: boolean;
}

export interface PlayerState {
  deck: CardInstance[];
  hand: CardInstance[];
  shields: ShieldInstance[];
  manaZone: ManaCardInstance[];
  battleZone: CreatureInstance[];
  graveyard: CardInstance[];
  manaChargedThisTurn: boolean;
  shieldsBrokenThisTurn?: string[];
  // Temporary turn / until-next-turn rule modifiers
  tempAllBlockersUntilNextTurn?: boolean;
  tempRaceBlockersUntilNextTurn?: string[];
  tempProtectedFromAttackCivs?: Civilization[];
  tempIgnoreAttackPrevention?: boolean;
  tempAllUnblockableThisTurn?: boolean;
  tempUnblockableRacesThisTurn?: string[];
  tempAttackUntappedAllThisTurn?: boolean;
  tempAttackUntappedRacesThisTurn?: string[];
  tempUnblockableVsCreaturesRacesThisTurn?: string[];
  tempAttackableUntappedIds?: string[];
  tempSlayerOnBlockedThisTurn?: boolean;
  tempNatureShieldBreakOnBlockedThisTurn?: boolean;
  tempManaOnDestroyThisTurn?: boolean;
  tempRaceBounceOnDestroyThisTurn?: string[];
  tempSlayerRacesThisTurn?: string[];
  tempAttacksIfAbleRacesThisTurn?: string[];
  tempUnblockableMaxPowerByRace?: Array<{ race: string; maxPower: number }>;
  tempUntapAllAtEndTurn?: boolean;
  tempEndTurnUntapRaces?: string[];
  tempDrawPerShieldBrokenOnAttack?: number;
  tempOppDestroyTriggerPenalties?: number;
  tempForceAllAttacksUntilNextTurn?: boolean;
  tempUntapLightAtEndTurn?: boolean;
}

export type CombatStage =
  | 'DECLARE'
  | 'ATTACK'
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

export type ZoneKind = 'battleZone' | 'hand' | 'manaZone' | 'shields' | 'graveyard' | 'deck';

export interface ZoneCardOption {
  instanceId: string;
  zone: ZoneKind;
  owner: PlayerId;
  card: CardDefinition;
  isTapped?: boolean;
  isHidden?: boolean;
  label?: string;
}

export interface OptionalChoiceInteraction {
  type: 'OPTIONAL_CHOICE';
  player: PlayerId;
  sourceCardId: string;
  sourceInstanceId?: string;
  abilityName: string;
  prompt: string;
  effectType:
    | 'DRAW'
    | 'TAP_OPPONENT_CREATURE'
    | 'SALVAGE_GRAVEYARD'
    | 'SEARCH_DECK'
    | 'UNTAP_CREATURE'
    | 'SAVER_REPLACEMENT'
    | 'DESTROY_TO_HAND'
    | 'DESTROY_TO_MANA'
    | 'DESTROY_TO_SHIELD'
    | 'SHIELD_SACRIFICE_REPLACEMENT'
    | 'MANA_RAMP'
    | 'MANA_ADD_SHIELD_DECK'
    | 'UNTAP_ALL_EOT'
    | 'CUSTOM';
  drawCount?: number;
  validTargetIds?: string[];
  /** Optional contextual ids for interactive Saver / replacement / custom follow-ups */
  targetInstanceId?: string;
  saverInstanceId?: string;
  remainingDestroyIds?: string[];
  shieldIndicesToBreak?: number[];
  attackerId?: string;
  followUpAction?: {
    kind: string;
    payload?: Record<string, unknown>;
  };
}

export interface ZoneSelectionInteraction {
  type: 'ZONE_SELECTION';
  player: PlayerId;
  sourceCardId: string;
  sourceCardName: string;
  actionKind: string;
  prompt: string;
  options: ZoneCardOption[];
  raceOptions?: string[];
  minSelections: number;
  maxSelections: number;
  contextData?: Record<string, unknown>;
}

export interface SilentSkillChoiceInteraction {
  type: 'SILENT_SKILL_CHOICE';
  player: PlayerId;
  creatureInstanceId: string;
  card: CardDefinition;
  remainingCreatureIds: string[];
  keptTappedIds: string[];
}

export interface DeckSearchInteraction {
  type: 'DECK_SEARCH';
  player: PlayerId;
  sourceCardName: string;
  filterDescription: string;
  validCardInstanceIds: string[];
  destination: 'hand' | 'manaZone' | 'battleZone';
}

export type PendingInteraction =
  | BlockerChoiceInteraction
  | ShieldTriggerChoiceInteraction
  | TargetSelectionInteraction
  | OptionalChoiceInteraction
  | ZoneSelectionInteraction
  | SilentSkillChoiceInteraction
  | DeckSearchInteraction;

export interface GameState {
  turn: number;
  startingPlayer?: PlayerId;
  activePlayer: PlayerId;
  phase: Phase;
  players: Record<PlayerId, PlayerState>;
  combatState: CombatState | null;
  pendingInteraction: PendingInteraction | null;
  pendingTriggerQueue?: ShieldTriggerChoiceInteraction[];
  pendingInteractionQueue?: PendingInteraction[];
  pendingKeptSilentIds?: string[];
  interactiveHuman?: boolean;
  winner: PlayerId | null;
  actionLog: string[];
}

export type GameAction =
  | { type: 'CHARGE_MANA'; player?: PlayerId; cardInstanceId: string }
  | { type: 'UNDO_CHARGE_MANA'; player?: PlayerId }
  | {
      type: 'SUMMON_CREATURE';
      player?: PlayerId;
      cardInstanceId: string;
      baitInstanceId?: string;
      baitInstanceIds?: string[];
      targets?: string[];
      manaInstanceIds?: string[];
    }
  | {
      type: 'CAST_SPELL';
      player?: PlayerId;
      cardInstanceId: string;
      targets?: string[];
      manaInstanceIds?: string[];
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
      type: 'RESOLVE_OPTIONAL_CHOICE';
      player?: PlayerId;
      accept: boolean;
      selectedTargetId?: string;
    }
  | {
      type: 'ACTIVATE_SILENT_SKILL';
      player?: PlayerId;
      creatureInstanceId: string;
      targets?: string[];
    }
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
  | {
      type: 'RESOLVE_DECK_SEARCH';
      player?: PlayerId;
      selectedCardInstanceId: string | null;
    }
  | {
      type: 'RESOLVE_ZONE_SELECTION';
      player?: PlayerId;
      selectedIds: string[];
      selectedRace?: string;
    }
  | {
      type: 'RESOLVE_SILENT_SKILL_CHOICE';
      player?: PlayerId;
      activate: boolean;
      targets?: string[];
    }
  | {
      type: 'ACTIVATE_TAP_ABILITY';
      player?: PlayerId;
      creatureInstanceId: string;
      targets?: string[];
      selectedRace?: string;
    }
  | {
      type: 'TOGGLE_MANA_TAP';
      player?: PlayerId;
      cardInstanceId: string;
      forceTapped?: boolean;
    }
  | { type: 'END_TURN'; player?: PlayerId }
  | { type: 'START_TURN'; player?: PlayerId };

export type { CardDefinition, Deck };
