import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { initializeGame } from '../state.ts';
import { step } from '../reducer.ts';
import { chargeMana, undoChargeMana } from '../mana.ts';
import { canDeclareAttack } from '../combat.ts';
import { PRESET_DECKS } from '../../data/presets.ts';

describe('Mana Phase Rules, Undo Charge, and Attack Restrictions', () => {
  it('charges mana in MANA_CHARGE phase, and allows undoing back to hand', () => {
    let state = initializeGame(PRESET_DECKS[0], PRESET_DECKS[1], 'player');
    assert.equal(state.phase, 'MANA_CHARGE');
    assert.equal(state.players.player.manaChargedThisTurn, false);

    const initialHandCount = state.players.player.hand.length;
    const cardToCharge = state.players.player.hand[0];

    // Charge mana
    state = step(state, {
      type: 'CHARGE_MANA',
      player: 'player',
      cardInstanceId: cardToCharge.instanceId
    });

    assert.equal(state.players.player.manaZone.length, 1);
    assert.equal(state.players.player.hand.length, initialHandCount - 1);
    assert.equal(state.players.player.manaChargedThisTurn, true);

    // Cannot charge a second card
    assert.throws(() => {
      chargeMana(state, 'player', state.players.player.hand[0].instanceId);
    }, /already charged mana this turn/i);

    // Undo mana charge
    state = step(state, {
      type: 'UNDO_CHARGE_MANA',
      player: 'player'
    });

    assert.equal(state.players.player.manaZone.length, 0);
    assert.equal(state.players.player.hand.length, initialHandCount);
    assert.equal(state.players.player.manaChargedThisTurn, false);
    assert.equal(state.players.player.hand[initialHandCount - 1].instanceId, cardToCharge.instanceId);

    // Can charge again after undo!
    state = step(state, {
      type: 'CHARGE_MANA',
      player: 'player',
      cardInstanceId: cardToCharge.instanceId
    });
    assert.equal(state.players.player.manaZone.length, 1);
    assert.equal(state.players.player.manaChargedThisTurn, true);
  });

  it('forbids charging mana after passing to MAIN phase or summoning', () => {
    let state = initializeGame(PRESET_DECKS[0], PRESET_DECKS[1], 'player');
    assert.equal(state.phase, 'MANA_CHARGE');

    // Pass to main phase without charging
    state = step(state, {
      type: 'PASS_PHASE',
      player: 'player'
    });

    assert.equal(state.phase, 'MAIN');

    // Trying to charge mana in MAIN phase must be rejected
    assert.throws(() => {
      chargeMana(state, 'player', state.players.player.hand[0].instanceId);
    }, /Cannot charge mana during MAIN phase/i);
  });

  it('validates that creatures that cannot attack players cannot target shields or players', () => {
    const state = initializeGame(PRESET_DECKS[0], PRESET_DECKS[1], 'player');
    const attackerWithCantAttackPlayers = {
      instanceId: 'test-attacker-1',
      card: {
        id: 'DM01-009',
        name: 'La Ura Giga, Sky Guardian',
        civilizations: ['Light'],
        type: 'Creature',
        manaCost: 1,
        power: 2000,
        rulesText: 'Blocker (Whenever an opponent\'s creature attacks, you may tap this creature to stop the attack. Then the 2 creatures battle.)\nThis creature can\'t attack players.'
      },
      isTapped: false,
      turnSummoned: 0
    };

    const updatedState = {
      ...state,
      phase: 'MAIN',
      players: {
        ...state.players,
        player: {
          ...state.players.player,
          battleZone: [attackerWithCantAttackPlayers]
        }
      }
    };

    // Attempt to attack opponent shield index 0
    const attackShieldResult = canDeclareAttack(updatedState, 'test-attacker-1', {
      type: 'shield',
      index: 0
    });
    assert.equal(attackShieldResult.valid, false);
    assert.match(attackShieldResult.reason || '', /cannot attack players/i);

    // Attempt to attack opponent player directly
    const attackPlayerResult = canDeclareAttack(updatedState, 'test-attacker-1', {
      type: 'player'
    });
    assert.equal(attackPlayerResult.valid, false);
    assert.match(attackPlayerResult.reason || '', /cannot attack players/i);
  });
});
