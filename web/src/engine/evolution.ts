import type { CardDefinition } from '../types/card.ts';
import type { GameState, PlayerId, CreatureInstance, CardInstance } from './types.ts';
import {
  getCardCapabilities,
  getCreatureRaces,
  getOpponentId,
  hasDragonRace,
  normalizeRace
} from './cardUtils.ts';
import {
  canPayManaCost,
  getManaPaymentFailureReason,
  payManaCost
} from './mana.ts';
import { isCreatureSummoningSick } from './continuous.ts';
import { triggerCIP } from './triggers.ts';

export { normalizeRace };

/**
 * Checks whether any of the bait's races matches a required evolution race.
 * Fixed:
 * - "Dragon" excludes "Dragonoid" per official Duel Masters rules.
 * - Uses exact normalized equality rather than substring `.includes` (so "Giant" != "Giant Insect", "Fish" != "Gel Fish").
 */
export function matchesBaitRace(baitRaces: string[] = [], requirement: string): boolean {
  const reqClean = requirement.toLowerCase().trim();
  if (reqClean === 'dragon' || reqClean.includes('dragon in its race')) {
    return hasDragonRace(baitRaces);
  }
  const reqNorm = normalizeRace(requirement);
  return baitRaces.some((r) => normalizeRace(r) === reqNorm);
}

/**
 * Determines whether a card definition represents an Evolution Creature.
 */
export function isEvolutionCreature(card: CardDefinition): boolean {
  return getCardCapabilities(card).isEvolution;
}

/**
 * Checks whether an evolution creature is a Vortex Evolution creature.
 */
export function isVortexEvolution(card: CardDefinition): boolean {
  return getCardCapabilities(card).isVortexEvolution;
}

export interface VortexEvolutionRequirement {
  race1: string;
  race2: string;
}

/**
 * Extracts the two required bait races for a Vortex Evolution creature.
 */
export function getVortexEvolutionRequirements(
  card: CardDefinition
): VortexEvolutionRequirement | null {
  const rules = card.rulesText || '';
  const match = rules.match(
    /vortex evolution[—\-]\s*(?:put on (?:one of your|2 of your creatures:?\s*(?:one|1)?))?\s*([^.]+?)\s*(?:and|\+)\s*(?:one of your\s*)?([^.]+?)\./i
  );
  if (match) {
    return {
      race1: match[1].trim(),
      race2: match[2].trim()
    };
  }
  return null;
}

/**
 * Extracts the required bait creature races for an evolution creature.
 */
export function getEvolutionBaitRequirements(card: CardDefinition): string[] {
  const rules = card.rulesText || '';

  const vortex = getVortexEvolutionRequirements(card);
  if (vortex) {
    return [vortex.race1, vortex.race2];
  }

  const orMatch = rules.match(
    /evolution[—\-]\s*put on one of your\s+([^.]+?)\s+or\s+(?:a\s+)?([^.]+?)\./i
  );
  if (orMatch) {
    return [orMatch[1].trim(), orMatch[2].trim()];
  }

  if (/that has Dragon in its race/i.test(rules)) {
    return ['Dragon'];
  }

  const singleMatch = rules.match(/evolution[—\-]\s*put on one of your\s+([^.]+?)\./i);
  if (singleMatch) {
    return [singleMatch[1].trim()];
  }

  if (card.evolutionRaces && card.evolutionRaces.length > 0) {
    return card.evolutionRaces;
  }

  if (card.races && card.races.length > 0) {
    return card.races;
  }

  return [];
}

/**
 * Validates whether a given creature instance can serve as bait for a standard or either-or evolution creature.
 */
export function isValidEvolutionBait(
  evolutionCard: CardDefinition,
  baitCreature: CreatureInstance
): boolean {
  const reqs = getEvolutionBaitRequirements(evolutionCard);
  if (reqs.length === 0) return false;
  const baitRaces = getCreatureRaces(baitCreature);
  return reqs.some((req) => matchesBaitRace(baitRaces, req));
}

/**
 * Validates whether two distinct creatures in the battle zone can serve as baits for a Vortex Evolution creature.
 */
export function isValidVortexEvolutionBaits(
  evolutionCard: CardDefinition,
  bait1: CreatureInstance,
  bait2: CreatureInstance
): boolean {
  if (bait1.instanceId === bait2.instanceId) return false;
  const vortexReq = getVortexEvolutionRequirements(evolutionCard);
  if (!vortexReq) return false;

  const races1 = getCreatureRaces(bait1);
  const races2 = getCreatureRaces(bait2);

  return (
    (matchesBaitRace(races1, vortexReq.race1) && matchesBaitRace(races2, vortexReq.race2)) ||
    (matchesBaitRace(races1, vortexReq.race2) && matchesBaitRace(races2, vortexReq.race1))
  );
}

/**
 * Finds all valid pairs of Vortex bait creatures in a battle zone.
 */
export function findAllValidVortexBaitPairs(
  evolutionCard: CardDefinition,
  battleZone: CreatureInstance[]
): [CreatureInstance, CreatureInstance][] {
  const pairs: [CreatureInstance, CreatureInstance][] = [];
  for (let i = 0; i < battleZone.length; i++) {
    for (let j = i + 1; j < battleZone.length; j++) {
      if (isValidVortexEvolutionBaits(evolutionCard, battleZone[i], battleZone[j])) {
        pairs.push([battleZone[i], battleZone[j]]);
      }
    }
  }
  return pairs;
}

/**
 * Finds the first valid pair of bait creatures in the given battle zone for a Vortex Evolution creature.
 */
export function findValidVortexBaits(
  evolutionCard: CardDefinition,
  battleZone: CreatureInstance[]
): [CreatureInstance, CreatureInstance] | null {
  for (let i = 0; i < battleZone.length; i++) {
    for (let j = i + 1; j < battleZone.length; j++) {
      if (isValidVortexEvolutionBaits(evolutionCard, battleZone[i], battleZone[j])) {
        return [battleZone[i], battleZone[j]];
      }
    }
  }
  return null;
}

/**
 * Checks whether a creature has summoning sickness on a given turn.
 * Delegates to continuous.ts (handles Evolution, Speed Attacker, Survivors, Burnwisp Lizard, Totto Pipicchi, Jagalzor Turbo Rush).
 */
export function isSummoningSick(
  creature: CreatureInstance,
  currentTurn: number,
  friendlyBattleZone?: CreatureInstance[],
  state?: GameState,
  playerId?: PlayerId
): boolean {
  return isCreatureSummoningSick(creature, currentTurn, friendlyBattleZone, state, playerId);
}

/**
 * Summons a standard creature or evolution creature (single, either-or, or Vortex Evolution) from hand:
 * - Enforces cost reduction auras (Cocco Lupia, Elf-X, Fever Nuts) and multi-civ mana rules.
 * - Preserves bait `summonedTurn` inside `evolvedOn` for accurate Vortex separation rulings.
 */
export function summonCreature(
  state: GameState,
  player: PlayerId,
  cardInstanceId: string,
  baitInstanceId?: string | string[],
  targets?: string[],
  manaInstanceIds?: string[]
): GameState {
  if (Boolean(state.winner)) {
    throw new Error(`Game has already ended. Winner: ${state.winner}`);
  }

  if (state.activePlayer !== player) {
    throw new Error(`Cannot summon creature when it is not ${player}'s turn.`);
  }

  if (state.phase !== 'MAIN' && state.phase !== 'MANA_CHARGE') {
    throw new Error(`Cannot summon creature during ${state.phase} phase.`);
  }

  const playerState = state.players[player];
  const opponentState = state.players[getOpponentId(player)];
  const cardIndex = playerState.hand.findIndex((c) => c.instanceId === cardInstanceId);
  if (cardIndex === -1) {
    throw new Error(`Card ${cardInstanceId} not found in ${player}'s hand.`);
  }

  const handCard = playerState.hand[cardIndex];
  const isEvo = isEvolutionCreature(handCard.card);
  const isVortex = isEvo && isVortexEvolution(handCard.card);
  const isCreature = isEvo || handCard.card.type === 'Creature';

  if (!isCreature) {
    throw new Error(`Card ${handCard.card.name} is not a creature.`);
  }

  if (
    !canPayManaCost(
      playerState.manaZone,
      handCard.card,
      playerState.battleZone,
      opponentState.battleZone,
      manaInstanceIds
    )
  ) {
    throw new Error(
      getManaPaymentFailureReason(
        playerState.manaZone,
        handCard.card,
        playerState.battleZone,
        opponentState.battleZone
      )
    );
  }

  const { success, updatedManaZone } = payManaCost(
    playerState.manaZone,
    handCard.card,
    playerState.battleZone,
    opponentState.battleZone,
    manaInstanceIds
  );
  if (!success) {
    throw new Error(`Failed to pay mana cost for ${handCard.card.name}.`);
  }

  let baitCreature1: CreatureInstance | undefined;
  let baitCreature2: CreatureInstance | undefined;

  if (isVortex) {
    let baitIds: string[] = [];
    if (Array.isArray(baitInstanceId)) {
      baitIds = baitInstanceId;
    } else if (typeof baitInstanceId === 'string') {
      baitIds = baitInstanceId.split(/[\s,]+/).filter(Boolean);
    }

    if (baitIds.length !== 2) {
      throw new Error(
        `Vortex Evolution creature ${handCard.card.name} requires two bait creatures in the battle zone.`
      );
    }

    baitCreature1 = playerState.battleZone.find((c) => c.instanceId === baitIds[0]);
    baitCreature2 = playerState.battleZone.find((c) => c.instanceId === baitIds[1]);

    if (!baitCreature1 || !baitCreature2) {
      throw new Error(
        `One or more bait creatures not found in ${player}'s battle zone for Vortex Evolution.`
      );
    }

    if (!isValidVortexEvolutionBaits(handCard.card, baitCreature1, baitCreature2)) {
      throw new Error(
        `Baits ${baitCreature1.card.name} and ${baitCreature2.card.name} are not valid evolution baits for Vortex Evolution ${handCard.card.name}.`
      );
    }
  } else if (isEvo) {
    const singleBaitId = Array.isArray(baitInstanceId) ? baitInstanceId[0] : baitInstanceId;
    if (!singleBaitId) {
      throw new Error(
        `Evolution creature ${handCard.card.name} requires a bait creature in the battle zone.`
      );
    }

    baitCreature1 = playerState.battleZone.find((c) => c.instanceId === singleBaitId);
    if (!baitCreature1) {
      throw new Error(`Bait creature ${singleBaitId} not found in ${player}'s battle zone.`);
    }

    if (!isValidEvolutionBait(handCard.card, baitCreature1)) {
      throw new Error(
        `Bait creature ${baitCreature1.card.name} is not a valid evolution bait for ${handCard.card.name}.`
      );
    }
  } else if (baitInstanceId && (Array.isArray(baitInstanceId) ? baitInstanceId.length > 0 : true)) {
    throw new Error(
      `Cannot provide bait creature for non-evolution creature ${handCard.card.name}.`
    );
  }

  let evolvedOnStack: CardInstance[] | undefined;
  let enterTapped = false;

  const hasMysticMagician = playerState.battleZone.some((c) =>
    getCardCapabilities(c.card).nameLower.includes('mystic magician')
  );
  const silentSkillTapped = hasMysticMagician && getCardCapabilities(handCard.card).hasSilentSkill;

  if (isVortex && baitCreature1 && baitCreature2) {
    const bait1CardInstance: CardInstance = {
      instanceId: baitCreature1.instanceId,
      card: baitCreature1.card,
      owner: baitCreature1.owner,
      summonedTurn: baitCreature1.summonedTurn,
      ...(baitCreature1.evolvedOn && baitCreature1.evolvedOn.length > 0
        ? { evolvedOn: baitCreature1.evolvedOn }
        : {})
    };
    const bait2CardInstance: CardInstance = {
      instanceId: baitCreature2.instanceId,
      card: baitCreature2.card,
      owner: baitCreature2.owner,
      summonedTurn: baitCreature2.summonedTurn,
      ...(baitCreature2.evolvedOn && baitCreature2.evolvedOn.length > 0
        ? { evolvedOn: baitCreature2.evolvedOn }
        : {})
    };

    evolvedOnStack = [bait1CardInstance, bait2CardInstance];

    enterTapped = baitCreature1.isTapped || baitCreature2.isTapped || silentSkillTapped;
  } else if (isEvo && baitCreature1) {
    const baitCardInstance: CardInstance = {
      instanceId: baitCreature1.instanceId,
      card: baitCreature1.card,
      owner: baitCreature1.owner,
      summonedTurn: baitCreature1.summonedTurn,
      ...(baitCreature1.evolvedOn && baitCreature1.evolvedOn.length > 0
        ? { evolvedOn: baitCreature1.evolvedOn }
        : {})
    };

    evolvedOnStack = [baitCardInstance];
    enterTapped = baitCreature1.isTapped || silentSkillTapped;
  } else {
    enterTapped = silentSkillTapped;
  }

  const newCreature: CreatureInstance = {
    instanceId: handCard.instanceId,
    card: handCard.card,
    owner: player,
    isTapped: enterTapped,
    summonedTurn: state.turn,
    powerModifier: 0,
    ...(evolvedOnStack ? { evolvedOn: evolvedOnStack } : {})
  };

  const nextHand = playerState.hand.filter((_, idx) => idx !== cardIndex);

  let nextBattleZone: CreatureInstance[];
  let actionMessage: string;

  if (isVortex && baitCreature1 && baitCreature2) {
    const removedIds = new Set([baitCreature1.instanceId, baitCreature2.instanceId]);
    nextBattleZone = [
      ...playerState.battleZone.filter((c) => !removedIds.has(c.instanceId)),
      newCreature
    ];
    actionMessage = `${player} evolved ${handCard.card.name} (Vortex Evolution) on top of ${baitCreature1.card.name} and ${baitCreature2.card.name}.`;
  } else if (isEvo && baitCreature1) {
    nextBattleZone = playerState.battleZone.map((c) =>
      c.instanceId === baitCreature1!.instanceId ? newCreature : c
    );
    actionMessage = `${player} evolved ${handCard.card.name} on top of ${baitCreature1.card.name}.`;
  } else {
    nextBattleZone = [...playerState.battleZone, newCreature];
    actionMessage = `${player} summoned ${handCard.card.name}.`;
  }

  const stateWithSummonedCreature: GameState = {
    ...state,
    phase: 'MAIN',
    players: {
      ...state.players,
      [player]: {
        ...playerState,
        hand: nextHand,
        manaZone: updatedManaZone,
        battleZone: nextBattleZone
      }
    },
    actionLog: [...state.actionLog, actionMessage]
  };

  return triggerCIP(stateWithSummonedCreature, player, newCreature, targets);
}
