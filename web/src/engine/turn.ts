import type { GameState, PlayerId, CreatureInstance } from './types';

/**
 * Handles the start-of-turn procedure for the active player:
 * 1. Untaps all cards in the active player's mana zone and battle zone.
 * 2. Resets active player's manaChargedThisTurn to false.
 * 3. Advances to DRAW phase and performs card draw:
 *    - Turn 1 Player 1 skips draw step.
 *    - Turn 1 Player 2 and all subsequent turns draw 1 card from deck.
 *    - If deck is empty when drawing, active player loses immediately (deck-out).
 * 4. Advances to MANA_CHARGE phase (unless game has already ended due to deck-out).
 */
export function startTurn(state: GameState): GameState {
  if (state.winner !== null) {
    return state;
  }

  const activeId = state.activePlayer;
  const opponentId: PlayerId = activeId === 'player' ? 'opponent' : 'player';
  const activePlayer = state.players[activeId];

  // 1. Untap step: Untap active player's mana zone and battle zone creatures
  const untappedManaZone = activePlayer.manaZone.map((card) => ({
    ...card,
    isTapped: false
  }));

  const untappedBattleZone = activePlayer.battleZone.map((creature) => ({
    ...creature,
    isTapped: false
  }));

  let newPlayerState = {
    ...activePlayer,
    manaZone: untappedManaZone,
    battleZone: untappedBattleZone,
    manaChargedThisTurn: false
  };

  const actionLogs = [
    ...state.actionLog,
    `Turn ${state.turn}: Start of ${activeId}'s turn. Untapped cards in mana and battle zones.`
  ];

  // 2. Draw step
  const isTurn1Player1 = state.turn === 1 && activeId === 'player';

  if (isTurn1Player1) {
    actionLogs.push(`Turn 1: ${activeId} skips the draw step.`);
  } else {
    // Check deck-out condition
    if (newPlayerState.deck.length === 0) {
      actionLogs.push(
        `${activeId} cannot draw from an empty deck! ${opponentId} wins the duel by deck-out.`
      );
      return {
        ...state,
        phase: 'DRAW',
        winner: opponentId,
        players: {
          ...state.players,
          [activeId]: newPlayerState
        },
        actionLog: actionLogs
      };
    }

    // Draw 1 card from deck to hand
    const [drawnCard, ...remainingDeck] = newPlayerState.deck;
    newPlayerState = {
      ...newPlayerState,
      deck: remainingDeck,
      hand: [...newPlayerState.hand, drawnCard]
    };
    actionLogs.push(`${activeId} drew a card.`);
  }

  // 3. Advance to MANA_CHARGE phase
  actionLogs.push(`${activeId} entered MANA_CHARGE phase.`);

  return {
    ...state,
    phase: 'MANA_CHARGE',
    players: {
      ...state.players,
      [activeId]: newPlayerState
    },
    actionLog: actionLogs
  };
}

/**
 * Transitions phase from MANA_CHARGE to MAIN phase.
 */
export function passToMainPhase(state: GameState): GameState {
  if (state.winner !== null) {
    return state;
  }

  return {
    ...state,
    phase: 'MAIN',
    actionLog: [...state.actionLog, `${state.activePlayer} entered MAIN phase.`]
  };
}

/**
 * Ends the active player's turn:
 * - Switches active player ('player' -> 'opponent' or 'opponent' -> 'player').
 * - Increments turn count when turn passes back to 'player'.
 * - Cleans up lingering combat/interaction states.
 * - Automatically invokes startTurn for the new active player.
 */
export function endTurn(state: GameState): GameState {
  if (state.winner !== null) {
    return state;
  }

  const activeId = state.activePlayer;
  const nextPlayer: PlayerId = activeId === 'player' ? 'opponent' : 'player';
  const nextTurn = activeId === 'opponent' ? state.turn + 1 : state.turn;

  // 1. End-of-turn untap triggers for active player's creatures (e.g. Urth, Purifying Elemental)
  const untapLogs: string[] = [];
  const updatedActiveBZ = state.players[activeId].battleZone.map((creature) => {
    const rules = creature.card.rulesText || '';
    if (
      creature.isTapped &&
      (/at the end of each of your turns.*untap this creature/i.test(rules) ||
        creature.card.name.toLowerCase().includes('urth'))
    ) {
      untapLogs.push(`${creature.card.name} untapped at the end of the turn.`);
      return { ...creature, isTapped: false };
    }
    return creature;
  });

  // 2. Reset temporary power attacker bonuses and power modifiers for all creatures in both battle zones
  const resetBZ = (bz: CreatureInstance[]) =>
    bz.map((c) => ({
      ...c,
      tempPowerAttackerBonus: 0,
      powerModifier: 0
    }));

  const intermediatePlayers = {
    ...state.players,
    [activeId]: {
      ...state.players[activeId],
      battleZone: resetBZ(updatedActiveBZ)
    },
    [nextPlayer]: {
      ...state.players[nextPlayer],
      battleZone: resetBZ(state.players[nextPlayer].battleZone)
    }
  };

  const intermediateState: GameState = {
    ...state,
    turn: nextTurn,
    activePlayer: nextPlayer,
    phase: 'END_OF_TURN',
    combatState: null,
    pendingInteraction: null,
    players: intermediatePlayers,
    actionLog: [
      ...state.actionLog,
      ...untapLogs,
      `${activeId} ended their turn.`
    ]
  };

  return startTurn(intermediateState);
}
