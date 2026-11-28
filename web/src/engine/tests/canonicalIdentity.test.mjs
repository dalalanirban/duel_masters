import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { initializeGame, createCardInstance } from '../state.ts';
import { step } from '../reducer.ts';
import { getAiAction } from '../ai.ts';
import { getCardCapabilities, isCreatureMandatoryAttacker } from '../cardUtils.ts';
import { hasMandatoryAttackers } from '../combat.ts';
import { triggerCIP } from '../triggers.ts';
import { CARD_LIST } from '../../data/cardLoader.ts';

function buildMinimalTestDeck(id, cards) {
  return {
    id,
    name: id,
    items: cards.slice(0, 10).map((card) => ({ card, count: 4 })),
    updatedAt: 1
  };
}

describe('Sprint 1: Canonical Name Engine Dispatch (Zero Hardcoded Set Card IDs)', () => {
  const deckA = buildMinimalTestDeck('canon-a', CARD_LIST.slice(0, 10));
  const deckB = buildMinimalTestDeck('canon-b', CARD_LIST.slice(10, 20));

  it('recognizes Deadly Fighter Braid Claw mandatory attack via canonical name regardless of printing ID', () => {
    const syntheticBraidClaw = {
      id: 'PROMO-BRAID-999',
      name: '  Deadly Fighter Braid Claw  ',
      set: 'PROMO',
      collectorNumber: '999',
      civilizations: ['Fire'],
      type: 'Creature',
      manaCost: 1,
      manaNumber: 1,
      power: 1000,
      races: ['Dragonoid'],
      isShieldTrigger: false,
      isBlocker: false,
      isSlayer: false,
      isSpeedAttacker: false,
      powerAttackerBonus: 0,
      breakerCount: 1,
      rulesText: '',
      flavorText: '',
      rarity: 'Common',
      illustrator: 'Test',
      imageAssetPath: '',
      isEvolution: false,
      isSurvivor: false,
      isCharger: false,
      isMultiCiv: false
    };

    const caps = getCardCapabilities(syntheticBraidClaw);
    assert.equal(caps.attacksIfAble, true);

    const baseState = initializeGame(deckA, deckB, 'player');
    const braidInst = createCardInstance(syntheticBraidClaw, 'player', {
      summonedThisTurn: false,
      isTapped: false
    });

    const attackState = {
      ...baseState,
      turn: 2,
      activePlayer: 'player',
      phase: 'ATTACK',
      players: {
        ...baseState.players,
        player: {
          ...baseState.players.player,
          battleZone: [braidInst]
        }
      }
    };

    assert.equal(isCreatureMandatoryAttacker(braidInst), true);
    assert.equal(hasMandatoryAttackers(attackState, 'player'), true);

    // Reducer END_TURN must automatically force synthetic Braid Claw to attack
    const afterEndTurn = step(attackState, { type: 'END_TURN', player: 'player' });
    assert.equal(afterEndTurn.players.opponent.shields.length, 4);
    assert.equal(afterEndTurn.players.player.battleZone[0].isTapped, true);
  });

  it('AI respects mandatory attacker helper for synthetic non-DM01 Braid Claw', () => {
    const syntheticBraidClaw = {
      id: 'DMXX-074',
      name: 'Deadly Fighter Braid Claw',
      set: 'DM-XX',
      collectorNumber: '74',
      civilizations: ['Fire'],
      type: 'Creature',
      manaCost: 1,
      manaNumber: 1,
      power: 1000,
      races: ['Dragonoid'],
      isShieldTrigger: false,
      isBlocker: false,
      isSlayer: false,
      isSpeedAttacker: false,
      powerAttackerBonus: 0,
      breakerCount: 1,
      rulesText: 'This creature attacks each turn if able.',
      flavorText: '',
      rarity: 'Common',
      illustrator: 'Test',
      imageAssetPath: '',
      isEvolution: false,
      isSurvivor: false,
      isCharger: false,
      isMultiCiv: false
    };

    const baseState = initializeGame(deckA, deckB, 'opponent');
    const oppBraid = createCardInstance(syntheticBraidClaw, 'opponent', {
      summonedThisTurn: false,
      isTapped: false
    });
    const aiAttackState = {
      ...baseState,
      turn: 3,
      activePlayer: 'opponent',
      phase: 'ATTACK',
      players: {
        ...baseState.players,
        opponent: {
          ...baseState.players.opponent,
          battleZone: [oppBraid]
        }
      }
    };

    const aiAction = getAiAction(aiAttackState, 'opponent');
    assert.equal(aiAction?.type, 'DECLARE_ATTACK');
    assert.equal(aiAction?.attackerInstanceId, oppBraid.instanceId);
  });

  it('dispatches Emeral CIP shield-swap by canonical card name regardless of printing ID', () => {
    const syntheticEmeral = {
      id: 'REPRINT-EMERAL-77',
      name: 'Emeral',
      set: 'PROMO',
      collectorNumber: '77',
      civilizations: ['Water'],
      type: 'Creature',
      manaCost: 2,
      manaNumber: 1,
      power: 1000,
      races: ['Cyber Lord'],
      isShieldTrigger: false,
      isBlocker: false,
      isSlayer: false,
      isSpeedAttacker: false,
      powerAttackerBonus: 0,
      breakerCount: 1,
      rulesText: 'When you put this creature into the battle zone, you may put a card from your hand into your shields face down.',
      flavorText: '',
      rarity: 'Rare',
      illustrator: 'Test',
      imageAssetPath: '',
      isEvolution: false,
      isSurvivor: false,
      isCharger: false,
      isMultiCiv: false
    };

    const baseState = initializeGame(deckA, deckB, 'player', { interactiveHuman: true });
    const emeralInst = createCardInstance(syntheticEmeral, 'player', { summonedThisTurn: true });
    const withEmeral = {
      ...baseState,
      players: {
        ...baseState.players,
        player: {
          ...baseState.players.player,
          battleZone: [emeralInst]
        }
      }
    };

    const triggered = triggerCIP(withEmeral, 'player', emeralInst);
    assert.equal(triggered.pendingInteraction?.type, 'ZONE_SELECTION');
    assert.equal(triggered.pendingInteraction?.actionKind, 'EMERAL_HAND_TO_SHIELD');
    assert.equal(triggered.pendingInteraction?.sourceCardId, 'REPRINT-EMERAL-77');
  });
});
