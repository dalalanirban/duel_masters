/**
 * Backward-compatible facade for engine card effects, continuous auras, triggers, and zone operations.
 * All concrete implementations live in the single-responsibility acyclic modules:
 * - `./continuous.ts` (auras, Survivor, Wave Striker, Turbo Rush checks, combat traits)
 * - `./zones.ts` (`./zoneOps.ts` & `./boardRemoval.ts`)
 * - `./triggers.ts` (CIP, Attack, Blocked, Unblocked, End-of-Turn triggers)
 */

export type { SurvivorSharedAbilities } from './continuous.ts';
export {
  isSurvivor,
  getSurvivorSharedAbilities,
  isWaveStriker,
  isWaveStrikerConditionMet,
  getWaveStrikerPowerBonus,
  getWaveStrikerPowerAttackerBonus,
  hasWaveStrikerBlocker,
  getWaveStrikerBreakerCount,
  isTurboRushCard,
  isTurboRushActive,
  getTurboRushPowerBonus,
  getTurboRushPowerAttackerBonus,
  hasCreatureBlocker,
  hasCreatureSlayer,
  hasCreatureSpeedAttacker,
  getCreatureBreakerCount,
  calculateContinuousAuraPower,
  getCreatureEffectivePower,
  checkStealth,
  canCreatureAttackUntapped,
  isCreatureUnblockable,
  canBeBlockedBy,
  canCreatureBeAttackedBy,
  isCreatureSummoningSick,
  canCreatureAttack
} from './continuous.ts';

export type { BreakShieldOptions } from './zones.ts';
export {
  findCreature,
  drawCards,
  discardHandCardsByIndices,
  discardRandomHandCards,
  rampTopDeckToManaZone,
  addShieldFromDeck,
  destroyOpponentShields,
  breakOpponentShields,
  searchDeckForCard,
  salvageFromGraveyard,
  triggerLeavesBattleZone,
  triggerDestroyed,
  destroyCreature,
  destroyCreaturesBatch,
  bounceCreature,
  sendCreatureToManaZone,
  sendCreatureToTopOfDeck,
  sendCreatureToShields
} from './zones.ts';

export {
  triggerCIP,
  triggerAttack,
  triggerBlocked,
  triggerUnblocked,
  triggerEndTurn
} from './triggers.ts';

export {
  resolveWaveStrikerCIP,
  resolveTurboRushOnAttack,
  resolveTurboRushOnBlocked,
  resolveTurboRushOnUnblocked,
  hasSilentSkill,
  canActivateSilentSkill,
  resolveSilentSkill,
  autoResolveAiSilentSkillsDetailed,
  autoResolveAiSilentSkills
} from './advancedMechanics.ts';
