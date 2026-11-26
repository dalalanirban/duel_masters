import type { CardDefinition } from '../types/card.ts';
import type {
  AttackTarget,
  CreatureInstance,
  GameState,
  ManaCardInstance,
  PlayerId,
  PlayerState
} from './types.ts';
import {
  getCardCapabilities,
  getCardCivilizations,
  getCreatureRaces,
  getOpponentId,
  hasDragonRace,
  isSurvivorCard,
  normalizeRace
} from './cardUtils.ts';

// ============================================================================
// SURVIVOR SHARED ABILITIES (DM-05 / DM-06)
// ============================================================================

export { isSurvivorCard as isSurvivor };

export interface SurvivorSharedAbilities {
  hasBlocker: boolean;
  hasSlayer: boolean;
  hasSpeedAttacker: boolean;
  isUnblockable: boolean;
  hasUntapAtEndTurn: boolean;
  hasManaZoneOnDestroy: boolean;
  powerBonus: number;
  powerAttackerBonus: number;
  minBreakerCount: number;
  hasAttackDraw: boolean;
  hasAttackDiscard: boolean;
}

const SURVIVOR_CACHE = new WeakMap<CreatureInstance[], SurvivorSharedAbilities>();

/**
 * Single-pass aggregation of all shared Survivor abilities in a friendly battle zone.
 * Cached by battleZone array reference via WeakMap for real-time O(1) repeated lookups.
 */
export function getSurvivorSharedAbilities(
  friendlyBattleZone: CreatureInstance[] = []
): SurvivorSharedAbilities {
  if (friendlyBattleZone.length === 0) {
    return {
      hasBlocker: false,
      hasSlayer: false,
      hasSpeedAttacker: false,
      isUnblockable: false,
      hasUntapAtEndTurn: false,
      hasManaZoneOnDestroy: false,
      powerBonus: 0,
      powerAttackerBonus: 0,
      minBreakerCount: 1,
      hasAttackDraw: false,
      hasAttackDiscard: false
    };
  }

  const cached = SURVIVOR_CACHE.get(friendlyBattleZone);
  if (cached) return cached;

  let hasBlocker = false;
  let hasSlayer = false;
  let hasSpeedAttacker = false;
  let isUnblockable = false;
  let hasUntapAtEndTurn = false;
  let hasManaZoneOnDestroy = false;
  let smashHornCopies = 0;
  let blazosaurCopies = 0;
  let hasDoubleBreaker = false;
  let hasAttackDraw = false;
  let hasAttackDiscard = false;

  for (const c of friendlyBattleZone) {
    if (!isSurvivorCard(c.card)) continue;
    const caps = getCardCapabilities(c.card);
    const rules = c.card.rulesText || '';
    const n = caps.nameLower;

    if (n.includes('gallia zohl') || caps.isBlocker || /\bblocker\b/i.test(rules)) {
      hasBlocker = true;
    }
    if (n.includes('gigaling') || caps.isSlayer || /\bslayer\b/i.test(rules)) {
      hasSlayer = true;
    }
    if (n.includes('rumblesaur') || caps.isSpeedAttacker || /speed attacker/i.test(rules)) {
      hasSpeedAttacker = true;
    }
    if (n.includes('spikestrike ichthys') || /can't be blocked/i.test(rules)) {
      isUnblockable = true;
    }
    if (n.includes('ballus') || /untap this creature/i.test(rules)) {
      hasUntapAtEndTurn = true;
    }
    if (n.includes('balloonshroom') || /put it into your mana zone instead/i.test(rules)) {
      hasManaZoneOnDestroy = true;
    }
    if (
      n.includes('smash horn') ||
      (!/power attacker/i.test(rules) &&
        !/while attacking/i.test(rules) &&
        /gets \+1000 power/i.test(rules) &&
        /survivor/i.test(rules))
    ) {
      smashHornCopies++;
    }
    if (
      n.includes('blazosaur') ||
      (/power attacker \+1000/i.test(rules) && /survivor/i.test(rules))
    ) {
      blazosaurCopies++;
    }
    if (
      n.includes('bladerush skyterror') ||
      (c.card.breakerCount && c.card.breakerCount >= 2) ||
      /double breaker/i.test(rules)
    ) {
      hasDoubleBreaker = true;
    }
    if (
      n.includes('split-head hydroturtle') ||
      (/draw a card/i.test(rules) && /attacks/i.test(rules))
    ) {
      hasAttackDraw = true;
    }
    if (
      n.includes('skullsweeper') ||
      (/discards a card/i.test(rules) && /attacks/i.test(rules))
    ) {
      hasAttackDiscard = true;
    }
  }

  const result: SurvivorSharedAbilities = {
    hasBlocker,
    hasSlayer,
    hasSpeedAttacker,
    isUnblockable,
    hasUntapAtEndTurn,
    hasManaZoneOnDestroy,
    powerBonus: smashHornCopies * 1000,
    powerAttackerBonus: blazosaurCopies * 1000,
    minBreakerCount: hasDoubleBreaker ? 2 : 1,
    hasAttackDraw,
    hasAttackDiscard
  };

  SURVIVOR_CACHE.set(friendlyBattleZone, result);
  return result;
}

// ============================================================================
// WAVE STRIKER & TURBO RUSH QUERIES
// ============================================================================

export function isWaveStriker(
  card?: CardDefinition | { isWaveStriker?: boolean; rulesText?: string } | null
): boolean {
  if (!card) return false;
  if ((card as { isWaveStriker?: boolean }).isWaveStriker) return true;
  return /wave striker/i.test(card.rulesText || '');
}

export function isWaveStrikerConditionMet(allBattleZones: CreatureInstance[][]): boolean {
  let count = 0;
  for (const bz of allBattleZones) {
    if (!bz) continue;
    for (const c of bz) {
      if (isWaveStriker(c.card)) {
        count++;
        if (count >= 3) return true;
      }
    }
  }
  return false;
}

export function isTurboRushCard(card?: CardDefinition | null): boolean {
  if (!card) return false;
  return getCardCapabilities(card).isTurboRush;
}

export function isTurboRushActive(
  state: GameState | undefined,
  player: PlayerId,
  creature: CreatureInstance
): boolean {
  if (!state || !isTurboRushCard(creature.card)) return false;
  const brokenList = state.players?.[player]?.shieldsBrokenThisTurn || [];
  return brokenList.some((id) => id !== creature.instanceId);
}

export function hasWaveStrikerBlocker(
  creature: CreatureInstance,
  friendlyZone: CreatureInstance[] = [],
  opponentZone: CreatureInstance[] = []
): boolean {
  if (!isWaveStrikerConditionMet([friendlyZone, opponentZone])) return false;
  if (getCardCapabilities(creature.card).nameLower.includes('asra')) return true;
  return friendlyZone.some(
    (c) =>
      c.instanceId !== creature.instanceId &&
      getCardCapabilities(c.card).nameLower.includes('kilstine')
  );
}

export function getWaveStrikerPowerBonus(
  creature: CreatureInstance,
  friendlyZone: CreatureInstance[] = [],
  opponentZone: CreatureInstance[] = []
): number {
  if (!isWaveStrikerConditionMet([friendlyZone, opponentZone])) return 0;

  let bonus = 0;
  const n = getCardCapabilities(creature.card).nameLower;

  if (isWaveStriker(creature.card)) {
    if (
      n.includes('asra') ||
      n.includes('revival soldier') ||
      n.includes('saliva worm') ||
      n.includes('sapian tark') ||
      n.includes('ninja pumpkin')
    ) {
      bonus += 4000;
    }
  }

  for (const ally of friendlyZone) {
    const allyName = getCardCapabilities(ally.card).nameLower;
    if (allyName.includes('merlee')) bonus += 1000;
    if (ally.instanceId !== creature.instanceId && allyName.includes('kilstine')) {
      bonus += 5000;
    }
  }

  return bonus;
}

export function getWaveStrikerPowerAttackerBonus(
  creature: CreatureInstance,
  isAttacking: boolean,
  friendlyZone: CreatureInstance[] = [],
  opponentZone: CreatureInstance[] = []
): number {
  if (!isAttacking || !isWaveStrikerConditionMet([friendlyZone, opponentZone])) return 0;
  return getCardCapabilities(creature.card).nameLower.includes('macho melon') ? 3000 : 0;
}

export function getWaveStrikerBreakerCount(
  creature: CreatureInstance,
  friendlyZone: CreatureInstance[] = [],
  opponentZone: CreatureInstance[] = []
): number {
  if (!isWaveStrikerConditionMet([friendlyZone, opponentZone])) return 1;
  const hasKilstineAura = friendlyZone.some(
    (c) =>
      c.instanceId !== creature.instanceId &&
      getCardCapabilities(c.card).nameLower.includes('kilstine')
  );
  return hasKilstineAura ? 2 : 1;
}

export function hasWaveStrikerUntappedAttack(
  creature: CreatureInstance,
  friendlyZone: CreatureInstance[] = [],
  opponentZone: CreatureInstance[] = []
): boolean {
  if (!isWaveStrikerConditionMet([friendlyZone, opponentZone])) return false;
  return getCardCapabilities(creature.card).nameLower.includes('sapian tark');
}

export function isWaveStrikerUnblockable(
  attacker: CreatureInstance,
  blocker?: CreatureInstance,
  friendlyZone: CreatureInstance[] = [],
  opponentZone: CreatureInstance[] = [],
  attackerState?: PlayerState,
  defenderState?: PlayerState
): boolean {
  if (!isWaveStrikerConditionMet([friendlyZone, opponentZone])) return false;
  if (getCardCapabilities(attacker.card).nameLower.includes('ninja pumpkin')) {
    if (!blocker) return true;
    const blockerPower = getCreatureEffectivePower(
      blocker,
      false,
      defenderState ?? { battleZone: opponentZone } as PlayerState,
      attackerState ?? { battleZone: friendlyZone } as PlayerState
    );
    return blockerPower <= 5000;
  }
  return false;
}

export function getTurboRushPowerBonus(
  state: GameState | undefined,
  player: PlayerId,
  creature: CreatureInstance
): number {
  if (!isTurboRushActive(state, player, creature)) return 0;
  return getCardCapabilities(creature.card).nameLower.includes('senia') ? 5000 : 0;
}

export function getTurboRushPowerAttackerBonus(
  state: GameState | undefined,
  player: PlayerId,
  creature: CreatureInstance,
  isAttacking: boolean
): number {
  if (!isAttacking || !isTurboRushActive(state, player, creature)) return 0;
  return getCardCapabilities(creature.card).nameLower.includes('ultimo') ? 4000 : 0;
}

export function getTurboRushBreakerCount(
  state: GameState | undefined,
  player: PlayerId,
  creature: CreatureInstance
): number {
  if (!isTurboRushActive(state, player, creature)) return 1;
  return getCardCapabilities(creature.card).nameLower.includes('senia') ? 2 : 1;
}

export function isTurboRushSpeedAttacker(
  state: GameState | undefined,
  player: PlayerId,
  _creature?: CreatureInstance
): boolean {
  const bz = state?.players?.[player]?.battleZone || [];
  return bz.some(
    (c) =>
      getCardCapabilities(c.card).nameLower.includes('jagalzor') &&
      isTurboRushActive(state, player, c)
  );
}

export function hasTurboRushUntappedAttack(
  state: GameState | undefined,
  player: PlayerId,
  creature: CreatureInstance
): boolean {
  if (!isTurboRushActive(state, player, creature)) return false;
  return getCardCapabilities(creature.card).nameLower.includes('ultimo');
}

export function isTurboRushUnblockable(
  state: GameState | undefined,
  player: PlayerId,
  creature: CreatureInstance
): boolean {
  if (!isTurboRushActive(state, player, creature)) return false;
  return getCardCapabilities(creature.card).nameLower.includes('illusion fish');
}

// ============================================================================
// KEYWORD & POWER RESOLUTION (SINGLE SOURCE OF TRUTH)
// ============================================================================

function creatureHasAnyNormalizedRace(creature: CreatureInstance, normalizedTargets: string[]): boolean {
  const races = getCreatureRaces(creature).map(normalizeRace);
  return races.some((r) => normalizedTargets.includes(r));
}

/**
 * Checks whether a creature has Blocker, accounting for Survivors, Wave Strikers (across BOTH boards),
 * Siri ("while you have no shields"), and temporary spell/turn grants (Full Defensor, Unified Resistance).
 */
export function hasCreatureBlocker(
  creature: CreatureInstance,
  friendlyBattleZone: CreatureInstance[] = [],
  opponentBattleZone: CreatureInstance[] = [],
  playerState?: PlayerState
): boolean {
  const caps = getCardCapabilities(creature.card);
  if (caps.isBlocker) return true;

  if (caps.isSurvivor && getSurvivorSharedAbilities(friendlyBattleZone).hasBlocker) {
    return true;
  }

  if (hasWaveStrikerBlocker(creature, friendlyBattleZone, opponentBattleZone)) {
    return true;
  }

  // Siri / Bex: "While you have no shields, this creature has blocker"
  if (
    (caps.nameLower.includes('siri') || caps.nameLower.includes('bex')) &&
    playerState &&
    playerState.shields.filter((s) => !s.isBroken).length === 0
  ) {
    return true;
  }

  // Full Defensor / Unified Resistance
  if (playerState?.tempAllBlockersUntilNextTurn) {
    return true;
  }
  if (
    playerState?.tempRaceBlockersUntilNextTurn &&
    playerState.tempRaceBlockersUntilNextTurn.length > 0
  ) {
    if (creatureHasAnyNormalizedRace(creature, playerState.tempRaceBlockersUntilNextTurn)) {
      return true;
    }
  }

  return false;
}

/**
 * Checks whether a creature has Slayer: base Slayer, Survivor (Gigaling Q), Frost Specter (Ghosts),
 * Megaria, or temporary grants (Venom Charger, Lupa, Venom Worm, Creeping Plague).
 */
export function hasCreatureSlayer(
  creature: CreatureInstance,
  friendlyBattleZone: CreatureInstance[] = [],
  opponentBattleZone: CreatureInstance[] = [],
  playerState?: PlayerState
): boolean {
  const caps = getCardCapabilities(creature.card);
  if (caps.isSlayer || creature.tempSlayer) return true;

  if (caps.isSurvivor && getSurvivorSharedAbilities(friendlyBattleZone).hasSlayer) {
    return true;
  }

  // Frost Specter, Shadow of Age: Each of your Ghosts in the battle zone has "slayer."
  if (
    creatureHasAnyNormalizedRace(creature, ['ghost']) &&
    friendlyBattleZone.some((c) => getCardCapabilities(c.card).nameLower.includes('frost specter'))
  ) {
    return true;
  }

  // Megaria, Empress of Dread: Each creature in the battle zone has "slayer."
  if (
    friendlyBattleZone.some((c) => getCardCapabilities(c.card).nameLower.includes('megaria')) ||
    opponentBattleZone.some((c) => getCardCapabilities(c.card).nameLower.includes('megaria'))
  ) {
    return true;
  }

  if (playerState?.tempSlayerRacesThisTurn && playerState.tempSlayerRacesThisTurn.length > 0) {
    if (creatureHasAnyNormalizedRace(creature, playerState.tempSlayerRacesThisTurn)) {
      return true;
    }
  }

  return false;
}

/**
 * Checks whether a creature has Speed Attacker:
 * base card, temporary grant, Survivor (Rumblesaur Q), Burnwisp Lizard (Silent Skill),
 * Totto Pipicchi (Dragons), or Magmadragon Jagalzor (ONLY when Turbo Rush is active!).
 */
export function hasCreatureSpeedAttacker(
  creature: CreatureInstance,
  friendlyBattleZone: CreatureInstance[] = [],
  state?: GameState,
  playerId?: PlayerId
): boolean {
  const caps = getCardCapabilities(creature.card);
  if (caps.isSpeedAttacker || creature.tempSpeedAttacker) return true;

  if (caps.isSurvivor && getSurvivorSharedAbilities(friendlyBattleZone).hasSpeedAttacker) {
    return true;
  }

  // Burnwisp Lizard: Silent Skill creatures get Speed Attacker
  if (
    caps.hasSilentSkill &&
    friendlyBattleZone.some((c) => getCardCapabilities(c.card).nameLower.includes('burnwisp lizard'))
  ) {
    return true;
  }

  // Totto Pipicchi: Your Dragons have Speed Attacker
  if (
    hasDragonRace(getCreatureRaces(creature)) &&
    friendlyBattleZone.some((c) => getCardCapabilities(c.card).nameLower.includes('totto pipicchi'))
  ) {
    return true;
  }

  // Magmadragon Jagalzor Turbo Rush (ONLY when another friendly creature broke shields this turn!)
  const owner = playerId ?? creature.owner;
  if (state && isTurboRushSpeedAttacker(state, owner, creature)) {
    return true;
  }

  return false;
}

/**
 * Checks whether a creature has solo-battle-zone condition satisfied:
 * - Galsaur / Astronaut Skyterror: "While you have no other creatures in the battle zone"
 * - Armored Scout Gestuchar: "While you have no other fire creatures in the battle zone"
 */
function isSoloConditionMet(creature: CreatureInstance, friendlyBZ: CreatureInstance[]): boolean {
  const n = getCardCapabilities(creature.card).nameLower;
  if (n.includes('gestuchar')) {
    return !friendlyBZ.some(
      (c) =>
        c.instanceId !== creature.instanceId &&
        getCardCivilizations(c.card).includes('Fire')
    );
  }
  if (n.includes('galsaur') || n.includes('astronaut skyterror')) {
    return !friendlyBZ.some((c) => c.instanceId !== creature.instanceId);
  }
  return true;
}

/**
 * Calculates total effective Breaker count:
 * - Base breakerCount (Double=2, Triple=3)
 * - Temporary grants (tempDoubleBreaker, tempTripleBreaker, Magma Gazer, Snake Attack, Furious Onslaught, etc.)
 * - Phantomach (Chimeras & Armorloids get Double Breaker)
 * - Survivor (Bladerush Skyterror Q grants >= 2)
 * - Wave Striker (Kilstine grants >= 2)
 * - Turbo Rush (Senia gets >= 2)
 * - Solo Double Breaker (Galsaur, Gestuchar, Astronaut Skyterror when solo condition met)
 * - Chaotic Skyterror (Demon Commands get Double Breaker)
 * - Crew Breaker: Q-tronic Gargantua (+1 per other Survivor) & Ultimate Dragon (+1 per other Dragon)
 */
export function getCreatureBreakerCount(
  creature: CreatureInstance,
  friendlyBattleZone: CreatureInstance[] = [],
  opponentBattleZone: CreatureInstance[] = [],
  state?: GameState,
  playerId?: PlayerId
): number {
  let count = Math.max(1, creature.card.breakerCount || 1);
  const caps = getCardCapabilities(creature.card);
  const owner = playerId ?? creature.owner;

  if (creature.tempDoubleBreaker) count = Math.max(count, 2);
  if (creature.tempTripleBreaker) count = Math.max(count, 3);

  // Solo Double Breaker (note: database stores breakerCount = 1 for Galsaur/Gestuchar/Astronaut)
  if (
    (caps.nameLower.includes('galsaur') ||
      caps.nameLower.includes('gestuchar') ||
      caps.nameLower.includes('astronaut skyterror')) &&
    isSoloConditionMet(creature, friendlyBattleZone)
  ) {
    count = Math.max(count, 2);
  }

  if (caps.isSurvivor && friendlyBattleZone.length > 0) {
    const abilities = getSurvivorSharedAbilities(friendlyBattleZone);
    count = Math.max(count, abilities.minBreakerCount);
  }

  count = Math.max(count, getWaveStrikerBreakerCount(creature, friendlyBattleZone, opponentBattleZone));

  if (state) {
    count = Math.max(count, getTurboRushBreakerCount(state, owner, creature));
  }

  // Phantomach, the Gigatrooper: Each of your Chimeras and Armorloids in the battle zone has "double breaker."
  if (
    creatureHasAnyNormalizedRace(creature, ['chimera', 'armorloid']) &&
    friendlyBattleZone.some((c) => getCardCapabilities(c.card).nameLower.includes('phantomach'))
  ) {
    count = Math.max(count, 2);
  }

  // Chaotic Skyterror: Each Demon Command in the battle zone (both sides) has double breaker
  if (
    creatureHasAnyNormalizedRace(creature, ['demoncommand']) &&
    (friendlyBattleZone.some((c) => getCardCapabilities(c.card).nameLower.includes('chaotic skyterror')) ||
      opponentBattleZone.some((c) => getCardCapabilities(c.card).nameLower.includes('chaotic skyterror')))
  ) {
    count = Math.max(count, 2);
  }

  // Crew Breaker: Q-tronic Gargantua
  if (caps.nameLower.includes('q-tronic gargantua') && friendlyBattleZone.length > 0) {
    const otherSurvivors = friendlyBattleZone.filter(
      (c) => c.instanceId !== creature.instanceId && isSurvivorCard(c.card)
    ).length;
    count += otherSurvivors;
  }

  // Crew Breaker: Ultimate Dragon ("other Dragons", excluding Dragonoids!)
  if (caps.nameLower.includes('ultimate dragon') && friendlyBattleZone.length > 0) {
    const otherDragons = friendlyBattleZone.filter(
      (c) => c.instanceId !== creature.instanceId && hasDragonRace(getCreatureRaces(c))
    ).length;
    count += otherDragons;
  }

  return count;
}

/**
 * Calculates continuous power & power-attacker auras.
 */
export function calculateContinuousAuraPower(
  creature: CreatureInstance,
  isAttacking: boolean,
  friendlyBattleZone: CreatureInstance[] = [],
  opponentBattleZone: CreatureInstance[] = [],
  playerState?: PlayerState,
  opponentState?: PlayerState,
  isOpponentsTurn?: boolean,
  state?: GameState
): { powerBonus: number; powerAttackerBonus: number } {
  let powerBonus = 0;
  let powerAttackerBonus = 0;

  const caps = getCardCapabilities(creature.card);
  const nameLower = caps.nameLower;
  const civs = caps.civilizations;
  const races = getCreatureRaces(creature);
  const normRaces = races.map(normalizeRace);

  const fZone = friendlyBattleZone.length > 0 ? friendlyBattleZone : playerState?.battleZone || [];
  const oZone = opponentBattleZone.length > 0 ? opponentBattleZone : opponentState?.battleZone || [];

  // 1. Survivor power & power-attacker bonuses (Smash Horn Q & Blazosaur Q)
  if (caps.isSurvivor && fZone.length > 0) {
    const survivorAbilities = getSurvivorSharedAbilities(fZone);
    powerBonus += survivorAbilities.powerBonus;
    if (isAttacking) {
      const ownPABonus = creature.card.powerAttackerBonus || 0;
      powerAttackerBonus += Math.max(0, survivorAbilities.powerAttackerBonus - ownPABonus);
    }
  }

  // 2. Barkwhip, the Smasher: If tapped, each other friendly Beast Folk gets +2000
  const isBeastFolk = normRaces.includes('beastfolk');
  if (isBeastFolk) {
    for (const c of fZone) {
      if (
        c.instanceId !== creature.instanceId &&
        c.isTapped &&
        getCardCapabilities(c.card).nameLower.includes('barkwhip')
      ) {
        powerBonus += 2000;
      }
    }
  }

  // 3. Armored Blaster Valdios: Each other friendly Human gets +1000
  if (normRaces.includes('human')) {
    for (const c of fZone) {
      if (
        c.instanceId !== creature.instanceId &&
        getCardCapabilities(c.card).nameLower.includes('valdios')
      ) {
        powerBonus += 1000;
      }
    }
  }

  // 4. Überdragon Jabaha: If attacking, each other friendly Fire creature gets +2000 PA
  if (isAttacking && civs.includes('Fire')) {
    for (const c of fZone) {
      if (
        c.instanceId !== creature.instanceId &&
        (getCardCapabilities(c.card).nameLower.includes('überdragon jabaha') ||
          getCardCapabilities(c.card).nameLower.includes('uberdragon jabaha'))
      ) {
        powerAttackerBonus += 2000;
      }
    }
  }

  // 5. Global Both-Sides Auras: Re Bil (Light +2000), Shadow Moon (Darkness +2000), Pippie Kuppie (Armored Dragon +1000), Chaotic Skyterror (Demon Command +4000 PA)
  const isLight = civs.includes('Light');
  const isDarkness = civs.includes('Darkness');
  const isArmoredDragon = normRaces.includes('armoreddragon');
  const isDemonCommand = normRaces.includes('demoncommand');

  for (const zone of [fZone, oZone]) {
    for (const c of zone) {
      const cName = getCardCapabilities(c.card).nameLower;
      if (isLight && c.instanceId !== creature.instanceId && cName.includes('re bil')) {
        powerBonus += 2000;
      }
      if (isDarkness && c.instanceId !== creature.instanceId && cName.includes('shadow moon')) {
        powerBonus += 2000;
      }
      if (isArmoredDragon && cName.includes('pippie kuppie')) {
        powerBonus += 1000;
      }
      if (isAttacking && isDemonCommand && cName.includes('chaotic skyterror')) {
        powerAttackerBonus += 4000;
      }
    }
  }

  // 6. Self conditional auras (Blasto, Exploding Cactus, Angler Cluster, Cannon Shell, Masked Pomegranate)
  if (
    nameLower.includes('blasto') ||
    /while you have a darkness creature in the battle zone, this creature gets \+2000 power/i.test(
      creature.card.rulesText || ''
    )
  ) {
    if (
      fZone.some(
        (c) =>
          c.instanceId !== creature.instanceId &&
          getCardCivilizations(c.card).includes('Darkness')
      )
    ) {
      powerBonus += 2000;
    }
  }

  if (
    nameLower.includes('exploding cactus') ||
    /while you have a light creature in the battle zone, this creature gets \+2000 power/i.test(
      creature.card.rulesText || ''
    )
  ) {
    if (
      fZone.some(
        (c) =>
          c.instanceId !== creature.instanceId &&
          getCardCivilizations(c.card).includes('Light')
      )
    ) {
      powerBonus += 2000;
    }
  }

  if (nameLower.includes('angler cluster') && playerState && playerState.manaZone.length > 0) {
    if (playerState.manaZone.every((m) => getCardCivilizations(m.card).includes('Water'))) {
      powerBonus += 3000;
    }
  }

  if (nameLower.includes('cannon shell') && playerState) {
    powerBonus += playerState.shields.filter((s) => !s.isBroken).length * 1000;
  }

  if (nameLower.includes('masked pomegranate')) {
    const otherNature = fZone.filter(
      (c) => c.instanceId !== creature.instanceId && getCardCivilizations(c.card).includes('Nature')
    ).length;
    powerBonus += otherNature * 1000;
  }

  // 7. Pala Olesis, Morning Guardian: During opponent's turn, each other friendly creature gets +2000
  if (isOpponentsTurn) {
    for (const c of fZone) {
      if (
        c.instanceId !== creature.instanceId &&
        getCardCapabilities(c.card).nameLower.includes('pala olesis')
      ) {
        powerBonus += 2000;
      }
    }
  }

  // 8. Legacy Shell: If attacking, each friendly Light and Fire creature gets +3000 PA
  if (isAttacking && (isLight || civs.includes('Fire'))) {
    for (const c of fZone) {
      if (getCardCapabilities(c.card).nameLower.includes('legacy shell')) {
        powerAttackerBonus += 3000;
      }
    }
  }

  // 9. Multi-civ evolution auras (+2000 to respective other race pairs)
  const isGladiatorOrEarthEater = normRaces.some((r) => r === 'gladiator' || r === 'eartheater');
  const isCyberLordOrHedrian = normRaces.some((r) => r === 'cyberlord' || r === 'hedrian');
  const isChimeraOrArmorloid = normRaces.some((r) => r === 'chimera' || r === 'armorloid');
  const isXenoOrInsect = normRaces.some((r) => r === 'xenoparts' || r === 'giantinsect');
  const isVeggieOrPhantom = normRaces.some((r) => r === 'wildveggie' || r === 'rainbowphantom');

  for (const c of fZone) {
    if (c.instanceId === creature.instanceId) continue;
    const cName = getCardCapabilities(c.card).nameLower;
    if (isGladiatorOrEarthEater && cName.includes('agira')) powerBonus += 2000;
    if (isCyberLordOrHedrian && cName.includes('hydrooze')) powerBonus += 2000;
    if (isChimeraOrArmorloid && cName.includes('phantomach')) powerBonus += 2000;
    if (isXenoOrInsect && cName.includes('nemonex')) powerBonus += 2000;
    if (isVeggieOrPhantom && cName.includes('comet eye')) powerBonus += 2000;
    if (isAttacking && c.isTapped && cName.includes('techno totem')) powerAttackerBonus += 1500;
  }

  // 10. Wave Striker continuous bonuses
  powerBonus += getWaveStrikerPowerBonus(creature, fZone, oZone);
  if (isAttacking) {
    powerAttackerBonus += getWaveStrikerPowerAttackerBonus(creature, true, fZone, oZone);
  }

  // 11. Turbo Rush continuous bonuses
  const evalState = state || (playerState ? ({
    players: {
      player: creature.owner === 'player' ? playerState : opponentState || { shieldsBrokenThisTurn: [] },
      opponent: creature.owner === 'opponent' ? playerState : opponentState || { shieldsBrokenThisTurn: [] }
    }
  } as unknown as GameState) : undefined);

  if (evalState) {
    powerBonus += getTurboRushPowerBonus(evalState, creature.owner, creature);
    if (isAttacking) {
      powerAttackerBonus += getTurboRushPowerAttackerBonus(evalState, creature.owner, creature, true);
    }
  }

  return { powerBonus, powerAttackerBonus };
}

/**
 * Computes total effective combat power of a creature (floored at 0).
 */
export function getCreatureEffectivePower(
  creature: CreatureInstance,
  isAttacking: boolean,
  playerState?: PlayerState,
  opponentState?: PlayerState,
  isOpponentsTurn?: boolean,
  state?: GameState
): number {
  const caps = getCardCapabilities(creature.card);
  const nameLower = caps.nameLower;
  const basePower = creature.card.power ?? 0;
  const powerModifier = creature.powerModifier || 0;
  const fZone = playerState?.battleZone || [];
  const oZone = opponentState?.battleZone || [];

  let printedPA = isAttacking ? creature.card.powerAttackerBonus || 0 : 0;

  // Guard scraped DB PA quirks where rulesText grants PA conditionally or to OTHER creatures only:
  if (isAttacking && printedPA > 0) {
    if (nameLower.includes('techno totem') || nameLower.includes('chaotic skyterror') || nameLower.includes("gigio's hammer")) {
      printedPA = 0;
    } else if (
      (nameLower.includes('gestuchar') || nameLower.includes('galsaur') || nameLower.includes('astronaut skyterror')) &&
      !isSoloConditionMet(creature, fZone)
    ) {
      printedPA = 0;
    }
  }

  let extraAttackerBonus = isAttacking ? creature.tempPowerAttackerBonus || 0 : 0;

  // Bolshack Dragon: +1000 while attacking per Fire card in your graveyard
  if (
    isAttacking &&
    playerState &&
    (nameLower.includes('bolshack dragon') || /for each fire card in your graveyard/i.test(creature.card.rulesText || ''))
  ) {
    const fireCount = (playerState.graveyard || []).filter((c) =>
      getCardCivilizations(c.card).includes('Fire')
    ).length;
    extraAttackerBonus += fireCount * 1000;
  }

  const aura = calculateContinuousAuraPower(
    creature,
    isAttacking,
    fZone,
    oZone,
    playerState,
    opponentState,
    isOpponentsTurn,
    state
  );

  const totalPA = isAttacking ? printedPA + extraAttackerBonus + aura.powerAttackerBonus : 0;
  return Math.max(0, basePower + powerModifier + aura.powerBonus + totalPA);
}

// ============================================================================
// STEALTH, UNBLOCKABLE, & ATTACK RESTRICTIONS
// ============================================================================

export function checkStealth(
  attacker: CreatureInstance,
  defenderManaZone: ManaCardInstance[]
): boolean {
  if (!defenderManaZone || defenderManaZone.length === 0) return false;
  const { stealthCivs } = getCardCapabilities(attacker.card);
  if (stealthCivs.length === 0) return false;

  for (const civ of stealthCivs) {
    if (defenderManaZone.some((m) => getCardCivilizations(m.card).includes(civ))) {
      return true;
    }
  }
  return false;
}

/**
 * Checks whether an attacker can attack untapped opponent creatures (either generally or specific target).
 */
export function canCreatureAttackUntapped(
  attacker: CreatureInstance,
  targetCreature?: CreatureInstance,
  friendlyBattleZone: CreatureInstance[] = [],
  opponentBattleZone: CreatureInstance[] = [],
  state?: GameState,
  attackerState?: PlayerState,
  defenderState?: PlayerState
): boolean {
  const caps = getCardCapabilities(attacker.card);

  // Chaos Strike: target creature can be attacked this turn as though tapped
  if (targetCreature && defenderState?.tempAttackableUntappedIds?.includes(targetCreature.instanceId)) {
    return true;
  }

  if (caps.canAttackAllUntapped || attacker.tempCanAttackUntapped || attackerState?.tempAttackUntappedAllThisTurn) {
    return true;
  }

  if (caps.canAttackUntappedCivs.length > 0) {
    if (!targetCreature) return true;
    const tCivs = getCardCivilizations(targetCreature.card);
    if (caps.canAttackUntappedCivs.some((civ) => tCivs.includes(civ))) {
      return true;
    }
  }

  if (
    attackerState?.tempAttackUntappedRacesThisTurn &&
    attackerState.tempAttackUntappedRacesThisTurn.length > 0 &&
    creatureHasAnyNormalizedRace(attacker, attackerState.tempAttackUntappedRacesThisTurn)
  ) {
    return true;
  }

  if (hasWaveStrikerUntappedAttack(attacker, friendlyBattleZone, opponentBattleZone)) {
    return true;
  }

  if (state && hasTurboRushUntappedAttack(state, attacker.owner, attacker)) {
    return true;
  }

  return false;
}

/**
 * Checks whether an attacker is unconditionally unblockable against the target / defender board
 * (ignoring blocker-specific stats).
 */
export function isCreatureUnblockable(
  attacker: CreatureInstance,
  target: AttackTarget,
  defendingManaZone: ManaCardInstance[] = [],
  friendlyBattleZone: CreatureInstance[] = [],
  defendingBattleZone: CreatureInstance[] = [],
  attackerState?: PlayerState,
  _defenderState?: PlayerState,
  state?: GameState
): boolean {
  const caps = getCardCapabilities(attacker.card);

  if (caps.cantBeBlockedAlways || attacker.tempUnblockable || attackerState?.tempAllUnblockableThisTurn) {
    return true;
  }
  if (target.type === 'creature' && caps.cantBeBlockedWhileAttackingCreature) {
    return true;
  }
  if (
    target.type === 'creature' &&
    attackerState?.tempUnblockableVsCreaturesRacesThisTurn &&
    creatureHasAnyNormalizedRace(attacker, attackerState.tempUnblockableVsCreaturesRacesThisTurn)
  ) {
    return true;
  }
  if (
    attackerState?.tempUnblockableRacesThisTurn &&
    creatureHasAnyNormalizedRace(attacker, attackerState.tempUnblockableRacesThisTurn)
  ) {
    return true;
  }
  if (caps.cantBeBlockedMinOtherCreatures !== null) {
    const otherCount = friendlyBattleZone.filter((c) => c.instanceId !== attacker.instanceId).length;
    if (otherCount >= caps.cantBeBlockedMinOtherCreatures) {
      return true;
    }
  }
  if (checkStealth(attacker, defendingManaZone)) {
    return true;
  }

  // Survivor ability: Spikestrike Ichthys Q
  if (caps.isSurvivor && getSurvivorSharedAbilities(friendlyBattleZone).isUnblockable) {
    return true;
  }

  // Hydrooze: "Your Cyber Lords or Hedrians can't be blocked."
  if (
    creatureHasAnyNormalizedRace(attacker, ['cyberlord', 'hedrian']) &&
    friendlyBattleZone.some((c) => getCardCapabilities(c.card).nameLower.includes('hydrooze'))
  ) {
    return true;
  }

  // Turbo Rush: Illusion Fish (requires active Turbo Rush!)
  const evalState = state || (attackerState ? ({ players: { [attacker.owner]: attackerState } } as unknown as GameState) : undefined);
  if (evalState && isTurboRushUnblockable(evalState, attacker.owner, attacker)) {
    return true;
  }

  // Note: Ninja Pumpkin depends on the specific blocker's power (handled in canBeBlockedBy)!
  if (
    caps.nameLower.includes('ninja pumpkin') &&
    defendingBattleZone.length === 0 &&
    isWaveStrikerConditionMet([friendlyBattleZone, defendingBattleZone])
  ) {
    return false;
  }

  return false;
}

/**
 * Per-blocker check: determines whether a specific untapped blocker can legally block `attacker`.
 * Handles power thresholds (Stampeding Longhorn, Tower Shell, Ninja Pumpkin <= 5000, Calgo >= 4000),
 * civilization restrictions (Gulan Rias, Purple Piercer, Ancient Giant), and Storm Wrangler forced blocks.
 */
export function canBeBlockedBy(
  attacker: CreatureInstance,
  blocker: CreatureInstance,
  target: AttackTarget,
  state: GameState
): boolean {
  const attackingId = state.activePlayer;
  const defendingId = getOpponentId(attackingId);
  const attackerState = state.players[attackingId];
  const defenderState = state.players[defendingId];

  if (blocker.isTapped) return false;
  if (!hasCreatureBlocker(blocker, defenderState.battleZone, attackerState.battleZone, defenderState)) {
    return false;
  }

  if (
    isCreatureUnblockable(
      attacker,
      target,
      defenderState.manaZone,
      attackerState.battleZone,
      defenderState.battleZone,
      attackerState,
      defenderState,
      state
    )
  ) {
    return false;
  }

  const attCaps = getCardCapabilities(attacker.card);
  const blockerCivs = getCardCivilizations(blocker.card);
  const blockerPower = getCreatureEffectivePower(
    blocker,
    false,
    defenderState,
    attackerState,
    true,
    state
  );

  // Wave Striker Ninja Pumpkin: unblockable by <= 5000 power
  if (
    isWaveStrikerUnblockable(
      attacker,
      blocker,
      attackerState.battleZone,
      defenderState.battleZone,
      attackerState,
      defenderState
    )
  ) {
    return false;
  }

  // Silvermoon Trailblazer: creatures of chosen race can't be blocked by <= N power
  if (attackerState.tempUnblockableMaxPowerByRace) {
    for (const rule of attackerState.tempUnblockableMaxPowerByRace) {
      if (
        creatureHasAnyNormalizedRace(attacker, [rule.race]) &&
        blockerPower <= rule.maxPower
      ) {
        return false;
      }
    }
  }

  if (attCaps.cantBeBlockedByMaxPower !== null && blockerPower <= attCaps.cantBeBlockedByMaxPower) {
    return false;
  }

  if (attCaps.cantBeBlockedByMinPower !== null && blockerPower >= attCaps.cantBeBlockedByMinPower) {
    return false;
  }

  if (
    attCaps.cantBeBlockedByCivs.length > 0 &&
    blockerCivs.some((c) => attCaps.cantBeBlockedByCivs.includes(c))
  ) {
    return false;
  }

  // Storm Wrangler forced-blocker exclusivity: if an untapped eligible blocker is forced onto this attacker,
  // other blockers cannot intercept.
  const forcedBlockers = defenderState.battleZone.filter(
    (c) =>
      !c.isTapped &&
      c.tempMustBlockTargetId === attacker.instanceId &&
      hasCreatureBlocker(c, defenderState.battleZone, attackerState.battleZone, defenderState)
  );
  if (forcedBlockers.length > 0 && blocker.tempMustBlockTargetId !== attacker.instanceId) {
    return false;
  }

  return true;
}

/**
 * Checks whether `attacker` can legally attack `defender` ("Can't be attacked" & civ/Dragon immunity).
 */
export function canCreatureBeAttackedBy(
  defender: CreatureInstance,
  attacker: CreatureInstance,
  state?: GameState
): { allowed: boolean; reason?: string } {
  const defCaps = getCardCapabilities(defender.card);
  if (defCaps.cantBeAttacked) {
    return { allowed: false, reason: `${defender.card.name} cannot be attacked.` };
  }

  const attCivs = getCardCivilizations(attacker.card);
  if (
    defCaps.cantBeAttackedByCivs.length > 0 &&
    attCivs.some((c) => defCaps.cantBeAttackedByCivs.includes(c))
  ) {
    return {
      allowed: false,
      reason: `${defender.card.name} cannot be attacked by ${attCivs.join('/')} creatures.`
    };
  }

  if (defCaps.cantBeAttackedByDragon && hasDragonRace(getCreatureRaces(attacker))) {
    return {
      allowed: false,
      reason: `${defender.card.name} cannot be attacked by Dragons.`
    };
  }

  // Note state kept optional for callers inspecting static combat traits
  void state;
  return { allowed: true };
}

/**
 * Checks whether a creature has summoning sickness on the current turn.
 */
export function isCreatureSummoningSick(
  creature: CreatureInstance,
  currentTurn: number,
  friendlyBattleZone?: CreatureInstance[],
  state?: GameState,
  playerId?: PlayerId
): boolean {
  const caps = getCardCapabilities(creature.card);
  if (caps.isEvolution) return false;
  if (hasCreatureSpeedAttacker(creature, friendlyBattleZone || [], state, playerId ?? creature.owner)) {
    return false;
  }
  return creature.summonedTurn >= currentTurn;
}

/**
 * Single Source of Truth validating whether `attacker` can legally declare an attack
 * (either in general when `target` is omitted, or against a specific `target`).
 */
export function canCreatureAttack(
  state: GameState,
  attacker: CreatureInstance,
  target?: AttackTarget,
  attackerOwner?: PlayerId
): { valid: boolean; reason?: string } {
  const activeId = attackerOwner ?? state.activePlayer;
  const defendingId = getOpponentId(activeId);
  const activePlayer = state.players[activeId];
  const defendingPlayer = state.players[defendingId];
  const caps = getCardCapabilities(attacker.card);

  if (attacker.isTapped) {
    return { valid: false, reason: 'Creature is already tapped.' };
  }

  const ignorePreventionForPlayers =
    Boolean(activePlayer.tempIgnoreAttackPrevention) &&
    (!target || target.type === 'shield' || target.type === 'player');

  const hasSickness = isCreatureSummoningSick(
    attacker,
    state.turn,
    activePlayer.battleZone,
    state,
    activeId
  );

  if (!ignorePreventionForPlayers && hasSickness) {
    return { valid: false, reason: 'Creature has summoning sickness.' };
  }

  // Nariel, the Oracle (either side): creatures with power 3000 or more can't attack
  const allBZ = [...activePlayer.battleZone, ...defendingPlayer.battleZone];
  const hasNariel = allBZ.some((c) => getCardCapabilities(c.card).nameLower.includes('nariel'));
  if (hasNariel && !ignorePreventionForPlayers) {
    const curPower = getCreatureEffectivePower(attacker, false, activePlayer, defendingPlayer, false, state);
    if (curPower >= 3000) {
      return {
        valid: false,
        reason: `${attacker.card.name} has power >= 3000 and cannot attack while Nariel is in the battle zone.`
      };
    }
  }

  // Miraculous Truce: creatures of chosen civilization cannot attack defending player until start of their next turn
  if (
    defendingPlayer.tempProtectedFromAttackCivs &&
    defendingPlayer.tempProtectedFromAttackCivs.length > 0 &&
    (!target || target.type === 'shield' || target.type === 'player') &&
    !ignorePreventionForPlayers
  ) {
    const attCivs = getCardCivilizations(attacker.card);
    if (attCivs.some((c) => defendingPlayer.tempProtectedFromAttackCivs!.includes(c))) {
      return {
        valid: false,
        reason: `${attacker.card.name} is prevented from attacking ${defendingId} this turn.`
      };
    }
  }

  if (!ignorePreventionForPlayers) {
    if (caps.cantAttack || attacker.tempCantAttack) {
      return { valid: false, reason: `${attacker.card.name} cannot attack.` };
    }
    if (caps.cantAttackWhenNoOppShields && defendingPlayer.shields.filter((s) => !s.isBroken).length === 0) {
      return { valid: false, reason: `${attacker.card.name} cannot attack while opponent has no shields.` };
    }
    if (caps.cantAttackWhenOppHasMoreCreatures && defendingPlayer.battleZone.length > activePlayer.battleZone.length) {
      return { valid: false, reason: `${attacker.card.name} cannot attack while opponent has more creatures.` };
    }
    if (
      caps.cantAttackWhenOtherUntapped &&
      activePlayer.battleZone.some((c) => c.instanceId !== attacker.instanceId && !c.isTapped)
    ) {
      return { valid: false, reason: `${attacker.card.name} cannot attack while you have other untapped creatures.` };
    }
    if (caps.cantAttackWithEmptyHand && activePlayer.hand.length === 0) {
      return { valid: false, reason: `${attacker.card.name} cannot attack with an empty hand.` };
    }
  }

  const cantAttackPlayers = (caps.cantAttackPlayers || Boolean(attacker.tempCantAttackPlayers)) && !ignorePreventionForPlayers;
  const cantAttackCreatures = caps.cantAttackCreatures;

  // Validate against specific target if given
  if (target) {
    if (target.type === 'creature') {
      // Diamond Cutter does not bypass summoning sickness or "can't attack" restrictions to hit creatures
      if (hasSickness || caps.cantAttack || attacker.tempCantAttack || cantAttackCreatures) {
        return { valid: false, reason: `${attacker.card.name} cannot attack creatures.` };
      }
      const targetCreature = defendingPlayer.battleZone.find((c) => c.instanceId === target.instanceId);
      if (!targetCreature) {
        return { valid: false, reason: `Target creature ${target.instanceId} not found in opponent's battle zone.` };
      }
      if (
        caps.onlyAttackBlockers &&
        !hasCreatureBlocker(targetCreature, defendingPlayer.battleZone, activePlayer.battleZone, defendingPlayer)
      ) {
        return { valid: false, reason: `${attacker.card.name} can only attack creatures that have "blocker".` };
      }
      const targetable = canCreatureBeAttackedBy(targetCreature, attacker, state);
      if (!targetable.allowed) {
        return { valid: false, reason: targetable.reason };
      }
      if (
        !targetCreature.isTapped &&
        !canCreatureAttackUntapped(
          attacker,
          targetCreature,
          activePlayer.battleZone,
          defendingPlayer.battleZone,
          state,
          activePlayer,
          defendingPlayer
        )
      ) {
        return { valid: false, reason: 'Cannot attack an untapped creature.' };
      }
      return { valid: true };
    }

    if (cantAttackPlayers) {
      return { valid: false, reason: `${attacker.card.name} cannot attack players.` };
    }
    if (caps.onlyAttackBlockers) {
      return { valid: false, reason: `${attacker.card.name} can only attack creatures that have "blocker".` };
    }

    if (target.type === 'shield') {
      const unbrokenShields = defendingPlayer.shields.filter((s) => !s.isBroken);
      if (unbrokenShields.length === 0) {
        return { valid: false, reason: 'Opponent has no shields to attack.' };
      }
      const indices: number[] =
        target.indices && target.indices.length > 0
          ? target.indices
          : target.index !== undefined
          ? [target.index]
          : [];
      if (indices.length === 0) {
        return { valid: false, reason: 'No shield target index provided.' };
      }
      if (new Set(indices).size !== indices.length) {
        return { valid: false, reason: 'Duplicate shield indices in attack target.' };
      }
      for (const idx of indices) {
        if (idx < 0 || idx >= defendingPlayer.shields.length || defendingPlayer.shields[idx].isBroken) {
          return { valid: false, reason: `Invalid shield target at index ${idx}.` };
        }
      }
      return { valid: true };
    }

    if (target.type === 'player') {
      const unbrokenCount = defendingPlayer.shields.filter((s) => !s.isBroken).length;
      if (unbrokenCount > 0) {
        return { valid: false, reason: 'Cannot directly attack opponent while they have shields.' };
      }
      return { valid: true };
    }

    return { valid: false, reason: 'Unknown attack target type.' };
  }

  // General eligibility (no specific target given): check at least ONE legal target exists!
  const canHitShieldOrPlayer = !cantAttackPlayers && !caps.onlyAttackBlockers;
  if (canHitShieldOrPlayer) {
    return { valid: true };
  }

  if (cantAttackCreatures) {
    return { valid: false, reason: `${attacker.card.name} has no legal attack targets.` };
  }

  const hasValidCreatureTarget = defendingPlayer.battleZone.some((def) => {
    if (
      caps.onlyAttackBlockers &&
      !hasCreatureBlocker(def, defendingPlayer.battleZone, activePlayer.battleZone, defendingPlayer)
    ) {
      return false;
    }
    if (!canCreatureBeAttackedBy(def, attacker, state).allowed) return false;
    return (
      def.isTapped ||
      canCreatureAttackUntapped(
        attacker,
        def,
        activePlayer.battleZone,
        defendingPlayer.battleZone,
        state,
        activePlayer,
        defendingPlayer
      )
    );
  });

  if (!hasValidCreatureTarget) {
    return { valid: false, reason: `${attacker.card.name} cannot attack players and has no valid creature targets.` };
  }

  return { valid: true };
}
