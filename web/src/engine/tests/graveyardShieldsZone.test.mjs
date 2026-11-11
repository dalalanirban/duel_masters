import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { initializeGame, createCardInstance } from '../state.ts';
import { CARD_LIST } from '../../data/cardLoader.ts';
import { getAvailableCivilizations, getAvailableManaCount } from '../mana.ts';

describe('Duel Arena UI Support: Graveyard, Shields & Mana Zones', () => {
  const dummyDeck1 = {
    id: 'deck-1',
    name: 'Fire / Nature Deck',
    items: CARD_LIST.slice(0, 10).map((card) => ({ card, count: 4 })),
    updatedAt: Date.now()
  };

  const dummyDeck2 = {
    id: 'deck-2',
    name: 'Darkness Control',
    items: CARD_LIST.slice(10, 20).map((card) => ({ card, count: 4 })),
    updatedAt: Date.now()
  };

  it('correctly tracks shields integrity and broken state for ShieldsRow and ShieldsView', () => {
    const state = initializeGame(dummyDeck1, dummyDeck2, 'player');
    const playerShields = state.players.player.shields;

    assert.equal(playerShields.length, 5, 'Player should start with 5 shields');
    const unbrokenCount = playerShields.filter((s) => !s.isBroken).length;
    assert.equal(unbrokenCount, 5, 'All 5 shields should be unbroken initially');

    // Break 2 shields
    playerShields[0].isBroken = true;
    playerShields[2].isBroken = true;

    const remainingUnbroken = playerShields.filter((s) => !s.isBroken).length;
    assert.equal(remainingUnbroken, 3, 'Should have 3 unbroken shields remaining');
    assert.equal(playerShields[0].isBroken, true);
    assert.equal(playerShields[1].isBroken, false);
    assert.equal(playerShields[2].isBroken, true);
  });

  it('correctly retrieves top card of graveyard for mini thumbnail in ShieldsRow', () => {
    const state = initializeGame(dummyDeck1, dummyDeck2, 'player');
    const graveyard = state.players.player.graveyard;

    assert.equal(graveyard.length, 0, 'Graveyard should be empty initially');

    // Add cards into graveyard
    const card1 = createCardInstance(CARD_LIST[0], 'player');
    const card2 = createCardInstance(CARD_LIST[1], 'player');
    graveyard.push(card1);
    graveyard.push(card2);

    assert.equal(graveyard.length, 2);
    const topCard = graveyard[graveyard.length - 1];
    assert.equal(topCard.instanceId, card2.instanceId, 'Top card should be the latest card in graveyard');
    assert.equal(topCard.card.id, CARD_LIST[1].id);
  });

  it('correctly computes mana zone tapped ratio and civilizations for ManaZoneView', () => {
    const state = initializeGame(dummyDeck1, dummyDeck2, 'player');
    const playerMana = state.players.player.manaZone;

    // Simulate charging 3 cards to mana zone
    playerMana.push({
      instanceId: 'mana-1',
      card: CARD_LIST[0], // Fire
      isTapped: false
    });
    playerMana.push({
      instanceId: 'mana-2',
      card: CARD_LIST[1],
      isTapped: true
    });
    playerMana.push({
      instanceId: 'mana-3',
      card: CARD_LIST[2],
      isTapped: false
    });

    const untappedCount = playerMana.filter((m) => !m.isTapped).length;
    const totalCount = playerMana.length;
    assert.equal(totalCount, 3);
    assert.equal(untappedCount, 2);

    const availableCount = getAvailableManaCount(playerMana);
    assert.equal(availableCount, 2);

    const civs = getAvailableCivilizations(playerMana);
    assert.ok(civs.size > 0, 'Should detect civilizations in mana zone');
  });

  it('verifies deck count matches remaining deck cards in ShieldsRow', () => {
    const state = initializeGame(dummyDeck1, dummyDeck2, 'player');
    // 40 total cards - 5 shields - 5 initial hand = 30 in deck
    assert.equal(state.players.player.deck.length, 30);
    assert.equal(state.players.opponent.deck.length, 30);
  });
});
