import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { initializeGame, createCardInstance } from '../state.ts';
import { step } from '../reducer.ts';
import { getAiAction } from '../ai.ts';
import { resolveSpellEffect } from '../spells.ts';
import { getSpellTargetRequirement } from '../targeting.ts';
import { declareAttack, declareBlock } from '../combat.ts';
import { destroyCreature, sendCreatureToManaZone } from '../boardRemoval.ts';
import { triggerCIP, triggerEndTurn } from '../triggers.ts';
import { canCreatureAttack, canBeBlockedBy } from '../continuous.ts';
import { CARD_LIST } from '../../data/cardLoader.ts';

function findCard(name) {
  const found = CARD_LIST.find((c) => c.name.toLowerCase() === name.toLowerCase());
  assert.ok(found, `Card not found: ${name}`);
  return found;
}

function makeCreature(card, owner, instanceId, overrides = {}) {
  return {
    instanceId,
    card,
    owner,
    isTapped: false,
    summonedTurn: 1,
    powerModifier: 0,
    ...overrides
  };
}

function makeBaseState(overrides = {}) {
  const deckA = {
    id: 's2-deck-a',
    name: 'Deck A',
    items: CARD_LIST.slice(0, 10).map((c) => ({ card: c, count: 4 })),
    updatedAt: 1
  };
  const deckB = {
    id: 's2-deck-b',
    name: 'Deck B',
    items: CARD_LIST.slice(10, 20).map((c) => ({ card: c, count: 4 })),
    updatedAt: 1
  };
  const base = initializeGame(deckA, deckB, 'player', {
    interactiveHuman: overrides.interactiveHuman ?? false
  });
  return {
    ...base,
    turn: overrides.turn ?? 4,
    activePlayer: overrides.activePlayer ?? 'player',
    phase: overrides.phase ?? 'MAIN',
    players: {
      player: {
        ...base.players.player,
        ...(overrides.player || {})
      },
      opponent: {
        ...base.players.opponent,
        ...(overrides.opponent || {})
      }
    }
  };
}

describe('Sprint 2 Contract Tests', () => {
  describe('1. Removal Targeting & Untargetable Safety (Petrova / Empty Board / AI)', () => {
    const removalSpellNames = [
      'Death Smoke',
      'Terror Pit',
      'Crimson Hammer',
      'Tornado Flame',
      "Phantom Dragon's Flame",
      'Spiral Gate',
      'Natural Snare',
      'Solar Ray'
    ];

    it('gracefully resolves as a logged no-op when only untargetable Petrova or 0 creatures exist', () => {
      const petrova = findCard('Petrova, Channeler of Suns');

      for (const spellName of removalSpellNames) {
        const spell = findCard(spellName);

        // Empty board (targets omitted)
        const emptyState = makeBaseState({
          player: { battleZone: [] },
          opponent: { battleZone: [] }
        });
        const afterEmpty = resolveSpellEffect(emptyState, 'player', spell);
        assert.equal(afterEmpty.players.opponent.battleZone.length, 0);
        assert.ok(afterEmpty.actionLog.length > emptyState.actionLog.length, `${spellName} should log no-op`);

        // Petrova-only board (targets omitted & empty array)
        const petrovaOnly = makeBaseState({
          player: { battleZone: [] },
          opponent: { battleZone: [makeCreature(petrova, 'opponent', 'opp-petrova')] }
        });
        const afterPetrovaOmitted = resolveSpellEffect(petrovaOnly, 'player', spell);
        assert.equal(afterPetrovaOmitted.players.opponent.battleZone.length, 1, `${spellName} must not remove Petrova`);

        const afterPetrovaEmptyArr = resolveSpellEffect(petrovaOnly, 'player', spell, []);
        assert.equal(afterPetrovaEmptyArr.players.opponent.battleZone.length, 1, `${spellName} must not remove Petrova on []`);

        // targeting.ts must report 0 valid targets for opponent removal against Petrova alone
        const req = getSpellTargetRequirement(spell, petrovaOnly, 'player');
        assert.equal(req.validTargetIds.includes('opp-petrova'), false, `${spellName} must exclude Petrova from validTargetIds`);
      }
    });

    it('rejects explicit targeting of untargetable Petrova while destroying valid sibling targets', () => {
      const petrova = findCard('Petrova, Channeler of Suns');
      const vorg = findCard('Immortal Baron, Vorg');
      const deathSmoke = findCard('Death Smoke');

      const state = makeBaseState({
        opponent: {
          battleZone: [
            makeCreature(petrova, 'opponent', 'opp-petrova'),
            makeCreature(vorg, 'opponent', 'opp-vorg')
          ]
        }
      });

      assert.throws(() => resolveSpellEffect(state, 'player', deathSmoke, ['opp-petrova']), /cannot be chosen/i);

      const resolved = resolveSpellEffect(state, 'player', deathSmoke);
      assert.deepEqual(
        resolved.players.opponent.battleZone.map((c) => c.instanceId),
        ['opp-petrova']
      );
    });

    it('AI never wastes mandatory single-target removal spells when only Petrova or empty board exists', () => {
      const petrova = findCard('Petrova, Channeler of Suns');
      const terrorPit = findCard('Terror Pit');
      const deathSmoke = findCard('Death Smoke');
      const spiralGate = findCard('Spiral Gate');
      const fireCard = findCard('Immortal Baron, Vorg');

      const aiState = makeBaseState({
        activePlayer: 'opponent',
        phase: 'MAIN',
        player: {
          battleZone: [makeCreature(petrova, 'player', 'p-petrova')]
        },
        opponent: {
          hand: [
            createCardInstance(terrorPit, 'opponent'),
            createCardInstance(deathSmoke, 'opponent'),
            createCardInstance(spiralGate, 'opponent')
          ],
          manaZone: Array.from({ length: 8 }, (_, idx) => ({
            instanceId: `ai-mana-${idx}`,
            card: idx % 2 === 0 ? terrorPit : spiralGate,
            isTapped: false
          })),
          battleZone: [makeCreature(fireCard, 'opponent', 'ai-vorg')]
        }
      });

      const action = getAiAction(aiState, 'opponent');
      assert.equal(action?.type, 'PASS_PHASE', 'AI must pass instead of casting wasted removal or self-bouncing Spiral Gate');
    });
  });

  describe('2. Forced Block (4 Cards) & Precedence', () => {
    const forcedNames = [
      'Pierr, Psycho Doll',
      'Ardent Lunatron',
      'Messa Bahna, Expanse Guardian',
      'Belmol, the Explorer'
    ];

    it('auto-blocks immediately with zero modal when defender has 1 legal forced blocker', () => {
      const attackerCard = findCard('Immortal Baron, Vorg');
      for (const name of forcedNames) {
        const blockerCard = findCard(name);
        const blocker = makeCreature(blockerCard, 'opponent', 'opp-forced-1');
        const otherBlocker = makeCreature(findCard('La Ura Giga, Sky Guardian'), 'opponent', 'opp-opt');
        const attacker = makeCreature(attackerCard, 'player', 'p-att');

        const state = makeBaseState({
          phase: 'ATTACK',
          player: { battleZone: [attacker] },
          opponent: { battleZone: [blocker, otherBlocker] }
        });

        const afterAttack = declareAttack(state, 'p-att', { type: 'shield', index: 0 });
        assert.equal(afterAttack.pendingInteraction, null, `${name} should auto-block with no modal`);
        assert.equal(afterAttack.combatState, null, `${name} combat should resolve immediately`);
        assert.equal(afterAttack.players.opponent.shields.filter((s) => !s.isBroken).length, 5, 'Shield must remain unbroken');
      }
    });

    it('emits mandatory BLOCK_DECLARATION when 2+ forced blockers are legal and taps remaining forced blockers', () => {
      const pierr = findCard('Pierr, Psycho Doll');
      const lunatron = findCard('Ardent Lunatron');
      const diaNork = findCard('Dia Nork, Moonlight Guardian');
      const attackerCard = findCard('Bolshack Dragon');

      const bPierr = makeCreature(pierr, 'player', 'p-pierr');
      const bLuna = makeCreature(lunatron, 'player', 'p-luna');
      const bOpt = makeCreature(diaNork, 'player', 'p-dianork');
      const att = makeCreature(attackerCard, 'opponent', 'opp-bolshack');

      const state = makeBaseState({
        activePlayer: 'opponent',
        phase: 'ATTACK',
        interactiveHuman: true,
        player: { battleZone: [bPierr, bLuna, bOpt] },
        opponent: { battleZone: [att] }
      });

      const afterAttack = declareAttack(state, 'opp-bolshack', { type: 'shield', index: 0 });
      assert.equal(afterAttack.pendingInteraction?.type, 'BLOCK_DECLARATION');
      assert.equal(afterAttack.pendingInteraction?.isMandatory, true);
      assert.deepEqual(
        [...(afterAttack.pendingInteraction?.validBlockerIds || [])].sort(),
        ['p-luna', 'p-pierr']
      );

      assert.throws(() => declareBlock(afterAttack, null), /forced blocker/i);
      assert.throws(() => declareBlock(afterAttack, 'p-dianork'), /invalid blocker/i);

      // Choosing Pierr battles Bolshack (Pierr Slayer kills Bolshack too) and taps Ardent Lunatron as well
      const afterBlock = declareBlock(afterAttack, 'p-pierr');
      assert.equal(afterBlock.pendingInteraction, null);
      const lunaAfter = afterBlock.players.player.battleZone.find((c) => c.instanceId === 'p-luna');
      assert.equal(lunaAfter?.isTapped, true, 'All other legal forced blockers must tap alongside chosen blocker');
    });

    it('enforces unblockable precedence over blocksIfAble (Crystal Lancer cannot be forced-blocked)', () => {
      const pierr = makeCreature(findCard('Pierr, Psycho Doll'), 'opponent', 'opp-pierr');
      const lancer = makeCreature(findCard('Crystal Lancer'), 'player', 'p-lancer');
      const vanillaCard = findCard('Immortal Baron, Vorg');

      const state = makeBaseState({
        phase: 'ATTACK',
        player: { battleZone: [lancer] },
        opponent: {
          battleZone: [pierr],
          shields: [
            { id: 'cl-s1', shieldId: 'cl-s1', card: vanillaCard, isBroken: false },
            { id: 'cl-s2', shieldId: 'cl-s2', card: vanillaCard, isBroken: false },
            { id: 'cl-s3', shieldId: 'cl-s3', card: vanillaCard, isBroken: false }
          ]
        }
      });

      assert.equal(canBeBlockedBy(lancer, pierr, { type: 'shield', index: 0 }, state), false);
      const afterAttack = declareAttack(state, 'p-lancer', { type: 'shield', index: 0 });
      assert.equal(afterAttack.pendingInteraction, null);
      assert.equal(afterAttack.players.opponent.shields.filter((s) => !s.isBroken).length, 1);
    });

    it('AI obeys mandatory forced blocks even when chump-blocking loses', () => {
      const pierr = makeCreature(findCard('Pierr, Psycho Doll'), 'opponent', 'ai-pierr');
      const lunatron = makeCreature(findCard('Ardent Lunatron'), 'opponent', 'ai-luna');
      const bigAtt = makeCreature(findCard('Bolmeteus Steel Dragon'), 'player', 'p-bolmeteus');

      const state = makeBaseState({
        activePlayer: 'player',
        phase: 'ATTACK',
        player: { battleZone: [bigAtt] },
        opponent: { battleZone: [pierr, lunatron] }
      });

      const afterAttack = declareAttack(state, 'p-bolmeteus', { type: 'shield', index: 0 });
      assert.equal(afterAttack.pendingInteraction?.type, 'BLOCK_DECLARATION');
      const aiChoice = getAiAction(afterAttack, 'opponent');
      assert.equal(aiChoice?.type, 'DECLARE_BLOCK');
      assert.ok(aiChoice?.blockerId !== null, 'AI must never choose null on mandatory block');
    });
  });

  describe('3. Forced Attack (Slime Veil, Infernal Command, Forced Frenzy, Taunting Skyterror, Bodacious Giant, Gabzagul)', () => {
    it('Slime Veil forces opponent creatures to attack on their next turn and expires when caster starts next turn', () => {
      const slimeVeil = findCard('Slime Veil');
      const vanillaFiller = findCard('Immortal Baron, Vorg');
      const oppCreature = makeCreature(vanillaFiller, 'opponent', 'opp-vorg');

      let state = makeBaseState({
        activePlayer: 'player',
        phase: 'MAIN',
        player: {
          shields: [
            { id: 'sv-s1', shieldId: 'sv-s1', card: vanillaFiller, isBroken: false },
            { id: 'sv-s2', shieldId: 'sv-s2', card: vanillaFiller, isBroken: false }
          ]
        },
        opponent: { battleZone: [oppCreature] }
      });

      state = resolveSpellEffect(state, 'player', slimeVeil);
      assert.equal(state.players.opponent.tempForceAllAttacksGrantedBy, 'player');

      // End player turn -> opponent turn begins (must STILL be active!)
      state = step(state, { type: 'END_TURN', player: 'player' });
      assert.equal(state.activePlayer, 'opponent');
      assert.equal(state.players.opponent.tempForceAllAttacksGrantedBy, 'player');

      state = step(state, { type: 'PASS_PHASE', player: 'opponent' }); // MAIN
      state = step(state, { type: 'END_TURN', player: 'opponent' }); // forces opp-vorg to attack!
      assert.equal(state.players.player.shields.filter((s) => !s.isBroken).length, 1, 'Vorg forced to attack shield on Slime Veil turn');
      state = step(state, { type: 'END_TURN', player: 'opponent' }); // no mandatory attackers remain -> ends turn
      assert.equal(state.activePlayer, 'player', 'Turn ends cleanly once no mandatory attackers remain');
      assert.equal(state.players.opponent.tempForceAllAttacksGrantedBy, undefined, 'Expired once caster turn started');
    });

    it('Infernal Command & Forced Frenzy grant forced attack until start of caster next turn (surviving EOT)', () => {
      const infernal = findCard('Infernal Command');
      const frenzy = findCard('Forced Frenzy');
      const vanillaFiller = findCard('Immortal Baron, Vorg');
      const c1 = makeCreature(vanillaFiller, 'opponent', 'opp-1');
      const c2 = makeCreature(vanillaFiller, 'opponent', 'opp-2');

      let s1 = makeBaseState({ opponent: { battleZone: [c1, c2] } });
      s1 = resolveSpellEffect(s1, 'player', infernal, ['opp-1']);
      assert.equal(s1.players.opponent.battleZone[0].tempAttacksIfAble, true);
      assert.equal(s1.players.opponent.battleZone[1].tempAttacksIfAble, undefined);

      let s2 = makeBaseState({
        player: {
          shields: [
            { id: 'ff-s1', shieldId: 'ff-s1', card: vanillaFiller, isBroken: false },
            { id: 'ff-s2', shieldId: 'ff-s2', card: vanillaFiller, isBroken: false },
            { id: 'ff-s3', shieldId: 'ff-s3', card: vanillaFiller, isBroken: false }
          ]
        },
        opponent: { battleZone: [c1, c2] }
      });
      s2 = resolveSpellEffect(s2, 'player', frenzy);
      assert.equal(s2.players.opponent.battleZone[0].tempAttacksIfAble, true);
      assert.equal(s2.players.opponent.battleZone[1].tempAttacksIfAble, true);

      // End of turn must preserve tempAttacksIfAbleUntilTurnOf
      s2 = step(s2, { type: 'END_TURN', player: 'player' });
      assert.equal(s2.activePlayer, 'opponent');
      assert.equal(s2.players.opponent.battleZone.every((c) => c.tempAttacksIfAble), true);

      // Opponent trying to end turn in MAIN/ATTACK forces BOTH opp-1 and opp-2 to attack!
      s2 = step(s2, { type: 'PASS_PHASE', player: 'opponent' });
      s2 = step(s2, { type: 'END_TURN', player: 'opponent' });
      assert.equal(s2.players.player.shields.filter((s) => !s.isBroken).length, 2);
      s2 = step(s2, { type: 'END_TURN', player: 'opponent' });
      assert.equal(s2.players.player.shields.filter((s) => !s.isBroken).length, 1);
      s2 = step(s2, { type: 'END_TURN', player: 'opponent' });
      assert.equal(s2.activePlayer, 'player');
      assert.equal(s2.players.opponent.battleZone.every((c) => !c.tempAttacksIfAble), true, 'Clears on caster startTurn');
    });

    it('Taunting Skyterror & Gabzagul enforce forced attacks correctly', () => {
      const skyterror = makeCreature(findCard('Taunting Skyterror'), 'opponent', 'opp-sky', { isTapped: true });
      const pAtt = makeCreature(findCard('Immortal Baron, Vorg'), 'player', 'p-vorg');
      const sSky = makeBaseState({
        activePlayer: 'player',
        phase: 'ATTACK',
        player: { battleZone: [pAtt] },
        opponent: { battleZone: [skyterror] }
      });

      const afterEnd = step(sSky, { type: 'END_TURN', player: 'player' });
      assert.equal(afterEnd.players.opponent.shields.filter((s) => !s.isBroken).length, 4);

      const gabzagul = makeCreature(findCard('Gabzagul, Warlord of Pain'), 'opponent', 'opp-gab', { isTapped: false });
      const sGab = makeBaseState({
        activePlayer: 'player',
        phase: 'ATTACK',
        player: { battleZone: [pAtt] },
        opponent: { battleZone: [gabzagul] }
      });
      const afterGabEnd = step(sGab, { type: 'END_TURN', player: 'player' });
      assert.equal(afterGabEnd.players.opponent.shields.filter((s) => !s.isBroken).length, 4);
    });

    it('Bodacious Giant lures all capable opponent creatures when tapped and not yet attacked that turn', () => {
      const giant = makeCreature(findCard('Bodacious Giant'), 'opponent', 'opp-giant', { isTapped: true });
      const att1 = makeCreature(findCard('Immortal Baron, Vorg'), 'player', 'p-att-1');
      const att2 = makeCreature(findCard('Bolshack Dragon'), 'player', 'p-att-2');

      let state = makeBaseState({
        activePlayer: 'player',
        phase: 'ATTACK',
        player: { battleZone: [att1, att2] },
        opponent: { battleZone: [giant] }
      });

      // Cannot attack shields while Bodacious Giant is tapped and unattacked this turn
      assert.equal(
        canCreatureAttack(state, att1, { type: 'shield', index: 0 }, 'player').valid,
        false
      );
      assert.equal(
        canCreatureAttack(state, att1, { type: 'creature', instanceId: 'opp-giant' }, 'player').valid,
        true
      );

      // AI facing tapped unattacked Bodacious Giant must attack Giant first
      const aiViewState = makeBaseState({
        activePlayer: 'opponent',
        phase: 'ATTACK',
        player: { battleZone: [makeCreature(findCard('Bodacious Giant'), 'player', 'p-giant', { isTapped: true })] },
        opponent: { battleZone: [makeCreature(findCard('Immortal Baron, Vorg'), 'opponent', 'ai-vorg')] }
      });
      const aiAct = getAiAction(aiViewState, 'opponent');
      assert.equal(aiAct?.type, 'DECLARE_ATTACK');
      assert.deepEqual(aiAct?.target, { type: 'creature', instanceId: 'p-giant' });

      // First creature attacks Giant (dies to 12000, Giant is now wasAttackedThisTurn: true)
      state = step(state, {
        type: 'DECLARE_ATTACK',
        player: 'player',
        attackerInstanceId: 'p-att-1',
        target: { type: 'creature', instanceId: 'opp-giant' }
      });
      assert.equal(state.players.opponent.battleZone[0].wasAttackedThisTurn, true);

      // Second creature is NO LONGER forced to attack Giant and can hit shields or pass turn cleanly!
      assert.equal(
        canCreatureAttack(state, att2, { type: 'shield', index: 0 }, 'player').valid,
        true
      );
    });
  });

  describe('4. Shield Burn (6 Cards) & Fortress Shell Fix', () => {
    it('Gajirabute & Core-Crash Lizard burn opponent shield to graveyard WITHOUT Shield Trigger', () => {
      const shieldTriggerSpell = findCard('Holy Awe');
      for (const name of ['Gajirabute, Vile Centurion', 'Core-Crash Lizard']) {
        const card = findCard(name);
        const creature = makeCreature(card, 'player', `p-${card.id}`);
        const state = makeBaseState({
          interactiveHuman: false,
          player: { battleZone: [creature] },
          opponent: {
            shields: [{ id: 'opp-sh-1', shieldId: 'opp-sh-1', card: shieldTriggerSpell, isBroken: false }]
          }
        });

        const afterCIP = triggerCIP(state, 'player', creature);
        assert.equal(afterCIP.pendingInteraction, null, `${name} must not trigger Shield Trigger`);
        assert.equal(afterCIP.players.opponent.shields.length, 0);
        assert.equal(afterCIP.players.opponent.graveyard.length, 1);
      }
    });

    it('Fortress Shell hits opponent mana zone (up to 2) instead of opponent shields', () => {
      const fortress = findCard('Fortress Shell');
      const manaCard = findCard('Bronzewear Tribe' in CARD_LIST ? 'Bronzewear Tribe' : 'Bronze-Arm Tribe');
      const fInst = makeCreature(fortress, 'player', 'p-fortress');
      const state = makeBaseState({
        player: { battleZone: [fInst] },
        opponent: {
          shields: [{ id: 'sh-1', shieldId: 'sh-1', card: manaCard, isBroken: false }],
          manaZone: [
            { instanceId: 'm1', card: manaCard, isTapped: false },
            { instanceId: 'm2', card: manaCard, isTapped: false },
            { instanceId: 'm3', card: manaCard, isTapped: false }
          ]
        }
      });

      const afterCIP = triggerCIP(state, 'player', fInst);
      assert.equal(afterCIP.players.opponent.shields.length, 1, 'Fortress Shell must NOT touch shields');
      assert.equal(afterCIP.players.opponent.manaZone.length, 1, 'Fortress Shell must send 2 mana cards to GY');
      assert.equal(afterCIP.players.opponent.graveyard.length, 2);
    });

    it('General Dark Fiend, Necrodragon Galbazeek, and Steam Rumbler Kain put own shield into graveyard on attack (no-op at 0 shields)', () => {
      const holyAwe = findCard('Holy Awe');
      const vanillaCard = findCard('Immortal Baron, Vorg');
      for (const name of ['General Dark Fiend', 'Necrodragon Galbazeek', 'Steam Rumbler Kain']) {
        const card = findCard(name);
        const att = makeCreature(card, 'player', `att-${card.id}`);
        const state = makeBaseState({
          phase: 'ATTACK',
          player: {
            battleZone: [att],
            shields: [{ id: 'self-sh-1', shieldId: 'self-sh-1', card: holyAwe, isBroken: false }]
          },
          opponent: {
            shields: [
              { id: 'opp-sh-v1', shieldId: 'opp-sh-v1', card: vanillaCard, isBroken: false },
              { id: 'opp-sh-v2', shieldId: 'opp-sh-v2', card: vanillaCard, isBroken: false }
            ]
          }
        });
        const after = declareAttack(state, att.instanceId, { type: 'shield', index: 0 });
        assert.equal(after.pendingInteraction, null, `${name} must not trigger own Shield Trigger`);
        assert.equal(after.players.player.shields.length, 0);
        assert.equal(after.players.player.graveyard.length, 1);

        // 0 shields -> safe no-op
        const zeroState = makeBaseState({
          phase: 'ATTACK',
          player: { battleZone: [makeCreature(card, 'player', `att0-${card.id}`)], shields: [] },
          opponent: {
            shields: [
              { id: 'opp0-v1', shieldId: 'opp0-v1', card: vanillaCard, isBroken: false },
              { id: 'opp0-v2', shieldId: 'opp0-v2', card: vanillaCard, isBroken: false }
            ]
          }
        });
        const afterZero = declareAttack(zeroState, `att0-${card.id}`, { type: 'shield', index: 0 });
        assert.equal(afterZero.players.player.shields.length, 0);
      }
    });

    it('Bruiser Dragon puts 1 of its owner shields into graveyard when destroyed (no Shield Trigger)', () => {
      const holyAwe = findCard('Holy Awe');
      const bruiser = makeCreature(findCard('Bruiser Dragon'), 'player', 'p-bruiser');
      const state = makeBaseState({
        player: {
          battleZone: [bruiser],
          shields: [{ id: 'sh-b1', shieldId: 'sh-b1', card: holyAwe, isBroken: false }]
        }
      });

      const afterDestroy = destroyCreature(state, 'p-bruiser');
      assert.equal(afterDestroy.pendingInteraction, null, 'Bruiser Dragon shield burn skips Shield Trigger');
      assert.equal(afterDestroy.players.player.shields.length, 0);
      assert.equal(afterDestroy.players.player.graveyard.some((g) => g.card.name === 'Holy Awe'), true);
    });
  });

  describe('5. ON_ATTACK Triggers (Daidalos Combat Abort, Ally Triggers, All Remaining 16)', () => {
    it('Daidalos, General of Fury destroys sole creature (itself) on attack and aborts combat cleanly before shield break', () => {
      const daidalos = makeCreature(findCard('Daidalos, General of Fury'), 'player', 'p-daidalos');
      const state = makeBaseState({
        phase: 'ATTACK',
        player: { battleZone: [daidalos] }
      });

      const after = declareAttack(state, 'p-daidalos', { type: 'shield', index: 0 });
      assert.equal(after.players.player.battleZone.length, 0, 'Daidalos sacrificed itself');
      assert.equal(after.combatState, null, 'Combat aborted cleanly');
      assert.equal(after.players.opponent.shields.filter((s) => !s.isBroken).length, 5, 'Shields must NOT break after Daidalos self-sacrifice');
    });

    it('Thrumiss taps an opponent creature and Zero Nemesis discards 1 when an ally creature attacks', () => {
      const thrumiss = makeCreature(findCard('Thrumiss, Zephyr Guardian'), 'player', 'p-thrumiss', { summonedTurn: 4 });
      const zero = makeCreature(findCard('Zero Nemesis, Shadow of Panic'), 'player', 'p-zero', { summonedTurn: 4 });
      const ally = makeCreature(findCard('Immortal Baron, Vorg'), 'player', 'p-ally');
      const oppTarget = makeCreature(findCard('Dia Nork, Moonlight Guardian'), 'opponent', 'opp-target');

      const state = makeBaseState({
        phase: 'ATTACK',
        player: { battleZone: [thrumiss, zero, ally] },
        opponent: {
          battleZone: [oppTarget],
          hand: [createCardInstance(findCard('Holy Awe'), 'opponent')]
        }
      });

      const after = declareAttack(state, 'p-ally', { type: 'shield', index: 0 });
      assert.equal(after.players.opponent.battleZone[0].isTapped, true, 'Thrumiss tapped opponent creature on ally attack');
      assert.equal(after.players.opponent.graveyard.length, 1, 'Zero Nemesis discarded opponent hand card to graveyard on ally attack');
    });

    it('Marrow Ooze destroys itself after attacking a player/shield (not when attacking a tapped creature)', () => {
      const oozeCard = findCard('Marrow Ooze, the Twister');
      const ooze = makeCreature(oozeCard, 'player', 'p-ooze');
      const shieldAttackState = makeBaseState({
        phase: 'ATTACK',
        player: { battleZone: [ooze] }
      });
      const afterShieldAtk = declareAttack(shieldAttackState, 'p-ooze', { type: 'shield', index: 0 });
      assert.equal(afterShieldAtk.players.player.battleZone.length, 0, 'Marrow Ooze destroyed after attacking player/shield');
      assert.equal(afterShieldAtk.players.opponent.shields.filter((s) => !s.isBroken).length, 4);

      const tappedWeak = makeCreature({ ...findCard('Immortal Baron, Vorg'), power: 500 }, 'opponent', 'opp-weak', { isTapped: true });
      const creatureAtkState = makeBaseState({
        phase: 'ATTACK',
        player: { battleZone: [makeCreature(oozeCard, 'player', 'p-ooze-2')] },
        opponent: { battleZone: [tappedWeak] }
      });
      const afterCreatureAtk = declareAttack(creatureAtkState, 'p-ooze-2', { type: 'creature', instanceId: 'opp-weak' });
      assert.equal(afterCreatureAtk.players.player.battleZone.length, 1, 'Marrow Ooze survives attacking a weaker creature');
    });

    it('executes remaining ON_ATTACK effects cleanly (Plasma Chaser, Stained Glass, Bolzard, Ra Vu, Neptas, Ponitas, Gamil, Psyshroom, Sniper Mosquito, Earthstomp, Smile Angler, Curious Eye, Migalo, Lalicious, Sabermask)', () => {
      const manaFiller = findCard('Bronze-Arm Tribe');
      const fireCard = findCard('Immortal Baron, Vorg');
      const lightSpell = findCard('Holy Awe');
      const darkCreature = findCard('Bloody Squito');
      const waterCard = findCard('Aqua Hulcus');

      // 1. Plasma Chaser (draw == opp BZ count)
      const sPlasma = makeBaseState({
        phase: 'ATTACK',
        player: { battleZone: [makeCreature(findCard('Plasma Chaser'), 'player', 'p-plasma')] },
        opponent: { battleZone: [makeCreature(fireCard, 'opponent', 'o1'), makeCreature(fireCard, 'opponent', 'o2')] }
      });
      const resPlasma = declareAttack(sPlasma, 'p-plasma', { type: 'shield', index: 0 });
      assert.equal(resPlasma.players.player.hand.length, sPlasma.players.player.hand.length + 2);

      // 2. Stained Glass (bounces Fire/Nature opp creature)
      const sGlass = makeBaseState({
        phase: 'ATTACK',
        player: { battleZone: [makeCreature(findCard('Stained Glass'), 'player', 'p-glass')] },
        opponent: { battleZone: [makeCreature(fireCard, 'opponent', 'o-fire')] }
      });
      const resGlass = declareAttack(sGlass, 'p-glass', { type: 'shield', index: 0 });
      assert.equal(resGlass.players.opponent.battleZone.length, 0);

      // 3. Bolzard Dragon (destroys opp mana)
      const sBolz = makeBaseState({
        phase: 'ATTACK',
        player: { battleZone: [makeCreature(findCard('Bolzard Dragon'), 'player', 'p-bolz')] },
        opponent: { manaZone: [{ instanceId: 'om1', card: manaFiller, isTapped: false }] }
      });
      const resBolz = declareAttack(sBolz, 'p-bolz', { type: 'shield', index: 0 });
      assert.equal(resBolz.players.opponent.manaZone.length, 0);
      assert.equal(resBolz.players.opponent.graveyard.length, 1);

      // 4. Ra Vu + Gamil + Psyshroom (GY triggers)
      const sRaVu = makeBaseState({
        phase: 'ATTACK',
        player: {
          battleZone: [makeCreature(findCard('Ra Vu, Seeker of Lightning'), 'player', 'p-ravu')],
          graveyard: [createCardInstance(lightSpell, 'player')]
        }
      });
      const resRaVu = declareAttack(sRaVu, 'p-ravu', { type: 'shield', index: 0 });
      assert.equal(resRaVu.players.player.graveyard.length, 0);

      const sGamil = makeBaseState({
        phase: 'ATTACK',
        player: {
          battleZone: [makeCreature(findCard('Gamil, Knight of Hatred'), 'player', 'p-gamil')],
          graveyard: [createCardInstance(darkCreature, 'player')]
        }
      });
      const resGamil = declareAttack(sGamil, 'p-gamil', { type: 'shield', index: 0 });
      assert.equal(resGamil.players.player.graveyard.length, 0);

      const sPsy = makeBaseState({
        phase: 'ATTACK',
        player: {
          battleZone: [makeCreature(findCard('Psyshroom'), 'player', 'p-psy')],
          graveyard: [createCardInstance(manaFiller, 'player')]
        }
      });
      const resPsy = declareAttack(sPsy, 'p-psy', { type: 'shield', index: 0 });
      assert.equal(resPsy.players.player.graveyard.length, 0);
      assert.equal(resPsy.players.player.manaZone.length, 1);

      // 5. King Neptas (<= 2000 bounce) & King Ponitas (Water deck search)
      const sNeptas = makeBaseState({
        phase: 'ATTACK',
        player: { battleZone: [makeCreature(findCard('King Neptas'), 'player', 'p-neptas')] },
        opponent: { battleZone: [makeCreature(fireCard, 'opponent', 'o-small')] }
      });
      const resNeptas = declareAttack(sNeptas, 'p-neptas', { type: 'shield', index: 0 });
      assert.equal(resNeptas.players.opponent.battleZone.length, 0);

      const sPonitas = makeBaseState({
        phase: 'ATTACK',
        player: {
          battleZone: [makeCreature(findCard('King Ponitas'), 'player', 'p-ponitas')],
          deck: [createCardInstance(waterCard, 'player'), createCardInstance(fireCard, 'player')]
        }
      });
      const resPonitas = declareAttack(sPonitas, 'p-ponitas', { type: 'shield', index: 0 });
      assert.equal(resPonitas.players.player.hand.some((c) => c.card.name === 'Aqua Hulcus'), true);

      // 6. Sniper Mosquito & Sabermask Scarab (1 mana to hand) + Earthstomp Giant (ALL mana creatures to hand)
      for (const name of ['Sniper Mosquito', 'Sabermask Scarab']) {
        const sMosq = makeBaseState({
          phase: 'ATTACK',
          player: {
            battleZone: [makeCreature(findCard(name), 'player', 'p-mosq')],
            manaZone: [{ instanceId: 'pm1', card: manaFiller, isTapped: false }]
          }
        });
        const resMosq = declareAttack(sMosq, 'p-mosq', { type: 'shield', index: 0 });
        assert.equal(resMosq.players.player.manaZone.length, 0);
      }

      const sEarth = makeBaseState({
        phase: 'ATTACK',
        player: {
          battleZone: [makeCreature(findCard('Earthstomp Giant'), 'player', 'p-earth')],
          manaZone: [
            { instanceId: 'em1', card: manaFiller, isTapped: false },
            { instanceId: 'em2', card: lightSpell, isTapped: false },
            { instanceId: 'em3', card: fireCard, isTapped: false }
          ]
        }
      });
      const resEarth = declareAttack(sEarth, 'p-earth', { type: 'shield', index: 0 });
      assert.equal(resEarth.players.player.manaZone.length, 1, 'Spell remains in mana; both creatures return to hand');

      // 7. Smile Angler (opp mana -> hand) + Curious Eye + Migalo (Turbo Rush) + Lalicious
      const sSmile = makeBaseState({
        phase: 'ATTACK',
        player: { battleZone: [makeCreature(findCard('Smile Angler'), 'player', 'p-smile')] },
        opponent: { manaZone: [{ instanceId: 'om1', card: manaFiller, isTapped: false }] }
      });
      const resSmile = declareAttack(sSmile, 'p-smile', { type: 'shield', index: 0 });
      assert.equal(resSmile.players.opponent.manaZone.length, 0);

      const sCurious = makeBaseState({
        phase: 'ATTACK',
        player: { battleZone: [makeCreature(findCard('Curious Eye'), 'player', 'p-eye')] }
      });
      const resCurious = declareAttack(sCurious, 'p-eye', { type: 'shield', index: 0 });
      assert.ok(resCurious.actionLog.some((l) => /curious eye/i.test(l)));

      const sMigalo = makeBaseState({
        phase: 'ATTACK',
        player: {
          shieldsBrokenThisTurn: ['other-att'],
          battleZone: [makeCreature(findCard('Migalo, Vizier of Spycraft'), 'player', 'p-migalo')]
        }
      });
      const resMigalo = declareAttack(sMigalo, 'p-migalo', { type: 'shield', index: 0 });
      assert.ok(resMigalo.actionLog.some((l) => /migalo/i.test(l)));

      const sLalicious = makeBaseState({
        phase: 'ATTACK',
        player: { battleZone: [makeCreature(findCard('Lalicious'), 'player', 'p-lal')] }
      });
      const resLal = declareAttack(sLalicious, 'p-lal', { type: 'shield', index: 0 });
      assert.ok(resLal.actionLog.some((l) => /lalicious/i.test(l)));
    });
  });
});
