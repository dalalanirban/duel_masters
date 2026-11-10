import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  drawCards,
  rampTopDeckToManaZone,
  discardRandomHandCards,
  searchDeckForCard,
  salvageFromGraveyard,
  triggerCIP,
  triggerEndTurn,
  triggerAttack
} from '../effects.ts';
import { initializeGame, createCardInstance, createShieldInstance } from '../state.ts';
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

describe('Declarative Effect Engine Primitives & Trigger Pipeline', () => {
  const vorg = findCard('Immortal Baron, Vorg'); // Fire creature, cost 2, 2000 power
  const terrorPit = findCard('Terror Pit'); // Darkness spell, cost 6
  const aquaHulcus = findCard('Aqua Hulcus'); // Water creature, cost 3, draw 1
  const bronzeArmTribe = findCard('Bronze-Arm Tribe'); // Nature creature, cost 3, ramp 1
  const miele = findCard('Miele, Vizier of Lightning'); // Light creature, cost 3, tap 1
  const aquaSurfer = findCard('Aqua Surfer'); // Water creature, cost 6, bounce 1
  const aquaSniper = findCard('Aqua Sniper'); // Water creature, cost 8, bounce 2
  const maskedHorror = findCard('Masked Horror, Shadow of Scorn'); // Darkness creature, cost 5, discard 1
  const frei = findCard('Frei, Vizier of Air'); // Light creature, cost 4, untap at end of turn
  const urth = findCard('Urth, Purifying Elemental'); // Light creature, cost 6, untap at end of turn

  function createTestState() {
    const deck1 = createTestDeck('d1', 'Deck 1', vorg);
    const deck2 = createTestDeck('d2', 'Deck 2', vorg);
    return initializeGame(deck1, deck2, 'player', { shuffle: false });
  }

  describe('1. searchDeckForCard', () => {
    it('moves target card from deck to hand', () => {
      let state = createTestState();
      // Put a Terror Pit into player's deck
      const pitInstance = createCardInstance(terrorPit, 'player');
      state = {
        ...state,
        players: {
          ...state.players,
          player: {
            ...state.players.player,
            deck: [pitInstance, ...state.players.player.deck]
          }
        }
      };

      const initialDeckLen = state.players.player.deck.length;
      const initialHandLen = state.players.player.hand.length;

      const nextState = searchDeckForCard(
        state,
        'player',
        (c) => c.name === 'Terror Pit',
        'hand'
      );

      assert.equal(nextState.players.player.deck.length, initialDeckLen - 1);
      assert.equal(nextState.players.player.hand.length, initialHandLen + 1);
      assert.equal(
        nextState.players.player.hand[nextState.players.player.hand.length - 1].card.name,
        'Terror Pit'
      );
      assert.ok(nextState.actionLog.some((log) => log.includes('put Terror Pit into hand')));
    });

    it('moves target card from deck to manaZone with proper tapped state', () => {
      let state = createTestState();
      const pitInstance = createCardInstance(terrorPit, 'player'); // Mono-civ Darkness
      const multiCivCard = {
        id: 'test-multiciv',
        name: 'Rainbow Monster',
        civilizations: ['Darkness', 'Fire'],
        type: 'Creature',
        cost: 4,
        isMultiCiv: true
      };
      const multiInstance = createCardInstance(multiCivCard, 'player');

      state = {
        ...state,
        players: {
          ...state.players,
          player: {
            ...state.players.player,
            deck: [pitInstance, multiInstance, ...state.players.player.deck]
          }
        }
      };

      // Search mono-civ to mana
      const state1 = searchDeckForCard(
        state,
        'player',
        (c) => c.name === 'Terror Pit',
        'manaZone'
      );
      const monoMana = state1.players.player.manaZone[state1.players.player.manaZone.length - 1];
      assert.equal(monoMana.card.name, 'Terror Pit');
      assert.equal(monoMana.isTapped, false);

      // Search multi-civ to mana
      const state2 = searchDeckForCard(
        state1,
        'player',
        (c) => c.name === 'Rainbow Monster',
        'manaZone'
      );
      const multiMana = state2.players.player.manaZone[state2.players.player.manaZone.length - 1];
      assert.equal(multiMana.card.name, 'Rainbow Monster');
      assert.equal(multiMana.isTapped, true);
    });

    it('moves target card from deck to shields', () => {
      let state = createTestState();
      const pitInstance = createCardInstance(terrorPit, 'player');
      state = {
        ...state,
        players: {
          ...state.players,
          player: {
            ...state.players.player,
            deck: [pitInstance, ...state.players.player.deck]
          }
        }
      };

      const initialShields = state.players.player.shields.length;
      const nextState = searchDeckForCard(
        state,
        'player',
        (c) => c.name === 'Terror Pit',
        'shields'
      );

      assert.equal(nextState.players.player.shields.length, initialShields + 1);
      const addedShield = nextState.players.player.shields[nextState.players.player.shields.length - 1];
      assert.equal(addedShield.card.name, 'Terror Pit');
      assert.equal(addedShield.isBroken, false);
      assert.ok(Boolean(addedShield.id));
    });

    it('returns state unchanged when no card matches filter', () => {
      const state = createTestState();
      const initialDeckLen = state.players.player.deck.length;

      const nextState = searchDeckForCard(
        state,
        'player',
        (c) => c.name === 'Non-Existent Legendary Dragon',
        'hand'
      );

      assert.equal(nextState.players.player.deck.length, initialDeckLen);
      assert.ok(nextState.actionLog.some((log) => log.includes('found no matching card')));
    });
  });

  describe('2. salvageFromGraveyard', () => {
    it('moves target creature from graveyard to hand', () => {
      let state = createTestState();
      const vorgInstance = createCardInstance(vorg, 'player');
      state = {
        ...state,
        players: {
          ...state.players,
          player: {
            ...state.players.player,
            graveyard: [vorgInstance]
          }
        }
      };

      const initialHandLen = state.players.player.hand.length;
      const nextState = salvageFromGraveyard(
        state,
        'player',
        (c) => c.name === vorg.name,
        'hand'
      );

      assert.equal(nextState.players.player.graveyard.length, 0);
      assert.equal(nextState.players.player.hand.length, initialHandLen + 1);
      assert.equal(
        nextState.players.player.hand[nextState.players.player.hand.length - 1].card.name,
        vorg.name
      );
      assert.ok(nextState.actionLog.some((log) => log.includes('salvaged Immortal Baron, Vorg from graveyard to hand')));
    });

    it('reanimates target creature from graveyard to battleZone', () => {
      let state = createTestState();
      const vorgInstance = createCardInstance(vorg, 'player');
      state = {
        ...state,
        players: {
          ...state.players,
          player: {
            ...state.players.player,
            graveyard: [vorgInstance],
            battleZone: []
          }
        }
      };

      const nextState = salvageFromGraveyard(
        state,
        'player',
        (c) => c.name === vorg.name,
        'battleZone'
      );

      assert.equal(nextState.players.player.graveyard.length, 0);
      assert.equal(nextState.players.player.battleZone.length, 1);
      const reanimated = nextState.players.player.battleZone[0];
      assert.equal(reanimated.card.name, vorg.name);
      assert.equal(reanimated.isTapped, false);
      assert.equal(reanimated.powerModifier, 0);
      assert.equal(reanimated.summonedTurn, state.turn);
    });

    it('returns state unchanged when graveyard has no matching card', () => {
      const state = createTestState();
      const nextState = salvageFromGraveyard(
        state,
        'player',
        (c) => c.name === 'Non-Existent',
        'hand'
      );

      assert.equal(nextState.players.player.graveyard.length, 0);
      assert.ok(nextState.actionLog.some((log) => log.includes('found no matching card')));
    });
  });

  describe('3. triggerCIP (Come-Into-Play Effects)', () => {
    it('executes draw CIP effect (Aqua Hulcus)', () => {
      const state = createTestState();
      const hulcusInstance = {
        instanceId: 'hulcus-1',
        card: aquaHulcus,
        owner: 'player',
        isTapped: false,
        summonedTurn: 1,
        powerModifier: 0
      };

      const initialHandLen = state.players.player.hand.length;
      const initialDeckLen = state.players.player.deck.length;

      const nextState = triggerCIP(state, 'player', hulcusInstance);

      assert.equal(nextState.players.player.hand.length, initialHandLen + 1);
      assert.equal(nextState.players.player.deck.length, initialDeckLen - 1);
      assert.ok(nextState.actionLog.some((log) => log.includes('player drew 1 card(s)')));
    });

    it('executes mana ramp CIP effect (Bronze-Arm Tribe)', () => {
      const state = createTestState();
      const batInstance = {
        instanceId: 'bat-1',
        card: bronzeArmTribe,
        owner: 'player',
        isTapped: false,
        summonedTurn: 1,
        powerModifier: 0
      };

      const initialManaLen = state.players.player.manaZone.length;
      const initialDeckLen = state.players.player.deck.length;

      const nextState = triggerCIP(state, 'player', batInstance);

      assert.equal(nextState.players.player.manaZone.length, initialManaLen + 1);
      assert.equal(nextState.players.player.deck.length, initialDeckLen - 1);
      assert.ok(nextState.actionLog.some((log) => log.includes('put Immortal Baron, Vorg from the top of the deck into the mana zone')));
    });

    it('executes discard CIP effect (Masked Horror)', () => {
      const state = createTestState();
      const horrorInstance = {
        instanceId: 'horror-1',
        card: maskedHorror,
        owner: 'player',
        isTapped: false,
        summonedTurn: 1,
        powerModifier: 0
      };

      const initialOppHandLen = state.players.opponent.hand.length;
      const initialOppGraveLen = state.players.opponent.graveyard.length;

      const nextState = triggerCIP(state, 'player', horrorInstance);

      assert.equal(nextState.players.opponent.hand.length, initialOppHandLen - 1);
      assert.equal(nextState.players.opponent.graveyard.length, initialOppGraveLen + 1);
      assert.ok(nextState.actionLog.some((log) => log.includes('opponent discarded')));
    });

    it('executes tap CIP effect (Miele, Vizier of Lightning)', () => {
      let state = createTestState();
      const oppCreature = {
        instanceId: 'opp-vorg-1',
        card: vorg,
        owner: 'opponent',
        isTapped: false,
        summonedTurn: 1,
        powerModifier: 0
      };
      state = {
        ...state,
        players: {
          ...state.players,
          opponent: {
            ...state.players.opponent,
            battleZone: [oppCreature]
          }
        }
      };

      const mieleInstance = {
        instanceId: 'miele-1',
        card: miele,
        owner: 'player',
        isTapped: false,
        summonedTurn: 1,
        powerModifier: 0
      };

      const nextState = triggerCIP(state, 'player', mieleInstance, ['opp-vorg-1']);

      assert.equal(nextState.players.opponent.battleZone[0].isTapped, true);
      assert.ok(nextState.actionLog.some((log) => log.includes('tapped Immortal Baron, Vorg with Miele')));
    });

    it('executes bounce CIP effect (Aqua Surfer)', () => {
      let state = createTestState();
      const oppCreature = {
        instanceId: 'opp-vorg-1',
        card: vorg,
        owner: 'opponent',
        isTapped: false,
        summonedTurn: 1,
        powerModifier: 0
      };
      state = {
        ...state,
        players: {
          ...state.players,
          opponent: {
            ...state.players.opponent,
            battleZone: [oppCreature]
          }
        }
      };

      const surferInstance = {
        instanceId: 'surfer-1',
        card: aquaSurfer,
        owner: 'player',
        isTapped: false,
        summonedTurn: 1,
        powerModifier: 0
      };

      const initialOppHand = state.players.opponent.hand.length;
      const nextState = triggerCIP(state, 'player', surferInstance, ['opp-vorg-1']);

      assert.equal(nextState.players.opponent.battleZone.length, 0);
      assert.equal(nextState.players.opponent.hand.length, initialOppHand + 1);
      assert.ok(nextState.actionLog.some((log) => log.includes('Returned Immortal Baron, Vorg to its owner\'s hand')));
    });

    it('executes multi-bounce CIP effect (Aqua Sniper)', () => {
      let state = createTestState();
      const opp1 = {
        instanceId: 'opp-vorg-1',
        card: vorg,
        owner: 'opponent',
        isTapped: false,
        summonedTurn: 1,
        powerModifier: 0
      };
      const opp2 = {
        instanceId: 'opp-vorg-2',
        card: vorg,
        owner: 'opponent',
        isTapped: false,
        summonedTurn: 1,
        powerModifier: 0
      };
      state = {
        ...state,
        players: {
          ...state.players,
          opponent: {
            ...state.players.opponent,
            battleZone: [opp1, opp2]
          }
        }
      };

      const sniperInstance = {
        instanceId: 'sniper-1',
        card: aquaSniper,
        owner: 'player',
        isTapped: false,
        summonedTurn: 1,
        powerModifier: 0
      };

      const nextState = triggerCIP(state, 'player', sniperInstance, ['opp-vorg-1', 'opp-vorg-2']);
      assert.equal(nextState.players.opponent.battleZone.length, 0);
    });

    it('returns state unchanged for creatures without CIP effects', () => {
      const state = createTestState();
      const vorgInstance = {
        instanceId: 'vorg-1',
        card: vorg,
        owner: 'player',
        isTapped: false,
        summonedTurn: 1,
        powerModifier: 0
      };

      const nextState = triggerCIP(state, 'player', vorgInstance);
      assert.deepEqual(nextState.players, state.players);
    });
  });

  describe('4. triggerEndTurn', () => {
    it('untaps tapped Frei, Vizier of Air and Urth at end of turn (vigilance)', () => {
      let state = createTestState();
      const tappedFrei = {
        instanceId: 'frei-1',
        card: frei,
        owner: 'player',
        isTapped: true,
        summonedTurn: 1,
        powerModifier: 0
      };
      const tappedUrth = {
        instanceId: 'urth-1',
        card: urth,
        owner: 'player',
        isTapped: true,
        summonedTurn: 1,
        powerModifier: 0
      };
      const tappedVorg = {
        instanceId: 'vorg-1',
        card: vorg,
        owner: 'player',
        isTapped: true,
        summonedTurn: 1,
        powerModifier: 0
      };

      state = {
        ...state,
        players: {
          ...state.players,
          player: {
            ...state.players.player,
            battleZone: [tappedFrei, tappedUrth, tappedVorg]
          }
        }
      };

      const nextState = triggerEndTurn(state, 'player');

      const bz = nextState.players.player.battleZone;
      const nextFrei = bz.find((c) => c.instanceId === 'frei-1');
      const nextUrth = bz.find((c) => c.instanceId === 'urth-1');
      const nextVorg = bz.find((c) => c.instanceId === 'vorg-1');

      assert.equal(nextFrei.isTapped, false);
      assert.equal(nextUrth.isTapped, false);
      assert.equal(nextVorg.isTapped, true); // Vorg lacks vigilance, stays tapped
      assert.ok(nextState.actionLog.some((log) => log.includes('Frei, Vizier of Air untapped')));
      assert.ok(nextState.actionLog.some((log) => log.includes('Urth, Purifying Elemental untapped')));
    });

    it('destroys self-sacrificing creatures at end of turn', () => {
      let state = createTestState();
      const selfSacrificeCard = {
        id: 'test-sac',
        name: 'Doomed Kamikaze',
        civilizations: ['Darkness'],
        type: 'Creature',
        cost: 1,
        power: 4000,
        rulesText: 'At the end of your turn, destroy this creature.'
      };
      const sacInstance = {
        instanceId: 'sac-1',
        card: selfSacrificeCard,
        owner: 'player',
        isTapped: false,
        summonedTurn: 1,
        powerModifier: 0
      };

      state = {
        ...state,
        players: {
          ...state.players,
          player: {
            ...state.players.player,
            battleZone: [sacInstance],
            graveyard: []
          }
        }
      };

      const nextState = triggerEndTurn(state, 'player');

      assert.equal(nextState.players.player.battleZone.length, 0);
      assert.equal(nextState.players.player.graveyard.length, 1);
      assert.equal(nextState.players.player.graveyard[0].card.name, 'Doomed Kamikaze');
      assert.ok(nextState.actionLog.some((log) => log.includes('Doomed Kamikaze was destroyed at the end of the turn')));
    });

    it('returns self-bouncing creatures to hand at end of turn', () => {
      let state = createTestState();
      const bounceCard = {
        id: 'test-bounce',
        name: 'Boomerang Imp',
        civilizations: ['Water'],
        type: 'Creature',
        cost: 2,
        power: 2000,
        rulesText: 'At the end of your turn, return this creature to your hand.'
      };
      const bounceInstance = {
        instanceId: 'bounce-1',
        card: bounceCard,
        owner: 'player',
        isTapped: false,
        summonedTurn: 1,
        powerModifier: 0
      };

      state = {
        ...state,
        players: {
          ...state.players,
          player: {
            ...state.players.player,
            battleZone: [bounceInstance]
          }
        }
      };

      const initialHand = state.players.player.hand.length;
      const nextState = triggerEndTurn(state, 'player');

      assert.equal(nextState.players.player.battleZone.length, 0);
      assert.equal(nextState.players.player.hand.length, initialHand + 1);
      assert.ok(nextState.actionLog.some((log) => log.includes('Boomerang Imp returned to hand')));
    });

    it('resets temporary power attacker bonuses and power modifiers at end of turn', () => {
      let state = createTestState();
      const buffedVorg = {
        instanceId: 'vorg-buffed',
        card: vorg,
        owner: 'player',
        isTapped: false,
        summonedTurn: 1,
        powerModifier: 3000,
        tempPowerAttackerBonus: 2000
      };

      state = {
        ...state,
        players: {
          ...state.players,
          player: {
            ...state.players.player,
            battleZone: [buffedVorg]
          }
        }
      };

      const nextState = triggerEndTurn(state, 'player');
      const resetVorg = nextState.players.player.battleZone[0];

      assert.equal(resetVorg.powerModifier, 0);
      assert.equal(resetVorg.tempPowerAttackerBonus, 0);
    });
  });

  describe('5. Deck-out Loss Condition & Pure Immutability', () => {
    it('triggers immediate loss when attempting to draw from an empty deck', () => {
      let state = createTestState();
      state = {
        ...state,
        players: {
          ...state.players,
          player: {
            ...state.players.player,
            deck: [] // Empty deck
          }
        }
      };

      assert.equal(state.winner, null);

      const nextState = drawCards(state, 'player', 1);

      assert.equal(nextState.winner, 'opponent');
      assert.ok(nextState.actionLog.some((log) => log.includes('cannot draw from an empty deck! opponent wins')));
    });

    it('triggers loss when drawing more cards than remain in deck', () => {
      let state = createTestState();
      const singleCard = createCardInstance(vorg, 'player');
      state = {
        ...state,
        players: {
          ...state.players,
          player: {
            ...state.players.player,
            deck: [singleCard] // Only 1 card
          }
        }
      };

      // Player attempts to draw 3 cards
      const nextState = drawCards(state, 'player', 3);

      assert.equal(nextState.winner, 'opponent');
      assert.equal(nextState.players.player.deck.length, 0);
      assert.ok(nextState.actionLog.some((log) => log.includes('cannot draw from an empty deck!')));
    });

    it('preserves immutability across all effect functions', () => {
      const state = createTestState();
      const originalHandLen = state.players.player.hand.length;
      const originalDeckLen = state.players.player.deck.length;
      const originalActionLogLen = state.actionLog.length;

      // 1. drawCards immutability
      const afterDraw = drawCards(state, 'player', 1);
      assert.equal(state.players.player.hand.length, originalHandLen);
      assert.equal(state.players.player.deck.length, originalDeckLen);
      assert.notEqual(state, afterDraw);
      assert.notEqual(state.players, afterDraw.players);
      assert.notEqual(state.players.player.hand, afterDraw.players.player.hand);

      // 2. rampTopDeckToManaZone immutability
      const afterRamp = rampTopDeckToManaZone(state, 'player', 1);
      assert.equal(state.players.player.manaZone.length, 0);
      assert.equal(state.players.player.deck.length, originalDeckLen);
      assert.equal(afterRamp.players.player.manaZone.length, 1);
      assert.notEqual(state.players.player.manaZone, afterRamp.players.player.manaZone);

      // 3. discardRandomHandCards immutability
      const afterDiscard = discardRandomHandCards(state, 'player', 1);
      assert.equal(state.players.player.hand.length, originalHandLen);
      assert.equal(state.players.player.graveyard.length, 0);
      assert.equal(afterDiscard.players.player.hand.length, originalHandLen - 1);
      assert.equal(afterDiscard.players.player.graveyard.length, 1);
      assert.notEqual(state.players.player.hand, afterDiscard.players.player.hand);

      // 4. actionLog immutability
      assert.equal(state.actionLog.length, originalActionLogLen);
    });

    it('triggerAttack is available and returns state for forward compatibility', () => {
      const state = createTestState();
      const vorgInstance = {
        instanceId: 'vorg-1',
        card: vorg,
        owner: 'player',
        isTapped: false,
        summonedTurn: 1,
        powerModifier: 0
      };
      const nextState = triggerAttack(state, 'player', vorgInstance, { type: 'player' });
      assert.deepEqual(nextState, state);
    });
  });
});
