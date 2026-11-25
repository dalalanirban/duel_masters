import type { CardDefinition } from '../types/card.ts';
import type {
  CardInstance,
  CreatureInstance,
  GameState,
  PlayerId,
  ShieldInstance
} from './types.ts';
import {
  getCardCapabilities,
  getCardCivilizations,
  getOpponentId
} from './cardUtils.ts';
import { shuffleCards } from './state.ts';
import { toManaCard } from './mana.ts';
import { buildZoneOptions, enqueueInteraction } from './interactionHelpers.ts';
import {
  hasShieldBurnReplacement,
  isMadnessDiscardReplacement
} from './replacements.ts';

let zoneIdCounter = 0;

/**
 * Generates a collision-free ShieldInstance ID.
 */
export function makeShieldId(player: PlayerId, indexHint: number): string {
  return `shield-${player}-${indexHint}-${(++zoneIdCounter).toString(36)}-${Date.now().toString(36)}`;
}

/**
 * Finds a creature across both players' battle zones.
 */
export function findCreature(
  state: GameState,
  creatureId: string
): { creature: CreatureInstance; owner: PlayerId } | null {
  for (const pid of ['player', 'opponent'] as const) {
    const c = state.players[pid].battleZone.find((x) => x.instanceId === creatureId);
    if (c) {
      return { creature: c, owner: pid };
    }
  }
  return null;
}

/**
 * Draws `count` cards for `player`.
 * Triggers immediate deck-out loss if deck is empty when attempting to draw.
 */
export function drawCards(
  state: GameState,
  player: PlayerId,
  count: number
): GameState {
  if (Boolean(state.winner) || count <= 0) {
    return state;
  }

  const opponent = getOpponentId(player);
  let playerState = state.players[player];
  const actionLogs = [...state.actionLog];

  let drawnCount = 0;
  for (let i = 0; i < count; i++) {
    if (playerState.deck.length === 0) {
      actionLogs.push(
        `${player} cannot draw from an empty deck! ${opponent} wins the duel by deck-out.`
      );
      return {
        ...state,
        winner: opponent,
        players: {
          ...state.players,
          [player]: playerState
        },
        actionLog: actionLogs
      };
    }

    const [card, ...remainingDeck] = playerState.deck;
    playerState = {
      ...playerState,
      deck: remainingDeck,
      hand: [...playerState.hand, card]
    };
    drawnCount++;
  }

  actionLogs.push(`${player} drew ${drawnCount} card(s).`);

  return {
    ...state,
    players: {
      ...state.players,
      [player]: playerState
    },
    actionLog: actionLogs
  };
}

/**
 * Discards specific cards from `targetPlayer`'s hand (by instanceId), honoring Madness replacements.
 */
export function discardHandCardsByIndices(
  state: GameState,
  targetPlayer: PlayerId,
  indicesToDiscard: number[],
  reasonLabel: string = 'discarded'
): GameState {
  if (Boolean(state.winner) || indicesToDiscard.length === 0) {
    return state;
  }

  const pState = state.players[targetPlayer];
  const isOpponentTurn = state.activePlayer !== targetPlayer;
  const idxSet = new Set(indicesToDiscard);

  const remainingHand: CardInstance[] = [];
  const discarded: CardInstance[] = [];
  const madnessSummons: CreatureInstance[] = [];

  (pState.hand || []).forEach((card, idx) => {
    if (!idxSet.has(idx)) {
      remainingHand.push(card);
      return;
    }

    if (isMadnessDiscardReplacement(card.card, isOpponentTurn)) {
      madnessSummons.push({
        instanceId: card.instanceId,
        card: card.card,
        owner: targetPlayer,
        isTapped: false,
        summonedTurn: (state.turn ?? 1) - 1, // Summoned during opponent's turn -> ready on own upcoming turn
        powerModifier: 0
      });
    } else {
      discarded.push(card);
    }
  });

  const logs: string[] = [];
  if (discarded.length > 0) {
    logs.push(
      `${targetPlayer} ${reasonLabel} ${discarded.map((c) => c.card.name).join(', ')} from hand.`
    );
  }
  if (madnessSummons.length > 0) {
    logs.push(
      `${targetPlayer} put ${madnessSummons.map((c) => c.card.name).join(', ')} into the battle zone via Madness discard replacement!`
    );
  }

  return {
    ...state,
    players: {
      ...state.players,
      [targetPlayer]: {
        ...pState,
        hand: remainingHand,
        battleZone: [...(pState.battleZone || []), ...madnessSummons],
        graveyard: [...(pState.graveyard || []), ...discarded]
      }
    },
    actionLog: [...(state.actionLog || []), ...logs]
  };
}

/**
 * Randomly removes `count` card(s) from `targetPlayer`'s hand and moves them to graveyard,
 * triggering Madness replacements ("put into battle zone instead") when it is the opponent's turn.
 */
export function discardRandomHandCards(
  state: GameState,
  targetPlayer: PlayerId,
  count: number = 1
): GameState {
  if (Boolean(state.winner) || count <= 0) {
    return state;
  }

  const pState = state.players[targetPlayer];
  if (!pState.hand || pState.hand.length === 0) {
    return state;
  }

  const availableIndices = pState.hand.map((_, idx) => idx);
  const actualCount = Math.min(count, availableIndices.length);
  const chosenIndices: number[] = [];

  for (let i = 0; i < actualCount; i++) {
    const pickPos = Math.floor(Math.random() * availableIndices.length);
    chosenIndices.push(availableIndices.splice(pickPos, 1)[0]);
  }

  return discardHandCardsByIndices(state, targetPlayer, chosenIndices, 'discarded at random');
}

/**
 * Ramps the top `count` card(s) of `player`'s deck directly into their mana zone:
 * Multi-civ cards enter tapped (or all tapped if `forceTapped` is true, e.g. Mana Bonanza).
 */
export function rampTopDeckToManaZone(
  state: GameState,
  player: PlayerId,
  count: number = 1,
  forceTapped?: boolean
): GameState {
  if (Boolean(state.winner) || count <= 0) {
    return state;
  }

  let playerState = state.players[player];
  const actionLogs = [...(state.actionLog || [])];

  for (let i = 0; i < count; i++) {
    if (!playerState.deck || playerState.deck.length === 0) {
      actionLogs.push(
        `${player}'s deck is empty; no card could be placed in the mana zone.`
      );
      break;
    }

    const [topCard, ...remainingDeck] = playerState.deck;
    const manaCard = toManaCard(topCard, forceTapped);

    playerState = {
      ...playerState,
      deck: remainingDeck,
      manaZone: [...(playerState.manaZone || []), manaCard]
    };

    actionLogs.push(
      `${player} put ${topCard.card.name} from the top of the deck into the mana zone.`
    );
  }

  return {
    ...state,
    players: {
      ...state.players,
      [player]: playerState
    },
    actionLog: actionLogs
  };
}

/**
 * Adds the top `count` card(s) of `player`'s deck to their shields face-down.
 */
export function addShieldFromDeck(
  state: GameState,
  player: PlayerId,
  count: number = 1
): GameState {
  if (Boolean(state.winner) || count <= 0) {
    return state;
  }

  const playerState = state.players[player];
  if (!playerState.deck || playerState.deck.length === 0) {
    return {
      ...state,
      actionLog: [
        ...(state.actionLog || []),
        `${player}'s deck is empty; no shield could be added.`
      ]
    };
  }

  let nextDeck = [...playerState.deck];
  const newShields = [...playerState.shields];
  let addedCount = 0;

  for (let i = 0; i < count; i++) {
    if (nextDeck.length === 0) break;
    const [topCard, ...rest] = nextDeck;
    nextDeck = rest;
    const shieldId = makeShieldId(player, newShields.length);
    newShields.push({
      id: shieldId,
      shieldId,
      card: topCard.card,
      isBroken: false
    });
    addedCount++;
  }

  return {
    ...state,
    players: {
      ...state.players,
      [player]: {
        ...playerState,
        deck: nextDeck,
        shields: newShields
      }
    },
    actionLog: [
      ...state.actionLog,
      `${player} added ${addedCount} card(s) from the top of the deck to shields.`
    ]
  };
}

/**
 * Destroys `count` opponent shield(s) directly into their graveyard without triggering Shield Triggers.
 */
export function destroyOpponentShields(
  state: GameState,
  player: PlayerId,
  count: number = 1,
  targetShieldIds?: string[]
): GameState {
  const opponent = getOpponentId(player);
  const opponentState = state.players[opponent];
  const unbrokenShields = opponentState.shields.filter((s) => !s.isBroken);

  if (unbrokenShields.length === 0 || count <= 0) {
    return state;
  }

  let shieldsToDestroy: ShieldInstance[] = [];
  if (targetShieldIds && targetShieldIds.length > 0) {
    shieldsToDestroy = unbrokenShields
      .filter(
        (s) =>
          targetShieldIds.includes(s.id) ||
          (s.shieldId && targetShieldIds.includes(s.shieldId))
      )
      .slice(0, count);
  }

  if (shieldsToDestroy.length === 0) {
    shieldsToDestroy = unbrokenShields.slice(0, count);
  }

  const destroyIds = new Set(shieldsToDestroy.map((s) => s.id));
  const nextShields = opponentState.shields.filter((s) => !destroyIds.has(s.id));
  const graveCards: CardInstance[] = shieldsToDestroy.map((s) => ({
    instanceId: s.id,
    card: s.card,
    owner: opponent
  }));

  return {
    ...state,
    players: {
      ...state.players,
      [opponent]: {
        ...opponentState,
        shields: nextShields,
        graveyard: [...opponentState.graveyard, ...graveCards]
      }
    },
    actionLog: [
      ...state.actionLog,
      `${player} put ${shieldsToDestroy.length} of ${opponent}'s shield(s) into the graveyard.`
    ]
  };
}

export interface BreakShieldOptions {
  attacker?: CreatureInstance;
  targetIndices?: number[];
  targetShieldIds?: string[];
  suppressTriggers?: boolean;
  trackTurboRushAttackerId?: string;
  bypassKyuroroPrompt?: boolean;
  bypassShieldSacrificePrompt?: boolean;
}

/**
 * Canonical shield-breaking primitive used by combat, Silent Skills (Kejila, Venom Capsule),
 * Turbo Rush (Carbonite Scarab), Blocked triggers (Avalanche Giant, Splinterclaw Wasp, Spinning Totem),
 * and Spells (Miraculous Meltdown):
 * - Honors Shield Burn replacement (Bolmeteus Steel Dragon, Death Phoenix).
 * - Honors Kyuroro (defender chooses shields -> prefers ST shields).
 * - Honors Cryptic Totem (while tapped, opponent can't use Shield Triggers).
 * - Honors Fu Reil (blocks Darkness triggers) and Gigabolver (blocks Light triggers).
 * - Queues Shield Triggers without overwriting existing pending triggers.
 */
export function breakOpponentShields(
  state: GameState,
  player: PlayerId,
  count: number,
  targetShieldIdsOrOptions?: string[] | BreakShieldOptions
): GameState {
  const options: BreakShieldOptions = Array.isArray(targetShieldIdsOrOptions)
    ? { targetShieldIds: targetShieldIdsOrOptions }
    : targetShieldIdsOrOptions || {};

  const opponent = getOpponentId(player);
  const attackerPlayerState = state.players[player];
  const defendingPlayer = state.players[opponent];
  const unbrokenShields = defendingPlayer.shields.filter((s) => !s.isBroken);

  if (unbrokenShields.length === 0 || count <= 0) {
    return state;
  }

  // Pulsar Tree / Nastasha: "When one of your shields would be broken, you may destroy this creature instead."
  if (!options.bypassShieldSacrificePrompt && opponent === 'player' && state.interactiveHuman && !state.pendingInteraction) {
    const shieldSaver = (defendingPlayer.battleZone || []).find(
      (c) =>
        /when one of your shields would be broken, you may destroy this creature instead/i.test(
          c.card.rulesText || ''
        ) ||
        getCardCapabilities(c.card).nameLower.includes('pulsar tree') ||
        getCardCapabilities(c.card).nameLower.includes('nastasha')
    );
    if (shieldSaver) {
      return enqueueInteraction(state, {
        type: 'OPTIONAL_CHOICE',
        player: 'player',
        sourceCardId: shieldSaver.card.id,
        sourceInstanceId: shieldSaver.instanceId,
        abilityName: shieldSaver.card.name,
        effectType: 'SHIELD_SACRIFICE_REPLACEMENT',
        saverInstanceId: shieldSaver.instanceId,
        attackerId: options.attacker?.instanceId,
        shieldIndicesToBreak: unbrokenShields.slice(0, count).map((_, idx) => idx),
        prompt: `${shieldSaver.card.name}: One of your shields would be broken. Destroy ${shieldSaver.card.name} instead?`
      });
    }
  }

  let shieldsToBreak: ShieldInstance[] = [];

  // Kyuroro / Meloppe: Defender chooses shields instead of attacker -> interactive UI modal or ST sort for AI
  const defenderHasKyuroroOrMeloppe = (defendingPlayer.battleZone || []).some((c) => {
    const n = getCardCapabilities(c.card).nameLower;
    return n.includes('kyuroro') || n.includes('meloppe');
  });
  const attackerHasMeloppe = (attackerPlayerState.battleZone || []).some((c) =>
    getCardCapabilities(c.card).nameLower.includes('meloppe')
  );
  const defenderChoosesShield = defenderHasKyuroroOrMeloppe || attackerHasMeloppe;

  if (
    defenderChoosesShield &&
    !options.targetShieldIds?.length &&
    !options.bypassKyuroroPrompt &&
    opponent === 'player' &&
    state.interactiveHuman &&
    !state.pendingInteraction
  ) {
    const shieldOpts = buildZoneOptions(state, 'player', ['shields'], undefined, { hideCards: true });
    const pickCount = Math.min(count, shieldOpts.length);
    if (pickCount > 0) {
      return enqueueInteraction(state, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: options.attacker?.card.id || 'kyuroro',
        sourceCardName: defenderHasKyuroroOrMeloppe ? 'Kyuroro / Meloppe' : 'Meloppe',
        actionKind: 'OPPONENT_CHOOSE_SHIELD',
        prompt: `Choose ${pickCount} of your shield(s) to be broken:`,
        options: shieldOpts,
        minSelections: pickCount,
        maxSelections: pickCount,
        contextData: {
          attackerPlayer: player,
          attackerId: options.attacker?.instanceId
        }
      });
    }
  }

  if (defenderChoosesShield && !options.targetShieldIds?.length) {
    const sortedForDefender = [...unbrokenShields].sort(
      (a, b) => (b.card.isShieldTrigger ? 1 : 0) - (a.card.isShieldTrigger ? 1 : 0)
    );
    shieldsToBreak = sortedForDefender.slice(0, count);
  } else {
    if (options.targetShieldIds && options.targetShieldIds.length > 0) {
      shieldsToBreak = unbrokenShields
        .filter(
          (s) =>
            options.targetShieldIds!.includes(s.id) ||
            (s.shieldId && options.targetShieldIds!.includes(s.shieldId))
        )
        .slice(0, count);
    }

    if (options.targetIndices && options.targetIndices.length > 0 && shieldsToBreak.length < count) {
      for (const idx of options.targetIndices) {
        const s = defendingPlayer.shields[idx];
        if (s && !s.isBroken && !shieldsToBreak.some((x) => x.id === s.id)) {
          shieldsToBreak.push(s);
        }
      }
    }

    for (const s of unbrokenShields) {
      if (shieldsToBreak.length >= count) break;
      if (!shieldsToBreak.some((x) => x.id === s.id)) {
        shieldsToBreak.push(s);
      }
    }
  }

  if (shieldsToBreak.length === 0) {
    return state;
  }

  const breakIds = new Set(shieldsToBreak.map((s) => s.id));
  const nextShields = defendingPlayer.shields.filter((s) => !breakIds.has(s.id));
  const brokenCards: CardInstance[] = shieldsToBreak.map((s) => ({
    instanceId: s.id,
    card: s.card,
    owner: opponent
  }));

  let updatedBrokenList = attackerPlayerState.shieldsBrokenThisTurn || [];
  const trackerId = options.trackTurboRushAttackerId ?? options.attacker?.instanceId;
  if (trackerId && !updatedBrokenList.includes(trackerId)) {
    updatedBrokenList = [...updatedBrokenList, trackerId];
  }

  // Check Shield Burn replacement (Bolmeteus Steel Dragon / Death Phoenix)
  if (options.attacker && hasShieldBurnReplacement(options.attacker)) {
    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...attackerPlayerState,
          shieldsBrokenThisTurn: updatedBrokenList
        },
        [opponent]: {
          ...defendingPlayer,
          shields: nextShields,
          graveyard: [...defendingPlayer.graveyard, ...brokenCards]
        }
      },
      actionLog: [
        ...state.actionLog,
        `${options.attacker.card.name} burned ${shieldsToBreak.length} shield(s) into the graveyard: ${shieldsToBreak
          .map((s) => s.card.name)
          .join(', ')}.`
      ]
    };
  }

  const nextHand = [...(defendingPlayer.hand || []), ...brokenCards];

  const stateWithBrokenShields: GameState = {
    ...state,
    players: {
      ...state.players,
      [player]: {
        ...attackerPlayerState,
        shieldsBrokenThisTurn: updatedBrokenList
      },
      [opponent]: {
        ...defendingPlayer,
        shields: nextShields,
        hand: nextHand
      }
    },
    actionLog: [
      ...(state.actionLog || []),
      options.attacker
        ? `${options.attacker.card.name} broke ${shieldsToBreak.length} shield(s): ${shieldsToBreak
            .map((s) => s.card.name)
            .join(', ')}.`
        : `${player} broke ${shieldsToBreak.length} shield(s) of ${opponent}.`
    ]
  };

  if (options.suppressTriggers) {
    return stateWithBrokenShields;
  }

  // Check Cryptic Totem: while tapped on attacker's side, opponent cannot use shield triggers
  const hasTappedCrypticTotem = (attackerPlayerState.battleZone || []).some(
    (c) => c.isTapped && getCardCapabilities(c.card).nameLower.includes('cryptic totem')
  );
  if (hasTappedCrypticTotem) {
    return {
      ...stateWithBrokenShields,
      actionLog: [
        ...stateWithBrokenShields.actionLog,
        `Cryptic Totem prevented ${opponent} from using Shield Triggers!`
      ]
    };
  }

  // Check Fu Reil (blocks Darkness ST) & Gigabolver (blocks Light ST) across both battle zones
  const allBZ = [...(attackerPlayerState.battleZone || []), ...(defendingPlayer.battleZone || [])];
  const blockDarknessST = allBZ.some((c) => getCardCapabilities(c.card).nameLower.includes('fu reil'));
  const blockLightST = allBZ.some((c) => getCardCapabilities(c.card).nameLower.includes('gigabolver'));

  const triggerShields = shieldsToBreak.filter((s) => {
    if (!s.card.isShieldTrigger) return false;
    const civs = getCardCivilizations(s.card);
    if (blockDarknessST && civs.includes('Darkness')) return false;
    if (blockLightST && civs.includes('Light')) return false;
    return true;
  });

  if (triggerShields.length > 0) {
    const newTriggers = triggerShields.map((s) => ({
      shieldId: s.id,
      card: s.card
    }));
    const newShieldCards = brokenCards.filter((c) =>
      triggerShields.some((t) => t.id === c.instanceId)
    );

    const existing = stateWithBrokenShields.pendingInteraction;
    if (
      existing &&
      (existing.type === 'SHIELD_TRIGGER_RESOLUTION' || existing.type === 'SHIELD_TRIGGER_CHOICE') &&
      existing.player === opponent
    ) {
      return {
        ...stateWithBrokenShields,
        pendingInteraction: {
          ...existing,
          shieldCards: [...existing.shieldCards, ...newShieldCards],
          triggers: [...(existing.triggers || []), ...newTriggers]
        },
        actionLog: [
          ...stateWithBrokenShields.actionLog,
          `Shield Trigger(s) detected: ${triggerShields.map((s) => s.card.name).join(', ')}!`
        ]
      };
    }

    return {
      ...stateWithBrokenShields,
      pendingInteraction: {
        type: 'SHIELD_TRIGGER_RESOLUTION',
        player: opponent,
        shieldCards: newShieldCards,
        triggers: newTriggers
      },
      actionLog: [
        ...stateWithBrokenShields.actionLog,
        `Shield Trigger(s) detected: ${triggerShields.map((s) => s.card.name).join(', ')}!`
      ]
    };
  }

  return stateWithBrokenShields;
}

/**
 * Searches the player's deck for a matching card and moves it to destination (`hand` | `manaZone` | `shields`),
 * optionally shuffling afterwards (default true unless specified).
 */
export function searchDeckForCard(
  state: GameState,
  player: PlayerId,
  filterFn: (c: CardDefinition) => boolean,
  destination: 'hand' | 'manaZone' | 'shields',
  options?: {
    shuffleAfter?: boolean;
    specificInstanceId?: string;
    preferHighestPower?: boolean;
  }
): GameState {
  if (Boolean(state.winner)) {
    return state;
  }

  const playerState = state.players[player];
  let cardIndex = -1;

  if (options?.specificInstanceId) {
    cardIndex = playerState.deck.findIndex(
      (ci) => ci.instanceId === options.specificInstanceId && filterFn(ci.card)
    );
  }

  if (cardIndex === -1 && options?.preferHighestPower) {
    const matches = playerState.deck
      .map((ci, idx) => ({ ci, idx }))
      .filter((x) => filterFn(x.ci.card));
    if (matches.length > 0) {
      matches.sort((a, b) => (b.ci.card.power ?? 0) - (a.ci.card.power ?? 0));
      cardIndex = matches[0].idx;
    }
  }

  if (cardIndex === -1) {
    cardIndex = playerState.deck.findIndex((ci) => filterFn(ci.card));
  }

  if (cardIndex === -1) {
    const shuffledDeck =
      options?.shuffleAfter && playerState.deck.length > 1
        ? shuffleCards(playerState.deck)
        : playerState.deck;
    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...playerState,
          deck: shuffledDeck
        }
      },
      actionLog: [
        ...state.actionLog,
        `${player} searched deck but found no matching card.`
      ]
    };
  }

  const targetCard = playerState.deck[cardIndex];
  const remainingDeck = playerState.deck.filter((_, idx) => idx !== cardIndex);
  const nextDeck =
    options?.shuffleAfter && remainingDeck.length > 1
      ? shuffleCards(remainingDeck)
      : remainingDeck;

  if (destination === 'hand') {
    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...playerState,
          deck: nextDeck,
          hand: [...playerState.hand, targetCard]
        }
      },
      actionLog: [
        ...state.actionLog,
        `${player} searched deck and put ${targetCard.card.name} into hand.`
      ]
    };
  }

  if (destination === 'manaZone') {
    const manaCard = toManaCard(targetCard);
    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...playerState,
          deck: nextDeck,
          manaZone: [...playerState.manaZone, manaCard]
        }
      },
      actionLog: [
        ...state.actionLog,
        `${player} searched deck and put ${targetCard.card.name} into mana zone.`
      ]
    };
  }

  const shieldId = makeShieldId(player, playerState.shields.length);
  const shield: ShieldInstance = {
    id: shieldId,
    shieldId,
    card: targetCard.card,
    isBroken: false
  };

  return {
    ...state,
    players: {
      ...state.players,
      [player]: {
        ...playerState,
        deck: nextDeck,
        shields: [...playerState.shields, shield]
      }
    },
    actionLog: [
      ...state.actionLog,
      `${player} searched deck and added ${targetCard.card.name} to shields.`
    ]
  };
}

/**
 * Searches the player's graveyard for the matching card and salvages it to `hand` or `battleZone`.
 */
export function salvageFromGraveyard(
  state: GameState,
  player: PlayerId,
  filterFn: (c: CardDefinition) => boolean,
  destination: 'hand' | 'battleZone',
  options?: { specificInstanceId?: string; pickMostRecent?: boolean }
): GameState {
  if (Boolean(state.winner)) {
    return state;
  }

  const playerState = state.players[player];
  let cardIndex = -1;

  if (options?.specificInstanceId) {
    cardIndex = playerState.graveyard.findIndex(
      (ci) => ci.instanceId === options.specificInstanceId && filterFn(ci.card)
    );
  }

  if (cardIndex === -1 && options?.pickMostRecent) {
    for (let i = playerState.graveyard.length - 1; i >= 0; i--) {
      if (filterFn(playerState.graveyard[i].card)) {
        cardIndex = i;
        break;
      }
    }
  }

  if (cardIndex === -1) {
    cardIndex = playerState.graveyard.findIndex((ci) => filterFn(ci.card));
  }

  if (cardIndex === -1) {
    return {
      ...state,
      actionLog: [
        ...state.actionLog,
        `${player} searched graveyard but found no matching card.`
      ]
    };
  }

  const targetCard = playerState.graveyard[cardIndex];
  const nextGraveyard = playerState.graveyard.filter((_, idx) => idx !== cardIndex);

  if (destination === 'hand') {
    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...playerState,
          graveyard: nextGraveyard,
          hand: [...playerState.hand, targetCard]
        }
      },
      actionLog: [
        ...state.actionLog,
        `${player} salvaged ${targetCard.card.name} from graveyard to hand.`
      ]
    };
  }

  const creature: CreatureInstance = {
    instanceId: targetCard.instanceId,
    card: targetCard.card,
    owner: player,
    isTapped: false,
    summonedTurn: state.turn,
    powerModifier: 0
  };

  return {
    ...state,
    players: {
      ...state.players,
      [player]: {
        ...playerState,
        graveyard: nextGraveyard,
        battleZone: [...playerState.battleZone, creature]
      }
    },
    actionLog: [
      ...state.actionLog,
      `${player} salvaged ${targetCard.card.name} from graveyard to battle zone.`
    ]
  };
}
