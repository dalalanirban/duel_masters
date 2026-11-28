import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CARD_LIST } from '../../data/cardLoader.ts';
import { initializeGame, createCardInstance } from '../state.ts';
import { step } from '../reducer.ts';
import { getAiAction } from '../ai.ts';
import { resolveSpellEffect, canCastSpell } from '../spells.ts';
import { triggerCIP, triggerAttack, triggerBlocked, triggerUnblocked, triggerEndTurn } from '../triggers.ts';
import { destroyCreature, bounceCreature } from '../boardRemoval.ts';
import { canActivateTapAbility, resolveTapAbility } from '../tapAbilities.ts';
import { resolveSilentSkill } from '../advancedMechanics.ts';
import { startTurn } from '../turn.ts';
import { canSummonCreature, getEvolutionBaitRequirements, isVortexEvolution } from '../evolution.ts';

function getUniqueCanonicalCards() {
  const byName = new Map();
  const sorted = [...CARD_LIST].sort((a, b) => a.id.localeCompare(b.id));
  for (const card of sorted) {
    const key = String(card.name || '').trim().toLowerCase();
    if (!byName.has(key)) {
      byName.set(key, card);
    }
  }
  return Array.from(byName.values());
}

const UNIQUE_CARDS = getUniqueCanonicalCards();

function findByName(name) {
  return CARD_LIST.find((c) => c.name.toLowerCase() === name.toLowerCase()) || CARD_LIST[0];
}

function makeBaitCard(races, idSuffix) {
  return {
    id: `SYNTH-BAIT-${idSuffix}`,
    name: `Synthetic Bait ${idSuffix}`,
    set: 'SYNTH',
    collectorNumber: '999',
    civilizations: ['Light', 'Water', 'Darkness', 'Fire', 'Nature'],
    type: 'Creature',
    manaCost: 1,
    manaNumber: 1,
    power: 2000,
    races,
    isShieldTrigger: false,
    isBlocker: false,
    isSlayer: false,
    isSpeedAttacker: false,
    powerAttackerBonus: 0,
    breakerCount: 1,
    rulesText: '',
    isEvolution: false,
    isSurvivor: false,
    isCharger: false,
    isMultiCiv: true
  };
}

function makeAllCivManaPool(count = 18, tappedIndices = []) {
  const lightWater = {
    id: 'SYNTH-LW',
    name: 'Synth LW',
    civilizations: ['Light', 'Water'],
    type: 'Creature',
    manaCost: 1,
    manaNumber: 1,
    races: ['Guardian'],
    rulesText: ''
  };
  const darkFire = {
    id: 'SYNTH-DF',
    name: 'Synth DF',
    civilizations: ['Darkness', 'Fire'],
    type: 'Creature',
    manaCost: 1,
    manaNumber: 1,
    races: ['Human'],
    rulesText: ''
  };
  const natureCard = findByName('Bronze-Arm Tribe');
  const lightSpell = findByName('Holy Awe');
  const darkSpell = findByName('Terror Pit');
  const dragonCard = findByName('Bolshack Dragon');
  const faerieCard = findByName("Hearty Cap'n Polligon");
  const poolCards = [
    lightWater,
    darkFire,
    natureCard,
    lightSpell,
    darkSpell,
    dragonCard,
    faerieCard
  ];
  const tappedSet = new Set(tappedIndices);
  const pool = [];
  for (let i = 0; i < count; i++) {
    const card = poolCards[i % poolCards.length];
    pool.push({ instanceId: `mana-${i}`, card, isTapped: tappedSet.has(i) });
  }
  return pool;
}

function makeCreatureInst(card, owner, instanceId, overrides = {}) {
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

function buildScenarioState(mode, targetCard, interactiveHuman = false) {
  const deckA = {
    id: 'audit-a',
    name: 'Audit A',
    items: CARD_LIST.slice(0, 10).map((c) => ({ card: c, count: 4 })),
    updatedAt: 1
  };
  const deckB = {
    id: 'audit-b',
    name: 'Audit B',
    items: CARD_LIST.slice(10, 20).map((c) => ({ card: c, count: 4 })),
    updatedAt: 1
  };
  const base = initializeGame(deckA, deckB, 'player', { interactiveHuman });

  const evoBaits = [];
  if (targetCard.type.includes('Evolution') || targetCard.isEvolution) {
    const reqs = getEvolutionBaitRequirements(targetCard);
    if (isVortexEvolution(targetCard)) {
      evoBaits.push(makeCreatureInst(makeBaitCard([reqs[0] || 'Human'], 'v1'), 'player', 'p-bait-1'));
      evoBaits.push(makeCreatureInst(makeBaitCard([reqs[1] || 'Guardian'], 'v2'), 'player', 'p-bait-2'));
    } else {
      const race = reqs[0] || 'Human';
      evoBaits.push(makeCreatureInst(makeBaitCard([race], 'e1'), 'player', 'p-bait-1'));
    }
  }

  const targetHandInst = createCardInstance(targetCard, 'player');
  const fillerCards = [
    findByName('Immortal Baron, Vorg'),
    findByName('Aqua Hulcus'),
    findByName('Bronze-Arm Tribe'),
    findByName('Bloody Squito'),
    findByName('Holy Awe'),
    findByName('Terror Pit')
  ];

  if (mode === 'EMPTY') {
    return {
      state: {
        ...base,
        turn: 5,
        activePlayer: 'player',
        phase: 'MAIN',
        players: {
          player: {
            ...base.players.player,
            hand: [targetHandInst],
            manaZone: makeAllCivManaPool(14),
            battleZone: evoBaits,
            shields: [],
            graveyard: [],
            deck: fillerCards.map((c) => createCardInstance(c, 'player'))
          },
          opponent: {
            ...base.players.opponent,
            hand: [],
            manaZone: [],
            battleZone: [],
            shields: [],
            graveyard: [],
            deck: fillerCards.map((c) => createCardInstance(c, 'opponent'))
          }
        }
      },
      targetHandInst,
      baitIds: evoBaits.map((b) => b.instanceId)
    };
  }

  if (mode === 'ADVERSARIAL') {
    const petrova = findByName('Petrova, Channeler of Suns');
    const blocker = findByName('Dia Nork, Moonlight Guardian');
    const slayer = findByName('Bloody Squito');
    const holyAwe = findByName('Holy Awe');

    return {
      state: {
        ...base,
        turn: 5,
        activePlayer: 'player',
        phase: 'MAIN',
        players: {
          player: {
            ...base.players.player,
            hand: [
              targetHandInst,
              ...fillerCards.slice(0, 4).map((c) => createCardInstance(c, 'player'))
            ],
            manaZone: makeAllCivManaPool(14),
            battleZone: [
              ...evoBaits,
              makeCreatureInst(findByName('Bolshack Dragon'), 'player', 'p-ally-1'),
              makeCreatureInst(findByName('Aqua Hulcus'), 'player', 'p-ally-2')
            ],
            shields: [{ id: 'p-adv-s1', shieldId: 'p-adv-s1', card: holyAwe, isBroken: false }],
            graveyard: fillerCards.map((c) => createCardInstance(c, 'player')),
            deck: CARD_LIST.slice(0, 15).map((c) => createCardInstance(c, 'player'))
          },
          opponent: {
            ...base.players.opponent,
            hand: fillerCards.slice(0, 3).map((c) => createCardInstance(c, 'opponent')),
            manaZone: makeAllCivManaPool(6),
            battleZone: [
              makeCreatureInst(petrova, 'opponent', 'opp-petrova'),
              makeCreatureInst(blocker, 'opponent', 'opp-blocker'),
              makeCreatureInst(slayer, 'opponent', 'opp-slayer', { isTapped: true })
            ],
            shields: [
              { id: 'opp-adv-st', shieldId: 'opp-adv-st', card: holyAwe, isBroken: false },
              { id: 'opp-adv-s2', shieldId: 'opp-adv-s2', card: fillerCards[0], isBroken: false }
            ],
            graveyard: fillerCards.slice(0, 3).map((c) => createCardInstance(c, 'opponent')),
            deck: CARD_LIST.slice(10, 25).map((c) => createCardInstance(c, 'opponent'))
          }
        }
      },
      targetHandInst,
      baitIds: evoBaits.map((b) => b.instanceId)
    };
  }

  // POPULATED & COMBAT (calibrated archetype/conditional fixture)
  const lightAlly = makeCreatureInst(findByName('La Ura Giga, Sky Guardian'), 'player', 'p-pop-light', { isTapped: true });
  const darkAlly = makeCreatureInst(findByName('Bloody Squito'), 'player', 'p-pop-dark');
  const dark1kAlly = makeCreatureInst(findByName('Locomotiver'), 'player', 'p-pop-1k');
  const dragonoidAlly = makeCreatureInst(findByName('Onslaughter Triceps'), 'player', 'p-pop-dragonoid');
  const faerieAlly = makeCreatureInst(findByName("Hearty Cap'n Polligon"), 'player', 'p-pop-faerie');
  const wsAlly1 = makeCreatureInst(findByName('Asra, Vizier of Safety'), 'player', 'p-ws-1');
  const wsAlly2 = makeCreatureInst(findByName('Merlee, the Oracle'), 'player', 'p-ws-2');

  const oppLightBlocker = makeCreatureInst(findByName('La Ura Giga, Sky Guardian'), 'opponent', 'opp-light-2k');
  const oppWater = makeCreatureInst(findByName('Aqua Hulcus'), 'opponent', 'opp-water-2k');
  const oppDark1k = makeCreatureInst(findByName('Locomotiver'), 'opponent', 'opp-dark-1k');
  const oppTapped1k = makeCreatureInst(findByName('Garabon, the Glider'), 'opponent', 'opp-tapped-1k', { isTapped: true });
  const oppBlocker4k = makeCreatureInst(findByName('Senatine Jade Tree'), 'opponent', 'opp-blocker-4k');
  const oppDragon6k = makeCreatureInst(findByName('Bolshack Dragon'), 'opponent', 'opp-dragon-6k', { isTapped: true });
  const oppEvoBait = createCardInstance(findByName('Locomotiver'), 'opponent');
  const oppEvoCreature = makeCreatureInst(findByName('Ballom, Master of Death'), 'opponent', 'opp-evo-12k', {
    isTapped: true,
    evolvedOn: [oppEvoBait]
  });

  const diversePool = [
    findByName('La Ura Giga, Sky Guardian'),
    findByName('Dia Nork, Moonlight Guardian'),
    findByName('Holy Awe'),
    findByName('Terror Pit'),
    findByName('Faerie Life'),
    findByName('Spiral Gate'),
    findByName('Crimson Hammer'),
    findByName('Bolshack Dragon'),
    findByName('Urth, Purifying Elemental'),
    findByName('Ballom, Master of Death'),
    findByName('Skeleton Thief, the Revealer'),
    findByName('Scissor Scarab'),
    findByName('Grave Worm Q'),
    findByName('Factory Shell Q'),
    findByName("Hearty Cap'n Polligon"),
    findByName('Crystal Lancer'),
    findByName('Armored Blaster Valdios'),
    findByName('Senatine Jade Tree'),
    findByName('Garabon, the Glider'),
    findByName('Immortal Baron, Vorg'),
    findByName('Aqua Hulcus'),
    findByName('Bronze-Arm Tribe'),
    findByName('Bloody Squito')
  ];

  const rulesLower = String(targetCard.rulesText || '').toLowerCase();
  const basePlayerShieldCards = [
    findByName('Holy Awe'),
    findByName('Terror Pit'),
    findByName('Bronze-Arm Tribe'),
    findByName('Aqua Hulcus'),
    findByName('Bolshack Dragon')
  ];
  const baseOppShieldCards = [
    findByName('Immortal Baron, Vorg'),
    findByName('Aqua Hulcus'),
    findByName('Bronze-Arm Tribe'),
    findByName('Bloody Squito'),
    findByName('Holy Awe'),
    findByName('Terror Pit')
  ];

  let pManaCount = 18;
  let oManaCount = 10;
  if (/opponent has more cards in his mana zone/.test(rulesLower)) {
    pManaCount = 12;
    oManaCount = 16;
  }

  let pShieldCount = 5;
  let oShieldCount = 6;
  if (/2 or fewer shields|3 or fewer shields/.test(rulesLower)) {
    oShieldCount = 2;
  } else if (/opponent has more shields/.test(rulesLower)) {
    pShieldCount = 3;
    oShieldCount = 6;
  }

  return {
    state: {
      ...base,
      turn: 5,
      activePlayer: 'player',
      phase: 'MAIN',
      players: {
        player: {
          ...base.players.player,
          shieldsBrokenThisTurn: ['p-pop-light'], // enables Turbo Rush checks
          hand: [
            targetHandInst,
            createCardInstance(targetCard, 'player'),
            createCardInstance(findByName('Bolshack Dragon'), 'player'),
            createCardInstance(findByName('La Ura Giga, Sky Guardian'), 'player'),
            createCardInstance(findByName('Bloody Squito'), 'player'),
            createCardInstance(findByName('Mini Titan Gett'), 'player'),
            createCardInstance(findByName("Hearty Cap'n Polligon"), 'player'),
            createCardInstance(findByName('Terror Pit'), 'player')
          ],
          manaZone: [
            ...makeAllCivManaPool(pManaCount, [2, 5]),
            { instanceId: 'mana-target-copy', card: targetCard, isTapped: false }
          ],
          battleZone: [
            ...evoBaits,
            lightAlly,
            darkAlly,
            dark1kAlly,
            dragonoidAlly,
            faerieAlly,
            wsAlly1,
            wsAlly2
          ],
          shields: basePlayerShieldCards.slice(0, pShieldCount).map((c, idx) => ({
            id: `p-sh-${idx}`,
            shieldId: `p-sh-${idx}`,
            card: c,
            isBroken: false
          })),
          graveyard: [
            createCardInstance(targetCard, 'player'),
            ...diversePool.map((c) => createCardInstance(c, 'player'))
          ],
          deck: [
            createCardInstance(targetCard, 'player'),
            ...diversePool.map((c) => createCardInstance(c, 'player')),
            ...fillerCards.map((c) => createCardInstance(c, 'player'))
          ]
        },
        opponent: {
          ...base.players.opponent,
          hand: [
            createCardInstance(findByName('Terror Pit'), 'opponent'),
            createCardInstance(findByName('Holy Awe'), 'opponent'),
            createCardInstance(findByName('Bloody Squito'), 'opponent'),
            createCardInstance(findByName('Aqua Hulcus'), 'opponent'),
            createCardInstance(findByName('Bolshack Dragon'), 'opponent')
          ],
          manaZone: makeAllCivManaPool(oManaCount, [1, 4]),
          battleZone: [
            oppLightBlocker,
            oppWater,
            oppDark1k,
            oppTapped1k,
            oppBlocker4k,
            oppDragon6k,
            oppEvoCreature
          ],
          shields: baseOppShieldCards.slice(0, oShieldCount).map((c, idx) => ({
            id: `o-sh-${idx}`,
            shieldId: `o-sh-${idx}`,
            card: c,
            isBroken: false
          })),
          graveyard: [
            createCardInstance(targetCard, 'opponent'),
            ...diversePool.map((c) => createCardInstance(c, 'opponent'))
          ],
          deck: [
            createCardInstance(targetCard, 'opponent'),
            ...diversePool.map((c) => createCardInstance(c, 'opponent')),
            ...fillerCards.map((c) => createCardInstance(c, 'opponent'))
          ]
        }
      }
    },
    targetHandInst,
    baitIds: evoBaits.map((b) => b.instanceId)
  };
}

function stepStrict(state, action, contextLabel = '') {
  const prevLen = state.actionLog.length;
  const next = step(state, action);
  const newLogs = next.actionLog.slice(prevLen);
  const errLog = newLogs.find((line) => /^Action error \(/i.test(line));
  assert.equal(errLog, undefined, `${contextLabel} produced reducer error: ${errLog}`);
  return next;
}

function drainInteractions(startState, maxSteps = 16, contextLabel = '') {
  let state = startState;
  let steps = 0;
  while (state.pendingInteraction && steps < maxSteps) {
    steps += 1;
    const inter = state.pendingInteraction;
    const actingPlayer = 'defendingPlayer' in inter ? inter.defendingPlayer : inter.player;

    let action = actingPlayer === 'opponent' ? getAiAction(state, 'opponent') : null;
    if (!action) {
      if (inter.type === 'ZONE_SELECTION') {
        let selectedIds;
        const isChoicePill =
          inter.actionKind === 'TAP_CHOOSE_RACE' ||
          inter.actionKind === 'SPELL_CHOOSE_RACE' ||
          inter.actionKind === 'CIP_CHOOSE_RACE' ||
          inter.actionKind === 'CHOOSE_NUMBER';
        if (isChoicePill) {
          selectedIds = [];
        } else if (inter.sourceCardName?.toLowerCase().includes('zombie carnival')) {
          const byRace = new Map();
          for (const opt of inter.options) {
            for (const r of opt.card.races || ['None']) {
              const list = byRace.get(r) || [];
              list.push(opt.instanceId);
              byRace.set(r, list);
            }
          }
          const topRace = Array.from(byRace.values()).sort((a, b) => b.length - a.length)[0] || [];
          selectedIds = topRace.slice(0, Math.min(inter.maxSelections || 1, topRace.length));
        } else if (typeof inter.contextData?.maxTotalPower === 'number') {
          let budget = inter.contextData.maxTotalPower;
          selectedIds = [];
          for (const opt of inter.options) {
            const p = opt.card.power ?? 0;
            if (p <= budget && selectedIds.length < (inter.maxSelections || inter.options.length)) {
              selectedIds.push(opt.instanceId);
              budget -= p;
            }
          }
        } else {
          const pickCount =
            inter.minSelections === 0 && inter.maxSelections > 0
              ? Math.min(inter.maxSelections, inter.options.length)
              : Math.min(inter.minSelections || 0, inter.options.length);
          selectedIds = inter.options.slice(0, pickCount).map((o) => o.instanceId);
        }

        action = {
          type: 'RESOLVE_ZONE_SELECTION',
          player: actingPlayer,
          selectedIds,
          selectedRace: inter.raceOptions?.[0]
        };
      } else if (inter.type === 'OPTIONAL_CHOICE') {
        action = {
          type: 'RESOLVE_OPTIONAL_CHOICE',
          player: actingPlayer,
          accept: true,
          selectedTargetId: inter.validTargetIds?.[0]
        };
      } else if (inter.type === 'DECK_SEARCH') {
        action = {
          type: 'RESOLVE_DECK_SEARCH',
          player: actingPlayer,
          selectedCardInstanceId: inter.validCardInstanceIds[0] ?? null
        };
      } else if (inter.type === 'TARGET_SELECTION') {
        const count =
          inter.minTargets === 0 && inter.maxTargets > 0
            ? Math.min(inter.maxTargets, inter.validTargetIds.length)
            : Math.min(inter.minTargets || 0, inter.validTargetIds.length);
        action = {
          type: 'SELECT_TARGETS',
          player: actingPlayer,
          selectedIds: inter.validTargetIds.slice(0, count)
        };
      } else if (inter.type === 'SILENT_SKILL_CHOICE') {
        action = { type: 'RESOLVE_SILENT_SKILL_CHOICE', player: actingPlayer, activate: true };
      } else if (inter.type === 'BLOCK_DECLARATION' || inter.type === 'BLOCKER_CHOICE') {
        action = {
          type: 'DECLARE_BLOCK',
          player: actingPlayer,
          blockerId: inter.validBlockerIds[0] ?? null
        };
      } else if (inter.type === 'SHIELD_TRIGGER_RESOLUTION' || inter.type === 'SHIELD_TRIGGER_CHOICE') {
        const trig = inter.triggers?.[0];
        if (!trig) break;
        action = {
          type: 'RESOLVE_SHIELD_TRIGGER',
          player: actingPlayer,
          shieldId: trig.shieldId,
          activate: false
        };
      }
    }
    assert.ok(action, `${contextLabel} unable to produce resolution action for interaction type ${inter.type}`);
    state = stepStrict(state, action, contextLabel);
  }
  assert.equal(state.pendingInteraction, null, `${contextLabel} pending interaction failed to drain within bounded steps`);
  return state;
}

function stateSnapshotForDelta(state) {
  const summarizePlayer = (p) => ({
    deck: p.deck.map((c) => c.instanceId),
    hand: p.hand.map((c) => c.instanceId),
    shields: p.shields.map((s) => `${s.id}:${s.isBroken}:${Boolean(s.isFaceUp)}:${s.card.id}`),
    mana: p.manaZone.map((m) => `${m.instanceId}:${m.isTapped}`),
    graveyard: p.graveyard.map((g) => g.instanceId),
    bz: p.battleZone.map((b) => ({
      id: b.instanceId,
      cid: b.card.id,
      tapped: b.isTapped,
      pm: b.powerModifier,
      cr: b.chosenRace ?? null,
      temps: Object.entries(b)
        .filter(([k, v]) => k.startsWith('temp') && v !== undefined && v !== 0 && v !== false)
        .sort()
    })),
    temps: Object.entries(p)
      .filter(([k, v]) => k.startsWith('temp') && v !== undefined && v !== false)
      .sort()
  });

  return JSON.stringify({
    player: summarizePlayer(state.players.player),
    opponent: summarizePlayer(state.players.opponent),
    extraTurnPlayer: state.extraTurnPlayer ?? null,
    pending: state.pendingInteraction?.type ?? null,
    winner: state.winner
  });
}

function hasCardTags(card) {
  const rawRules = String(card.rulesText || '');
  const rules = rawRules.replace(/\([^)]*\)/g, ' ');
  const isVanillaOrKwOnly =
    card.type !== 'Spell' &&
    (!rules.trim() ||
      rules
        .split(/(?<=[.!?])\s+|\n+/)
        .map((s) => s.replace(/^\.+|\.+$/g, '').trim())
        .filter(Boolean)
        .every((s) =>
          /^(?:blocker|slayer|speed attacker|shield trigger|double breaker|triple breaker|power attacker\s*\+\d+|this creature can't attack(?: players)?|evolution(?:\s*-\s*.*)?)$/i.test(
            s
          )
        ));

  const isCIP =
    card.type !== 'Spell' &&
    /when you put this (?:creature|card)(?:\s+is put)? into (?:the )?battle zone|when this creature is put into (?:the )?battle zone/i.test(
      rules
    );
  const isOnAttack =
    card.type !== 'Spell' &&
    /whenever this creature attacks|when this creature attacks/i.test(rules);
  const isTapAbility = card.type !== 'Spell' && /\$tap\b|tap ability/i.test(rawRules);
  const isSilentSkill =
    card.type !== 'Spell' && /silent skill\s*(?:\([^)]*\))?\s*:/i.test(rawRules);
  const isOnDestroyOrLeave =
    card.type !== 'Spell' &&
    !/when this creature wins a battle/i.test(rules) &&
    /when(?:ever)? this creature (?:is|would be) destroyed|when(?:ever)? (?:another|a|any) creature is destroyed|when(?:ever)? this creature leaves the battle zone|leaves your battle zone|is put into (?:your|its owner's) graveyard from the battle zone|is put into your graveyard from anywhere/i.test(
      rules
    );

  return { isVanillaOrKwOnly, isCIP, isOnAttack, isTapAbility, isSilentSkill, isOnDestroyOrLeave };
}

function hasSpecificPeekOrReveal(beforeState, afterState, hadPending) {
  if (hadPending) return true;
  const newLogs = afterState.actionLog.slice(beforeState.actionLog.length);
  return newLogs.some((line) =>
    /\b(?:peek(?:ed)?|look(?:ed)? at|reveal(?:ed)?|reorder(?:ed)?|shows? (?:you|opponent)|top \d* cards? of|face up)\b/i.test(
      line
    ) && !/^player (?:resolved|cast|summoned)\b/i.test(line)
  );
}

describe('Sprint 2/3: 890-Card Automated Runtime Smoke & Silent No-Op Audit', () => {
  it('executes all 890 unique cards across Empty, Populated, Adversarial, and Combat fixtures with 0 uncaught exceptions and 0 stuck interactions', () => {
    const silentNoOps = {
      spells: [],
      cip: [],
      onAttack: [],
      tapAbility: [],
      silentSkill: [],
      onDestroyOrLeave: []
    };
    const activeProbeCounts = {
      tapAbility: 0,
      silentSkill: 0,
      onDestroyOrLeave: 0
    };

    for (const card of UNIQUE_CARDS) {
      for (const mode of ['EMPTY', 'POPULATED', 'ADVERSARIAL', 'COMBAT']) {
        const ctxLabel = `[${card.id} ${card.name} @ ${mode}]`;
        const { state, targetHandInst, baitIds } = buildScenarioState(mode, card, false);

        if (card.type === 'Spell') {
          if (mode === 'POPULATED') {
            // Measure direct spell rule effect delta on populated board (both non-interactive and drained interactive)
            const beforeSnap = stateSnapshotForDelta(state);
            const afterNonInteractive = resolveSpellEffect(state, 'player', card);
            const settledNI = drainInteractions(afterNonInteractive, 16, ctxLabel);
            const afterSnapNI = stateSnapshotForDelta(settledNI);

            const interactiveState = { ...state, interactiveHuman: true };
            const afterInteractive = resolveSpellEffect(interactiveState, 'player', card);
            const hadPending = afterInteractive.pendingInteraction !== null;
            const settledInt = drainInteractions(afterInteractive, 16, ctxLabel);
            const afterSnapInt = stateSnapshotForDelta(settledInt);

            const peekSignal =
              hasSpecificPeekOrReveal(state, settledNI, false) ||
              hasSpecificPeekOrReveal(interactiveState, settledInt, hadPending);

            const tags = hasCardTags(card);
            if (!tags.isVanillaOrKwOnly && !peekSignal && beforeSnap === afterSnapNI && beforeSnap === afterSnapInt) {
              // Pure Charger spells put themselves into mana on castStep; only flag if non-trivial rules clauses produced zero effect!
              const nonChargerRules = String(card.rulesText || '')
                .replace(/\([^)]*\)/g, ' ')
                .replace(/shield trigger|charger/gi, '')
                .trim();
              if (nonChargerRules.length > 0) {
                silentNoOps.spells.push({ id: card.id, name: card.name, rulesText: nonChargerRules });
              }
            }
          }

          // Full reducer step cast
          if (canCastSpell(state, 'player', card).allowed) {
            const afterCast = stepStrict(
              state,
              {
                type: 'CAST_SPELL',
                player: 'player',
                cardInstanceId: targetHandInst.instanceId
              },
              ctxLabel
            );
            drainInteractions(afterCast, 16, ctxLabel);
          } else {
            // Even when cast precondition isn't met (e.g. Blaze Cannon), resolveSpellEffect itself must not crash
            const res = resolveSpellEffect(state, 'player', card);
            drainInteractions(res, 16, ctxLabel);
          }
          continue;
        }

        // Creature / Evolution Creature path
        const summonArgs = isVortexEvolution(card)
          ? baitIds.slice(0, 2)
          : baitIds[0];

        let settledAfterSummon = state;
        if (canSummonCreature(state, 'player', card).allowed) {
          const afterSummon = stepStrict(
            state,
            {
              type: 'SUMMON_CREATURE',
              player: 'player',
              cardInstanceId: targetHandInst.instanceId,
              baitInstanceId: Array.isArray(summonArgs) ? undefined : summonArgs,
              baitInstanceIds: Array.isArray(summonArgs) ? summonArgs : undefined
            },
            ctxLabel
          );
          settledAfterSummon = drainInteractions(afterSummon, 16, ctxLabel);
        }

        const tags = hasCardTags(card);
        if (mode === 'POPULATED' && tags.isCIP) {
          const probeInst = makeCreatureInst(card, 'player', 'probe-cip-inst');
          const baseProbe = {
            ...state,
            players: {
              ...state.players,
              player: {
                ...state.players.player,
                battleZone: [...state.players.player.battleZone, probeInst]
              }
            }
          };
          const beforeCip = stateSnapshotForDelta(baseProbe);
          const afterCipNI = triggerCIP(baseProbe, 'player', probeInst);
          const settledCipNI = drainInteractions(afterCipNI, 16, ctxLabel);
          const afterCipSnapNI = stateSnapshotForDelta(settledCipNI);

          const baseProbeInt = { ...baseProbe, interactiveHuman: true };
          const afterCipInt = triggerCIP(baseProbeInt, 'player', probeInst);
          const hadPendingCip = afterCipInt.pendingInteraction !== null;
          const settledCipInt = drainInteractions(afterCipInt, 16, ctxLabel);
          const afterCipSnapInt = stateSnapshotForDelta(settledCipInt);

          const peekSignalCip =
            hasSpecificPeekOrReveal(baseProbe, settledCipNI, false) ||
            hasSpecificPeekOrReveal(baseProbeInt, settledCipInt, hadPendingCip);

          if (!peekSignalCip && beforeCip === afterCipSnapNI && beforeCip === afterCipSnapInt) {
            silentNoOps.cip.push({
              id: card.id,
              name: card.name,
              rulesText: String(card.rulesText || '').replace(/\([^)]*\)/g, ' ').trim()
            });
          }
        }

        if (mode === 'POPULATED' && tags.isOnAttack) {
          const attProbe = makeCreatureInst(card, 'player', 'probe-atk-inst', { summonedTurn: 1 });
          const baseAtk = {
            ...state,
            phase: 'ATTACK',
            players: {
              ...state.players,
              player: {
                ...state.players.player,
                battleZone: [...state.players.player.battleZone, attProbe]
              }
            }
          };
          const beforeAtk = stateSnapshotForDelta(baseAtk);
          const shieldTarget = { type: 'shield', index: 0 };
          const creatureTarget = { type: 'creature', instanceId: 'opp-dragon-6k' };
          const playerDirectState = {
            ...baseAtk,
            players: {
              ...baseAtk.players,
              opponent: { ...baseAtk.players.opponent, shields: [] }
            }
          };
          const beforePlayerDirect = stateSnapshotForDelta(playerDirectState);

          const afterShieldNI = drainInteractions(
            triggerAttack(baseAtk, 'player', attProbe, shieldTarget),
            16,
            ctxLabel
          );
          const rawShieldInt = triggerAttack({ ...baseAtk, interactiveHuman: true }, 'player', attProbe, shieldTarget);
          const hadPendingShield = rawShieldInt.pendingInteraction !== null;
          const afterShieldInt = drainInteractions(rawShieldInt, 16, ctxLabel);

          const afterCreatureNI = drainInteractions(
            triggerAttack(baseAtk, 'player', attProbe, creatureTarget),
            16,
            ctxLabel
          );
          const rawCreatureInt = triggerAttack({ ...baseAtk, interactiveHuman: true }, 'player', attProbe, creatureTarget);
          const hadPendingCreature = rawCreatureInt.pendingInteraction !== null;
          const afterCreatureInt = drainInteractions(rawCreatureInt, 16, ctxLabel);

          const afterDirectNI = drainInteractions(
            triggerAttack(playerDirectState, 'player', attProbe, { type: 'player' }),
            16,
            ctxLabel
          );

          const anyDelta =
            beforeAtk !== stateSnapshotForDelta(afterShieldNI) ||
            beforeAtk !== stateSnapshotForDelta(afterShieldInt) ||
            beforeAtk !== stateSnapshotForDelta(afterCreatureNI) ||
            beforeAtk !== stateSnapshotForDelta(afterCreatureInt) ||
            beforePlayerDirect !== stateSnapshotForDelta(afterDirectNI) ||
            hasSpecificPeekOrReveal(baseAtk, afterShieldNI, false) ||
            hasSpecificPeekOrReveal(baseAtk, afterShieldInt, hadPendingShield) ||
            hasSpecificPeekOrReveal(baseAtk, afterCreatureNI, false) ||
            hasSpecificPeekOrReveal(baseAtk, afterCreatureInt, hadPendingCreature);

          if (!anyDelta) {
            silentNoOps.onAttack.push({
              id: card.id,
              name: card.name,
              rulesText: String(card.rulesText || '').replace(/\([^)]*\)/g, ' ').trim()
            });
          }
        }

        if (mode === 'POPULATED' && tags.isTapAbility) {
          activeProbeCounts.tapAbility += 1;
          const tapProbe = makeCreatureInst(card, 'player', 'probe-tap-inst', {
            summonedTurn: 1,
            isTapped: false
          });
          const baseTap = {
            ...state,
            phase: 'ATTACK',
            players: {
              ...state.players,
              player: {
                ...state.players.player,
                battleZone: [...state.players.player.battleZone, tapProbe]
              }
            }
          };
          const baselineAfterCost = stateSnapshotForDelta({
            ...baseTap,
            players: {
              ...baseTap.players,
              player: {
                ...baseTap.players.player,
                battleZone: baseTap.players.player.battleZone.map((c) =>
                  c.instanceId === tapProbe.instanceId ? { ...c, isTapped: true } : c
                )
              }
            }
          });

          const rawTapNI = resolveTapAbility(baseTap, tapProbe.instanceId);
          const settledTapNI = drainInteractions(rawTapNI, 16, `${ctxLabel} [TAP NI]`);
          const baseTapInt = { ...baseTap, interactiveHuman: true };
          const rawTapInt = resolveTapAbility(baseTapInt, tapProbe.instanceId);
          const hadPendingTap = rawTapInt.pendingInteraction !== null;
          const settledTapInt = drainInteractions(rawTapInt, 16, `${ctxLabel} [TAP INT]`);

          const tapPeek =
            hasSpecificPeekOrReveal(baseTap, settledTapNI, false) ||
            hasSpecificPeekOrReveal(baseTapInt, settledTapInt, hadPendingTap);

          if (
            !tapPeek &&
            baselineAfterCost === stateSnapshotForDelta(settledTapNI) &&
            baselineAfterCost === stateSnapshotForDelta(settledTapInt)
          ) {
            silentNoOps.tapAbility.push({
              id: card.id,
              name: card.name,
              rulesText: String(card.rulesText || '').replace(/\([^)]*\)/g, ' ').trim()
            });
          }
        }

        if (mode === 'POPULATED' && tags.isSilentSkill) {
          activeProbeCounts.silentSkill += 1;
          const silentProbe = makeCreatureInst(card, 'player', 'probe-silent-inst', {
            summonedTurn: 1,
            isTapped: true
          });
          const baseSilent = {
            ...state,
            phase: 'START_OF_TURN',
            players: {
              ...state.players,
              player: {
                ...state.players.player,
                battleZone: [...state.players.player.battleZone, silentProbe]
              }
            }
          };
          const beforeSilent = stateSnapshotForDelta(baseSilent);
          const rawSilentNI = resolveSilentSkill(baseSilent, silentProbe.instanceId);
          const settledSilentNI = drainInteractions(rawSilentNI, 16, `${ctxLabel} [SILENT NI]`);
          const baseSilentInt = { ...baseSilent, interactiveHuman: true };
          const rawSilentInt = resolveSilentSkill(baseSilentInt, silentProbe.instanceId);
          const hadPendingSilent = rawSilentInt.pendingInteraction !== null;
          const settledSilentInt = drainInteractions(rawSilentInt, 16, `${ctxLabel} [SILENT INT]`);

          const silentPeek =
            hasSpecificPeekOrReveal(baseSilent, settledSilentNI, false) ||
            hasSpecificPeekOrReveal(baseSilentInt, settledSilentInt, hadPendingSilent);

          if (
            !silentPeek &&
            beforeSilent === stateSnapshotForDelta(settledSilentNI) &&
            beforeSilent === stateSnapshotForDelta(settledSilentInt)
          ) {
            silentNoOps.silentSkill.push({
              id: card.id,
              name: card.name,
              rulesText: String(card.rulesText || '').replace(/\([^)]*\)/g, ' ').trim()
            });
          }

          // Also exercise startTurn Silent Skill step (human interactive + AI opponent start-of-turn)
          const stHuman = startTurn({ ...baseSilentInt, activePlayer: 'player' });
          drainInteractions(stHuman, 16, `${ctxLabel} [START_TURN HUMAN]`);
          const aiSilentProbe = makeCreatureInst(card, 'opponent', 'opp-silent-inst', {
            summonedTurn: 1,
            isTapped: true
          });
          const stOpp = startTurn({
            ...state,
            activePlayer: 'opponent',
            players: {
              ...state.players,
              opponent: {
                ...state.players.opponent,
                battleZone: [...state.players.opponent.battleZone, aiSilentProbe]
              }
            }
          });
          drainInteractions(stOpp, 16, `${ctxLabel} [START_TURN AI]`);
        }

        if (mode === 'POPULATED' && tags.isOnDestroyOrLeave) {
          activeProbeCounts.onDestroyOrLeave += 1;
          const rulesLower = String(card.rulesText || '').toLowerCase();
          const isWatcher =
            /whenever (?:another|a|any) creature is destroyed|whenever one of your creatures is destroyed/i.test(
              rulesLower
            );
          const needsDuplicateOnBZ = /if another /i.test(rulesLower);
          const probeDest = makeCreatureInst(card, 'player', 'probe-destroy-inst', {
            summonedTurn: 1,
            ...(card.isEvolution || card.type.includes('Evolution')
              ? { evolvedOn: [createCardInstance(findByName('Immortal Baron, Vorg'), 'player')] }
              : {})
          });
          const extraDup = needsDuplicateOnBZ
            ? [makeCreatureInst(card, 'player', 'probe-destroy-dup', { summonedTurn: 1 })]
            : [];
          const victimId = isWatcher ? 'p-pop-light' : probeDest.instanceId;
          const baseDest = {
            ...state,
            activePlayer: isWatcher ? 'opponent' : 'player',
            players: {
              ...state.players,
              player: {
                ...state.players.player,
                battleZone: [...state.players.player.battleZone, probeDest, ...extraDup]
              }
            }
          };

          const victimInst = baseDest.players.player.battleZone.find((c) => c.instanceId === victimId);
          const bareGraveItems = victimInst
            ? [
                ...(victimInst.evolvedOn || []).map((e) => ({
                  instanceId: e.instanceId,
                  card: e.card,
                  owner: 'player'
                })),
                { instanceId: victimInst.instanceId, card: victimInst.card, owner: 'player' }
              ]
            : [];
          const bareDestroyBaseline = stateSnapshotForDelta({
            ...baseDest,
            players: {
              ...baseDest.players,
              player: {
                ...baseDest.players.player,
                battleZone: baseDest.players.player.battleZone.filter((c) => c.instanceId !== victimId),
                graveyard: [...baseDest.players.player.graveyard, ...bareGraveItems]
              }
            }
          });

          const settledDestNI = drainInteractions(
            destroyCreature(baseDest, victimId),
            16,
            `${ctxLabel} [DESTROY NI]`
          );
          const baseDestInt = { ...baseDest, interactiveHuman: true };
          const rawDestInt = destroyCreature(baseDestInt, victimId);
          const hadPendingDest = rawDestInt.pendingInteraction !== null;
          const settledDestInt = drainInteractions(rawDestInt, 16, `${ctxLabel} [DESTROY INT]`);

          const destPeek =
            hasSpecificPeekOrReveal(baseDest, settledDestNI, false) ||
            hasSpecificPeekOrReveal(baseDestInt, settledDestInt, hadPendingDest);

          if (
            !destPeek &&
            bareDestroyBaseline === stateSnapshotForDelta(settledDestNI) &&
            bareDestroyBaseline === stateSnapshotForDelta(settledDestInt)
          ) {
            silentNoOps.onDestroyOrLeave.push({
              id: card.id,
              name: card.name,
              rulesText: String(card.rulesText || '').replace(/\([^)]*\)/g, ' ').trim()
            });
          }
        }

        if (mode === 'COMBAT') {
          // Full lifecycle smoke: $tap ability -> attack (block/unblocked) -> destroy / bounce -> EOT
          const summoned = settledAfterSummon.players.player.battleZone.find(
            (c) => c.instanceId === targetHandInst.instanceId || c.card.id === card.id
          );
          if (summoned) {
            let cur = {
              ...settledAfterSummon,
              turn: settledAfterSummon.turn + 2,
              phase: 'ATTACK'
            };

            if (canActivateTapAbility(cur, summoned, 'player').valid) {
              const afterTap = resolveTapAbility(cur, summoned.instanceId);
              cur = drainInteractions(afterTap, 16, ctxLabel);
            }

            const stillThere = cur.players.player.battleZone.find((c) => c.instanceId === summoned.instanceId);
            if (stillThere && !stillThere.isTapped) {
              // Run triggerAttack + triggerBlocked + triggerUnblocked smoke safely
              const tAtk = drainInteractions(
                triggerAttack(cur, 'player', stillThere, { type: 'shield', index: 0 }),
                16,
                ctxLabel
              );
              const blocker = tAtk.players.opponent.battleZone[0];
              if (blocker) {
                drainInteractions(triggerBlocked(tAtk, 'player', stillThere, blocker), 16, ctxLabel);
              }
              drainInteractions(triggerUnblocked(tAtk, 'player', stillThere, { type: 'shield', index: 0 }), 16, ctxLabel);
            }

            const destroyed = drainInteractions(destroyCreature(cur, summoned.instanceId), 16, ctxLabel);
            const bounced = drainInteractions(bounceCreature(cur, summoned.instanceId), 16, ctxLabel);
            drainInteractions(triggerEndTurn(destroyed, 'player'), 16, ctxLabel);
            drainInteractions(triggerEndTurn(bounced, 'player'), 16, ctxLabel);
          }
        }
      }
    }

    // Lock: ZERO Sprint 2 target cards may silently no-op on Populated Board!
    const sprint2LockedNames = new Set([
      'death smoke', 'terror pit', 'crimson hammer', 'tornado flame',
      "phantom dragon's flame", 'spiral gate', 'natural snare', 'solar ray',
      'slime veil', 'infernal command', 'forced frenzy',
      'gajirabute, vile centurion', 'core-crash lizard', 'fortress shell',
      'general dark fiend', 'necrodragon galbazeek', 'steam rumbler kain',
      'daidalos, general of fury', 'thrumiss, zephyr guardian', 'zero nemesis, shadow of panic',
      'plasma chaser', 'stained glass', 'marrow ooze, the twister', 'bolzard dragon',
      'ra vu, seeker of lightning', 'king neptas', 'king ponitas', 'gamil, knight of hatred',
      'psyshroom', 'sniper mosquito', 'earthstomp giant', 'smile angler',
      'curious eye', 'migalo, vizier of spycraft', 'lalicious', 'sabermask scarab'
    ]);

    const allSilent = [
      ...silentNoOps.spells,
      ...silentNoOps.cip,
      ...silentNoOps.onAttack,
      ...silentNoOps.tapAbility,
      ...silentNoOps.silentSkill,
      ...silentNoOps.onDestroyOrLeave
    ];
    const brokenLocked = allSilent.filter((x) => sprint2LockedNames.has(x.name.toLowerCase()));
    assert.deepEqual(brokenLocked, [], `Locked cards silently no-oped: ${JSON.stringify(brokenLocked)}`);
    assert.deepEqual(
      silentNoOps,
      {
        spells: [],
        cip: [],
        onAttack: [],
        tapAbility: [],
        silentSkill: [],
        onDestroyOrLeave: []
      },
      `Calibrated Populated Board expected 0 silent no-ops, found: ${JSON.stringify(allSilent)}`
    );

    // Print full Silent No-Op Report
    console.log('\n=== 890-CARD RUNTIME AUDIT: SILENT NO-OP REPORT (POPULATED BOARD) ===');
    console.log(
      `Tested Unique Cards: ${UNIQUE_CARDS.length} | Active Probes -> Tap: ${activeProbeCounts.tapAbility}, Silent Skill: ${activeProbeCounts.silentSkill}, Destroy/Leave: ${activeProbeCounts.onDestroyOrLeave}`
    );
    console.log(`Silent No-Op Spells (${silentNoOps.spells.length}):`);
    for (const s of silentNoOps.spells) {
      console.log(`  - ${s.id} | ${s.name}: "${s.rulesText.slice(0, 120)}"`);
    }
    console.log(`Silent No-Op CIP Creatures (${silentNoOps.cip.length}):`);
    for (const c of silentNoOps.cip) {
      console.log(`  - ${c.id} | ${c.name}: "${c.rulesText.slice(0, 120)}"`);
    }
    console.log(`Silent No-Op On-Attack Creatures (${silentNoOps.onAttack.length}):`);
    for (const a of silentNoOps.onAttack) {
      console.log(`  - ${a.id} | ${a.name}: "${a.rulesText.slice(0, 120)}"`);
    }
    console.log(`Silent No-Op Tap Abilities (${silentNoOps.tapAbility.length}):`);
    for (const t of silentNoOps.tapAbility) {
      console.log(`  - ${t.id} | ${t.name}: "${t.rulesText.slice(0, 120)}"`);
    }
    console.log(`Silent No-Op Silent Skills (${silentNoOps.silentSkill.length}):`);
    for (const ss of silentNoOps.silentSkill) {
      console.log(`  - ${ss.id} | ${ss.name}: "${ss.rulesText.slice(0, 120)}"`);
    }
    console.log(`Silent No-Op On-Destroy/Leave (${silentNoOps.onDestroyOrLeave.length}):`);
    for (const d of silentNoOps.onDestroyOrLeave) {
      console.log(`  - ${d.id} | ${d.name}: "${d.rulesText.slice(0, 120)}"`);
    }
    console.log('=== END SILENT NO-OP REPORT ===\n');
  });
});
