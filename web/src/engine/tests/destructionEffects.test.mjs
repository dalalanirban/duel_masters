import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  destroyCreature,
  bounceCreature,
  resolveSpellEffect
} from '../spells.ts';
import {
  triggerDestroyed
} from '../effects.ts';
import {
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

describe('Declarative Effect Engine: Destruction Replacement & Leaves-Play Triggers', () => {
  const vorg = findCard('Immortal Baron, Vorg'); // Fire creature, 2000 power
  const terrorPit = findCard('Terror Pit'); // Darkness spell, destroys creature
  const aquaSoldier = findCard('Aqua Soldier'); // Water creature, 1000 power, bounce on destruction
  const chilias = findCard('Chilias, the Oracle'); // Light creature, 2500 power, bounce on destruction
  const aquaHulcus = findCard('Aqua Hulcus'); // Water creature, 2000 power
  const crystalJouster = findCard('Crystal Jouster'); // Liquid People evo, bounce on destruction
  const cetibols = findCard('Cetibols'); // Water creature, draw 1 on destruction
  const propellerMutant = findCard('Propeller Mutant'); // Darkness creature, opponent discards on destruction
  const mightyShouter = findCard('Mighty Shouter'); // Nature creature, mana zone on destruction
  const coilingVines = findCard('Coiling Vines'); // Nature creature, mana zone on destruction

  // Mock definition for Pochan, Ocean Guardian (specified in Task 3 prompt)
  const pochan = {
    id: 'dm-custom-pochan',
    name: 'Pochan, Ocean Guardian',
    set: 'DM-02',
    collectorNumber: '99',
    civilizations: ['Water'],
    type: 'Creature',
    manaCost: 3,
    manaNumber: 1,
    power: 2000,
    races: ['Guardian'],
    isShieldTrigger: false,
    isBlocker: false,
    isSlayer: false,
    isSpeedAttacker: false,
    powerAttackerBonus: 0,
    breakerCount: 1,
    rulesText: 'When this creature would be destroyed, put it into your mana zone instead.',
    rarity: 'Common',
    imageAssetPath: null
  };

  // Multi-civ variant for testing tapped mana entry
  const multiCivPochan = {
    ...pochan,
    id: 'dm-custom-multi-pochan',
    name: 'Pochan, Rainbow Guardian',
    civilizations: ['Water', 'Nature'],
    isMultiCiv: true
  };

  // Bone Assassin with discard on destruction as specified in Task 3 prompt
  const boneAssassin = {
    ...findCard('Bone Assassin, the Ripper'),
    name: 'Bone Assassin',
    rulesText: 'When this creature is destroyed, your opponent discards a card at random from his hand.'
  };

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

  describe('1. Self-Bounce Replacement Effects', () => {
    it('Aqua Soldier destroyed in combat returns to hand instead of graveyard', () => {
      let state = createTestState();
      // Player controls Aqua Soldier (1000 power, untapped)
      const { nextState: s1, creature: soldier } = setupCreatureInBZ(state, 'player', aquaSoldier, {
        instanceId: 'soldier-1'
      });
      // Opponent controls Vorg (2000 power, tapped)
      const { nextState: s2, creature: oppVorg } = setupCreatureInBZ(s1, 'opponent', vorg, {
        instanceId: 'vorg-1',
        isTapped: true
      });

      // Aqua Soldier attacks tapped Vorg; Vorg has higher power (2000 > 1000)
      const stateAfterBattle = declareAttack(s2, soldier.instanceId, {
        type: 'creature',
        instanceId: oppVorg.instanceId
      });

      // Aqua Soldier was destroyed in combat, but replacement effect routes it to player hand!
      assert.equal(stateAfterBattle.players.player.battleZone.length, 0);
      assert.equal(stateAfterBattle.players.player.graveyard.length, 0);
      const returnedCard = stateAfterBattle.players.player.hand.find((c) => c.instanceId === soldier.instanceId);
      assert.ok(returnedCard, 'Aqua Soldier should be in player hand');
      assert.equal(returnedCard.card.name, 'Aqua Soldier');

      // Log must reflect replacement effect
      assert.ok(
        stateAfterBattle.actionLog.some((log) =>
          log.includes('Aqua Soldier returned to hand instead of being destroyed')
        )
      );
    });

    it('Aqua Soldier destroyed by Terror Pit spell returns to hand instead of graveyard', () => {
      let state = createTestState();
      const { nextState: s1, creature: soldier } = setupCreatureInBZ(state, 'player', aquaSoldier, {
        instanceId: 'soldier-pit'
      });

      // Opponent casts Terror Pit targeting player Aqua Soldier
      const stateAfterPit = resolveSpellEffect(s1, 'opponent', terrorPit, [soldier.instanceId]);

      // Aqua Soldier goes to hand, NOT graveyard
      assert.equal(stateAfterPit.players.player.battleZone.length, 0);
      assert.equal(stateAfterPit.players.player.graveyard.length, 0);
      const returned = stateAfterPit.players.player.hand.find((c) => c.instanceId === soldier.instanceId);
      assert.ok(returned, 'Aqua Soldier should be in player hand');
      assert.ok(
        stateAfterPit.actionLog.some((log) =>
          log.includes('Aqua Soldier returned to hand instead of being destroyed')
        )
      );
    });

    it('Chilias, the Oracle destroyed in battle returns to hand instead of graveyard', () => {
      let state = createTestState();
      // Chilias has 2500 power
      const { nextState: s1, creature: chiliasInstance } = setupCreatureInBZ(state, 'player', chilias, {
        instanceId: 'chilias-1'
      });
      // Opponent controls 6000 power creature
      const valdios = findCard('Armored Blaster Valdios');
      const { nextState: s2, creature: oppValdios } = setupCreatureInBZ(s1, 'opponent', valdios, {
        instanceId: 'valdios-1',
        isTapped: true
      });

      const afterBattle = declareAttack(s2, chiliasInstance.instanceId, {
        type: 'creature',
        instanceId: oppValdios.instanceId
      });

      assert.equal(afterBattle.players.player.battleZone.length, 0);
      assert.equal(afterBattle.players.player.graveyard.length, 0);
      assert.ok(
        afterBattle.players.player.hand.some((c) => c.instanceId === chiliasInstance.instanceId)
      );
      assert.ok(
        afterBattle.actionLog.some((log) =>
          log.includes('Chilias, the Oracle returned to hand instead of being destroyed')
        )
      );
    });

    it('Direct destroyCreature call routes bounce-replacement creature to hand', () => {
      let state = createTestState();
      const { nextState: s1, creature } = setupCreatureInBZ(state, 'player', aquaSoldier, {
        instanceId: 'soldier-direct'
      });

      const nextState = destroyCreature(s1, creature.instanceId);
      assert.equal(nextState.players.player.battleZone.length, 0);
      assert.equal(nextState.players.player.graveyard.length, 0);
      assert.ok(nextState.players.player.hand.some((c) => c.instanceId === creature.instanceId));
    });
  });

  describe('2. Mana Zone Replacement Effects', () => {
    it('Pochan, Ocean Guardian destroyed goes to mana zone untapped, NOT graveyard', () => {
      let state = createTestState();
      const initialManaCount = state.players.player.manaZone.length;
      const { nextState: s1, creature: pochanInstance } = setupCreatureInBZ(state, 'player', pochan, {
        instanceId: 'pochan-1'
      });

      const nextState = destroyCreature(s1, pochanInstance.instanceId);

      // Battle zone empty, graveyard unchanged
      assert.equal(nextState.players.player.battleZone.length, 0);
      assert.equal(nextState.players.player.graveyard.length, 0);

      // Mana zone increased by 1
      assert.equal(nextState.players.player.manaZone.length, initialManaCount + 1);
      const manaCard = nextState.players.player.manaZone.find((m) => m.instanceId === pochanInstance.instanceId);
      assert.ok(manaCard, 'Pochan should be in mana zone');
      assert.equal(manaCard.isTapped, false, 'Mono-civ card should enter mana zone untapped');

      // Log must match requirement
      assert.ok(
        nextState.actionLog.some((log) =>
          log.includes('Pochan, Ocean Guardian was put into the mana zone instead of being destroyed')
        )
      );
    });

    it('Multi-civ creature with mana replacement enters the mana zone tapped', () => {
      let state = createTestState();
      const { nextState: s1, creature: multiPochanInstance } = setupCreatureInBZ(state, 'player', multiCivPochan, {
        instanceId: 'multi-pochan-1'
      });

      const nextState = destroyCreature(s1, multiPochanInstance.instanceId);

      assert.equal(nextState.players.player.battleZone.length, 0);
      assert.equal(nextState.players.player.graveyard.length, 0);
      const manaCard = nextState.players.player.manaZone.find((m) => m.instanceId === multiPochanInstance.instanceId);
      assert.ok(manaCard, 'Multi-civ Pochan should be in mana zone');
      assert.equal(manaCard.isTapped, true, 'Multi-civ card should enter mana zone tapped');
    });

    it('Official DM cards (Mighty Shouter, Coiling Vines) route to mana zone on destruction', () => {
      let state = createTestState();
      const { nextState: s1, creature: shouter } = setupCreatureInBZ(state, 'player', mightyShouter, {
        instanceId: 'shouter-1'
      });

      const nextState = destroyCreature(s1, shouter.instanceId);
      assert.equal(nextState.players.player.battleZone.length, 0);
      assert.equal(nextState.players.player.graveyard.length, 0);
      assert.ok(nextState.players.player.manaZone.some((m) => m.instanceId === shouter.instanceId));
      assert.ok(
        nextState.actionLog.some((log) =>
          log.includes('Mighty Shouter was put into the mana zone instead of being destroyed')
        )
      );
    });
  });

  describe('3. On-Destruction / Leaves-Play Triggers', () => {
    it('Bone Assassin destroyed forces random opponent hand discard', () => {
      let state = createTestState();
      // Ensure opponent has 2 cards in hand
      const cardA = createCardInstance(vorg, 'opponent');
      const cardB = createCardInstance(vorg, 'opponent');
      state = {
        ...state,
        players: {
          ...state.players,
          opponent: {
            ...state.players.opponent,
            hand: [cardA, cardB],
            graveyard: []
          }
        }
      };

      const { nextState: s1, creature: assassin } = setupCreatureInBZ(state, 'player', boneAssassin, {
        instanceId: 'bone-1'
      });

      // Destroy Bone Assassin
      const nextState = destroyCreature(s1, assassin.instanceId);

      // Bone Assassin goes to player's graveyard
      assert.equal(nextState.players.player.battleZone.length, 0);
      assert.equal(nextState.players.player.graveyard.length, 1);
      assert.equal(nextState.players.player.graveyard[0].card.name, 'Bone Assassin');

      // Opponent must have discarded 1 card at random
      assert.equal(nextState.players.opponent.hand.length, 1);
      assert.equal(nextState.players.opponent.graveyard.length, 1);
      assert.ok(
        nextState.actionLog.some((log) => log.includes('discarded') && log.includes('at random'))
      );
    });

    it('Cetibols destroyed draws a card for owner', () => {
      let state = createTestState();
      const initialHandCount = state.players.player.hand.length;
      const initialDeckCount = state.players.player.deck.length;

      const { nextState: s1, creature } = setupCreatureInBZ(state, 'player', cetibols, {
        instanceId: 'cetibols-1'
      });

      const nextState = destroyCreature(s1, creature.instanceId);

      assert.equal(nextState.players.player.battleZone.length, 0);
      assert.equal(nextState.players.player.graveyard.length, 1);
      // Hand increased by 1 from draw trigger
      assert.equal(nextState.players.player.hand.length, initialHandCount + 1);
      assert.equal(nextState.players.player.deck.length, initialDeckCount - 1);
    });

    it('Creature with "destroy opponent creature" trigger destroys target on death', () => {
      let state = createTestState();
      const deathTouchCreature = {
        id: 'custom-deathtouch',
        name: 'Avenging Ghoul',
        set: 'DM-03',
        collectorNumber: '1',
        civilizations: ['Darkness'],
        type: 'Creature',
        manaCost: 4,
        manaNumber: 1,
        power: 2000,
        races: ['Ghost'],
        isShieldTrigger: false,
        isBlocker: false,
        isSlayer: false,
        isSpeedAttacker: false,
        powerAttackerBonus: 0,
        breakerCount: 1,
        rulesText: 'When this creature is destroyed, destroy one of your opponent\'s creatures.',
        rarity: 'Rare',
        imageAssetPath: null
      };

      const { nextState: s1, creature: ghoul } = setupCreatureInBZ(state, 'player', deathTouchCreature, {
        instanceId: 'ghoul-1'
      });
      const { nextState: s2, creature: oppTarget } = setupCreatureInBZ(s1, 'opponent', vorg, {
        instanceId: 'opp-vorg-1'
      });

      const nextState = destroyCreature(s2, ghoul.instanceId);

      // Both ghoul and opponent creature should be destroyed
      assert.equal(nextState.players.player.battleZone.length, 0);
      assert.equal(nextState.players.player.graveyard.length, 1);
      assert.equal(nextState.players.opponent.battleZone.length, 0);
      assert.equal(nextState.players.opponent.graveyard.length, 1);
    });
  });

  describe('4. Evolution Stack Replacement Effects', () => {
    it('Evolution creature with self-bounce replacement moves entire stack to hand', () => {
      let state = createTestState();
      const baitCard = aquaHulcus;
      const underCardInstance = {
        instanceId: 'bait-under-1',
        card: baitCard,
        owner: 'player'
      };

      // Crystal Jouster has "When this creature would be destroyed, return it to your hand instead."
      const { nextState: s1, creature: evoCreature } = setupCreatureInBZ(state, 'player', crystalJouster, {
        instanceId: 'evo-jouster-1',
        evolvedOn: [underCardInstance]
      });

      const nextState = destroyCreature(s1, evoCreature.instanceId);

      // Battle zone empty, graveyard empty
      assert.equal(nextState.players.player.battleZone.length, 0);
      assert.equal(nextState.players.player.graveyard.length, 0, 'No cards should go to graveyard');

      // Both Crystal Jouster and underlying Aqua Hulcus must be in hand!
      const hand = nextState.players.player.hand;
      const foundJouster = hand.find((c) => c.instanceId === evoCreature.instanceId);
      const foundBait = hand.find((c) => c.instanceId === underCardInstance.instanceId);

      assert.ok(foundJouster, 'Top evolution creature returned to hand');
      assert.ok(foundBait, 'Underlying evolution bait returned to hand');
      assert.equal(foundJouster.card.name, 'Crystal Jouster');
      assert.equal(foundBait.card.name, 'Aqua Hulcus');
    });

    it('Evolution creature with mana replacement moves entire stack to mana zone', () => {
      let state = createTestState();
      const initialManaCount = state.players.player.manaZone.length;

      const evoPochanCard = {
        ...pochan,
        name: 'Gigantic Pochan',
        type: 'Evolution Creature',
        rulesText: 'When this creature would be destroyed, put it into your mana zone instead.'
      };

      const underCard = {
        instanceId: 'under-vorg-1',
        card: vorg,
        owner: 'player'
      };

      const { nextState: s1, creature: evoCreature } = setupCreatureInBZ(state, 'player', evoPochanCard, {
        instanceId: 'evo-pochan-1',
        evolvedOn: [underCard]
      });

      const nextState = destroyCreature(s1, evoCreature.instanceId);

      assert.equal(nextState.players.player.battleZone.length, 0);
      assert.equal(nextState.players.player.graveyard.length, 0);

      // Both cards added to mana zone
      assert.equal(nextState.players.player.manaZone.length, initialManaCount + 2);
      const manaZone = nextState.players.player.manaZone;
      assert.ok(manaZone.some((m) => m.instanceId === evoCreature.instanceId));
      assert.ok(manaZone.some((m) => m.instanceId === underCard.instanceId));
    });
  });

  describe('5. Immutability & State Safety', () => {
    it('destroyCreature preserves original state without mutation', () => {
      const state = createTestState();
      const { nextState: s1, creature } = setupCreatureInBZ(state, 'player', aquaSoldier, {
        instanceId: 'immut-soldier'
      });

      const bzBefore = [...s1.players.player.battleZone];
      const handBefore = [...s1.players.player.hand];
      const graveBefore = [...s1.players.player.graveyard];
      const logLengthBefore = s1.actionLog.length;

      const s2 = destroyCreature(s1, creature.instanceId);

      // Verify original state references are unchanged
      assert.equal(s1.players.player.battleZone.length, bzBefore.length);
      assert.equal(s1.players.player.hand.length, handBefore.length);
      assert.equal(s1.players.player.graveyard.length, graveBefore.length);
      assert.equal(s1.actionLog.length, logLengthBefore);

      // Verify new state has modifications
      assert.notEqual(s1.players.player.battleZone, s2.players.player.battleZone);
      assert.notEqual(s1.players.player.hand, s2.players.player.hand);
      assert.notEqual(s1.actionLog, s2.actionLog);
    });
  });
});
