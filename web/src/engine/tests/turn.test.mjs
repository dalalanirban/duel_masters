import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  chargeMana,
  canPayManaCost,
  payManaCost,
  getAvailableManaCount,
  getAvailableCivilizations
} from '../mana.ts';
import { startTurn, passToMainPhase, endTurn } from '../turn.ts';
import { initializeGame, createCardInstance } from '../state.ts';
import { CARD_LIST } from '../../data/cardLoader.ts';

describe('Duel Masters Engine: Turn Lifecycle & Mana Rules (Task 2)', () => {
  // Sample test decks
  const monoFireDeck = {
    id: 'deck-mono-fire',
    name: 'Mono Fire',
    items: CARD_LIST.filter((c) => c.civilizations.includes('Fire'))
      .slice(0, 10)
      .map((card) => ({ card, count: 4 })),
    updatedAt: Date.now()
  };

  const monoWaterDeck = {
    id: 'deck-mono-water',
    name: 'Mono Water',
    items: CARD_LIST.filter((c) => c.civilizations.includes('Water'))
      .slice(0, 10)
      .map((card) => ({ card, count: 4 })),
    updatedAt: Date.now()
  };

  // Explicit card fixtures with fixed mana costs for predictable testing
  const sampleFireCreature = {
    id: 'test-fire-2',
    name: 'Immortal Baron, Vorg',
    set: 'DM-01',
    collectorNumber: '1',
    civilizations: ['Fire'],
    type: 'Creature',
    manaCost: 2,
    manaNumber: 1,
    power: 2000,
    races: ['Human'],
    isShieldTrigger: false,
    isBlocker: false,
    isSlayer: false,
    isSpeedAttacker: false,
    powerAttackerBonus: 0,
    breakerCount: 1,
    rulesText: '',
    rarity: 'Common',
    imageAssetPath: null
  };

  const sampleWaterCreature = {
    id: 'test-water-3',
    name: 'Aqua Hulcus',
    set: 'DM-01',
    collectorNumber: '2',
    civilizations: ['Water'],
    type: 'Creature',
    manaCost: 3,
    manaNumber: 1,
    power: 2000,
    races: ['Liquid People'],
    isShieldTrigger: false,
    isBlocker: false,
    isSlayer: false,
    isSpeedAttacker: false,
    powerAttackerBonus: 0,
    breakerCount: 1,
    rulesText: '',
    rarity: 'Common',
    imageAssetPath: null
  };

  const sampleMultiCivCard = {
    id: 'mock-multi-1',
    name: 'Rainbow Flame Spark',
    set: 'DM-06',
    collectorNumber: '50',
    civilizations: ['Fire', 'Nature'],
    type: 'Spell',
    manaCost: 4,
    manaNumber: 1,
    power: null,
    races: [],
    isShieldTrigger: false,
    isBlocker: false,
    isSlayer: false,
    isSpeedAttacker: false,
    isMultiCiv: true,
    powerAttackerBonus: 0,
    breakerCount: 1,
    rulesText: 'Multi-civ test card',
    rarity: 'Rare',
    imageAssetPath: null
  };

  describe('Mana Zone Operations', () => {
    it('charging a mono-civ card puts it in mana zone untapped and removes it from hand', () => {
      const state = initializeGame(monoFireDeck, monoWaterDeck, 'player');
      const handCard = state.players.player.hand[0];

      const nextState = chargeMana(state, 'player', handCard.instanceId);

      assert.equal(nextState.players.player.hand.length, 4, 'Hand should have 4 cards after charge');
      assert.equal(nextState.players.player.manaZone.length, 1, 'Mana zone should have 1 card');
      assert.equal(nextState.players.player.manaZone[0].instanceId, handCard.instanceId);
      assert.equal(nextState.players.player.manaZone[0].isTapped, false, 'Mono-civ card must enter untapped');
      assert.equal(nextState.players.player.manaChargedThisTurn, true, 'manaChargedThisTurn flag set to true');
      // Original state immutability
      assert.equal(state.players.player.hand.length, 5, 'Original state hand untouched');
      assert.equal(state.players.player.manaZone.length, 0, 'Original state mana untouched');
    });

    it('charging a multi-civ card enters the mana zone tapped', () => {
      let state = initializeGame(monoFireDeck, monoWaterDeck, 'player');
      // Inject multi-civ card into hand
      const multiCardInst = createCardInstance(sampleMultiCivCard, 'player');
      state = {
        ...state,
        players: {
          ...state.players,
          player: {
            ...state.players.player,
            hand: [multiCardInst, ...state.players.player.hand]
          }
        }
      };

      const nextState = chargeMana(state, 'player', multiCardInst.instanceId);

      assert.equal(nextState.players.player.manaZone.length, 1);
      assert.equal(
        nextState.players.player.manaZone[0].isTapped,
        true,
        'Multi-civilization card MUST enter mana zone tapped'
      );
    });

    it('rejects a second mana charge in the same turn', () => {
      const state = initializeGame(monoFireDeck, monoWaterDeck, 'player');
      const card1 = state.players.player.hand[0];
      const card2 = state.players.player.hand[1];

      const stateAfterFirst = chargeMana(state, 'player', card1.instanceId);
      assert.throws(
        () => chargeMana(stateAfterFirst, 'player', card2.instanceId),
        /already charged mana/i
      );
    });

    it('rejects charging mana when it is not the player turn', () => {
      const state = initializeGame(monoFireDeck, monoWaterDeck, 'player');
      const oppCard = state.players.opponent.hand[0];

      assert.throws(
        () => chargeMana(state, 'opponent', oppCard.instanceId),
        /not opponent's turn/i
      );
    });

    it('rejects charging a card that is not in the player hand', () => {
      const state = initializeGame(monoFireDeck, monoWaterDeck, 'player');
      assert.throws(
        () => chargeMana(state, 'player', 'non-existent-instance-id'),
        /not found in player's hand/i
      );
    });
  });

  describe('Mana Availability & Cost Calculation', () => {
    it('getAvailableManaCount correctly counts only untapped mana cards', () => {
      const manaZone = [
        { instanceId: 'm1', card: sampleFireCreature, isTapped: false },
        { instanceId: 'm2', card: sampleFireCreature, isTapped: true },
        { instanceId: 'm3', card: sampleWaterCreature, isTapped: false }
      ];

      assert.equal(getAvailableManaCount(manaZone), 2);
    });

    it('getAvailableCivilizations collects civilizations from both tapped and untapped cards', () => {
      const manaZone = [
        { instanceId: 'm1', card: sampleFireCreature, isTapped: true },
        { instanceId: 'm2', card: sampleMultiCivCard, isTapped: true } // Fire + Nature
      ];

      const civs = getAvailableCivilizations(manaZone);
      assert.equal(civs.has('Fire'), true);
      assert.equal(civs.has('Nature'), true);
      assert.equal(civs.has('Water'), false);
    });

    it('canPayManaCost validates available count and civilization presence', () => {
      // 3 Fire mana cards available (all untapped)
      const fireManaZone = [
        { instanceId: 'm1', card: sampleFireCreature, isTapped: false },
        { instanceId: 'm2', card: sampleFireCreature, isTapped: false },
        { instanceId: 'm3', card: sampleFireCreature, isTapped: false }
      ];

      // 2-cost Fire card: sufficient mana (3 >= 2) and Fire present -> true
      assert.equal(canPayManaCost(fireManaZone, sampleFireCreature), true);

      // 3-cost Water card: sufficient mana count (3 >= 3) but Water civ missing -> false
      assert.equal(canPayManaCost(fireManaZone, sampleWaterCreature), false);

      // Card costing 4 Fire: insufficient count (3 < 4) -> false
      const highCostFire = { ...sampleFireCreature, manaCost: 4 };
      assert.equal(canPayManaCost(fireManaZone, highCostFire), false);
    });

    it('canPayManaCost rejects when civilization is only provided by a tapped card (must tap an untapped card of required civ)', () => {
      // 1 tapped Water card + 2 untapped Fire cards = 2 available mana count, but 0 untapped Water cards
      const mixedManaZone = [
        { instanceId: 'm1', card: sampleWaterCreature, isTapped: true },
        { instanceId: 'm2', card: sampleFireCreature, isTapped: false },
        { instanceId: 'm3', card: sampleFireCreature, isTapped: false }
      ];

      const lowCostWater = { ...sampleWaterCreature, manaCost: 2 };
      assert.equal(
        canPayManaCost(mixedManaZone, lowCostWater),
        false,
        'Cannot pay for Water card if the only Water card in mana zone is already tapped'
      );
    });

    it('payManaCost guarantees tapping the mana card matching the required civilization', () => {
      // Nature card first (untapped), Fire card second (untapped)
      const mixedManaZone = [
        { instanceId: 'm1', card: { ...sampleFireCreature, civilizations: ['Nature'] }, isTapped: false },
        { instanceId: 'm2', card: sampleFireCreature, isTapped: false }
      ];

      // Cost 1 Fire: MUST tap the Fire card (m2), NOT the Nature card (m1)
      const cost1Fire = { ...sampleFireCreature, manaCost: 1 };
      const result = payManaCost(mixedManaZone, cost1Fire);
      assert.equal(result.success, true);
      const m1 = result.updatedManaZone.find((m) => m.instanceId === 'm1');
      const m2 = result.updatedManaZone.find((m) => m.instanceId === 'm2');
      assert.equal(m1.isTapped, false, 'Nature card remains untapped');
      assert.equal(m2.isTapped, true, 'Fire card was tapped to satisfy Fire civilization requirement');
    });

    it('payManaCost taps the required number of cards and preserves existing tapped cards', () => {
      const manaZone = [
        { instanceId: 'm1', card: sampleFireCreature, isTapped: false },
        { instanceId: 'm2', card: sampleFireCreature, isTapped: true },
        { instanceId: 'm3', card: sampleFireCreature, isTapped: false },
        { instanceId: 'm4', card: sampleFireCreature, isTapped: false }
      ];

      // Cost 2 Fire: should tap 2 of the 3 untapped cards
      const result = payManaCost(manaZone, sampleFireCreature);
      assert.equal(result.success, true);
      const tappedCount = result.updatedManaZone.filter((m) => m.isTapped).length;
      assert.equal(tappedCount, 3, '1 previously tapped + 2 newly tapped = 3 tapped cards');
      // Original mana zone remains untouched
      assert.equal(manaZone.filter((m) => m.isTapped).length, 1);
    });

    it('payManaCost returns success: false if cost cannot be paid', () => {
      const manaZone = [
        { instanceId: 'm1', card: sampleFireCreature, isTapped: true }
      ];

      const result = payManaCost(manaZone, sampleFireCreature);
      assert.equal(result.success, false);
      assert.deepEqual(result.updatedManaZone, manaZone);
    });
  });

  describe('Turn Lifecycle & Phase Progression', () => {
    it('startTurn untaps active player mana and creatures while leaving opponent cards unchanged', () => {
      let state = initializeGame(monoFireDeck, monoWaterDeck, 'player');
      // Setup tapped mana and tapped creature for player
      state = {
        ...state,
        turn: 2,
        players: {
          ...state.players,
          player: {
            ...state.players.player,
            manaZone: [
              { instanceId: 'pm1', card: sampleFireCreature, isTapped: true },
              { instanceId: 'pm2', card: sampleFireCreature, isTapped: false }
            ],
            battleZone: [
              {
                instanceId: 'pc1',
                card: sampleFireCreature,
                owner: 'player',
                isTapped: true,
                summonedTurn: 1,
                powerModifier: 0
              }
            ],
            manaChargedThisTurn: true
          },
          opponent: {
            ...state.players.opponent,
            manaZone: [
              { instanceId: 'om1', card: sampleWaterCreature, isTapped: true }
            ],
            battleZone: [
              {
                instanceId: 'oc1',
                card: sampleWaterCreature,
                owner: 'opponent',
                isTapped: true,
                summonedTurn: 1,
                powerModifier: 0
              }
            ]
          }
        }
      };

      const nextState = startTurn(state);

      // Player cards should all be untapped
      assert.equal(nextState.players.player.manaZone[0].isTapped, false);
      assert.equal(nextState.players.player.manaZone[1].isTapped, false);
      assert.equal(nextState.players.player.battleZone[0].isTapped, false);
      assert.equal(nextState.players.player.manaChargedThisTurn, false, 'manaChargedThisTurn reset');

      // Opponent cards remain tapped
      assert.equal(nextState.players.opponent.manaZone[0].isTapped, true);
      assert.equal(nextState.players.opponent.battleZone[0].isTapped, true);

      // Phase should advance to MANA_CHARGE
      assert.equal(nextState.phase, 'MANA_CHARGE');
    });

    it('Turn 1 draw skip: Player 1 skips draw on Turn 1', () => {
      let state = initializeGame(monoFireDeck, monoWaterDeck, 'player');
      assert.equal(state.turn, 1);
      assert.equal(state.activePlayer, 'player');
      assert.equal(state.players.player.hand.length, 5);
      assert.equal(state.players.player.deck.length, 30);

      // Trigger startTurn for Player 1 on Turn 1
      const turn1State = startTurn(state);

      // No card drawn
      assert.equal(turn1State.players.player.hand.length, 5, 'Player 1 hand size unchanged');
      assert.equal(turn1State.players.player.deck.length, 30, 'Player 1 deck size unchanged');
      assert.equal(turn1State.phase, 'MANA_CHARGE');
    });

    it('Turn 1 draw: Player 2 draws a card on Turn 1 when Player 1 ends turn', () => {
      const state = initializeGame(monoFireDeck, monoWaterDeck, 'player');
      assert.equal(state.players.opponent.hand.length, 5);
      assert.equal(state.players.opponent.deck.length, 30);

      // Player 1 ends turn
      const p2TurnState = endTurn(state);

      // Now Player 2's turn
      assert.equal(p2TurnState.activePlayer, 'opponent');
      assert.equal(p2TurnState.turn, 1, 'Player 2 turn is still turn 1');
      assert.equal(p2TurnState.players.opponent.hand.length, 6, 'Player 2 draws 1 card on Turn 1');
      assert.equal(p2TurnState.players.opponent.deck.length, 29, 'Player 2 deck decreases by 1');
      assert.equal(p2TurnState.phase, 'MANA_CHARGE');
    });

    it('Player 1 draws a card on Turn 2 after Player 2 ends turn', () => {
      const state = initializeGame(monoFireDeck, monoWaterDeck, 'player');
      // Turn 1 P1 ends turn -> P2 Turn 1
      const p2State = endTurn(state);
      assert.equal(p2State.turn, 1);
      assert.equal(p2State.activePlayer, 'opponent');

      // P2 ends turn -> P1 Turn 2
      const p1Turn2State = endTurn(p2State);
      assert.equal(p1Turn2State.activePlayer, 'player');
      assert.equal(p1Turn2State.turn, 2, 'Turn increments to 2 for Player 1');
      assert.equal(p1Turn2State.players.player.hand.length, 6, 'Player 1 draws on Turn 2');
      assert.equal(p1Turn2State.players.player.deck.length, 29);
      assert.equal(p1Turn2State.phase, 'MANA_CHARGE');
    });

    it('Deck-out condition triggers immediate loss when drawing from an empty deck', () => {
      let state = initializeGame(monoFireDeck, monoWaterDeck, 'player');
      // Set player 2 deck to empty
      state = {
        ...state,
        players: {
          ...state.players,
          opponent: {
            ...state.players.opponent,
            deck: []
          }
        }
      };

      // Player 1 ends turn, handing over to Player 2 who must draw from empty deck
      const nextState = endTurn(state);

      assert.equal(nextState.winner, 'player', 'Player 1 wins because opponent decked out');
      assert.ok(
        nextState.actionLog.some((log) => /deck|deck-out|empty deck/i.test(log)),
        'Action log records deckout loss'
      );
    });

    it('passToMainPhase transitions phase from MANA_CHARGE to MAIN', () => {
      const state = initializeGame(monoFireDeck, monoWaterDeck, 'player');
      assert.equal(state.phase, 'MANA_CHARGE');

      const mainState = passToMainPhase(state);
      assert.equal(mainState.phase, 'MAIN');
      assert.ok(mainState.actionLog.some((log) => /MAIN phase/i.test(log)));
    });
  });
});
