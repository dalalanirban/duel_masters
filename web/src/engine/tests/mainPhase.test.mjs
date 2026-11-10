import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  summonCreature,
  getEvolutionBaitRequirements,
  isValidEvolutionBait,
  isSummoningSick
} from '../evolution.ts';
import {
  castSpell,
  resolveSpellEffect,
  isChargerSpell
} from '../spells.ts';
import { initializeGame, createCardInstance } from '../state.ts';
import { passToMainPhase } from '../turn.ts';
import { CARD_LIST } from '../../data/cardLoader.ts';

// Helper to find real cards from the card database
function findCard(name) {
  const card = CARD_LIST.find((c) => c.name.toLowerCase() === name.toLowerCase());
  if (!card) throw new Error(`Card not found in cardLoader: ${name}`);
  return card;
}

// Minimal deck builder for initializeGame
function createTestDeck(id, name, card) {
  return {
    id,
    name,
    items: [{ card, count: 40 }],
    updatedAt: Date.now()
  };
}

describe('Duel Masters Engine: Main Phase (Task 3)', () => {
  const aquaHulcus = findCard('Aqua Hulcus'); // Water creature, cost 3, Liquid People
  const crystalLancer = findCard('Crystal Lancer'); // Water evo creature, cost 6, Liquid People
  const vorg = findCard('Immortal Baron, Vorg'); // Fire creature, cost 2, Human
  const valdios = findCard('Armored Blaster Valdios'); // Fire evo creature, cost 4, Human
  const bombat = findCard('Bombat, General of Speed'); // Fire creature, cost 5, Speed Attacker
  const senatine = findCard('Senatine Jade Tree'); // Light creature, cost 3, Blocker
  const terrorPit = findCard('Terror Pit'); // Darkness spell, cost 6
  const holyAwe = findCard('Holy Awe'); // Light spell, cost 6
  const solarRay = findCard('Solar Ray'); // Light spell, cost 2
  const spiralGate = findCard('Spiral Gate'); // Water spell, cost 2
  const teleportation = findCard('Teleportation'); // Water spell, cost 5
  const naturalSnare = findCard('Natural Snare'); // Nature spell, cost 6
  const faerieLife = findCard('Faerie Life'); // Nature spell, cost 2
  const brainSerum = findCard('Brain Serum'); // Water spell, cost 4
  const deathSmoke = findCard('Death Smoke'); // Darkness spell, cost 4
  const criticalBlade = findCard('Critical Blade'); // Darkness spell, cost 2
  const mulchCharger = findCard('Mulch Charger'); // Nature spell, cost 3, Charger
  const energyCharger = findCard('Energy Charger'); // Fire spell, cost 3, Charger

  // Helper to build a clean main phase state with customized mana / hand / battle zones
  function setupMainPhaseState(options = {}) {
    const defaultDeck = createTestDeck('deck-1', 'Default', vorg);
    let state = initializeGame(defaultDeck, defaultDeck, 'player', { shuffle: false });
    state = passToMainPhase(state);

    if (options.playerHand) {
      state.players.player.hand = options.playerHand.map((c) =>
        createCardInstance(c, 'player')
      );
    }
    if (options.playerMana) {
      state.players.player.manaZone = options.playerMana.map((c, idx) => ({
        instanceId: `mana-player-${idx}`,
        card: c,
        isTapped: false
      }));
    }
    if (options.playerBattleZone) {
      state.players.player.battleZone = options.playerBattleZone.map((item, idx) => ({
        instanceId: item.instanceId || `bz-player-${idx}`,
        card: item.card,
        owner: 'player',
        isTapped: item.isTapped ?? false,
        summonedTurn: item.summonedTurn ?? 1,
        powerModifier: item.powerModifier ?? 0,
        evolvedOn: item.evolvedOn
      }));
    }
    if (options.opponentBattleZone) {
      state.players.opponent.battleZone = options.opponentBattleZone.map((item, idx) => ({
        instanceId: item.instanceId || `bz-opp-${idx}`,
        card: item.card,
        owner: 'opponent',
        isTapped: item.isTapped ?? false,
        summonedTurn: item.summonedTurn ?? 1,
        powerModifier: item.powerModifier ?? 0,
        evolvedOn: item.evolvedOn
      }));
    }
    if (options.turn !== undefined) {
      state.turn = options.turn;
    }
    return state;
  }

  describe('Creature Summoning & Summoning Sickness', () => {
    it('summons a standard creature: pays mana, sets summonedTurn, and places creature in battleZone', () => {
      const state = setupMainPhaseState({
        playerHand: [vorg],
        playerMana: [vorg, vorg] // 2 Fire mana
      });

      const cardId = state.players.player.hand[0].instanceId;
      const nextState = summonCreature(state, 'player', cardId);

      // Hand deduction
      assert.equal(nextState.players.player.hand.length, 0);

      // Battle zone presence
      assert.equal(nextState.players.player.battleZone.length, 1);
      const summoned = nextState.players.player.battleZone[0];
      assert.equal(summoned.card.name, 'Immortal Baron, Vorg');
      assert.equal(summoned.summonedTurn, state.turn);
      assert.equal(summoned.isTapped, false);
      assert.equal(summoned.powerModifier, 0);

      // Mana payment: 2 mana tapped
      const tappedMana = nextState.players.player.manaZone.filter((m) => m.isTapped);
      assert.equal(tappedMana.length, 2);

      // Sickness check: regular creature is sick on the turn summoned
      assert.equal(isSummoningSick(summoned, state.turn), true);
      // Not sick on subsequent turns
      assert.equal(isSummoningSick(summoned, state.turn + 1), false);
    });

    it('speed attacker ignores summoning sickness on the turn summoned', () => {
      const state = setupMainPhaseState({
        playerHand: [bombat],
        playerMana: [vorg, vorg, vorg, vorg, vorg] // 5 Fire mana
      });

      const cardId = state.players.player.hand[0].instanceId;
      const nextState = summonCreature(state, 'player', cardId);

      const summoned = nextState.players.player.battleZone[0];
      assert.equal(summoned.card.name, 'Bombat, General of Speed');
      assert.equal(summoned.card.isSpeedAttacker, true);
      assert.equal(isSummoningSick(summoned, state.turn), false);
    });

    it('rejects summoning if player has insufficient mana', () => {
      const state = setupMainPhaseState({
        playerHand: [aquaHulcus], // Cost 3
        playerMana: [aquaHulcus, aquaHulcus] // Only 2 mana
      });

      const cardId = state.players.player.hand[0].instanceId;
      assert.throws(
        () => summonCreature(state, 'player', cardId),
        /mana cost/i
      );
    });

    it('rejects summoning if mana civilization does not match', () => {
      const state = setupMainPhaseState({
        playerHand: [aquaHulcus], // Water card (cost 3)
        playerMana: [vorg, vorg, vorg] // 3 Fire mana, no Water mana
      });

      const cardId = state.players.player.hand[0].instanceId;
      assert.throws(
        () => summonCreature(state, 'player', cardId),
        /mana cost/i
      );
    });

    it('rejects summoning when not the player turn or during invalid phase', () => {
      const state = setupMainPhaseState({
        playerHand: [vorg],
        playerMana: [vorg, vorg]
      });
      state.phase = 'ATTACK';

      const cardId = state.players.player.hand[0].instanceId;
      assert.throws(
        () => summonCreature(state, 'player', cardId),
        /phase/i
      );

      state.phase = 'MAIN';
      assert.throws(
        () => summonCreature(state, 'opponent', cardId),
        /turn/i
      );
    });

    it('automatically transitions from MANA_CHARGE to MAIN phase upon summoning', () => {
      const defaultDeck = createTestDeck('deck-1', 'Default', vorg);
      let state = initializeGame(defaultDeck, defaultDeck, 'player', { shuffle: false });
      assert.equal(state.phase, 'MANA_CHARGE');

      state.players.player.hand = [createCardInstance(vorg, 'player')];
      state.players.player.manaZone = [
        { instanceId: 'm1', card: vorg, isTapped: false },
        { instanceId: 'm2', card: vorg, isTapped: false }
      ];

      const cardId = state.players.player.hand[0].instanceId;
      const nextState = summonCreature(state, 'player', cardId);
      assert.equal(nextState.phase, 'MAIN');
      assert.equal(nextState.players.player.battleZone.length, 1);
    });
  });

  describe('Evolution Mechanics', () => {
    it('getEvolutionBaitRequirements extracts correct race requirements', () => {
      const reqLancer = getEvolutionBaitRequirements(crystalLancer);
      assert.ok(reqLancer.some((r) => r.toLowerCase().includes('liquid people')));

      const reqValdios = getEvolutionBaitRequirements(valdios);
      assert.ok(reqValdios.some((r) => r.toLowerCase().includes('human')));
    });

    it('isValidEvolutionBait correctly matches valid and invalid baits', () => {
      const aquaHulcusInstance = {
        instanceId: 'bait-hulcus',
        card: aquaHulcus,
        owner: 'player',
        isTapped: false,
        summonedTurn: 1,
        powerModifier: 0
      };
      const vorgInstance = {
        instanceId: 'bait-vorg',
        card: vorg,
        owner: 'player',
        isTapped: false,
        summonedTurn: 1,
        powerModifier: 0
      };

      assert.equal(isValidEvolutionBait(crystalLancer, aquaHulcusInstance), true);
      assert.equal(isValidEvolutionBait(crystalLancer, vorgInstance), false);

      assert.equal(isValidEvolutionBait(valdios, vorgInstance), true);
      assert.equal(isValidEvolutionBait(valdios, aquaHulcusInstance), false);
    });

    it('rejects evolution creature summoning if no bait is provided', () => {
      const state = setupMainPhaseState({
        playerHand: [crystalLancer],
        playerMana: [aquaHulcus, aquaHulcus, aquaHulcus, aquaHulcus, aquaHulcus, aquaHulcus]
      });

      const cardId = state.players.player.hand[0].instanceId;
      assert.throws(
        () => summonCreature(state, 'player', cardId),
        /bait/i
      );
    });

    it('rejects evolution creature summoning on opponent creature or invalid race bait', () => {
      const state = setupMainPhaseState({
        playerHand: [crystalLancer],
        playerMana: [aquaHulcus, aquaHulcus, aquaHulcus, aquaHulcus, aquaHulcus, aquaHulcus],
        playerBattleZone: [{ instanceId: 'vorg-friendly', card: vorg }],
        opponentBattleZone: [{ instanceId: 'hulcus-opp', card: aquaHulcus }]
      });

      const cardId = state.players.player.hand[0].instanceId;

      // Targeting opponent's creature should throw
      assert.throws(
        () => summonCreature(state, 'player', cardId, 'hulcus-opp'),
        /not found in player's battle zone/i
      );

      // Targeting friendly creature with mismatched race (Human vs Liquid People) should throw
      assert.throws(
        () => summonCreature(state, 'player', cardId, 'vorg-friendly'),
        /not a valid evolution bait/i
      );
    });

    it('evolves Crystal Lancer on Aqua Hulcus: stacks on top, inherits tapped state, ignores summoning sickness', () => {
      const state = setupMainPhaseState({
        playerHand: [crystalLancer],
        playerMana: [aquaHulcus, aquaHulcus, aquaHulcus, aquaHulcus, aquaHulcus, aquaHulcus],
        playerBattleZone: [
          { instanceId: 'hulcus-friendly', card: aquaHulcus, isTapped: true }
        ]
      });

      const cardId = state.players.player.hand[0].instanceId;
      const nextState = summonCreature(state, 'player', cardId, 'hulcus-friendly');

      // Hand has decreased
      assert.equal(nextState.players.player.hand.length, 0);

      // Battle zone length remains 1 (bait is replaced by evo creature)
      assert.equal(nextState.players.player.battleZone.length, 1);
      const evoCreature = nextState.players.player.battleZone[0];
      assert.equal(evoCreature.card.name, 'Crystal Lancer');

      // Inherited tapped state from bait
      assert.equal(evoCreature.isTapped, true);

      // Stacking: evolvedOn contains bait card
      assert.ok(Array.isArray(evoCreature.evolvedOn));
      assert.equal(evoCreature.evolvedOn.length, 1);
      assert.equal(evoCreature.evolvedOn[0].card.name, 'Aqua Hulcus');

      // Evolution creatures ignore summoning sickness!
      assert.equal(isSummoningSick(evoCreature, state.turn), false);
    });

    it('evolves on untapped bait: evo creature is untapped and immediately ready to attack', () => {
      const state = setupMainPhaseState({
        playerHand: [valdios],
        playerMana: [vorg, vorg, vorg, vorg],
        playerBattleZone: [
          { instanceId: 'vorg-friendly', card: vorg, isTapped: false }
        ]
      });

      const cardId = state.players.player.hand[0].instanceId;
      const nextState = summonCreature(state, 'player', cardId, 'vorg-friendly');

      const evoCreature = nextState.players.player.battleZone[0];
      assert.equal(evoCreature.isTapped, false);
      assert.equal(isSummoningSick(evoCreature, state.turn), false);
    });
  });

  describe('Spell Casting & Effects Resolution', () => {
    it('castSpell deducts mana, removes spell from hand, and moves non-charger to graveyard', () => {
      const state = setupMainPhaseState({
        playerHand: [faerieLife],
        playerMana: [faerieLife, faerieLife]
      });

      const cardId = state.players.player.hand[0].instanceId;
      const nextState = castSpell(state, 'player', cardId);

      assert.equal(nextState.players.player.hand.length, 0);
      assert.equal(nextState.players.player.graveyard.length, 1);
      assert.equal(nextState.players.player.graveyard[0].card.name, 'Faerie Life');

      const tappedMana = nextState.players.player.manaZone.filter((m) => m.isTapped);
      assert.equal(tappedMana.length, 2);
    });

    it('Terror Pit: destroys targeted opponent creature and moves it to graveyard', () => {
      const state = setupMainPhaseState({
        playerHand: [terrorPit],
        playerMana: [terrorPit, terrorPit, terrorPit, terrorPit, terrorPit, terrorPit],
        opponentBattleZone: [
          { instanceId: 'target-creature-1', card: vorg }
        ]
      });

      const cardId = state.players.player.hand[0].instanceId;
      const nextState = castSpell(state, 'player', cardId, ['target-creature-1']);

      // Opponent creature destroyed and sent to opponent's graveyard
      assert.equal(nextState.players.opponent.battleZone.length, 0);
      assert.equal(nextState.players.opponent.graveyard.length, 1);
      assert.equal(nextState.players.opponent.graveyard[0].card.name, 'Immortal Baron, Vorg');

      // Terror Pit sent to player's graveyard
      assert.equal(nextState.players.player.graveyard[0].card.name, 'Terror Pit');
    });

    it('Terror Pit destroying an evolution creature moves the entire stack to graveyard', () => {
      const state = setupMainPhaseState({
        playerHand: [terrorPit],
        playerMana: [terrorPit, terrorPit, terrorPit, terrorPit, terrorPit, terrorPit],
        opponentBattleZone: [
          {
            instanceId: 'target-evo',
            card: crystalLancer,
            evolvedOn: [createCardInstance(aquaHulcus, 'opponent')]
          }
        ]
      });

      const cardId = state.players.player.hand[0].instanceId;
      const nextState = castSpell(state, 'player', cardId, ['target-evo']);

      assert.equal(nextState.players.opponent.battleZone.length, 0);
      // Both Crystal Lancer and Aqua Hulcus moved to graveyard
      assert.equal(nextState.players.opponent.graveyard.length, 2);
      const names = nextState.players.opponent.graveyard.map((c) => c.card.name);
      assert.ok(names.includes('Crystal Lancer'));
      assert.ok(names.includes('Aqua Hulcus'));
    });

    it('Death Smoke: destroys targeted untapped opponent creature, rejects tapped target', () => {
      const state = setupMainPhaseState({
        playerHand: [deathSmoke],
        playerMana: [deathSmoke, deathSmoke, deathSmoke, deathSmoke],
        opponentBattleZone: [
          { instanceId: 'untapped-target', card: vorg, isTapped: false },
          { instanceId: 'tapped-target', card: vorg, isTapped: true }
        ]
      });

      const cardId = state.players.player.hand[0].instanceId;

      // Rejects tapped creature
      assert.throws(
        () => castSpell(state, 'player', cardId, ['tapped-target']),
        /untapped/i
      );

      // Succeeds on untapped creature
      const nextState = castSpell(state, 'player', cardId, ['untapped-target']);
      assert.equal(nextState.players.opponent.battleZone.length, 1);
      assert.equal(nextState.players.opponent.battleZone[0].instanceId, 'tapped-target');
      assert.equal(nextState.players.opponent.graveyard.length, 1);
    });

    it('Critical Blade: destroys targeted blocker, rejects non-blocker target', () => {
      const state = setupMainPhaseState({
        playerHand: [criticalBlade],
        playerMana: [criticalBlade, criticalBlade],
        opponentBattleZone: [
          { instanceId: 'blocker-target', card: senatine }, // isBlocker: true
          { instanceId: 'non-blocker', card: vorg } // isBlocker: false
        ]
      });

      const cardId = state.players.player.hand[0].instanceId;

      // Rejects non-blocker
      assert.throws(
        () => castSpell(state, 'player', cardId, ['non-blocker']),
        /blocker/i
      );

      // Succeeds on blocker
      const nextState = castSpell(state, 'player', cardId, ['blocker-target']);
      assert.equal(nextState.players.opponent.battleZone.length, 1);
      assert.equal(nextState.players.opponent.battleZone[0].instanceId, 'non-blocker');
      assert.equal(nextState.players.opponent.graveyard[0].card.name, 'Senatine Jade Tree');
    });

    it('Holy Awe: taps all opponent creatures in the battle zone', () => {
      const state = setupMainPhaseState({
        playerHand: [holyAwe],
        playerMana: [holyAwe, holyAwe, holyAwe, holyAwe, holyAwe, holyAwe],
        opponentBattleZone: [
          { instanceId: 'opp-1', card: vorg, isTapped: false },
          { instanceId: 'opp-2', card: aquaHulcus, isTapped: false }
        ]
      });

      const cardId = state.players.player.hand[0].instanceId;
      const nextState = castSpell(state, 'player', cardId);

      assert.equal(nextState.players.opponent.battleZone.length, 2);
      assert.equal(nextState.players.opponent.battleZone[0].isTapped, true);
      assert.equal(nextState.players.opponent.battleZone[1].isTapped, true);
    });

    it('Solar Ray: taps single targeted opponent creature in the battle zone', () => {
      const state = setupMainPhaseState({
        playerHand: [solarRay],
        playerMana: [solarRay, solarRay],
        opponentBattleZone: [
          { instanceId: 'opp-1', card: vorg, isTapped: false },
          { instanceId: 'opp-2', card: aquaHulcus, isTapped: false }
        ]
      });

      const cardId = state.players.player.hand[0].instanceId;
      const nextState = castSpell(state, 'player', cardId, ['opp-1']);

      assert.equal(nextState.players.opponent.battleZone[0].isTapped, true);
      assert.equal(nextState.players.opponent.battleZone[1].isTapped, false);
    });

    it('Spiral Gate: returns targeted creature to its owner hand', () => {
      const state = setupMainPhaseState({
        playerHand: [spiralGate],
        playerMana: [spiralGate, spiralGate],
        opponentBattleZone: [
          { instanceId: 'opp-1', card: vorg }
        ]
      });

      const cardId = state.players.player.hand[0].instanceId;
      const nextState = castSpell(state, 'player', cardId, ['opp-1']);

      assert.equal(nextState.players.opponent.battleZone.length, 0);
      assert.equal(nextState.players.opponent.hand.length, 6); // 5 initial + 1 bounced
      assert.equal(nextState.players.opponent.hand[5].card.name, 'Immortal Baron, Vorg');
    });

    it('Teleportation: returns up to 2 targeted creatures to owners hands', () => {
      const state = setupMainPhaseState({
        playerHand: [teleportation],
        playerMana: [spiralGate, spiralGate, spiralGate, spiralGate, spiralGate],
        opponentBattleZone: [
          { instanceId: 'opp-1', card: vorg },
          { instanceId: 'opp-2', card: aquaHulcus }
        ]
      });

      const cardId = state.players.player.hand[0].instanceId;
      const nextState = castSpell(state, 'player', cardId, ['opp-1', 'opp-2']);

      assert.equal(nextState.players.opponent.battleZone.length, 0);
      assert.equal(nextState.players.opponent.hand.length, 7); // 5 initial + 2 bounced
    });

    it('Natural Snare: puts targeted opponent creature into opponent mana zone', () => {
      const state = setupMainPhaseState({
        playerHand: [naturalSnare],
        playerMana: [faerieLife, faerieLife, faerieLife, faerieLife, faerieLife, faerieLife],
        opponentBattleZone: [
          { instanceId: 'opp-1', card: vorg }
        ]
      });

      const cardId = state.players.player.hand[0].instanceId;
      const nextState = castSpell(state, 'player', cardId, ['opp-1']);

      assert.equal(nextState.players.opponent.battleZone.length, 0);
      assert.equal(nextState.players.opponent.manaZone.length, 1);
      assert.equal(nextState.players.opponent.manaZone[0].card.name, 'Immortal Baron, Vorg');
      assert.equal(nextState.players.opponent.manaZone[0].isTapped, false);
    });

    it('Faerie Life: puts top card of deck into player mana zone', () => {
      const state = setupMainPhaseState({
        playerHand: [faerieLife],
        playerMana: [faerieLife, faerieLife]
      });
      const initialDeckCount = state.players.player.deck.length;
      const topDeckCard = state.players.player.deck[0].card;

      const cardId = state.players.player.hand[0].instanceId;
      const nextState = castSpell(state, 'player', cardId);

      // Deck decreased by 1
      assert.equal(nextState.players.player.deck.length, initialDeckCount - 1);

      // Mana zone increased by 1 (from deck)
      assert.equal(nextState.players.player.manaZone.length, 3);
      const rampedCard = nextState.players.player.manaZone[2];
      assert.equal(rampedCard.card.name, topDeckCard.name);
      assert.equal(rampedCard.isTapped, false);
    });

    it('Brain Serum: draws 2 cards from deck to hand', () => {
      const state = setupMainPhaseState({
        playerHand: [brainSerum],
        playerMana: [spiralGate, spiralGate, spiralGate, spiralGate]
      });
      const initialDeckCount = state.players.player.deck.length;

      const cardId = state.players.player.hand[0].instanceId;
      const nextState = castSpell(state, 'player', cardId);

      // Hand: had 1, cast it (-1), drew 2 (+2) = 2 cards
      assert.equal(nextState.players.player.hand.length, 2);
      assert.equal(nextState.players.player.deck.length, initialDeckCount - 2);
    });

    it('Charger Spell rule: Energy Charger moves to player mana zone untapped instead of graveyard', () => {
      const state = setupMainPhaseState({
        playerHand: [energyCharger],
        playerMana: [vorg, vorg, vorg],
        playerBattleZone: [
          { instanceId: 'friendly-1', card: vorg }
        ]
      });

      assert.equal(isChargerSpell(energyCharger), true);

      const cardId = state.players.player.hand[0].instanceId;
      const nextState = castSpell(state, 'player', cardId, ['friendly-1']);

      // Hand is empty
      assert.equal(nextState.players.player.hand.length, 0);

      // Graveyard has NO cards
      assert.equal(nextState.players.player.graveyard.length, 0);

      // Mana zone increased from 3 to 4 (the charger spell enters mana zone)
      assert.equal(nextState.players.player.manaZone.length, 4);
      const chargerInMana = nextState.players.player.manaZone[3];
      assert.equal(chargerInMana.card.name, 'Energy Charger');
      assert.equal(chargerInMana.isTapped, false); // Must be UNTAPPED!

      // Buff applied
      assert.equal(nextState.players.player.battleZone[0].powerModifier, 2000);
    });

    it('Charger Spell rule: Mulch Charger puts friendly creature to mana zone and charger itself to mana zone untapped', () => {
      const state = setupMainPhaseState({
        playerHand: [mulchCharger],
        playerMana: [faerieLife, faerieLife, faerieLife],
        playerBattleZone: [
          { instanceId: 'friendly-1', card: vorg }
        ]
      });

      const cardId = state.players.player.hand[0].instanceId;
      const nextState = castSpell(state, 'player', cardId, ['friendly-1']);

      // Battle zone creature removed
      assert.equal(nextState.players.player.battleZone.length, 0);

      // Graveyard is empty
      assert.equal(nextState.players.player.graveyard.length, 0);

      // Mana zone has 3 original + 1 creature moved + 1 charger spell = 5 cards!
      assert.equal(nextState.players.player.manaZone.length, 5);

      const creatureInMana = nextState.players.player.manaZone[3];
      assert.equal(creatureInMana.card.name, 'Immortal Baron, Vorg');

      const chargerInMana = nextState.players.player.manaZone[4];
      assert.equal(chargerInMana.card.name, 'Mulch Charger');
      assert.equal(chargerInMana.isTapped, false);
    });
  });
});
