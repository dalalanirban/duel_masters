import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { initializeGame, createCardInstance, expandDeck } from '../state.ts';
import { CARD_LIST } from '../../data/cardLoader.ts';

describe('Duel Masters Engine: State & Initialization (Task 1)', () => {
  // Create two standard 40-card tournament decks using real cards from CARD_LIST
  const deck1 = {
    id: 'deck-shobu',
    name: 'Shobu Fire Beatdown',
    items: CARD_LIST.slice(0, 10).map((card) => ({ card, count: 4 })),
    updatedAt: Date.now()
  };

  const deck2 = {
    id: 'deck-kokujo',
    name: 'Kokujo Darkness Control',
    items: CARD_LIST.slice(10, 20).map((card) => ({ card, count: 4 })),
    updatedAt: Date.now()
  };

  it('createCardInstance generates unique card instances with owner and reference', () => {
    const cardDef = deck1.items[0].card;
    const inst1 = createCardInstance(cardDef, 'player');
    const inst2 = createCardInstance(cardDef, 'player');
    const instOpp = createCardInstance(cardDef, 'opponent');

    assert.ok(inst1.instanceId, 'instanceId should be defined');
    assert.ok(inst2.instanceId, 'instanceId should be defined');
    assert.notEqual(inst1.instanceId, inst2.instanceId, 'instance IDs should be unique');
    assert.equal(inst1.owner, 'player');
    assert.equal(instOpp.owner, 'opponent');
    assert.equal(inst1.card.id, cardDef.id);
  });

  it('expandDeck correctly multiplies cards according to counts', () => {
    const expanded = expandDeck(deck1);
    assert.equal(expanded.length, 40, 'Should expand 10 items * 4 count = 40 cards');
  });

  it('initializes a tournament-compliant Duel Masters game state', () => {
    const state = initializeGame(deck1, deck2, 'player');

    // Turn & Phase setup
    assert.equal(state.turn, 1, 'Starting turn should be 1');
    assert.equal(state.activePlayer, 'player', 'Active player should be player');
    assert.equal(state.phase, 'MANA_CHARGE', 'Turn 1 skips DRAW phase and starts in MANA_CHARGE');

    // Status & Logs
    assert.equal(state.winner, null, 'Game should have no winner at start');
    assert.equal(state.combatState, null, 'Combat state should be null at start');
    assert.equal(state.pendingInteraction, null, 'No pending interactions at start');
    assert.ok(state.actionLog.length > 0, 'Action log should record game start');

    // Both players zone counts
    for (const pid of ['player', 'opponent']) {
      const p = state.players[pid];
      assert.equal(p.shields.length, 5, `${pid} should start with exactly 5 shields`);
      assert.equal(p.hand.length, 5, `${pid} should start with exactly 5 cards in hand`);
      assert.equal(p.deck.length, 30, `${pid} should have 30 cards in deck (40 - 5 shields - 5 hand)`);
      assert.equal(p.manaZone.length, 0, `${pid} should start with 0 cards in mana zone`);
      assert.equal(p.battleZone.length, 0, `${pid} should start with 0 creatures in battle zone`);
      assert.equal(p.graveyard.length, 0, `${pid} should start with 0 cards in graveyard`);
      assert.equal(p.manaChargedThisTurn, false, `${pid} manaChargedThisTurn should be false`);

      // Shield properties
      p.shields.forEach((shield, idx) => {
        assert.ok(shield.id, `Shield ${idx} must have an ID`);
        assert.equal(shield.isBroken, false, `Shield ${idx} must not be broken initially`);
        assert.ok(shield.card, `Shield ${idx} must contain card definition`);
      });

      // Hand and deck ownership
      p.hand.forEach((cardInst) => {
        assert.equal(cardInst.owner, pid, `Hand card owner should match ${pid}`);
        assert.ok(cardInst.instanceId, 'Hand card must have instanceId');
        assert.ok(cardInst.card, 'Hand card must have card definition');
      });

      p.deck.forEach((cardInst) => {
        assert.equal(cardInst.owner, pid, `Deck card owner should match ${pid}`);
        assert.ok(cardInst.instanceId, 'Deck card must have instanceId');
        assert.ok(cardInst.card, 'Deck card must have card definition');
      });
    }
  });

  it('guarantees unique IDs across all card instances in the game', () => {
    const state = initializeGame(deck1, deck2, 'player');

    const allInstanceIds = new Set();
    const allShieldIds = new Set();

    for (const pid of ['player', 'opponent']) {
      const p = state.players[pid];

      for (const card of [...p.hand, ...p.deck]) {
        assert.equal(
          allInstanceIds.has(card.instanceId),
          false,
          `Duplicate instanceId detected: ${card.instanceId}`
        );
        allInstanceIds.add(card.instanceId);
      }

      for (const shield of p.shields) {
        assert.equal(
          allShieldIds.has(shield.id),
          false,
          `Duplicate shield ID detected: ${shield.id}`
        );
        allShieldIds.add(shield.id);
      }
    }

    assert.equal(allInstanceIds.size, 70, '35 cards per player (5 hand + 30 deck) = 70 card instances');
    assert.equal(allShieldIds.size, 10, '5 shields per player = 10 shields');
  });

  it('supports custom starting player (e.g. opponent starts first)', () => {
    const state = initializeGame(deck1, deck2, 'opponent');
    assert.equal(state.turn, 1);
    assert.equal(state.activePlayer, 'opponent');
    assert.equal(state.phase, 'MANA_CHARGE');
  });

  it('supports deterministic initialization with custom RNG or shuffle option', () => {
    let count = 0;
    const rng = () => {
      count += 0.05;
      return (count % 1);
    };

    const state1 = initializeGame(deck1, deck2, 'player', { rng });
    count = 0;
    const state2 = initializeGame(deck1, deck2, 'player', { rng });

    assert.equal(
      state1.players.player.shields[0].card.id,
      state2.players.player.shields[0].card.id,
      'Seeded RNG produces identical card distribution'
    );
  });

  it('throws an error if a deck has fewer than 10 cards to distribute shields and hand', () => {
    const invalidDeck = {
      id: 'invalid-deck',
      name: 'Invalid Deck',
      items: [{ card: deck1.items[0].card, count: 8 }],
      updatedAt: Date.now()
    };

    assert.throws(
      () => initializeGame(invalidDeck, deck2),
      /Deck must contain at least 10 cards/
    );
  });
});
