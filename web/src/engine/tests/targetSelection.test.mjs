import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CARD_LIST } from '../../data/cardLoader.ts';
import { getSpellTargetRequirement } from '../targeting.ts';
import { step } from '../reducer.ts';
import { resolveSpellEffect } from '../spells.ts';

function findCard(name) {
  const c = CARD_LIST.find((x) => x.name.toLowerCase() === name.toLowerCase());
  if (!c) throw new Error(`Card not found: ${name}`);
  return c;
}

function makeCreature(card, owner = 'player', instanceId = 'c1', power = null, isTapped = false) {
  return {
    instanceId,
    card: power !== null ? { ...card, power } : card,
    owner,
    isTapped,
    summonedTurn: 1,
    powerModifier: 0
  };
}

describe('Duel Masters Engine: Interactive Target Selection Pipeline (Step 2)', () => {
  const terrorPit = findCard('Terror Pit');
  const spiralGate = findCard('Spiral Gate');
  const teleportation = findCard('Teleportation');
  const crimsonHammer = findCard('Crimson Hammer');
  const vorg = findCard('Immortal Baron, Vorg'); // 2000 power
  const bolshack = findCard('Bolshack Dragon'); // 6000 power

  it('determines valid targets for Terror Pit (opponent creatures only)', () => {
    const state = {
      players: {
        player: { battleZone: [makeCreature(vorg, 'player', 'p-vorg')] },
        opponent: { battleZone: [makeCreature(bolshack, 'opponent', 'opp-bolshack')] }
      }
    };

    const req = getSpellTargetRequirement(terrorPit, state, 'player');
    assert.equal(req.requiresTarget, true);
    assert.equal(req.minTargets, 1);
    assert.equal(req.maxTargets, 1);
    assert.deepEqual(req.validTargetIds, ['opp-bolshack']);
  });

  it('determines valid targets for Crimson Hammer (opponent creatures <= 2000 power)', () => {
    const state = {
      players: {
        player: { battleZone: [] },
        opponent: {
          battleZone: [
            makeCreature(vorg, 'opponent', 'opp-vorg'), // 2000
            makeCreature(bolshack, 'opponent', 'opp-bolshack') // 6000
          ]
        }
      }
    };

    const req = getSpellTargetRequirement(crimsonHammer, state, 'player');
    assert.equal(req.requiresTarget, true);
    assert.deepEqual(req.validTargetIds, ['opp-vorg']);
  });

  it('determines valid targets for Teleportation (up to 2 creatures across both sides)', () => {
    const state = {
      players: {
        player: { battleZone: [makeCreature(vorg, 'player', 'p-vorg')] },
        opponent: { battleZone: [makeCreature(bolshack, 'opponent', 'opp-bolshack')] }
      }
    };

    const req = getSpellTargetRequirement(teleportation, state, 'player');
    assert.equal(req.requiresTarget, true);
    assert.equal(req.maxTargets, 2);
    assert.deepEqual(req.validTargetIds, ['p-vorg', 'opp-bolshack']);
  });

  it('dispatches SELECT_TARGETS in master reducer and resolves effect cleanly', () => {
    const state = {
      turn: 3,
      activePlayer: 'player',
      phase: 'MAIN',
      combatState: null,
      winner: null,
      actionLog: [],
      pendingInteraction: {
        type: 'TARGET_SELECTION',
        player: 'player',
        actionType: 'SPELL_TARGET',
        sourceCardId: terrorPit.id,
        validTargetIds: ['opp-bolshack'],
        minTargets: 1,
        maxTargets: 1,
        prompt: 'Choose 1 opponent creature to destroy.'
      },
      players: {
        player: {
          deck: [],
          hand: [],
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
          battleZone: [makeCreature(bolshack, 'opponent', 'opp-bolshack')],
          graveyard: [],
          manaChargedThisTurn: false
        }
      }
    };

    const nextState = step(state, {
      type: 'SELECT_TARGETS',
      player: 'player',
      selectedIds: ['opp-bolshack']
    });

    assert.equal(nextState.pendingInteraction, null, 'Pending interaction must be cleared');
    assert.equal(nextState.players.opponent.battleZone.length, 0, 'Targeted creature must be destroyed');
    assert.equal(nextState.players.opponent.graveyard.length, 1, 'Targeted creature must be in graveyard');
    assert.equal(nextState.players.opponent.graveyard[0].card.name, 'Bolshack Dragon');
  });
});
