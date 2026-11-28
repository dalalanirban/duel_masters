import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CARD_LIST } from '../../data/cardLoader.ts';
import { initializeGame, createCardInstance } from '../state.ts';
import { step } from '../reducer.ts';
import { resolveSpellEffect } from '../spells.ts';
import { getSpellTargetRequirement } from '../targeting.ts';
import { triggerCIP, triggerAttack, triggerEndTurn } from '../triggers.ts';
import { getCreatureEffectivePower, canCreatureAttack, canBeBlockedBy } from '../continuous.ts';
import { CARD_EFFECT_REGISTRY } from '../cardEffectRegistry.ts';

function cardByName(name) {
  const c = CARD_LIST.find((x) => x.name.trim().toLowerCase() === name.trim().toLowerCase());
  assert.ok(c, `Missing card ${name}`);
  return c;
}

function makeBaseState(overrides = {}) {
  const deckA = { id: 's3-a', name: 'A', items: CARD_LIST.slice(0, 10).map((c) => ({ card: c, count: 4 })), updatedAt: 1 };
  const deckB = { id: 's3-b', name: 'B', items: CARD_LIST.slice(10, 20).map((c) => ({ card: c, count: 4 })), updatedAt: 1 };
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

function bzCard(cardOrName, owner, instanceId, overrides = {}) {
  const card = typeof cardOrName === 'string' ? cardByName(cardOrName) : cardOrName;
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

function manaCard(cardOrName, owner, instanceId, isTapped = false) {
  const card = typeof cardOrName === 'string' ? cardByName(cardOrName) : cardOrName;
  return { instanceId, card, owner, isTapped };
}

function shieldItem(cardOrName, id, owner = 'player') {
  const card = typeof cardOrName === 'string' ? cardByName(cardOrName) : cardOrName;
  return { id, shieldId: id, card, owner, isBroken: false };
}

function drain(state, pickFirst = true) {
  let s = state;
  let guard = 0;
  while (s.pendingInteraction && guard < 16) {
    guard++;
    const inter = s.pendingInteraction;
    if (inter.type === 'ZONE_SELECTION') {
      if (
        inter.actionKind === 'SPELL_CHOOSE_RACE' ||
        inter.actionKind === 'CIP_CHOOSE_RACE' ||
        inter.actionKind === 'CHOOSE_NUMBER' ||
        inter.actionKind === 'TAP_CHOOSE_RACE'
      ) {
        s = step(s, {
          type: 'RESOLVE_ZONE_SELECTION',
          player: inter.player,
          selectedIds: [],
          selectedRace: inter.raceOptions?.[0]
        });
      } else {
        const n = inter.maxSelections > 0 ? Math.min(inter.maxSelections, inter.options.length) : 0;
        const picked = pickFirst ? inter.options.slice(0, n).map((o) => o.instanceId) : [];
        s = step(s, {
          type: 'RESOLVE_ZONE_SELECTION',
          player: inter.player,
          selectedIds: picked
        });
      }
    } else if (inter.type === 'OPTIONAL_CHOICE') {
      s = step(s, { type: 'RESOLVE_OPTIONAL_CHOICE', player: inter.player, accept: pickFirst });
    } else if (inter.type === 'DECK_SEARCH') {
      s = step(s, {
        type: 'RESOLVE_DECK_SEARCH',
        player: inter.player,
        selectedCardInstanceId: pickFirst ? inter.validCardInstanceIds[0] ?? null : null
      });
    } else if (inter.type === 'SHIELD_TRIGGER_RESOLUTION') {
      s = step(s, {
        type: 'RESOLVE_SHIELD_TRIGGER',
        player: inter.player,
        shieldId: inter.triggers[0].shieldId,
        activate: false
      });
    } else {
      break;
    }
  }
  assert.equal(s.pendingInteraction, null, 'Expected all interactions to drain');
  return s;
}

describe('Sprint 3: Hybrid Card Effect Registry Contracts', () => {
  it('verifies every key in CARD_EFFECT_REGISTRY resolves cleanly', () => {
    assert.ok(CARD_EFFECT_REGISTRY.size >= 100, `Expected >= 100 registered effects, got ${CARD_EFFECT_REGISTRY.size}`);
  });

  describe('1. Signature Transform & Multi-Step Spells', () => {
    it('Soulswap puts target BZ creature into owner mana, then deploys non-evo creature <= mana count & fires CIP', () => {
      const vorg = bzCard('Immortal Baron, Vorg', 'player', 'p-vorg');
      const bronzeMana = manaCard('Bronze-Arm Tribe', 'player', 'p-mana-bat');
      const aquaMana = manaCard('Aqua Hulcus', 'player', 'p-mana-hulcus');
      const state = makeBaseState({
        interactiveHuman: true,
        players: {
          player: {
            battleZone: [vorg],
            manaZone: [bronzeMana, aquaMana],
            deck: [createCardInstance(cardByName('Bolshack Dragon'), 'player')]
          }
        }
      });

      const s1 = resolveSpellEffect(state, 'player', cardByName('Soulswap'));
      assert.equal(s1.pendingInteraction?.type, 'ZONE_SELECTION');
      assert.equal(s1.pendingInteraction?.actionKind, 'SOULSWAP_BZ_TO_MANA');

      const s2 = step(s1, { type: 'RESOLVE_ZONE_SELECTION', player: 'player', selectedIds: ['p-vorg'] });
      assert.equal(s2.players.player.battleZone.length, 0);
      assert.equal(s2.players.player.manaZone.length, 3);
      assert.equal(s2.pendingInteraction?.actionKind, 'SOULSWAP_MANA_TO_BZ');

      const s3 = step(s2, { type: 'RESOLVE_ZONE_SELECTION', player: 'player', selectedIds: ['p-mana-hulcus'] });
      assert.equal(s3.players.player.battleZone.length, 1);
      assert.equal(s3.players.player.battleZone[0].card.name, 'Aqua Hulcus');
      assert.equal(s3.pendingInteraction?.type, 'OPTIONAL_CHOICE');
      const s4 = step(s3, { type: 'RESOLVE_OPTIONAL_CHOICE', player: 'player', accept: true });
      assert.equal(s4.players.player.hand.length, 1, 'Aqua Hulcus CIP drew 1 card');
    });

    it('Transmogrify destroys creature, mills non-matches, deploys top non-evo creature & triggers its CIP', () => {
      const oppTarget = bzCard('Immortal Baron, Vorg', 'opponent', 'o-vorg');
      const spellTop = createCardInstance(cardByName('Holy Awe'), 'opponent');
      const evoTop = createCardInstance(cardByName('Crystal Paladin'), 'opponent');
      const hulcus = createCardInstance(cardByName('Aqua Hulcus'), 'opponent');
      const spare = createCardInstance(cardByName('Terror Pit'), 'opponent');
      const state = makeBaseState({
        players: {
          opponent: {
            battleZone: [oppTarget],
            deck: [spellTop, evoTop, hulcus, spare]
          }
        }
      });

      const after = resolveSpellEffect(state, 'player', cardByName('Transmogrify'), ['o-vorg']);
      assert.equal(after.players.opponent.battleZone.length, 1);
      assert.equal(after.players.opponent.battleZone[0].card.name, 'Aqua Hulcus');
      assert.equal(after.players.opponent.graveyard.length, 3, 'Destroyed target + 2 milled cards');
      assert.equal(after.players.opponent.hand.length, 1, 'Revealed Aqua Hulcus fired CIP draw');
    });

    it('Upheaval swaps mana to hand and hand to mana TAPPED simultaneously for both players', () => {
      const state = makeBaseState({
        players: {
          player: {
            hand: [createCardInstance(cardByName('Terror Pit'), 'player')],
            manaZone: [manaCard('Bronze-Arm Tribe', 'player', 'pm1'), manaCard('Aqua Hulcus', 'player', 'pm2')]
          },
          opponent: {
            hand: [createCardInstance(cardByName('Holy Awe'), 'opponent'), createCardInstance(cardByName('Faerie Life'), 'opponent')],
            manaZone: [manaCard('Immortal Baron, Vorg', 'opponent', 'om1')]
          }
        }
      });

      const after = resolveSpellEffect(state, 'player', cardByName('Upheaval'));
      assert.equal(after.players.player.hand.length, 2);
      assert.equal(after.players.player.manaZone.length, 1);
      assert.equal(after.players.player.manaZone[0].isTapped, true);
      assert.equal(after.players.opponent.hand.length, 1);
      assert.equal(after.players.opponent.manaZone.length, 2);
      assert.ok(after.players.opponent.manaZone.every((m) => m.isTapped));
    });

    it('Rapid Reincarnation sacrifices friendly creature and puts creature <= mana count into play', () => {
      const vorg = bzCard('Immortal Baron, Vorg', 'player', 'p-vorg');
      const hulkHand = createCardInstance(cardByName('Aqua Hulcus'), 'player');
      const state = makeBaseState({
        players: {
          player: {
            battleZone: [vorg],
            hand: [hulkHand],
            manaZone: [
              manaCard('Bronze-Arm Tribe', 'player', 'm1'),
              manaCard('Bronze-Arm Tribe', 'player', 'm2'),
              manaCard('Bronze-Arm Tribe', 'player', 'm3')
            ],
            deck: [createCardInstance(cardByName('Holy Awe'), 'player')]
          }
        }
      });

      const after = resolveSpellEffect(state, 'player', cardByName('Rapid Reincarnation'), ['p-vorg', hulkHand.instanceId]);
      assert.equal(after.players.player.graveyard.length, 1);
      assert.equal(after.players.player.battleZone.length, 1);
      assert.equal(after.players.player.battleZone[0].card.name, 'Aqua Hulcus');
      assert.equal(after.players.player.hand.length, 1, 'Aqua Hulcus CIP drew 1 card');
    });

    it('Static Warp keeps 1 creature per side and taps all others; Siren Concerto & Eldritch Poison swap properly', () => {
      const state = makeBaseState({
        players: {
          player: {
            battleZone: [
              bzCard('La Ura Giga, Sky Guardian', 'player', 'p1'),
              bzCard('Bloody Squito', 'player', 'p2')
            ],
            manaZone: [manaCard('Bronze-Arm Tribe', 'player', 'pm1')],
            hand: [createCardInstance(cardByName('Holy Awe'), 'player')]
          },
          opponent: {
            battleZone: [
              bzCard('Immortal Baron, Vorg', 'opponent', 'o1'),
              bzCard('Bolshack Dragon', 'opponent', 'o2')
            ]
          }
        }
      });

      const warped = resolveSpellEffect(state, 'player', cardByName('Static Warp'), ['p1']);
      assert.equal(warped.players.player.battleZone.filter((c) => !c.isTapped).length, 1);
      assert.equal(warped.players.player.battleZone.find((c) => c.instanceId === 'p1')?.isTapped, false);
      assert.equal(warped.players.opponent.battleZone.filter((c) => !c.isTapped).length, 1);

      const concerto = resolveSpellEffect(state, 'player', cardByName('Siren Concerto'));
      assert.equal(concerto.players.player.hand[0].card.name, 'Bronze-Arm Tribe');
      assert.equal(concerto.players.player.manaZone[0].card.name, 'Holy Awe');

      const poisoned = resolveSpellEffect(state, 'player', cardByName('Eldritch Poison'), ['p2', 'pm1']);
      assert.equal(poisoned.players.player.graveyard[0].card.name, 'Bloody Squito');
      assert.equal(poisoned.players.player.hand.some((c) => c.card.name === 'Bronze-Arm Tribe'), true);
    });

    it('Live and Breathe deploys same-name creature from deck on summon and fires CIP', () => {
      const hulcusHand = createCardInstance(cardByName('Aqua Hulcus'), 'player');
      const hulcusDeck = createCardInstance(cardByName('Aqua Hulcus'), 'player');
      const draw1 = createCardInstance(cardByName('Holy Awe'), 'player');
      const draw2 = createCardInstance(cardByName('Terror Pit'), 'player');
      const state = makeBaseState({
        players: {
          player: {
            hand: [hulcusHand],
            manaZone: [
              manaCard('Aqua Hulcus', 'player', 'm1'),
              manaCard('Aqua Hulcus', 'player', 'm2'),
              manaCard('Aqua Hulcus', 'player', 'm3')
            ],
            deck: [draw1, draw2, hulcusDeck]
          }
        }
      });

      const primed = resolveSpellEffect(state, 'player', cardByName('Live and Breathe'));
      assert.equal(primed.players.player.tempLiveAndBreatheCount, 1);

      const afterSummon = step(primed, {
        type: 'SUMMON_CREATURE',
        player: 'player',
        cardInstanceId: hulcusHand.instanceId
      });
      assert.equal(afterSummon.players.player.battleZone.length, 2);
      assert.equal(afterSummon.players.player.hand.length, 2, 'Both summoned and searched Aqua Hulcus drew cards');
    });

    it('Cosmic Darts casts Spell shield for free and keeps non-Spell shield untouched', () => {
      const withSpell = makeBaseState({
        players: {
          player: { shields: [shieldItem('Holy Awe', 's-awe', 'player')] },
          opponent: { battleZone: [bzCard('Immortal Baron, Vorg', 'opponent', 'ov')] }
        }
      });
      const castRes = resolveSpellEffect(withSpell, 'player', cardByName('Cosmic Darts'), ['s-awe']);
      assert.equal(castRes.players.opponent.battleZone[0].isTapped, true, 'Free Holy Awe tapped opponent');
      assert.equal(castRes.players.player.shields.length, 0);
      assert.equal(castRes.players.player.graveyard.length, 1);

      const withCreature = makeBaseState({
        players: {
          player: { shields: [shieldItem('Bolshack Dragon', 's-drg', 'player')] }
        }
      });
      const keepRes = resolveSpellEffect(withCreature, 'player', cardByName('Cosmic Darts'), ['s-drg']);
      assert.equal(keepRes.players.player.shields.length, 1, 'Non-spell shield returns to shields');
    });

    it("Pangaea's Will and Pouch Shell peel only the top evolution card into mana / graveyard", () => {
      const bait = createCardInstance(cardByName('Locomotiver'), 'opponent');
      const ballom = bzCard('Ballom, Master of Death', 'opponent', 'o-ballom', { evolvedOn: [bait], isTapped: true });
      const base = makeBaseState({
        players: { opponent: { battleZone: [ballom] } }
      });

      const pangaeaRes = resolveSpellEffect(base, 'player', cardByName("Pangaea's Will"), ['o-ballom']);
      assert.equal(pangaeaRes.players.opponent.battleZone[0].card.name, 'Locomotiver');
      assert.equal(pangaeaRes.players.opponent.battleZone[0].isTapped, true);
      assert.equal(pangaeaRes.players.opponent.manaZone[0].card.name, 'Ballom, Master of Death');

      const pouchRes = triggerCIP(base, 'player', bzCard('Pouch Shell', 'player', 'p-pouch'), ['o-ballom']);
      assert.equal(pouchRes.players.opponent.battleZone[0].card.name, 'Locomotiver');
      assert.equal(pouchRes.players.opponent.graveyard[0].card.name, 'Ballom, Master of Death');
    });
  });

  describe('2. Cloned Spells, Choice Spells, and Resource Manipulation Spells', () => {
    it('scales Cloned Deflector, Cloned Spiral, Cloned Nightmare, and Cloned Blade by copies across BOTH graveyards', () => {
      const cDef = cardByName('Cloned Deflector');
      const cSpi = cardByName('Cloned Spiral');
      const cNig = cardByName('Cloned Nightmare');
      const cBla = cardByName('Cloned Blade');

      const state = makeBaseState({
        players: {
          player: {
            graveyard: [
              createCardInstance(cDef, 'player'),
              createCardInstance(cSpi, 'player'),
              createCardInstance(cNig, 'player'),
              createCardInstance(cBla, 'player')
            ]
          },
          opponent: {
            graveyard: [
              createCardInstance(cDef, 'opponent'),
              createCardInstance(cSpi, 'opponent'),
              createCardInstance(cNig, 'opponent'),
              createCardInstance(cBla, 'opponent')
            ],
            battleZone: [
              bzCard('Immortal Baron, Vorg', 'opponent', 'o1'),
              bzCard('Aqua Hulcus', 'opponent', 'o2'),
              bzCard('La Ura Giga, Sky Guardian', 'opponent', 'o3')
            ],
            hand: [
              createCardInstance(cardByName('Holy Awe'), 'opponent'),
              createCardInstance(cardByName('Terror Pit'), 'opponent'),
              createCardInstance(cardByName('Spiral Gate'), 'opponent')
            ]
          }
        }
      });

      assert.equal(getSpellTargetRequirement(cBla, state, 'player').maxTargets, 3);

      const sDef = resolveSpellEffect(state, 'player', cDef);
      assert.equal(sDef.players.opponent.battleZone.filter((c) => c.isTapped).length, 3);

      const sSpi = resolveSpellEffect(state, 'player', cSpi);
      assert.equal(sSpi.players.opponent.battleZone.length, 0);

      const sNig = resolveSpellEffect(state, 'player', cNig);
      assert.equal(sNig.players.opponent.hand.length, 0);

      const sBla = resolveSpellEffect(state, 'player', cBla);
      assert.equal(sBla.players.opponent.battleZone.length, 0);
    });

    it("Mechadragon's Breath and Roulette of Ruin interactively prompt and resolve chosen numbers", () => {
      const mState = makeBaseState({
        interactiveHuman: true,
        players: {
          player: { battleZone: [bzCard('Telitol, the Explorer', 'player', 'p-3k')] },
          opponent: {
            battleZone: [
              bzCard('Immortal Baron, Vorg', 'opponent', 'o-2k'),
              bzCard('Aqua Hulcus', 'opponent', 'o-2k-2'),
              bzCard('Bolshack Dragon', 'opponent', 'o-6k')
            ]
          }
        }
      });
      const mPrompt = resolveSpellEffect(mState, 'player', cardByName("Mechadragon's Breath"));
      assert.equal(mPrompt.pendingInteraction?.actionKind, 'CHOOSE_NUMBER');
      const mDone = step(mPrompt, { type: 'RESOLVE_ZONE_SELECTION', player: 'player', selectedIds: [], selectedRace: '2000' });
      assert.equal(mDone.players.opponent.battleZone.length, 1);
      assert.equal(mDone.players.opponent.battleZone[0].card.name, 'Bolshack Dragon');

      const rState = makeBaseState({
        interactiveHuman: true,
        players: {
          player: {
            hand: [
              createCardInstance(cardByName('Spiral Gate'), 'player'),
              createCardInstance(cardByName('Terror Pit'), 'player')
            ]
          },
          opponent: {
            hand: [
              createCardInstance(cardByName('Faerie Life'), 'opponent'),
              createCardInstance(cardByName('Spiral Gate'), 'opponent')
            ]
          }
        }
      });
      const rPrompt = resolveSpellEffect(rState, 'player', cardByName('Roulette of Ruin'));
      const rDone = step(rPrompt, { type: 'RESOLVE_ZONE_SELECTION', player: 'player', selectedIds: [], selectedRace: '2' });
      assert.equal(rDone.players.player.hand.length, 1);
      assert.equal(rDone.players.opponent.hand.length, 0);
    });

    it('Sword of Malevolent Death & Sword of Benevolent Life compute mana/creature combat buffs cleanly', () => {
      const attacker = bzCard('Immortal Baron, Vorg', 'player', 'att');
      const lightAlly = bzCard('La Ura Giga, Sky Guardian', 'player', 'light');
      const state = makeBaseState({
        players: {
          player: {
            battleZone: [attacker, lightAlly],
            manaZone: [
              manaCard('Terror Pit', 'player', 'dm1'),
              manaCard('Terror Pit', 'player', 'dm2')
            ]
          }
        }
      });
      const sDark = resolveSpellEffect(state, 'player', cardByName('Sword of Malevolent Death'));
      assert.equal(
        getCreatureEffectivePower(sDark.players.player.battleZone[0], true, sDark.players.player, sDark.players.opponent, false, sDark),
        4000
      );
      const sAfterEot = triggerEndTurn(sDark, 'player');
      assert.equal(
        getCreatureEffectivePower(sAfterEot.players.player.battleZone[0], true, sAfterEot.players.player, sAfterEot.players.opponent, false, sAfterEot),
        2000
      );

      const sLight = resolveSpellEffect(state, 'player', cardByName('Sword of Benevolent Life'));
      assert.equal(
        getCreatureEffectivePower(sLight.players.player.battleZone[0], false, sLight.players.player, sLight.players.opponent, false, sLight),
        3000
      );
    });

    it('Relentless Blitz & Dance of the Sproutlings execute race choices', () => {
      const vorg = bzCard('Immortal Baron, Vorg', 'player', 'p-vorg');
      const untappedDef = bzCard('Aqua Hulcus', 'opponent', 'o-hulk');
      const blocker = bzCard('Senatine Jade Tree', 'opponent', 'o-blk');
      const base = makeBaseState({
        players: {
          player: {
            battleZone: [vorg],
            hand: [
              createCardInstance(cardByName('Mini Titan Gett'), 'player'),
              createCardInstance(cardByName('Holy Awe'), 'player')
            ]
          },
          opponent: { battleZone: [untappedDef, blocker] }
        }
      });

      const blitz = resolveSpellEffect(base, 'player', cardByName('Relentless Blitz'), ['Human']);
      assert.equal(
        canCreatureAttack(blitz, blitz.players.player.battleZone[0], { type: 'creature', instanceId: 'o-hulk' }, 'player').valid,
        true
      );
      assert.equal(
        canBeBlockedBy(blitz.players.player.battleZone[0], blocker, { type: 'creature', instanceId: 'o-hulk' }, blitz),
        false
      );

      const dance = resolveSpellEffect(base, 'player', cardByName('Dance of the Sproutlings'), ['Human']);
      assert.equal(dance.players.player.manaZone.length, 1);
      assert.equal(dance.players.player.hand.length, 1);
    });

    it('covers Divine Riptide, Cyclone Panic, Invincible Technology, Future Slash, Slash Charger, Shock Hurricane, Intense Evil, Darkpact, Mega Detonator, Ghastly Drain, Aurora of Reversal, Miraculous Plague, Scheming Hands, Recon Operation, Liquid Scope', () => {
      const deckCards = () =>
        Array.from({ length: 8 }, (_, i) => createCardInstance(cardByName(i % 2 === 0 ? 'Holy Awe' : 'Terror Pit'), 'player'));
      const oppDeckCards = () =>
        Array.from({ length: 8 }, (_, i) => createCardInstance(cardByName(i % 2 === 0 ? 'Bolshack Dragon' : 'Aqua Hulcus'), 'opponent'));

      const state = makeBaseState({
        players: {
          player: {
            hand: [createCardInstance(cardByName('Holy Awe'), 'player'), createCardInstance(cardByName('Terror Pit'), 'player')],
            manaZone: [manaCard('Bronze-Arm Tribe', 'player', 'pm1'), manaCard('Aqua Hulcus', 'player', 'pm2')],
            battleZone: [bzCard('Immortal Baron, Vorg', 'player', 'p1'), bzCard('La Ura Giga, Sky Guardian', 'player', 'p2')],
            shields: [shieldItem('Terror Pit', 'ps1', 'player'), shieldItem('Holy Awe', 'ps2', 'player')],
            deck: deckCards()
          },
          opponent: {
            hand: [createCardInstance(cardByName('Bolshack Dragon'), 'opponent'), createCardInstance(cardByName('Aqua Hulcus'), 'opponent')],
            manaZone: [manaCard('Holy Awe', 'opponent', 'om1'), manaCard('Terror Pit', 'opponent', 'om2')],
            battleZone: [bzCard('Immortal Baron, Vorg', 'opponent', 'o1'), bzCard('Aqua Hulcus', 'opponent', 'o2')],
            shields: [shieldItem('Holy Awe', 'os1', 'opponent'), shieldItem('Terror Pit', 'os2', 'opponent')],
            deck: oppDeckCards()
          }
        }
      });

      assert.equal(resolveSpellEffect(state, 'player', cardByName('Divine Riptide')).players.player.hand.length, 4);
      assert.equal(resolveSpellEffect(state, 'player', cardByName('Cyclone Panic')).players.player.hand.length, 2);
      assert.equal(resolveSpellEffect(state, 'player', cardByName('Invincible Technology')).players.player.hand.length, 5);
      assert.equal(resolveSpellEffect(state, 'player', cardByName('Future Slash')).players.opponent.graveyard.length, 2);
      assert.equal(resolveSpellEffect(state, 'player', cardByName('Slash Charger')).players.opponent.graveyard.length, 1);

      const shock = resolveSpellEffect(state, 'player', cardByName('Shock Hurricane'), ['p1', 'o1']);
      assert.equal(shock.players.player.battleZone.length, 1);
      assert.equal(shock.players.opponent.battleZone.length, 1);

      const intense = resolveSpellEffect(state, 'player', cardByName('Intense Evil'), ['p1', 'p2']);
      assert.equal(intense.players.player.battleZone.length, 0);
      assert.equal(intense.players.player.hand.length, 4);

      const darkpact = resolveSpellEffect(state, 'player', cardByName('Darkpact'), ['pm1', 'pm2']);
      assert.equal(darkpact.players.player.manaZone.length, 0);
      assert.equal(darkpact.players.player.hand.length, 4);

      const mega = resolveSpellEffect(state, 'player', cardByName('Mega Detonator'));
      assert.equal(mega.players.player.battleZone[0].tempDoubleBreaker, true);

      const ghastly = resolveSpellEffect(state, 'player', cardByName('Ghastly Drain'), ['ps1']);
      assert.equal(ghastly.pendingInteraction, null, 'Ghastly Drain disables Shield Trigger');
      assert.equal(ghastly.players.player.shields.length, 1);

      const aurora = resolveSpellEffect(state, 'player', cardByName('Aurora of Reversal'), ['ps1']);
      assert.equal(aurora.players.player.manaZone.length, 3);

      const plague = resolveSpellEffect(state, 'player', cardByName('Miraculous Plague'));
      assert.equal(plague.players.opponent.battleZone.length, 0);
      assert.equal(plague.players.opponent.manaZone.length, 0);

      const scheming = resolveSpellEffect(state, 'player', cardByName('Scheming Hands'));
      assert.equal(scheming.players.opponent.graveyard[0].card.name, 'Bolshack Dragon');

      const recon = resolveSpellEffect(state, 'player', cardByName('Recon Operation'));
      assert.ok(recon.actionLog.at(-1)?.includes('looked at'));

      const scope = resolveSpellEffect(state, 'player', cardByName('Liquid Scope'));
      assert.ok(scope.actionLog.at(-1)?.includes('shields'));
    });
  });

  describe('3. Newly Fixed CIP Creatures, Board Watchers, Boss Triggers, and Laguna On-Attack', () => {
    it('Bombazar, Dragon of Destiny destroys other 6000-power creatures and causes loss at end of extra turn', () => {
      const bomb = bzCard('Bombazar, Dragon of Destiny', 'player', 'p-bomb');
      const opp6k = bzCard('Bolshack Dragon', 'opponent', 'o-6k');
      const opp2k = bzCard('Immortal Baron, Vorg', 'opponent', 'o-2k');
      const state = makeBaseState({
        players: {
          player: {
            battleZone: [bomb],
            deck: [createCardInstance(cardByName('Holy Awe'), 'player'), createCardInstance(cardByName('Terror Pit'), 'player')]
          },
          opponent: {
            battleZone: [opp6k, opp2k],
            deck: [createCardInstance(cardByName('Holy Awe'), 'opponent')]
          }
        }
      });

      const afterCip = triggerCIP(state, 'player', bomb);
      assert.equal(afterCip.players.player.battleZone.length, 1, 'Bombazar survives its own effect');
      assert.equal(afterCip.players.opponent.battleZone.length, 1);
      assert.equal(afterCip.players.opponent.battleZone[0].card.name, 'Immortal Baron, Vorg');
      assert.equal(afterCip.extraTurnPlayer, 'player');

      const startExtraTurn = step(afterCip, { type: 'END_TURN', player: 'player' });
      assert.equal(startExtraTurn.activePlayer, 'player');
      assert.equal(startExtraTurn.loseAtEndOfTurn, 'player');

      const afterExtraEnd = step(startExtraTurn, { type: 'END_TURN', player: 'player' });
      assert.equal(afterExtraEnd.winner, 'opponent', 'Bombazar controller loses at end of extra turn');
    });

    it('Punch Trooper Bronks destroys lowest creature and resolves ties interactively', () => {
      const state = makeBaseState({
        interactiveHuman: true,
        players: {
          player: { battleZone: [bzCard('Telitol, the Explorer', 'player', 'p-3k'), bzCard('Immortal Baron, Vorg', 'player', 'p-2k')] },
          opponent: { battleZone: [bzCard('Aqua Hulcus', 'opponent', 'o-2k')] }
        }
      });
      const bronks = bzCard('Punch Trooper Bronks', 'player', 'p-bronks');
      const tied = triggerCIP(state, 'player', bronks);
      assert.equal(tied.pendingInteraction?.type, 'ZONE_SELECTION');
      const resolved = step(tied, { type: 'RESOLVE_ZONE_SELECTION', player: 'player', selectedIds: ['o-2k'] });
      assert.equal(resolved.players.opponent.battleZone.length, 0);
      assert.equal(resolved.players.player.battleZone.length, 2);
    });

    it('Petrova grants +4000 to chosen race and King Aquakamui grants +2000 to Angel/Demon Commands', () => {
      const angel = bzCard('Urth, Purifying Elemental', 'player', 'p-urth');
      const petrova = bzCard('Petrova, Channeler of Suns', 'player', 'p-petrova');
      const state = makeBaseState({
        interactiveHuman: true,
        players: {
          player: {
            battleZone: [angel, petrova],
            graveyard: [createCardInstance(cardByName('Dia Nork, Moonlight Guardian'), 'player')]
          }
        }
      });
      const prompt = triggerCIP(state, 'player', petrova);
      assert.equal(prompt.pendingInteraction?.actionKind, 'CIP_CHOOSE_RACE');
      assert.equal(prompt.pendingInteraction?.raceOptions?.some((r) => /mecha/i.test(r)), false);
      const afterPet = step(prompt, {
        type: 'RESOLVE_ZONE_SELECTION',
        player: 'player',
        selectedIds: [],
        selectedRace: 'Angel Command'
      });
      assert.equal(
        getCreatureEffectivePower(afterPet.players.player.battleZone[0], false, afterPet.players.player, afterPet.players.opponent, false, afterPet),
        10000
      );

      const aku = bzCard('King Aquakamui', 'player', 'p-aku');
      const withAku = triggerCIP(
        {
          ...afterPet,
          players: {
            ...afterPet.players,
            player: {
              ...afterPet.players.player,
              battleZone: [...afterPet.players.player.battleZone, aku],
              graveyard: [createCardInstance(cardByName('Urth, Purifying Elemental'), 'player')]
            }
          }
        },
        'player',
        aku
      );
      assert.equal(withAku.players.player.hand[0].card.name, 'Urth, Purifying Elemental');
      assert.equal(
        getCreatureEffectivePower(withAku.players.player.battleZone[0], false, withAku.players.player, withAku.players.opponent, false, withAku),
        12000
      );
    });

    it('Benzo / Uliya / Necrodragon Bryzenaga allow Shield Trigger while Baraga / Gigabuster / Ashura Fang / Trenchdive Shark suppress it', () => {
      const makeShieldState = (sh) =>
        makeBaseState({
          interactiveHuman: true,
          players: {
            player: {
              shields: [sh],
              hand: [createCardInstance(cardByName('Immortal Baron, Vorg'), 'player')]
            }
          }
        });

      const benzoS = makeShieldState(shieldItem('Terror Pit', 's-tp', 'player'));
      const b1 = triggerCIP(benzoS, 'player', bzCard('Benzo, the Hidden Fury', 'player', 'b'));
      const b2 = step(b1, { type: 'RESOLVE_ZONE_SELECTION', player: 'player', selectedIds: ['s-tp'] });
      assert.equal(b2.pendingInteraction?.type, 'SHIELD_TRIGGER_RESOLUTION', 'Benzo allows Shield Trigger');

      const uliyaS = makeShieldState(shieldItem('Holy Awe', 's-ha', 'player'));
      const u1 = triggerCIP(uliyaS, 'player', bzCard('Uliya, the Entrancer', 'player', 'u'));
      const u2 = step(u1, { type: 'RESOLVE_ZONE_SELECTION', player: 'player', selectedIds: ['s-ha'] });
      assert.equal(u2.pendingInteraction?.type, 'SHIELD_TRIGGER_RESOLUTION', 'Uliya allows Shield Trigger');

      const bryS = makeShieldState(shieldItem('Terror Pit', 's-bry', 'player'));
      const bryAfter = triggerCIP(bryS, 'player', bzCard('Necrodragon Bryzenaga', 'player', 'bry'));
      assert.equal(bryAfter.pendingInteraction?.type, 'SHIELD_TRIGGER_RESOLUTION');

      for (const noStName of ['Baraga, Blade of Gloom', 'Gigabuster', 'Three-Faced Ashura Fang']) {
        const s0 = makeShieldState(shieldItem('Terror Pit', 's-no', 'player'));
        const s1 = triggerCIP(s0, 'player', bzCard(noStName, 'player', 'c-no'));
        const s2 = step(s1, { type: 'RESOLVE_ZONE_SELECTION', player: 'player', selectedIds: ['s-no'] });
        assert.equal(s2.pendingInteraction, null, `${noStName} must NOT trigger Shield Trigger`);
      }

      const tS = makeBaseState({
        players: {
          player: {
            hand: [createCardInstance(cardByName('Immortal Baron, Vorg'), 'player')],
            shields: [shieldItem('Terror Pit', 's-ts', 'player')]
          }
        }
      });
      const tAfter = triggerCIP(tS, 'player', bzCard('Trenchdive Shark', 'player', 't'));
      assert.equal(tAfter.players.player.shields.length, 1);
      assert.equal(tAfter.players.player.hand[0].card.name, 'Terror Pit');
    });

    it('triggers remaining DM-01..DM-12 CIPs, summon watchers, partial-regex fixes, and Laguna On-Attack', () => {
      const emptyDeck = Array.from({ length: 12 }, (_, i) =>
        createCardInstance(
          cardByName(i === 0 ? 'Holy Awe' : i === 1 ? 'Terror Pit' : i === 2 ? 'Scissor Scarab' : i === 3 ? 'Whispering Totem' : 'Bronze-Arm Tribe'),
          'player'
        )
      );

      // Black Feather, Stinger Worm, Poison Worm, Gigaberos, Death Cruzer
      const bf = bzCard('Black Feather, Shadow of Rage', 'player', 'bf');
      assert.equal(
        triggerCIP(makeBaseState({ players: { player: { battleZone: [bf] } } }), 'player', bf).players.player.battleZone.length,
        0
      );
      const sw = bzCard('Stinger Worm', 'player', 'sw');
      assert.equal(
        triggerCIP(makeBaseState({ players: { player: { battleZone: [sw] } } }), 'player', sw).players.player.battleZone.length,
        0
      );
      const pw = bzCard('Poison Worm', 'player', 'pw');
      const pLight = bzCard('La Ura Giga, Sky Guardian', 'player', 'pl');
      assert.equal(
        triggerCIP(makeBaseState({ players: { player: { battleZone: [pw, pLight] } } }), 'player', pw).players.player.battleZone.length,
        1
      );
      const gbSolo = bzCard('Gigaberos', 'player', 'gb');
      assert.equal(
        triggerCIP(makeBaseState({ players: { player: { battleZone: [gbSolo] } } }), 'player', gbSolo).players.player.battleZone.length,
        0,
        'Solo Gigaberos destroys itself'
      );
      const gbFull = makeBaseState({
        players: {
          player: {
            battleZone: [
              bzCard('Gigaberos', 'player', 'gb'),
              bzCard('La Ura Giga, Sky Guardian', 'player', 'a1'),
              bzCard('Bronze-Arm Tribe', 'player', 'a2')
            ]
          }
        }
      });
      assert.equal(
        triggerCIP(gbFull, 'player', gbFull.players.player.battleZone[0]).players.player.battleZone.length,
        1
      );
      const dc = bzCard('Death Cruzer, the Annihilator', 'player', 'dc');
      assert.equal(
        triggerCIP(
          makeBaseState({ players: { player: { battleZone: [dc, bzCard('La Ura Giga, Sky Guardian', 'player', 'x1')] } } }),
          'player',
          dc
        ).players.player.battleZone.length,
        1
      );

      // Artisan Picora, Onslaughter Triceps, Explosive Fighter Ucarn
      for (const [mCard, loseN] of [
        ['Artisan Picora', 1],
        ['Onslaughter Triceps', 1],
        ['Explosive Fighter Ucarn', 2]
      ]) {
        const s = makeBaseState({
          players: {
            player: {
              manaZone: [manaCard('Holy Awe', 'player', 'm1'), manaCard('Terror Pit', 'player', 'm2')]
            }
          }
        });
        const after = triggerCIP(s, 'player', bzCard(mCard, 'player', 'mc'));
        assert.equal(after.players.player.graveyard.length, loseN, mCard);
      }

      // Silphy, Galklife, Ballom, Saucer-Head, Crystal Paladin, King Tsunami, Extreme Crawler, Larba Geer, Craze Valkyrie, Rimuel
      const sweepBase = makeBaseState({
        players: {
          player: {
            manaZone: [manaCard('Holy Awe', 'player', 'lm1', false), manaCard('Holy Awe', 'player', 'lm2', false)],
            battleZone: [bzCard('Telitol, the Explorer', 'player', 'p-blk'), bzCard('King Tsunami', 'player', 'p-ts')]
          },
          opponent: {
            battleZone: [
              bzCard('La Ura Giga, Sky Guardian', 'opponent', 'o-l2k'),
              bzCard('Immortal Baron, Vorg', 'opponent', 'o-f2k'),
              bzCard('Bloody Squito', 'opponent', 'o-d4k')
            ]
          }
        }
      });
      assert.equal(triggerCIP(sweepBase, 'player', bzCard('Vampire Silphy', 'player', 'vs')).players.opponent.battleZone.length, 1);
      assert.equal(triggerCIP(sweepBase, 'player', bzCard('Galklife Dragon', 'player', 'gk')).players.opponent.battleZone.length, 2);
      assert.equal(triggerCIP(sweepBase, 'player', bzCard('Ballom, Master of Death', 'player', 'bm')).players.opponent.battleZone.length, 1);
      assert.equal(triggerCIP(sweepBase, 'player', bzCard('Saucer-Head Shark', 'player', 'shs')).players.opponent.battleZone.length, 1);
      assert.equal(triggerCIP(sweepBase, 'player', bzCard('Crystal Paladin', 'player', 'cp')).players.opponent.battleZone.length, 1);
      assert.equal(triggerCIP(sweepBase, 'player', bzCard('King Tsunami', 'player', 'p-ts')).players.opponent.battleZone.length, 0);
      assert.equal(
        triggerCIP(sweepBase, 'player', bzCard('Extreme Crawler', 'player', 'p-ts')).players.player.battleZone.length,
        1
      );
      assert.equal(
        triggerCIP(sweepBase, 'player', bzCard('Larba Geer, the Immaculate', 'player', 'lg')).players.opponent.battleZone.filter((c) => c.isTapped).length,
        2
      );
      assert.equal(
        triggerCIP(sweepBase, 'player', bzCard('Craze Valkyrie, the Drastic', 'player', 'cv')).players.opponent.battleZone.filter((c) => c.isTapped).length,
        2
      );
      assert.equal(
        triggerCIP(sweepBase, 'player', bzCard('Rimuel, Cloudbreak Elemental', 'player', 'rm')).players.opponent.battleZone.filter((c) => c.isTapped).length,
        2
      );

      // Targeted Destroy & Bounce CIPs
      for (const [dCard, targetId] of [
        ['Meteosaur', 'o-l2k'],
        ['Hurlosaur', 'o-1k'],
        ['Doboulgyser, Giant Rock Beast', 'o-l2k'],
        ['Armored Decimator Valkaizer', 'o-d4k'],
        ['Chaos Worm', 'o-d4k'],
        ['Explosive Trooper Zalmez', 'o-l2k']
      ]) {
        const s = makeBaseState({
          players: {
            opponent: {
              shields: [shieldItem('Holy Awe', 'os1', 'opponent')],
              battleZone: [
                bzCard('Locomotiver', 'opponent', 'o-1k'),
                bzCard('La Ura Giga, Sky Guardian', 'opponent', 'o-l2k'),
                bzCard('Bloody Squito', 'opponent', 'o-d4k')
              ]
            }
          }
        });
        assert.equal(triggerCIP(s, 'player', bzCard(dCard, 'player', 'dc'), [targetId]).players.opponent.battleZone.length, 2, dCard);
      }

      for (const bCard of ['Aqua Bouncer', 'King Mazelan']) {
        assert.equal(triggerCIP(sweepBase, 'player', bzCard(bCard, 'player', 'bc'), ['o-l2k']).players.opponent.battleZone.length, 2);
      }
      const fc = bzCard('Frantic Chieftain', 'player', 'fc');
      assert.equal(triggerCIP(makeBaseState({ players: { player: { battleZone: [fc] } } }), 'player', fc).players.player.battleZone.length, 0);

      // Mana/GY/Shield/Deck CIPs
      const resBase = makeBaseState({
        players: {
          player: {
            hand: [createCardInstance(cardByName('Holy Awe'), 'player')],
            manaZone: [
              manaCard('Holy Awe', 'player', 'pm-s', true),
              manaCard("Hearty Cap'n Polligon", 'player', 'pm-f', false)
            ],
            graveyard: [
              createCardInstance(cardByName('Terror Pit'), 'player'),
              createCardInstance(cardByName('Garabon, the Glider'), 'player')
            ],
            shields: Array.from({ length: 5 }, (_, i) => shieldItem('Holy Awe', `ps-${i}`, 'player')),
            deck: emptyDeck
          },
          opponent: {
            hand: [createCardInstance(cardByName('Terror Pit'), 'opponent')],
            manaZone: [
              manaCard('Holy Awe', 'opponent', 'om1'),
              manaCard('Terror Pit', 'opponent', 'om2'),
              manaCard('Faerie Life', 'opponent', 'om3')
            ],
            shields: [shieldItem('Holy Awe', 'os1', 'opponent'), shieldItem('Terror Pit', 'os2', 'opponent')],
            deck: [createCardInstance(cardByName('Bolshack Dragon'), 'opponent')]
          }
        }
      });

      assert.equal(triggerCIP(resBase, 'player', bzCard('Phal Eega, Dawn Guardian', 'player', 'pe')).players.player.hand.length, 2);
      assert.equal(triggerCIP(resBase, 'player', bzCard('Diamondia, the Blizzard Rider', 'player', 'dia')).players.player.hand.length, 3);
      for (const mRet of ['Lena, Vizier of Brilliance', 'Syforce, Aurora Elemental', 'Belix, the Explorer', 'Solidskin Fish', 'Thrash Crawler', 'Splash Zebrafish', 'Torpedo Cluster']) {
        assert.equal(triggerCIP(resBase, 'player', bzCard(mRet, 'player', 'mr')).players.player.manaZone.length, 1, mRet);
      }
      assert.equal(triggerCIP(resBase, 'player', bzCard('Spark Chemist, Shadow of Whim', 'player', 'sc')).players.player.manaZone.length, 0);
      assert.equal(triggerCIP(resBase, 'player', bzCard('Earth Ripper, Talon of Rage', 'player', 'er')).players.player.manaZone.length, 1);
      assert.equal(triggerCIP(resBase, 'player', bzCard('Midnight Crawler', 'player', 'mc')).players.opponent.hand.length, 2);
      assert.equal(triggerCIP(resBase, 'player', bzCard('Ancient Horn, the Watcher', 'player', 'ah')).players.player.manaZone.every((m) => !m.isTapped), true);
      assert.equal(triggerCIP(resBase, 'player', bzCard('Karate Potato', 'player', 'kp')).players.player.manaZone.length, 3);
      const hc = triggerCIP(resBase, 'player', bzCard('Hurricane Crawler', 'player', 'hc'));
      assert.equal(hc.players.player.hand.length, 1);
      const ct = triggerCIP(resBase, 'player', bzCard('Carnival Totem', 'player', 'ct'));
      assert.equal(ct.players.player.manaZone[0].isTapped, true);
      assert.equal(triggerCIP(resBase, 'player', bzCard('Gigandura', 'player', 'gg')).players.opponent.manaZone.length, 3);

      const ularusState = triggerCIP(
        {
          ...resBase,
          players: { ...resBase.players, player: { ...resBase.players.player, battleZone: [bzCard('Ularus, Punishment Elemental', 'player', 'ul')] } }
        },
        'player',
        bzCard('Ularus, Punishment Elemental', 'player', 'ul')
      );
      assert.equal(ularusState.players.opponent.shields[0].isFaceUp, true);

      for (const dCard of ['Rumbling Terahorn', 'Niofa, Horned Protector', 'Scissor Scarab', 'Whispering Totem', 'Hawkeye Lunatron']) {
        assert.equal(triggerCIP(resBase, 'player', bzCard(dCard, 'player', 'dc')).players.player.hand.length, 2, dCard);
      }
      const mm = triggerCIP(resBase, 'player', bzCard('Marinomancer', 'player', 'mm'));
      assert.equal(mm.players.player.hand.length, 3);
      assert.equal(mm.players.player.graveyard.length, 3);
      assert.equal(triggerCIP(resBase, 'player', bzCard('Raptor Fish', 'player', 'rf')).players.player.hand.length, 1);

      assert.ok(triggerCIP(resBase, 'player', bzCard('Telitol, the Explorer', 'player', 'te')).actionLog.at(-1)?.includes('looked at'));
      assert.ok(triggerCIP(resBase, 'player', bzCard('Grape Globbo', 'player', 'gb')).actionLog.at(-1)?.includes('hand'));
      assert.ok(triggerCIP(resBase, 'player', bzCard('Tekorax', 'player', 'tx')).actionLog.at(-1)?.includes('shields'));
      assert.ok(triggerCIP(resBase, 'player', bzCard('Time Scout', 'player', 'ts')).actionLog.at(-1)?.includes('top card'));
      assert.ok(triggerCIP(resBase, 'player', bzCard('Aqua Strummer', 'player', 'as')).actionLog.at(-1)?.includes('top 5 cards'));

      // Partial-regex fixes & condition gates
      assert.equal(triggerCIP(resBase, 'player', bzCard('Dedreen, the Hidden Corrupter', 'player', 'dd')).players.opponent.hand.length, 0);
      assert.equal(triggerCIP(resBase, 'player', bzCard('Lucky Ball', 'player', 'lb')).players.player.hand.length, 3);
      assert.equal(triggerCIP(resBase, 'player', bzCard('Kulus, Soulshine Enforcer', 'player', 'kl')).players.player.manaZone.length, 3);
      assert.equal(
        triggerCIP(sweepBase, 'player', bzCard('Kulus, Soulshine Enforcer', 'player', 'kl2')).players.player.manaZone.length,
        2,
        'Kulus must not ramp when opponent does not have more mana cards'
      );
      const trox = triggerCIP(
        makeBaseState({
          players: {
            player: { battleZone: [bzCard('Bloody Squito', 'player', 'd1'), bzCard('Locomotiver', 'player', 'd2')] },
            opponent: { hand: [createCardInstance(cardByName('Holy Awe'), 'opponent'), createCardInstance(cardByName('Terror Pit'), 'opponent')] }
          }
        }),
        'player',
        bzCard('Trox, General of Destruction', 'player', 'tx')
      );
      assert.equal(trox.players.opponent.hand.length, 0);

      const estol = triggerCIP(resBase, 'player', bzCard('Estol, Vizier of Aqua', 'player', 'es'));
      assert.equal(estol.players.player.shields.length, 6);
      assert.ok(estol.actionLog.at(-1)?.includes('shield'));

      const pointa = triggerCIP(resBase, 'player', bzCard('Pointa, the Aqua Shadow', 'player', 'pt'));
      assert.equal(pointa.players.opponent.hand.length, 0);

      const galek = triggerCIP(
        makeBaseState({
          players: {
            opponent: {
              battleZone: [bzCard('La Ura Giga, Sky Guardian', 'opponent', 'gb')],
              hand: [createCardInstance(cardByName('Holy Awe'), 'opponent')]
            }
          }
        }),
        'player',
        bzCard('Galek, the Shadow Warrior', 'player', 'gl')
      );
      assert.equal(galek.players.opponent.battleZone.length, 0);
      assert.equal(galek.players.opponent.hand.length, 0);

      const skysword = triggerCIP(resBase, 'player', bzCard('Skysword, the Savage Vizier', 'player', 'ss'));
      assert.equal(skysword.players.player.manaZone.length, 3);
      assert.equal(skysword.players.player.shields.length, 6);

      const funky = triggerCIP(
        makeBaseState({
          players: {
            player: { deck: [createCardInstance(cardByName('Holy Awe'), 'player')] },
            opponent: { deck: [createCardInstance(cardByName('Terror Pit'), 'opponent')] }
          }
        }),
        'player',
        bzCard('Funky Wizard', 'player', 'fw')
      );
      assert.equal(funky.players.player.hand.length, 1);
      assert.equal(funky.players.opponent.hand.length, 1);

      // Watchers: Scout Cluster, Marching Motherboard, Scream Slicer, Azaghast, Bakkra Horn, Micute, Zaltan
      const wBase = makeBaseState({
        players: {
          player: {
            hand: [createCardInstance(cardByName('Holy Awe'), 'player')],
            deck: [createCardInstance(cardByName('Bronze-Arm Tribe'), 'player'), createCardInstance(cardByName('Terror Pit'), 'player')],
            battleZone: [
              bzCard('Scout Cluster', 'player', 'w-sc'),
              bzCard('Marching Motherboard', 'player', 'w-mm'),
              bzCard('Scream Slicer, Shadow of Fear', 'player', 'w-ss'),
              bzCard('Azaghast, Tyrant of Shadows', 'player', 'w-az'),
              bzCard('Bakkra Horn, the Silent', 'player', 'w-bh'),
              bzCard('Micute, the Oracle', 'player', 'w-mc'),
              bzCard('Zaltan', 'player', 'w-zl')
            ]
          },
          opponent: { battleZone: [bzCard('Immortal Baron, Vorg', 'opponent', 'ov')] }
        }
      });
      const triggerCyberGhost = triggerCIP(wBase, 'player', bzCard('Pokolul', 'player', 'pok'));
      assert.equal(triggerCyberGhost.players.player.hand.some((h) => h.card.name === 'Scout Cluster'), true);

      const triggerDrg = triggerCIP(
        makeBaseState({
          players: {
            player: {
              deck: [createCardInstance(cardByName('Bronze-Arm Tribe'), 'player')],
              battleZone: [
                bzCard('Scream Slicer, Shadow of Fear', 'player', 'w-ss'),
                bzCard('Bakkra Horn, the Silent', 'player', 'w-bh')
              ]
            },
            opponent: { battleZone: [bzCard('Locomotiver', 'opponent', 'o1k')] }
          }
        }),
        'player',
        bzCard('Bolshack Dragon', 'player', 'bd')
      );
      assert.equal(triggerDrg.players.player.manaZone.length, 1);
      assert.equal(triggerDrg.players.opponent.battleZone.length, 0);

      // Laguna, Lightning Enforcer On-Attack
      const lagunaState = makeBaseState({
        interactiveHuman: true,
        players: {
          player: {
            battleZone: [bzCard('Laguna, Lightning Enforcer', 'player', 'p-lag')],
            deck: [createCardInstance(cardByName('Holy Awe'), 'player'), createCardInstance(cardByName('Bronze-Arm Tribe'), 'player')]
          }
        }
      });
      const lagPrompt = drain(triggerAttack(lagunaState, 'player', lagunaState.players.player.battleZone[0], { type: 'shield', index: 0 }));
      assert.equal(lagPrompt.players.player.hand[0].card.name, 'Holy Awe');
    });
  });
});
