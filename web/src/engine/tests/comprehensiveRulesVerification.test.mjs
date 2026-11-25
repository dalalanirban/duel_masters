import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CARD_LIST } from '../../data/cardLoader.ts';
import { initializeGame } from '../state.ts';
import { startTurn, endTurn } from '../turn.ts';
import { canPayManaCost, getEffectiveManaCost, payManaCost, toggleManaTap } from '../mana.ts';
import {
  isValidEvolutionBait,
  isValidVortexEvolutionBaits,
  findAllValidVortexBaitPairs,
  summonCreature
} from '../evolution.ts';
import {
  hasCreatureBlocker,
  hasCreatureSpeedAttacker,
  getCreatureBreakerCount,
  getCreatureEffectivePower,
  canBeBlockedBy,
  canCreatureAttack,
  isWaveStrikerConditionMet,
  isTurboRushActive
} from '../continuous.ts';
import {
  destroyCreature,
  destroyCreaturesBatch,
  bounceCreature,
  sendCreatureToManaZone,
  breakOpponentShields
} from '../zones.ts';
import { canActivateTapAbility } from '../tapAbilities.ts';
import { getSpellTargetRequirement } from '../targeting.ts';
import { castSpell } from '../spells.ts';
import {
  canDeclareAttack,
  declareAttack,
  declareBlock
} from '../combat.ts';
import { step } from '../reducer.ts';
import { getAiAction } from '../ai.ts';

function findCard(name) {
  const c = CARD_LIST.find((x) => x.name.toLowerCase() === name.toLowerCase());
  if (!c) throw new Error(`Card not found in DB: ${name}`);
  return c;
}

function buildCustomDeck(id, name, entries) {
  const items = entries.map(([cardName, count]) => ({
    card: findCard(cardName),
    count
  }));
  const total = items.reduce((sum, e) => sum + e.count, 0);
  assert.equal(total, 40, `Deck ${name} must have 40 cards, got ${total}`);
  return { id, name, items };
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

function makeMana(card, instanceId, isTapped = false) {
  return { instanceId, card, isTapped };
}

function makeCard(card, owner, instanceId) {
  return { instanceId, card, owner };
}

function makeShield(card, owner, idx) {
  return {
    id: `${owner}-shield-${idx}-${card.id}`,
    card,
    isBroken: false
  };
}

function createBaseState(overrides = {}) {
  const vorg = findCard('Immortal Baron, Vorg');
  const dummyDeck = Array.from({ length: 12 }, (_, i) => makeCard(vorg, 'player', `pd-${i}`));
  const dummyOppDeck = Array.from({ length: 12 }, (_, i) => makeCard(vorg, 'opponent', `od-${i}`));

  const base = {
    turn: 3,
    startingPlayer: 'player',
    activePlayer: 'player',
    phase: 'MAIN',
    combatState: null,
    pendingInteraction: null,
    winner: null,
    actionLog: [],
    players: {
      player: {
        deck: dummyDeck,
        hand: [],
        shields: Array.from({ length: 5 }, (_, i) => makeShield(vorg, 'player', i)),
        manaZone: [],
        battleZone: [],
        graveyard: [],
        manaChargedThisTurn: false,
        shieldsBrokenThisTurn: []
      },
      opponent: {
        deck: dummyOppDeck,
        hand: [],
        shields: Array.from({ length: 5 }, (_, i) => makeShield(vorg, 'opponent', i)),
        manaZone: [],
        battleZone: [],
        graveyard: [],
        manaChargedThisTurn: false,
        shieldsBrokenThisTurn: []
      }
    }
  };

  return {
    ...base,
    ...overrides,
    players: {
      player: { ...base.players.player, ...(overrides.players?.player || {}) },
      opponent: { ...base.players.opponent, ...(overrides.players?.opponent || {}) }
    }
  };
}

function validateInvariants(state, matchLabel) {
  for (const pid of ['player', 'opponent']) {
    const p = state.players[pid];
    assert.ok(Array.isArray(p.deck), `${matchLabel}: ${pid}.deck must be array`);
    assert.ok(Array.isArray(p.hand), `${matchLabel}: ${pid}.hand must be array`);
    assert.ok(Array.isArray(p.shields), `${matchLabel}: ${pid}.shields must be array`);
    assert.ok(Array.isArray(p.manaZone), `${matchLabel}: ${pid}.manaZone must be array`);
    assert.ok(Array.isArray(p.battleZone), `${matchLabel}: ${pid}.battleZone must be array`);
    assert.ok(Array.isArray(p.graveyard), `${matchLabel}: ${pid}.graveyard must be array`);

    for (const c of p.battleZone) {
      assert.ok(c.instanceId && c.card, `${matchLabel}: malformed creature in ${pid} BZ`);
      assert.ok(
        Number.isFinite(getCreatureEffectivePower(c, false, p, state.players[pid === 'player' ? 'opponent' : 'player'], false, state)),
        `${matchLabel}: non-finite power for ${c.card.name}`
      );
    }
  }
}

function runAiMatch(deckA, deckB, startingPlayer = 'player', maxSteps = 1200) {
  let state = initializeGame(deckA, deckB, startingPlayer);
  let steps = 0;
  let lastActionKey = '';
  let repeatCount = 0;

  while (!state.winner && steps < maxSteps) {
    let actingPlayer = state.activePlayer;
    if (state.pendingInteraction) {
      actingPlayer =
        state.pendingInteraction.type === 'BLOCK_DECLARATION' ||
        state.pendingInteraction.type === 'BLOCKER_CHOICE'
          ? state.pendingInteraction.defendingPlayer
          : state.pendingInteraction.player;
    }

    const action = getAiAction(state, actingPlayer);
    assert.ok(
      action,
      `AI deadlocked at step ${steps} (turn ${state.turn}, active=${state.activePlayer}, phase=${state.phase}, pending=${state.pendingInteraction?.type})`
    );

    const actionKey = JSON.stringify({
      actingPlayer,
      phase: state.phase,
      turn: state.turn,
      pending: state.pendingInteraction?.type,
      action
    });
    if (actionKey === lastActionKey) {
      repeatCount++;
      assert.ok(
        repeatCount < 8,
        `Infinite loop detected at step ${steps}: repeated ${actionKey}`
      );
    } else {
      lastActionKey = actionKey;
      repeatCount = 0;
    }

    const prevLogLen = state.actionLog.length;
    state = step(state, action);
    validateInvariants(state, `${deckA.name} vs ${deckB.name}`);

    // Ensure action didn't silently throw an Action error repeatedly
    const newLogs = state.actionLog.slice(prevLogLen);
    const errorLog = newLogs.find((l) => l.startsWith('Action error ('));
    assert.ok(!errorLog, `AI emitted illegal action at step ${steps}: ${errorLog}`);

    steps++;
  }

  return { state, steps };
}

describe('Comprehensive Rule Validation & Bugfix Verification Suite', () => {
  const DECK_FIRE_NATURE = buildCustomDeck('v-fn', 'Fire/Nature Dragon & Cost-Reduction Vortex', [
    ['Cocco Lupia', 3],
    ['Elf-X', 2],
    ['Fever Nuts', 2],
    ['Pippie Kuppie', 3],
    ['Bronze-Arm Tribe', 4],
    ['Deadly Fighter Braid Claw', 2],
    ['Bolshack Dragon', 2],
    ['Bolmeteus Steel Dragon', 2],
    ['Terradragon Gamiratar', 2],
    ['Überdragon Bajula', 2],
    ['Soul Phoenix, Avatar of Unity', 2],
    ['Storm Wrangler, the Furious', 2],
    ['Faerie Life', 4],
    ['Crimson Hammer', 3],
    ['Tornado Flame', 3],
    ['Natural Snare', 2]
  ]);

  const DECK_CONTROL_IMMUNITY = buildCustomDeck('v-lwd', 'L/W/D Control, Immunity & Leave-BZ', [
    ['Emerald Grass', 4],
    ['Aqua Hulcus', 4],
    ['Emeral', 2],
    ['Corile', 3],
    ['Aqua Surfer', 3],
    ['Petrova, Channeler of Suns', 2],
    ['Nariel, the Oracle', 2],
    ['Bloody Squito', 3],
    ['La Byle, Seeker of the Winds', 2],
    ['Ruby Grass', 2],
    ['Cruel Naga, Avatar of Fate', 2],
    ['Wise Starnoid, Avatar of Hope', 2],
    ['Spiral Gate', 3],
    ['Terror Pit', 2],
    ['Death Smoke', 2],
    ['Holy Awe', 2]
  ]);

  const DECK_MECHANICS = buildCustomDeck('v-mech', 'DM-01–DM-12 Mechanics Showcase', [
    ['Asra, Vizier of Safety', 3],
    ['Ninja Pumpkin', 3],
    ['Sapian Tark, Flame Dervish', 3],
    ['Milporo', 3],
    ['Kilstine, Nebula Elemental', 2],
    ['Kejila, the Hidden Horror', 2],
    ['Illusion Fish', 2],
    ['Missile Soldier Ultimo', 3],
    ['Magmadragon Jagalzor', 2],
    ['Chekicul, Vizier of Endurance', 2],
    ['Badlands Lizard', 2],
    ['Spiral Grass', 2],
    ['Vile Mulder, Wing of the Void', 2],
    ['Cutthroat Skyterror', 2],
    ['Phantomach, the Gigatrooper', 2],
    ['Wind Axe, the Warrior Savage', 3],
    ['Fists of Forever', 2]
  ]);

  describe('1. Turn Lifecycle, Starting Player Symmetry & Silent Skill Persistence', () => {
    it('supports startingPlayer: opponent skipping Turn 1 draw for opponent and drawing for player', () => {
      const s0 = initializeGame(DECK_FIRE_NATURE, DECK_CONTROL_IMMUNITY, 'opponent');
      assert.equal(s0.turn, 1);
      assert.equal(s0.activePlayer, 'opponent');
      assert.equal(s0.startingPlayer, 'opponent');
      // Opponent skipped Turn 1 draw -> still 5 cards in hand
      assert.equal(s0.players.opponent.hand.length, 5);
      assert.equal(s0.players.player.hand.length, 5);

      const s1 = endTurn(s0);
      assert.equal(s1.activePlayer, 'player');
      assert.equal(s1.turn, 1); // still round 1 because startingPlayer is opponent
      assert.equal(s1.players.player.hand.length, 6); // player drew on Turn 1

      const s2 = endTurn(s1);
      assert.equal(s2.activePlayer, 'opponent');
      assert.equal(s2.turn, 2); // increments when turn wraps back to startingPlayer ('opponent')
      assert.equal(s2.players.opponent.hand.length, 6); // opponent now draws on Turn 2
    });

    it('preserves opponent shield losses caused by AI Silent Skill (Kejila) across startTurn and untaps unused Silent Skills', () => {
      const kejila = findCard('Kejila, the Hidden Horror');
      const milporo = findCard('Milporo');
      const vorg = findCard('Immortal Baron, Vorg');

      const state = createBaseState({
        turn: 4,
        activePlayer: 'opponent',
        phase: 'END_OF_TURN',
        players: {
          player: {
            shields: [
              makeShield(vorg, 'player', 0),
              makeShield(vorg, 'player', 1),
              makeShield(vorg, 'player', 2)
            ],
            hand: []
          },
          opponent: {
            deck: [makeCard(vorg, 'opponent', 'od-1'), makeCard(vorg, 'opponent', 'od-2')],
            battleZone: [
              makeCreature(kejila, 'opponent', 'kejila-1', { isTapped: true }),
              // Milporo is untapped -> cannot trigger Silent Skill anyway; a tapped vanilla should untap
              makeCreature(milporo, 'opponent', 'milp-1', { isTapped: false })
            ]
          }
        }
      });

      const afterStart = startTurn(state);
      // Kejila broke 2 opponent shields AND opponent hand received them (not overwritten by ...state!)
      assert.equal(afterStart.players.player.shields.length, 1);
      assert.equal(afterStart.players.player.hand.length, 2);
      // Kejila stayed tapped for its Silent Skill
      const kejilaAfter = afterStart.players.opponent.battleZone.find((c) => c.instanceId === 'kejila-1');
      assert.equal(kejilaAfter.isTapped, true);
    });
  });

  describe('2. Mana Rules: Cost Reduction & Smart Mono-First Tapping', () => {
    it('applies Cocco Lupia (-2 Dragons) and Essence Elf (-1 Spells), clamped cleanly', () => {
      const cocco = findCard('Cocco Lupia');
      const bolshack = findCard('Bolshack Dragon'); // Base 6, Armored Dragon -> 4 with 1 Cocco, 2 with 2 Coccos!
      const essenceElf = findCard('Essence Elf');
      const terrorPit = findCard('Terror Pit'); // Base 6 Spell -> 5 with Essence Elf

      const oneCocco = [makeCreature(cocco, 'player', 'cocco-1')];
      const twoCoccos = [
        makeCreature(cocco, 'player', 'cocco-1'),
        makeCreature(cocco, 'player', 'cocco-2')
      ];
      assert.equal(getEffectiveManaCost(bolshack, oneCocco), 4);
      assert.equal(getEffectiveManaCost(bolshack, twoCoccos), 2);

      const elfBZ = [makeCreature(essenceElf, 'player', 'elf-1')];
      assert.equal(getEffectiveManaCost(terrorPit, elfBZ), 5);

      const manaZone = [
        makeMana(findCard('Crimson Hammer'), 'm1'),
        makeMana(findCard('Crimson Hammer'), 'm2'),
        makeMana(findCard('Crimson Hammer'), 'm3'),
        makeMana(findCard('Crimson Hammer'), 'm4')
      ];
      assert.equal(canPayManaCost(manaZone, bolshack, []), false);
      assert.equal(canPayManaCost(manaZone, bolshack, oneCocco), true);
    });

    it('prefers tapping mono-civ mana cards before dual-civ mana when paying mono-civ cost', () => {
      const vorg = findCard('Immortal Baron, Vorg'); // Cost 2 Fire
      const emeraldGrass = findCard('Emerald Grass'); // Cost 2 Light
      const hammer = findCard('Crimson Hammer'); // Mono Fire
      const soulPhoenix = findCard('Soul Phoenix, Avatar of Unity'); // Fire/Nature
      const holyAwe = findCard('Holy Awe'); // Mono Light
      const faerieLife = findCard('Faerie Life'); // Mono Nature

      // Scenario: pay cost 2 Fire using [Fire/Nature, Fire, Light, Nature] -> must NOT burn Light needlessly or waste Fire/Nature!
      const manaZone = [
        makeMana(soulPhoenix, 'm-dual-fn'), // index 0: Fire/Nature!
        makeMana(holyAwe, 'm-light'),
        makeMana(hammer, 'm-fire'),
        makeMana(faerieLife, 'm-nature')
      ];

      const paid = payManaCost(manaZone, vorg);
      assert.equal(paid.success, true);
      // Mono Fire ('m-fire') satisfied the Fire civ requirement; Nature ('m-nature') filled generic, leaving Dual F/N & Light untouched (wait or Light untouched)!
      const lightUntapped = !paid.updatedManaZone.find((m) => m.instanceId === 'm-light').isTapped ||
        !paid.updatedManaZone.find((m) => m.instanceId === 'm-dual-fn').isTapped;
      assert.ok(lightUntapped);
      // Verify paying Light cost 2 right after or verify dual civ isn't needlessly consumed before mono-civ:
      assert.equal(paid.updatedManaZone.find((m) => m.instanceId === 'm-dual-fn').isTapped, false);
      assert.equal(paid.updatedManaZone.find((m) => m.instanceId === 'm-fire').isTapped, true);
      assert.equal(canPayManaCost(paid.updatedManaZone, emeraldGrass), true);
    });
  });

  describe('3. Evolution Race Exactness, Dragonoid Exclusion & Vortex Separation', () => {
    it('distinguishes Dragon vs Dragonoid and Giant vs Giant Insect cleanly', () => {
      const bajula = findCard('Überdragon Bajula'); // Requires Dragon in race
      const braidClaw = makeCreature(findCard('Deadly Fighter Braid Claw'), 'player', 'oid-1'); // Dragonoid!
      const bolshack = makeCreature(findCard('Bolshack Dragon'), 'player', 'drag-1'); // Armored Dragon
      const gigamantis = findCard('Gigamantis'); // Requires Giant Insect
      const dawnGiant = makeCreature(findCard('Dawn Giant'), 'player', 'giant-1'); // Giant (not Giant Insect!)
      const xenoMantis = makeCreature(findCard('Xeno Mantis'), 'player', 'insect-1'); // Giant Insect

      assert.equal(isValidEvolutionBait(bajula, braidClaw), false, 'Dragonoid is NOT a Dragon bait!');
      assert.equal(isValidEvolutionBait(bajula, bolshack), true, 'Armored Dragon IS a valid Dragon bait');
      assert.equal(isValidEvolutionBait(gigamantis, dawnGiant), false, 'Giant is NOT a Giant Insect!');
      assert.equal(isValidEvolutionBait(gigamantis, xenoMantis), true, 'Giant Insect matches Gigamantis');
    });

    it('supports Vortex Evolution (Soul Phoenix) bait pairs and preserves original summonedTurn when separating', () => {
      const soulPhoenix = findCard('Soul Phoenix, Avatar of Unity');
      const earthDragon = findCard('Terradragon Gamiratar'); // Earth Dragon!
      const cocco = findCard('Cocco Lupia'); // Fire Bird!
      const faerie = findCard('Faerie Life');
      const fireCard = findCard('Tornado Flame');

      const dragonBait = makeCreature(earthDragon, 'player', 'b-drag', { summonedTurn: 1 });
      const birdBait = makeCreature(cocco, 'player', 'b-bird', { summonedTurn: 4 });

      assert.equal(isValidVortexEvolutionBaits(soulPhoenix, dragonBait, birdBait), true);
      assert.equal(isValidVortexEvolutionBaits(soulPhoenix, dragonBait, dragonBait), false);

      const pairs = findAllValidVortexBaitPairs(soulPhoenix, [dragonBait, birdBait]);
      assert.equal(pairs.length, 1);

      let state = createBaseState({
        turn: 4,
        players: {
          player: {
            hand: [makeCard(soulPhoenix, 'player', 'sp-hand')],
            battleZone: [dragonBait, birdBait],
            manaZone: [
              makeMana(fireCard, 'm1'),
              makeMana(fireCard, 'm2'),
              makeMana(faerie, 'm3'),
              makeMana(faerie, 'm4')
            ]
          }
        }
      });

      state = summonCreature(state, 'player', 'sp-hand', ['b-drag', 'b-bird']);
      const phoenixInBZ = state.players.player.battleZone.find((c) => c.instanceId === 'sp-hand');
      assert.ok(phoenixInBZ);
      assert.equal(phoenixInBZ.evolvedOn.length, 2);

      // Bounce Soul Phoenix -> Phoenix goes to hand, baits return preserving ORIGINAL summonedTurn!
      state = bounceCreature(state, 'sp-hand');
      assert.equal(state.players.player.hand.some((h) => h.instanceId === 'sp-hand'), true);
      const returnedDragon = state.players.player.battleZone.find((c) => c.instanceId === 'b-drag');
      const returnedBird = state.players.player.battleZone.find((c) => c.instanceId === 'b-bird');
      assert.ok(returnedDragon && returnedBird);
      assert.equal(returnedDragon.summonedTurn, 1, 'Dragon summonedTurn 1 preserved -> can attack');
      assert.equal(returnedBird.summonedTurn, 4, 'Bird summonedTurn 4 preserved -> summoning sick on Turn 4');
      assert.equal(canCreatureAttack(state, returnedDragon).valid, true);
      assert.equal(canCreatureAttack(state, returnedBird).valid, false);
    });
  });

  describe('4. Simultaneous Destruction Savers & Leave-BZ Triggers', () => {
    it('prevents a simultaneously destroyed Saver from saving another doomed creature', () => {
      const customSaverCard = {
        ...findCard('Emerald Grass'),
        name: 'Test Saver 2000',
        power: 2000,
        rulesText: 'Saver (When one of your other creatures would be destroyed, you may destroy this creature instead.)'
      };
      const target2000 = makeCreature(findCard('Immortal Baron, Vorg'), 'player', 'vorg-1');
      const saver2000 = makeCreature(customSaverCard, 'player', 'saver-1');

      const state = createBaseState({
        players: {
          player: { battleZone: [target2000, saver2000], graveyard: [] }
        }
      });

      const afterWipe = destroyCreaturesBatch(state, ['vorg-1', 'saver-1']);
      assert.equal(afterWipe.players.player.battleZone.length, 0);
      assert.equal(afterWipe.players.player.graveyard.length, 2);
    });

    it('fires Leave-BZ triggers for Cruel Naga, Wise Starnoid, and Aura Pegasus on bounce/mana removal too', () => {
      const cruelNaga = makeCreature(findCard('Cruel Naga, Avatar of Fate'), 'opponent', 'naga-1');
      const wiseStarnoid = makeCreature(findCard('Wise Starnoid, Avatar of Hope'), 'opponent', 'star-1');
      const auraPegasus = makeCreature(findCard('Aura Pegasus, Avatar of Life'), 'opponent', 'peg-1');
      const vorg = findCard('Immortal Baron, Vorg');
      const pCreat = makeCreature(vorg, 'player', 'p-v1');

      let state = createBaseState({
        players: {
          player: { battleZone: [pCreat], shields: [makeShield(vorg, 'player', 0)] },
          opponent: {
            deck: [makeCard(vorg, 'opponent', 'od-top'), makeCard(vorg, 'opponent', 'od-2')],
            battleZone: [cruelNaga, wiseStarnoid, auraPegasus],
            shields: [makeShield(vorg, 'opponent', 0)]
          }
        }
      });

      // Bounce Wise Starnoid -> triggers leave-BZ shield add (opponent shields: 1 -> 2)!
      state = bounceCreature(state, 'star-1');
      assert.equal(state.players.opponent.shields.length, 2);

      // Send Aura Pegasus to Mana -> reveals top deck (vorg non-evo creature) -> puts it into BZ!
      state = sendCreatureToManaZone(state, 'peg-1');
      assert.equal(state.players.opponent.battleZone.some((c) => c.card.name === 'Immortal Baron, Vorg'), true);

      // Bounce Cruel Naga -> triggers mass wipe ("all creatures" — wait Naga says destroy all other or all creatures)!
      const state2 = createBaseState({
        players: {
          player: { battleZone: [makeCreature(vorg, 'player', 'pv-1')] },
          opponent: { battleZone: [cruelNaga, makeCreature(vorg, 'opponent', 'ov-1')] }
        }
      });
      const afterNagaLeave = sendCreatureToManaZone(state2, 'naga-1');
      assert.equal(afterNagaLeave.players.player.battleZone.length, 0);
      assert.equal(afterNagaLeave.players.opponent.battleZone.length, 0);
    });
  });

  describe('5. Exact Card Implementations & Immunity / Shield Trigger Locks', () => {
    it('Corile places target creature on top of opponent deck, and Emeral swaps hand card with shield without triggering ST', () => {
      const corile = findCard('Corile');
      const emeral = findCard('Emeral');
      const vorg = findCard('Immortal Baron, Vorg');
      const holyAwe = findCard('Holy Awe'); // Shield Trigger!
      const waterCard = findCard('Spiral Gate');

      let state = createBaseState({
        players: {
          player: {
            hand: [
              makeCard(corile, 'player', 'corile-h'),
              makeCard(emeral, 'player', 'emeral-h'),
              makeCard(waterCard, 'player', 'swap-card')
            ],
            manaZone: Array.from({ length: 7 }, (_, i) => makeMana(waterCard, `wm-${i}`)),
            shields: [makeShield(holyAwe, 'player', 0)]
          },
          opponent: {
            deck: [makeCard(waterCard, 'opponent', 'od-orig')],
            battleZone: [makeCreature(vorg, 'opponent', 'opp-vorg')]
          }
        }
      });

      state = summonCreature(state, 'player', 'corile-h', undefined, ['opp-vorg']);
      assert.equal(state.players.opponent.battleZone.length, 0);
      assert.equal(state.players.opponent.deck[0].card.name, 'Immortal Baron, Vorg', 'Corile puts card on TOP of deck');

      state = summonCreature(state, 'player', 'emeral-h');
      assert.equal(state.pendingInteraction, null, 'Emeral must NOT trigger Shield Trigger when swapping own shield to hand');
      assert.equal(state.players.player.shields[0].card.name, 'Spiral Gate');
      assert.equal(state.players.player.hand.some((c) => c.card.name === 'Holy Awe'), true);
    });

    it('Petrova untargetability blocks opponent Terror Pit & Tornado Flame while Nariel stops power >= 3000 from attacking', () => {
      const petrova = makeCreature(findCard('Petrova, Channeler of Suns'), 'opponent', 'pet-1'); // 3500 power
      const nariel = makeCreature(findCard('Nariel, the Oracle'), 'opponent', 'nariel-1');
      const bolshack = makeCreature(findCard('Bolshack Dragon'), 'player', 'bol-1'); // 6000
      const vorg = makeCreature(findCard('Immortal Baron, Vorg'), 'player', 'vorg-1'); // 2000

      const state = createBaseState({
        players: {
          player: { battleZone: [bolshack, vorg] },
          opponent: { battleZone: [petrova, nariel] }
        }
      });

      const reqPit = getSpellTargetRequirement(findCard('Terror Pit'), state, 'player');
      assert.ok(!reqPit.validTargetIds.includes('pet-1'), 'Petrova cannot be chosen by opponent Terror Pit');
      assert.ok(reqPit.validTargetIds.includes('nariel-1'));

      assert.equal(canCreatureAttack(state, bolshack).valid, false, 'Nariel blocks power >= 3000 from attacking');
      assert.equal(canCreatureAttack(state, vorg).valid, true, 'Power 2000 can still attack under Nariel');
    });

    it('Cryptic Totem tapped, Fu Reil, and Gigabolver suppress corresponding Shield Triggers cleanly', () => {
      const vorg = findCard('Immortal Baron, Vorg');
      const terrorPit = findCard('Terror Pit'); // Darkness ST
      const holyAwe = findCard('Holy Awe'); // Light ST
      const cryptic = makeCreature(findCard('Cryptic Totem'), 'player', 'cryp-1', { isTapped: true });
      const fuReil = makeCreature(findCard('Fu Reil, Seeker of Storms'), 'player', 'fu-1');
      const gigabolver = makeCreature(findCard('Gigabolver'), 'player', 'giga-1');

      // 1. Cryptic Totem tapped -> blocks ANY Shield Trigger
      const sCryptic = createBaseState({
        players: {
          player: { battleZone: [cryptic] },
          opponent: { shields: [makeShield(terrorPit, 'opponent', 0), makeShield(holyAwe, 'opponent', 1)] }
        }
      });
      const rCryptic = breakOpponentShields(sCryptic, 'player', 2);
      assert.equal(rCryptic.pendingInteraction, null);

      // 2. Fu Reil blocks Darkness ST, allows Light ST
      const sFu = createBaseState({
        players: {
          player: { battleZone: [fuReil] },
          opponent: { shields: [makeShield(terrorPit, 'opponent', 0), makeShield(holyAwe, 'opponent', 1)] }
        }
      });
      const rFu = breakOpponentShields(sFu, 'player', 2);
      assert.equal(rFu.pendingInteraction?.triggers?.length, 1);
      assert.equal(rFu.pendingInteraction?.triggers?.[0].card.name, 'Holy Awe');

      // 3. Gigabolver blocks Light ST, allows Darkness ST
      const sGiga = createBaseState({
        players: {
          player: { battleZone: [gigabolver] },
          opponent: { shields: [makeShield(terrorPit, 'opponent', 0), makeShield(holyAwe, 'opponent', 1)] }
        }
      });
      const rGiga = breakOpponentShields(sGiga, 'player', 2);
      assert.equal(rGiga.pendingInteraction?.triggers?.length, 1);
      assert.equal(rGiga.pendingInteraction?.triggers?.[0].card.name, 'Terror Pit');
      assert.ok(vorg);
    });
  });

  describe('6. Combat Specials, Cross-Board Wave Striker, Turbo Rush, Ninja Pumpkin & Multi-Trigger Queue', () => {
    it('enforces cross-board Wave Striker & Ninja Pumpkin per-blocker power threshold (unblockable <= 5000)', () => {
      const ninjaPumpkin = makeCreature(findCard('Ninja Pumpkin'), 'player', 'np-1');
      const asra = makeCreature(findCard('Asra, Vizier of Safety'), 'player', 'asra-1');
      const sapian = makeCreature(findCard('Sapian Tark, Flame Dervish'), 'opponent', 'sapian-opp'); // 3rd WS across board!
      const smallBlocker = makeCreature(findCard('Bloody Squito'), 'opponent', 'sq-4000'); // 4000
      const bigBlocker = makeCreature(
        { ...findCard('La Byle, Seeker of the Winds'), power: 6000 },
        'opponent',
        'lab-6000'
      ); // 6000

      // 2 friendly + 1 opponent = 3 WS across both BZs!
      const state = createBaseState({
        players: {
          player: { battleZone: [ninjaPumpkin, asra] },
          opponent: { battleZone: [sapian, smallBlocker, bigBlocker] }
        }
      });
      assert.equal(
        isWaveStrikerConditionMet([state.players.player.battleZone, state.players.opponent.battleZone]),
        true
      );
      assert.equal(
        hasCreatureBlocker(asra, state.players.player.battleZone, state.players.opponent.battleZone),
        true
      );
      assert.equal(
        canBeBlockedBy(ninjaPumpkin, smallBlocker, { type: 'shield', index: 0 }, state),
        false,
        'Ninja Pumpkin with 3 WS cannot be blocked by <= 5000 blocker'
      );
      assert.equal(
        canBeBlockedBy(ninjaPumpkin, bigBlocker, { type: 'shield', index: 0 }, state),
        true,
        'Ninja Pumpkin CAN be blocked by > 5000 blocker'
      );
    });

    it('gates Illusion Fish & Jagalzor Turbo Rush strictly behind a shield broken this turn', () => {
      const illusionFish = makeCreature(findCard('Illusion Fish'), 'player', 'fish-1', { summonedTurn: 1 });
      const jagalzor = makeCreature(findCard('Magmadragon Jagalzor'), 'player', 'jag-1', { summonedTurn: 3 }); // current turn = 3!
      const blocker = makeCreature(findCard('Emerald Grass'), 'opponent', 'eg-1');

      const beforeBreak = createBaseState({
        turn: 3,
        players: {
          player: { battleZone: [illusionFish, jagalzor], shieldsBrokenThisTurn: [] },
          opponent: { battleZone: [blocker] }
        }
      });

      assert.equal(isTurboRushActive(beforeBreak, 'player', illusionFish), false);
      assert.equal(hasCreatureSpeedAttacker(jagalzor, beforeBreak.players.player.battleZone, beforeBreak, 'player'), false);
      assert.equal(canBeBlockedBy(illusionFish, blocker, { type: 'shield', index: 0 }, beforeBreak), true);

      const afterBreak = createBaseState({
        turn: 3,
        players: {
          player: { battleZone: [illusionFish, jagalzor], shieldsBrokenThisTurn: ['other-att'] },
          opponent: { battleZone: [blocker] }
        }
      });
      assert.equal(isTurboRushActive(afterBreak, 'player', illusionFish), true);
      assert.equal(hasCreatureSpeedAttacker(jagalzor, afterBreak.players.player.battleZone, afterBreak, 'player'), true);
      assert.equal(canBeBlockedBy(illusionFish, blocker, { type: 'shield', index: 0 }, afterBreak), false);
    });

    it('handles Chekicul no-battle, Bloody Squito win-destroy, Spiral Grass untap, and Vile Mulder self-destruct', () => {
      const vorg = makeCreature(findCard('Immortal Baron, Vorg'), 'player', 'vorg-att');
      const chekicul = makeCreature(findCard('Chekicul, Vizier of Endurance'), 'opponent', 'chek-1');
      const bloodySquito = makeCreature(findCard('Bloody Squito'), 'opponent', 'sq-1');
      const spiralGrass = makeCreature(findCard('Spiral Grass'), 'opponent', 'sg-1', { powerModifier: 2000 });
      const vileMulder = makeCreature(findCard('Vile Mulder, Wing of the Void'), 'player', 'vm-1'); // 7000

      // Chekicul blocks -> NO battle happens, both stay tapped & survive!
      let s1 = createBaseState({
        players: {
          player: { battleZone: [vorg] },
          opponent: { battleZone: [chekicul] }
        }
      });
      s1 = declareAttack(s1, 'vorg-att', { type: 'shield', index: 0 });
      s1 = declareBlock(s1, 'chek-1');
      assert.equal(s1.players.player.battleZone.length, 1);
      assert.equal(s1.players.opponent.battleZone.length, 1);
      assert.equal(s1.players.opponent.battleZone[0].isTapped, true);

      // Bloody Squito (4000) blocks Vorg (2000) -> Vorg dies, Squito wins & self-destructs!
      let s2 = createBaseState({
        players: {
          player: { battleZone: [vorg] },
          opponent: { battleZone: [bloodySquito] }
        }
      });
      s2 = declareAttack(s2, 'vorg-att', { type: 'shield', index: 0 });
      s2 = declareBlock(s2, 'sq-1');
      assert.equal(s2.players.player.battleZone.length, 0);
      assert.equal(s2.players.opponent.battleZone.length, 0);

      // Spiral Grass blocks & survives -> untaps after battle!
      let s3 = createBaseState({
        players: {
          player: { battleZone: [vorg] },
          opponent: { battleZone: [spiralGrass] }
        }
      });
      s3 = declareAttack(s3, 'vorg-att', { type: 'shield', index: 0 });
      s3 = declareBlock(s3, 'sg-1');
      assert.equal(s3.players.opponent.battleZone.length, 1);
      assert.equal(s3.players.opponent.battleZone[0].isTapped, false);

      // Vile Mulder can't attack creatures, destroys self after battle when blocked!
      let s4 = createBaseState({
        players: {
          player: { battleZone: [vileMulder] },
          opponent: { battleZone: [makeCreature(findCard('Emerald Grass'), 'opponent', 'eg-tapped', { isTapped: true })] }
        }
      });
      assert.equal(
        canDeclareAttack(s4, 'vm-1', { type: 'creature', instanceId: 'eg-tapped' }).valid,
        false
      );
      const bigBlocker = makeCreature(findCard('Emerald Grass'), 'opponent', 'eg-b');
      s4 = createBaseState({
        players: {
          player: { battleZone: [vileMulder] },
          opponent: { battleZone: [bigBlocker] }
        }
      });
      s4 = declareAttack(s4, 'vm-1', { type: 'shield', index: 0 });
      s4 = declareBlock(s4, 'eg-b');
      assert.equal(s4.players.opponent.battleZone.length, 0, 'Emerald Grass lost battle to Vile Mulder');
      assert.equal(s4.players.player.battleZone.length, 0, 'Vile Mulder destroyed after battle');
    });

    it('preserves remaining Shield Triggers in pendingTriggerQueue when first Shield Trigger opens DECK_SEARCH', () => {
      const factoryShellST = { ...findCard('Factory Shell Q'), isShieldTrigger: true };
      const smashHorn = findCard('Smash Horn Q');
      const holyAwe = findCard('Holy Awe');
      const bolshack = makeCreature(findCard('Bolshack Dragon'), 'opponent', 'bol-att');

      let state = createBaseState({
        activePlayer: 'opponent',
        players: {
          player: {
            deck: [makeCard(smashHorn, 'player', 'surv-deck-1'), makeCard(holyAwe, 'player', 'pd-2')],
            shields: [
              makeShield(factoryShellST, 'player', 0),
              makeShield(holyAwe, 'player', 1)
            ]
          },
          opponent: { battleZone: [bolshack] }
        }
      });

      state = declareAttack(state, 'bol-att', { type: 'shield', index: 0, indices: [0, 1] });
      assert.equal(state.pendingInteraction?.type, 'SHIELD_TRIGGER_RESOLUTION');
      assert.equal(state.pendingInteraction.triggers.length, 2);

      // Player activates 1st ST (Factory Shell Q) -> opens DECK_SEARCH for Survivor while Holy Awe stays queued!
      const shellId = state.pendingInteraction.triggers[0].shieldId;
      state = step(state, {
        type: 'RESOLVE_SHIELD_TRIGGER',
        player: 'player',
        shieldId: shellId,
        activate: true
      });
      assert.equal(state.pendingInteraction?.type, 'DECK_SEARCH', 'Factory Shell Q opened DECK_SEARCH prompt');
      assert.equal(state.pendingTriggerQueue?.length, 1, 'Holy Awe ST preserved in pendingTriggerQueue');

      // Player resolves DECK_SEARCH -> Holy Awe ST automatically surfaces!
      state = step(state, {
        type: 'RESOLVE_DECK_SEARCH',
        player: 'player',
        selectedCardInstanceId: 'surv-deck-1'
      });
      assert.equal(state.players.player.hand.some((c) => c.instanceId === 'surv-deck-1'), true);
      assert.equal(state.pendingInteraction?.type, 'SHIELD_TRIGGER_RESOLUTION');
      assert.equal(state.pendingInteraction.triggers[0].card.name, 'Holy Awe');
    });

    it('enforces Storm Wrangler forced block, Miracle Quest 2x shield draw, Pippie Kuppie Dragon aura, Phantomach Double Breaker, and Bex zero-shield Blocker', () => {
      const stormWrangler = makeCreature(findCard('Storm Wrangler, the Furious'), 'player', 'sw-1');
      const squito = makeCreature(findCard('Bloody Squito'), 'opponent', 'sq-forced');
      const emerald = makeCreature(findCard('Emerald Grass'), 'opponent', 'eg-other');

      // Storm Wrangler attacks -> forces highest untapped blocker (Bloody Squito), blocks passing or other blockers!
      let swState = createBaseState({
        players: {
          player: { battleZone: [stormWrangler] },
          opponent: { battleZone: [emerald, squito] }
        }
      });
      swState = declareAttack(swState, 'sw-1', { type: 'shield', index: 0 });
      assert.equal(swState.pendingInteraction?.type, 'BLOCK_DECLARATION');
      assert.deepEqual(swState.pendingInteraction.validBlockerIds, ['sq-forced']);
      assert.throws(() => declareBlock(swState, null), /forced blocker/i);

      // Pippie Kuppie (+1000 Armored Dragon aura) & Phantomach Double Breaker
      const pippie = makeCreature(findCard('Pippie Kuppie'), 'player', 'pip-1');
      const bolshack = makeCreature(findCard('Bolshack Dragon'), 'player', 'bol-1');
      const phantomach = makeCreature(findCard('Phantomach, the Gigatrooper'), 'player', 'ph-1');
      const pipState = createBaseState({
        players: { player: { battleZone: [pippie, bolshack, phantomach] } }
      });
      assert.equal(getCreatureEffectivePower(bolshack, false, pipState.players.player, pipState.players.opponent), 7000);
      assert.equal(getCreatureBreakerCount(phantomach, pipState.players.player.battleZone, []), 2);

      // Bex, the Oracle: NOT blocker with shields, IS blocker with 0 shields
      const bex = makeCreature(findCard('Bex, the Oracle'), 'player', 'bex-1');
      const sShield = createBaseState({
        players: { player: { battleZone: [bex], shields: [makeShield(findCard('Holy Awe'), 'player', 0)] } }
      });
      const sZero = createBaseState({
        players: { player: { battleZone: [bex], shields: [] } }
      });
      assert.equal(hasCreatureBlocker(bex, sShield.players.player.battleZone, [], sShield.players.player), false);
      assert.equal(hasCreatureBlocker(bex, sZero.players.player.battleZone, [], sZero.players.player), true);

      // Miracle Quest: draw 2 cards per shield broken on attack
      const miracleQuest = findCard('Miracle Quest');
      const waterCard = findCard('Spiral Gate');
      let mqState = createBaseState({
        players: {
          player: {
            hand: [makeCard(miracleQuest, 'player', 'mq-hand')],
            manaZone: [makeMana(waterCard, 'm1'), makeMana(waterCard, 'm2'), makeMana(waterCard, 'm3')],
            battleZone: [bolshack]
          }
        }
      });
      mqState = castSpell(mqState, 'player', 'mq-hand');
      const handBeforeBreak = mqState.players.player.hand.length;
      mqState = declareAttack(mqState, 'bol-1', { type: 'shield', index: 0, indices: [0, 1] });
      assert.equal(mqState.players.player.hand.length, handBeforeBreak + 4, 'Double Breaker + Miracle Quest drew 4 cards!');
    });
  });

  describe('7. End-to-End Multi-Agent Full Match Simulations across 3 New Rule-Dense Decks', () => {
    it('completes 20 AI matches Fire/Nature Vortex vs L/W/D Control (both P1 & P2 start) with zero deadlocks', () => {
      let playerWins = 0;
      let oppWins = 0;
      for (let i = 0; i < 20; i++) {
        const starter = i % 2 === 0 ? 'player' : 'opponent';
        const { state } = runAiMatch(DECK_FIRE_NATURE, DECK_CONTROL_IMMUNITY, starter);
        assert.ok(state.winner, `Match ${i} must terminate cleanly with a winner`);
        if (state.winner === 'player') playerWins++;
        else oppWins++;
      }
      assert.equal(playerWins + oppWins, 20);
    });

    it('completes 20 AI matches L/W/D Control vs DM-01–DM-12 Mechanics Showcase with zero deadlocks', () => {
      let finished = 0;
      for (let i = 0; i < 20; i++) {
        const starter = i % 2 === 0 ? 'player' : 'opponent';
        const { state } = runAiMatch(DECK_CONTROL_IMMUNITY, DECK_MECHANICS, starter);
        assert.ok(state.winner, `Mechanics match ${i} must terminate cleanly`);
        finished++;
      }
      assert.equal(finished, 20);
    });

    it('completes 20 AI matches Fire/Nature Vortex vs DM-01–DM-12 Mechanics Showcase with zero deadlocks', () => {
      let finished = 0;
      for (let i = 0; i < 20; i++) {
        const starter = i % 2 === 0 ? 'player' : 'opponent';
        const { state } = runAiMatch(DECK_FIRE_NATURE, DECK_MECHANICS, starter);
        assert.ok(state.winner, `Vortex vs Mechanics match ${i} must terminate cleanly`);
        finished++;
      }
      assert.equal(finished, 20);
    });
  });

  describe('8. Interactive Rules Verification (Manual Mana Staging, You May, Opp Chooses, Nested Evo, Silent Skill, $tap)', () => {
    it('Rule 1: supports manual mana staging, enforces civ/dual-civ distinct payment, locks spent mana until start of turn, and respects Terradragon Cusdalf', () => {
      const vorg = findCard('Immortal Baron, Vorg');
      const spiral = findCard('Spiral Gate');
      const rays = findCard('Solar Ray');
      const technoTotem = findCard('Techno Totem'); // Light/Nature cost 4
      const cusdalf = findCard('Terradragon Cusdalf');
      const natureCard = findCard('Bronze-Arm Tribe');

      let state = createBaseState({
        turn: 2,
        players: {
          player: {
            hand: [makeCard(vorg, 'player', 'h-vorg'), makeCard(technoTotem, 'player', 'h-tt')],
            manaZone: [
              makeMana(vorg, 'm-fire', false),
              makeMana(spiral, 'm-water', false),
              makeMana(rays, 'm-light', false),
              makeMana(natureCard, 'm-nat1', false),
              makeMana(technoTotem, 'm-ln1', false)
            ]
          }
        }
      });

      // Stage wrong civs (Water + Light) and try summoning Fire creature (Vorg, cost 2)
      state = toggleManaTap(state, 'player', 'm-water', true);
      state = toggleManaTap(state, 'player', 'm-light', true);
      assert.equal(state.players.player.manaZone.find((m) => m.instanceId === 'm-water').isStaged, true);
      assert.throws(
        () => summonCreature(state, 'player', 'h-vorg'),
        /Fire/i,
        'Manual staged mana without required Fire civ must reject summoning Vorg'
      );

      // Untap Light, stage Fire alongside Water -> valid!
      state = toggleManaTap(state, 'player', 'm-light', false);
      state = toggleManaTap(state, 'player', 'm-fire', true);
      state = summonCreature(state, 'player', 'h-vorg');
      const spentFire = state.players.player.manaZone.find((m) => m.instanceId === 'm-fire');
      const spentWater = state.players.player.manaZone.find((m) => m.instanceId === 'm-water');
      assert.equal(spentFire.isTapped, true);
      assert.equal(spentFire.isSpent, true);
      assert.equal(spentWater.isSpent, true);

      // Spent mana CANNOT be untapped manually this turn
      assert.throws(
        () => toggleManaTap(state, 'player', 'm-fire', false),
        /already been spent|cannot be untapped/i
      );

      // Dual-civ card (Techno Totem: Light/Nature) requires distinct cards for BOTH Light and Nature!
      // Available unspent cards right now: [m-light, m-nat1, m-ln1] (only 3 left -> sum fail)
      // Give 1 more unspent card and stage ONLY [m-water(spent?), no let's test explicit staging with 1 Light/Nature + 3 Water]
      let dualState = createBaseState({
        players: {
          player: {
            hand: [makeCard(technoTotem, 'player', 'h-tt2')],
            manaZone: [
              makeMana(technoTotem, 'm-ln-single', false),
              makeMana(spiral, 'm-w1', false),
              makeMana(spiral, 'm-w2', false),
              makeMana(spiral, 'm-w3', false),
              makeMana(natureCard, 'm-nat2', false)
            ]
          }
        }
      });
      // Stage ONLY 1 dual-civ card + 3 Water -> only satisfies 1 of the two civs, NOT distinct cards for both Light & Nature!
      dualState = toggleManaTap(dualState, 'player', 'm-ln-single', true);
      dualState = toggleManaTap(dualState, 'player', 'm-w1', true);
      dualState = toggleManaTap(dualState, 'player', 'm-w2', true);
      dualState = toggleManaTap(dualState, 'player', 'm-w3', true);
      assert.throws(
        () => summonCreature(dualState, 'player', 'h-tt2'),
        /distinct|Nature|Light/i,
        'Single dual-civ card cannot simultaneously cover both Light and Nature requirements'
      );
      // Untap w3 and stage m-nat2 instead -> m-ln-single covers Light and m-nat2 covers Nature!
      dualState = toggleManaTap(dualState, 'player', 'm-w3', false);
      dualState = toggleManaTap(dualState, 'player', 'm-nat2', true);
      dualState = summonCreature(dualState, 'player', 'h-tt2');
      assert.ok(dualState.players.player.battleZone.some((c) => c.card.name === 'Techno Totem'));

      // Start of turn untaps spent mana cleanly
      const afterStart = startTurn({ ...state, activePlayer: 'player', turn: 3 });
      assert.equal(afterStart.players.player.manaZone.every((m) => !m.isTapped && !m.isSpent), true);

      // With Terradragon Cusdalf in BZ, startTurn does NOT untap player's mana zone
      const cusdalfState = {
        ...state,
        activePlayer: 'player',
        turn: 3,
        players: {
          ...state.players,
          player: {
            ...state.players.player,
            battleZone: [makeCreature(cusdalf, 'player', 'bz-cusdalf')]
          }
        }
      };
      const afterCusdalfTurn = startTurn(cusdalfState);
      assert.equal(afterCusdalfTurn.players.player.manaZone.find((m) => m.instanceId === 'm-fire').isTapped, true);
    });

    it('Rule 2: interactiveHuman prompts for "you may" effects, "opponent chooses" actions, and exact 6-zone choices', () => {
      const hulcus = findCard('Aqua Hulcus');
      const spiral = findCard('Spiral Gate');
      const kip = findCard('Kip Chippotto');
      const bolshack = findCard('Bolshack Dragon');
      const aquaAgent = findCard('Aqua Agent');
      const pulsar = findCard('Pulsar Tree');
      const cranium = findCard('Cranium Clamp');
      const crisisBoulder = findCard('Crisis Boulder');
      const darkReversal = findCard('Dark Reversal');
      const kyuroro = findCard('Kyuroro');
      const vorg = findCard('Immortal Baron, Vorg');

      // 2a. "you may" CIP Draw (Aqua Hulcus)
      let hulcusState = createBaseState({
        interactiveHuman: true,
        players: {
          player: {
            hand: [makeCard(hulcus, 'player', 'h-hulcus')],
            manaZone: [makeMana(spiral, 'm1'), makeMana(spiral, 'm2'), makeMana(spiral, 'm3')]
          }
        }
      });
      hulcusState = summonCreature(hulcusState, 'player', 'h-hulcus');
      assert.equal(hulcusState.pendingInteraction?.type, 'OPTIONAL_CHOICE');
      assert.equal(hulcusState.pendingInteraction?.effectType, 'DRAW');
      const deckBefore = hulcusState.players.player.deck.length;
      const declinedHulcus = step(hulcusState, { type: 'RESOLVE_OPTIONAL_CHOICE', player: 'player', accept: false });
      assert.equal(declinedHulcus.players.player.deck.length, deckBefore);
      const acceptedHulcus = step(hulcusState, { type: 'RESOLVE_OPTIONAL_CHOICE', player: 'player', accept: true });
      assert.equal(acceptedHulcus.players.player.deck.length, deckBefore - 1);

      // 2b. "you may" Saver (Kip Chippotto protecting Bolshack Dragon)
      let saverState = createBaseState({
        interactiveHuman: true,
        players: {
          player: {
            battleZone: [makeCreature(bolshack, 'player', 'bz-bol'), makeCreature(kip, 'player', 'bz-kip')]
          }
        }
      });
      saverState = destroyCreature(saverState, 'bz-bol');
      assert.equal(saverState.pendingInteraction?.effectType, 'SAVER_REPLACEMENT');
      const saverAccepted = step(saverState, { type: 'RESOLVE_OPTIONAL_CHOICE', player: 'player', accept: true });
      assert.ok(saverAccepted.players.player.battleZone.some((c) => c.instanceId === 'bz-bol'), 'Bolshack saved');
      assert.ok(saverAccepted.players.player.graveyard.some((g) => g.instanceId === 'bz-kip'), 'Kip sacrificed');
      const saverDeclined = step(saverState, { type: 'RESOLVE_OPTIONAL_CHOICE', player: 'player', accept: false });
      assert.ok(saverDeclined.players.player.graveyard.some((g) => g.instanceId === 'bz-bol'), 'Bolshack destroyed on decline');

      // 2c. "you may" Destroy-to-Hand (Aqua Agent)
      let agentState = createBaseState({
        interactiveHuman: true,
        players: {
          player: {
            battleZone: [makeCreature(aquaAgent, 'player', 'bz-agent')]
          }
        }
      });
      agentState = destroyCreature(agentState, 'bz-agent');
      assert.equal(agentState.pendingInteraction?.effectType, 'DESTROY_TO_HAND');
      const agentBounced = step(agentState, { type: 'RESOLVE_OPTIONAL_CHOICE', player: 'player', accept: true });
      assert.ok(agentBounced.players.player.hand.some((h) => h.instanceId === 'bz-agent'));

      // 2d. "you may" Shield Sacrifice (Pulsar Tree) & "opponent chooses shield" (Kyuroro)
      let pulsarState = createBaseState({
        interactiveHuman: true,
        players: {
          player: {
            battleZone: [makeCreature(pulsar, 'player', 'bz-pulsar'), makeCreature(kyuroro, 'player', 'bz-kyu')]
          },
          opponent: {
            battleZone: [makeCreature(vorg, 'opponent', 'opp-att')]
          }
        }
      });
      pulsarState = breakOpponentShields(pulsarState, 'opponent', 1);
      assert.equal(pulsarState.pendingInteraction?.effectType, 'SHIELD_SACRIFICE_REPLACEMENT');
      // Decline Pulsar Tree -> falls through to Kyuroro shield choice ZONE_SELECTION!
      const afterDeclinePulsar = step(pulsarState, { type: 'RESOLVE_OPTIONAL_CHOICE', player: 'player', accept: false });
      assert.equal(afterDeclinePulsar.pendingInteraction?.type, 'ZONE_SELECTION');
      assert.equal(afterDeclinePulsar.pendingInteraction?.actionKind, 'OPPONENT_CHOOSE_SHIELD');
      const chosenShieldId = afterDeclinePulsar.pendingInteraction.options[2].instanceId;
      const afterKyu = step(afterDeclinePulsar, {
        type: 'RESOLVE_ZONE_SELECTION',
        player: 'player',
        selectedIds: [chosenShieldId]
      });
      assert.equal(afterKyu.players.player.shields.some((s) => s.id === chosenShieldId), false);
      assert.equal(afterKyu.players.player.shields.length, 4);

      // 2e. "opponent chooses" mixed zones (Crisis Boulder: BZ or Mana) + hand discard (Cranium Clamp)
      let oppSpellState = createBaseState({
        interactiveHuman: true,
        activePlayer: 'opponent',
        players: {
          player: {
            hand: [makeCard(vorg, 'player', 'ph1'), makeCard(spiral, 'player', 'ph2'), makeCard(bolshack, 'player', 'ph3')],
            battleZone: [makeCreature(vorg, 'player', 'p-bz1')],
            manaZone: [makeMana(spiral, 'p-m1')]
          },
          opponent: {
            hand: [makeCard(crisisBoulder, 'opponent', 'oh-cb'), makeCard(cranium, 'opponent', 'oh-cc')],
            manaZone: [
              makeMana(vorg, 'om1'),
              makeMana(vorg, 'om2'),
              makeMana(vorg, 'om3'),
              makeMana(vorg, 'om4'),
              makeMana(cranium, 'om5'),
              makeMana(cranium, 'om6'),
              makeMana(cranium, 'om7'),
              makeMana(vorg, 'om8')
            ]
          }
        }
      });
      oppSpellState = castSpell(oppSpellState, 'opponent', 'oh-cb');
      assert.equal(oppSpellState.pendingInteraction?.type, 'ZONE_SELECTION');
      assert.equal(oppSpellState.pendingInteraction?.actionKind, 'OPPONENT_CRISIS_BOULDER');
      // Player chooses mana card 'p-m1' instead of sacrificing creature 'p-bz1'!
      oppSpellState = step(oppSpellState, { type: 'RESOLVE_ZONE_SELECTION', player: 'player', selectedIds: ['p-m1'] });
      assert.equal(oppSpellState.players.player.battleZone.length, 1);
      assert.ok(oppSpellState.players.player.graveyard.some((g) => g.instanceId === 'p-m1'));

      // Opponent casts Cranium Clamp -> player chooses exact 2 hand cards to discard
      oppSpellState = castSpell(oppSpellState, 'opponent', 'oh-cc');
      assert.equal(oppSpellState.pendingInteraction?.actionKind, 'OPPONENT_DISCARD_HAND');
      oppSpellState = step(oppSpellState, { type: 'RESOLVE_ZONE_SELECTION', player: 'player', selectedIds: ['ph1', 'ph2'] });
      assert.deepEqual(oppSpellState.players.player.hand.map((h) => h.instanceId), ['ph3']);

      // 2f. Player Graveyard zone selection (Dark Reversal)
      let revState = createBaseState({
        interactiveHuman: true,
        players: {
          player: {
            hand: [makeCard(darkReversal, 'player', 'h-dr')],
            manaZone: [makeMana(darkReversal, 'm1'), makeMana(darkReversal, 'm2')],
            graveyard: [makeCard(vorg, 'player', 'gy-vorg'), makeCard(bolshack, 'player', 'gy-bol')]
          }
        }
      });
      revState = castSpell(revState, 'player', 'h-dr');
      assert.equal(revState.pendingInteraction?.actionKind, 'PLAYER_SALVAGE_GY');
      revState = step(revState, { type: 'RESOLVE_ZONE_SELECTION', player: 'player', selectedIds: ['gy-vorg'] });
      assert.ok(revState.players.player.hand.some((h) => h.instanceId === 'gy-vorg'));
    });

    it('Rule 3: preserves nested Evolution stacks and separates them properly for Soul Phoenix vs full exit normally', () => {
      const hulcus = findCard('Aqua Hulcus');
      const paladin = findCard('Crystal Paladin'); // Evolution on Liquid People
      const lancer = findCard('Crystal Lancer');   // Evolution on Liquid People
      const soulPhoenix = findCard('Soul Phoenix, Avatar of Unity'); // Vortex: Fire Bird + Earth Dragon

      // 3a. Triple nested stack leaving BZ normally: all 3 exit to graveyard
      let state = createBaseState({
        turn: 5,
        players: {
          player: {
            hand: [makeCard(paladin, 'player', 'h-pal'), makeCard(lancer, 'player', 'h-lan')],
            battleZone: [makeCreature(hulcus, 'player', 'bz-hulcus', { summonedTurn: 2 })],
            manaZone: Array.from({ length: 10 }, (_, i) => makeMana(hulcus, `m-${i}`))
          }
        }
      });
      state = summonCreature(state, 'player', 'h-pal', 'bz-hulcus');
      state = summonCreature(state, 'player', 'h-lan', 'h-pal');
      const topLan = state.players.player.battleZone.find((c) => c.instanceId === 'h-lan');
      assert.equal(topLan.evolvedOn.length, 1);
      assert.equal(topLan.evolvedOn[0].evolvedOn.length, 1);

      const destroyedAll = destroyCreature(state, 'h-lan');
      assert.equal(destroyedAll.players.player.battleZone.length, 0);
      assert.equal(destroyedAll.players.player.graveyard.length, 3);

      // 3b. Soul Phoenix on [Kip Chippotto (Fire Bird)] + [Super Terradragon Bailas Gale -> Terradragon Gamiratar (Earth Dragon)]:
      // When Soul Phoenix leaves BZ, ONLY Soul Phoenix enters graveyard; Bailas Gale retains nested Gamiratar and original summonedTurn!
      const kip = findCard('Kip Chippotto');
      const gamiratar = findCard('Terradragon Gamiratar');
      const bailasGale = findCard('Super Terradragon Bailas Gale');
      let phoenixBaseState = createBaseState({
        turn: 5,
        players: {
          player: {
            hand: [makeCard(bailasGale, 'player', 'h-bg'), makeCard(soulPhoenix, 'player', 'h-phoenix')],
            battleZone: [
              makeCreature(kip, 'player', 'bz-kip', { summonedTurn: 2 }),
              makeCreature(gamiratar, 'player', 'bz-gami', { summonedTurn: 2 })
            ],
            manaZone: [
              makeMana(bailasGale, 'mn1'),
              makeMana(bailasGale, 'mn2'),
              makeMana(bailasGale, 'mn3'),
              makeMana(bailasGale, 'mn4'),
              makeMana(bailasGale, 'mn5'),
              makeMana(soulPhoenix, 'mf1'),
              makeMana(soulPhoenix, 'mf2'),
              makeMana(soulPhoenix, 'mf3'),
              makeMana(soulPhoenix, 'mf4')
            ]
          }
        }
      });
      phoenixBaseState = summonCreature(phoenixBaseState, 'player', 'h-bg', 'bz-gami');
      const phoenixState = summonCreature(phoenixBaseState, 'player', 'h-phoenix', ['bz-kip', 'h-bg']);

      const afterPhoenixLeaves = destroyCreature(phoenixState, 'h-phoenix');
      assert.equal(afterPhoenixLeaves.players.player.graveyard.map((g) => g.instanceId).join(','), 'h-phoenix');
      assert.equal(afterPhoenixLeaves.players.player.battleZone.length, 2);
      const restoredBailas = afterPhoenixLeaves.players.player.battleZone.find((c) => c.instanceId === 'h-bg');
      assert.equal(restoredBailas.evolvedOn.length, 1, 'Bailas Gale kept nested Gamiratar under Phoenix separation');
    });

    it('Rule 4: prompts human player at start of turn for tapped Silent Skill creatures before untap & draw', () => {
      const milporo = findCard('Milporo');
      const vorg = findCard('Immortal Baron, Vorg');

      const base = createBaseState({
        interactiveHuman: true,
        activePlayer: 'opponent',
        turn: 2,
        players: {
          player: {
            battleZone: [makeCreature(milporo, 'player', 'bz-milp', { isTapped: true })],
            manaZone: [makeMana(vorg, 'pm1', true)]
          }
        }
      });

      const afterEnd = endTurn(base);
      assert.equal(afterEnd.activePlayer, 'player');
      assert.equal(afterEnd.phase, 'START_OF_TURN');
      assert.equal(afterEnd.pendingInteraction?.type, 'SILENT_SKILL_CHOICE');

      // Accept Silent Skill: Milporo stays tapped, draws 1 from Silent Skill + 1 from turn draw (+2 deck change), mana untaps
      const handBefore = afterEnd.players.player.hand.length;
      const accepted = step(afterEnd, { type: 'RESOLVE_SILENT_SKILL_CHOICE', player: 'player', activate: true });
      assert.equal(accepted.phase, 'MANA_CHARGE');
      assert.equal(accepted.players.player.battleZone.find((c) => c.instanceId === 'bz-milp').isTapped, true);
      assert.equal(accepted.players.player.hand.length, handBefore + 2);
      assert.equal(accepted.players.player.manaZone[0].isTapped, false);

      // Decline Silent Skill: Milporo untaps normally, draws only 1 turn card
      const declined = step(afterEnd, { type: 'RESOLVE_SILENT_SKILL_CHOICE', player: 'player', activate: false });
      assert.equal(declined.phase, 'MANA_CHARGE');
      assert.equal(declined.players.player.battleZone.find((c) => c.instanceId === 'bz-milp').isTapped, false);
      assert.equal(declined.players.player.hand.length, handBefore + 1);
    });

    it('Rule 5: offers both Attack and $tap Ability options cleanly while respecting summoning sickness', () => {
      const kipo = findCard("Kipo's Contraption");
      const lizard = findCard('Legionnaire Lizard');
      const traRion = findCard('Tra Rion, Penumbra Guardian');
      const vorg = findCard('Immortal Baron, Vorg');

      // Summoning sickness check: non-SA creature cannot use $tap same turn; SA Legionnaire Lizard CAN!
      const sickState = createBaseState({
        interactiveHuman: true,
        phase: 'ATTACK',
        turn: 4,
        players: {
          player: {
            battleZone: [
              makeCreature(kipo, 'player', 'bz-kipo-sick', { summonedTurn: 4 }),
              makeCreature(lizard, 'player', 'bz-lizard-sa', { summonedTurn: 4 }),
              makeCreature(traRion, 'player', 'bz-trarion', { summonedTurn: 2 })
            ]
          },
          opponent: {
            battleZone: [makeCreature(vorg, 'opponent', 'opp-vorg')]
          }
        }
      });

      assert.equal(canActivateTapAbility(sickState, sickState.players.player.battleZone[0], 'player').valid, false);
      assert.equal(canActivateTapAbility(sickState, sickState.players.player.battleZone[1], 'player').valid, true);

      // Kipo's Contraption summoned on earlier turn can EITHER Attack OR use $tap ability
      const readyState = {
        ...sickState,
        players: {
          ...sickState.players,
          player: {
            ...sickState.players.player,
            battleZone: [
              makeCreature(kipo, 'player', 'bz-kipo-ready', { summonedTurn: 2 }),
              makeCreature(traRion, 'player', 'bz-trarion', { summonedTurn: 2 })
            ]
          }
        }
      };

      // Option A: Declare Attack
      const attacked = step(readyState, {
        type: 'DECLARE_ATTACK',
        player: 'player',
        attackerInstanceId: 'bz-kipo-ready',
        target: { type: 'shield', index: 0, indices: [0] }
      });
      assert.equal(attacked.players.player.battleZone.find((c) => c.instanceId === 'bz-kipo-ready').isTapped, true);

      // Option B: Activate $tap Ability (Kipo's Contraption -> interactive opponent <=2000 target choice)
      let tappedAbility = step(readyState, {
        type: 'ACTIVATE_TAP_ABILITY',
        player: 'player',
        creatureInstanceId: 'bz-kipo-ready'
      });
      assert.equal(tappedAbility.pendingInteraction?.actionKind, 'OPPONENT_SACRIFICE_BZ');
      tappedAbility = step(tappedAbility, {
        type: 'RESOLVE_ZONE_SELECTION',
        player: 'player',
        selectedIds: ['opp-vorg']
      });
      assert.equal(tappedAbility.players.opponent.battleZone.length, 0);
      assert.equal(tappedAbility.players.player.battleZone.find((c) => c.instanceId === 'bz-kipo-ready').isTapped, true);

      // Tra Rion $tap Choose-a-race -> EOT untap all creatures of that race
      let raceState = step(tappedAbility, {
        type: 'ACTIVATE_TAP_ABILITY',
        player: 'player',
        creatureInstanceId: 'bz-trarion'
      });
      assert.equal(raceState.pendingInteraction?.actionKind, 'TAP_CHOOSE_RACE');
      raceState = step(raceState, {
        type: 'RESOLVE_ZONE_SELECTION',
        player: 'player',
        selectedIds: [],
        selectedRace: 'Guardian' // Tra Rion's own race!
      });
      const ended = step(raceState, { type: 'END_TURN', player: 'player' });
      assert.equal(ended.pendingInteraction?.effectType, 'UNTAP_ALL_EOT');
      const eotAccepted = step(ended, { type: 'RESOLVE_OPTIONAL_CHOICE', player: 'player', accept: true });
      assert.equal(eotAccepted.players.player.battleZone.find((c) => c.instanceId === 'bz-trarion').isTapped, false);
    });
  });
});
