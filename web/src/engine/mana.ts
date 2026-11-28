import type { CardDefinition, Civilization } from '../types/card.ts';
import type {
  GameState,
  ManaCardInstance,
  CardInstance,
  CreatureInstance,
  PlayerId
} from './types.ts';
import {
  getCardCivilizations,
  getCardCapabilities,
  isMultiCivilization
} from './cardUtils.ts';

export { isMultiCivilization };

/**
 * Converts a CardInstance/card definition into a ManaCardInstance,
 * enforcing the multi-civilization enters-tapped rule unless overridden.
 */
export function toManaCard(
  item: { instanceId: string; card: CardDefinition },
  forceTapped?: boolean
): ManaCardInstance {
  const tapped = forceTapped !== undefined ? forceTapped : isMultiCivilization(item.card);
  return {
    instanceId: item.instanceId,
    card: item.card,
    isTapped: tapped,
    ...(tapped ? { isSpent: true } : {})
  };
}

/**
 * Computes the effective mana cost of a card taking battlefield cost modifiers into account:
 * Increases (applied first, per Duel Masters rules):
 * - Volcano Smog, Deceptive Shade (DM04-039): Each Light creature/spell costs 2 more.
 * - Missile Boy (DM04-045): Each Light creature/spell costs 1 more.
 * - Milieus, the Daystretcher (DM04-012): Each Darkness creature/spell costs 2 more.
 * - Dew Mushroom (DM04-050): Each Darkness creature/spell costs 1 more.
 * - Horned Mutant (DM05-029): Each Nature creature/spell costs 1 more.
 * Reductions:
 * - Cocco Lupia (DM06-077): Friendly Dragons cost 2 less (min 2; Dragonoids excluded).
 * - Elf-X (DM02-046): Friendly creatures cost 1 less (min 1).
 * - Essence Elf (DM02-047): Friendly spells cost 1 less (min 1).
 * - Fever Nuts (DM12-054): All players' creatures cost 1 less (min 1).
 */
export function getEffectiveManaCost(
  card: CardDefinition,
  friendlyBattleZone: CreatureInstance[] = [],
  opponentBattleZone: CreatureInstance[] = []
): number {
  let cost = Math.max(0, card.manaCost ?? (card as unknown as { cost?: number }).cost ?? 0);
  if (cost === 0) return 0;

  const caps = getCardCapabilities(card);
  const isSpell = card.type === 'Spell';
  const isCreature = !isSpell;
  const isLight = caps.civilizations.includes('Light');
  const isDarkness = caps.civilizations.includes('Darkness');
  const isNature = caps.civilizations.includes('Nature');

  // 1. Apply global cost increases across both battle zones first
  for (const unit of [...friendlyBattleZone, ...opponentBattleZone]) {
    const unitName = getCardCapabilities(unit.card).nameLower;
    if (isLight && unitName.includes('volcano smog')) cost += 2;
    if (isLight && unitName.includes('missile boy')) cost += 1;
    if (isDarkness && unitName.includes('milieus')) cost += 2;
    if (isDarkness && unitName.includes('dew mushroom')) cost += 1;
    if (isNature && unitName.includes('horned mutant')) cost += 1;
  }

  // 2. Apply Cocco Lupia reductions (min 2)
  if (isCreature && caps.hasDragonRace) {
    for (const ally of friendlyBattleZone) {
      const allyCaps = getCardCapabilities(ally.card);
      if (
        allyCaps.nameLower.includes('cocco lupia') ||
        /creatures that have dragon in their race each cost 2 less/i.test(ally.card.rulesText || '')
      ) {
        cost = Math.max(2, cost - 2);
      }
    }
  }

  // 3. Apply Elf-X / Essence Elf / Fever Nuts reductions (min 1)
  for (const ally of friendlyBattleZone) {
    const allyCaps = getCardCapabilities(ally.card);
    if (isCreature && allyCaps.nameLower.includes('elf-x')) {
      cost = Math.max(1, cost - 1);
    }
    if (isSpell && allyCaps.nameLower.includes('essence elf')) {
      cost = Math.max(1, cost - 1);
    }
    if (isCreature && allyCaps.nameLower.includes('fever nuts')) {
      cost = Math.max(1, cost - 1);
    }
  }

  for (const enemy of opponentBattleZone) {
    const enemyCaps = getCardCapabilities(enemy.card);
    if (isCreature && enemyCaps.nameLower.includes('fever nuts')) {
      cost = Math.max(1, cost - 1);
    }
  }

  return cost;
}

function isManaCardSpendable(m: ManaCardInstance): boolean {
  return !m.isTapped || (Boolean(m.isStaged) && !m.isSpent);
}

/**
 * Returns the number of currently spendable (untapped or manually staged) cards in the mana zone.
 */
export function getAvailableManaCount(manaZone: ManaCardInstance[]): number {
  let count = 0;
  for (const m of manaZone) {
    if (isManaCardSpendable(m)) count++;
  }
  return count;
}

/**
 * Returns the set of all civilizations represented in the mana zone.
 * When untappedOnly is true, only considers currently spendable cards.
 */
export function getAvailableCivilizations(
  manaZone: ManaCardInstance[],
  untappedOnly: boolean = false
): Set<Civilization> {
  const civs = new Set<Civilization>();
  for (const cardInst of manaZone) {
    if (!untappedOnly || isManaCardSpendable(cardInst)) {
      for (const civ of getCardCivilizations(cardInst.card)) {
        civs.add(civ);
      }
    }
  }
  return civs;
}

/**
 * Finds the exact indices of mana cards to tap/commit in order to pay for a card:
 * - Honors `explicitManaIds` if supplied OR manually pre-tapped (`isStaged && !isSpent`) mana cards.
 * - Enforces total committed count == effective mana cost.
 * - Enforces at least one DISTINCT committed card matching EACH required civilization of the card
 *   (so dual-civ cards require distinct matching cards for both civilizations).
 * - Preserves mono-civ & abundant civilizations when auto-filling remaining cost.
 */
export function findManaCardsToTap(
  manaZone: ManaCardInstance[],
  card: CardDefinition,
  friendlyBattleZone: CreatureInstance[] = [],
  opponentBattleZone: CreatureInstance[] = [],
  explicitManaIds?: string[]
): number[] | null {
  const rawRequiredCivs = getCardCivilizations(card);
  const requiredCivs = [...new Set(rawRequiredCivs)];
  const baseCost = getEffectiveManaCost(card, friendlyBattleZone, opponentBattleZone);
  const cost = baseCost === 0 ? 0 : Math.max(baseCost, requiredCivs.length);

  if (baseCost === 0) {
    return [];
  }

  let fixedIndices: number[] = [];
  if (explicitManaIds && explicitManaIds.length > 0) {
    const idSet = new Set(explicitManaIds);
    for (let i = 0; i < manaZone.length; i++) {
      if (idSet.has(manaZone[i].instanceId)) {
        if (!isManaCardSpendable(manaZone[i])) return null;
        fixedIndices.push(i);
      }
    }
    if (fixedIndices.length !== explicitManaIds.length || fixedIndices.length !== cost) {
      return null;
    }
  } else {
    for (let i = 0; i < manaZone.length; i++) {
      if (manaZone[i].isTapped && manaZone[i].isStaged && !manaZone[i].isSpent) {
        fixedIndices.push(i);
      }
    }
    if (fixedIndices.length > cost) {
      return null;
    }
  }

  const fixedSet = new Set(fixedIndices);
  const pool: Array<{ m: ManaCardInstance; index: number; civs: Civilization[]; isFixed: boolean }> = [];
  const civSupply: Record<string, number> = {};

  for (let i = 0; i < manaZone.length; i++) {
    const m = manaZone[i];
    const isFixed = fixedSet.has(i);
    // If explicitManaIds provided or staged === cost, only fixed indices can be used
    const canInclude =
      isFixed ||
      (!explicitManaIds?.length && fixedIndices.length < cost && !m.isTapped);
    if (canInclude) {
      const civs = getCardCivilizations(m.card);
      pool.push({ m, index: i, civs, isFixed });
      for (const c of civs) {
        civSupply[c] = (civSupply[c] || 0) + 1;
      }
    }
  }

  if (pool.length < cost || cost < requiredCivs.length || pool.length < requiredCivs.length) {
    return null;
  }

  // Order required civs scarcest-first for fast pruning
  const sortedReqCivs = [...requiredCivs].sort(
    (a, b) => (civSupply[a] || 0) - (civSupply[b] || 0)
  );

  // Prefer fixed (staged) cards first, then mono-civ cards
  const orderedForCivSearch = [...pool].sort((a, b) => {
    if (a.isFixed !== b.isFixed) return a.isFixed ? -1 : 1;
    const aMulti = isMultiCivilization(a.m.card) ? 1 : 0;
    const bMulti = isMultiCivilization(b.m.card) ? 1 : 0;
    if (aMulti !== bMulti) return aMulti - bMulti;
    return a.index - b.index;
  });

  function search(civIndex: number, selectedIndices: number[]): number[] | null {
    if (civIndex === sortedReqCivs.length) {
      // Ensure every fixed card still fits inside total cost budget
      const unionCount = new Set([...fixedIndices, ...selectedIndices]).size;
      return unionCount <= cost ? selectedIndices : null;
    }

    const currentCiv = sortedReqCivs[civIndex];
    for (const item of orderedForCivSearch) {
      if (!selectedIndices.includes(item.index) && item.civs.includes(currentCiv)) {
        const nextSel = [...selectedIndices, item.index];
        const unionCount = new Set([...fixedIndices, ...nextSel]).size;
        if (unionCount <= cost) {
          const res = search(civIndex + 1, nextSel);
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

  // Combine fixed indices + civ-covering indices, then fill remainder with mono-civ abundant untapped
  const resultSet = new Set<number>([...fixedIndices, ...civCardIndices]);
  const remaining = pool
    .filter((u) => !resultSet.has(u.index))
    .sort((a, b) => {
      const aMulti = isMultiCivilization(a.m.card) ? 1 : 0;
      const bMulti = isMultiCivilization(b.m.card) ? 1 : 0;
      if (aMulti !== bMulti) return aMulti - bMulti;
      const aMaxSupply = Math.max(0, ...a.civs.map((c) => civSupply[c] || 0));
      const bMaxSupply = Math.max(0, ...b.civs.map((c) => civSupply[c] || 0));
      if (bMaxSupply !== aMaxSupply) return bMaxSupply - aMaxSupply;
      return a.index - b.index;
    });

  for (const item of remaining) {
    if (resultSet.size >= cost) break;
    resultSet.add(item.index);
  }

  const result = Array.from(resultSet);
  return result.length === cost ? result.sort((a, b) => a - b) : null;
}

/**
 * Validates whether the given card's mana cost can be paid using the mana zone.
 */
export function canPayManaCost(
  manaZone: ManaCardInstance[],
  card: CardDefinition,
  friendlyBattleZone: CreatureInstance[] = [],
  opponentBattleZone: CreatureInstance[] = [],
  explicitManaIds?: string[]
): boolean {
  return (
    findManaCardsToTap(manaZone, card, friendlyBattleZone, opponentBattleZone, explicitManaIds) !==
    null
  );
}

/**
 * Produces a descriptive error when staged manual mana selection fails to cover a card's cost/civilizations.
 */
export function getManaPaymentFailureReason(
  manaZone: ManaCardInstance[],
  card: CardDefinition,
  friendlyBattleZone: CreatureInstance[] = [],
  opponentBattleZone: CreatureInstance[] = []
): string {
  const requiredCivs = [...new Set(getCardCivilizations(card))];
  const cost = Math.max(
    getEffectiveManaCost(card, friendlyBattleZone, opponentBattleZone),
    requiredCivs.length
  );
  const staged = manaZone.filter((m) => m.isTapped && m.isStaged && !m.isSpent);
  if (staged.length > cost) {
    return `Too many mana cards tapped (${staged.length} staged for cost ${cost}). Untap excess mana cards first.`;
  }
  if (staged.length === cost) {
    return `${card.name} requires tapped mana matching all of its civilization(s): ${requiredCivs.join(' & ')}.`;
  }
  return `Cannot afford mana cost ${cost} (${requiredCivs.join('/')}) for ${card.name}.`;
}

/**
 * Commits and locks the required mana cards (`isTapped: true, isSpent: true`) to pay for a card.
 */
export function payManaCost(
  manaZone: ManaCardInstance[],
  card: CardDefinition,
  friendlyBattleZone: CreatureInstance[] = [],
  opponentBattleZone: CreatureInstance[] = [],
  explicitManaIds?: string[]
): { success: boolean; updatedManaZone: ManaCardInstance[] } {
  const indicesToTap = findManaCardsToTap(
    manaZone,
    card,
    friendlyBattleZone,
    opponentBattleZone,
    explicitManaIds
  );
  if (!indicesToTap) {
    return { success: false, updatedManaZone: manaZone };
  }

  const toTapSet = new Set(indicesToTap);
  const updatedManaZone = manaZone.map((m, index) =>
    toTapSet.has(index) ? { ...m, isTapped: true, isSpent: true, isStaged: false } : m
  );

  return {
    success: true,
    updatedManaZone
  };
}

export interface ManualManaValidation {
  valid: boolean;
  requiredCost: number;
  selectedCount: number;
  requiredCivs: Civilization[];
  satisfiedCivs: Civilization[];
  missingCivs: Civilization[];
  excessCount: number;
  reason?: string;
}

/**
 * Evaluates a player's current manual mana selection for summoning a creature or casting a spell.
 * Enforces exact mana count and distinct mana card coverage for each required civilization.
 */
export function validateManualManaSelection(
  manaZone: ManaCardInstance[],
  card: CardDefinition,
  selectedManaIds: string[],
  friendlyBattleZone: CreatureInstance[] = [],
  opponentBattleZone: CreatureInstance[] = []
): ManualManaValidation {
  const requiredCivs = [...new Set(getCardCivilizations(card))];
  const baseCost = getEffectiveManaCost(card, friendlyBattleZone, opponentBattleZone);
  const requiredCost = baseCost === 0 ? 0 : Math.max(baseCost, requiredCivs.length);

  const uniqueSelectedIds = Array.from(new Set(selectedManaIds));
  const selectedPool: Array<{ instanceId: string; civs: Civilization[] }> = [];
  for (const id of uniqueSelectedIds) {
    const found = manaZone.find((m) => m.instanceId === id);
    if (found && isManaCardSpendable(found)) {
      selectedPool.push({
        instanceId: found.instanceId,
        civs: getCardCivilizations(found.card)
      });
    }
  }

  // Maximum matching from requiredCivs -> distinct selected cards
  let bestMatched: Civilization[] = [];
  function searchMaxMatch(civIdx: number, usedIds: Set<string>, matched: Civilization[]): void {
    if (matched.length > bestMatched.length) {
      bestMatched = [...matched];
    }
    if (bestMatched.length === requiredCivs.length || civIdx >= requiredCivs.length) {
      return;
    }
    // Option A: match requiredCivs[civIdx] with an unused selected card
    const civ = requiredCivs[civIdx];
    for (const item of selectedPool) {
      if (!usedIds.has(item.instanceId) && item.civs.includes(civ)) {
        usedIds.add(item.instanceId);
        searchMaxMatch(civIdx + 1, usedIds, [...matched, civ]);
        usedIds.delete(item.instanceId);
      }
    }
    // Option B: skip this civ (try matching later civs instead)
    searchMaxMatch(civIdx + 1, usedIds, matched);
  }

  if (requiredCost > 0) {
    searchMaxMatch(0, new Set(), []);
  }

  const satisfiedCivs = requiredCost === 0 ? [...requiredCivs] : bestMatched;
  const satisfiedSet = new Set(satisfiedCivs);
  const missingCivs = requiredCost === 0 ? [] : requiredCivs.filter((c) => !satisfiedSet.has(c));

  const selectedCount = selectedPool.length;
  const excessCount = Math.max(0, selectedCount - requiredCost);
  const isExactPayment =
    requiredCost === 0 ||
    (selectedCount === requiredCost &&
      missingCivs.length === 0 &&
      canPayManaCost(
        manaZone,
        card,
        friendlyBattleZone,
        opponentBattleZone,
        selectedPool.map((p) => p.instanceId)
      ));

  let reason: string | undefined;
  if (!isExactPayment) {
    if (excessCount > 0) {
      reason = `Too many mana selected (${selectedCount}/${requiredCost}). Untap ${excessCount} mana card(s).`;
    } else if (selectedCount === requiredCost && missingCivs.length > 0) {
      reason = `Selected mana must cover all required civilizations: ${missingCivs.join(' & ')}.`;
    } else if (selectedCount < requiredCost) {
      const remaining = requiredCost - selectedCount;
      reason =
        missingCivs.length > 0
          ? `Select ${remaining} more mana card(s) (needs ${missingCivs.join(' & ')}).`
          : `Select ${remaining} more mana card(s).`;
    }
  }

  return {
    valid: isExactPayment,
    requiredCost,
    selectedCount,
    requiredCivs,
    satisfiedCivs,
    missingCivs,
    excessCount,
    reason
  };
}

/**
 * Toggles manual pre-tapping (`isStaged`) on unspent mana cards.
 * Rejects untapping mana cards that have already been spent or entered locked tapped this turn.
 */
export function toggleManaTap(
  state: GameState,
  player: PlayerId,
  cardInstanceId: string,
  forceTapped?: boolean
): GameState {
  const pState = state.players[player];
  const manaCard = pState.manaZone.find((m) => m.instanceId === cardInstanceId);
  if (!manaCard) return state;

  const nextTapped = forceTapped !== undefined ? forceTapped : !manaCard.isTapped;

  if (manaCard.isSpent && !nextTapped) {
    throw new Error(
      `${manaCard.card.name} has already been spent or locked tapped this turn and cannot be untapped until your next turn.`
    );
  }
  if (manaCard.isTapped && !manaCard.isStaged && !nextTapped && manaCard.isSpent !== false && !manaCard.isStaged) {
    // Backwards compatibility: manually created fixture cards in tests have isTapped:true with isSpent undefined;
    // only block untap when explicitly marked isSpent === true!
  }

  const nextManaZone = pState.manaZone.map((m) =>
    m.instanceId === cardInstanceId
      ? {
          ...m,
          isTapped: nextTapped,
          isStaged: nextTapped && !m.isSpent ? true : false
        }
      : m
  );

  return {
    ...state,
    players: {
      ...state.players,
      [player]: {
        ...pState,
        manaZone: nextManaZone
      }
    },
    actionLog: [
      ...state.actionLog,
      `${player} ${nextTapped ? 'tapped' : 'untapped'} ${manaCard.card.name} in mana zone.`
    ]
  };
}

/**
 * Charges a single card from the active player's hand into their mana zone:
 * - Max 1 card per turn.
 * - Multi-civilization cards enter the mana zone tapped.
 * - Mono-civilization cards enter untapped.
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
    throw new Error(
      `Cannot charge mana during ${state.phase} phase. Mana must be charged during MANA_CHARGE phase.`
    );
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
  const isMultiCiv = isMultiCivilization(cardToCharge.card);
  const manaCard = toManaCard(cardToCharge, isMultiCiv);

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
 * Undoes the mana charge action performed this turn during MANA_CHARGE phase.
 */
export function undoChargeMana(state: GameState, player: PlayerId): GameState {
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
