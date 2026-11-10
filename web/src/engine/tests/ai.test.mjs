import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeGame } from '../state.ts';
import { step } from '../reducer.ts';
import { getAiAction } from '../ai.ts';
import { CARD_LIST } from '../../data/cardLoader.ts';

function findCard(name) {
  const card = CARD_LIST.find((c) => c.name.toLowerCase() === name.toLowerCase());
  if (!card) throw new Error(`Card not found in cardLoader: ${name}`);
  return card;
}

function createTestDeck(id, name, card) {
  return {
    id,
    name,
    items: [{ card, count: 40 }],
    updatedAt: Date.now()
  };
}

test('AI Player Step Engine', async (t) => {
  const vorg = findCard('Immortal Baron, Vorg');
  const deck1 = createTestDeck('deck1', 'Fire Beatdown', vorg);
  const deck2 = createTestDeck('deck2', 'Fire Beatdown 2', vorg);

  await t.test('generates valid first turn action (charge mana) for AI', () => {
    const initialState = initializeGame(deck1, deck2, 'opponent', {
      shuffle: false
    });

    assert.equal(initialState.activePlayer, 'opponent');
    assert.equal(initialState.phase, 'MANA_CHARGE');

    const action = getAiAction(initialState, 'opponent');
    assert.ok(action, 'AI should propose an action');
    assert.equal(action.type, 'CHARGE_MANA');

    const nextState = step(initialState, action);
    assert.equal(nextState.players.opponent.manaZone.length, 1);
    assert.equal(nextState.players.opponent.manaChargedThisTurn, true);

    const passAction = getAiAction(nextState, 'opponent');
    assert.ok(passAction);
    assert.equal(passAction.type, 'PASS_PHASE');

    const mainState = step(nextState, passAction);
    assert.equal(mainState.phase, 'MAIN');
  });

  await t.test('can run multiple turns of AI self-play without errors', () => {
    let state = initializeGame(deck1, deck2, 'player', {
      shuffle: false
    });

    let moves = 0;
    while (state.winner === null && moves < 40) {
      const active = state.activePlayer;
      const action = getAiAction(state, active);
      if (!action) {
        break;
      }
      state = step(state, action);
      moves++;
    }

    assert.ok(moves > 5, 'AI should make multiple progressive moves');
  });
});
