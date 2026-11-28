import type { GameState, PlayerId } from './types.ts';
import { getCardCapabilities, getOpponentId } from './cardUtils.ts';
import { autoResolveAiSilentSkillsDetailed, hasSilentSkill } from './advancedMechanics.ts';
import { enqueueInteraction } from './interactionHelpers.ts';
import { triggerEndTurn } from './triggers.ts';

function performStartTurnUntapAndDraw(
  preState: GameState,
  keptTappedIds: Set<string>
): GameState {
  const activeId = preState.activePlayer;
  const opponentId: PlayerId = getOpponentId(activeId);
  const curActivePlayer = preState.players[activeId];

  // Check Terradragon Cusdalf ("You can't untap the cards in your mana zone at the start of each of your turns.")
  const hasCusdalf = curActivePlayer.battleZone.some((c) =>
    getCardCapabilities(c.card).nameLower.includes('cusdalf')
  );
  // Check Warped Lunatron ("Creatures in the battle zone don't untap at the start of each player's turn.")
  const hasWarpedLunatron = [
    ...preState.players.player.battleZone,
    ...preState.players.opponent.battleZone
  ].some((c) => getCardCapabilities(c.card).nameLower.includes('warped lunatron'));

  const untappedManaZone = curActivePlayer.manaZone.map((card) =>
    hasCusdalf
      ? { ...card, isStaged: false, isSpent: card.isTapped ? (card.isSpent ?? true) : false }
      : { ...card, isTapped: false, isSpent: false, isStaged: false }
  );

  const untappedBattleZone = curActivePlayer.battleZone.map((creature) => {
    if (keptTappedIds.has(creature.instanceId) || hasWarpedLunatron) {
      return creature;
    }
    return {
      ...creature,
      isTapped: false
    };
  });

  let newPlayerState = {
    ...curActivePlayer,
    manaZone: untappedManaZone,
    battleZone: untappedBattleZone,
    manaChargedThisTurn: false,
    spellsCastThisTurn: 0,
    cardsDrawnThisTurn: 0
  };

  const actionLogs = [...preState.actionLog];
  if (hasCusdalf) {
    actionLogs.push(
      `Turn ${preState.turn}: Terradragon Cusdalf prevented ${activeId}'s mana zone from untapping.`
    );
  } else {
    actionLogs.push(`Turn ${preState.turn}: Start of ${activeId}'s turn. Untapped cards cleanly.`);
  }
  if (hasWarpedLunatron) {
    actionLogs.push(`Warped Lunatron prevented battle zone creatures from untapping.`);
  }

  // 2. Draw step (respecting startingPlayer on Turn 1)
  const startingPlayer = preState.startingPlayer || 'player';
  const isTurn1StartingPlayer = preState.turn === 1 && activeId === startingPlayer;

  if (isTurn1StartingPlayer) {
    actionLogs.push(`Turn 1: ${activeId} skips the draw step.`);
  } else {
    if (newPlayerState.deck.length === 0) {
      actionLogs.push(
        `${activeId} cannot draw from an empty deck! ${opponentId} wins the duel by deck-out.`
      );
      return {
        ...preState,
        phase: 'DRAW',
        winner: opponentId,
        pendingKeptSilentIds: undefined,
        players: {
          ...preState.players,
          [activeId]: newPlayerState
        },
        actionLog: actionLogs
      };
    }

    const [drawnCard, ...remainingDeck] = newPlayerState.deck;
    newPlayerState = {
      ...newPlayerState,
      deck: remainingDeck,
      hand: [...newPlayerState.hand, drawnCard],
      cardsDrawnThisTurn: (newPlayerState.cardsDrawnThisTurn || 0) + 1
    };
    actionLogs.push(`${activeId} drew a card.`);
  }

  // 3. Advance to MANA_CHARGE phase (always spreading preState so Silent Skill changes persist!)
  actionLogs.push(`${activeId} entered MANA_CHARGE phase.`);

  return {
    ...preState,
    phase: 'MANA_CHARGE',
    pendingKeptSilentIds: undefined,
    players: {
      ...preState.players,
      [activeId]: newPlayerState
    },
    actionLog: actionLogs
  };
}

/**
 * Completes the human start-of-turn untap and draw steps after all Silent Skill choices are made.
 */
export function completeHumanSilentSkills(
  state: GameState,
  keptTappedIdsList: string[]
): GameState {
  if (Boolean(state.winner)) return state;
  return performStartTurnUntapAndDraw(state, new Set(keptTappedIdsList));
}

/**
 * Handles the start-of-turn procedure for the active player:
 * 1. Expires any "until the start of your next turn" player modifiers cast by this player on their prior turn.
 * 2. Evaluates AI Silent Skills OR prompts human player for Silent Skill choices before untapping.
 * 3. Untaps mana zone (unless Terradragon Cusdalf blocks it) & BZ creatures (unless kept / Warped Lunatron).
 * 4. Advances to DRAW -> MANA_CHARGE phase.
 */
export function startTurn(state: GameState): GameState {
  if (Boolean(state.winner)) {
    return state;
  }

  const activeId = state.activePlayer;

  const clearTurnPlayerFlags = (p: GameState['players'][PlayerId]) => ({
    ...p,
    tempForceAllAttacksUntilNextTurn:
      p.tempForceAllAttacksGrantedBy === activeId
        ? undefined
        : p.tempForceAllAttacksGrantedBy
        ? p.tempForceAllAttacksUntilNextTurn
        : undefined,
    tempForceAllAttacksGrantedBy:
      p.tempForceAllAttacksGrantedBy === activeId ? undefined : p.tempForceAllAttacksGrantedBy,
    battleZone: p.battleZone.map((c) =>
      c.tempAttacksIfAbleUntilTurnOf === activeId
        ? { ...c, tempAttacksIfAble: undefined, tempAttacksIfAbleUntilTurnOf: undefined }
        : c
    )
  });

  const activeCleared = clearTurnPlayerFlags(state.players[activeId]);
  const oppId = getOpponentId(activeId);
  const oppCleared = clearTurnPlayerFlags(state.players[oppId]);

  // 0. Clear "until the start of your next turn" modifiers created on this player's previous turn
  let preState: GameState = {
    ...state,
    pendingKeptSilentIds: undefined,
    players: {
      ...state.players,
      [activeId]: {
        ...activeCleared,
        tempAllBlockersUntilNextTurn: undefined,
        tempRaceBlockersUntilNextTurn: undefined,
        tempProtectedFromAttackCivs: undefined,
        tempForceAllAttacksUntilNextTurn: activeCleared.tempForceAllAttacksGrantedBy
          ? activeCleared.tempForceAllAttacksUntilNextTurn
          : undefined
      },
      [oppId]: oppCleared
    }
  };

  // 0b. Evaluate Silent Skills before the untap step
  let keptTappedIds = new Set<string>();
  if (activeId === 'opponent') {
    const silentRes = autoResolveAiSilentSkillsDetailed(preState, activeId);
    preState = silentRes.state;
    keptTappedIds = silentRes.keptTappedIds;
    if (Boolean(preState.winner)) {
      return preState;
    }
  } else if (activeId === 'player' && preState.interactiveHuman) {
    const silentCandidates = preState.players.player.battleZone.filter(
      (c) => c.isTapped && hasSilentSkill(c.card)
    );
    if (silentCandidates.length > 0) {
      const [first, ...rest] = silentCandidates;
      return enqueueInteraction(
        {
          ...preState,
          phase: 'START_OF_TURN',
          pendingKeptSilentIds: []
        },
        {
          type: 'SILENT_SKILL_CHOICE',
          player: 'player',
          creatureInstanceId: first.instanceId,
          card: first.card,
          remainingCreatureIds: rest.map((c) => c.instanceId),
          keptTappedIds: []
        }
      );
    }
  }

  return performStartTurnUntapAndDraw(preState, keptTappedIds);
}

/**
 * Transitions phase from MANA_CHARGE to MAIN phase.
 */
export function passToMainPhase(state: GameState): GameState {
  if (Boolean(state.winner)) {
    return state;
  }

  return {
    ...state,
    phase: 'MAIN',
    actionLog: [...state.actionLog, `${state.activePlayer} entered MAIN phase.`]
  };
}

/**
 * Completes the turn handoff and calls `startTurn` for the next player after EOT triggers finish.
 */
export function finalizeEndTurn(afterEotState: GameState): GameState {
  if (Boolean(afterEotState.winner)) {
    return afterEotState;
  }

  const activeId = afterEotState.activePlayer;
  const startingPlayer = afterEotState.startingPlayer || 'player';
  const opponentId = getOpponentId(activeId);

  if (afterEotState.loseAtEndOfTurn === activeId) {
    return {
      ...afterEotState,
      combatState: null,
      pendingInteraction: null,
      pendingTriggerQueue: undefined,
      loseAtEndOfTurn: undefined,
      winner: opponentId,
      actionLog: [
        ...afterEotState.actionLog,
        `${activeId} lost the game at the end of the extra turn (Bombazar, Dragon of Destiny).`
      ]
    };
  }

  const grantedExtraTurn = afterEotState.extraTurnPlayer;
  const nextPlayer: PlayerId = grantedExtraTurn || opponentId;
  const nextTurn =
    grantedExtraTurn
      ? afterEotState.turn + 1
      : nextPlayer === startingPlayer
      ? afterEotState.turn + 1
      : afterEotState.turn;
  const nextLoseAtEnd =
    grantedExtraTurn && afterEotState.pendingBombazarLossFor === grantedExtraTurn
      ? grantedExtraTurn
      : undefined;

  const intermediatePlayers = {
    ...afterEotState.players,
    [activeId]: {
      ...afterEotState.players[activeId],
      shieldsBrokenThisTurn: [],
      spellsCastThisTurn: 0,
      cardsDrawnThisTurn: 0
    },
    [opponentId]: {
      ...afterEotState.players[opponentId],
      shieldsBrokenThisTurn: [],
      spellsCastThisTurn: 0,
      cardsDrawnThisTurn: 0
    }
  };

  const extraTurnLogs = grantedExtraTurn
    ? [`${nextPlayer} takes an extra turn!`]
    : [];

  const intermediateState: GameState = {
    ...afterEotState,
    turn: nextTurn,
    activePlayer: nextPlayer,
    phase: 'END_OF_TURN',
    combatState: null,
    pendingInteraction: null,
    pendingTriggerQueue: undefined,
    extraTurnPlayer: undefined,
    pendingBombazarLossFor: nextLoseAtEnd ? undefined : afterEotState.pendingBombazarLossFor,
    loseAtEndOfTurn: nextLoseAtEnd ?? afterEotState.loseAtEndOfTurn,
    players: intermediatePlayers,
    actionLog: [...afterEotState.actionLog, `${activeId} ended their turn.`, ...extraTurnLogs]
  };

  return startTurn(intermediateState);
}

/**
 * Ends the active player's turn:
 * - Fires all end-of-turn triggers & temporary cleanup via `triggers.triggerEndTurn`.
 * - If an interactive EOT Untap choice was raised for player, defers `finalizeEndTurn` until answered.
 */
export function endTurn(state: GameState): GameState {
  if (Boolean(state.winner)) {
    return state;
  }

  const activeId = state.activePlayer;
  const afterEotState = triggerEndTurn(state, activeId);
  if (Boolean(afterEotState.winner)) {
    return afterEotState;
  }

  if (
    afterEotState.pendingInteraction?.type === 'OPTIONAL_CHOICE' &&
    afterEotState.pendingInteraction.effectType === 'UNTAP_ALL_EOT'
  ) {
    return {
      ...afterEotState,
      pendingInteraction: {
        ...afterEotState.pendingInteraction,
        followUpAction: { kind: 'COMPLETE_END_TURN' }
      }
    };
  }

  return finalizeEndTurn(afterEotState);
}
