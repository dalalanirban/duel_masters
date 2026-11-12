import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { step } from '../reducer.ts';
import { triggerAttack, searchDeckForCard } from '../effects.ts';
import { canPayManaCost, payManaCost } from '../mana.ts';
import { getSpellTargetRequirement } from '../targeting.ts';
import { castSpell } from '../spells.ts';
import { declareAttack, resolveCombat } from '../combat.ts';
import allCards from '../../data/all_cards.json' with { type: 'json' };

function findCard(name) {
  const c = allCards.find((x) => x.name.toLowerCase() === name.toLowerCase());
  if (!c) throw new Error(`Card not found: ${name}`);
  return c;
}

function createTestState() {
  return {
    turn: 2,
    activePlayer: 'player',
    phase: 'MAIN',
    winner: null,
    combatState: null,
    pendingInteraction: null,
    actionLog: [],
    players: {
      player: {
        id: 'player',
        hand: [],
        manaZone: [],
        battleZone: [],
        shields: [],
        graveyard: [],
        deck: []
      },
      opponent: {
        id: 'opponent',
        hand: [],
        manaZone: [],
        battleZone: [],
        shields: [],
        graveyard: [],
        deck: []
      }
    }
  };
}

describe('User Feedback Rules Audit: Attack Discard, Comet Missile, Deck Search & Manual Mana', () => {
  const skullsweeper = findCard('Skullsweeper Q'); // Darkness, Survivor, Discard on attack, 1000
  const smashHorn = findCard('Smash Horn Q'); // Nature, Survivor, +1000 to Survivors, 2000
  const vorg = findCard('Immortal Baron, Vorg'); // 2000 Fire
  const cometMissile = findCard('Comet Missile'); // Fire Spell, Destroy opp blocker power <= 6000
  const senatineJadeTree = findCard('Senatine Jade Tree'); // 4000 Blocker Light
  const diaNork = findCard('Dia Nork, Moonlight Guardian'); // 5000 Blocker Light
  const granic = findCard('Gran Gure, Space Guardian'); // 9000 Blocker Light (> 6000)
  const factoryShell = findCard('Factory Shell Q'); // Nature Survivor, Search deck for Survivor
  const forbos = findCard('Forbos, Sanctum Guardian Q'); // Light Survivor, Search deck for Spell
  const dimensionGate = findCard('Dimension Gate'); // Nature Spell, Search deck for Creature
  const crystalMemory = findCard('Crystal Memory'); // Water Spell, Search deck for any Card
  const logicCube = findCard('Logic Cube'); // Light Spell, Search deck for Spell

  // =========================================================================
  // 1. SKULLSWEEPER Q & ON-ATTACK DISCARD SEQUENCE
  // =========================================================================
  describe('1. Skullsweeper Q Attack Trigger Discard Sequence', () => {
    it('discards from opponent hand BEFORE shields are broken into hand (opponent with 0 hand cards does not discard broken shield)', () => {
      let state = createTestState();
      // Player has Skullsweeper Q in battle zone ready to attack
      state.players.player.battleZone = [
        {
          instanceId: 'bz-skull-1',
          card: skullsweeper,
          owner: 'player',
          isTapped: false,
          powerModifier: 0,
          turnSummoned: 1
        }
      ];

      // Opponent has 0 cards in hand, but 1 shield (Vorg)
      state.players.opponent.hand = [];
      state.players.opponent.shields = [
        {
          id: 'opp-shield-1',
          card: vorg,
          isBroken: false
        }
      ];

      // Declare attack against opponent's shield
      const nextState = step(state, {
        type: 'DECLARE_ATTACK',
        player: 'player',
        attackerInstanceId: 'bz-skull-1',
        target: { type: 'shield', index: 0, indices: [0] }
      });

      // 1. Discard occurred BEFORE shield break: since opponent had 0 cards in hand, 0 cards were discarded
      assert.strictEqual(nextState.players.opponent.graveyard.length, 0);

      // 2. Shield break occurred: broken shield was added to opponent hand
      assert.strictEqual(nextState.players.opponent.hand.length, 1);
      assert.strictEqual(nextState.players.opponent.hand[0].card.name, vorg.name);
      assert.strictEqual(nextState.players.opponent.shields.length, 0);
    });

    it('discards existing opponent hand card BEFORE shield break adds new card to hand', () => {
      let state = createTestState();
      state.players.player.battleZone = [
        {
          instanceId: 'bz-skull-1',
          card: skullsweeper,
          owner: 'player',
          isTapped: false,
          powerModifier: 0,
          turnSummoned: 1
        }
      ];

      // Opponent has Senatine Jade Tree in hand, and Vorg in shield
      state.players.opponent.hand = [
        {
          instanceId: 'opp-h-1',
          card: senatineJadeTree,
          owner: 'opponent'
        }
      ];
      state.players.opponent.shields = [
        {
          id: 'opp-shield-1',
          card: vorg,
          isBroken: false
        }
      ];

      const nextState = step(state, {
        type: 'DECLARE_ATTACK',
        player: 'player',
        attackerInstanceId: 'bz-skull-1',
        target: { type: 'shield', index: 0, indices: [0] }
      });

      // Opponent should have discarded Senatine Jade Tree to graveyard
      assert.strictEqual(nextState.players.opponent.graveyard.length, 1);
      assert.strictEqual(nextState.players.opponent.graveyard[0].card.name, senatineJadeTree.name);

      // Opponent hand should now contain Vorg (from the broken shield), not Senatine
      assert.strictEqual(nextState.players.opponent.hand.length, 1);
      assert.strictEqual(nextState.players.opponent.hand[0].card.name, vorg.name);
    });
  });

  // =========================================================================
  // 2. COMET MISSILE TARGETING & RESOLUTION
  // =========================================================================
  describe('2. Comet Missile Targeting & Resolution', () => {
    it('identifies opponent blockers with power <= 6000 as valid targets and excludes non-blockers and blockers > 6000', () => {
      let state = createTestState();
      // Opponent has 3 creatures:
      // 1. Senatine Jade Tree (Blocker, 4000) -> VALID
      // 2. Gran Gure (Blocker, 9000) -> INVALID (power > 6000)
      // 3. Vorg (Non-blocker, 2000) -> INVALID (not a blocker)
      state.players.opponent.battleZone = [
        {
          instanceId: 'opp-senatine',
          card: senatineJadeTree,
          owner: 'opponent',
          isTapped: false,
          powerModifier: 0,
          turnSummoned: 1
        },
        {
          instanceId: 'opp-gran',
          card: granic,
          owner: 'opponent',
          isTapped: false,
          powerModifier: 0,
          turnSummoned: 1
        },
        {
          instanceId: 'opp-vorg',
          card: vorg,
          owner: 'opponent',
          isTapped: false,
          powerModifier: 0,
          turnSummoned: 1
        }
      ];

      const req = getSpellTargetRequirement(cometMissile, state.players.player, state.players.opponent);
      assert.strictEqual(req.requiresTarget, true);
      assert.deepStrictEqual(req.validTargetIds, ['opp-senatine']);
    });

    it('casts Comet Missile and destroys targeted blocker <= 6000 power into graveyard', () => {
      let state = createTestState();
      // Player has Fire mana to cast Comet Missile (Cost 1)
      state.players.player.manaZone = [
        {
          instanceId: 'm-fire-1',
          card: cometMissile,
          owner: 'player',
          isTapped: false
        }
      ];
      state.players.player.hand = [
        {
          instanceId: 'h-comet',
          card: cometMissile,
          owner: 'player'
        }
      ];
      state.players.opponent.battleZone = [
        {
          instanceId: 'opp-senatine',
          card: senatineJadeTree,
          owner: 'opponent',
          isTapped: false,
          powerModifier: 0,
          turnSummoned: 1
        }
      ];

      const nextState = step(state, {
        type: 'CAST_SPELL',
        player: 'player',
        cardInstanceId: 'h-comet',
        targets: ['opp-senatine']
      });

      // Senatine Jade Tree should be destroyed
      assert.strictEqual(nextState.players.opponent.battleZone.length, 0);
      assert.strictEqual(nextState.players.opponent.graveyard.length, 1);
      assert.strictEqual(nextState.players.opponent.graveyard[0].card.name, senatineJadeTree.name);

      // Comet Missile went to player graveyard
      assert.strictEqual(nextState.players.player.graveyard.length, 1);
      assert.strictEqual(nextState.players.player.graveyard[0].card.name, cometMissile.name);
    });
  });

  // =========================================================================
  // 3. INTERACTIVE DECK SEARCH (FACTORY SHELL Q, DIMENSION GATE, ETC.)
  // =========================================================================
  describe('3. Interactive Deck Search Mechanics', () => {
    it('queues DECK_SEARCH pendingInteraction when Factory Shell Q is summoned and player deck contains Survivors', () => {
      let state = createTestState();
      // Player has 6 Nature mana to summon Factory Shell Q (Cost 6)
      state.players.player.manaZone = [
        { instanceId: 'm1', card: factoryShell, owner: 'player', isTapped: false },
        { instanceId: 'm2', card: factoryShell, owner: 'player', isTapped: false },
        { instanceId: 'm3', card: factoryShell, owner: 'player', isTapped: false },
        { instanceId: 'm4', card: factoryShell, owner: 'player', isTapped: false },
        { instanceId: 'm5', card: factoryShell, owner: 'player', isTapped: false },
        { instanceId: 'm6', card: factoryShell, owner: 'player', isTapped: false }
      ];
      state.players.player.hand = [
        { instanceId: 'h-factory', card: factoryShell, owner: 'player' }
      ];
      // Deck contains Smash Horn Q (Survivor) and Vorg (Non-Survivor)
      state.players.player.deck = [
        { instanceId: 'd-smash', card: smashHorn, owner: 'player' },
        { instanceId: 'd-vorg', card: vorg, owner: 'player' }
      ];

      const nextState = step(state, {
        type: 'SUMMON_CREATURE',
        player: 'player',
        cardInstanceId: 'h-factory'
      });

      // Must queue a DECK_SEARCH interaction for the player
      assert.ok(nextState.pendingInteraction);
      assert.strictEqual(nextState.pendingInteraction.type, 'DECK_SEARCH');
      assert.strictEqual(nextState.pendingInteraction.player, 'player');
      assert.strictEqual(nextState.pendingInteraction.destination, 'hand');
      // Only Smash Horn Q is a Survivor in deck
      assert.deepStrictEqual(nextState.pendingInteraction.validCardInstanceIds, ['d-smash']);
    });

    it('resolves DECK_SEARCH by moving selected card to hand and clearing pendingInteraction', () => {
      let state = createTestState();
      state.players.player.deck = [
        { instanceId: 'd-smash', card: smashHorn, owner: 'player' },
        { instanceId: 'd-vorg', card: vorg, owner: 'player' }
      ];
      state.pendingInteraction = {
        type: 'DECK_SEARCH',
        player: 'player',
        sourceCardName: 'Factory Shell Q',
        filterDescription: 'Survivor',
        validCardInstanceIds: ['d-smash'],
        destination: 'hand'
      };

      const nextState = step(state, {
        type: 'RESOLVE_DECK_SEARCH',
        player: 'player',
        selectedCardInstanceId: 'd-smash'
      });

      // Smash Horn moved from deck to hand
      assert.strictEqual(nextState.players.player.hand.length, 1);
      assert.strictEqual(nextState.players.player.hand[0].card.name, smashHorn.name);
      assert.strictEqual(nextState.players.player.deck.length, 1);
      assert.strictEqual(nextState.players.player.deck[0].card.name, vorg.name);
      assert.strictEqual(nextState.pendingInteraction, null);
    });

    it('allows player to skip DECK_SEARCH (take nothing) and clears pendingInteraction', () => {
      let state = createTestState();
      state.players.player.deck = [
        { instanceId: 'd-smash', card: smashHorn, owner: 'player' }
      ];
      state.pendingInteraction = {
        type: 'DECK_SEARCH',
        player: 'player',
        sourceCardName: 'Factory Shell Q',
        filterDescription: 'Survivor',
        validCardInstanceIds: ['d-smash'],
        destination: 'hand'
      };

      const nextState = step(state, {
        type: 'RESOLVE_DECK_SEARCH',
        player: 'player',
        selectedCardInstanceId: null
      });

      assert.strictEqual(nextState.players.player.hand.length, 0);
      assert.strictEqual(nextState.players.player.deck.length, 1);
      assert.strictEqual(nextState.pendingInteraction, null);
    });
  });

  // =========================================================================
  // 4. MANUAL MANA TAPPING
  // =========================================================================
  describe('4. Manual Mana Tapping', () => {
    it('toggles isTapped status of a mana card via TOGGLE_MANA_TAP action', () => {
      let state = createTestState();
      state.players.player.manaZone = [
        { instanceId: 'm-vorg-1', card: vorg, owner: 'player', isTapped: false }
      ];

      // Tap the card
      const stateTapped = step(state, {
        type: 'TOGGLE_MANA_TAP',
        player: 'player',
        cardInstanceId: 'm-vorg-1'
      });
      assert.strictEqual(stateTapped.players.player.manaZone[0].isTapped, true);

      // Untap the card
      const stateUntapped = step(stateTapped, {
        type: 'TOGGLE_MANA_TAP',
        player: 'player',
        cardInstanceId: 'm-vorg-1'
      });
      assert.strictEqual(stateUntapped.players.player.manaZone[0].isTapped, false);
    });

    it('supports forceTapped parameter for drag-to-tap or drag-to-untap gestures', () => {
      let state = createTestState();
      state.players.player.manaZone = [
        { instanceId: 'm-1', card: vorg, owner: 'player', isTapped: false },
        { instanceId: 'm-2', card: vorg, owner: 'player', isTapped: false }
      ];

      const s1 = step(state, {
        type: 'TOGGLE_MANA_TAP',
        player: 'player',
        cardInstanceId: 'm-1',
        forceTapped: true
      });
      const s2 = step(s1, {
        type: 'TOGGLE_MANA_TAP',
        player: 'player',
        cardInstanceId: 'm-2',
        forceTapped: true
      });

      assert.strictEqual(s2.players.player.manaZone[0].isTapped, true);
      assert.strictEqual(s2.players.player.manaZone[1].isTapped, true);
    });
  });
});
