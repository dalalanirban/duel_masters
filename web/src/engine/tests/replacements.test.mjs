import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CARD_LIST } from '../../data/cardLoader.ts';
import {
  findSaverInBattleZone,
  isMadnessDiscardReplacement,
  hasShieldBurnReplacement
} from '../replacements.ts';
import {
  destroyCreature,
  discardRandomHandCards
} from '../spells.ts';
import {
  declareAttack,
  resolveCombat
} from '../combat.ts';

function findCard(name) {
  const c = CARD_LIST.find((x) => x.name.toLowerCase() === name.toLowerCase());
  if (!c) throw new Error(`Card not found: ${name}`);
  return c;
}

function makeCreature(card, owner = 'player', instanceId = 'c1') {
  return {
    instanceId,
    card,
    owner,
    isTapped: false,
    summonedTurn: 1,
    powerModifier: 0
  };
}

describe('Duel Masters Engine: Replacement Effects & Savers System', () => {
  const bolshack = findCard('Bolshack Dragon');
  const kip = findCard('Kip Chippotto');
  const davaTorey = findCard('Dava Torey, Seeker of Clouds');
  const deathPhoenix = findCard('Death Phoenix, Avatar of Doom');
  const chilias = findCard('Chilias, the Oracle');
  const coilingVines = findCard('Coiling Vines');

  describe('1. Saver Detection & Sacrifice Replacement', () => {
    it('detects Kip Chippotto as a valid Saver for Bolshack Dragon (Armored Dragon)', () => {
      const bz = [
        makeCreature(bolshack, 'player', 'bolshack-1'),
        makeCreature(kip, 'player', 'kip-1')
      ];
      const saver = findSaverInBattleZone(bz, bz[0]);
      assert.notEqual(saver, null);
      assert.equal(saver.card.name, 'Kip Chippotto');
    });

    it('does not use Kip Chippotto as a Saver for a non-Dragon creature', () => {
      const bz = [
        makeCreature(chilias, 'player', 'chilias-1'),
        makeCreature(kip, 'player', 'kip-1')
      ];
      const saver = findSaverInBattleZone(bz, bz[0]);
      assert.equal(saver, null);
    });
  });

  describe('2. Discard Madness Replacement ("Put into battle zone instead")', () => {
    it('identifies Dava Torey as a Madness discard during opponent turn', () => {
      assert.equal(isMadnessDiscardReplacement(davaTorey, true), true);
    });

    it('does not trigger Madness during own turn', () => {
      assert.equal(isMadnessDiscardReplacement(davaTorey, false), false);
    });
  });

  describe('3. Shield Burn Replacement ("Put into graveyard instead of hand")', () => {
    it('identifies Death Phoenix as having Shield Burn replacement', () => {
      const phoenixCreature = makeCreature(deathPhoenix, 'player', 'phoenix-1');
      assert.equal(hasShieldBurnReplacement(phoenixCreature), true);
    });

    it('identifies Bolshack Dragon as NOT having Shield Burn replacement', () => {
      const dragonCreature = makeCreature(bolshack, 'player', 'dragon-1');
      assert.equal(hasShieldBurnReplacement(dragonCreature), false);
    });
  });

  describe('4. Full Engine Integration of Replacements', () => {
    it('executes Saver sacrifice in destroyCreature (Kip Chippotto dies, Bolshack survives)', () => {
      const state = {
        turn: 3,
        activePlayer: 'opponent',
        phase: 'MAIN',
        combatState: null,
        pendingInteraction: null,
        winner: null,
        actionLog: [],
        players: {
          player: {
            deck: [],
            hand: [],
            shields: [],
            manaZone: [],
            battleZone: [
              makeCreature(bolshack, 'player', 'bolshack-1'),
              makeCreature(kip, 'player', 'kip-1')
            ],
            graveyard: [],
            manaChargedThisTurn: false
          },
          opponent: {
            deck: [],
            hand: [],
            shields: [],
            manaZone: [],
            battleZone: [],
            graveyard: [],
            manaChargedThisTurn: false
          }
        }
      };

      // Opponent tries to destroy Bolshack Dragon
      const nextState = destroyCreature(state, 'bolshack-1');

      // Bolshack must still be in battle zone!
      const playerBZ = nextState.players.player.battleZone;
      assert.equal(playerBZ.some((c) => c.instanceId === 'bolshack-1'), true, 'Bolshack should be saved!');
      // Kip Chippotto must have sacrificed itself and be in graveyard
      assert.equal(playerBZ.some((c) => c.instanceId === 'kip-1'), false, 'Kip should no longer be in battle zone!');
      assert.equal(nextState.players.player.graveyard.some((c) => c.card.name === 'Kip Chippotto'), true, 'Kip should be in graveyard!');
    });

    it('executes Madness discard replacement during opponent turn (Dava Torey enters battle zone)', () => {
      const state = {
        turn: 2,
        activePlayer: 'opponent', // Opponent turn!
        phase: 'MAIN',
        combatState: null,
        pendingInteraction: null,
        winner: null,
        actionLog: [],
        players: {
          player: {
            deck: [],
            hand: [{ instanceId: 'h-dava', card: davaTorey, owner: 'player' }],
            shields: [],
            manaZone: [],
            battleZone: [],
            graveyard: [],
            manaChargedThisTurn: false
          },
          opponent: {
            deck: [],
            hand: [],
            shields: [],
            manaZone: [],
            battleZone: [],
            graveyard: [],
            manaChargedThisTurn: false
          }
        }
      };

      // Opponent forces player to discard
      const nextState = discardRandomHandCards(state, 'player', 1);

      // Hand is now 0
      assert.equal(nextState.players.player.hand.length, 0);
      // Dava Torey must be in the BATTLE ZONE, not the graveyard!
      assert.equal(nextState.players.player.battleZone.length, 1);
      assert.equal(nextState.players.player.battleZone[0].card.name, 'Dava Torey, Seeker of Clouds');
      assert.equal(nextState.players.player.graveyard.length, 0);
    });

    it('executes Shield Burn replacement (Death Phoenix burns shields straight to graveyard, no trigger)', () => {
      const terrorPit = findCard('Terror Pit'); // Shield Trigger
      const state = {
        turn: 5,
        activePlayer: 'player',
        phase: 'ATTACK',
        combatState: {
          attackerId: 'phoenix-1',
          target: { type: 'shield', index: 0 },
          blockerId: null,
          stage: 'SHIELD_BREAK'
        },
        pendingInteraction: null,
        winner: null,
        actionLog: [],
        players: {
          player: {
            deck: [],
            hand: [],
            shields: [],
            manaZone: [],
            battleZone: [makeCreature(deathPhoenix, 'player', 'phoenix-1')],
            graveyard: [],
            manaChargedThisTurn: false
          },
          opponent: {
            deck: [],
            hand: [],
            shields: [
              { id: 's-tp', card: terrorPit, isBroken: false }
            ],
            manaZone: [],
            battleZone: [],
            graveyard: [],
            manaChargedThisTurn: false
          }
        }
      };

      const nextState = resolveCombat(state);

      // Shield was burned straight to opponent's graveyard
      assert.equal(nextState.players.opponent.shields.length, 0);
      assert.equal(nextState.players.opponent.hand.length, 0, 'Should not go to hand!');
      assert.equal(nextState.players.opponent.graveyard.length, 1, 'Should go to graveyard!');
      assert.equal(nextState.players.opponent.graveyard[0].card.name, 'Terror Pit');
      // No shield trigger prompt!
      assert.equal(nextState.pendingInteraction, null, 'Shield Trigger must not trigger when burned to graveyard!');
    });
  });
});
