import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { initializeGame, step, getAiAction } from '../index.ts';
import { PRESET_DECKS } from '../../data/presets.ts';

describe('Player Subagents: Base Decks Automated Match Simulation', () => {
  it('plays a full match between Player 1 (Shobu Beatdown) and Player 2 (Kokujo Control)', () => {
    const shobuDeck = PRESET_DECKS[0];
    const kokujoDeck = PRESET_DECKS[1];

    let state = initializeGame(shobuDeck, kokujoDeck, 'player');
    let moves = 0;

    while (state.winner === null && moves < 100) {
      const actor = state.pendingInteraction
        ? (state.pendingInteraction.type === 'BLOCK_DECLARATION'
            ? state.pendingInteraction.defendingPlayer
            : state.pendingInteraction.player)
        : state.activePlayer;

      const action = getAiAction(state, actor);
      if (!action) {
        if (state.phase === 'MANA_CHARGE' || state.phase === 'MAIN') {
          state = step(state, { type: 'PASS_PHASE', player: actor });
        } else {
          state = step(state, { type: 'END_TURN', player: actor });
        }
      } else {
        state = step(state, action);
      }
      moves++;
    }

    assert.ok(moves > 5, 'Match simulated multiple sequential actions');
    assert.ok(state.actionLog.length > 5, 'Action log recorded events');
  });

  it('plays a full match between Player 2 (Kokujo Control) and Player 3 (Hakuoh Stall)', () => {
    const kokujoDeck = PRESET_DECKS[1];
    const hakuohDeck = PRESET_DECKS[2];

    let state = initializeGame(kokujoDeck, hakuohDeck, 'player');
    let moves = 0;

    while (state.winner === null && moves < 100) {
      const actor = state.pendingInteraction
        ? (state.pendingInteraction.type === 'BLOCK_DECLARATION'
            ? state.pendingInteraction.defendingPlayer
            : state.pendingInteraction.player)
        : state.activePlayer;

      const action = getAiAction(state, actor);
      if (!action) {
        if (state.phase === 'MANA_CHARGE' || state.phase === 'MAIN') {
          state = step(state, { type: 'PASS_PHASE', player: actor });
        } else {
          state = step(state, { type: 'END_TURN', player: actor });
        }
      } else {
        state = step(state, action);
      }
      moves++;
    }

    assert.ok(moves > 5, 'Match simulated multiple sequential actions');
    assert.ok(state.actionLog.length > 5, 'Action log recorded events');
  });
});
