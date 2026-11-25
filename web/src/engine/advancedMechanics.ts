import type {
  GameState,
  PlayerId,
  CreatureInstance
} from './types.ts';
import type { CardDefinition } from '../types/card.ts';
import { getCardCapabilities, getOpponentId } from './cardUtils.ts';
import { buildZoneOptions, enqueueInteraction } from './interactionHelpers.ts';
import {
  isWaveStriker,
  isWaveStrikerConditionMet,
  getWaveStrikerPowerBonus,
  getWaveStrikerPowerAttackerBonus,
  hasWaveStrikerBlocker,
  getWaveStrikerBreakerCount,
  hasWaveStrikerUntappedAttack,
  isWaveStrikerUnblockable,
  isTurboRushCard,
  isTurboRushActive,
  getTurboRushPowerBonus,
  getTurboRushPowerAttackerBonus,
  getTurboRushBreakerCount,
  isTurboRushSpeedAttacker,
  hasTurboRushUntappedAttack,
  isTurboRushUnblockable,
  hasCreatureBlocker,
  getCreatureEffectivePower
} from './continuous.ts';
import {
  destroyCreature,
  destroyCreaturesBatch,
  bounceCreature,
  sendCreatureToManaZone,
  drawCards,
  salvageFromGraveyard,
  searchDeckForCard,
  rampTopDeckToManaZone,
  breakOpponentShields,
  addShieldFromDeck,
  discardRandomHandCards
} from './zones.ts';

// Re-export query primitives from continuous.ts so existing callers continue working with zero duplication
export {
  isWaveStriker,
  isWaveStrikerConditionMet,
  getWaveStrikerPowerBonus,
  getWaveStrikerPowerAttackerBonus,
  hasWaveStrikerBlocker,
  getWaveStrikerBreakerCount,
  hasWaveStrikerUntappedAttack,
  isWaveStrikerUnblockable,
  isTurboRushCard,
  isTurboRushActive,
  getTurboRushPowerBonus,
  getTurboRushPowerAttackerBonus,
  getTurboRushBreakerCount,
  isTurboRushSpeedAttacker,
  hasTurboRushUntappedAttack,
  isTurboRushUnblockable
};

// ============================================================================
// 1. WAVE STRIKER CIP ENGINE (DM-10 / DM-11 / DM-12)
// ============================================================================

/**
 * Resolves Come-Into-Play (CIP) triggers for Wave Striker creatures when 3+ Wave Strikers are on the battlefield.
 */
export function resolveWaveStrikerCIP(
  state: GameState,
  player: PlayerId,
  creature: CreatureInstance,
  targets?: string[]
): GameState | null {
  const opponent = getOpponentId(player);
  const friendlyBZ = state.players[player].battleZone;
  const oppBZ = state.players[opponent].battleZone;

  if (!isWaveStrikerConditionMet([friendlyBZ, oppBZ])) {
    return null;
  }

  const nameLower = getCardCapabilities(creature.card).nameLower;

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

  // 2. Hazaria, Duke of Thorns: opponent destroys 1 of their creatures
  if (nameLower.includes('hazaria')) {
    if (oppBZ.length === 0) return state;
    if (opponent === 'player' && state.interactiveHuman && !targets?.length) {
      const opts = buildZoneOptions(state, 'player', ['battleZone']);
      return enqueueInteraction(state, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: creature.card.id,
        sourceCardName: creature.card.name,
        actionKind: 'OPPONENT_SACRIFICE_BZ',
        prompt: `${creature.card.name}: Choose 1 of your creatures to destroy.`,
        options: opts,
        minSelections: 1,
        maxSelections: 1
      });
    }
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
    const nextState = discardRandomHandCards(state, opponent, 3);
    return {
      ...nextState,
      actionLog: [
        ...nextState.actionLog,
        `Wave Striker: Jagila triggered opponent hand discard.`
      ]
    };
  }

  // 4. Bonfire Lizard: destroy up to 2 opponent creatures that have Blocker
  if (nameLower.includes('bonfire lizard')) {
    const oppBlockers = oppBZ.filter((c) => hasCreatureBlocker(c, oppBZ, friendlyBZ, state.players[opponent]));
    if (oppBlockers.length === 0) return state;
    const targetIds = targets?.slice(0, 2) || oppBlockers.slice(0, 2).map((c) => c.instanceId);
    const nextState = destroyCreaturesBatch(state, targetIds);
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
    const ids = [...friendlyBZ, ...oppBZ]
      .filter((c) => getCreatureEffectivePower(c, false, state.players[c.owner], state.players[getOpponentId(c.owner)], false, state) <= 2000)
      .map((c) => c.instanceId);
    const nextState = destroyCreaturesBatch(state, ids);
    return {
      ...nextState,
      actionLog: [
        ...nextState.actionLog,
        `Wave Striker: Eviscerating Warrior Lumez destroyed ${ids.length} creature(s) with power <= 2000.`
      ]
    };
  }

  // 6. Skyscraper Shell: opponent puts a creature into mana zone
  if (nameLower.includes('skyscraper shell')) {
    if (oppBZ.length === 0) return state;
    if (opponent === 'player' && state.interactiveHuman && !targets?.length) {
      const opts = buildZoneOptions(state, 'player', ['battleZone']);
      return enqueueInteraction(state, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: creature.card.id,
        sourceCardName: creature.card.name,
        actionKind: 'OPPONENT_MANA_SEND_BZ',
        prompt: `${creature.card.name}: Choose 1 of your creatures to put into your mana zone.`,
        options: opts,
        minSelections: 1,
        maxSelections: 1
      });
    }
    const targetId = targets?.[0] || oppBZ[0].instanceId;
    return sendCreatureToManaZone(state, targetId);
  }

  // 7. Klujadras: each player draws a card for each Wave Striker they control
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
    const allIds = [...friendlyBZ, ...oppBZ].map((c) => c.instanceId);
    const nextState = destroyCreaturesBatch(state, allIds);
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
    const validTargets = oppBZ.filter(
      (c) => getCreatureEffectivePower(c, false, state.players[opponent], state.players[player], false, state) <= 5000
    );
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
    let nextState = rampTopDeckToManaZone(state, player, 1);
    const pMana = nextState.players[player].manaZone;
    const creatureInMana = pMana.find((c) => c.card.type.includes('Creature'));
    if (creatureInMana) {
      nextState = {
        ...nextState,
        players: {
          ...nextState.players,
          [player]: {
            ...nextState.players[player],
            manaZone: pMana.filter((c) => c.instanceId !== creatureInMana.instanceId),
            hand: [
              ...nextState.players[player].hand,
              { instanceId: creatureInMana.instanceId, card: creatureInMana.card, owner: player }
            ]
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
// 2. TURBO RUSH TRIGGERED ENGINE (DM-08)
// ============================================================================

/**
 * Resolves on-attack effects for Turbo Rush creatures (Gigaclaws, Slaphappy Soldier Galback, Vikorakys).
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

  const opponent = getOpponentId(player);
  const nameLower = getCardCapabilities(attacker.card).nameLower;

  if (nameLower.includes('gigaclaws')) {
    const oppHand = state.players[opponent].hand;
    if (oppHand.length === 0) return state;
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

  if (nameLower.includes('vikorakys')) {
    return searchDeckForCard(state, player, () => true, 'hand', { shuffleAfter: true });
  }

  return state;
}

/**
 * Resolves on-unblocked attack effects for Turbo Rush creatures (Solar Grass, Gachack).
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

  const nameLower = getCardCapabilities(attacker.card).nameLower;
  const opponent = getOpponentId(player);

  if (nameLower.includes('solar grass')) {
    const updatedBZ = state.players[player].battleZone.map((c) =>
      !getCardCapabilities(c.card).nameLower.includes('solar grass') ? { ...c, isTapped: false } : c
    );
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

  if (nameLower.includes('gachack')) {
    const oppBZ = state.players[opponent].battleZone;
    if (oppBZ.length > 0) {
      const sorted = [...oppBZ].sort(
        (a, b) => (b.card.power ?? 0) + b.powerModifier - ((a.card.power ?? 0) + a.powerModifier)
      );
      const targetId = targets?.[0] || sorted[0].instanceId;
      return destroyCreature(state, targetId);
    }
  }

  return state;
}

/**
 * Resolves on-blocked attack effects for Turbo Rush creatures (Carbonite Scarab breaks 1 opponent shield).
 */
export function resolveTurboRushOnBlocked(
  state: GameState,
  player: PlayerId,
  attacker: CreatureInstance
): GameState {
  if (!isTurboRushActive(state, player, attacker)) {
    return state;
  }

  if (getCardCapabilities(attacker.card).nameLower.includes('carbonite scarab')) {
    return breakOpponentShields(state, player, 1, {
      attacker,
      trackTurboRushAttackerId: attacker.instanceId
    });
  }

  return state;
}

// ============================================================================
// 3. SILENT SKILL ENGINE (DM-10 / DM-11)
// ============================================================================

export function hasSilentSkill(card?: CardDefinition | null): boolean {
  if (!card) return false;
  return getCardCapabilities(card).hasSilentSkill;
}

export function canActivateSilentSkill(creature: CreatureInstance): boolean {
  return creature.isTapped && hasSilentSkill(creature.card);
}

/**
 * Resolves the Silent Skill ability for a specific tapped creature.
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
  const opponent = getOpponentId(player);
  const nameLower = getCardCapabilities(targetCreature.card).nameLower;

  const updatedBZ = state.players[player].battleZone.map((c) =>
    c.instanceId === creatureInstanceId ? { ...c, isTapped: true } : c
  );

  const nextState: GameState = {
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

  if (nameLower.includes('milporo')) {
    return drawCards(nextState, player, 1);
  }

  if (nameLower.includes('bulgluf') || nameLower.includes('kaemira')) {
    return addShieldFromDeck(nextState, player, 1);
  }

  if (nameLower.includes('kejila')) {
    return breakOpponentShields(nextState, player, 2);
  }

  if (nameLower.includes('venom capsule')) {
    return breakOpponentShields(nextState, player, 1);
  }

  if (nameLower.includes('brad')) {
    const oppBZ = nextState.players[opponent].battleZone;
    const oppBlockers = oppBZ.filter((c) => hasCreatureBlocker(c, oppBZ, updatedBZ, nextState.players[opponent]));
    if (oppBlockers.length > 0) {
      const targetId = targets?.[0] || oppBlockers[0].instanceId;
      return destroyCreature(nextState, targetId);
    }
    return nextState;
  }

  if (nameLower.includes('minelord skyterror')) {
    const ids = [...nextState.players.player.battleZone, ...nextState.players.opponent.battleZone]
      .filter((c) => (c.card.power ?? 0) + c.powerModifier <= 3000)
      .map((c) => c.instanceId);
    return destroyCreaturesBatch(nextState, ids);
  }

  if (nameLower.includes("vorg's engine")) {
    const ids = [...nextState.players.player.battleZone, ...nextState.players.opponent.battleZone]
      .filter((c) => (c.card.power ?? 0) + c.powerModifier <= 2000)
      .map((c) => c.instanceId);
    return destroyCreaturesBatch(nextState, ids);
  }

  if (nameLower.includes('hustle berry')) {
    return rampTopDeckToManaZone(nextState, player, 1);
  }

  if (nameLower.includes('sporeblast erengi')) {
    return searchDeckForCard(nextState, player, (c) => c.type.includes('Creature'), 'hand', { shuffleAfter: true });
  }

  if (nameLower.includes('soderlight')) {
    const oppBZ = nextState.players[opponent].battleZone;
    if (oppBZ.length > 0) {
      const targetId = targets?.[0] || oppBZ[0].instanceId;
      return destroyCreature(nextState, targetId);
    }
    return nextState;
  }

  if (nameLower.includes('flohdani')) {
    const oppBZ = nextState.players[opponent].battleZone;
    if (oppBZ.length > 0) {
      const targetsToTap =
        targets?.slice(0, 2) ||
        oppBZ.filter((c) => !c.isTapped).slice(0, 2).map((c) => c.instanceId);
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

  if (nameLower.includes('gigamente')) {
    return salvageFromGraveyard(nextState, player, (c) => c.type.includes('Creature'), 'hand');
  }

  if (nameLower.includes('pinpoint lunatron')) {
    const oppBZ = nextState.players[opponent].battleZone;
    if (oppBZ.length > 0) {
      const targetId = targets?.[0] || oppBZ[0].instanceId;
      return bounceCreature(nextState, targetId);
    }
    return nextState;
  }

  if (nameLower.includes('gankloak')) {
    const updatedFireBZ = nextState.players[player].battleZone.map((c) =>
      c.card.civilizations?.includes('Fire') ? { ...c, tempDoubleBreaker: true } : c
    );
    return {
      ...nextState,
      players: {
        ...nextState.players,
        [player]: {
          ...nextState.players[player],
          battleZone: updatedFireBZ
        }
      },
      actionLog: [
        ...nextState.actionLog,
        `Silent Skill: Gankloak gave Fire creatures Double Breaker until end of turn.`
      ]
    };
  }

  return nextState;
}

/**
 * Evaluates whether AI wants to keep a creature tapped for its Silent Skill instead of untapping it.
 */
export function shouldAiActivateSilentSkill(
  state: GameState,
  playerId: PlayerId,
  creature: CreatureInstance
): boolean {
  const oppId = getOpponentId(playerId);
  const p = state.players[playerId];
  const opp = state.players[oppId];
  const n = getCardCapabilities(creature.card).nameLower;

  if (n.includes('milporo')) return p.deck.length > 2;
  if (n.includes('bulgluf') || n.includes('kaemira') || n.includes('hustle berry')) {
    return p.deck.length > 2;
  }
  if (n.includes('kejila') || n.includes('venom capsule')) {
    return opp.shields.some((s) => !s.isBroken);
  }
  if (n.includes('brad')) {
    return opp.battleZone.some((c) => hasCreatureBlocker(c, opp.battleZone, p.battleZone, opp));
  }
  if (n.includes('flohdani')) {
    return opp.battleZone.some((c) => !c.isTapped);
  }
  if (n.includes('soderlight') || n.includes('pinpoint lunatron')) {
    return opp.battleZone.length > 0;
  }
  if (n.includes('minelord skyterror')) {
    const oppKill = opp.battleZone.filter((c) => (c.card.power ?? 0) + c.powerModifier <= 3000).length;
    const ownKill = p.battleZone.filter((c) => (c.card.power ?? 0) + c.powerModifier <= 3000).length;
    return oppKill > ownKill;
  }
  if (n.includes("vorg's engine")) {
    const oppKill = opp.battleZone.filter((c) => (c.card.power ?? 0) + c.powerModifier <= 2000).length;
    const ownKill = p.battleZone.filter((c) => (c.card.power ?? 0) + c.powerModifier <= 2000).length;
    return oppKill > ownKill;
  }
  if (n.includes('sporeblast erengi')) {
    return p.deck.some((d) => d.card.type.includes('Creature'));
  }
  if (n.includes('gigamente')) {
    return p.graveyard.some((g) => g.card.type.includes('Creature'));
  }
  return true;
}

/**
 * Automatically evaluates & triggers worthwhile Silent Skills for AI at start of turn.
 * Returns updated state plus the set of creature instanceIds that deliberately stayed tapped.
 */
export function autoResolveAiSilentSkillsDetailed(
  state: GameState,
  playerId: PlayerId
): { state: GameState; keptTappedIds: Set<string> } {
  let s = state;
  const keptTappedIds = new Set<string>();
  const candidates = [...s.players[playerId].battleZone];

  for (const c of candidates) {
    if (s.winner !== null) break;
    if (canActivateSilentSkill(c) && shouldAiActivateSilentSkill(s, playerId, c)) {
      keptTappedIds.add(c.instanceId);
      s = resolveSilentSkill(s, c.instanceId);
    }
  }

  return { state: s, keptTappedIds };
}

/**
 * Legacy-compatible wrapper returning updated GameState after AI Silent Skills.
 */
export function autoResolveAiSilentSkills(state: GameState, playerId: PlayerId): GameState {
  return autoResolveAiSilentSkillsDetailed(state, playerId).state;
}
