import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { step } from '../reducer.ts';
import { triggerAttack, searchDeckForCard } from '../effects.ts';
import { canPayManaCost, payManaCost, validateManualManaSelection } from '../mana.ts';
import { getSpellTargetRequirement } from '../targeting.ts';
import { castSpell } from '../spells.ts';
import {
  declareAttack,
  resolveCombat,
  getCreatureEffectivePower,
  canCreatureAttack,
  hasCreatureSpeedAttacker,
  isCreatureSummoningSick
} from '../combat.ts';
import { breakOpponentShields } from '../zones.ts';
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

  // =========================================================================
  // 5. SHIELD TRIGGER FLAG HYGIENE, SPELL LOG ORDER & MANUAL MANA VALIDATION
  // =========================================================================
  describe('5. Emeral Shield Trigger Fix, Spell Log Order & Manual Mana Validation', () => {
    it('does not treat Emeral or other rules-mention cards as Shield Triggers when broken', () => {
      const emeral = findCard('Emeral');
      const crypticTotem = findCard('Cryptic Totem');
      const gigabuster = findCard('Gigabuster');
      const meltdown = findCard('Miraculous Meltdown');
      const terrorPit = findCard('Terror Pit');

      assert.strictEqual(emeral.isShieldTrigger, false);
      assert.strictEqual(crypticTotem.isShieldTrigger, false);
      assert.strictEqual(gigabuster.isShieldTrigger, false);
      assert.strictEqual(meltdown.isShieldTrigger, false);
      assert.strictEqual(terrorPit.isShieldTrigger, true);

      const state = createTestState();
      state.players.opponent.shields = [
        { instanceId: 'sh-emeral', card: emeral, owner: 'opponent', isBroken: false }
      ];

      const afterBreak = breakOpponentShields(state, 'player', 1, [0]);
      assert.strictEqual(afterBreak.pendingInteraction, null);
      assert.strictEqual(afterBreak.players.opponent.hand.length, 1);
      assert.strictEqual(afterBreak.players.opponent.hand[0].card.name, 'Emeral');
      assert.ok(
        !afterBreak.actionLog.some((l) => l.includes('Shield Trigger(s) detected')),
        'Breaking Emeral must never log Shield Trigger detection'
      );
    });

    it('logs spell cast BEFORE resolved discard/destruction effect logs (and same for Shield Trigger spells)', () => {
      const ghostTouch = findCard('Ghost Touch');
      const hulk = findCard('Aqua Hulcus');
      const state = createTestState();
      state.activePlayer = 'opponent';
      state.phase = 'MAIN';
      state.players.opponent.hand = [
        { instanceId: 'op-gt', card: ghostTouch, owner: 'opponent' }
      ];
      state.players.opponent.manaZone = [
        { instanceId: 'op-m1', card: ghostTouch, owner: 'opponent', isTapped: false },
        { instanceId: 'op-m2', card: ghostTouch, owner: 'opponent', isTapped: false }
      ];
      state.players.player.hand = [
        { instanceId: 'pl-hulk', card: hulk, owner: 'player' }
      ];

      const afterCast = castSpell(state, 'opponent', 'op-gt');
      const castIdx = afterCast.actionLog.findIndex((l) => l.includes('opponent cast Ghost Touch'));
      const discardIdx = afterCast.actionLog.findIndex((l) => l.includes('discarded'));
      assert.ok(castIdx !== -1, 'Expected cast log entry');
      assert.ok(discardIdx !== -1, 'Expected discard log entry');
      assert.ok(castIdx < discardIdx, `Expected cast log (${castIdx}) before discard log (${discardIdx})`);

      const terrorPit = findCard('Terror Pit');
      let triggerState = createTestState();
      triggerState.activePlayer = 'opponent';
      triggerState.phase = 'ATTACK';
      triggerState.players.opponent.battleZone = [
        { instanceId: 'op-att', card: vorg, owner: 'opponent', isTapped: true, summonedTurn: 1, powerModifier: 0 }
      ];
      triggerState.players.player.hand = [
        { instanceId: 'sh-tp', card: terrorPit, owner: 'player' }
      ];
      triggerState.pendingInteraction = {
        type: 'SHIELD_TRIGGER_RESOLUTION',
        player: 'player',
        triggers: [{ shieldId: 'sh-tp', card: terrorPit }]
      };

      const afterTrigger = step(triggerState, {
        type: 'RESOLVE_SHIELD_TRIGGER',
        player: 'player',
        shieldId: 'sh-tp',
        activate: true,
        targets: ['op-att']
      });
      const actIdx = afterTrigger.actionLog.findIndex((l) => l.includes('activated Shield Trigger spell: Terror Pit'));
      const destroyIdx = afterTrigger.actionLog.findIndex((l) => l.includes('destroyed'));
      assert.ok(actIdx !== -1 && destroyIdx !== -1 && actIdx < destroyIdx);
    });

    it('validates manual mana selection count and distinct dual-civ requirements accurately', () => {
      const bat = findCard('Bronze-Arm Tribe'); // Cost 3 Nature
      const technoTotem = findCard('Techno Totem'); // Cost 4 Light/Nature
      const spiralGate = findCard('Spiral Gate'); // Water

      const manaZone = [
        { instanceId: 'm-f1', card: vorg, owner: 'player', isTapped: false },
        { instanceId: 'm-f2', card: vorg, owner: 'player', isTapped: false },
        { instanceId: 'm-w1', card: spiralGate, owner: 'player', isTapped: false },
        { instanceId: 'm-w2', card: spiralGate, owner: 'player', isTapped: false },
        { instanceId: 'm-n1', card: bat, owner: 'player', isTapped: false },
        { instanceId: 'm-ln', card: technoTotem, owner: 'player', isTapped: false }
      ];

      // Under-selected & wrong civs for Bronze-Arm Tribe (Cost 3 Nature)
      const v0 = validateManualManaSelection(manaZone, bat, []);
      assert.strictEqual(v0.valid, false);
      assert.strictEqual(v0.requiredCost, 3);
      assert.deepStrictEqual(v0.missingCivs, ['Nature']);

      const vWrongCiv = validateManualManaSelection(manaZone, bat, ['m-f1', 'm-f2', 'm-w1']);
      assert.strictEqual(vWrongCiv.valid, false);
      assert.deepStrictEqual(vWrongCiv.missingCivs, ['Nature']);

      const vGoodMono = validateManualManaSelection(manaZone, bat, ['m-f1', 'm-w1', 'm-n1']);
      assert.strictEqual(vGoodMono.valid, true);
      assert.deepStrictEqual(vGoodMono.missingCivs, []);

      // Dual-civ card requires distinct cards for Light & Nature (1 Light/Nature + 3 Water is insufficient)
      const vDualSingle = validateManualManaSelection(manaZone, technoTotem, ['m-ln', 'm-w1', 'm-w2', 'm-f1']);
      assert.strictEqual(vDualSingle.valid, false);
      assert.strictEqual(vDualSingle.missingCivs.length, 1);

      // 1 Light/Nature + 1 Nature + 2 Water covers both Light & Nature on distinct cards
      const vDualValid = validateManualManaSelection(manaZone, technoTotem, ['m-ln', 'm-n1', 'm-w1', 'm-w2']);
      assert.strictEqual(vDualValid.valid, true);
      assert.deepStrictEqual(vDualValid.missingCivs, []);
    });

    it('prevents cardName substring collisions (Emerald Grass != Emeral, Nemonex != Bajula, Gregorian Worm != Gregoria, Automaton != Jabaha)', () => {
      const emeraldGrass = findCard('Emerald Grass');
      const lightCard = findCard('Holy Awe');
      const nemonex = findCard("Nemonex, Bajula's Robomantis");
      const gregorianWorm = findCard('Gregorian Worm');
      const autom = findCard("Jabaha's Automaton");

      // Summoning Emerald Grass (even with interactiveHuman: true) must NOT open Emeral prompt or swap shields
      let s1 = createTestState();
      s1.interactiveHuman = true;
      s1.players.player.hand = [
        { instanceId: 'h-eg', card: emeraldGrass, owner: 'player' },
        { instanceId: 'h-extra', card: lightCard, owner: 'player' }
      ];
      s1.players.player.shields = [
        { instanceId: 'sh-1', card: lightCard, owner: 'player', isBroken: false }
      ];
      s1.players.player.manaZone = [
        { instanceId: 'm-1', card: emeraldGrass, owner: 'player', isTapped: false },
        { instanceId: 'm-2', card: emeraldGrass, owner: 'player', isTapped: false }
      ];

      const afterEG = step(s1, { type: 'SUMMON_CREATURE', player: 'player', cardInstanceId: 'h-eg' });
      assert.strictEqual(afterEG.pendingInteraction, null);
      assert.strictEqual(afterEG.players.player.shields.length, 1);
      assert.strictEqual(afterEG.players.player.hand.length, 1);
      assert.ok(
        !afterEG.actionLog.some((l) => l.includes('swapped a card from hand with a shield using Emeral')),
        'Emerald Grass must never trigger Emeral effect'
      );

      // Attacking with Gregorian Worm must NOT discard opponent's hand
      // Attacking with Nemonex must NOT burn 2 opponent mana (Bajula trigger)
      let s2 = createTestState();
      s2.phase = 'ATTACK';
      s2.players.player.battleZone = [
        { instanceId: 'c-gw', card: gregorianWorm, owner: 'player', isTapped: false, summonedTurn: 1, powerModifier: 0 },
        { instanceId: 'c-nem', card: nemonex, owner: 'player', isTapped: false, summonedTurn: 1, powerModifier: 0 },
        { instanceId: 'c-auto', card: autom, owner: 'player', isTapped: false, summonedTurn: 1, powerModifier: 0 }
      ];
      s2.players.opponent.hand = [{ instanceId: 'op-h', card: vorg, owner: 'opponent' }];
      s2.players.opponent.manaZone = [
        { instanceId: 'op-m1', card: vorg, owner: 'opponent', isTapped: false },
        { instanceId: 'op-m2', card: vorg, owner: 'opponent', isTapped: false }
      ];
      s2.players.opponent.shields = [
        { instanceId: 'op-sh', card: lightCard, owner: 'opponent', isBroken: false }
      ];

      const afterGW = step(s2, { type: 'DECLARE_ATTACK', player: 'player', attackerId: 'c-gw', target: { type: 'shield', index: 0 } });
      assert.strictEqual(afterGW.players.opponent.hand.length, 2); // 1 initial hand + 1 broken shield, zero discards!

      const afterNem = step(s2, { type: 'DECLARE_ATTACK', player: 'player', attackerId: 'c-nem', target: { type: 'shield', index: 0 } });
      assert.strictEqual(afterNem.players.opponent.manaZone.length, 1); // Nemonex's own unblocked trigger destroys 1 mana, NOT Bajula's 2 mana!
      assert.ok(!afterNem.actionLog.some((l) => l.includes('Überdragon Bajula')));
    });
  });

  // =========================================================================
  // 6. TESTER FEEDBACK REGRESSIONS (JAGALZOR, SKYTERROR, ULTIMATE DRAGON, TAP ABILITY)
  // =========================================================================
  describe("6. Tester Reports: Turbo Rush (Jagalzor), Scarlet Skyterror, Ultimate Dragon & Rikabu's Screwdriver", () => {
    it('Magmadragon Jagalzor does not grant Speed Attacker until another friendly creature breaks a shield', () => {
      const jagalzor = findCard('Magmadragon Jagalzor');
      assert.strictEqual(jagalzor.isSpeedAttacker, false, 'Base Jagalzor must not be unconditional Speed Attacker');

      let state = createTestState();
      state.turn = 6;
      state.phase = 'MAIN';
      state.players.player.battleZone = [
        { instanceId: 'att-prev', card: vorg, owner: 'player', isTapped: false, summonedTurn: 2, powerModifier: 0 },
        { instanceId: 'jag-now', card: jagalzor, owner: 'player', isTapped: false, summonedTurn: 6, powerModifier: 0 },
        { instanceId: 'ally-now', card: findCard('Aqua Hulcus'), owner: 'player', isTapped: false, summonedTurn: 6, powerModifier: 0 }
      ];
      state.players.opponent.shields = [
        { instanceId: 'sh-1', card: findCard('Aqua Hulcus'), owner: 'opponent', isBroken: false },
        { instanceId: 'sh-2', card: findCard('Aqua Hulcus'), owner: 'opponent', isBroken: false }
      ];

      // Before breaking a shield: Jagalzor & ally have summoning sickness
      assert.strictEqual(
        isCreatureSummoningSick(state.players.player.battleZone[1], 6, state.players.player.battleZone, state, 'player'),
        true
      );
      assert.strictEqual(
        canCreatureAttack(state, state.players.player.battleZone[1], undefined, 'player').valid,
        false
      );

      // Attack and break 1 shield with Vorg -> triggers Jagalzor Turbo Rush
      state = step(state, {
        type: 'DECLARE_ATTACK',
        player: 'player',
        attackerId: 'att-prev',
        target: { type: 'shield', index: 0, indices: [0] }
      });

      const jagInstance = state.players.player.battleZone.find((c) => c.instanceId === 'jag-now');
      const allyInstance = state.players.player.battleZone.find((c) => c.instanceId === 'ally-now');
      assert.strictEqual(
        hasCreatureSpeedAttacker(jagInstance, state.players.player.battleZone, state, 'player'),
        true
      );
      assert.strictEqual(
        isCreatureSummoningSick(jagInstance, 6, state.players.player.battleZone, state, 'player'),
        false
      );
      assert.strictEqual(
        isCreatureSummoningSick(allyInstance, 6, state.players.player.battleZone, state, 'player'),
        false
      );
      assert.strictEqual(canCreatureAttack(state, jagInstance, undefined, 'player').valid, true);
      assert.strictEqual(canCreatureAttack(state, allyInstance, undefined, 'player').valid, true);
    });

    it('Scarlet Skyterror destroys all creatures that have Blocker across both battle zones on summon', () => {
      const skyterror = findCard('Scarlet Skyterror');
      const emeraldGrass = findCard('Emerald Grass'); // Light Blocker
      const squito = findCard('Bloody Squito'); // Darkness Blocker

      let state = createTestState();
      state.turn = 8;
      state.phase = 'MAIN';
      state.players.player.hand = [
        { instanceId: 'h-sky', card: skyterror, owner: 'player' }
      ];
      state.players.player.manaZone = Array.from({ length: 8 }, (_, i) => ({
        instanceId: `m-${i}`,
        card: skyterror,
        owner: 'player',
        isTapped: false
      }));
      state.players.player.battleZone = [
        { instanceId: 'p-blocker', card: emeraldGrass, owner: 'player', isTapped: false, summonedTurn: 3, powerModifier: 0 },
        { instanceId: 'p-nonblocker', card: vorg, owner: 'player', isTapped: false, summonedTurn: 3, powerModifier: 0 }
      ];
      state.players.opponent.battleZone = [
        { instanceId: 'o-blocker', card: squito, owner: 'opponent', isTapped: false, summonedTurn: 3, powerModifier: 0 },
        { instanceId: 'o-nonblocker', card: findCard('Aqua Hulcus'), owner: 'opponent', isTapped: false, summonedTurn: 3, powerModifier: 0 }
      ];

      const afterSummon = step(state, {
        type: 'SUMMON_CREATURE',
        player: 'player',
        cardInstanceId: 'h-sky'
      });

      assert.strictEqual(afterSummon.players.player.battleZone.some((c) => c.instanceId === 'p-blocker'), false);
      assert.strictEqual(afterSummon.players.player.battleZone.some((c) => c.instanceId === 'p-nonblocker'), true);
      assert.strictEqual(afterSummon.players.player.battleZone.some((c) => c.card.name === 'Scarlet Skyterror'), true);
      assert.strictEqual(afterSummon.players.opponent.battleZone.some((c) => c.instanceId === 'o-blocker'), false);
      assert.strictEqual(afterSummon.players.opponent.battleZone.some((c) => c.instanceId === 'o-nonblocker'), true);
    });

    it('Ultimate Dragon gets +5000 power per other friendly Dragon (excluding Dragonoids and opponent Dragons)', () => {
      const ultimate = findCard('Ultimate Dragon'); // Base 5000, Armored Dragon
      const bolshack = findCard('Bolshack Dragon'); // Armored Dragon
      const astro = findCard('Astronaut Skyterror'); // Armored Wyvern (NOT Dragon)
      const brawler = findCard('Brawler Zyler'); // Human (NOT Dragon)

      const state = createTestState();
      state.players.player.battleZone = [
        { instanceId: 'ult-1', card: ultimate, owner: 'player', isTapped: false, summonedTurn: 1, powerModifier: 0 },
        { instanceId: 'drg-1', card: bolshack, owner: 'player', isTapped: false, summonedTurn: 1, powerModifier: 0 },
        { instanceId: 'drg-2', card: findCard('Magmadragon Jagalzor'), owner: 'player', isTapped: false, summonedTurn: 1, powerModifier: 0 },
        { instanceId: 'non-drg-1', card: astro, owner: 'player', isTapped: false, summonedTurn: 1, powerModifier: 0 },
        { instanceId: 'non-drg-2', card: brawler, owner: 'player', isTapped: false, summonedTurn: 1, powerModifier: 0 }
      ];
      state.players.opponent.battleZone = [
        { instanceId: 'opp-drg', card: bolshack, owner: 'opponent', isTapped: false, summonedTurn: 1, powerModifier: 0 }
      ];

      const ult = state.players.player.battleZone[0];
      const power = getCreatureEffectivePower(ult, false, state.players.player, state.players.opponent, false, state);
      assert.strictEqual(power, 15000, 'Ultimate Dragon base 5000 + 2 other friendly Dragons * 5000 = 15000');
    });

    it("Rikabu's Screwdriver activates $tap ability in both MAIN and ATTACK phases to destroy an opponent Blocker", () => {
      const screwdriver = findCard("Rikabu's Screwdriver");
      const blocker = findCard('Emerald Grass');
      const nonBlocker = findCard('Aqua Hulcus');

      let state = createTestState();
      state.interactiveHuman = true;
      state.turn = 6;
      state.phase = 'MAIN';
      state.players.player.battleZone = [
        { instanceId: 'rik-1', card: screwdriver, owner: 'player', isTapped: false, summonedTurn: 5, powerModifier: 0 }
      ];
      state.players.opponent.battleZone = [
        { instanceId: 'opp-blk', card: blocker, owner: 'opponent', isTapped: false, summonedTurn: 5, powerModifier: 0 },
        { instanceId: 'opp-hul', card: nonBlocker, owner: 'opponent', isTapped: false, summonedTurn: 5, powerModifier: 0 }
      ];

      // Activating $tap from MAIN phase transitions to ATTACK and prompts to pick opponent Blocker only
      const afterTap = step(state, {
        type: 'ACTIVATE_TAP_ABILITY',
        player: 'player',
        creatureInstanceId: 'rik-1'
      });

      assert.strictEqual(afterTap.phase, 'ATTACK');
      assert.strictEqual(afterTap.players.player.battleZone[0].isTapped, true);
      assert.strictEqual(afterTap.pendingInteraction?.type, 'ZONE_SELECTION');
      assert.strictEqual(afterTap.pendingInteraction?.options.length, 1);
      assert.strictEqual(afterTap.pendingInteraction?.options[0].instanceId, 'opp-blk');

      const resolved = step(afterTap, {
        type: 'RESOLVE_ZONE_SELECTION',
        player: 'player',
        selectedIds: ['opp-blk']
      });
      assert.strictEqual(resolved.pendingInteraction, null);
      assert.strictEqual(resolved.players.opponent.battleZone.length, 1);
      assert.strictEqual(resolved.players.opponent.battleZone[0].instanceId, 'opp-hul');
    });
  });
});
