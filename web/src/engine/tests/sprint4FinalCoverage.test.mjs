import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CARD_LIST } from '../../data/cardLoader.ts';
import { createCardInstance, initializeGame } from '../state.ts';
import { step } from '../reducer.ts';
import { canPayManaCost, getEffectiveManaCost } from '../mana.ts';
import {
  canSummonCreature,
  isValidEvolutionBait,
  isValidVortexEvolutionBaits,
  summonCreature
} from '../evolution.ts';
import { triggerBlocked, triggerCIP, triggerEndTurn, triggerUnblocked } from '../triggers.ts';
import { endTurn } from '../turn.ts';
import { destroyCreature } from '../boardRemoval.ts';
import { resolveSilentSkill } from '../advancedMechanics.ts';
import { canActivateTapAbility, resolveTapAbility } from '../tapAbilities.ts';
import { declareAttack, declareBlock } from '../combat.ts';
import {
  canBeBlockedBy,
  canCreatureAttack,
  canCreatureBeAttackedBy,
  getCreatureBreakerCount,
  getCreatureEffectivePower,
  getSurvivorSharedAbilities,
  hasCreatureBlocker,
  hasCreatureSlayer
} from '../continuous.ts';

function cardByName(name) {
  const c = CARD_LIST.find((x) => x.name.trim().toLowerCase() === name.trim().toLowerCase());
  assert.ok(c, `Missing card in dataset: ${name}`);
  return c;
}

function makeBaseState(overrides = {}) {
  const deckA = { id: 's4-a', name: 'A', items: CARD_LIST.slice(0, 10).map((c) => ({ card: c, count: 4 })), updatedAt: 1 };
  const deckB = { id: 's4-b', name: 'B', items: CARD_LIST.slice(10, 20).map((c) => ({ card: c, count: 4 })), updatedAt: 1 };
  const base = initializeGame(deckA, deckB, 'player', { interactiveHuman: Boolean(overrides.interactiveHuman) });
  return {
    ...base,
    turn: 5,
    activePlayer: 'player',
    phase: 'MAIN',
    ...overrides,
    players: {
      player: {
        ...base.players.player,
        hand: [],
        manaZone: [],
        battleZone: [],
        graveyard: [],
        shields: [],
        deck: [],
        ...(overrides.players?.player || {})
      },
      opponent: {
        ...base.players.opponent,
        hand: [],
        manaZone: [],
        battleZone: [],
        graveyard: [],
        shields: [],
        deck: [],
        ...(overrides.players?.opponent || {})
      }
    }
  };
}

function bzCard(name, owner, instanceId, extra = {}) {
  return {
    instanceId,
    card: cardByName(name),
    owner,
    isTapped: false,
    summonedTurn: 1,
    powerModifier: 0,
    ...extra
  };
}

function manaCard(name, owner, instanceId, isTapped = false) {
  return {
    instanceId,
    card: cardByName(name),
    isTapped
  };
}

function shieldItem(name, id) {
  return {
    id,
    shieldId: id,
    card: cardByName(name),
    isBroken: false
  };
}

describe('Sprint 4: Final 49 Missing Cards & Active-Trigger Coverage', () => {
  describe('1. DM-12 Typo CIPs', () => {
    it('Mizoy, the Oracle taps Darkness or Fire creature cleanly (interactive and NI)', () => {
      const mizoy = bzCard('Mizoy, the Oracle', 'player', 'p-mizoy');
      const oppFire = bzCard('Immortal Baron, Vorg', 'opponent', 'o-fire');
      const oppWater = bzCard('Aqua Hulcus', 'opponent', 'o-water');
      const state = makeBaseState({
        players: {
          player: { battleZone: [mizoy] },
          opponent: { battleZone: [oppWater, oppFire] }
        }
      });

      const afterNI = triggerCIP(state, 'player', mizoy);
      assert.equal(afterNI.players.opponent.battleZone.find((c) => c.instanceId === 'o-fire').isTapped, true);
      assert.equal(afterNI.players.opponent.battleZone.find((c) => c.instanceId === 'o-water').isTapped, false);

      const intState = triggerCIP({ ...state, interactiveHuman: true }, 'player', mizoy);
      assert.equal(intState.pendingInteraction?.type, 'ZONE_SELECTION');
      const picked = step(intState, {
        type: 'RESOLVE_ZONE_SELECTION',
        player: 'player',
        selectedIds: ['o-fire']
      });
      assert.equal(picked.players.opponent.battleZone.find((c) => c.instanceId === 'o-fire').isTapped, true);
    });

    it('Necrodragon Zalva makes opponent draw 1 and Gigarayze recovers Water/Fire creature from GY', () => {
      const zalva = bzCard('Necrodragon Zalva', 'player', 'p-zalva');
      const gigarayze = bzCard('Gigarayze', 'player', 'p-giga');
      const gyFire = createCardInstance(cardByName('Bolshack Dragon'), 'player');
      const gyLight = createCardInstance(cardByName('La Ura Giga, Sky Guardian'), 'player');
      const oppTop = createCardInstance(cardByName('Holy Awe'), 'opponent');

      const s1 = makeBaseState({
        players: {
          player: { battleZone: [zalva, gigarayze], graveyard: [gyLight, gyFire] },
          opponent: { deck: [oppTop] }
        }
      });

      const afterZalva = triggerCIP(s1, 'player', zalva);
      assert.equal(afterZalva.players.opponent.hand.length, 1);
      assert.equal(afterZalva.players.opponent.hand[0].card.name, 'Holy Awe');

      const afterGiga = triggerCIP(afterZalva, 'player', gigarayze);
      assert.equal(afterGiga.players.player.hand.some((c) => c.card.name === 'Bolshack Dragon'), true);
      assert.equal(afterGiga.players.player.graveyard.some((c) => c.card.name === 'La Ura Giga, Sky Guardian'), true);
    });
  });

  describe('2. Remaining 6 Silent Skills', () => {
    it('Charge Whipper swaps hand card to shield face-down and shield to hand WITHOUT Shield Trigger', () => {
      const whipper = bzCard('Charge Whipper', 'player', 'p-whip', { isTapped: true });
      const inHand = createCardInstance(cardByName('Bronze-Arm Tribe'), 'player');
      const holyShield = shieldItem('Holy Awe', 's-holy');

      const state = makeBaseState({
        phase: 'START_OF_TURN',
        players: {
          player: {
            battleZone: [whipper],
            hand: [inHand],
            shields: [holyShield]
          }
        }
      });

      const after = resolveSilentSkill(state, 'p-whip');
      assert.equal(after.pendingInteraction, null, 'Shield trigger on swapped shield must NOT fire');
      assert.equal(after.players.player.shields.length, 1);
      assert.equal(after.players.player.shields[0].card.name, 'Bronze-Arm Tribe');
      assert.equal(after.players.player.hand.length, 1);
      assert.equal(after.players.player.hand[0].card.name, 'Holy Awe');
    });

    it('Baraid, the Explorer makes Light creatures unblockable this turn until EOT', () => {
      const baraid = bzCard('Baraid, the Explorer', 'player', 'p-baraid', { isTapped: true });
      const lightAtt = bzCard('La Ura Giga, Sky Guardian', 'player', 'p-light');
      const fireAtt = bzCard('Immortal Baron, Vorg', 'player', 'p-fire');
      const oppBlocker = bzCard('Senatine Jade Tree', 'opponent', 'o-block');

      const state = makeBaseState({
        phase: 'START_OF_TURN',
        players: {
          player: { battleZone: [baraid, lightAtt, fireAtt] },
          opponent: { battleZone: [oppBlocker], shields: [shieldItem('Terror Pit', 'o-s1')] }
        }
      });

      const afterBaraid = resolveSilentSkill(state, 'p-baraid');
      assert.equal(canBeBlockedBy(lightAtt, oppBlocker, { type: 'shield', index: 0 }, afterBaraid), false);
      assert.equal(canBeBlockedBy(fireAtt, oppBlocker, { type: 'shield', index: 0 }, afterBaraid), true);

      const afterEot = triggerEndTurn(afterBaraid, 'player');
      assert.equal(canBeBlockedBy(lightAtt, oppBlocker, { type: 'shield', index: 0 }, afterEot), true);
    });

    it('Squawking Lunatron returns up to 3 mana cards to hand and Gazer Eyes looks & discards from opponent hand', () => {
      const squawk = bzCard('Squawking Lunatron', 'player', 'p-squawk', { isTapped: true });
      const gazer = bzCard('Gazer Eyes, Shadow of Secrets', 'player', 'p-gazer', { isTapped: true });
      const oppBig = createCardInstance(cardByName('Bolshack Dragon'), 'opponent');
      const oppSmall = createCardInstance(cardByName('Aqua Hulcus'), 'opponent');

      const state = makeBaseState({
        phase: 'START_OF_TURN',
        players: {
          player: {
            battleZone: [squawk, gazer],
            manaZone: [
              manaCard('Aqua Hulcus', 'player', 'm1'),
              manaCard('Terror Pit', 'player', 'm2'),
              manaCard('Holy Awe', 'player', 'm3'),
              manaCard('Faerie Life', 'player', 'm4')
            ]
          },
          opponent: {
            hand: [oppSmall, oppBig]
          }
        }
      });

      const s1 = resolveSilentSkill(state, 'p-squawk');
      assert.equal(s1.players.player.hand.length, 3);
      assert.equal(s1.players.player.manaZone.length, 1);

      const s2 = resolveSilentSkill(s1, 'p-gazer');
      assert.equal(s2.players.opponent.hand.length, 1);
      assert.equal(s2.players.opponent.graveyard[0].card.name, 'Bolshack Dragon');
    });

    it('Rollicking Totem & Royal Durian put non-evo Dragon (excluding Dragonoids) from mana to BZ and fire CIP', () => {
      const totem = bzCard('Rollicking Totem', 'player', 'p-rollick', { isTapped: true });
      const durian = bzCard('Royal Durian', 'player', 'p-durian', { isTapped: true });

      const state = makeBaseState({
        phase: 'START_OF_TURN',
        players: {
          player: {
            battleZone: [totem, durian],
            manaZone: [
              manaCard('Onslaughter Triceps', 'player', 'm-dragonoid'),
              manaCard('Bolshack Dragon', 'player', 'm-bolshack'),
              manaCard('Terradragon Regarion', 'player', 'm-terrad')
            ]
          }
        }
      });

      const s1 = resolveSilentSkill(state, 'p-rollick');
      assert.equal(s1.players.player.battleZone.some((c) => c.card.name === 'Bolshack Dragon'), true);

      const s2 = resolveSilentSkill(s1, 'p-durian');
      assert.equal(s2.players.player.battleZone.some((c) => c.card.name === 'Terradragon Regarion'), true);
      // Dragonoid must remain untouched in mana zone
      assert.equal(s2.players.player.manaZone.some((m) => m.instanceId === 'm-dragonoid'), true);
    });
  });

  describe('3. On-Destroy, Leave & Replacement Effects', () => {
    it('Schuka, Duke of Amnesia wipes both players hands into graveyard cleanly', () => {
      const schuka = bzCard('Schuka, Duke of Amnesia', 'player', 'p-schuka');
      const state = makeBaseState({
        players: {
          player: {
            battleZone: [schuka],
            hand: [createCardInstance(cardByName('Holy Awe'), 'player')]
          },
          opponent: {
            hand: [
              createCardInstance(cardByName('Terror Pit'), 'opponent'),
              createCardInstance(cardByName('Aqua Hulcus'), 'opponent')
            ]
          }
        }
      });

      const after = destroyCreature(state, 'p-schuka');
      assert.equal(after.players.player.hand.length, 0);
      assert.equal(after.players.opponent.hand.length, 0);
      assert.equal(after.players.player.graveyard.length, 2); // Schuka + Holy Awe
      assert.equal(after.players.opponent.graveyard.length, 2);
    });

    it('Kyrstron, Lair Delver cheats a Dragon from hand into BZ (and triggers its CIP)', () => {
      const kyrstron = bzCard('Kyrstron, Lair Delver', 'player', 'p-kyr');
      const bazagazeal = createCardInstance(cardByName('Bazagazeal Dragon'), 'player');
      const dragonoid = createCardInstance(cardByName('Mini Titan Gett'), 'player');

      const state = makeBaseState({
        players: {
          player: {
            battleZone: [kyrstron],
            hand: [dragonoid, bazagazeal]
          }
        }
      });

      const after = destroyCreature(state, 'p-kyr');
      assert.equal(after.players.player.battleZone.some((c) => c.card.name === 'Bazagazeal Dragon'), true);
      assert.equal(after.players.player.hand.some((c) => c.card.name === 'Mini Titan Gett'), true);
    });

    it('Aless adds itself to shields instead of graveyard; Kalute bounces ONLY when another Kalute is in BZ', () => {
      const aless = bzCard('Aless, the Oracle', 'player', 'p-aless');
      const k1 = bzCard('Kalute, Vizier of Eternity', 'player', 'p-k1');
      const kOpp = bzCard('Kalute, Vizier of Eternity', 'opponent', 'o-k2');

      const stateBoth = makeBaseState({
        players: {
          player: { battleZone: [aless, k1] },
          opponent: { battleZone: [kOpp] }
        }
      });

      const afterAless = destroyCreature(stateBoth, 'p-aless');
      assert.equal(afterAless.players.player.shields.length, 1);
      assert.equal(afterAless.players.player.shields[0].card.name, 'Aless, the Oracle');
      assert.equal(afterAless.players.player.graveyard.length, 0);

      // Kalute with opponent Kalute on board -> returns to hand!
      const afterK1 = destroyCreature(afterAless, 'p-k1');
      assert.equal(afterK1.players.player.hand.some((h) => h.instanceId === 'p-k1'), true);
      assert.equal(afterK1.players.player.graveyard.length, 0);

      // Now Kalute alone (o-k2 has no other Kalute on BZ) -> destroyed to graveyard normally!
      const afterKOpp = destroyCreature(afterK1, 'o-k2');
      assert.equal(afterKOpp.players.opponent.graveyard.some((g) => g.instanceId === 'o-k2'), true);
      assert.equal(afterKOpp.players.opponent.hand.length, 0);
    });

    it('Obsidian Scarab, Ambush Scorpion, Dracodance Totem, and Ryudmila resolve hidden destroy/replacement effects cleanly', () => {
      const scarab = bzCard('Obsidian Scarab', 'player', 'p-scarab');
      const scorpion = bzCard('Ambush Scorpion', 'player', 'p-scorp');
      const dracoTotem = bzCard('Dracodance Totem', 'player', 'p-draco');
      const ryudmila = bzCard('Ryudmila, Channeler of Suns', 'player', 'p-ryud');

      // Ryudmila gets +2000 for each other untapped friendly creature (3 untapped = +6000 -> 10000?)
      const ryudState = makeBaseState({
        players: {
          player: {
            battleZone: [scarab, scorpion, dracoTotem, ryudmila],
            manaZone: [
              manaCard('Obsidian Scarab', 'player', 'm-scarab'),
              manaCard('Ambush Scorpion', 'player', 'm-scorp'),
              manaCard('Bolshack Dragon', 'player', 'm-dragon')
            ]
          }
        }
      });
      const ryudPower = getCreatureEffectivePower(
        ryudmila,
        false,
        ryudState.players.player,
        ryudState.players.opponent,
        false,
        ryudState
      );
      assert.equal(ryudPower, (ryudmila.card.power ?? 0) + 6000);

      const afterScarab = destroyCreature(ryudState, 'p-scarab');
      assert.equal(afterScarab.players.player.battleZone.some((c) => c.instanceId === 'm-scarab'), true);

      const afterScorp = destroyCreature(afterScarab, 'p-scorp');
      assert.equal(afterScorp.players.player.battleZone.some((c) => c.instanceId === 'm-scorp'), true);

      // Dracodance Totem -> goes to mana & returns Bolshack Dragon to hand
      const afterDraco = destroyCreature(afterScorp, 'p-draco');
      assert.equal(afterDraco.players.player.manaZone.some((m) => m.instanceId === 'p-draco'), true);
      assert.equal(afterDraco.players.player.hand.some((h) => h.instanceId === 'm-dragon'), true);

      // Ryudmila -> shuffled into deck instead of graveyard
      const afterRyud = destroyCreature(afterDraco, 'p-ryud');
      assert.equal(afterRyud.players.player.deck.some((d) => d.instanceId === 'p-ryud'), true);
      assert.equal(afterRyud.players.player.graveyard.some((g) => g.instanceId === 'p-ryud'), false);
    });
  });

  describe('4. On-Blocked, On-Unblocked, End-of-Turn, Wave Striker, and Survivor', () => {
    it('Kelp Candle & Zeppelin Crawler look at top 4 on block, put 1 to hand, and put rest on bottom', () => {
      const att = bzCard('Bolshack Dragon', 'opponent', 'o-att');
      const kelp = bzCard('Kelp Candle', 'player', 'p-kelp');
      const zep = bzCard('Zeppelin Crawler', 'player', 'p-zep');
      const d1 = createCardInstance(cardByName('Holy Awe'), 'player'); // cost 6 (highest)
      const d2 = createCardInstance(cardByName('La Ura Giga, Sky Guardian'), 'player');
      const d3 = createCardInstance(cardByName('Bloody Squito'), 'player');
      const d4 = createCardInstance(cardByName('Immortal Baron, Vorg'), 'player');
      const d5 = createCardInstance(cardByName('Terror Pit'), 'player');

      const state = makeBaseState({
        activePlayer: 'opponent',
        phase: 'ATTACK',
        players: {
          player: { battleZone: [kelp, zep], deck: [d1, d2, d3, d4, d5] },
          opponent: { battleZone: [att] }
        }
      });

      const afterKelp = triggerBlocked(state, 'opponent', att, kelp);
      assert.equal(afterKelp.players.player.hand.length, 1);
      assert.equal(afterKelp.players.player.hand[0].card.name, 'Holy Awe');
      // d5 stays on top; d2, d3, d4 went to bottom!
      assert.equal(afterKelp.players.player.deck[0].instanceId, d5.instanceId);
      assert.deepEqual(
        afterKelp.players.player.deck.slice(1).map((c) => c.instanceId),
        [d2.instanceId, d3.instanceId, d4.instanceId]
      );

      const afterZep = triggerBlocked(afterKelp, 'opponent', att, zep);
      assert.equal(afterZep.players.player.hand.length, 2);
      assert.equal(afterZep.players.player.deck.length, 3);
    });

    it('Ikaz, the Spydroid untaps chosen friendly creature after the battle (NI & Interactive)', () => {
      const oppWeak = bzCard('Immortal Baron, Vorg', 'opponent', 'o-vorg');
      const ikaz = bzCard('Ikaz, the Spydroid', 'player', 'p-ikaz');
      const allyTapped = bzCard('La Ura Giga, Sky Guardian', 'player', 'p-ally', { isTapped: true });

      const state = makeBaseState({
        activePlayer: 'opponent',
        phase: 'ATTACK',
        players: {
          opponent: { battleZone: [oppWeak] },
          player: { battleZone: [ikaz, allyTapped], shields: [shieldItem('Holy Awe', 'p-s1')] }
        }
      });

      const afterAtk = declareAttack(state, 'o-vorg', { type: 'shield', index: 0 });
      const afterBlk = declareBlock(afterAtk, 'p-ikaz');
      assert.equal(afterBlk.players.player.battleZone.find((c) => c.instanceId === 'p-ally').isTapped, false);

      // Interactive human pauses before battle and untaps Ikaz if chosen
      const intAtk = declareAttack({ ...state, interactiveHuman: true }, 'o-vorg', { type: 'shield', index: 0 });
      const intBlk = step(intAtk, { type: 'DECLARE_BLOCK', player: 'opponent', blockerId: 'p-ikaz' });
      assert.equal(intBlk.pendingInteraction?.actionKind, 'IKAZ_MARK_UNTAP_AFTER_BATTLE');
      const intDone = step(intBlk, {
        type: 'RESOLVE_ZONE_SELECTION',
        player: 'player',
        selectedIds: ['p-ikaz']
      });
      assert.equal(intDone.pendingInteraction, null);
      assert.equal(intDone.players.player.battleZone.find((c) => c.instanceId === 'p-ikaz').isTapped, false);
    });

    it('Balesk Baj takes extra turn unblocked & bounces at EOT without losing; Aqua Master flips shield face up', () => {
      const balesk = bzCard('Balesk Baj, the Timeburner', 'player', 'p-balesk');
      const aquaMaster = bzCard('Aqua Master', 'player', 'p-am');

      const state = makeBaseState({
        players: {
          player: {
            battleZone: [balesk, aquaMaster],
            deck: [
              createCardInstance(cardByName('Holy Awe'), 'player'),
              createCardInstance(cardByName('Terror Pit'), 'player')
            ]
          },
          opponent: {
            shields: [shieldItem('Terror Pit', 'o-s1'), shieldItem('Holy Awe', 'o-s2')]
          }
        }
      });

      const afterAM = triggerUnblocked(state, 'player', aquaMaster, { type: 'shield', index: 0 });
      assert.equal(afterAM.players.opponent.shields[0].isFaceUp, true);

      const afterBajUnblocked = triggerUnblocked(afterAM, 'player', balesk, { type: 'shield', index: 0 });
      assert.equal(afterBajUnblocked.extraTurnPlayer, 'player');

      const afterEndTurn = endTurn(afterBajUnblocked);
      assert.equal(afterEndTurn.activePlayer, 'player', 'Extra turn started for player');
      assert.equal(afterEndTurn.turn, 6);
      assert.equal(afterEndTurn.winner, null);
      assert.equal(afterEndTurn.players.player.hand.some((c) => c.card.name === 'Balesk Baj, the Timeburner'), true);

      // Ending extra turn hands turn to opponent with NO Bombazar loss
      const afterExtraEnd = endTurn({
        ...afterEndTurn,
        players: {
          ...afterEndTurn.players,
          opponent: {
            ...afterEndTurn.players.opponent,
            deck: [createCardInstance(cardByName('Holy Awe'), 'opponent')]
          }
        }
      });
      assert.equal(afterExtraEnd.winner, null);
      assert.equal(afterExtraEnd.activePlayer, 'opponent');
    });

    it('Lamiel draws during opponent turn when Wave Striker active, NOT during own turn', () => {
      const lamiel = bzCard('Lamiel, Destiny Enforcer', 'player', 'p-lamiel');
      const ws2 = bzCard('Asra, Vizier of Safety', 'player', 'p-ws2');
      const ws3 = bzCard('Merlee, the Oracle', 'player', 'p-ws3');
      const fodder = bzCard('La Ura Giga, Sky Guardian', 'player', 'p-fodder');

      const base = makeBaseState({
        activePlayer: 'opponent',
        players: {
          player: {
            battleZone: [lamiel, ws2, ws3, fodder],
            deck: [createCardInstance(cardByName('Holy Awe'), 'player')]
          }
        }
      });

      const oppTurnDest = destroyCreature(base, 'p-fodder');
      assert.equal(oppTurnDest.players.player.hand.length, 1);

      const ownTurnDest = destroyCreature({ ...base, activePlayer: 'player' }, 'p-fodder');
      assert.equal(ownTurnDest.players.player.hand.length, 0);
    });

    it('Promephius Q inherits shared Survivor skills cleanly from ally Survivors', () => {
      const prom = bzCard('Promephius Q', 'player', 'p-prom');
      const gallia = bzCard('Gallia Zohl, Iron Guardian Q', 'player', 'p-gallia');
      const gigaling = bzCard('Gigaling Q', 'player', 'p-gigaq');
      const smash = bzCard('Smash Horn Q', 'player', 'p-smash');

      const bz = [prom, gallia, gigaling, smash];
      const abilities = getSurvivorSharedAbilities(bz);
      assert.equal(abilities.hasBlocker, true);
      assert.equal(abilities.hasSlayer, true);
      assert.equal(abilities.powerBonus, 1000);
      assert.equal(hasCreatureBlocker(prom, bz, [], makeBaseState().players.player), true);
      assert.equal(hasCreatureSlayer(prom, bz, [], makeBaseState().players.player), true);
      assert.equal(
        getCreatureEffectivePower(prom, false, { battleZone: bz }, { battleZone: [] }),
        (prom.card.power ?? 0) + 1000
      );
    });
  });

  describe('5. Cost Modifiers, Universal Evo Bait, Combat & Zone Passives (All 29 Statics)', () => {
    it('applies Volcano Smog, Missile Boy, Milieus, Dew Mushroom, and Horned Mutant cost increases cleanly', () => {
      const holyAwe = cardByName('Holy Awe'); // 6 Light
      const terrorPit = cardByName('Terror Pit'); // 6 Darkness
      const faerieLife = cardByName('Faerie Life'); // 2 Nature
      const tornadoFlame = cardByName('Tornado Flame'); // 5 Fire

      const oppSmogAndBoy = [
        bzCard('Volcano Smog, Deceptive Shade', 'opponent', 'o-smog'),
        bzCard('Missile Boy', 'opponent', 'o-boy'),
        bzCard('Dew Mushroom', 'opponent', 'o-dew'),
        bzCard('Milieus, the Daystretcher', 'opponent', 'o-mil'),
        bzCard('Horned Mutant', 'opponent', 'o-horn')
      ];

      assert.equal(getEffectiveManaCost(holyAwe, [], oppSmogAndBoy), 9); // 6 + 2 + 1
      assert.equal(getEffectiveManaCost(terrorPit, [], oppSmogAndBoy), 9); // 6 + 2 + 1
      assert.equal(getEffectiveManaCost(faerieLife, [], oppSmogAndBoy), 3); // 2 + 1
      assert.equal(getEffectiveManaCost(tornadoFlame, [], oppSmogAndBoy), 5); // unaffected

      // Dual-civ Light/Darkness creature gets BOTH Light & Darkness increases
      const eliza = cardByName('Estol, Vizier of Aqua'); // Water? Let's test Light/Darkness dual card if present or Petrova
      assert.equal(getEffectiveManaCost(cardByName('Petrova, Channeler of Suns'), [], oppSmogAndBoy), 8);
    });

    it('Innocent Hunter, Blade of All serves as valid bait for ANY Evolution or Vortex Evolution', () => {
      const hunter = bzCard('Innocent Hunter, Blade of All', 'player', 'p-hunter');
      const fireBird = bzCard('Kip Chippotto', 'player', 'p-bird');

      assert.equal(isValidEvolutionBait(cardByName('Ballom, Master of Death'), hunter), true);
      assert.equal(isValidEvolutionBait(cardByName('Crystal Lancer'), hunter), true);
      assert.equal(isValidEvolutionBait(cardByName('Alcadeias, Lord of Spirits'), hunter), true);
      assert.equal(
        isValidVortexEvolutionBaits(cardByName('Death Phoenix, Avatar of Doom'), hunter, fireBird),
        true
      );

      const state = makeBaseState({
        players: {
          player: {
            hand: [createCardInstance(cardByName('Crystal Lancer'), 'player')],
            battleZone: [hunter],
            manaZone: Array.from({ length: 6 }, (_, i) => manaCard('Aqua Hulcus', 'player', `m-${i}`))
          }
        }
      });
      const evolved = summonCreature(state, 'player', state.players.player.hand[0].instanceId, 'p-hunter');
      assert.equal(evolved.players.player.battleZone[0].card.name, 'Crystal Lancer');
      assert.equal(evolved.players.player.battleZone[0].evolvedOn[0].instanceId, 'p-hunter');
    });

    it('Moontear & Yuluk require casting a spell earlier in the turn', () => {
      const moontearInst = createCardInstance(cardByName('Moontear, Spectral Knight'), 'player');
      const yulukInst = createCardInstance(cardByName('Yuluk, the Oracle'), 'player');
      const holyAwe = createCardInstance(cardByName('Holy Awe'), 'player');
      const state = makeBaseState({
        players: {
          player: {
            hand: [moontearInst, yulukInst, holyAwe],
            manaZone: Array.from({ length: 10 }, (_, i) => manaCard('La Ura Giga, Sky Guardian', 'player', `ml-${i}`))
          }
        }
      });

      assert.equal(canSummonCreature(state, 'player', moontearInst.card).allowed, false);
      assert.equal(canSummonCreature(state, 'player', yulukInst.card).allowed, false);
      assert.throws(() => summonCreature(state, 'player', moontearInst.instanceId), /cast a spell this turn/i);

      const afterSpell = step(state, { type: 'CAST_SPELL', player: 'player', cardInstanceId: holyAwe.instanceId });
      assert.equal(afterSpell.players.player.spellsCastThisTurn, 1);
      assert.equal(canSummonCreature(afterSpell, 'player', moontearInst.card).allowed, true);
      const afterMoon = summonCreature(afterSpell, 'player', moontearInst.instanceId);
      const afterYuluk = summonCreature(afterMoon, 'player', yulukInst.instanceId);
      assert.equal(afterYuluk.players.player.battleZone.length, 2);
    });

    it('Forbidding Totem lures attacks to Mystery Totems when able; Kooc Pollon, Steel-Turret, Typhoon Crawler, Gigio, Curatops, Muramasa enforce combat rules', () => {
      const forbidding = bzCard('Forbidding Totem', 'opponent', 'o-totem', { isTapped: true });
      const oppOther = bzCard('Immortal Baron, Vorg', 'opponent', 'o-other', { isTapped: true });
      const kooc = bzCard('Kooc Pollon', 'opponent', 'o-kooc', { isTapped: true });
      const steel = bzCard('Steel-Turret Cluster', 'opponent', 'o-steel', { isTapped: true });
      const typhoon = bzCard('Typhoon Crawler', 'opponent', 'o-typhoon', { isTapped: true });

      const gigio = bzCard('Nomad Hero Gigio', 'player', 'p-gigio');
      const curatops = bzCard('Cavalry General Curatops', 'player', 'p-cura');
      const muramasa = bzCard("Muramasa's Knife", 'player', 'p-mura');
      const darkAtt = bzCard('Bloody Squito', 'player', 'p-dark');
      const natureAtt = bzCard('Bronze-Arm Tribe', 'player', 'p-nat');

      const sLure = makeBaseState({
        phase: 'ATTACK',
        players: {
          player: { battleZone: [gigio, curatops, muramasa] },
          opponent: {
            battleZone: [forbidding, oppOther],
            shields: [shieldItem('Holy Awe', 'o-s1')]
          }
        }
      });
      // Must attack Forbidding Totem instead of shields or oppOther
      assert.equal(canCreatureAttack(sLure, gigio, { type: 'shield', index: 0 }, 'player').valid, false);
      assert.equal(canCreatureAttack(sLure, gigio, { type: 'creature', instanceId: 'o-other' }, 'player').valid, false);
      assert.equal(canCreatureAttack(sLure, gigio, { type: 'creature', instanceId: 'o-totem' }, 'player').valid, true);

      // Untapped creature attacks work for Gigio / Curatops / Muramasa
      const oppUntapped = bzCard('Aqua Hulcus', 'opponent', 'o-untapped');
      const sUntap = makeBaseState({
        phase: 'ATTACK',
        players: {
          player: { battleZone: [gigio, curatops, muramasa] },
          opponent: { battleZone: [oppUntapped] }
        }
      });
      assert.equal(canCreatureAttack(sUntap, gigio, { type: 'creature', instanceId: 'o-untapped' }, 'player').valid, true);
      assert.equal(canCreatureAttack(sUntap, curatops, { type: 'creature', instanceId: 'o-untapped' }, 'player').valid, true);
      assert.equal(canCreatureAttack(sUntap, muramasa, { type: 'creature', instanceId: 'o-untapped' }, 'player').valid, true);

      // Kooc Pollon can't be attacked; Steel-Turret / Typhoon can't be attacked by Fire/Nature
      assert.equal(canCreatureBeAttackedBy(kooc, darkAtt).allowed, false);
      assert.equal(canCreatureBeAttackedBy(steel, gigio).allowed, false);
      assert.equal(canCreatureBeAttackedBy(steel, natureAtt).allowed, false);
      assert.equal(canCreatureBeAttackedBy(steel, darkAtt).allowed, true);
      assert.equal(canCreatureBeAttackedBy(typhoon, gigio).allowed, false);
      assert.equal(canCreatureBeAttackedBy(typhoon, natureAtt).allowed, false);
      assert.equal(canCreatureBeAttackedBy(typhoon, darkAtt).allowed, true);
    });

    it('Urherion, Horvath, Ur Pale, Mudman, Baby Zoppe, Raging Dash-Horn, Keeper of the Sunlit Abyss, Razorpine Tree, Spinning Terror power/breaker passives', () => {
      const urherion = bzCard('Armored Walker Urherion', 'player', 'p-urh'); // Armorloid (3000 +2000 PA w/ Human)
      const horvath = bzCard('Fatal Attacker Horvath', 'player', 'p-hor'); // Human (2000 +2000 PA w/ Armorloid)
      const urPale = bzCard('Ur Pale, Seeker of Sunlight', 'player', 'p-urpale'); // 2500 Light +2000
      const mudman = bzCard('Mudman', 'player', 'p-mud'); // 2000 Dark +2000
      const zoppe = bzCard('Baby Zoppe', 'player', 'p-zoppe'); // 2000 Fire +2000
      const dash = bzCard('Raging Dash-Horn', 'player', 'p-dash'); // 4000 Nature +3000 & DB
      const razor = bzCard('Razorpine Tree', 'player', 'p-razor'); // 1000 Light +2000/shield
      const spinning = bzCard('Spinning Terror, the Wretched', 'player', 'p-spin'); // 1000 +2000/opp tapped
      const keeper = bzCard('Keeper of the Sunlit Abyss', 'opponent', 'o-keep'); // Light & Darkness +1000
      const oppTap1 = bzCard('Aqua Hulcus', 'opponent', 'o-t1', { isTapped: true });
      const oppTap2 = bzCard('Immortal Baron, Vorg', 'opponent', 'o-t2', { isTapped: true });

      const monoNatureState = makeBaseState({
        players: {
          player: {
            battleZone: [urherion, horvath, urPale, mudman, zoppe, dash, razor, spinning],
            manaZone: [manaCard('Bronze-Arm Tribe', 'player', 'mn1')],
            shields: [shieldItem('Holy Awe', 's1'), shieldItem('Terror Pit', 's2')]
          },
          opponent: {
            battleZone: [keeper, oppTap1, oppTap2]
          }
        }
      });

      const pS = monoNatureState.players.player;
      const oS = monoNatureState.players.opponent;

      // Urherion (base 3000 + 2000 PA when attacking because Horvath is Human)
      assert.equal(getCreatureEffectivePower(urherion, false, pS, oS, false, monoNatureState), 3000);
      assert.equal(getCreatureEffectivePower(urherion, true, pS, oS, false, monoNatureState), 5000);

      // Horvath (base 2000 + 2000 PA because Urherion is Armorloid)
      assert.equal(getCreatureEffectivePower(horvath, true, pS, oS, false, monoNatureState), 4000);

      // Keeper gives +1000 to Light & Darkness creatures (Ur Pale, Mudman, Razorpine, Spinning Terror)
      // Ur Pale: Light condition NOT met (Nature mana), +1000 Keeper = 3500
      assert.equal(getCreatureEffectivePower(urPale, false, pS, oS, false, monoNatureState), 3500);
      // Razorpine: 1000 + 2*2000 shields + 1000 Keeper = 6000
      assert.equal(getCreatureEffectivePower(razor, false, pS, oS, false, monoNatureState), 6000);
      // Spinning Terror: 1000 + 2*2000 tapped + 1000 Keeper = 6000
      assert.equal(getCreatureEffectivePower(spinning, false, pS, oS, false, monoNatureState), 6000);
      // Raging Dash-Horn: all mana Nature -> 4000 + 3000 = 7000 AND Double Breaker!
      assert.equal(getCreatureEffectivePower(dash, false, pS, oS, false, monoNatureState), 7000);
      assert.equal(getCreatureBreakerCount(dash, pS.battleZone, oS.battleZone, monoNatureState, 'player'), 2);

      // Pure-civ mana states for Ur Pale, Mudman, Zoppe, and mixed-mana Raging Dash-Horn check (must drop to 1 breaker!)
      const lightMana = makeBaseState({
        players: {
          player: { battleZone: [urPale], manaZone: [manaCard('La Ura Giga, Sky Guardian', 'player', 'ml1')] }
        }
      });
      assert.equal(getCreatureEffectivePower(urPale, false, lightMana.players.player, lightMana.players.opponent, false, lightMana), 4500);
      assert.equal(getCreatureBreakerCount(dash, pS.battleZone, [], lightMana, 'player'), 1);

      const darkMana = makeBaseState({
        players: { player: { battleZone: [mudman], manaZone: [manaCard('Terror Pit', 'player', 'md1')] } }
      });
      assert.equal(getCreatureEffectivePower(mudman, false, darkMana.players.player, darkMana.players.opponent, false, darkMana), 4000);

      const fireMana = makeBaseState({
        players: { player: { battleZone: [zoppe], manaZone: [manaCard('Immortal Baron, Vorg', 'player', 'mf1')] } }
      });
      assert.equal(getCreatureEffectivePower(zoppe, false, fireMana.players.player, fireMana.players.opponent, false, fireMana), 4000);
    });

    it('Lockdown Lizard blocks tap abilities; Tyrant Worm / Malian / Stapler / Copper Locust watch summons; Gigavrand discards at EOT', () => {
      const neon = bzCard('Neon Cluster', 'player', 'p-neon');
      const lizard = bzCard('Lockdown Lizard', 'opponent', 'o-liz');
      const tyrant = bzCard('Tyrant Worm', 'player', 'p-tyrant');
      const malian = bzCard('Whirling Warrior Malian', 'opponent', 'o-malian');
      const stapler = bzCard("Gandaval's Stapler", 'opponent', 'o-stap');
      const locust = bzCard('Copper Locust', 'opponent', 'o-locust');
      const gigavrand = bzCard('Gigavrand', 'player', 'p-giga');
      const bait = bzCard('Aqua Hulcus', 'player', 'p-bait');

      const sLock = makeBaseState({
        phase: 'ATTACK',
        players: {
          player: { battleZone: [neon], deck: [createCardInstance(cardByName('Holy Awe'), 'player')] },
          opponent: { battleZone: [lizard] }
        }
      });
      assert.equal(canActivateTapAbility(sLock, neon, 'player').valid, false);
      assert.throws(() => resolveTapAbility(sLock, 'p-neon'), /Lockdown Lizard/i);

      // Watchers + Gigavrand EOT discard
      const dummyEntry = bzCard('Immortal Baron, Vorg', 'player', 'p-entry');
      const evoHand = createCardInstance(cardByName('Crystal Lancer'), 'player');
      const sWatch = makeBaseState({
        activePlayer: 'player',
        players: {
          player: {
            battleZone: [tyrant, bait, gigavrand],
            hand: [evoHand],
            manaZone: Array.from({ length: 6 }, (_, i) => manaCard('Aqua Hulcus', 'player', `mw-${i}`))
          },
          opponent: {
            battleZone: [malian, stapler, locust],
            hand: [createCardInstance(cardByName('Terror Pit'), 'opponent')],
            deck: [
              createCardInstance(cardByName('Holy Awe'), 'opponent'),
              createCardInstance(cardByName('Faerie Life'), 'opponent')
            ],
            cardsDrawnThisTurn: 2
          }
        }
      });

      const afterEntry = triggerCIP(sWatch, 'player', dummyEntry);
      // Tyrant Worm destroyed, Malian & Stapler tapped by summon
      assert.equal(afterEntry.players.player.graveyard.some((g) => g.instanceId === 'p-tyrant'), true);
      assert.equal(afterEntry.players.opponent.battleZone.find((c) => c.instanceId === 'o-malian').isTapped, true);
      assert.equal(afterEntry.players.opponent.battleZone.find((c) => c.instanceId === 'o-stap').isTapped, true);
      // Copper Locust not yet destroyed because dummyEntry is not Evolution
      assert.equal(afterEntry.players.opponent.battleZone.some((c) => c.instanceId === 'o-locust'), true);

      // Evolve Crystal Lancer onto p-bait -> destroys opponent Copper Locust!
      const afterEvo = summonCreature(afterEntry, 'player', evoHand.instanceId, 'p-bait');
      assert.equal(afterEvo.players.opponent.graveyard.some((g) => g.instanceId === 'o-locust'), true);

      // Gigavrand checks cardsDrawnThisTurn >= 2 at end of turn -> opponent discards entire hand!
      const afterEot = triggerEndTurn(afterEvo, 'player');
      assert.equal(afterEot.players.opponent.hand.length, 0);
      assert.equal(afterEot.players.opponent.graveyard.some((g) => g.card.name === 'Terror Pit'), true);
    });
  });
});
