import type { CardDefinition, Civilization } from '../types/card';
import type { GameState, ManaCardInstance, PlayerId } from './types';

/**
 * Returns the number of currently untapped cards in the mana zone.
 */
export function getAvailableManaCount(manaZone: ManaCardInstance[]): number {
  return manaZone.filter((m) => !m.isTapped).length;
}

/**
 * Returns the set of all civilizations represented in the mana zone
 * (both tapped and untapped cards provide their civilization).
 */
export function getAvailableCivilizations(manaZone: ManaCardInstance[]): Set<Civilization> {
  const civs = new Set<Civilization>();
  for (const cardInst of manaZone) {
    for (const civ of cardInst.card.civilizations) {
      civs.add(civ);
    }
  }
  return civs;
}

/**
 * Validates whether the given card's mana cost can be paid using the mana zone:
 * 1. Untapped mana count >= card mana cost.
 * 2. Mana zone contains at least 1 card (tapped or untapped) matching each civilization required by the card.
 */
export function canPayManaCost(
  manaZone: ManaCardInstance[],
  card: CardDefinition
): boolean {
  const cost = Math.max(0, card.manaCost);
  if (getAvailableManaCount(manaZone) < cost) {
    return false;
  }

  const availableCivs = getAvailableCivilizations(manaZone);
  for (const reqCiv of card.civilizations) {
    if (!availableCivs.has(reqCiv)) {
      return false;
    }
  }

  return true;
}

/**
 * Taps the required number of untapped mana cards to pay for a card.
 * Returns an object with success status and the updated mana zone.
 * If payment is not possible, returns success: false and the original mana zone.
 */
export function payManaCost(
  manaZone: ManaCardInstance[],
  card: CardDefinition
): { success: boolean; updatedManaZone: ManaCardInstance[] } {
  if (!canPayManaCost(manaZone, card)) {
    return { success: false, updatedManaZone: manaZone };
  }

  let remainingToTap = Math.max(0, card.manaCost);
  const updatedManaZone = manaZone.map((m) => {
    if (remainingToTap > 0 && !m.isTapped) {
      remainingToTap--;
      return { ...m, isTapped: true };
    }
    return m;
  });

  return { success: true, updatedManaZone };
}

/**
 * Charges a single card from the active player's hand into their mana zone:
 * - Max 1 card per turn.
 * - Multi-civilization cards enter the mana zone tapped.
 * - Mono-civilization cards enter untapped.
 * - Pure and immutable.
 */
export function chargeMana(
  state: GameState,
  player: PlayerId,
  cardInstanceId: string
): GameState {
  if (state.winner !== null) {
    throw new Error(`Game has already ended. Winner: ${state.winner}`);
  }

  if (state.activePlayer !== player) {
    throw new Error(`Cannot charge mana when it is not ${player}'s turn.`);
  }

  if (state.phase !== 'MANA_CHARGE' && state.phase !== 'MAIN') {
    throw new Error(`Cannot charge mana during ${state.phase} phase.`);
  }

  const playerState = state.players[player];
  if (playerState.manaChargedThisTurn) {
    throw new Error(`Player ${player} has already charged mana this turn.`);
  }

  const cardIndex = playerState.hand.findIndex((c) => c.instanceId === cardInstanceId);
  if (cardIndex === -1) {
    throw new Error(`Card ${cardInstanceId} not found in ${player}'s hand.`);
  }

  const cardToCharge = playerState.hand[cardIndex];
  const isMultiCiv = Boolean(
    cardToCharge.card.isMultiCiv ||
      (cardToCharge.card.civilizations && cardToCharge.card.civilizations.length > 1)
  );

  const manaCard: ManaCardInstance = {
    instanceId: cardToCharge.instanceId,
    card: cardToCharge.card,
    isTapped: isMultiCiv
  };

  const nextHand = playerState.hand.filter((_, idx) => idx !== cardIndex);
  const nextManaZone = [...playerState.manaZone, manaCard];

  return {
    ...state,
    players: {
      ...state.players,
      [player]: {
        ...playerState,
        hand: nextHand,
        manaZone: nextManaZone,
        manaChargedThisTurn: true
      }
    },
    actionLog: [
      ...state.actionLog,
      `${player} charged ${cardToCharge.card.name} into the mana zone${isMultiCiv ? ' (tapped)' : ''}.`
    ]
  };
}
