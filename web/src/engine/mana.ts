import type { CardDefinition, Civilization } from '../types/card';
import type { GameState, ManaCardInstance, CardInstance, PlayerId } from './types';

/**
 * Returns the number of currently untapped cards in the mana zone.
 */
export function getAvailableManaCount(manaZone: ManaCardInstance[]): number {
  return manaZone.filter((m) => !m.isTapped).length;
}

/**
 * Returns the set of all civilizations represented in the mana zone.
 * When untappedOnly is true, only considers currently untapped cards.
 */
export function getAvailableCivilizations(
  manaZone: ManaCardInstance[],
  untappedOnly: boolean = false
): Set<Civilization> {
  const civs = new Set<Civilization>();
  for (const cardInst of manaZone) {
    if (!untappedOnly || !cardInst.isTapped) {
      for (const civ of cardInst.card.civilizations) {
        civs.add(civ);
      }
    }
  }
  return civs;
}

/**
 * Finds the exact indices of untapped mana cards to tap in order to pay for a card.
 * Official Duel Masters Rule:
 * At least one of the cards tapped to pay for the card MUST match each of the
 * card's civilizations.
 * Returns the list of mana zone indices to tap, or null if requirements cannot be met.
 */
export function findManaCardsToTap(
  manaZone: ManaCardInstance[],
  card: CardDefinition
): number[] | null {
  const rawCost = card.manaCost ?? (card as any).cost ?? 0;
  const cost = Math.max(0, rawCost);
  const untapped = manaZone
    .map((m, index) => ({ m, index }))
    .filter((x) => !x.m.isTapped);

  if (untapped.length < cost) {
    return null;
  }

  if (cost === 0) {
    return [];
  }

  const rawCivs = card.civilizations ?? ((card as any).civilization ? [(card as any).civilization] : []);
  const requiredCivs = [...new Set(rawCivs)];

  // Backtracking search to find a subset of untapped cards of size <= cost
  // that covers all required civilizations.
  function search(
    civIndex: number,
    selectedIndices: number[]
  ): number[] | null {
    if (civIndex === requiredCivs.length) {
      return selectedIndices;
    }

    const currentCiv = requiredCivs[civIndex];
    // If an already selected card covers this civilization, advance
    const alreadyCovered = selectedIndices.some((idx) =>
      manaZone[idx].card.civilizations.includes(currentCiv)
    );
    if (alreadyCovered) {
      return search(civIndex + 1, selectedIndices);
    }

    // Try selecting an untapped card that provides currentCiv
    for (const item of untapped) {
      if (
        !selectedIndices.includes(item.index) &&
        item.m.card.civilizations.includes(currentCiv)
      ) {
        if (selectedIndices.length + 1 <= cost) {
          const res = search(civIndex + 1, [...selectedIndices, item.index]);
          if (res) return res;
        }
      }
    }

    return null;
  }

  const civCardIndices = search(0, []);
  if (!civCardIndices) {
    return null;
  }

  // Fill remaining cost with other untapped cards
  const result = [...civCardIndices];
  for (const item of untapped) {
    if (result.length >= cost) break;
    if (!result.includes(item.index)) {
      result.push(item.index);
    }
  }

  return result.length === cost ? result : null;
}

/**
 * Validates whether the given card's mana cost can be paid using the mana zone:
 * 1. Untapped mana count >= card mana cost.
 * 2. At least one untapped mana card can be tapped for each of the card's required civilizations.
 */
export function canPayManaCost(
  manaZone: ManaCardInstance[],
  card: CardDefinition
): boolean {
  return findManaCardsToTap(manaZone, card) !== null;
}

/**
 * Taps the required number of untapped mana cards to pay for a card.
 * Priority: Guaranteed to tap cards matching each required civilization of the card.
 * Returns an object with success status and the updated mana zone.
 * If payment is not possible, returns success: false and the original mana zone.
 */
export function payManaCost(
  manaZone: ManaCardInstance[],
  card: CardDefinition
): { success: boolean; updatedManaZone: ManaCardInstance[] } {
  const indicesToTap = findManaCardsToTap(manaZone, card);
  if (!indicesToTap) {
    return { success: false, updatedManaZone: manaZone };
  }

  const toTapSet = new Set(indicesToTap);
  const updatedManaZone = manaZone.map((m, index) => {
    if (toTapSet.has(index)) {
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

  if (state.phase !== 'MANA_CHARGE') {
    throw new Error(`Cannot charge mana during ${state.phase} phase. Mana must be charged during MANA_CHARGE phase.`);
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

/**
 * Undoes the mana charge action performed this turn:
 * - Only permitted during the MANA_CHARGE phase before moving to Main Phase or taking other actions.
 * - Removes the charged card from the mana zone and returns it back to the hand.
 * - Resets manaChargedThisTurn to false.
 */
export function undoChargeMana(
  state: GameState,
  player: PlayerId
): GameState {
  if (state.winner !== null) {
    throw new Error(`Game has already ended. Winner: ${state.winner}`);
  }

  if (state.activePlayer !== player) {
    throw new Error(`Cannot undo mana charge when it is not ${player}'s turn.`);
  }

  if (state.phase !== 'MANA_CHARGE') {
    throw new Error(`Cannot undo mana charge outside of MANA_CHARGE phase.`);
  }

  const playerState = state.players[player];
  if (!playerState.manaChargedThisTurn) {
    throw new Error(`No mana card was charged this turn to undo.`);
  }

  if (playerState.manaZone.length === 0) {
    throw new Error(`Mana zone is empty.`);
  }

  const lastIndex = playerState.manaZone.length - 1;
  const returnedManaCard = playerState.manaZone[lastIndex];

  const nextManaZone = playerState.manaZone.slice(0, lastIndex);
  const returnedCardInstance: CardInstance = {
    instanceId: returnedManaCard.instanceId,
    card: returnedManaCard.card,
    owner: player
  };
  const nextHand = [...playerState.hand, returnedCardInstance];

  return {
    ...state,
    players: {
      ...state.players,
      [player]: {
        ...playerState,
        hand: nextHand,
        manaZone: nextManaZone,
        manaChargedThisTurn: false
      }
    },
    actionLog: [
      ...state.actionLog,
      `${player} returned ${returnedManaCard.card.name} from the mana zone back to hand.`
    ]
  };
}
