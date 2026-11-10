import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkStealth,
  canCreatureAttackUntapped,
  triggerAttack,
  triggerEndTurn
} from '../effects.ts';
import {
  canDeclareAttack,
  declareAttack,
  getCreatureEffectivePower
} from '../combat.ts';
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

describe('Declarative Effect Engine: Attack Triggers, Stealth & Untapped Combat', () => {
  const vorg = findCard('Immortal Baron, Vorg'); // Fire creature, cost 2, 2000 power
  const gatlingSkyterror = findCard('Gatling Skyterror'); // Armored Wyvern, Fire, 7000 power, can attack untapped creatures
  const hypersquidWalter = findCard('Hypersquid Walter'); // Cyber Lord, Water, 1000 power, draw 1 on attack
  const kizarBasiku = findCard('Kizar Basiku, the Outrageous'); // Initiate, Light, 8500 power, Fire stealth
  const horridWorm = findCard('Horrid Worm'); // Parasite Worm, Darkness, 2000 power, opponent discards on attack
  const muramasa = findCard('Muramasa, Duke of Blades'); // Human, Fire, 3000 power, destroy <= 2000 on attack
  const metalwingSkyterror = findCard('Metalwing Skyterror'); // Fire, 6000 power, destroy blocker on attack
  const bloodwingMantis = findCard('Bloodwing Mantis'); // Giant Insect, Nature, 6000 power, return 2 creatures from mana on attack
  const quillspikeRumbler = findCard('Quillspike Rumbler'); // Beast Folk, Nature, 3000 power, +3000 when attacking a creature
  const aeris = findCard('Aeris, Flight Elemental'); // Angel Command, Light, can attack untapped darkness creatures
  const senatineJadeTree = findCard('Senatine Jade Tree'); // Starlight Tree, Light, 4000 power, Blocker
  const bloodySquito = findCard('Bloody Squito'); // Brain Jacker, Darkness, 4000 power, Blocker
  const bronzeArmTribe = findCard('Bronze-Arm Tribe'); // Beast Folk, Nature, 1000 power

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
    const instanceId = options.instanceId || `test-creature-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const creature = {
      instanceId,
      card,
      owner: player,
      isTapped: options.isTapped ?? false,
      summonedTurn: options.summonedTurn ?? (state.turn - 1),
      powerModifier: options.powerModifier ?? 0
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

  function setupManaCard(state, player, card, isTapped = false) {
    const manaInstance = {
      instanceId: `mana-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      card,
      isTapped
    };
    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...state.players[player],
          manaZone: [...state.players[player].manaZone, manaInstance]
        }
      }
    };
  }

  describe('1. Civilization Stealth Mechanics', () => {
    it('checkStealth returns true when defender has matching civilization in mana zone', () => {
      const { creature: kizar } = setupCreatureInBZ(createTestState(), 'player', kizarBasiku);
      // Kizar has Fire stealth. Opponent mana zone with Vorg (Fire)
      const fireMana = [{ instanceId: 'm1', card: vorg, isTapped: false }];
      assert.equal(checkStealth(kizar, fireMana), true);
    });

    it('checkStealth returns false when defender has NO matching civilization in mana zone', () => {
      const { creature: kizar } = setupCreatureInBZ(createTestState(), 'player', kizarBasiku);
      // Kizar has Fire stealth. Opponent mana zone with Bronze-Arm Tribe (Nature only)
      const natureMana = [{ instanceId: 'm2', card: bronzeArmTribe, isTapped: false }];
      assert.equal(checkStealth(kizar, natureMana), false);
    });

    it('checkStealth returns true when defender has multi-civ card matching stealth civ', () => {
      const { creature: kizar } = setupCreatureInBZ(createTestState(), 'player', kizarBasiku);
      const multiCivCard = {
        id: 'multi-1',
        name: 'Fire Nature Hybrid',
        civilizations: ['Fire', 'Nature'],
        type: 'Creature',
        cost: 4
      };
      const multiMana = [{ instanceId: 'm3', card: multiCivCard, isTapped: true }];
      assert.equal(checkStealth(kizar, multiMana), true);
    });

    it('checkStealth returns false for creatures without stealth ability', () => {
      const { creature: nonStealth } = setupCreatureInBZ(createTestState(), 'player', vorg);
      const fireMana = [{ instanceId: 'm1', card: vorg, isTapped: false }];
      assert.equal(checkStealth(nonStealth, fireMana), false);
    });

    it('Fire stealth attacking opponent with Fire in mana zone bypasses blockers completely', () => {
      let state = createTestState();
      // Setup Kizar Basiku (Fire stealth, 8500 power) on player side
      const { nextState: s1, creature: attacker } = setupCreatureInBZ(state, 'player', kizarBasiku);
      // Setup Senatine Jade Tree (Blocker) on opponent side
      const { nextState: s2 } = setupCreatureInBZ(s1, 'opponent', senatineJadeTree);
      // Setup Vorg (Fire card) in opponent mana zone
      const s3 = setupManaCard(s2, 'opponent', vorg);

      // Attack opponent shield
      const afterAttack = declareAttack(s3, attacker.instanceId, { type: 'shield', index: 0 });

      // No blocker prompt should appear! Directly broke shield!
      assert.equal(afterAttack.pendingInteraction, null);
      assert.equal(afterAttack.players.opponent.shields.length, 3);
      assert.ok(
        afterAttack.actionLog.some((log) => log.includes('broke 2 shield(s)'))
      );
    });

    it('Fire stealth attacking opponent with NO Fire in mana zone CAN be blocked', () => {
      let state = createTestState();
      const { nextState: s1, creature: attacker } = setupCreatureInBZ(state, 'player', kizarBasiku);
      const { nextState: s2, creature: blocker } = setupCreatureInBZ(s1, 'opponent', senatineJadeTree);
      // Opponent only has Nature in mana zone
      const s3 = setupManaCard(s2, 'opponent', bronzeArmTribe);

      const afterAttack = declareAttack(s3, attacker.instanceId, { type: 'shield', index: 0 });

      // Blocker declaration prompt MUST be queued because stealth is inactive
      assert.notEqual(afterAttack.pendingInteraction, null);
      assert.equal(afterAttack.pendingInteraction?.type, 'BLOCK_DECLARATION');
      assert.ok(afterAttack.pendingInteraction?.validBlockerIds.includes(blocker.instanceId));
    });
  });

  describe('2. Untapped Creature Combat & Targeting', () => {
    it('canCreatureAttackUntapped identifies general and civ-specific untapped attack abilities', () => {
      const { creature: gatling } = setupCreatureInBZ(createTestState(), 'player', gatlingSkyterror);
      const { creature: aerisCreature } = setupCreatureInBZ(createTestState(), 'player', aeris);
      const { creature: normal } = setupCreatureInBZ(createTestState(), 'player', vorg);
      const { creature: darknessDef } = setupCreatureInBZ(createTestState(), 'opponent', horridWorm);
      const { creature: fireDef } = setupCreatureInBZ(createTestState(), 'opponent', vorg);

      // Gatling Skyterror can attack any untapped creature
      assert.equal(canCreatureAttackUntapped(gatling), true);
      assert.equal(canCreatureAttackUntapped(gatling, darknessDef), true);
      assert.equal(canCreatureAttackUntapped(gatling, fireDef), true);

      // Aeris can only attack untapped Darkness creatures
      assert.equal(canCreatureAttackUntapped(aerisCreature, darknessDef), true);
      assert.equal(canCreatureAttackUntapped(aerisCreature, fireDef), false);

      // Normal creature cannot attack untapped creatures
      assert.equal(canCreatureAttackUntapped(normal), false);
      assert.equal(canCreatureAttackUntapped(normal, darknessDef), false);
    });

    it('allows creature with untapped attack ability to declare attack on an untapped opponent creature', () => {
      let state = createTestState();
      const { nextState: s1, creature: attacker } = setupCreatureInBZ(state, 'player', gatlingSkyterror);
      // Opponent has untapped defender
      const { nextState: s2, creature: defender } = setupCreatureInBZ(s1, 'opponent', vorg, { isTapped: false });

      const validation = canDeclareAttack(s2, attacker.instanceId, {
        type: 'creature',
        instanceId: defender.instanceId
      });
      assert.equal(validation.valid, true);

      // Execute attack
      const afterAttack = declareAttack(s2, attacker.instanceId, {
        type: 'creature',
        instanceId: defender.instanceId
      });

      // Gatling (7000 power) destroys untapped Vorg (2000 power)
      assert.equal(afterAttack.players.opponent.battleZone.length, 0);
      assert.equal(afterAttack.players.opponent.graveyard.length, 1);
      assert.equal(afterAttack.players.player.battleZone.length, 1);
      assert.ok(
        afterAttack.actionLog.some((log) => log.includes('Battle: Gatling Skyterror'))
      );
    });

    it('rejects creature without ability from attacking an untapped opponent creature', () => {
      let state = createTestState();
      const { nextState: s1, creature: attacker } = setupCreatureInBZ(state, 'player', vorg);
      const { nextState: s2, creature: defender } = setupCreatureInBZ(s1, 'opponent', vorg, { isTapped: false });

      const validation = canDeclareAttack(s2, attacker.instanceId, {
        type: 'creature',
        instanceId: defender.instanceId
      });
      assert.equal(validation.valid, false);
      assert.equal(validation.reason, 'Cannot attack an untapped creature.');
    });

    it('respects civilization restriction when attacking untapped creatures (Aeris)', () => {
      let state = createTestState();
      const { nextState: s1, creature: attacker } = setupCreatureInBZ(state, 'player', aeris);
      const { nextState: s2, creature: darkDef } = setupCreatureInBZ(s1, 'opponent', horridWorm, { isTapped: false });
      const { nextState: s3, creature: fireDef } = setupCreatureInBZ(s2, 'opponent', vorg, { isTapped: false });

      // Can attack untapped Darkness creature
      const validDark = canDeclareAttack(s3, attacker.instanceId, {
        type: 'creature',
        instanceId: darkDef.instanceId
      });
      assert.equal(validDark.valid, true);

      // Cannot attack untapped Fire creature
      const invalidFire = canDeclareAttack(s3, attacker.instanceId, {
        type: 'creature',
        instanceId: fireDef.instanceId
      });
      assert.equal(invalidFire.valid, false);
    });
  });

  describe('3. On-Attack Triggers', () => {
    it('On-attack Card Draw: Hypersquid Walter draws a card on attack declaration', () => {
      let state = createTestState();
      const { nextState: s1, creature: walter } = setupCreatureInBZ(state, 'player', hypersquidWalter);

      const initialHand = s1.players.player.hand.length;
      const initialDeck = s1.players.player.deck.length;

      const afterAttack = declareAttack(s1, walter.instanceId, { type: 'shield', index: 0 });

      assert.equal(afterAttack.players.player.hand.length, initialHand + 1);
      assert.equal(afterAttack.players.player.deck.length, initialDeck - 1);
      assert.ok(afterAttack.actionLog.some((log) => log.includes('player drew 1 card(s)')));
    });

    it('On-attack Opponent Discard: Horrid Worm forces opponent to discard a card on attack', () => {
      let state = createTestState();
      const { nextState: s1, creature: worm } = setupCreatureInBZ(state, 'player', horridWorm);

      // Give opponent 2 cards in hand
      const oppCard = createCardInstance(vorg, 'opponent');
      const s2 = {
        ...s1,
        players: {
          ...s1.players,
          opponent: {
            ...s1.players.opponent,
            hand: [oppCard, createCardInstance(vorg, 'opponent')]
          }
        }
      };

      const initialOppHand = s2.players.opponent.hand.length;
      const initialOppGrave = s2.players.opponent.graveyard.length;

      const afterAttack = declareAttack(s2, worm.instanceId, { type: 'shield', index: 0 });

      assert.equal(afterAttack.players.opponent.hand.length, initialOppHand + 1 - 1); // +1 broken shield - 1 discarded
      assert.equal(afterAttack.players.opponent.graveyard.length, initialOppGrave + 1);
      assert.ok(afterAttack.actionLog.some((log) => log.includes('opponent discarded')));
    });

    it('On-attack Shield Add: Creature with shield add ability adds top card to shields', () => {
      let state = createTestState();
      const cosmicAttackerCard = {
        id: 'cosmic-creature-1',
        name: 'Cosmic Wing Attacker',
        civilizations: ['Light'],
        type: 'Creature',
        cost: 4,
        power: 3000,
        rulesText: 'Whenever this creature attacks, you may add the top card of your deck to your shields.'
      };

      const { nextState: s1, creature: cosmicCreature } = setupCreatureInBZ(state, 'player', cosmicAttackerCard);

      const initialShields = s1.players.player.shields.length;
      const initialDeck = s1.players.player.deck.length;

      const afterAttack = declareAttack(s1, cosmicCreature.instanceId, { type: 'shield', index: 0 });

      assert.equal(afterAttack.players.player.shields.length, initialShields + 1);
      assert.equal(afterAttack.players.player.deck.length, initialDeck - 1);
      assert.ok(
        afterAttack.actionLog.some((log) => log.includes('added 1 card(s) from the top of the deck to shields'))
      );
    });

    it('On-attack Blocker Destruction: Metalwing Skyterror destroys opponent blocker before block step', () => {
      let state = createTestState();
      const { nextState: s1, creature: attacker } = setupCreatureInBZ(state, 'player', metalwingSkyterror);
      const { nextState: s2, creature: blocker } = setupCreatureInBZ(s1, 'opponent', senatineJadeTree);

      // Opponent controls an untapped blocker, but Metalwing Skyterror destroys it on attack!
      const afterAttack = declareAttack(s2, attacker.instanceId, { type: 'shield', index: 0 });

      // Blocker should be in graveyard, battle zone empty, no block prompt!
      assert.equal(afterAttack.pendingInteraction, null);
      assert.equal(afterAttack.players.opponent.battleZone.length, 0);
      assert.equal(afterAttack.players.opponent.graveyard.length, 1);
      assert.ok(
        afterAttack.actionLog.some((log) => log.includes('was destroyed and sent to the graveyard'))
      );
    });

    it('On-attack Power-based Destruction: Muramasa destroys opponent creature with <= 2000 power', () => {
      let state = createTestState();
      const { nextState: s1, creature: attacker } = setupCreatureInBZ(state, 'player', muramasa);
      // Opponent has Vorg (2000 power)
      const { nextState: s2, creature: weakCreature } = setupCreatureInBZ(s1, 'opponent', vorg);

      const afterAttack = declareAttack(s2, attacker.instanceId, { type: 'shield', index: 0 });

      assert.equal(afterAttack.players.opponent.battleZone.length, 0);
      assert.equal(afterAttack.players.opponent.graveyard.length, 1);
      assert.equal(afterAttack.players.opponent.graveyard[0].card.name, 'Immortal Baron, Vorg');
    });

    it('On-attack Power Buff: Quillspike Rumbler gets +3000 power when attacking a creature', () => {
      let state = createTestState();
      // Quillspike Rumbler has 3000 base power; +3000 when attacking a creature = 6000 power
      const { nextState: s1, creature: attacker } = setupCreatureInBZ(state, 'player', quillspikeRumbler);
      // Opponent has tapped creature with 5000 power
      const strongOpponentCard = {
        id: 'strong-1',
        name: 'Strong Defender',
        civilizations: ['Nature'],
        type: 'Creature',
        cost: 5,
        power: 5000
      };
      const { nextState: s2, creature: defender } = setupCreatureInBZ(s1, 'opponent', strongOpponentCard, { isTapped: true });

      // Before attack: base power 3000 vs defender 5000
      assert.equal(getCreatureEffectivePower(attacker, false), 3000);

      // Declare attack on creature
      const afterAttack = declareAttack(s2, attacker.instanceId, {
        type: 'creature',
        instanceId: defender.instanceId
      });

      // Rumbler (3000 base + 3000 buff = 6000) beats Strong Defender (5000)
      // Attacker survives; defender is destroyed!
      assert.equal(afterAttack.players.player.battleZone.length, 1);
      assert.equal(afterAttack.players.opponent.battleZone.length, 0);
      assert.equal(afterAttack.players.opponent.graveyard.length, 1);
      assert.ok(
        afterAttack.actionLog.some((log) => log.includes('gained +3000 power on attack'))
      );

      // At end of turn, the temporary power buff resets
      const stateEndTurn = triggerEndTurn(afterAttack, 'player');
      const resetAttacker = stateEndTurn.players.player.battleZone[0];
      assert.equal(resetAttacker.powerModifier, 0);
    });

    it('On-attack Mana Salvage: Bloodwing Mantis returns 2 creatures from mana zone to hand', () => {
      let state = createTestState();
      const { nextState: s1, creature: attacker } = setupCreatureInBZ(state, 'player', bloodwingMantis);
      // Put 2 creatures in player's mana zone
      const s2 = setupManaCard(s1, 'player', vorg);
      const s3 = setupManaCard(s2, 'player', bronzeArmTribe);

      const initialManaCount = s3.players.player.manaZone.length;
      const initialHandCount = s3.players.player.hand.length;

      const afterAttack = declareAttack(s3, attacker.instanceId, { type: 'shield', index: 0 });

      assert.equal(afterAttack.players.player.manaZone.length, initialManaCount - 2);
      assert.equal(afterAttack.players.player.hand.length, initialHandCount + 2);
      assert.ok(
        afterAttack.actionLog.some((log) => log.includes('returned Immortal Baron, Vorg, Bronze-Arm Tribe from mana zone to hand'))
      );
    });

    it('On-attack Tapping: Le Quist taps an untapped opponent creature on attack', () => {
      let state = createTestState();
      const leQuist = findCard('Le Quist, the Oracle');
      const { nextState: s1, creature: attacker } = setupCreatureInBZ(state, 'player', leQuist);
      // Opponent has untapped Darkness creature
      const { nextState: s2, creature: oppDarkness } = setupCreatureInBZ(s1, 'opponent', horridWorm, { isTapped: false });

      assert.equal(oppDarkness.isTapped, false);

      const afterAttack = declareAttack(s2, attacker.instanceId, { type: 'shield', index: 0 });

      const updatedOpp = afterAttack.players.opponent.battleZone.find((c) => c.instanceId === oppDarkness.instanceId);
      assert.equal(updatedOpp?.isTapped, true);
      assert.ok(
        afterAttack.actionLog.some((log) => log.includes('tapped Horrid Worm on attack'))
      );
    });
  });
});
