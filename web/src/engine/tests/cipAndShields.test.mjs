import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { summonCreature } from '../evolution.ts';
import {
  castSpell,
  resolveSpellEffect,
  addShieldFromDeck,
  destroyOpponentShields,
  breakOpponentShields,
  resolveCreatureCIPEffect
} from '../spells.ts';
import { initializeGame, createCardInstance, createShieldInstance } from '../state.ts';
import { passToMainPhase } from '../turn.ts';
import { declareAttack, resolveShieldTrigger } from '../combat.ts';
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

describe('Duel Masters Engine: CIP Creature Effects & Shield Actions', () => {
  const vorg = findCard('Immortal Baron, Vorg'); // Fire creature, cost 2
  const terrorPit = findCard('Terror Pit'); // Darkness spell, cost 6
  const aquaHulcus = findCard('Aqua Hulcus'); // Water creature, cost 3, draw 1
  const bronzeArmTribe = findCard('Bronze-Arm Tribe'); // Nature creature, cost 3, ramp 1
  const miele = findCard('Miele, Vizier of Lightning'); // Light creature, cost 3, tap 1 opp creature
  const aquaSurfer = findCard('Aqua Surfer'); // Water creature, cost 6, Shield trigger, bounce 1 creature
  const aquaSniper = findCard('Aqua Sniper'); // Water creature, cost 8, bounce up to 2 creatures
  const ultimateForce = findCard('Ultimate Force'); // Nature spell, cost 5, ramps 2 cards
  const miraculousMeltdown = findCard('Miraculous Meltdown'); // Multi-civ Darkness/Fire spell, cost 6, breaks shield diff
  const illusionaryMerfolk = findCard('Illusionary Merfolk'); // Water creature, cost 5, Cyber Lord synergy
  const emeral = findCard('Emeral'); // Cyber Lord creature

  // Sven, the Explorer (Nature, cost 5, add top deck to shields)
  const sven = {
    id: 'test-sven',
    name: 'Sven, the Explorer',
    civilizations: ['Nature'],
    type: 'Creature',
    cost: 5,
    power: 3000,
    races: ['Wild Veggies'],
    rulesText: 'When you put this creature into the battle zone, add the top card of your deck to your shields face down.'
  };

  // Fortress Shell (Nature, cost 9, burns opponent shields to graveyard)
  const fortressShell = {
    id: 'test-fortress-shell',
    name: 'Fortress Shell',
    civilizations: ['Nature'],
    type: 'Creature',
    cost: 9,
    power: 5000,
    races: ['Earth Colossus'],
    rulesText: "When you put this creature into the battle zone, choose up to 2 of your opponent's shields and put them into his graveyard."
  };

  // Aqua Patrol (Water, cost 4, return opponent shield to deck)
  const aquaPatrol = {
    id: 'test-aqua-patrol',
    name: 'Aqua Patrol',
    civilizations: ['Water'],
    type: 'Creature',
    cost: 4,
    power: 2000,
    races: ['Liquid People'],
    rulesText: "When you put this creature into the battle zone, choose 1 of your opponent's shields and put it into his deck. Then your opponent shuffles his deck."
  };

  // Reverse Armor (Fire, cost 1, untaps friendly creature)
  const reverseArmor = {
    id: 'test-reverse-armor',
    name: 'Reverse Armor',
    civilizations: ['Fire'],
    type: 'Spell',
    cost: 1,
    rulesText: 'Untap one of your creatures in the battle zone.'
  };

  // Helper to build a clean test state with custom player/opponent fields
  function setupTestState(options = {}) {
    const defaultDeck = createTestDeck('test-deck', 'Test Deck', vorg);
    let state = initializeGame(defaultDeck, defaultDeck, 'player', { shuffle: false });
    state = passToMainPhase(state);
    state.turn = options.turn ?? 2;

    state.players.player.hand = options.playerHand
      ? options.playerHand.map((c, i) => createCardInstance(c, 'player', `p-hand-${i}`))
      : [];

    if (options.playerMana) {
      state.players.player.manaZone = options.playerMana.map((c, i) => ({
        instanceId: `p-mana-${i}`,
        card: c,
        isTapped: false
      }));
    }
    if (options.playerDeck) {
      state.players.player.deck = options.playerDeck.map((c, i) =>
        createCardInstance(c, 'player', `p-deck-${i}`)
      );
    }
    if (options.playerBattleZone) {
      state.players.player.battleZone = options.playerBattleZone.map((item, i) => ({
        instanceId: item.instanceId || `p-bz-${i}`,
        card: item.card,
        owner: 'player',
        isTapped: item.isTapped ?? false,
        summonedTurn: item.summonedTurn ?? 1,
        powerModifier: item.powerModifier ?? 0
      }));
    }
    if (options.playerShields) {
      state.players.player.shields = options.playerShields.map((s, i) =>
        createShieldInstance(s, 'player', i)
      );
    }

    state.players.opponent.hand = options.opponentHand
      ? options.opponentHand.map((c, i) => createCardInstance(c, 'opponent', `o-hand-${i}`))
      : [];

    if (options.opponentBattleZone) {
      state.players.opponent.battleZone = options.opponentBattleZone.map((item, i) => ({
        instanceId: item.instanceId || `o-bz-${i}`,
        card: item.card,
        owner: 'opponent',
        isTapped: item.isTapped ?? false,
        summonedTurn: item.summonedTurn ?? 1,
        powerModifier: item.powerModifier ?? 0
      }));
    }
    if (options.opponentShields) {
      state.players.opponent.shields = options.opponentShields.map((s, i) =>
        createShieldInstance(s, 'opponent', i)
      );
    }
    if (options.opponentMana) {
      state.players.opponent.manaZone = options.opponentMana.map((c, i) => ({
        instanceId: `o-mana-${i}`,
        card: c,
        isTapped: false
      }));
    }
    if (options.opponentDeck) {
      state.players.opponent.deck = options.opponentDeck.map((c, i) =>
        createCardInstance(c, 'opponent', `o-deck-${i}`)
      );
    }

    return state;
  }

  describe('1. CIP Card Draw Effects', () => {
    it('Aqua Hulcus draws 1 card on summon', () => {
      const state = setupTestState({
        playerHand: [aquaHulcus],
        playerMana: [aquaHulcus, aquaHulcus, aquaHulcus], // 3 Water mana
        playerDeck: [vorg, vorg, vorg]
      });

      const cardId = state.players.player.hand[0].instanceId;
      const nextState = summonCreature(state, 'player', cardId);

      // Aqua Hulcus placed in battle zone
      assert.strictEqual(nextState.players.player.battleZone.length, 1);
      assert.strictEqual(nextState.players.player.battleZone[0].card.name, 'Aqua Hulcus');

      // Hand: had 1, spent 1, drew 1 -> length is 1, containing drawn card (Vorg)
      assert.strictEqual(nextState.players.player.hand.length, 1);
      assert.strictEqual(nextState.players.player.hand[0].card.name, 'Immortal Baron, Vorg');

      // Deck decreased by 1
      assert.strictEqual(nextState.players.player.deck.length, 2);
    });

    it('Illusionary Merfolk draws 3 cards if another Cyber Lord is in battle zone', () => {
      const state = setupTestState({
        playerHand: [illusionaryMerfolk],
        playerMana: [aquaHulcus, aquaHulcus, aquaHulcus, aquaHulcus, aquaHulcus], // 5 Water mana
        playerBattleZone: [{ card: emeral }], // Cyber Lord ally
        playerDeck: [vorg, vorg, vorg, vorg]
      });

      const cardId = state.players.player.hand[0].instanceId;
      const nextState = summonCreature(state, 'player', cardId);

      // Drew 3 cards!
      assert.strictEqual(nextState.players.player.hand.length, 3);
      assert.strictEqual(nextState.players.player.deck.length, 1);
    });

    it('Illusionary Merfolk draws 1 card if no other Cyber Lord is in battle zone', () => {
      const state = setupTestState({
        playerHand: [illusionaryMerfolk],
        playerMana: [aquaHulcus, aquaHulcus, aquaHulcus, aquaHulcus, aquaHulcus], // 5 Water mana
        playerBattleZone: [{ card: vorg }], // Human, not Cyber Lord
        playerDeck: [vorg, vorg, vorg, vorg]
      });

      const cardId = state.players.player.hand[0].instanceId;
      const nextState = summonCreature(state, 'player', cardId);

      // Drew 1 card!
      assert.strictEqual(nextState.players.player.hand.length, 1);
      assert.strictEqual(nextState.players.player.deck.length, 3);
    });
  });

  describe('2. CIP Mana Ramp Effects', () => {
    it('Bronze-Arm Tribe ramps 1 mana on summon', () => {
      const state = setupTestState({
        playerHand: [bronzeArmTribe],
        playerMana: [bronzeArmTribe, bronzeArmTribe, bronzeArmTribe], // 3 Nature mana
        playerDeck: [vorg, vorg]
      });

      const cardId = state.players.player.hand[0].instanceId;
      const nextState = summonCreature(state, 'player', cardId);

      // Bronze-Arm Tribe in battle zone
      assert.strictEqual(nextState.players.player.battleZone.length, 1);
      assert.strictEqual(nextState.players.player.battleZone[0].card.name, 'Bronze-Arm Tribe');

      // Mana zone: was 3, paid 3, ramped 1 -> now 4 cards total
      assert.strictEqual(nextState.players.player.manaZone.length, 4);
      // Top card of deck is in mana zone
      const ramped = nextState.players.player.manaZone[3];
      assert.strictEqual(ramped.card.name, 'Immortal Baron, Vorg');
      assert.strictEqual(ramped.isTapped, false);

      // Deck decreased by 1
      assert.strictEqual(nextState.players.player.deck.length, 1);
    });
  });

  describe('3. CIP Shield Action Effects', () => {
    it('Sven, the Explorer adds 1 shield on summon', () => {
      const state = setupTestState({
        playerHand: [sven],
        playerMana: [bronzeArmTribe, bronzeArmTribe, bronzeArmTribe, bronzeArmTribe, bronzeArmTribe], // 5 Nature mana
        playerShields: [vorg, vorg, vorg, vorg, vorg], // 5 initial shields
        playerDeck: [vorg, vorg]
      });

      const cardId = state.players.player.hand[0].instanceId;
      const nextState = summonCreature(state, 'player', cardId);

      // Shields increased from 5 to 6
      assert.strictEqual(nextState.players.player.shields.length, 6);
      const newShield = nextState.players.player.shields[5];
      assert.strictEqual(newShield.isBroken, false);
      assert.strictEqual(newShield.card.name, 'Immortal Baron, Vorg');
      assert.ok(newShield.id);
      assert.ok(newShield.shieldId);

      // Deck decreased from 2 to 1
      assert.strictEqual(nextState.players.player.deck.length, 1);
    });

    it('Fortress Shell destroys opponent shield to graveyard', () => {
      const state = setupTestState({
        playerHand: [fortressShell],
        playerMana: Array(9).fill(bronzeArmTribe), // 9 Nature mana
        opponentShields: [vorg, vorg, vorg, vorg, vorg] // 5 shields
      });

      const cardId = state.players.player.hand[0].instanceId;
      const nextState = summonCreature(state, 'player', cardId);

      // Opponent shields reduced by 2 (from 5 to 3)
      assert.strictEqual(nextState.players.opponent.shields.length, 3);

      // Opponent graveyard contains the 2 burned shields
      assert.strictEqual(nextState.players.opponent.graveyard.length, 2);
      assert.strictEqual(nextState.players.opponent.graveyard[0].card.name, 'Immortal Baron, Vorg');

      // Opponent hand remains 0 (not broken to hand)
      assert.strictEqual(nextState.players.opponent.hand.length, 0);

      // No Shield Trigger queued
      assert.strictEqual(nextState.pendingInteraction, null);
    });

    it('Aqua Patrol returns an opponent shield to their deck', () => {
      const state = setupTestState({
        playerHand: [aquaPatrol],
        playerMana: [aquaHulcus, aquaHulcus, aquaHulcus, aquaHulcus], // 4 Water mana
        opponentShields: [vorg, vorg, vorg],
        opponentDeck: [vorg]
      });

      const cardId = state.players.player.hand[0].instanceId;
      const nextState = summonCreature(state, 'player', cardId);

      // Opponent shields decreased from 3 to 2
      assert.strictEqual(nextState.players.opponent.shields.length, 2);

      // Opponent deck increased from 1 to 2
      assert.strictEqual(nextState.players.opponent.deck.length, 2);
    });
  });

  describe('4. CIP Tapping Opponent Creature Effects', () => {
    it('Miele, Vizier of Lightning taps 1 opponent creature on summon', () => {
      const state = setupTestState({
        playerHand: [miele],
        playerMana: [miele, miele, miele], // 3 Light mana
        opponentBattleZone: [{ instanceId: 'opp-target', card: vorg, isTapped: false }]
      });

      const cardId = state.players.player.hand[0].instanceId;
      const nextState = summonCreature(state, 'player', cardId);

      // Opponent creature was tapped
      assert.strictEqual(nextState.players.opponent.battleZone[0].isTapped, true);
    });

    it('Miele, Vizier of Lightning taps targeted creature when targets provided', () => {
      const state = setupTestState({
        playerHand: [miele],
        playerMana: [miele, miele, miele], // 3 Light mana
        opponentBattleZone: [
          { instanceId: 'opp-1', card: vorg, isTapped: false },
          { instanceId: 'opp-2', card: vorg, isTapped: false }
        ]
      });

      const cardId = state.players.player.hand[0].instanceId;
      const nextState = summonCreature(state, 'player', cardId, undefined, ['opp-2']);

      // Only opp-2 was tapped
      assert.strictEqual(nextState.players.opponent.battleZone[0].isTapped, false);
      assert.strictEqual(nextState.players.opponent.battleZone[1].isTapped, true);
    });
  });

  describe('5. CIP Bouncing Creature Effects', () => {
    it('Aqua Surfer bounces target on summon', () => {
      const state = setupTestState({
        playerHand: [aquaSurfer],
        playerMana: Array(6).fill(aquaHulcus), // 6 Water mana
        opponentBattleZone: [{ instanceId: 'opp-target', card: vorg, isTapped: false }]
      });

      const cardId = state.players.player.hand[0].instanceId;
      const nextState = summonCreature(state, 'player', cardId, undefined, ['opp-target']);

      // Opponent creature returned to hand
      assert.strictEqual(nextState.players.opponent.battleZone.length, 0);
      assert.strictEqual(nextState.players.opponent.hand.length, 1);
      assert.strictEqual(nextState.players.opponent.hand[0].card.name, 'Immortal Baron, Vorg');
    });

    it('Aqua Surfer automatically bounces highest power creature if no target specified', () => {
      const weakOpp = { ...vorg, power: 1000 };
      const strongOpp = { ...vorg, power: 5000 };

      const state = setupTestState({
        playerHand: [aquaSurfer],
        playerMana: Array(6).fill(aquaHulcus), // 6 Water mana
        opponentBattleZone: [
          { instanceId: 'opp-weak', card: weakOpp },
          { instanceId: 'opp-strong', card: strongOpp }
        ]
      });

      const cardId = state.players.player.hand[0].instanceId;
      const nextState = summonCreature(state, 'player', cardId);

      // Strongest creature bounced to hand
      assert.strictEqual(nextState.players.opponent.battleZone.length, 1);
      assert.strictEqual(nextState.players.opponent.battleZone[0].instanceId, 'opp-weak');
      assert.strictEqual(nextState.players.opponent.hand.length, 1);
      assert.strictEqual(nextState.players.opponent.hand[0].instanceId, 'opp-strong');
    });

    it('Aqua Sniper bounces up to 2 creatures on summon', () => {
      const state = setupTestState({
        playerHand: [aquaSniper],
        playerMana: Array(8).fill(aquaHulcus), // 8 Water mana
        opponentBattleZone: [
          { instanceId: 'opp-1', card: vorg },
          { instanceId: 'opp-2', card: vorg },
          { instanceId: 'opp-3', card: vorg }
        ]
      });

      const cardId = state.players.player.hand[0].instanceId;
      const nextState = summonCreature(state, 'player', cardId, undefined, ['opp-1', 'opp-2']);

      // 2 creatures bounced, 1 remains
      assert.strictEqual(nextState.players.opponent.battleZone.length, 1);
      assert.strictEqual(nextState.players.opponent.battleZone[0].instanceId, 'opp-3');
      assert.strictEqual(nextState.players.opponent.hand.length, 2);
    });
  });

  describe('6. Shield Interaction Spells', () => {
    it('Ultimate Force puts 2 cards into mana zone', () => {
      const state = setupTestState({
        playerHand: [ultimateForce],
        playerMana: Array(5).fill(bronzeArmTribe), // 5 Nature mana
        playerDeck: [vorg, vorg, vorg]
      });

      const cardId = state.players.player.hand[0].instanceId;
      const nextState = castSpell(state, 'player', cardId);

      // Mana zone: was 5, paid 5, gained 2 from deck -> 7 cards total
      assert.strictEqual(nextState.players.player.manaZone.length, 7);

      // Deck decreased by 2 cards
      assert.strictEqual(nextState.players.player.deck.length, 1);

      // Ultimate Force went to graveyard (not a charger)
      assert.strictEqual(nextState.players.player.graveyard.length, 1);
      assert.strictEqual(nextState.players.player.graveyard[0].card.name, 'Ultimate Force');
    });

    it('Miraculous Meltdown breaks opponent shields up to shield difference', () => {
      const state = setupTestState({
        playerHand: [miraculousMeltdown],
        // Miraculous Meltdown is Darkness/Fire cost 6
        playerMana: [
          terrorPit, // Darkness
          vorg, vorg, vorg, vorg, vorg // Fire
        ],
        playerShields: [vorg], // Player has 1 shield
        opponentShields: [vorg, vorg, vorg] // Opponent has 3 shields
      });

      const cardId = state.players.player.hand[0].instanceId;
      const nextState = castSpell(state, 'player', cardId);

      // Difference was 3 - 1 = 2 shields broken
      assert.strictEqual(nextState.players.opponent.shields.length, 1);
      assert.strictEqual(nextState.players.opponent.hand.length, 2);
    });

    it('Reverse Armor untaps friendly tapped creature', () => {
      const state = setupTestState({
        playerHand: [reverseArmor],
        playerMana: [vorg], // 1 Fire mana
        playerBattleZone: [{ instanceId: 'friendly-1', card: vorg, isTapped: true }]
      });

      const cardId = state.players.player.hand[0].instanceId;
      const nextState = castSpell(state, 'player', cardId);

      // Creature was untapped
      assert.strictEqual(nextState.players.player.battleZone[0].isTapped, false);
    });
  });

  describe('7. Shield Trigger Summon with CIP Effects', () => {
    it('Shield Trigger summon of Aqua Hulcus executes CIP draw effect', () => {
      const triggerHulcus = { ...aquaHulcus, isShieldTrigger: true };
      const attacker = {
        instanceId: 'att-1',
        card: vorg,
        owner: 'player',
        isTapped: false,
        summonedTurn: 1, // On turn 2, summoned on turn 1 is NOT summoning sick
        powerModifier: 0
      };

      const triggerShield = createShieldInstance(triggerHulcus, 'opponent', 0);
      let state = setupTestState({
        turn: 2,
        playerBattleZone: [attacker],
        opponentShields: [],
        opponentDeck: [vorg, vorg, vorg]
      });
      state.players.opponent.shields = [triggerShield];

      // Player attacks opponent's shield 0
      state = declareAttack(state, 'att-1', { type: 'shield', index: 0 });

      assert.ok(state.pendingInteraction);
      const triggerId = state.pendingInteraction.triggers[0].shieldId;

      // Opponent activates Shield Trigger to summon Aqua Hulcus for free
      const resolvedState = resolveShieldTrigger(state, triggerId, true);

      // Aqua Hulcus summoned to opponent battle zone
      assert.strictEqual(resolvedState.players.opponent.battleZone.length, 1);
      assert.strictEqual(resolvedState.players.opponent.battleZone[0].card.name, 'Aqua Hulcus');

      // Aqua Hulcus's CIP effect drew 1 card for opponent
      assert.strictEqual(resolvedState.players.opponent.hand.length, 1);
      assert.strictEqual(resolvedState.players.opponent.hand[0].card.name, 'Immortal Baron, Vorg');
      assert.strictEqual(resolvedState.players.opponent.deck.length, 2);
    });

    it('Shield Trigger summon of Bronze-Arm Tribe executes CIP ramp effect', () => {
      const triggerBAT = { ...bronzeArmTribe, isShieldTrigger: true };
      const attacker = {
        instanceId: 'att-1',
        card: vorg,
        owner: 'player',
        isTapped: false,
        summonedTurn: 1, // On turn 2, summoned on turn 1 is NOT summoning sick
        powerModifier: 0
      };

      const triggerShield = createShieldInstance(triggerBAT, 'opponent', 0);
      let state = setupTestState({
        turn: 2,
        playerBattleZone: [attacker],
        opponentShields: [],
        opponentDeck: [vorg, vorg],
        opponentMana: [vorg, vorg]
      });
      state.players.opponent.shields = [triggerShield];

      // Player attacks opponent's shield 0
      state = declareAttack(state, 'att-1', { type: 'shield', index: 0 });

      assert.ok(state.pendingInteraction);
      const triggerId = state.pendingInteraction.triggers[0].shieldId;

      // Opponent activates Shield Trigger to summon Bronze-Arm Tribe
      const resolvedState = resolveShieldTrigger(state, triggerId, true);

      // BAT in opponent battle zone
      assert.strictEqual(resolvedState.players.opponent.battleZone.length, 1);
      assert.strictEqual(resolvedState.players.opponent.battleZone[0].card.name, 'Bronze-Arm Tribe');

      // Opponent mana zone increased by 1 (from 2 to 3)
      assert.strictEqual(resolvedState.players.opponent.manaZone.length, 3);
      assert.strictEqual(resolvedState.players.opponent.deck.length, 1);
    });
  });

  describe('8. Pure Helper Functions', () => {
    it('addShieldFromDeck adds shield and preserves immutability', () => {
      const state = setupTestState({
        playerShields: [vorg],
        playerDeck: [vorg, vorg]
      });

      const nextState = addShieldFromDeck(state, 'player', 1);

      assert.strictEqual(state.players.player.shields.length, 1);
      assert.strictEqual(nextState.players.player.shields.length, 2);
      assert.strictEqual(nextState.players.player.deck.length, 1);
    });

    it('destroyOpponentShields destroys shields directly to graveyard without trigger', () => {
      const triggerCard = { ...vorg, isShieldTrigger: true };
      const state = setupTestState({
        opponentShields: [triggerCard, triggerCard]
      });

      const nextState = destroyOpponentShields(state, 'player', 1);

      assert.strictEqual(nextState.players.opponent.shields.length, 1);
      assert.strictEqual(nextState.players.opponent.graveyard.length, 1);
      assert.strictEqual(nextState.pendingInteraction, null);
    });
  });
});
