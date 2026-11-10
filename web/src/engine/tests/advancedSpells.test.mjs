import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveSpellEffect,
  castSpell,
  destroyCreature,
  bounceCreature,
  rampTopDeckToManaZone
} from '../spells.ts';
import {
  initializeGame,
  createCardInstance
} from '../state.ts';
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

describe('Declarative Effect Engine: Mass Board Wipes & Advanced Spells (Task 5)', () => {
  // Spells from cardLoader
  const burstShot = findCard('Burst Shot');
  const blizzardOfSpears = findCard('Blizzard of Spears');
  const searingWave = findCard('Searing Wave');
  const invincibleAbyss = findCard('Invincible Abyss');
  const apocalypseVise = findCard('Apocalypse Vise');
  const abductionCharger = findCard('Abduction Charger');
  const darkReversal = findCard('Dark Reversal');
  const corpseCharger = findCard('Corpse Charger');
  const morbidMedicine = findCard('Morbid Medicine');
  const zombieCarnival = findCard('Zombie Carnival');
  const lostSoul = findCard('Lost Soul');
  const manaCrisis = findCard('Mana Crisis');
  const reapAndSow = findCard('Reap and Sow');
  const holyAwe = findCard('Holy Awe');
  const terrorPit = findCard('Terror Pit');

  // Custom Apocalypse Day definition (DM-06)
  const apocalypseDay = {
    id: 'dm-custom-apocalypse-day',
    name: 'Apocalypse Day',
    set: 'DM-06',
    collectorNumber: '1',
    civilizations: ['Light'],
    type: 'Spell',
    manaCost: 6,
    manaNumber: 1,
    power: null,
    races: [],
    isShieldTrigger: false,
    isBlocker: false,
    isSlayer: false,
    isSpeedAttacker: false,
    powerAttackerBonus: 0,
    breakerCount: 1,
    rulesText: 'If there are 6 or more creatures in the battle zone, destroy all creatures.',
    rarity: 'Super Rare',
    imageAssetPath: null
  };

  // Creatures for test setups
  const vorg = findCard('Immortal Baron, Vorg'); // Fire, 2000 power, Human
  const aquaSoldier = findCard('Aqua Soldier'); // Water, 1000 power, Liquid People, bounce replacement
  const aquaHulcus = findCard('Aqua Hulcus'); // Water, 2000 power, Liquid People
  const aquaKnight = findCard('Aqua Knight'); // Water, 4000 power, Liquid People
  const rothus = findCard('Rothus, the Traveler'); // Fire, 4000 power, Armorloid
  const urth = findCard('Urth, Purifying Elemental'); // Light, 6000 power, Angel Command
  const bolshack = findCard('Bolshack Dragon'); // Fire, 6000 power, Armored Dragon
  const balloonshroom = findCard('Balloonshroom Q'); // Nature, 2000 power, Survivor, mana replacement
  const smashHorn = findCard('Smash Horn Q'); // Nature, 2000 power, Survivor

  function createTestState() {
    const deck1 = createTestDeck('d1', 'Deck 1', vorg);
    const deck2 = createTestDeck('d2', 'Deck 2', vorg);
    const s = initializeGame(deck1, deck2, 'player', { shuffle: false });
    return {
      ...s,
      phase: 'MAIN'
    };
  }

  function setupCreatureInBZ(state, player, card, options = {}) {
    const instanceId =
      options.instanceId ||
      `test-creature-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const creature = {
      instanceId,
      card,
      owner: player,
      isTapped: options.isTapped ?? false,
      summonedTurn: options.summonedTurn ?? state.turn - 1,
      powerModifier: options.powerModifier ?? 0,
      evolvedOn: options.evolvedOn
    };
    return {
      nextState: {
        ...state,
        players: {
          ...state.players,
          [player]: {
            ...state.players[player],
            battleZone: [...state.players[player].battleZone, creature]
          }
        }
      },
      creature
    };
  }

  // =========================================================================
  // 1. MASS BOARD WIPE SPELLS
  // =========================================================================
  describe('1. Mass Board Wipe Spells', () => {
    it('Burst Shot destroys all creatures with power <= 2000 on both sides while preserving > 2000', () => {
      let state = createTestState();
      // Friendly: 1 Vorg (2000), 1 Urth (6000)
      const { nextState: s1, creature: fVorg } = setupCreatureInBZ(state, 'player', vorg, {
        instanceId: 'f-vorg'
      });
      const { nextState: s2, creature: fUrth } = setupCreatureInBZ(s1, 'player', urth, {
        instanceId: 'f-urth'
      });
      // Opponent: 1 Aqua Hulcus (2000), 1 Rothus (4000)
      const { nextState: s3, creature: oHulcus } = setupCreatureInBZ(s2, 'opponent', aquaHulcus, {
        instanceId: 'o-hulcus'
      });
      const { nextState: s4, creature: oRothus } = setupCreatureInBZ(s3, 'opponent', rothus, {
        instanceId: 'o-rothus'
      });

      const afterBurstShot = resolveSpellEffect(s4, 'player', burstShot);

      // Friendly battle zone should only have Urth left
      assert.equal(afterBurstShot.players.player.battleZone.length, 1);
      assert.equal(afterBurstShot.players.player.battleZone[0].instanceId, fUrth.instanceId);
      // Friendly graveyard should have Vorg
      assert.ok(afterBurstShot.players.player.graveyard.some((c) => c.instanceId === fVorg.instanceId));

      // Opponent battle zone should only have Rothus left
      assert.equal(afterBurstShot.players.opponent.battleZone.length, 1);
      assert.equal(afterBurstShot.players.opponent.battleZone[0].instanceId, oRothus.instanceId);
      // Opponent graveyard should have Aqua Hulcus
      assert.ok(
        afterBurstShot.players.opponent.graveyard.some((c) => c.instanceId === oHulcus.instanceId)
      );
    });

    it('Burst Shot triggers replacement effects (Aqua Soldier returns to hand, Balloonshroom goes to mana)', () => {
      let state = createTestState();
      // Friendly: Aqua Soldier (1000 power, bounce replacement)
      const { nextState: s1, creature: soldier } = setupCreatureInBZ(state, 'player', aquaSoldier, {
        instanceId: 'soldier-1'
      });
      // Friendly: Balloonshroom Q (2000 power, mana replacement) and Smash Horn Q (2000 base -> with Balloonshroom they are survivors)
      const { nextState: s2, creature: balloon } = setupCreatureInBZ(s1, 'player', balloonshroom, {
        instanceId: 'balloon-1'
      });

      const afterBurst = resolveSpellEffect(s2, 'player', burstShot);

      // Both destroyed from battle zone
      assert.equal(afterBurst.players.player.battleZone.length, 0);

      // Aqua Soldier went to hand instead of graveyard
      assert.ok(afterBurst.players.player.hand.some((c) => c.instanceId === soldier.instanceId));

      // Balloonshroom Q went to mana zone instead of graveyard
      assert.ok(
        afterBurst.players.player.manaZone.some((m) => m.instanceId === balloon.instanceId)
      );
    });

    it('Blizzard of Spears destroys all creatures with power <= 4000 on both sides', () => {
      let state = createTestState();
      // Friendly: Vorg (2000), Rothus (4000), Urth (6000)
      const { nextState: s1, creature: fVorg } = setupCreatureInBZ(state, 'player', vorg);
      const { nextState: s2, creature: fRothus } = setupCreatureInBZ(s1, 'player', rothus);
      const { nextState: s3, creature: fUrth } = setupCreatureInBZ(s2, 'player', urth);

      // Opponent: Aqua Knight (4000), Bolshack (6000)
      const { nextState: s4, creature: oKnight } = setupCreatureInBZ(s3, 'opponent', aquaKnight);
      const { nextState: s5, creature: oBolshack } = setupCreatureInBZ(s4, 'opponent', bolshack);

      const afterBlizzard = resolveSpellEffect(s5, 'player', blizzardOfSpears);

      // Friendly should only retain Urth (6000 power)
      assert.equal(afterBlizzard.players.player.battleZone.length, 1);
      assert.equal(afterBlizzard.players.player.battleZone[0].instanceId, fUrth.instanceId);

      // Opponent should only retain Bolshack Dragon (6000 power)
      assert.equal(afterBlizzard.players.opponent.battleZone.length, 1);
      assert.equal(afterBlizzard.players.opponent.battleZone[0].instanceId, oBolshack.instanceId);

      // Vorg and Rothus in graveyard; Aqua Knight bounced to hand via its replacement effect
      assert.ok(afterBlizzard.players.player.graveyard.some((c) => c.instanceId === fVorg.instanceId));
      assert.ok(afterBlizzard.players.player.graveyard.some((c) => c.instanceId === fRothus.instanceId));
      assert.ok(afterBlizzard.players.opponent.hand.some((c) => c.instanceId === oKnight.instanceId));
    });

    it('Searing Wave destroys opponent creatures power <= 3000 and puts 1 friendly shield into graveyard', () => {
      let state = createTestState();
      // Friendly: Vorg (2000 power) - should NOT be destroyed because Searing Wave targets opponent's creatures
      const { nextState: s1, creature: fVorg } = setupCreatureInBZ(state, 'player', vorg);

      // Opponent: Hulcus (2000 power - destroyed), Rothus (4000 power - preserved)
      const { nextState: s2, creature: oHulcus } = setupCreatureInBZ(s1, 'opponent', aquaHulcus);
      const { nextState: s3, creature: oRothus } = setupCreatureInBZ(s2, 'opponent', rothus);

      // Friendly shields: 5 unbroken shields. Let's make shield 0 a Holy Awe (shield trigger) to verify NO trigger fires
      const shieldList = [...s3.players.player.shields];
      shieldList[0] = {
        ...shieldList[0],
        card: holyAwe
      };
      const sWithHolyAweShield = {
        ...s3,
        players: {
          ...s3.players,
          player: {
            ...s3.players.player,
            shields: shieldList
          }
        }
      };

      const initialShieldCount = sWithHolyAweShield.players.player.shields.length;
      const afterSearing = resolveSpellEffect(sWithHolyAweShield, 'player', searingWave);

      // Opponent: Hulcus destroyed, Rothus survives
      assert.equal(afterSearing.players.opponent.battleZone.length, 1);
      assert.equal(afterSearing.players.opponent.battleZone[0].instanceId, oRothus.instanceId);
      assert.ok(afterSearing.players.opponent.graveyard.some((c) => c.instanceId === oHulcus.instanceId));

      // Friendly: Vorg must NOT be destroyed!
      assert.equal(afterSearing.players.player.battleZone.length, 1);
      assert.equal(afterSearing.players.player.battleZone[0].instanceId, fVorg.instanceId);

      // Friendly shields decreased by 1
      assert.equal(afterSearing.players.player.shields.length, initialShieldCount - 1);
      // Friendly graveyard received Holy Awe from shields
      assert.ok(afterSearing.players.player.graveyard.some((c) => c.card.name === 'Holy Awe'));
      // No pending interaction / trigger was queued!
      assert.equal(afterSearing.pendingInteraction, null);
    });

    it('Searing Wave allows specifying which friendly shield to sacrifice via targets', () => {
      let state = createTestState();
      const targetShieldId = state.players.player.shields[2].id;
      const targetShieldCardName = state.players.player.shields[2].card.name;

      const afterSearing = resolveSpellEffect(state, 'player', searingWave, [targetShieldId]);

      // Shield 2 was removed
      assert.ok(!afterSearing.players.player.shields.some((s) => s.id === targetShieldId));
      // Put into graveyard
      assert.ok(afterSearing.players.player.graveyard.some((c) => c.instanceId === targetShieldId));
    });

    it('Invincible Abyss destroys ALL opponent creatures regardless of power and preserves friendly board', () => {
      let state = createTestState();
      // Friendly: Vorg (2000), Urth (6000)
      const { nextState: s1, creature: fVorg } = setupCreatureInBZ(state, 'player', vorg);
      const { nextState: s2, creature: fUrth } = setupCreatureInBZ(s1, 'player', urth);

      // Opponent: Aqua Soldier (1000), Rothus (4000), Bolshack Dragon (6000)
      const { nextState: s3, creature: oSoldier } = setupCreatureInBZ(s2, 'opponent', aquaSoldier);
      const { nextState: s4, creature: oRothus } = setupCreatureInBZ(s3, 'opponent', rothus);
      const { nextState: s5, creature: oBolshack } = setupCreatureInBZ(s4, 'opponent', bolshack);

      const afterAbyss = resolveSpellEffect(s5, 'player', invincibleAbyss);

      // Friendly board untouched
      assert.equal(afterAbyss.players.player.battleZone.length, 2);
      // Opponent board completely cleared (Aqua Soldier returned to hand via replacement)
      assert.equal(afterAbyss.players.opponent.battleZone.length, 0);
      assert.ok(afterAbyss.players.opponent.hand.some((c) => c.instanceId === oSoldier.instanceId));
      assert.ok(afterAbyss.players.opponent.graveyard.some((c) => c.instanceId === oRothus.instanceId));
      assert.ok(afterAbyss.players.opponent.graveyard.some((c) => c.instanceId === oBolshack.instanceId));
    });

    it('Apocalypse Day destroys all creatures if 6 or more creatures in battle zone', () => {
      let state = createTestState();
      // 3 friendly creatures
      const { nextState: s1 } = setupCreatureInBZ(state, 'player', vorg, { instanceId: 'f1' });
      const { nextState: s2 } = setupCreatureInBZ(s1, 'player', vorg, { instanceId: 'f2' });
      const { nextState: s3 } = setupCreatureInBZ(s2, 'player', urth, { instanceId: 'f3' });

      // 3 opponent creatures -> total 6
      const { nextState: s4 } = setupCreatureInBZ(s3, 'opponent', aquaKnight, { instanceId: 'o1' });
      const { nextState: s5 } = setupCreatureInBZ(s4, 'opponent', rothus, { instanceId: 'o2' });
      const { nextState: s6 } = setupCreatureInBZ(s5, 'opponent', bolshack, { instanceId: 'o3' });

      const afterApoc = resolveSpellEffect(s6, 'player', apocalypseDay);

      // Both battle zones should be completely empty
      assert.equal(afterApoc.players.player.battleZone.length, 0);
      assert.equal(afterApoc.players.opponent.battleZone.length, 0);
      assert.equal(afterApoc.players.player.graveyard.length, 3);
      // Opponent: Rothus & Bolshack in graveyard, Aqua Knight returned to hand via replacement
      assert.equal(afterApoc.players.opponent.graveyard.length, 2);
      assert.ok(afterApoc.players.opponent.hand.some((c) => c.instanceId === 'o1'));
    });

    it('Apocalypse Day does nothing if fewer than 6 creatures in battle zone', () => {
      let state = createTestState();
      // 2 friendly + 3 opponent = 5 creatures total (< 6)
      const { nextState: s1 } = setupCreatureInBZ(state, 'player', vorg, { instanceId: 'f1' });
      const { nextState: s2 } = setupCreatureInBZ(s1, 'player', vorg, { instanceId: 'f2' });
      const { nextState: s3 } = setupCreatureInBZ(s2, 'opponent', aquaKnight, { instanceId: 'o1' });
      const { nextState: s4 } = setupCreatureInBZ(s3, 'opponent', rothus, { instanceId: 'o2' });
      const { nextState: s5 } = setupCreatureInBZ(s4, 'opponent', bolshack, { instanceId: 'o3' });

      const afterApoc = resolveSpellEffect(s5, 'player', apocalypseDay);

      // All creatures should remain untouched
      assert.equal(afterApoc.players.player.battleZone.length, 2);
      assert.equal(afterApoc.players.opponent.battleZone.length, 3);
      assert.ok(
        afterApoc.actionLog.some((log) =>
          log.includes('there are only 5 creature(s) in the battle zone')
        )
      );
    });

    it('Apocalypse Vise destroys targeted opponent creatures within 8000 total power', () => {
      let state = createTestState();
      // Opponent: Hulcus (2000), Rothus (4000), Vorg (2000) -> sum = 8000
      const { nextState: s1, creature: oHulcus } = setupCreatureInBZ(state, 'opponent', aquaHulcus, {
        instanceId: 'o-h'
      });
      const { nextState: s2, creature: oRothus } = setupCreatureInBZ(s1, 'opponent', rothus, {
        instanceId: 'o-r'
      });
      const { nextState: s3, creature: oVorg } = setupCreatureInBZ(s2, 'opponent', vorg, {
        instanceId: 'o-v'
      });
      // Opponent: Bolshack (6000) -> not targeted
      const { nextState: s4, creature: oBolshack } = setupCreatureInBZ(s3, 'opponent', bolshack, {
        instanceId: 'o-b'
      });

      const targets = [oHulcus.instanceId, oRothus.instanceId, oVorg.instanceId];
      const afterVise = resolveSpellEffect(s4, 'player', apocalypseVise, targets);

      // Bolshack should remain
      assert.equal(afterVise.players.opponent.battleZone.length, 1);
      assert.equal(afterVise.players.opponent.battleZone[0].instanceId, oBolshack.instanceId);
      // Targeted 3 creatures destroyed
      assert.ok(afterVise.players.opponent.graveyard.some((c) => c.instanceId === oHulcus.instanceId));
      assert.ok(afterVise.players.opponent.graveyard.some((c) => c.instanceId === oRothus.instanceId));
      assert.ok(afterVise.players.opponent.graveyard.some((c) => c.instanceId === oVorg.instanceId));
    });

    it('Apocalypse Vise throws error if targeted creatures exceed 8000 total power', () => {
      let state = createTestState();
      // Opponent: Urth (6000) + Rothus (4000) = 10000 > 8000
      const { nextState: s1, creature: oUrth } = setupCreatureInBZ(state, 'opponent', urth);
      const { nextState: s2, creature: oRothus } = setupCreatureInBZ(s1, 'opponent', rothus);

      assert.throws(
        () => {
          resolveSpellEffect(s2, 'player', apocalypseVise, [oUrth.instanceId, oRothus.instanceId]);
        },
        /exceeding the 8000 limit/i
      );
    });

    it('Apocalypse Vise greedily selects opponent creatures up to 8000 total power if no targets provided', () => {
      let state = createTestState();
      // Opponent: Bolshack (6000), Hulcus (2000), Vorg (2000)
      // Greedy descending by power: Bolshack (6000) + Hulcus (2000) = 8000. Vorg (2000) won't fit.
      const { nextState: s1, creature: oBolshack } = setupCreatureInBZ(state, 'opponent', bolshack);
      const { nextState: s2, creature: oHulcus } = setupCreatureInBZ(s1, 'opponent', aquaHulcus);
      const { nextState: s3, creature: oVorg } = setupCreatureInBZ(s2, 'opponent', vorg);

      const afterVise = resolveSpellEffect(s3, 'player', apocalypseVise);

      // Exactly 1 creature remains (Vorg)
      assert.equal(afterVise.players.opponent.battleZone.length, 1);
      assert.equal(afterVise.players.opponent.battleZone[0].instanceId, oVorg.instanceId);
      assert.ok(afterVise.players.opponent.graveyard.some((c) => c.instanceId === oBolshack.instanceId));
      assert.ok(afterVise.players.opponent.graveyard.some((c) => c.instanceId === oHulcus.instanceId));
    });

    it('Abduction Charger bounces up to 2 targeted creatures and routes to mana zone as Charger', () => {
      let state = createTestState();
      // Friendly: Urth
      const { nextState: s1, creature: fUrth } = setupCreatureInBZ(state, 'player', urth);
      // Opponent: Bolshack
      const { nextState: s2, creature: oBolshack } = setupCreatureInBZ(s1, 'opponent', bolshack);

      // Setup player with Abduction Charger in hand and 7 untapped Water mana
      const chargerInstance = createCardInstance(abductionCharger, 'player');
      const waterManaCards = Array.from({ length: 7 }, (_, i) => ({
        instanceId: `mana-w-${i}`,
        card: aquaSoldier,
        isTapped: false
      }));

      const stateForCast = {
        ...s2,
        activePlayer: 'player',
        phase: 'MAIN',
        players: {
          ...s2.players,
          player: {
            ...s2.players.player,
            hand: [chargerInstance],
            manaZone: waterManaCards
          }
        }
      };

      const afterCast = castSpell(
        stateForCast,
        'player',
        chargerInstance.instanceId,
        [fUrth.instanceId, oBolshack.instanceId]
      );

      // Both creatures bounced to their respective owner hands
      assert.equal(afterCast.players.player.battleZone.length, 0);
      assert.equal(afterCast.players.opponent.battleZone.length, 0);
      assert.ok(afterCast.players.player.hand.some((c) => c.instanceId === fUrth.instanceId));
      assert.ok(afterCast.players.opponent.hand.some((c) => c.instanceId === oBolshack.instanceId));

      // Abduction Charger must be in player's mana zone (Charger mechanic)
      assert.ok(
        afterCast.players.player.manaZone.some((m) => m.instanceId === chargerInstance.instanceId)
      );
      // Not in graveyard
      assert.ok(
        !afterCast.players.player.graveyard.some((c) => c.instanceId === chargerInstance.instanceId)
      );
    });
  });

  // =========================================================================
  // 2. GRAVEYARD SALVAGE SPELLS
  // =========================================================================
  describe('2. Graveyard Salvage Spells', () => {
    it('Dark Reversal salvages targeted creature from graveyard to hand', () => {
      let state = createTestState();
      const graveCreature1 = createCardInstance(vorg, 'player');
      const graveCreature2 = createCardInstance(urth, 'player');
      const graveSpell = createCardInstance(terrorPit, 'player');

      const sWithGrave = {
        ...state,
        players: {
          ...state.players,
          player: {
            ...state.players.player,
            graveyard: [graveCreature1, graveCreature2, graveSpell]
          }
        }
      };

      const afterReversal = resolveSpellEffect(
        sWithGrave,
        'player',
        darkReversal,
        [graveCreature1.instanceId]
      );

      // Vorg moved to hand
      assert.ok(afterReversal.players.player.hand.some((c) => c.instanceId === graveCreature1.instanceId));
      // Urth and Terror Pit still in graveyard
      assert.ok(
        afterReversal.players.player.graveyard.some((c) => c.instanceId === graveCreature2.instanceId)
      );
      assert.ok(
        afterReversal.players.player.graveyard.some((c) => c.instanceId === graveSpell.instanceId)
      );
    });

    it('Dark Reversal auto-picks highest power creature when no targets provided', () => {
      let state = createTestState();
      const graveVorg = createCardInstance(vorg, 'player'); // 2000
      const graveUrth = createCardInstance(urth, 'player'); // 6000
      const graveHulcus = createCardInstance(aquaHulcus, 'player'); // 2000

      const sWithGrave = {
        ...state,
        players: {
          ...state.players,
          player: {
            ...state.players.player,
            graveyard: [graveVorg, graveUrth, graveHulcus]
          }
        }
      };

      const afterReversal = resolveSpellEffect(sWithGrave, 'player', darkReversal);

      // Urth has highest power (6000) -> salvaged to hand
      assert.ok(afterReversal.players.player.hand.some((c) => c.instanceId === graveUrth.instanceId));
      assert.ok(
        !afterReversal.players.player.graveyard.some((c) => c.instanceId === graveUrth.instanceId)
      );
    });

    it('Corpse Charger salvages a creature to hand and goes to mana zone when cast', () => {
      let state = createTestState();
      const graveVorg = createCardInstance(vorg, 'player');
      const corpseChargerInstance = createCardInstance(corpseCharger, 'player');

      // Darkness mana for cast
      const darkManaCards = Array.from({ length: 4 }, (_, i) => ({
        instanceId: `mana-d-${i}`,
        card: terrorPit,
        isTapped: false
      }));

      const stateForCast = {
        ...state,
        activePlayer: 'player',
        phase: 'MAIN',
        players: {
          ...state.players,
          player: {
            ...state.players.player,
            hand: [corpseChargerInstance],
            manaZone: darkManaCards,
            graveyard: [graveVorg]
          }
        }
      };

      const afterCast = castSpell(stateForCast, 'player', corpseChargerInstance.instanceId);

      // Vorg salvaged to hand
      assert.ok(afterCast.players.player.hand.some((c) => c.instanceId === graveVorg.instanceId));
      // Corpse Charger placed in mana zone
      assert.ok(
        afterCast.players.player.manaZone.some(
          (m) => m.instanceId === corpseChargerInstance.instanceId
        )
      );
    });

    it('Morbid Medicine returns up to 2 targeted creatures from graveyard to hand', () => {
      let state = createTestState();
      const grave1 = createCardInstance(vorg, 'player');
      const grave2 = createCardInstance(aquaHulcus, 'player');
      const grave3 = createCardInstance(urth, 'player');

      const sWithGrave = {
        ...state,
        players: {
          ...state.players,
          player: {
            ...state.players.player,
            graveyard: [grave1, grave2, grave3]
          }
        }
      };

      const afterMorbid = resolveSpellEffect(
        sWithGrave,
        'player',
        morbidMedicine,
        [grave1.instanceId, grave2.instanceId]
      );

      // grave1 and grave2 returned to hand
      assert.ok(afterMorbid.players.player.hand.some((c) => c.instanceId === grave1.instanceId));
      assert.ok(afterMorbid.players.player.hand.some((c) => c.instanceId === grave2.instanceId));
      // grave3 remains in graveyard
      assert.ok(afterMorbid.players.player.graveyard.some((c) => c.instanceId === grave3.instanceId));
    });

    it('Morbid Medicine auto-salvages top 2 highest power creatures when no targets provided', () => {
      let state = createTestState();
      const graveVorg = createCardInstance(vorg, 'player'); // 2000
      const graveUrth = createCardInstance(urth, 'player'); // 6000
      const graveRothus = createCardInstance(rothus, 'player'); // 4000

      const sWithGrave = {
        ...state,
        players: {
          ...state.players,
          player: {
            ...state.players.player,
            graveyard: [graveVorg, graveUrth, graveRothus]
          }
        }
      };

      const afterMorbid = resolveSpellEffect(sWithGrave, 'player', morbidMedicine);

      // Urth (6000) and Rothus (4000) salvaged to hand
      assert.ok(afterMorbid.players.player.hand.some((c) => c.instanceId === graveUrth.instanceId));
      assert.ok(afterMorbid.players.player.hand.some((c) => c.instanceId === graveRothus.instanceId));
      // Vorg remains in graveyard
      assert.ok(afterMorbid.players.player.graveyard.some((c) => c.instanceId === graveVorg.instanceId));
    });

    it('Zombie Carnival salvages up to 3 targeted creatures that share a common race', () => {
      let state = createTestState();
      // 3 Liquid People creatures: Aqua Soldier, Aqua Hulcus, Aqua Knight
      const grave1 = createCardInstance(aquaSoldier, 'player');
      const grave2 = createCardInstance(aquaHulcus, 'player');
      const grave3 = createCardInstance(aquaKnight, 'player');
      const grave4 = createCardInstance(urth, 'player'); // Angel Command

      const sWithGrave = {
        ...state,
        players: {
          ...state.players,
          player: {
            ...state.players.player,
            graveyard: [grave1, grave2, grave3, grave4]
          }
        }
      };

      const targets = [grave1.instanceId, grave2.instanceId, grave3.instanceId];
      const afterZombie = resolveSpellEffect(sWithGrave, 'player', zombieCarnival, targets);

      // All 3 Liquid People returned to hand
      assert.ok(afterZombie.players.player.hand.some((c) => c.instanceId === grave1.instanceId));
      assert.ok(afterZombie.players.player.hand.some((c) => c.instanceId === grave2.instanceId));
      assert.ok(afterZombie.players.player.hand.some((c) => c.instanceId === grave3.instanceId));
      // Urth remains in graveyard
      assert.ok(afterZombie.players.player.graveyard.some((c) => c.instanceId === grave4.instanceId));
    });

    it('Zombie Carnival throws error if targeted creatures do not share a common race', () => {
      let state = createTestState();
      const graveSoldier = createCardInstance(aquaSoldier, 'player'); // Liquid People
      const graveUrth = createCardInstance(urth, 'player'); // Angel Command

      const sWithGrave = {
        ...state,
        players: {
          ...state.players,
          player: {
            ...state.players.player,
            graveyard: [graveSoldier, graveUrth]
          }
        }
      };

      assert.throws(
        () => {
          resolveSpellEffect(sWithGrave, 'player', zombieCarnival, [
            graveSoldier.instanceId,
            graveUrth.instanceId
          ]);
        },
        /do not share a common race/i
      );
    });

    it('Zombie Carnival auto-detects most common race in graveyard when no targets provided', () => {
      let state = createTestState();
      // Graveyard contains: 3 Humans (Vorg), 1 Angel Command (Urth)
      const graveHuman1 = createCardInstance(vorg, 'player');
      const graveHuman2 = createCardInstance(vorg, 'player');
      const graveHuman3 = createCardInstance(vorg, 'player');
      const graveAngel = createCardInstance(urth, 'player');

      const sWithGrave = {
        ...state,
        players: {
          ...state.players,
          player: {
            ...state.players.player,
            graveyard: [graveHuman1, graveHuman2, graveHuman3, graveAngel]
          }
        }
      };

      const afterZombie = resolveSpellEffect(sWithGrave, 'player', zombieCarnival);

      // Most common race is Human (3 copies) -> returns up to 3 Humans to hand
      assert.ok(afterZombie.players.player.hand.some((c) => c.instanceId === graveHuman1.instanceId));
      assert.ok(afterZombie.players.player.hand.some((c) => c.instanceId === graveHuman2.instanceId));
      assert.ok(afterZombie.players.player.hand.some((c) => c.instanceId === graveHuman3.instanceId));
      // Urth remains in graveyard
      assert.ok(afterZombie.players.player.graveyard.some((c) => c.instanceId === graveAngel.instanceId));
    });
  });

  // =========================================================================
  // 3. HAND & MANA DESTRUCTION SPELLS
  // =========================================================================
  describe('3. Hand & Mana Destruction Spells', () => {
    it('Lost Soul discards all cards from opponent hand into graveyard', () => {
      let state = createTestState();
      // Opponent has 5 cards in hand initially
      const opponentHandCards = [...state.players.opponent.hand];
      assert.ok(opponentHandCards.length > 0);

      const afterLostSoul = resolveSpellEffect(state, 'player', lostSoul);

      // Opponent hand is completely empty
      assert.equal(afterLostSoul.players.opponent.hand.length, 0);
      // Opponent graveyard received all cards from hand
      for (const card of opponentHandCards) {
        assert.ok(
          afterLostSoul.players.opponent.graveyard.some((c) => c.instanceId === card.instanceId)
        );
      }
    });

    it('Lost Soul handles empty opponent hand gracefully', () => {
      let state = createTestState();
      const sEmptyOppHand = {
        ...state,
        players: {
          ...state.players,
          opponent: {
            ...state.players.opponent,
            hand: []
          }
        }
      };

      const afterLostSoul = resolveSpellEffect(sEmptyOppHand, 'player', lostSoul);
      assert.equal(afterLostSoul.players.opponent.hand.length, 0);
      assert.ok(
        afterLostSoul.actionLog.some((log) => log.includes("opponent's hand is empty"))
      );
    });

    it('Mana Crisis destroys 1 targeted card in opponent mana zone into graveyard', () => {
      let state = createTestState();
      const oppMana1 = { instanceId: 'opp-m1', card: vorg, isTapped: false };
      const oppMana2 = { instanceId: 'opp-m2', card: urth, isTapped: false };

      const sWithOppMana = {
        ...state,
        players: {
          ...state.players,
          opponent: {
            ...state.players.opponent,
            manaZone: [oppMana1, oppMana2]
          }
        }
      };

      const afterCrisis = resolveSpellEffect(
        sWithOppMana,
        'player',
        manaCrisis,
        [oppMana2.instanceId]
      );

      // oppMana2 was destroyed and moved to opponent graveyard
      assert.equal(afterCrisis.players.opponent.manaZone.length, 1);
      assert.equal(afterCrisis.players.opponent.manaZone[0].instanceId, oppMana1.instanceId);
      assert.ok(
        afterCrisis.players.opponent.graveyard.some((c) => c.instanceId === oppMana2.instanceId)
      );
    });

    it('Mana Crisis auto-picks first mana card when no targets provided', () => {
      let state = createTestState();
      const oppMana1 = { instanceId: 'opp-m1', card: vorg, isTapped: false };
      const oppMana2 = { instanceId: 'opp-m2', card: urth, isTapped: false };

      const sWithOppMana = {
        ...state,
        players: {
          ...state.players,
          opponent: {
            ...state.players.opponent,
            manaZone: [oppMana1, oppMana2]
          }
        }
      };

      const afterCrisis = resolveSpellEffect(sWithOppMana, 'player', manaCrisis);

      // oppMana1 was destroyed
      assert.equal(afterCrisis.players.opponent.manaZone.length, 1);
      assert.equal(afterCrisis.players.opponent.manaZone[0].instanceId, oppMana2.instanceId);
      assert.ok(
        afterCrisis.players.opponent.graveyard.some((c) => c.instanceId === oppMana1.instanceId)
      );
    });

    it('Reap and Sow destroys 1 opponent mana card AND ramps top card of deck to mana zone', () => {
      let state = createTestState();
      const oppMana1 = { instanceId: 'opp-m1', card: vorg, isTapped: false };
      const oppMana2 = { instanceId: 'opp-m2', card: urth, isTapped: false };

      const topDeckCard = createCardInstance(vorg, 'player');

      const sWithSetup = {
        ...state,
        players: {
          ...state.players,
          opponent: {
            ...state.players.opponent,
            manaZone: [oppMana1, oppMana2]
          },
          player: {
            ...state.players.player,
            deck: [topDeckCard, ...state.players.player.deck.slice(1)],
            manaZone: []
          }
        }
      };

      const afterReap = resolveSpellEffect(sWithSetup, 'player', reapAndSow, [oppMana1.instanceId]);

      // 1. Opponent mana destroyed
      assert.equal(afterReap.players.opponent.manaZone.length, 1);
      assert.equal(afterReap.players.opponent.manaZone[0].instanceId, oppMana2.instanceId);
      assert.ok(
        afterReap.players.opponent.graveyard.some((c) => c.instanceId === oppMana1.instanceId)
      );

      // 2. Player mana ramped from top of deck
      assert.equal(afterReap.players.player.manaZone.length, 1);
      assert.equal(afterReap.players.player.manaZone[0].instanceId, topDeckCard.instanceId);
      assert.equal(afterReap.players.player.manaZone[0].isTapped, false); // mono-civ enters untapped
    });
  });
});
