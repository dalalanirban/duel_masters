import type { CardDefinition } from '../types/card';
import type { GameState, PlayerId, CreatureInstance, CardInstance } from './types';
import { canPayManaCost, payManaCost } from './mana.ts';
import { resolveCreatureCIPEffect } from './spells.ts';

/**
 * Determines whether a card definition represents an Evolution Creature.
 */
export function isEvolutionCreature(card: CardDefinition): boolean {
  return card.type === 'Evolution Creature' || Boolean(card.isEvolution);
}

/**
 * Extracts the required bait creature races for an evolution creature.
 */
export function getEvolutionBaitRequirements(card: CardDefinition): string[] {
  if (card.evolutionRaces && card.evolutionRaces.length > 0) {
    return card.evolutionRaces;
  }

  // Rules text check for Dragon-based evolutions (e.g. Überdragon Bajula)
  if (/that has Dragon in its race/i.test(card.rulesText || '')) {
    return ['Dragon'];
  }

  // Standard evolution creatures have their required race as their race
  if (card.races && card.races.length > 0) {
    return card.races;
  }

  return [];
}

/**
 * Validates whether a given creature instance in the battle zone can serve as bait
 * for the specified evolution creature.
 */
export function isValidEvolutionBait(
  evolutionCard: CardDefinition,
  baitCreature: CreatureInstance
): boolean {
  const reqs = getEvolutionBaitRequirements(evolutionCard);
  if (reqs.length === 0) {
    return false;
  }

  const baitRaces = baitCreature.card.races || [];

  return reqs.some((req) => {
    const reqClean = req.toLowerCase().trim();
    if (reqClean === 'dragon') {
      return baitRaces.some((r) => r.toLowerCase().includes('dragon'));
    }

    return baitRaces.some((r) => {
      const raceClean = r.toLowerCase().trim();
      return (
        raceClean === reqClean ||
        raceClean === reqClean.replace(/s$/, '') ||
        raceClean.replace(/s$/, '') === reqClean
      );
    });
  });
}

/**
 * Checks whether a creature has summoning sickness on a given turn.
 * - Regular creatures cannot attack on the turn summoned unless isSpeedAttacker is true.
 * - Evolution creatures ignore summoning sickness and can attack on the turn summoned.
 */
export function isSummoningSick(
  creature: CreatureInstance,
  currentTurn: number
): boolean {
  if (isEvolutionCreature(creature.card)) {
    return false;
  }

  if (creature.card.isSpeedAttacker) {
    return false;
  }

  return creature.summonedTurn >= currentTurn;
}

/**
 * Summons a standard creature or evolution creature from the active player's hand:
 * 1. Validates game state, turn, phase (MANA_CHARGE auto-transitions to MAIN).
 * 2. Validates hand presence, card type, and mana cost affordability.
 * 3. Taps required mana in mana zone.
 * 4. If evolution creature, validates presence and race compatibility of bait in friendly battle zone.
 * 5. Places creature in battle zone (stacks on bait if evolution, inherits tapped state).
 * 6. Deducts card from hand and logs the action.
 * 7. Pure and immutable.
 */
export function summonCreature(
  state: GameState,
  player: PlayerId,
  cardInstanceId: string,
  baitInstanceId?: string,
  targets?: string[]
): GameState {
  if (state.winner !== null) {
    throw new Error(`Game has already ended. Winner: ${state.winner}`);
  }

  if (state.activePlayer !== player) {
    throw new Error(`Cannot summon creature when it is not ${player}'s turn.`);
  }

  if (state.phase !== 'MAIN' && state.phase !== 'MANA_CHARGE') {
    throw new Error(`Cannot summon creature during ${state.phase} phase.`);
  }

  const playerState = state.players[player];
  const cardIndex = playerState.hand.findIndex((c) => c.instanceId === cardInstanceId);
  if (cardIndex === -1) {
    throw new Error(`Card ${cardInstanceId} not found in ${player}'s hand.`);
  }

  const handCard = playerState.hand[cardIndex];
  const isEvo = isEvolutionCreature(handCard.card);
  const isCreature = isEvo || handCard.card.type === 'Creature';

  if (!isCreature) {
    throw new Error(`Card ${handCard.card.name} is not a creature.`);
  }

  if (!canPayManaCost(playerState.manaZone, handCard.card)) {
    throw new Error(`Cannot afford mana cost for ${handCard.card.name}.`);
  }

  const { success, updatedManaZone } = payManaCost(playerState.manaZone, handCard.card);
  if (!success) {
    throw new Error(`Failed to pay mana cost for ${handCard.card.name}.`);
  }

  let baitCreature: CreatureInstance | undefined;
  if (isEvo) {
    if (!baitInstanceId) {
      throw new Error(
        `Evolution creature ${handCard.card.name} requires a bait creature in the battle zone.`
      );
    }

    baitCreature = playerState.battleZone.find((c) => c.instanceId === baitInstanceId);
    if (!baitCreature) {
      throw new Error(`Bait creature ${baitInstanceId} not found in ${player}'s battle zone.`);
    }

    if (!isValidEvolutionBait(handCard.card, baitCreature)) {
      throw new Error(
        `Bait creature ${baitCreature.card.name} is not a valid evolution bait for ${handCard.card.name}.`
      );
    }
  } else if (baitInstanceId) {
    throw new Error(
      `Cannot provide bait creature for non-evolution creature ${handCard.card.name}.`
    );
  }

  const baitCardInstance: CardInstance | undefined = baitCreature
    ? {
        instanceId: baitCreature.instanceId,
        card: baitCreature.card,
        owner: baitCreature.owner
      }
    : undefined;

  const evolvedOnStack: CardInstance[] | undefined = isEvo && baitCreature
    ? [...(baitCreature.evolvedOn || []), baitCardInstance!]
    : undefined;

  const newCreature: CreatureInstance = {
    instanceId: handCard.instanceId,
    card: handCard.card,
    owner: player,
    isTapped: isEvo && baitCreature ? baitCreature.isTapped : false,
    summonedTurn: state.turn,
    powerModifier: 0,
    ...(evolvedOnStack ? { evolvedOn: evolvedOnStack } : {})
  };

  const nextHand = playerState.hand.filter((_, idx) => idx !== cardIndex);

  let nextBattleZone: CreatureInstance[];
  if (isEvo && baitInstanceId) {
    nextBattleZone = playerState.battleZone.map((c) =>
      c.instanceId === baitInstanceId ? newCreature : c
    );
  } else {
    nextBattleZone = [...playerState.battleZone, newCreature];
  }

  const actionMessage = isEvo && baitCreature
    ? `${player} evolved ${handCard.card.name} on top of ${baitCreature.card.name}.`
    : `${player} summoned ${handCard.card.name}.`;

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

  return resolveCreatureCIPEffect(stateWithSummonedCreature, player, newCreature, targets);
}
