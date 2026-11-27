import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { step } from '../../engine/reducer.ts';
import { initializeGame, createCardInstance } from '../../engine/state.ts';
import { CARD_MAP } from '../../data/cardLoader.ts';
import { compilePresentationBeats } from '../compilePresentationBeats.ts';

function createDeckFromCard(cardId, count = 40) {
  const card = CARD_MAP.get(cardId);
  assert.ok(card, `Card ${cardId} should exist`);
  return {
    id: `deck-${cardId}`,
    name: `Test ${card.name}`,
    items: [{ card, count }]
  };
}

function makeBaseState() {
  const d1 = createDeckFromCard('DM01-091'); // Burning Mane (Nature 2-drop, 2000)
  const d2 = createDeckFromCard('DM01-009'); // La Ura Giga, Sky Guardian (Light 1-drop, 2000 Blocker)
  return initializeGame(d1, d2, 'player', { shuffle: false, interactiveHuman: true });
}

describe('Async Presentation Beat Compiler', () => {
  it('returns 0 blocking beats for TOGGLE_MANA_TAP and UNDO_CHARGE_MANA (0ms latency)', () => {
    let state = makeBaseState();
    const manaTarget = state.players.player.hand[0];
    state = step(state, { type: 'CHARGE_MANA', player: 'player', cardInstanceId: manaTarget.instanceId });

    const toggleAction = { type: 'TOGGLE_MANA_TAP', player: 'player', cardInstanceId: manaTarget.instanceId, forceTapped: true };
    const afterToggle = step(state, toggleAction);
    assert.equal(compilePresentationBeats(state, toggleAction, afterToggle).length, 0);

    const undoAction = { type: 'UNDO_CHARGE_MANA', player: 'player' };
    const afterUndo = step(afterToggle, undoAction);
    assert.equal(compilePresentationBeats(afterToggle, undoAction, afterUndo).length, 0);
  });

  it('compiles CHARGE_MANA beat cleanly with card civilizations', () => {
    const state = makeBaseState();
    const cardInst = state.players.player.hand[0];
    const action = { type: 'CHARGE_MANA', player: 'player', cardInstanceId: cardInst.instanceId };
    const next = step(state, action);

    const beats = compilePresentationBeats(state, action, next);
    assert.equal(beats.length, 1);
    assert.equal(beats[0].event.type, 'CHARGE_MANA');
    assert.deepEqual(beats[0].event.civilizations, cardInst.card.civilizations);
    assert.equal(beats[0].displayState.players.player.manaZone.length, 1);
  });

  it('compiles first-class CAST_SPELL -> CREATURE_DESTROYED holding targets visible during CAST_SPELL beat', () => {
    const base = makeBaseState();
    const terrorPit = CARD_MAP.get('DM01-088'); // Terror Pit (Darkness Spell: Destroy 1 creature)
    const darkMana = CARD_MAP.get('DM01-074');
    const blocker = createCardInstance(CARD_MAP.get('DM01-009'), 'opponent', 'opp-blocker-1');
    const pitInst = createCardInstance(terrorPit, 'player', 'p-pit-1');

    const prev = {
      ...base,
      phase: 'MAIN',
      players: {
        ...base.players,
        player: {
          ...base.players.player,
          hand: [pitInst],
          manaZone: Array.from({ length: 6 }, (_, i) => ({
            instanceId: `p-mana-${i}`,
            card: darkMana,
            isTapped: false
          }))
        },
        opponent: {
          ...base.players.opponent,
          battleZone: [blocker]
        }
      }
    };

    const action = {
      type: 'CAST_SPELL',
      player: 'player',
      cardInstanceId: pitInst.instanceId,
      targets: [blocker.instanceId]
    };
    const next = step(prev, action);
    assert.equal(next.players.opponent.battleZone.length, 0);

    const beats = compilePresentationBeats(prev, action, next);
    assert.equal(beats[0].event.type, 'CAST_SPELL');
    // Crucial: opponent creature is STILL visible in BattleZone during the CAST_SPELL beat!
    assert.equal(beats[0].displayState.players.opponent.battleZone.length, 1);

    const destroyBeat = beats.find((b) => b.event.type === 'CREATURE_DESTROYED');
    assert.ok(destroyBeat, 'Expected a follow-up CREATURE_DESTROYED beat');
    // Still kept on board during dissolve animation beat, moves on next frame settlement
    assert.equal(destroyBeat.displayState.players.opponent.battleZone.length, 1);
  });

  it('splits 2-step combat cleanly: DECLARE_ATTACK stops at BLOCK without shield break, and DECLARE_BLOCK(null) breaks shields without duplicating DECLARE_ATTACK', () => {
    const base = makeBaseState();
    const attacker = { ...createCardInstance(CARD_MAP.get('DM01-091'), 'player', 'p-atk-1'), isTapped: false, summonedTurn: 0, powerModifier: 0 };
    const blocker = { ...createCardInstance(CARD_MAP.get('DM01-009'), 'opponent', 'o-blk-1'), isTapped: false, summonedTurn: 0, powerModifier: 0 };

    const prev = {
      ...base,
      phase: 'ATTACK',
      players: {
        ...base.players,
        player: { ...base.players.player, battleZone: [attacker] },
        opponent: { ...base.players.opponent, battleZone: [blocker] }
      }
    };

    const atkAction = { type: 'DECLARE_ATTACK', player: 'player', attackerInstanceId: attacker.instanceId, target: { type: 'shield', index: 0 } };
    const mid = step(prev, atkAction);
    assert.equal(mid.pendingInteraction?.type, 'BLOCK_DECLARATION');

    // Step 1: Attack declared while blocker exists -> ONLY DECLARE_ATTACK, pendingInteraction held null during beat
    const step1Beats = compilePresentationBeats(prev, atkAction, mid);
    assert.equal(step1Beats.length, 1);
    assert.equal(step1Beats[0].event.type, 'DECLARE_ATTACK');
    assert.equal(step1Beats[0].displayState.pendingInteraction, null);
    assert.equal(step1Beats[0].displayState.players.opponent.shields.length, 5);

    // Step 2: Opponent passes block -> MUST emit SHIELD_BROKEN WITHOUT repeating DECLARE_ATTACK
    const passBlockAction = { type: 'DECLARE_BLOCK', player: 'opponent', blockerId: null };
    const afterPass = step(mid, passBlockAction);
    const step2Beats = compilePresentationBeats(mid, passBlockAction, afterPass);

    assert.equal(step2Beats.some((b) => b.event.type === 'DECLARE_ATTACK'), false);
    assert.equal(step2Beats[0].event.type, 'SHIELD_BROKEN');
    // Intact shields still held in SHIELD_BROKEN beat snapshot so WebGL shatter plays over unbroken slot!
    assert.equal(step2Beats[0].displayState.players.opponent.shields.length, 5);
  });

  it('queues SHIELD_BROKEN before SHIELD_TRIGGER and holds pendingInteraction null during SHIELD_BROKEN', () => {
    const base = makeBaseState();
    const attacker = { ...createCardInstance(CARD_MAP.get('DM01-091'), 'player', 'p-atk-st'), isTapped: false, summonedTurn: 0, powerModifier: 0 };
    const holyAwe = CARD_MAP.get('DM01-006'); // Shield Trigger spell

    const prev = {
      ...base,
      phase: 'ATTACK',
      players: {
        ...base.players,
        player: { ...base.players.player, battleZone: [attacker] },
        opponent: {
          ...base.players.opponent,
          battleZone: [],
          shields: [
            { id: 'shield-st-0', shieldId: 'shield-st-0', card: holyAwe, isBroken: false }
          ]
        }
      }
    };

    const action = { type: 'DECLARE_ATTACK', player: 'player', attackerInstanceId: attacker.instanceId, target: { type: 'shield', index: 0 } };
    const next = step(prev, action);
    assert.equal(next.pendingInteraction?.type, 'SHIELD_TRIGGER_RESOLUTION');

    const beats = compilePresentationBeats(prev, action, next);
    assert.deepEqual(
      beats.map((b) => b.event.type),
      ['DECLARE_ATTACK', 'SHIELD_BROKEN', 'SHIELD_TRIGGER']
    );
    // Shield Trigger modal suppressed during attack & shield shatter beats
    assert.equal(beats[0].displayState.pendingInteraction, null);
    assert.equal(beats[1].displayState.pendingInteraction, null);
    assert.equal(beats[2].displayState.pendingInteraction, null);
    assert.equal(beats[2].cutIn?.kind, 'SHIELD_TRIGGER');
  });

  it('compiles EVOLVE beat holding bait visible and triggers BOSS_SUMMON cutIn for >= 6000 power summons', () => {
    const base = makeBaseState();
    const bossCard = [...CARD_MAP.values()].find((c) => c.type === 'Creature' && !c.isEvolution && (c.power ?? 0) >= 6000);
    assert.ok(bossCard, 'Need >= 6000 creature');
    const bossInst = createCardInstance(bossCard, 'player', 'p-boss');

    const prevBoss = {
      ...base,
      phase: 'MAIN',
      players: {
        ...base.players,
        player: {
          ...base.players.player,
          hand: [bossInst],
          manaZone: Array.from({ length: 10 }, (_, i) => ({
            instanceId: `mana-b-${i}`,
            card: bossCard,
            isTapped: false
          }))
        }
      }
    };
    const summonAction = { type: 'SUMMON_CREATURE', player: 'player', cardInstanceId: bossInst.instanceId };
    const nextBoss = step(prevBoss, summonAction);
    const bossBeats = compilePresentationBeats(prevBoss, summonAction, nextBoss);
    assert.equal(bossBeats[0].event.type, 'SUMMON_CREATURE');
    assert.equal(bossBeats[0].cutIn?.kind, 'BOSS_SUMMON');

    // Test Evolution creature keeping bait visible during EVOLVE beat
    const evoDef = [...CARD_MAP.values()].find(
      (c) => c.type === 'Evolution Creature' && !c.rulesText?.toLowerCase().includes('vortex evolution') && c.races?.length
    );
    assert.ok(evoDef, 'Need standard Evolution Creature');
    const validBaitCard = [...CARD_MAP.values()].find(
      (c) => c.type === 'Creature' && c.races?.some((r) => evoDef.races.includes(r))
    );
    assert.ok(validBaitCard, 'Need matching bait creature');
    const baitInst = { ...createCardInstance(validBaitCard, 'player', 'bait-evo'), isTapped: false, summonedTurn: 1, powerModifier: 0 };
    const evoInst = createCardInstance(evoDef, 'player', 'evo-card');

    const prevEvo = {
      ...base,
      phase: 'MAIN',
      players: {
        ...base.players,
        player: {
          ...base.players.player,
          hand: [evoInst],
          battleZone: [baitInst],
          manaZone: Array.from({ length: 10 }, (_, i) => ({
            instanceId: `mana-e-${i}`,
            card: evoDef,
            isTapped: false
          }))
        }
      }
    };
    const evoAction = { type: 'SUMMON_CREATURE', player: 'player', cardInstanceId: evoInst.instanceId, baitInstanceId: baitInst.instanceId };
    const nextEvo = step(prevEvo, evoAction);
    const evoBeats = compilePresentationBeats(prevEvo, evoAction, nextEvo);
    assert.equal(evoBeats[0].event.type, 'EVOLVE');
    assert.equal(evoBeats[0].cutIn?.kind, 'EVOLUTION');
    assert.equal(evoBeats[0].displayState.players.player.battleZone[0].instanceId, baitInst.instanceId);
  });
});
