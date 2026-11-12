import type {
  GameState,
  PlayerId,
  CreatureInstance,
  CardInstance,
  ManaCardInstance,
  ShieldInstance
} from './types.ts';
import type { CardDefinition } from '../types/card.ts';
import {
  destroyCreature,
  bounceCreature,
  drawCards,
  salvageFromGraveyard,
  searchDeckForCard,
  rampTopDeckToManaZone
} from './effects.ts';

// ============================================================================
// 1. WAVE STRIKER ENGINE (DM-10 / DM-11 / DM-12)
// Condition: 3 or more creatures with Wave Striker on the entire battlefield
// ============================================================================

/**
 * Checks whether a card definition represents a Wave Striker creature.
 */
export function isWaveStriker(
  card?: CardDefinition | { isWaveStriker?: boolean; rulesText?: string } | null
): boolean {
  if (!card) return false;
  if ((card as any).isWaveStriker) return true;
  const rules = card.rulesText || '';
  return /wave striker/i.test(rules);
}

/**
 * Checks whether the Wave Striker condition is met across the battlefield (3+ wave strikers total).
 */
export function isWaveStrikerConditionMet(allBattleZones: CreatureInstance[][]): boolean {
  const allCreatures = allBattleZones.flat();
  const totalWaveStrikers = allCreatures.filter((c) => isWaveStriker(c.card)).length;
  return totalWaveStrikers >= 3;
}

/**
 * Calculates static power bonus granted by Wave Striker:
 * - Asra, Vizier of Safety: +4000
 * - Revival Soldier: +4000
 * - Saliva Worm: +4000
 * - Sapian Tark, Flame Dervish: +4000
 * - Ninja Pumpkin: +4000
 * - Merlee, the Oracle: +1000 to each friendly creature
 * - Kilstine, Nebula Elemental: +5000 to each other friendly creature
 */
export function getWaveStrikerPowerBonus(
  creature: CreatureInstance,
  friendlyZone: CreatureInstance[] = [],
  opponentZone: CreatureInstance[] = []
): number {
  if (!isWaveStrikerConditionMet([friendlyZone, opponentZone])) {
    return 0;
  }

  let bonus = 0;
  const nameLower = creature.card.name.toLowerCase();

  // Self bonuses
  if (isWaveStriker(creature.card)) {
    if (
      nameLower.includes('asra') ||
      nameLower.includes('revival soldier') ||
      nameLower.includes('saliva worm') ||
      nameLower.includes('sapian tark') ||
      nameLower.includes('ninja pumpkin')
    ) {
      bonus += 4000;
    }
  }

  // Friendly Merlee aura (+1000 to each friendly creature)
  const merleeCount = friendlyZone.filter((c) =>
    c.card.name.toLowerCase().includes('merlee')
  ).length;
  bonus += merleeCount * 1000;

  // Friendly Kilstine aura (+5000 to each other friendly creature)
  const kilstineAuras = friendlyZone.filter(
    (c) =>
      c.instanceId !== creature.instanceId &&
      c.card.name.toLowerCase().includes('kilstine')
  ).length;
  bonus += kilstineAuras * 5000;

  return bonus;
}

/**
 * Calculates power attacker bonus for Wave Striker creatures (Macho Melon: +3000).
 */
export function getWaveStrikerPowerAttackerBonus(
  creature: CreatureInstance,
  isAttacking: boolean,
  friendlyZone: CreatureInstance[] = [],
  opponentZone: CreatureInstance[] = []
): number {
  if (!isAttacking || !isWaveStrikerConditionMet([friendlyZone, opponentZone])) {
    return 0;
  }

  if (creature.card.name.toLowerCase().includes('macho melon')) {
    return 3000;
  }

  return 0;
}

/**
 * Checks whether Wave Striker grants Blocker:
 * - Asra, Vizier of Safety gets Blocker
 * - Kilstine, Nebula Elemental grants Blocker to all other friendly creatures
 */
export function hasWaveStrikerBlocker(
  creature: CreatureInstance,
  friendlyZone: CreatureInstance[] = [],
  opponentZone: CreatureInstance[] = []
): boolean {
  if (!isWaveStrikerConditionMet([friendlyZone, opponentZone])) {
    return false;
  }

  if (creature.card.name.toLowerCase().includes('asra')) {
    return true;
  }

  const hasKilstineAura = friendlyZone.some(
    (c) =>
      c.instanceId !== creature.instanceId &&
      c.card.name.toLowerCase().includes('kilstine')
  );
  if (hasKilstineAura) {
    return true;
  }

  return false;
}

/**
 * Checks breaker count bonus from Wave Striker (Kilstine grants Double Breaker to other friendly creatures).
 */
export function getWaveStrikerBreakerCount(
  creature: CreatureInstance,
  friendlyZone: CreatureInstance[] = [],
  opponentZone: CreatureInstance[] = []
): number {
  if (!isWaveStrikerConditionMet([friendlyZone, opponentZone])) {
    return 1;
  }

  const hasKilstineAura = friendlyZone.some(
    (c) =>
      c.instanceId !== creature.instanceId &&
      c.card.name.toLowerCase().includes('kilstine')
  );
  if (hasKilstineAura) {
    return 2;
  }

  return 1;
}

/**
 * Checks whether Wave Striker enables attacking untapped creatures (Sapian Tark).
 */
export function hasWaveStrikerUntappedAttack(
  creature: CreatureInstance,
  friendlyZone: CreatureInstance[] = [],
  opponentZone: CreatureInstance[] = []
): boolean {
  if (!isWaveStrikerConditionMet([friendlyZone, opponentZone])) {
    return false;
  }

  return creature.card.name.toLowerCase().includes('sapian tark');
}

/**
 * Checks whether Wave Striker makes the creature unblockable by power <= 5000 (Ninja Pumpkin).
 */
export function isWaveStrikerUnblockable(
  attacker: CreatureInstance,
  blocker?: CreatureInstance,
  friendlyZone: CreatureInstance[] = [],
  opponentZone: CreatureInstance[] = []
): boolean {
  if (!isWaveStrikerConditionMet([friendlyZone, opponentZone])) {
    return false;
  }

  if (attacker.card.name.toLowerCase().includes('ninja pumpkin')) {
    if (!blocker) return true;
    const blockerPower = (blocker.card.power ?? 0) + blocker.powerModifier;
    return blockerPower <= 5000;
  }

  return false;
}

/**
 * Resolves Come-Into-Play (CIP) triggers for Wave Striker creatures when condition is met.
 */
export function resolveWaveStrikerCIP(
  state: GameState,
  player: PlayerId,
  creature: CreatureInstance,
  targets?: string[]
): GameState | null {
  const opponent: PlayerId = player === 'player' ? 'opponent' : 'player';
  const friendlyBZ = state.players[player].battleZone;
  const oppBZ = state.players[opponent].battleZone;

  if (!isWaveStrikerConditionMet([friendlyBZ, oppBZ])) {
    return null;
  }

  const nameLower = creature.card.name.toLowerCase();

  // 1. Aqua Trickster: tap 1 opponent creature
  if (nameLower.includes('aqua trickster')) {
    if (oppBZ.length === 0) return state;
    const targetId = targets?.[0] || oppBZ.find((c) => !c.isTapped)?.instanceId || oppBZ[0].instanceId;
    const updatedOppBZ = oppBZ.map((c) => (c.instanceId === targetId ? { ...c, isTapped: true } : c));
    return {
      ...state,
      players: {
        ...state.players,
        [opponent]: {
          ...state.players[opponent],
          battleZone: updatedOppBZ
        }
      },
      actionLog: [
        ...state.actionLog,
        `Wave Striker: Aqua Trickster tapped an opponent creature.`
      ]
    };
  }

  // 2. Hazaria, Duke of Thorns: opponent chooses one of their creatures and destroys it
  if (nameLower.includes('hazaria')) {
    if (oppBZ.length === 0) return state;
    const targetId = targets?.[0] || oppBZ[0].instanceId;
    const nextState = destroyCreature(state, targetId);
    return {
      ...nextState,
      actionLog: [
        ...nextState.actionLog,
        `Wave Striker: Hazaria forced opponent to destroy a creature.`
      ]
    };
  }

  // 3. Jagila, the Hidden Pillager: opponent discards 3 cards at random from hand
  if (nameLower.includes('jagila')) {
    const oppHand = [...state.players[opponent].hand];
    const discardCount = Math.min(3, oppHand.length);
    const discarded: CardInstance[] = [];
    for (let i = 0; i < discardCount; i++) {
      const idx = Math.floor(Math.random() * oppHand.length);
      discarded.push(oppHand.splice(idx, 1)[0]);
    }
    return {
      ...state,
      players: {
        ...state.players,
        [opponent]: {
          ...state.players[opponent],
          hand: oppHand,
          graveyard: [...state.players[opponent].graveyard, ...discarded]
        }
      },
      actionLog: [
        ...state.actionLog,
        `Wave Striker: Jagila discarded ${discardCount} card(s) from opponent's hand.`
      ]
    };
  }

  // 4. Bonfire Lizard: destroy up to 2 opponent creatures that have Blocker
  if (nameLower.includes('bonfire lizard')) {
    const oppBlockers = oppBZ.filter(
      (c) => c.card.isBlocker || /blocker/i.test(c.card.rulesText || '')
    );
    if (oppBlockers.length === 0) return state;
    const targetIds = targets?.slice(0, 2) || oppBlockers.slice(0, 2).map((c) => c.instanceId);
    let nextState = state;
    for (const tid of targetIds) {
      nextState = destroyCreature(nextState, tid);
    }
    return {
      ...nextState,
      actionLog: [
        ...nextState.actionLog,
        `Wave Striker: Bonfire Lizard destroyed ${targetIds.length} opponent blocker(s).`
      ]
    };
  }

  // 5. Eviscerating Warrior Lumez: destroy all creatures that have power 2000 or less
  if (nameLower.includes('eviscerating warrior lumez')) {
    const allSmallCreatures = [...friendlyBZ, ...oppBZ].filter(
      (c) => (c.card.power ?? 0) + c.powerModifier <= 2000
    );
    let nextState = state;
    for (const c of allSmallCreatures) {
      nextState = destroyCreature(nextState, c.instanceId);
    }
    return {
      ...nextState,
      actionLog: [
        ...nextState.actionLog,
        `Wave Striker: Eviscerating Warrior Lumez destroyed ${allSmallCreatures.length} creature(s) with power <= 2000.`
      ]
    };
  }

  // 6. Skyscraper Shell: opponent puts a creature into mana zone
  if (nameLower.includes('skyscraper shell')) {
    if (oppBZ.length === 0) return state;
    const target = oppBZ[0];
    const isMulti = Boolean(target.card.isMultiCiv || (target.card.civilizations && target.card.civilizations.length > 1));
    const manaCard: ManaCardInstance = {
      instanceId: target.instanceId,
      card: target.card,
      isTapped: isMulti
    };
    return {
      ...state,
      players: {
        ...state.players,
        [opponent]: {
          ...state.players[opponent],
          battleZone: oppBZ.filter((c) => c.instanceId !== target.instanceId),
          manaZone: [...state.players[opponent].manaZone, manaCard]
        }
      },
      actionLog: [
        ...state.actionLog,
        `Wave Striker: Skyscraper Shell sent opponent's ${target.card.name} to the mana zone.`
      ]
    };
  }

  // 7. Klujadras: each player draws a card for each wave striker they control
  if (nameLower.includes('klujadras')) {
    const playerWSCount = friendlyBZ.filter((c) => isWaveStriker(c.card)).length;
    const oppWSCount = oppBZ.filter((c) => isWaveStriker(c.card)).length;
    let nextState = drawCards(state, player, playerWSCount);
    nextState = drawCards(nextState, opponent, oppWSCount);
    return {
      ...nextState,
      actionLog: [
        ...nextState.actionLog,
        `Wave Striker: Klujadras drew ${playerWSCount} card(s) for ${player} and ${oppWSCount} card(s) for ${opponent}.`
      ]
    };
  }

  // 8. Steamroller Mutant: destroy all creatures
  if (nameLower.includes('steamroller mutant')) {
    const all = [...friendlyBZ, ...oppBZ];
    let nextState = state;
    for (const c of all) {
      nextState = destroyCreature(nextState, c.instanceId);
    }
    return {
      ...nextState,
      actionLog: [
        ...nextState.actionLog,
        `Wave Striker: Steamroller Mutant destroyed ALL creatures on the battlefield!`
      ]
    };
  }

  // 9. Flame Trooper Goliac: destroy 1 opponent creature with power <= 5000
  if (nameLower.includes('flame trooper goliac')) {
    const validTargets = oppBZ.filter((c) => (c.card.power ?? 0) + c.powerModifier <= 5000);
    if (validTargets.length === 0) return state;
    const targetId = targets?.[0] || validTargets[0].instanceId;
    const nextState = destroyCreature(state, targetId);
    return {
      ...nextState,
      actionLog: [
        ...nextState.actionLog,
        `Wave Striker: Flame Trooper Goliac destroyed an opponent creature with power <= 5000.`
      ]
    };
  }

  // 10. Uncanny Turnip: ramp top of deck to mana, return creature from mana to hand
  if (nameLower.includes('uncanny turnip')) {
    let nextState = rampTopDeckToManaZone(state, player);
    const pMana = nextState.players[player].manaZone;
    const creatureInMana = pMana.find((c) => c.card.type === 'Creature');
    if (creatureInMana) {
      nextState = {
        ...nextState,
        players: {
          ...nextState.players,
          [player]: {
            ...nextState.players[player],
            manaZone: pMana.filter((c) => c.instanceId !== creatureInMana.instanceId),
            hand: [...nextState.players[player].hand, { instanceId: creatureInMana.instanceId, card: creatureInMana.card, owner: player }]
          }
        },
        actionLog: [
          ...nextState.actionLog,
          `Wave Striker: Uncanny Turnip returned ${creatureInMana.card.name} from mana zone to hand.`
        ]
      };
    }
    return nextState;
  }

  return null;
}

// ============================================================================
// 2. TURBO RUSH ENGINE (DM-08)
// Condition: Another friendly creature broke any shields this turn
// ============================================================================

/**
 * Checks whether a card definition represents a Turbo Rush card.
 */
export function isTurboRushCard(card?: CardDefinition | null): boolean {
  if (!card) return false;
  return /turbo rush/i.test(card.rulesText || '');
}

/**
 * Checks whether Turbo Rush is active for a specific creature:
 * Has another friendly creature broken shields this turn?
 */
export function isTurboRushActive(
  state: GameState,
  player: PlayerId,
  creature: CreatureInstance
): boolean {
  if (!isTurboRushCard(creature.card)) {
    return false;
  }

  const brokenList = state.players[player].shieldsBrokenThisTurn || [];
  return brokenList.some((id) => id !== creature.instanceId);
}

/**
 * Power bonus for Turbo Rush (Senia, Orchard Avenger gets +5000).
 */
export function getTurboRushPowerBonus(
  state: GameState,
  player: PlayerId,
  creature: CreatureInstance
): number {
  if (!isTurboRushActive(state, player, creature)) {
    return 0;
  }

  if (creature.card.name.toLowerCase().includes('senia')) {
    return 5000;
  }

  return 0;
}

/**
 * Power attacker bonus for Turbo Rush (Missile Soldier Ultimo gets +4000).
 */
export function getTurboRushPowerAttackerBonus(
  state: GameState,
  player: PlayerId,
  creature: CreatureInstance,
  isAttacking: boolean
): number {
  if (!isAttacking || !isTurboRushActive(state, player, creature)) {
    return 0;
  }

  if (creature.card.name.toLowerCase().includes('ultimo')) {
    return 4000;
  }

  return 0;
}

/**
 * Breaker count bonus for Turbo Rush (Senia, Orchard Avenger gets Double Breaker).
 */
export function getTurboRushBreakerCount(
  state: GameState,
  player: PlayerId,
  creature: CreatureInstance
): number {
  if (!isTurboRushActive(state, player, creature)) {
    return 1;
  }

  if (creature.card.name.toLowerCase().includes('senia')) {
    return 2;
  }

  return 1;
}

/**
 * Checks whether creature has Speed Attacker via Magmadragon Jagalzor Turbo Rush.
 */
export function isTurboRushSpeedAttacker(
  state: GameState,
  player: PlayerId,
  _creature?: CreatureInstance
): boolean {
  const friendlyBZ = state.players[player].battleZone;
  const hasActiveJagalzor = friendlyBZ.some(
    (c) =>
      c.card.name.toLowerCase().includes('jagalzor') &&
      isTurboRushActive(state, player, c)
  );

  return hasActiveJagalzor;
}

/**
 * Checks whether creature can attack untapped creatures via Turbo Rush (Missile Soldier Ultimo).
 */
export function hasTurboRushUntappedAttack(
  state: GameState,
  player: PlayerId,
  creature: CreatureInstance
): boolean {
  if (!isTurboRushActive(state, player, creature)) {
    return false;
  }

  return creature.card.name.toLowerCase().includes('ultimo');
}

/**
 * Checks whether creature is unblockable via Turbo Rush (Illusion Fish).
 */
export function isTurboRushUnblockable(
  state: GameState,
  player: PlayerId,
  creature: CreatureInstance
): boolean {
  if (!isTurboRushActive(state, player, creature)) {
    return false;
  }

  return creature.card.name.toLowerCase().includes('illusion fish');
}

/**
 * Resolves on-attack effects for Turbo Rush creatures:
 * - Gigaclaws: Opponent discards hand
 * - Slaphappy Soldier Galback: Destroy opponent creature power <= 4000
 * - Vikorakys: Search deck for card
 */
export function resolveTurboRushOnAttack(
  state: GameState,
  player: PlayerId,
  attacker: CreatureInstance,
  targets?: string[]
): GameState {
  if (!isTurboRushActive(state, player, attacker)) {
    return state;
  }

  const opponent: PlayerId = player === 'player' ? 'opponent' : 'player';
  const nameLower = attacker.card.name.toLowerCase();

  // Gigaclaws: opponent discards entire hand
  if (nameLower.includes('gigaclaws')) {
    const oppHand = state.players[opponent].hand;
    return {
      ...state,
      players: {
        ...state.players,
        [opponent]: {
          ...state.players[opponent],
          hand: [],
          graveyard: [...state.players[opponent].graveyard, ...oppHand]
        }
      },
      actionLog: [
        ...state.actionLog,
        `Turbo Rush: Gigaclaws forced opponent to discard their entire hand!`
      ]
    };
  }

  // Slaphappy Soldier Galback: destroy opponent creature power <= 4000
  if (nameLower.includes('slaphappy soldier galback')) {
    const oppBZ = state.players[opponent].battleZone;
    const validTargets = oppBZ.filter((c) => (c.card.power ?? 0) + c.powerModifier <= 4000);
    if (validTargets.length > 0) {
      const targetId = targets?.[0] || validTargets[0].instanceId;
      const nextState = destroyCreature(state, targetId);
      return {
        ...nextState,
        actionLog: [
          ...nextState.actionLog,
          `Turbo Rush: Slaphappy Soldier Galback destroyed an opponent creature with power <= 4000.`
        ]
      };
    }
  }

  // Vikorakys: search deck for a card to hand
  if (nameLower.includes('vikorakys')) {
    return searchDeckForCard(state, player, () => true, 'hand');
  }

  return state;
}

/**
 * Resolves on-unblocked attack effects for Turbo Rush creatures:
 * - Solar Grass: untap all friendly creatures except Solar Grass
 * - Gachack, Mechanical Doll: destroy a creature
 */
export function resolveTurboRushOnUnblocked(
  state: GameState,
  player: PlayerId,
  attacker: CreatureInstance,
  targets?: string[]
): GameState {
  if (!isTurboRushActive(state, player, attacker)) {
    return state;
  }

  const nameLower = attacker.card.name.toLowerCase();
  const opponent: PlayerId = player === 'player' ? 'opponent' : 'player';

  // Solar Grass: untap all friendly creatures except Solar Grasses
  if (nameLower.includes('solar grass')) {
    const updatedBZ = state.players[player].battleZone.map((c) => {
      if (!c.card.name.toLowerCase().includes('solar grass')) {
        return { ...c, isTapped: false };
      }
      return c;
    });
    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...state.players[player],
          battleZone: updatedBZ
        }
      },
      actionLog: [
        ...state.actionLog,
        `Turbo Rush: Solar Grass untapped all other friendly creatures!`
      ]
    };
  }

  // Gachack, Mechanical Doll: destroy an opponent creature
  if (nameLower.includes('gachack')) {
    const oppBZ = state.players[opponent].battleZone;
    if (oppBZ.length > 0) {
      const targetId = targets?.[0] || oppBZ[0].instanceId;
      return destroyCreature(state, targetId);
    }
  }

  return state;
}

/**
 * Resolves on-blocked attack effects for Turbo Rush creatures:
 * - Carbonite Scarab: breaks an opponent shield when blocked
 */
export function resolveTurboRushOnBlocked(
  state: GameState,
  player: PlayerId,
  attacker: CreatureInstance
): GameState {
  if (!isTurboRushActive(state, player, attacker)) {
    return state;
  }

  if (attacker.card.name.toLowerCase().includes('carbonite scarab')) {
    const opponent: PlayerId = player === 'player' ? 'opponent' : 'player';
    const oppShields = state.players[opponent].shields;
    const unbroken = oppShields.filter((s) => !s.isBroken);
    if (unbroken.length > 0) {
      const shieldToBreak = unbroken[0];
      const nextShields = oppShields.filter((s) => s.id !== shieldToBreak.id);
      const brokenCard: CardInstance = {
        instanceId: shieldToBreak.id,
        card: shieldToBreak.card,
        owner: opponent
      };
      return {
        ...state,
        players: {
          ...state.players,
          [opponent]: {
            ...state.players[opponent],
            shields: nextShields,
            hand: [...state.players[opponent].hand, brokenCard]
          }
        },
        actionLog: [
          ...state.actionLog,
          `Turbo Rush: Carbonite Scarab broke an opponent shield because it was blocked!`
        ]
      };
    }
  }

  return state;
}

// ============================================================================
// 3. SILENT SKILL ENGINE (DM-10 / DM-11)
// Condition: Creature is tapped at start of turn; player may keep it tapped to trigger ability
// ============================================================================

/**
 * Checks whether a card definition represents a Silent Skill creature.
 */
export function hasSilentSkill(card?: CardDefinition | null): boolean {
  if (!card) return false;
  return /silent skill/i.test(card.rulesText || '');
}

/**
 * Checks whether a creature instance is eligible to activate its Silent Skill:
 * - Must have silent skill
 * - Must be tapped
 */
export function canActivateSilentSkill(creature: CreatureInstance): boolean {
  return creature.isTapped && hasSilentSkill(creature.card);
}

/**
 * Resolves the Silent Skill ability for a specific creature:
 * - Keeps creature tapped
 * - Executes card-specific effect
 */
export function resolveSilentSkill(
  state: GameState,
  creatureInstanceId: string,
  targets?: string[]
): GameState {
  let foundOwner: PlayerId | null = null;
  let targetCreature: CreatureInstance | null = null;

  for (const pid of ['player', 'opponent'] as const) {
    const c = state.players[pid].battleZone.find((x) => x.instanceId === creatureInstanceId);
    if (c) {
      foundOwner = pid;
      targetCreature = c;
      break;
    }
  }

  if (!foundOwner || !targetCreature || !canActivateSilentSkill(targetCreature)) {
    return state;
  }

  const player = foundOwner;
  const opponent: PlayerId = player === 'player' ? 'opponent' : 'player';
  const nameLower = targetCreature.card.name.toLowerCase();

  // Ensure creature stays tapped
  const updatedBZ = state.players[player].battleZone.map((c) =>
    c.instanceId === creatureInstanceId ? { ...c, isTapped: true } : c
  );

  let nextState: GameState = {
    ...state,
    players: {
      ...state.players,
      [player]: {
        ...state.players[player],
        battleZone: updatedBZ
      }
    },
    actionLog: [
      ...state.actionLog,
      `${targetCreature.card.name} kept tapped to activate Silent Skill!`
    ]
  };

  // 1. Milporo: draw 1 card
  if (nameLower.includes('milporo')) {
    return drawCards(nextState, player, 1);
  }

  // 2. Bulgluf, the Spydroid / Kaemira, the Oracle: add top card of deck to shields
  if (nameLower.includes('bulgluf') || nameLower.includes('kaemira')) {
    const pDeck = nextState.players[player].deck;
    if (pDeck.length === 0) return nextState;
    const [topCard, ...restDeck] = pDeck;
    const newShield: ShieldInstance = {
      id: `shield-${Date.now()}-${Math.random()}`,
      card: topCard.card,
      isBroken: false
    };
    return {
      ...nextState,
      players: {
        ...nextState.players,
        [player]: {
          ...nextState.players[player],
          deck: restDeck,
          shields: [...nextState.players[player].shields, newShield]
        }
      },
      actionLog: [
        ...nextState.actionLog,
        `Silent Skill: Added top card of deck to shields.`
      ]
    };
  }

  // 3. Kejila, the Hidden Horror: breaks 2 opponent shields
  if (nameLower.includes('kejila')) {
    const oppShields = nextState.players[opponent].shields;
    const unbroken = oppShields.filter((s) => !s.isBroken);
    const toBreak = unbroken.slice(0, 2);
    if (toBreak.length > 0) {
      const breakIds = new Set(toBreak.map((s) => s.id));
      const nextShields = oppShields.filter((s) => !breakIds.has(s.id));
      const brokenCards: CardInstance[] = toBreak.map((s) => ({
        instanceId: s.id,
        card: s.card,
        owner: opponent
      }));
      return {
        ...nextState,
        players: {
          ...nextState.players,
          [opponent]: {
            ...nextState.players[opponent],
            shields: nextShields,
            hand: [...nextState.players[opponent].hand, ...brokenCards]
          }
        },
        actionLog: [
          ...nextState.actionLog,
          `Silent Skill: Kejila broke ${toBreak.length} opponent shield(s)!`
        ]
      };
    }
    return nextState;
  }

  // 4. Venom Capsule: breaks 1 opponent shield
  if (nameLower.includes('venom capsule')) {
    const oppShields = nextState.players[opponent].shields;
    const unbroken = oppShields.filter((s) => !s.isBroken);
    if (unbroken.length > 0) {
      const toBreak = unbroken[0];
      const nextShields = oppShields.filter((s) => s.id !== toBreak.id);
      const brokenCard: CardInstance = {
        instanceId: toBreak.id,
        card: toBreak.card,
        owner: opponent
      };
      return {
        ...nextState,
        players: {
          ...nextState.players,
          [opponent]: {
            ...nextState.players[opponent],
            shields: nextShields,
            hand: [...nextState.players[opponent].hand, brokenCard]
          }
        },
        actionLog: [
          ...nextState.actionLog,
          `Silent Skill: Venom Capsule broke 1 opponent shield!`
        ]
      };
    }
    return nextState;
  }

  // 5. Brad, Super Kickin' Dynamo: destroy 1 opponent creature with Blocker
  if (nameLower.includes('brad')) {
    const oppBZ = nextState.players[opponent].battleZone;
    const oppBlockers = oppBZ.filter(
      (c) => c.card.isBlocker || /blocker/i.test(c.card.rulesText || '')
    );
    if (oppBlockers.length > 0) {
      const targetId = targets?.[0] || oppBlockers[0].instanceId;
      return destroyCreature(nextState, targetId);
    }
    return nextState;
  }

  // 6. Minelord Skyterror: destroy all creatures with power <= 3000
  if (nameLower.includes('minelord skyterror')) {
    const allBZ = [...nextState.players.player.battleZone, ...nextState.players.opponent.battleZone];
    const targetsToDestroy = allBZ.filter(
      (c) => (c.card.power ?? 0) + c.powerModifier <= 3000
    );
    let s = nextState;
    for (const c of targetsToDestroy) {
      s = destroyCreature(s, c.instanceId);
    }
    return s;
  }

  // 7. Vorg's Engine: destroy all creatures with power <= 2000
  if (nameLower.includes("vorg's engine")) {
    const allBZ = [...nextState.players.player.battleZone, ...nextState.players.opponent.battleZone];
    const targetsToDestroy = allBZ.filter(
      (c) => (c.card.power ?? 0) + c.powerModifier <= 2000
    );
    let s = nextState;
    for (const c of targetsToDestroy) {
      s = destroyCreature(s, c.instanceId);
    }
    return s;
  }

  // 8. Hustle Berry: put top card of deck to mana zone
  if (nameLower.includes('hustle berry')) {
    return rampTopDeckToManaZone(nextState, player);
  }

  // 9. Sporeblast Erengi: search deck for creature to hand
  if (nameLower.includes('sporeblast erengi')) {
    return searchDeckForCard(nextState, player, (c) => c.type === 'Creature', 'hand');
  }

  // 10. Soderlight, the Cold Blade: opponent destroys one of their creatures
  if (nameLower.includes('soderlight')) {
    const oppBZ = nextState.players[opponent].battleZone;
    if (oppBZ.length > 0) {
      const targetId = targets?.[0] || oppBZ[0].instanceId;
      return destroyCreature(nextState, targetId);
    }
    return nextState;
  }

  // 11. Flohdani, the Spydroid: tap up to 2 opponent creatures
  if (nameLower.includes('flohdani')) {
    const oppBZ = nextState.players[opponent].battleZone;
    if (oppBZ.length > 0) {
      const targetsToTap = targets?.slice(0, 2) || oppBZ.filter((c) => !c.isTapped).slice(0, 2).map((c) => c.instanceId);
      const updatedOppBZ = oppBZ.map((c) =>
        targetsToTap.includes(c.instanceId) ? { ...c, isTapped: true } : c
      );
      return {
        ...nextState,
        players: {
          ...nextState.players,
          [opponent]: {
            ...nextState.players[opponent],
            battleZone: updatedOppBZ
          }
        },
        actionLog: [
          ...nextState.actionLog,
          `Silent Skill: Flohdani tapped ${targetsToTap.length} opponent creature(s).`
        ]
      };
    }
    return nextState;
  }

  // 12. Gigamente: return creature from graveyard to hand
  if (nameLower.includes('gigamente')) {
    return salvageFromGraveyard(nextState, player, (c) => c.type === 'Creature', 'hand');
  }

  // 13. Pinpoint Lunatron: return creature or mana card to hand
  if (nameLower.includes('pinpoint lunatron')) {
    const oppBZ = nextState.players[opponent].battleZone;
    if (oppBZ.length > 0) {
      const targetId = targets?.[0] || oppBZ[0].instanceId;
      return bounceCreature(nextState, targetId);
    }
    return nextState;
  }

  return nextState;
}

/**
 * Automatically triggers Silent Skill for AI player at start of turn.
 */
export function autoResolveAiSilentSkills(state: GameState, playerId: PlayerId): GameState {
  let s = state;
  const pZone = s.players[playerId].battleZone;
  for (const c of pZone) {
    if (canActivateSilentSkill(c)) {
      s = resolveSilentSkill(s, c.instanceId);
    }
  }
  return s;
}
