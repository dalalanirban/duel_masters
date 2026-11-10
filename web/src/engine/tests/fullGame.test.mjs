import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  initializeGame,
  step,
  createCardInstance
} from '../index.ts';
import { CARD_LIST } from '../../data/cardLoader.ts';

function findCard(name) {
  const card = CARD_LIST.find((c) => c.name.toLowerCase() === name.toLowerCase());
  if (!card) throw new Error(`Card not found in card database: ${name}`);
  return card;
}

function createDeck(id, name, cards) {
  return {
    id,
    name,
    items: cards.map((card) => ({ card, count: 1 })),
    updatedAt: Date.now()
  };
}

describe('Duel Masters Engine: Master Reducer & Full Game Simulation (Task 5)', () => {
  const vorg = findCard('Immortal Baron, Vorg'); // Fire creature, cost 2, power 2000, Human
  const valdios = findCard('Armored Blaster Valdios'); // Fire evo creature, cost 4, power 6000, Human bait, Double Breaker
  const bombat = findCard('Bombat, General of Speed'); // Fire creature, cost 5, power 3000, Speed Attacker
  const squito = findCard('Bloody Squito'); // Darkness creature, cost 2, power 4000, Blocker
  const terrorPit = findCard('Terror Pit'); // Darkness spell, cost 6, Shield Trigger
  const spiralGate = findCard('Spiral Gate'); // Water spell, cost 2, bounce creature
  const aquaHulcus = findCard('Aqua Hulcus'); // Water creature, cost 3, draw 1

  describe('Master Reducer (step) Action Dispatching & Mechanics', () => {
    it('dispatches CHARGE_MANA, updating mana zone and hand', () => {
      const deck = createDeck('test-d1', 'Test', Array(40).fill(vorg));
      let state = initializeGame(deck, deck, 'player', { shuffle: false });

      const handCardId = state.players.player.hand[0].instanceId;
      state = step(state, {
        type: 'CHARGE_MANA',
        player: 'player',
        cardInstanceId: handCardId
      });

      assert.equal(state.players.player.manaZone.length, 1);
      assert.equal(state.players.player.manaZone[0].instanceId, handCardId);
      assert.equal(state.players.player.hand.length, 4);
      assert.equal(state.players.player.manaChargedThisTurn, true);
    });

    it('dispatches SUMMON_CREATURE, paying mana and placing creature in battle zone', () => {
      const deck = createDeck('test-d2', 'Test', Array(40).fill(vorg));
      let state = initializeGame(deck, deck, 'player', { shuffle: false });

      // Charge 2 mana across 2 turns to afford Vorg (cost 2)
      state = step(state, { type: 'CHARGE_MANA', cardInstanceId: state.players.player.hand[0].instanceId });
      state = step(state, { type: 'END_TURN' }); // P2 turn
      state = step(state, { type: 'END_TURN' }); // P1 turn 2

      state = step(state, { type: 'CHARGE_MANA', cardInstanceId: state.players.player.hand[0].instanceId });
      assert.equal(state.players.player.manaZone.length, 2);

      const summonCardId = state.players.player.hand[0].instanceId;
      state = step(state, {
        type: 'SUMMON_CREATURE',
        player: 'player',
        cardInstanceId: summonCardId
      });

      assert.equal(state.players.player.battleZone.length, 1);
      assert.equal(state.players.player.battleZone[0].card.name, 'Immortal Baron, Vorg');
      assert.equal(state.players.player.manaZone.filter((m) => m.isTapped).length, 2);
      assert.equal(state.phase, 'MAIN');
    });

    it('dispatches CAST_SPELL, resolving spell effect and placing non-charger into graveyard', () => {
      const cards = [
        ...Array(5).fill(vorg), // Shields
        spiralGate, vorg, vorg, vorg, vorg, // Hand
        ...Array(30).fill(vorg)
      ];
      const deck = createDeck('test-spell-d', 'Spell Deck', cards);
      let state = initializeGame(deck, deck, 'player', { shuffle: false });

      // Put opponent creature in battle zone to target with Spiral Gate
      state = {
        ...state,
        turn: 2,
        players: {
          ...state.players,
          player: {
            ...state.players.player,
            manaZone: [
              { instanceId: 'm1', card: spiralGate, isTapped: false },
              { instanceId: 'm2', card: spiralGate, isTapped: false }
            ]
          },
          opponent: {
            ...state.players.opponent,
            battleZone: [
              {
                instanceId: 'opp-target-c1',
                card: squito,
                owner: 'opponent',
                isTapped: false,
                summonedTurn: 1,
                powerModifier: 0
              }
            ]
          }
        }
      };

      const spellId = state.players.player.hand[0].instanceId;
      state = step(state, {
        type: 'CAST_SPELL',
        player: 'player',
        cardInstanceId: spellId,
        targets: ['opp-target-c1']
      });

      assert.equal(state.players.opponent.battleZone.length, 0);
      assert.equal(
        state.players.opponent.hand.some((c) => c.instanceId === 'opp-target-c1'),
        true
      );
      assert.equal(
        state.players.player.graveyard.some((c) => c.card.name === 'Spiral Gate'),
        true
      );
    });

    it('dispatches PASS_PHASE from MANA_CHARGE to MAIN, and from MAIN to END_TURN when no eligible attackers', () => {
      const deck = createDeck('test-phase-d', 'Test', Array(40).fill(vorg));
      let state = initializeGame(deck, deck, 'player', { shuffle: false });

      assert.equal(state.phase, 'MANA_CHARGE');
      state = step(state, { type: 'PASS_PHASE' });
      assert.equal(state.phase, 'MAIN');

      // Active player has no creatures in battle zone -> passing phase ends turn
      state = step(state, { type: 'PASS_PHASE' });
      assert.equal(state.activePlayer, 'opponent');
      assert.equal(state.phase, 'MANA_CHARGE');
    });

    it('dispatches END_TURN and advances turn to opponent with startTurn lifecycle', () => {
      const deck = createDeck('test-endturn-d', 'Test', Array(40).fill(vorg));
      let state = initializeGame(deck, deck, 'player', { shuffle: false });

      state = step(state, { type: 'END_TURN' });
      assert.equal(state.activePlayer, 'opponent');
      assert.equal(state.turn, 1);
      assert.equal(state.players.opponent.hand.length, 6); // Turn 1 Player 2 draws a card
      assert.equal(state.phase, 'MANA_CHARGE');
    });
  });

  describe('Master Reducer Guards & Pure Error Handling', () => {
    it('guards against actions after game has ended (winner !== null)', () => {
      const deck = createDeck('test-guard-d', 'Test', Array(40).fill(vorg));
      let state = initializeGame(deck, deck, 'player', { shuffle: false });
      state = { ...state, winner: 'player' };

      const handId = state.players.player.hand[0].instanceId;
      const nextState = step(state, {
        type: 'CHARGE_MANA',
        cardInstanceId: handId
      });

      assert.equal(nextState, state);
      assert.equal(nextState.winner, 'player');
      assert.equal(nextState.players.player.manaZone.length, 0);
    });

    it('catches invalid actions without throwing, logging action error and preserving state', () => {
      const deck = createDeck('test-invalid-d', 'Test', Array(40).fill(vorg));
      let state = initializeGame(deck, deck, 'player', { shuffle: false });

      // First mana charge is legal
      state = step(state, {
        type: 'CHARGE_MANA',
        cardInstanceId: state.players.player.hand[0].instanceId
      });
      assert.equal(state.players.player.manaZone.length, 1);

      // Attempt second mana charge in same turn (illegal by DM rules)
      const stateBeforeIllegal = state;
      const nextState = step(state, {
        type: 'CHARGE_MANA',
        cardInstanceId: state.players.player.hand[0].instanceId
      });

      assert.equal(nextState.players.player.manaZone.length, 1); // Not charged
      assert.equal(
        nextState.actionLog.some((log) =>
          log.includes('Action error (CHARGE_MANA): Player player has already charged mana this turn.')
        ),
        true
      );
    });

    it('handles unhandled action types gracefully', () => {
      const deck = createDeck('test-unknown-d', 'Test', Array(40).fill(vorg));
      let state = initializeGame(deck, deck, 'player', { shuffle: false });

      const nextState = step(state, {
        type: 'SOME_UNKNOWN_ACTION'
      });

      assert.equal(
        nextState.actionLog.some((log) =>
          log.includes('Unhandled action type: SOME_UNKNOWN_ACTION')
        ),
        true
      );
    });

    it('supports pure functional execution via actions.reduce(step, initialState)', () => {
      const deck = createDeck('test-reduce-d', 'Test', Array(40).fill(vorg));
      const initialState = initializeGame(deck, deck, 'player', { shuffle: false });

      const p1CardId = initialState.players.player.hand[0].instanceId;
      const actions = [
        { type: 'CHARGE_MANA', cardInstanceId: p1CardId },
        { type: 'PASS_PHASE' },
        { type: 'PASS_PHASE' } // Ends turn because no creatures
      ];

      const finalState = actions.reduce(step, initialState);
      assert.equal(finalState.activePlayer, 'opponent');
      assert.equal(finalState.players.player.manaZone.length, 1);
    });
  });

  describe('Full 1v1 Match End-to-End Simulation (Turn 1 to Victory)', () => {
    it('simulates a complete realistic 1v1 match from start to victory exclusively using step()', () => {
      // Build Player 1 Deck (Fire Beatdown):
      // Shields: 5x Vorg
      // Initial Hand: 4x Vorg, 1x Armored Blaster Valdios
      // Predictable draws: Vorg (T2), Vorg (T3), Vorg (T4), Bombat (T5), Bombat (T6), Vorgs...
      const p1Cards = [
        // 5 Shields
        vorg, vorg, vorg, vorg, vorg,
        // 5 Initial Hand
        vorg, vorg, vorg, vorg, valdios,
        // Deck draws
        vorg,   // Turn 2 draw (summoned Vorg 2 on Turn 3)
        vorg,   // Turn 3 draw (charged on Turn 4)
        vorg,   // Turn 4 draw (charged on Turn 5)
        bombat, // Turn 5 draw (Bombat 1, Speed Attacker)
        bombat, // Turn 6 draw (Bombat 2, Speed Attacker)
        ...Array(25).fill(vorg)
      ];

      // Build Player 2 Deck (Darkness Control):
      // Shields: Shield 0 = Terror Pit (Shield Trigger), Shields 1..4 = Bloody Squito
      // Initial Hand: 5x Bloody Squito
      // Deck: 30x Bloody Squito
      const p2Cards = [
        // 5 Shields
        terrorPit, squito, squito, squito, squito,
        // 5 Initial Hand
        squito, squito, squito, squito, squito,
        // Deck draws
        ...Array(30).fill(squito)
      ];

      const p1Deck = createDeck('deck-p1-fire', 'Fire Rush Deck', p1Cards);
      const p2Deck = createDeck('deck-p2-dark', 'Darkness Control Deck', p2Cards);

      // ==========================================
      // INITIALIZATION
      // ==========================================
      let state = initializeGame(p1Deck, p2Deck, 'player', { shuffle: false });
      assert.equal(state.turn, 1);
      assert.equal(state.activePlayer, 'player');
      assert.equal(state.phase, 'MANA_CHARGE');
      assert.equal(state.players.player.shields.length, 5);
      assert.equal(state.players.opponent.shields.length, 5);
      assert.equal(state.winner, null);

      // Helper to charge a specific card by name
      const chargeCard = (cardName) => {
        const c = state.players[state.activePlayer].hand.find((x) => x.card.name === cardName);
        assert.ok(c, `Expected to find ${cardName} in ${state.activePlayer}'s hand`);
        state = step(state, {
          type: 'CHARGE_MANA',
          player: state.activePlayer,
          cardInstanceId: c.instanceId
        });
      };

      // ==========================================
      // TURN 1 (Player 1)
      // Player 1 skips draw step on turn 1. Charges mana, enters MAIN, passes to end turn.
      // ==========================================
      assert.equal(state.players.player.hand.length, 5);
      chargeCard('Immortal Baron, Vorg');
      assert.equal(state.players.player.manaZone.length, 1);
      assert.equal(state.players.player.hand.length, 4);

      state = step(state, { type: 'PASS_PHASE' }); // MANA_CHARGE -> MAIN
      assert.equal(state.phase, 'MAIN');
      state = step(state, { type: 'PASS_PHASE' }); // MAIN (no creatures) -> opponent's turn

      // ==========================================
      // TURN 1 (Opponent)
      // Opponent draws card (hand: 6), charges mana, ends turn.
      // ==========================================
      assert.equal(state.turn, 1);
      assert.equal(state.activePlayer, 'opponent');
      assert.equal(state.players.opponent.hand.length, 6);
      chargeCard('Bloody Squito');
      assert.equal(state.players.opponent.manaZone.length, 1);

      state = step(state, { type: 'END_TURN' });

      // ==========================================
      // TURN 2 (Player 1)
      // Draws card, charges mana (now 2 mana), summons Vorg 1 (cost 2).
      // Vorg 1 has summoning sickness and cannot attack.
      // ==========================================
      assert.equal(state.turn, 2);
      assert.equal(state.activePlayer, 'player');
      chargeCard('Immortal Baron, Vorg');
      assert.equal(state.players.player.manaZone.length, 2);

      const vorg1Hand = state.players.player.hand.find((c) => c.card.name === 'Immortal Baron, Vorg');
      state = step(state, {
        type: 'SUMMON_CREATURE',
        player: 'player',
        cardInstanceId: vorg1Hand.instanceId
      });
      assert.equal(state.players.player.battleZone.length, 1);
      const vorg1 = state.players.player.battleZone[0];
      assert.equal(vorg1.card.name, 'Immortal Baron, Vorg');

      // Verify summoning sickness prevents attack
      const sickAttack = step(state, {
        type: 'DECLARE_ATTACK',
        attackerInstanceId: vorg1.instanceId,
        target: { type: 'shield', index: 4 }
      });
      assert.equal(
        sickAttack.actionLog.some((l) => l.includes('has summoning sickness')),
        true
      );

      state = step(state, { type: 'END_TURN' });

      // ==========================================
      // TURN 2 (Opponent)
      // Draws card, charges mana (now 2 mana), summons Blocker Bloody Squito (cost 2).
      // ==========================================
      assert.equal(state.turn, 2);
      assert.equal(state.activePlayer, 'opponent');
      chargeCard('Bloody Squito');
      assert.equal(state.players.opponent.manaZone.length, 2);

      const squitoHand = state.players.opponent.hand.find((c) => c.card.name === 'Bloody Squito');
      state = step(state, {
        type: 'SUMMON_CREATURE',
        player: 'opponent',
        cardInstanceId: squitoHand.instanceId
      });
      assert.equal(state.players.opponent.battleZone.length, 1);
      const squitoCreature = state.players.opponent.battleZone[0];
      assert.equal(squitoCreature.card.name, 'Bloody Squito');
      assert.equal(squitoCreature.card.isBlocker, true);

      state = step(state, { type: 'END_TURN' });

      // ==========================================
      // TURN 3 (Player 1)
      // Vorg 1 untaps! Player 1 draws card, charges mana (now 3 mana).
      // Summons Vorg 2 (cost 2).
      // Vorg 1 (ready from turn 2) declares attack on opponent shield 4.
      // Opponent intercepts with Blocker Bloody Squito!
      // Battle: Squito (4000) vs Vorg 1 (2000) -> Vorg 1 is destroyed and sent to graveyard.
      // Shield 4 remains undamaged.
      // ==========================================
      assert.equal(state.turn, 3);
      assert.equal(state.activePlayer, 'player');
      chargeCard('Immortal Baron, Vorg');
      assert.equal(state.players.player.manaZone.length, 3);

      const vorg2Hand = state.players.player.hand.find((c) => c.card.name === 'Immortal Baron, Vorg');
      state = step(state, {
        type: 'SUMMON_CREATURE',
        player: 'player',
        cardInstanceId: vorg2Hand.instanceId
      });
      assert.equal(state.players.player.battleZone.length, 2);

      const readyVorg = state.players.player.battleZone.find((c) => c.summonedTurn === 2);
      assert.equal(readyVorg.isTapped, false);

      // Declare attack on opponent shield 4
      state = step(state, {
        type: 'DECLARE_ATTACK',
        attackerInstanceId: readyVorg.instanceId,
        target: { type: 'shield', index: 4 }
      });
      assert.equal(state.combatState?.stage, 'BLOCK');
      assert.equal(state.pendingInteraction?.type, 'BLOCK_DECLARATION');

      // Opponent blocks with Bloody Squito
      const opponentBlocker = state.players.opponent.battleZone[0];
      state = step(state, {
        type: 'DECLARE_BLOCK',
        player: 'opponent',
        blockerInstanceId: opponentBlocker.instanceId
      });

      // Battle resolution: Vorg 1 destroyed (2000 vs 4000)
      assert.equal(state.players.player.battleZone.length, 1); // Only Vorg 2 left
      assert.equal(state.players.player.graveyard.length, 1);
      assert.equal(state.players.player.graveyard[0].card.name, 'Immortal Baron, Vorg');
      assert.equal(state.players.opponent.shields.length, 5); // Shields unhurt

      state = step(state, { type: 'END_TURN' });

      // ==========================================
      // TURN 3 (Opponent)
      // Draws, charges mana (now 3 mana), ends turn.
      // ==========================================
      assert.equal(state.turn, 3);
      assert.equal(state.activePlayer, 'opponent');
      chargeCard('Bloody Squito');
      state = step(state, { type: 'END_TURN' });

      // ==========================================
      // TURN 4 (Player 1)
      // Vorg 2 untaps. Player 1 draws, charges mana (now 4 mana).
      // Summons Evolution Creature: Armored Blaster Valdios (cost 4) on top of Vorg 2!
      // Valdios ignores summoning sickness and attacks shield 0!
      // Opponent passes block.
      // Valdios is Double Breaker! Breaks 2 shields (Shield 0 & Shield 1).
      // Shield 0 was Terror Pit (Shield Trigger)!
      // Opponent resolves Shield Trigger for free: destroys Valdios!
      // Both Valdios and bait Vorg 2 go to Player 1's graveyard.
      // ==========================================
      assert.equal(state.turn, 4);
      assert.equal(state.activePlayer, 'player');
      chargeCard('Immortal Baron, Vorg');
      assert.equal(state.players.player.manaZone.length, 4);

      const valdiosHand = state.players.player.hand.find((c) => c.card.name === 'Armored Blaster Valdios');
      const bait = state.players.player.battleZone[0];
      state = step(state, {
        type: 'SUMMON_CREATURE',
        player: 'player',
        cardInstanceId: valdiosHand.instanceId,
        baitInstanceId: bait.instanceId
      });

      assert.equal(state.players.player.battleZone.length, 1);
      const valdiosBZ = state.players.player.battleZone[0];
      assert.equal(valdiosBZ.card.name, 'Armored Blaster Valdios');
      assert.equal(valdiosBZ.evolvedOn?.length, 1);

      // Valdios attacks shield index 0 (Double Breaker)
      state = step(state, {
        type: 'DECLARE_ATTACK',
        attackerInstanceId: valdiosBZ.instanceId,
        target: { type: 'shield', index: 0 }
      });

      // Opponent chooses not to block
      if (state.combatState?.stage === 'BLOCK') {
        state = step(state, { type: 'DECLARE_BLOCK', blockerInstanceId: null });
      }

      // Valdios broke 2 shields: 5 - 2 = 3 shields left
      assert.equal(state.players.opponent.shields.length, 3);
      assert.equal(state.pendingInteraction?.type, 'SHIELD_TRIGGER_RESOLUTION');

      // Opponent resolves Terror Pit trigger targeting Valdios
      const pitTrigger = state.pendingInteraction.triggers[0];
      assert.equal(pitTrigger.card.name, 'Terror Pit');
      state = step(state, {
        type: 'RESOLVE_SHIELD_TRIGGER',
        shieldId: pitTrigger.shieldId,
        activate: true,
        targets: [valdiosBZ.instanceId]
      });

      // Valdios destroyed: both Valdios and underlying Vorg 2 placed into graveyard
      assert.equal(state.players.player.battleZone.length, 0);
      assert.equal(state.players.player.graveyard.length, 3); // Vorg 1 + Valdios + Vorg 2
      assert.equal(state.pendingInteraction, null);

      state = step(state, { type: 'END_TURN' });

      // ==========================================
      // TURN 4 (Opponent)
      // Draws, charges mana (now 4 mana), ends turn.
      // ==========================================
      assert.equal(state.turn, 4);
      assert.equal(state.activePlayer, 'opponent');
      chargeCard('Bloody Squito');
      state = step(state, { type: 'END_TURN' });

      // ==========================================
      // TURN 5 (Player 1)
      // Draws Bombat 1. Charges mana (now 5 mana).
      // Summons Bombat, General of Speed (cost 5, Speed Attacker).
      // Bombat attacks immediately and breaks 1 shield! (3 -> 2 shields left).
      // ==========================================
      assert.equal(state.turn, 5);
      assert.equal(state.activePlayer, 'player');
      chargeCard('Immortal Baron, Vorg');
      assert.equal(state.players.player.manaZone.length, 5);

      const bombat1Hand = state.players.player.hand.find((c) => c.card.name === 'Bombat, General of Speed');
      state = step(state, {
        type: 'SUMMON_CREATURE',
        player: 'player',
        cardInstanceId: bombat1Hand.instanceId
      });
      const bombat1 = state.players.player.battleZone[0];
      assert.equal(bombat1.card.name, 'Bombat, General of Speed');
      assert.equal(bombat1.card.isSpeedAttacker, true);

      // Bombat attacks shield index 0
      state = step(state, {
        type: 'DECLARE_ATTACK',
        attackerInstanceId: bombat1.instanceId,
        target: { type: 'shield', index: 0 }
      });
      if (state.combatState?.stage === 'BLOCK') {
        state = step(state, { type: 'DECLARE_BLOCK', blockerInstanceId: null });
      }
      assert.equal(state.players.opponent.shields.length, 2);

      state = step(state, { type: 'END_TURN' });

      // ==========================================
      // TURN 5 (Opponent)
      // Draws, ends turn.
      // ==========================================
      assert.equal(state.turn, 5);
      assert.equal(state.activePlayer, 'opponent');
      state = step(state, { type: 'END_TURN' });

      // ==========================================
      // TURN 6 (Player 1)
      // Bombat 1 untaps! Player 1 draws Bombat 2.
      // 5 mana available: summons Bombat 2 (Speed Attacker).
      // Bombat 1 attacks shield 0 (breaks shield -> 1 shield left).
      // Bombat 2 attacks shield 0 (breaks shield -> 0 SHIELDS LEFT!).
      // ==========================================
      assert.equal(state.turn, 6);
      assert.equal(state.activePlayer, 'player');

      const bombat2Hand = state.players.player.hand.find((c) => c.card.name === 'Bombat, General of Speed');
      state = step(state, {
        type: 'SUMMON_CREATURE',
        player: 'player',
        cardInstanceId: bombat2Hand.instanceId
      });
      assert.equal(state.players.player.battleZone.length, 2);

      const b1 = state.players.player.battleZone.find((c) => c.instanceId === bombat1.instanceId);
      const b2 = state.players.player.battleZone.find((c) => c.instanceId !== bombat1.instanceId);

      // Bombat 1 attacks
      state = step(state, {
        type: 'DECLARE_ATTACK',
        attackerInstanceId: b1.instanceId,
        target: { type: 'shield', index: 0 }
      });
      if (state.combatState?.stage === 'BLOCK') {
        state = step(state, { type: 'DECLARE_BLOCK', blockerInstanceId: null });
      }
      assert.equal(state.players.opponent.shields.length, 1);

      // Bombat 2 attacks (breaks final shield!)
      state = step(state, {
        type: 'DECLARE_ATTACK',
        attackerInstanceId: b2.instanceId,
        target: { type: 'shield', index: 0 }
      });
      if (state.combatState?.stage === 'BLOCK') {
        state = step(state, { type: 'DECLARE_BLOCK', blockerInstanceId: null });
      }
      assert.equal(state.players.opponent.shields.length, 0);

      state = step(state, { type: 'END_TURN' });

      // ==========================================
      // TURN 6 (Opponent)
      // Draws, ends turn.
      // ==========================================
      assert.equal(state.turn, 6);
      assert.equal(state.activePlayer, 'opponent');
      state = step(state, { type: 'END_TURN' });

      // ==========================================
      // TURN 7 (Player 1) - THE WINNING DIRECT ATTACK!
      // Bombats untap! Player 1 draws card.
      // Passes from MANA_CHARGE to MAIN phase.
      // Bombat 1 declares direct attack on opponent player with 0 shields!
      // Opponent chooses not to block (or has no valid blockers).
      // Direct attack resolves -> Player 1 wins the duel!
      // ==========================================
      assert.equal(state.turn, 7);
      assert.equal(state.activePlayer, 'player');
      assert.equal(state.players.opponent.shields.length, 0);

      const winningAttacker = state.players.player.battleZone[0];
      assert.equal(winningAttacker.isTapped, false);

      state = step(state, { type: 'PASS_PHASE' }); // MANA_CHARGE -> MAIN
      assert.equal(state.phase, 'MAIN');

      state = step(state, {
        type: 'DECLARE_ATTACK',
        attackerInstanceId: winningAttacker.instanceId,
        target: { type: 'player' }
      });

      if (state.combatState?.stage === 'BLOCK') {
        state = step(state, { type: 'DECLARE_BLOCK', blockerInstanceId: null });
      }

      // VICTORY!
      assert.equal(state.winner, 'player');
      assert.equal(
        state.actionLog.some((log) => log.includes('player wins the duel!')),
        true
      );

      // Verify that further actions after winning are blocked
      const afterVictory = step(state, { type: 'PASS_PHASE' });
      assert.equal(afterVictory, state);
      assert.equal(afterVictory.winner, 'player');
    });
  });
});
