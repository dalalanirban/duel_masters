import type { CardDefinition } from '../types/card.ts';
import type {
  CreatureInstance,
  GameState,
  PlayerId
} from './types.ts';
import {
  getCardCapabilities,
  getCardCivilizations,
  getCreatureRaces,
  getOpponentId,
  normalizeRace
} from './cardUtils.ts';
import {
  getCreatureEffectivePower,
  hasCreatureBlocker,
  hasCreatureSpeedAttacker
} from './continuous.ts';
import { buildZoneOptions, enqueueInteraction } from './interactionHelpers.ts';
import { toManaCard } from './mana.ts';
import {
  bounceCreature,
  destroyCreature,
  destroyCreaturesBatch,
  discardHandCardsByIndices,
  discardRandomHandCards,
  drawCards,
  findCreature,
  rampTopDeckToManaZone,
  salvageFromGraveyard,
  searchDeckForCard,
  sendCreatureToShields
} from './zones.ts';
import { triggerCIP } from './triggers.ts';

const FALLBACK_RACES = [
  'Liquid People',
  'Cyber Lord',
  'Beast Folk',
  'Giant Insect',
  'Armored Dragon',
  'Fire Bird',
  'Human',
  'Initiate',
  'Light Bringer',
  'Guardian',
  'Demon Command',
  'Living Dead',
  'Dark Lord',
  'Dragonoid',
  'Gel Fish',
  'Armorloid',
  'Survivor'
];

/**
 * Returns true when `card` possesses a `$tap` ability ("Instead of having this creature attack...").
 */
export function hasTapAbility(card: CardDefinition): boolean {
  const rules = card.rulesText || '';
  return /\$tap\b|tap ability/i.test(rules);
}

/**
 * Validates whether `creature` can legally tap right now to activate its `$tap` ability.
 */
export function canActivateTapAbility(
  state: GameState,
  creature: CreatureInstance,
  playerId?: PlayerId,
  options?: { ignorePhase?: boolean }
): { valid: boolean; reason?: string } {
  if (state.winner) {
    return { valid: false, reason: 'Game is already over.' };
  }
  const owner = playerId || creature.owner;
  if (state.activePlayer !== owner) {
    return { valid: false, reason: 'You can only use tap abilities on your own turn.' };
  }
  if (!options?.ignorePhase && state.phase !== 'ATTACK' && state.phase !== 'MAIN') {
    return { valid: false, reason: 'Tap abilities can only be used during the Main or Attack phase.' };
  }
  if (state.pendingInteraction) {
    return { valid: false, reason: 'Resolve pending interaction before using a tap ability.' };
  }
  if (!hasTapAbility(creature.card)) {
    return { valid: false, reason: `${creature.card.name} does not have a tap ability.` };
  }
  if (creature.isTapped) {
    return { valid: false, reason: `${creature.card.name} is already tapped.` };
  }

  const ownerState = state.players[owner];
  const caps = getCardCapabilities(creature.card);

  if (caps.cantAttack || creature.tempCantAttack) {
    return { valid: false, reason: `${creature.card.name} cannot attack, so it cannot use its tap ability.` };
  }

  const isEvolution = creature.card.isEvolution || creature.card.type === 'Evolution Creature';
  const hasSA = hasCreatureSpeedAttacker(
    creature,
    ownerState.battleZone,
    state,
    owner
  );
  if (creature.summonedTurn >= state.turn && !isEvolution && !hasSA) {
    return { valid: false, reason: `${creature.card.name} has summoning sickness.` };
  }

  return { valid: true };
}

function collectAvailableRaces(state: GameState, preferOwner: PlayerId): string[] {
  const seen = new Map<string, string>();
  const addFrom = (list: CreatureInstance[]) => {
    for (const c of list) {
      for (const r of getCreatureRaces(c)) {
        const norm = normalizeRace(r);
        if (norm && !seen.has(norm)) seen.set(norm, r);
      }
    }
  };
  addFrom(state.players[preferOwner].battleZone);
  addFrom(state.players[getOpponentId(preferOwner)].battleZone);
  for (const r of FALLBACK_RACES) {
    const norm = normalizeRace(r);
    if (!seen.has(norm)) seen.set(norm, r);
  }
  return Array.from(seen.values());
}

function pickBestDefaultRace(state: GameState, player: PlayerId): string {
  const counts = new Map<string, { display: string; count: number }>();
  for (const c of state.players[player].battleZone) {
    for (const r of getCreatureRaces(c)) {
      const norm = normalizeRace(r);
      if (!norm) continue;
      const cur = counts.get(norm) || { display: r, count: 0 };
      counts.set(norm, { display: cur.display, count: cur.count + 1 });
    }
  }
  const sorted = Array.from(counts.values()).sort((a, b) => b.count - a.count);
  return sorted[0]?.display || 'Liquid People';
}

/**
 * Taps `creatureInstanceId` and resolves its `$tap` ability, emitting ZONE_SELECTION / DECK_SEARCH prompts
 * for interactive human decisions when no explicit `targets` / `selectedRace` were supplied.
 */
export function resolveTapAbility(
  state: GameState,
  creatureInstanceId: string,
  targets?: string[],
  selectedRace?: string
): GameState {
  const found = findCreature(state, creatureInstanceId);
  if (!found) {
    throw new Error(`Creature ${creatureInstanceId} not found in battle zone.`);
  }
  const { creature, owner } = found;
  const check = canActivateTapAbility(state, creature, owner);
  if (!check.valid) {
    throw new Error(check.reason || 'Cannot activate tap ability.');
  }

  const opponent = getOpponentId(owner);
  const nameLower = getCardCapabilities(creature.card).nameLower;

  // Step 1: Transition to ATTACK phase (using a $tap ability occurs in the attack step) & tap the creature immediately
  let nextState: GameState = {
    ...state,
    phase: 'ATTACK',
    players: {
      ...state.players,
      [owner]: {
        ...state.players[owner],
        battleZone: state.players[owner].battleZone.map((c) =>
          c.instanceId === creatureInstanceId ? { ...c, isTapped: true } : c
        )
      }
    },
    actionLog: [...state.actionLog, `${owner} tapped ${creature.card.name} to activate its $tap ability.`]
  };

  const pState = nextState.players[owner];
  const oppState = nextState.players[opponent];

  // --- Choose-a-race $tap abilities (5 cards) ---
  if (
    nameLower.includes('tra rion') ||
    nameLower.includes('hokira') ||
    nameLower.includes('venom worm') ||
    nameLower.includes("gigio's hammer") ||
    nameLower.includes('silvermoon trailblazer')
  ) {
    if (owner === 'player' && nextState.interactiveHuman && !selectedRace && !targets?.length) {
      return enqueueInteraction(nextState, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: creature.card.id,
        sourceCardName: creature.card.name,
        actionKind: 'TAP_CHOOSE_RACE',
        prompt: `${creature.card.name}: Choose a race.`,
        options: [],
        raceOptions: collectAvailableRaces(nextState, owner),
        minSelections: 1,
        maxSelections: 1
      });
    }
    const chosenRace = selectedRace || targets?.[0] || pickBestDefaultRace(nextState, owner);
    const norm = normalizeRace(chosenRace);
    if (nameLower.includes('tra rion')) {
      return {
        ...nextState,
        players: {
          ...nextState.players,
          [owner]: { ...pState, tempEndTurnUntapRaces: [...(pState.tempEndTurnUntapRaces || []), norm] }
        }
      };
    }
    if (nameLower.includes('hokira')) {
      return {
        ...nextState,
        players: {
          ...nextState.players,
          [owner]: {
            ...pState,
            tempRaceBounceOnDestroyThisTurn: [...(pState.tempRaceBounceOnDestroyThisTurn || []), norm]
          }
        }
      };
    }
    if (nameLower.includes('venom worm')) {
      return {
        ...nextState,
        players: {
          ...nextState.players,
          [owner]: { ...pState, tempSlayerRacesThisTurn: [...(pState.tempSlayerRacesThisTurn || []), norm] }
        }
      };
    }
    if (nameLower.includes("gigio's hammer")) {
      return {
        ...nextState,
        players: {
          ...nextState.players,
          [owner]: {
            ...pState,
            battleZone: pState.battleZone.map((c) =>
              getCreatureRaces(c).some((r) => normalizeRace(r) === norm)
                ? { ...c, tempAttacksIfAble: true, tempPowerAttackerBonus: (c.tempPowerAttackerBonus || 0) + 4000 }
                : c
            ),
            tempAttacksIfAbleRacesThisTurn: [...(pState.tempAttacksIfAbleRacesThisTurn || []), norm]
          }
        }
      };
    }
    if (nameLower.includes('silvermoon trailblazer')) {
      return {
        ...nextState,
        players: {
          ...nextState.players,
          [owner]: {
            ...pState,
            tempUnblockableMaxPowerByRace: [
              ...(pState.tempUnblockableMaxPowerByRace || []),
              { race: norm, maxPower: 3000 }
            ]
          }
        }
      };
    }
  }

  // --- Friendly single-creature buff $tap abilities (6 cards) ---
  if (
    nameLower.includes('sopian') ||
    nameLower.includes('biancus') ||
    nameLower.includes('lupa') ||
    nameLower.includes('legionnaire lizard') ||
    nameLower.includes('migasa') ||
    nameLower.includes('mighty bandit')
  ) {
    const isMigasa = nameLower.includes('migasa');
    const candidates = pState.battleZone.filter(
      (c) => !isMigasa || getCardCivilizations(c.card).includes('Fire')
    );
    if (candidates.length === 0) return nextState;

    if (owner === 'player' && nextState.interactiveHuman && !targets?.length) {
      const opts = buildZoneOptions(nextState, 'player', ['battleZone'], (o) =>
        candidates.some((c) => c.instanceId === o.instanceId)
      );
      return enqueueInteraction(nextState, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: creature.card.id,
        sourceCardName: creature.card.name,
        actionKind: 'TAP_BUFF_FRIENDLY_BZ',
        prompt: `${creature.card.name}: Choose a creature in your battle zone to buff.`,
        options: opts,
        minSelections: 1,
        maxSelections: 1,
        contextData: { tapBuffSource: nameLower }
      });
    }

    const chosenId =
      targets?.find((tid) => candidates.some((c) => c.instanceId === tid)) || candidates[0].instanceId;
    return {
      ...nextState,
      players: {
        ...nextState.players,
        [owner]: {
          ...pState,
          battleZone: pState.battleZone.map((c) => {
            if (c.instanceId !== chosenId) return c;
            if (nameLower.includes('sopian') || nameLower.includes('biancus')) return { ...c, tempUnblockable: true };
            if (nameLower.includes('lupa')) return { ...c, tempSlayer: true };
            if (nameLower.includes('legionnaire lizard')) return { ...c, tempSpeedAttacker: true };
            if (nameLower.includes('migasa')) return { ...c, tempDoubleBreaker: true };
            return { ...c, powerModifier: c.powerModifier + 5000 };
          })
        }
      }
    };
  }

  // --- Immediate board-wide / direct-draw / ramp / hand-discard $tap abilities ---
  if (nameLower.includes('neon cluster')) {
    return drawCards(nextState, owner, 2);
  }
  if (nameLower.includes('popple')) {
    return rampTopDeckToManaZone(nextState, owner, 1);
  }
  if (nameLower.includes('crath lade')) {
    return discardRandomHandCards(nextState, opponent, 2);
  }
  if (nameLower.includes('mummy wrap')) {
    nextState = discardRandomHandCards(nextState, owner, 1);
    return discardRandomHandCards(nextState, opponent, 1);
  }
  if (nameLower.includes('gandar')) {
    return {
      ...nextState,
      players: {
        ...nextState.players,
        [owner]: { ...pState, tempUntapLightAtEndTurn: true }
      }
    };
  }
  if (nameLower.includes('king benthos')) {
    return {
      ...nextState,
      players: {
        ...nextState.players,
        [owner]: {
          ...pState,
          battleZone: pState.battleZone.map((c) =>
            getCardCivilizations(c.card).includes('Water') ? { ...c, tempUnblockable: true } : c
          )
        }
      }
    };
  }
  if (nameLower.includes('battleship mutant')) {
    return {
      ...nextState,
      players: {
        ...nextState.players,
        [owner]: {
          ...pState,
          battleZone: pState.battleZone.map((c) =>
            getCardCivilizations(c.card).includes('Darkness')
              ? {
                  ...c,
                  powerModifier: c.powerModifier + 4000,
                  tempDoubleBreaker: true,
                  tempDestroyAfterBattle: true
                }
              : c
          )
        }
      }
    };
  }
  if (nameLower.includes('galiacruse')) {
    return {
      ...nextState,
      players: {
        ...nextState.players,
        [owner]: {
          ...pState,
          battleZone: pState.battleZone.map((c) =>
            getCardCivilizations(c.card).includes('Fire') ? { ...c, tempCanAttackUntapped: true } : c
          )
        }
      }
    };
  }
  if (nameLower.includes('spinning totem')) {
    return {
      ...nextState,
      players: {
        ...nextState.players,
        [owner]: { ...pState, tempNatureShieldBreakOnBlockedThisTurn: true }
      }
    };
  }
  if (nameLower.includes('deklowaz')) {
    const allIds = [...pState.battleZone, ...oppState.battleZone]
      .filter(
        (c) =>
          getCreatureEffectivePower(
            c,
            false,
            nextState.players[c.owner],
            nextState.players[getOpponentId(c.owner)],
            false,
            nextState
          ) <= 3000
      )
      .map((c) => c.instanceId);
    nextState = destroyCreaturesBatch(nextState, allIds);
    const oppNow = nextState.players[opponent];
    const smallHandIdx: number[] = [];
    oppNow.hand.forEach((h, idx) => {
      if (h.card.type.includes('Creature') && (h.card.power ?? 0) <= 3000) {
        smallHandIdx.push(idx);
      }
    });
    if (smallHandIdx.length > 0) {
      nextState = discardHandCardsByIndices(
        nextState,
        opponent,
        smallHandIdx,
        'discarded by Deklowaz <=3000 filter'
      );
    }
    return nextState;
  }

  // --- Targeted / Zone Selection $tap abilities ---
  if (nameLower.includes('aeropica')) {
    const allBZ = [...oppState.battleZone, ...pState.battleZone];
    if (allBZ.length === 0) return nextState;
    if (owner === 'player' && nextState.interactiveHuman && !targets?.length) {
      return enqueueInteraction(nextState, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: creature.card.id,
        sourceCardName: creature.card.name,
        actionKind: 'OPPONENT_BOUNCE_BZ',
        prompt: 'Aeropica: Choose a creature in the battle zone to return to its owner\'s hand.',
        options: [
          ...buildZoneOptions(nextState, opponent, ['battleZone']),
          ...buildZoneOptions(nextState, owner, ['battleZone'])
        ],
        minSelections: 1,
        maxSelections: 1
      });
    }
    const tid = targets?.[0] || oppState.battleZone[0]?.instanceId || pState.battleZone[0].instanceId;
    return bounceCreature(nextState, tid);
  }

  if (nameLower.includes('tank mutant')) {
    if (oppState.battleZone.length === 0) return nextState;
    if (opponent === 'player' && nextState.interactiveHuman && !targets?.length) {
      return enqueueInteraction(nextState, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: creature.card.id,
        sourceCardName: creature.card.name,
        actionKind: 'OPPONENT_SACRIFICE_BZ',
        prompt: 'Tank Mutant: Choose 1 of your creatures in the battle zone to destroy.',
        options: buildZoneOptions(nextState, 'player', ['battleZone']),
        minSelections: 1,
        maxSelections: 1
      });
    }
    const lowest = [...oppState.battleZone].sort((a, b) => (a.card.power ?? 0) - (b.card.power ?? 0))[0];
    return destroyCreature(nextState, lowest.instanceId);
  }

  if (nameLower.includes('chen treg') || nameLower.includes('techno totem')) {
    if (oppState.battleZone.length === 0) return nextState;
    if (owner === 'player' && nextState.interactiveHuman && !targets?.length) {
      return enqueueInteraction(nextState, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: creature.card.id,
        sourceCardName: creature.card.name,
        actionKind: 'PLAYER_TAP_OPP_BZ',
        prompt: `${creature.card.name}: Choose 1 opponent creature to tap.`,
        options: buildZoneOptions(nextState, opponent, ['battleZone']),
        minSelections: 1,
        maxSelections: 1
      });
    }
    const tid = targets?.[0] || oppState.battleZone.find((c) => !c.isTapped)?.instanceId || oppState.battleZone[0].instanceId;
    return {
      ...nextState,
      players: {
        ...nextState.players,
        [opponent]: {
          ...oppState,
          battleZone: oppState.battleZone.map((c) => (c.instanceId === tid ? { ...c, isTapped: true } : c))
        }
      }
    };
  }

  if (nameLower.includes("rikabu's screwdriver")) {
    const oppBlockers = oppState.battleZone.filter((c) =>
      hasCreatureBlocker(c, oppState.battleZone, pState.battleZone, oppState)
    );
    if (oppBlockers.length === 0) {
      return {
        ...nextState,
        actionLog: [
          ...nextState.actionLog,
          "Rikabu's Screwdriver found no opponent creatures with Blocker to destroy."
        ]
      };
    }
    if (owner === 'player' && nextState.interactiveHuman && !targets?.length) {
      return enqueueInteraction(nextState, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: creature.card.id,
        sourceCardName: creature.card.name,
        actionKind: 'OPPONENT_SACRIFICE_BZ',
        prompt: "Rikabu's Screwdriver: Choose 1 opponent creature with Blocker to destroy.",
        options: buildZoneOptions(nextState, opponent, ['battleZone'], (o) =>
          oppBlockers.some((b) => b.instanceId === o.instanceId)
        ),
        minSelections: 1,
        maxSelections: 1
      });
    }
    const tid = targets?.find((id) => oppBlockers.some((b) => b.instanceId === id)) || oppBlockers[0].instanceId;
    return destroyCreature(nextState, tid);
  }

  if (nameLower.includes("kipo's contraption")) {
    const smallOpp = oppState.battleZone.filter(
      (c) => getCreatureEffectivePower(c, false, oppState, pState, false, nextState) <= 2000
    );
    if (smallOpp.length === 0) return nextState;
    if (owner === 'player' && nextState.interactiveHuman && !targets?.length) {
      return enqueueInteraction(nextState, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: creature.card.id,
        sourceCardName: creature.card.name,
        actionKind: 'OPPONENT_SACRIFICE_BZ',
        prompt: "Kipo's Contraption: Choose 1 opponent creature with power 2000 or less to destroy.",
        options: buildZoneOptions(nextState, opponent, ['battleZone'], (o) =>
          smallOpp.some((b) => b.instanceId === o.instanceId)
        ),
        minSelections: 1,
        maxSelections: 1
      });
    }
    const tid = targets?.find((id) => smallOpp.some((b) => b.instanceId === id)) || smallOpp[0].instanceId;
    return destroyCreature(nextState, tid);
  }

  if (nameLower.includes('heavyweight dragon')) {
    const myPower = getCreatureEffectivePower(creature, false, pState, oppState, false, nextState);
    const tappedOpp = oppState.battleZone.filter(
      (c) => c.isTapped && getCreatureEffectivePower(c, false, oppState, pState, false, nextState) < myPower
    );
    if (tappedOpp.length === 0) return nextState;
    if (owner === 'player' && nextState.interactiveHuman && !targets?.length) {
      return enqueueInteraction(nextState, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: creature.card.id,
        sourceCardName: creature.card.name,
        actionKind: 'OPPONENT_SACRIFICE_BZ',
        prompt: `Heavyweight Dragon: Choose up to 2 tapped opponent creatures with total power less than ${myPower}.`,
        options: buildZoneOptions(nextState, opponent, ['battleZone'], (o) =>
          tappedOpp.some((b) => b.instanceId === o.instanceId)
        ),
        minSelections: 0,
        maxSelections: Math.min(2, tappedOpp.length),
        contextData: { maxTotalPower: myPower - 1 }
      });
    }
    const chosen: CreatureInstance[] = [];
    let sum = 0;
    const pool = targets?.length
      ? tappedOpp.filter((c) => targets.includes(c.instanceId))
      : [...tappedOpp].sort(
          (a, b) =>
            getCreatureEffectivePower(b, false, oppState, pState, false, nextState) -
            getCreatureEffectivePower(a, false, oppState, pState, false, nextState)
        );
    for (const c of pool) {
      if (chosen.length >= 2) break;
      const pwr = getCreatureEffectivePower(c, false, oppState, pState, false, nextState);
      if (sum + pwr < myPower) {
        chosen.push(c);
        sum += pwr;
      }
    }
    return destroyCreaturesBatch(nextState, chosen.map((c) => c.instanceId));
  }

  if (nameLower.includes('aqua fencer')) {
    if (oppState.manaZone.length === 0) return nextState;
    if (owner === 'player' && nextState.interactiveHuman && !targets?.length) {
      return enqueueInteraction(nextState, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: creature.card.id,
        sourceCardName: creature.card.name,
        actionKind: 'OPPONENT_MANA_TO_HAND',
        prompt: "Aqua Fencer: Choose 1 card in opponent's mana zone to return to their hand.",
        options: buildZoneOptions(nextState, opponent, ['manaZone']),
        minSelections: 1,
        maxSelections: 1
      });
    }
    const tid = targets?.[0] || oppState.manaZone[0].instanceId;
    const cardM = oppState.manaZone.find((m) => m.instanceId === tid) || oppState.manaZone[0];
    return {
      ...nextState,
      players: {
        ...nextState.players,
        [opponent]: {
          ...oppState,
          manaZone: oppState.manaZone.filter((m) => m.instanceId !== cardM.instanceId),
          hand: [...oppState.hand, { instanceId: cardM.instanceId, card: cardM.card, owner: opponent }]
        }
      }
    };
  }

  if (nameLower.includes('adomis')) {
    const allShields = [
      ...buildZoneOptions(nextState, opponent, ['shields'], undefined, { hideCards: true }),
      ...buildZoneOptions(nextState, owner, ['shields'], undefined, { hideCards: true })
    ];
    if (allShields.length === 0) return nextState;
    if (owner === 'player' && nextState.interactiveHuman && !targets?.length) {
      return enqueueInteraction(nextState, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: creature.card.id,
        sourceCardName: creature.card.name,
        actionKind: 'PLAYER_SHIELD_PEEK',
        prompt: 'Adomis, the Oracle: Choose 1 shield to look at.',
        options: allShields,
        minSelections: 1,
        maxSelections: 1
      });
    }
    return nextState;
  }

  if (nameLower.includes('garatyano')) {
    if (pState.deck.length === 0) return nextState;
    const top3 = pState.deck.slice(0, 3);
    if (owner === 'player' && nextState.interactiveHuman && !targets?.length) {
      return enqueueInteraction(nextState, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: creature.card.id,
        sourceCardName: creature.card.name,
        actionKind: 'GARATYANO_TOP3',
        prompt: 'Garatyano: Select which of your top 3 deck cards should go FIRST on top (in priority order).',
        options: top3.map((d, idx) => ({
          instanceId: d.instanceId,
          zone: 'deck' as const,
          owner,
          card: d.card,
          label: `#${idx + 1}: ${d.card.name}`
        })),
        minSelections: 1,
        maxSelections: top3.length
      });
    }
    return nextState;
  }

  if (nameLower.includes('cosmogold')) {
    const spellMana = pState.manaZone.filter((m) => m.card.type === 'Spell');
    if (spellMana.length === 0) return nextState;
    if (owner === 'player' && nextState.interactiveHuman && !targets?.length) {
      return enqueueInteraction(nextState, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: creature.card.id,
        sourceCardName: creature.card.name,
        actionKind: 'PLAYER_MANA_RECOVERY',
        prompt: 'Cosmogold: Return 1 spell from your mana zone to your hand.',
        options: buildZoneOptions(nextState, owner, ['manaZone'], (o) => o.card.type === 'Spell'),
        minSelections: 1,
        maxSelections: 1
      });
    }
    const chosen = spellMana.find((m) => targets?.includes(m.instanceId)) || spellMana[0];
    return {
      ...nextState,
      players: {
        ...nextState.players,
        [owner]: {
          ...pState,
          manaZone: pState.manaZone.filter((m) => m.instanceId !== chosen.instanceId),
          hand: [...pState.hand, { instanceId: chosen.instanceId, card: chosen.card, owner }]
        }
      }
    };
  }

  if (nameLower.includes('brood shell')) {
    const crMana = pState.manaZone.filter((m) => m.card.type.includes('Creature'));
    if (crMana.length === 0) return nextState;
    if (owner === 'player' && nextState.interactiveHuman && !targets?.length) {
      return enqueueInteraction(nextState, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: creature.card.id,
        sourceCardName: creature.card.name,
        actionKind: 'PLAYER_MANA_RECOVERY',
        prompt: 'Brood Shell: Return 1 creature from your mana zone to your hand.',
        options: buildZoneOptions(nextState, owner, ['manaZone'], (o) => o.card.type.includes('Creature')),
        minSelections: 1,
        maxSelections: 1
      });
    }
    const chosen = crMana.find((m) => targets?.includes(m.instanceId)) || crMana[0];
    return {
      ...nextState,
      players: {
        ...nextState.players,
        [owner]: {
          ...pState,
          manaZone: pState.manaZone.filter((m) => m.instanceId !== chosen.instanceId),
          hand: [...pState.hand, { instanceId: chosen.instanceId, card: chosen.card, owner }]
        }
      }
    };
  }

  if (nameLower.includes('grim soul')) {
    const darkCr = pState.graveyard.filter(
      (g) => g.card.type.includes('Creature') && getCardCivilizations(g.card).includes('Darkness')
    );
    if (darkCr.length === 0) return nextState;
    if (owner === 'player' && nextState.interactiveHuman && !targets?.length) {
      return enqueueInteraction(nextState, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: creature.card.id,
        sourceCardName: creature.card.name,
        actionKind: 'PLAYER_SALVAGE_GY',
        prompt: 'Grim Soul: Choose a Darkness creature from your graveyard to return to your hand.',
        options: buildZoneOptions(
          nextState,
          owner,
          ['graveyard'],
          (o) => o.card.type.includes('Creature') && getCardCivilizations(o.card).includes('Darkness')
        ),
        minSelections: 1,
        maxSelections: 1
      });
    }
    return salvageFromGraveyard(
      nextState,
      owner,
      (c) => c.type.includes('Creature') && getCardCivilizations(c).includes('Darkness'),
      'hand',
      { specificInstanceId: targets?.[0] }
    );
  }

  if (nameLower.includes('tanzanyte')) {
    const crGy = pState.graveyard.filter((g) => g.card.type.includes('Creature'));
    if (crGy.length === 0) return nextState;
    if (owner === 'player' && nextState.interactiveHuman && !targets?.length) {
      return enqueueInteraction(nextState, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: creature.card.id,
        sourceCardName: creature.card.name,
        actionKind: 'PLAYER_SALVAGE_ALL_BY_NAME',
        prompt: 'Tanzanyte: Choose a creature in your graveyard (all copies of that name return to hand).',
        options: buildZoneOptions(nextState, owner, ['graveyard'], (o) => o.card.type.includes('Creature')),
        minSelections: 1,
        maxSelections: 1
      });
    }
    const chosen = crGy.find((g) => targets?.includes(g.instanceId)) || crGy[0];
    const ret = pState.graveyard.filter((g) => g.card.name === chosen.card.name);
    const retIds = new Set(ret.map((r) => r.instanceId));
    return {
      ...nextState,
      players: {
        ...nextState.players,
        [owner]: {
          ...pState,
          graveyard: pState.graveyard.filter((g) => !retIds.has(g.instanceId)),
          hand: [...pState.hand, ...ret]
        }
      }
    };
  }

  if (nameLower.includes('bliss totem')) {
    if (pState.graveyard.length === 0) return nextState;
    if (owner === 'player' && nextState.interactiveHuman && !targets?.length) {
      return enqueueInteraction(nextState, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: creature.card.id,
        sourceCardName: creature.card.name,
        actionKind: 'PLAYER_GRAVEYARD_TO_MANA',
        prompt: 'Bliss Totem: Put up to 3 cards from your graveyard into your mana zone.',
        options: buildZoneOptions(nextState, owner, ['graveyard']),
        minSelections: 0,
        maxSelections: Math.min(3, pState.graveyard.length)
      });
    }
    const chosen = (targets?.length ? pState.graveyard.filter((g) => targets.includes(g.instanceId)) : pState.graveyard).slice(0, 3);
    const chosenIds = new Set(chosen.map((g) => g.instanceId));
    return {
      ...nextState,
      players: {
        ...nextState.players,
        [owner]: {
          ...pState,
          graveyard: pState.graveyard.filter((g) => !chosenIds.has(g.instanceId)),
          manaZone: [...pState.manaZone, ...chosen.map((g) => toManaCard(g))]
        }
      }
    };
  }

  if (nameLower.includes('rondobil')) {
    if (pState.battleZone.length === 0) return nextState;
    if (owner === 'player' && nextState.interactiveHuman && !targets?.length) {
      return enqueueInteraction(nextState, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: creature.card.id,
        sourceCardName: creature.card.name,
        actionKind: 'RONDOBIL_CREATURE_TO_SHIELD',
        prompt: 'Rondobil: Choose 1 of your creatures in the battle zone to add to your shields.',
        options: buildZoneOptions(nextState, owner, ['battleZone']),
        minSelections: 1,
        maxSelections: 1
      });
    }
    const tid = targets?.[0] || creatureInstanceId;
    return sendCreatureToShields(nextState, tid);
  }

  if (nameLower.includes('tangle fist')) {
    if (pState.hand.length === 0) return nextState;
    if (owner === 'player' && nextState.interactiveHuman && !targets?.length) {
      return enqueueInteraction(nextState, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: creature.card.id,
        sourceCardName: creature.card.name,
        actionKind: 'PLAYER_HAND_TO_MANA',
        prompt: 'Tangle Fist: Put up to 3 cards from your hand into your mana zone.',
        options: buildZoneOptions(nextState, owner, ['hand']),
        minSelections: 0,
        maxSelections: Math.min(3, pState.hand.length)
      });
    }
    const chosen = (targets?.length ? pState.hand.filter((h) => targets.includes(h.instanceId)) : []).slice(0, 3);
    if (chosen.length === 0) return nextState;
    const chosenIds = new Set(chosen.map((h) => h.instanceId));
    return {
      ...nextState,
      players: {
        ...nextState.players,
        [owner]: {
          ...pState,
          hand: pState.hand.filter((h) => !chosenIds.has(h.instanceId)),
          manaZone: [...pState.manaZone, ...chosen.map((h) => toManaCard(h))]
        }
      }
    };
  }

  if (nameLower.includes('sky crusher')) {
    for (const pid of [owner, opponent]) {
      const ps = nextState.players[pid];
      if (ps.manaZone.length === 0) continue;
      if (pid === 'player' && nextState.interactiveHuman && !targets?.length) {
        nextState = enqueueInteraction(nextState, {
          type: 'ZONE_SELECTION',
          player: 'player',
          sourceCardId: creature.card.id,
          sourceCardName: creature.card.name,
          actionKind: 'PLAYER_MANA_TO_GY',
          prompt: 'Sky Crusher: Choose 1 card in your mana zone to put into your graveyard.',
          options: buildZoneOptions(nextState, 'player', ['manaZone']),
          minSelections: 1,
          maxSelections: 1
        });
      } else {
        const lost = ps.manaZone[0];
        nextState = {
          ...nextState,
          players: {
            ...nextState.players,
            [pid]: {
              ...ps,
              manaZone: ps.manaZone.slice(1),
              graveyard: [...ps.graveyard, { instanceId: lost.instanceId, card: lost.card, owner: pid }]
            }
          }
        };
      }
    }
    return nextState;
  }

  if (nameLower.includes('charmilia')) {
    if (owner === 'player' && nextState.interactiveHuman && !targets?.length) {
      const validIds = pState.deck
        .filter((ci) => ci.card.type.includes('Creature'))
        .map((ci) => ci.instanceId);
      if (validIds.length > 0) {
        return enqueueInteraction(nextState, {
          type: 'DECK_SEARCH',
          player: 'player',
          sourceCardName: creature.card.name,
          filterDescription: 'Creature',
          validCardInstanceIds: validIds,
          destination: 'hand'
        });
      }
      return nextState;
    }
    return searchDeckForCard(nextState, owner, (c) => c.type.includes('Creature'), 'hand', {
      shuffleAfter: true,
      specificInstanceId: targets?.[0]
    });
  }

  if (nameLower.includes('kachua')) {
    const isDragon = (c: CardDefinition) =>
      getCardCapabilities({ ...c } as CardDefinition).nameLower !== undefined &&
      (c.races || []).some((r) => {
        const nr = normalizeRace(r);
        return nr.includes('dragon') && !nr.includes('dragonoid');
      });
    if (owner === 'player' && nextState.interactiveHuman && !targets?.length) {
      const validIds = pState.deck.filter((ci) => isDragon(ci.card)).map((ci) => ci.instanceId);
      if (validIds.length > 0) {
        return enqueueInteraction(nextState, {
          type: 'DECK_SEARCH',
          player: 'player',
          sourceCardName: 'Kachua, Keeper of the Icegate',
          filterDescription: 'Dragon',
          validCardInstanceIds: validIds,
          destination: 'battleZone'
        });
      }
      return nextState;
    }
    const beforeHandIds = new Set(pState.hand.map((h) => h.instanceId));
    nextState = searchDeckForCard(nextState, owner, isDragon, 'hand', {
      shuffleAfter: true,
      specificInstanceId: targets?.[0],
      preferHighestPower: true
    });
    const drawnDragon = nextState.players[owner].hand.find((h) => !beforeHandIds.has(h.instanceId));
    if (drawnDragon) {
      const summonedDragon: CreatureInstance = {
        instanceId: drawnDragon.instanceId,
        card: drawnDragon.card,
        owner,
        isTapped: false,
        summonedTurn: nextState.turn,
        powerModifier: 0,
        tempSpeedAttacker: true,
        tempDestroyAtEndTurn: true
      };
      nextState = {
        ...nextState,
        players: {
          ...nextState.players,
          [owner]: {
            ...nextState.players[owner],
            hand: nextState.players[owner].hand.filter((h) => h.instanceId !== drawnDragon.instanceId),
            battleZone: [...nextState.players[owner].battleZone, summonedDragon]
          }
        },
        actionLog: [
          ...nextState.actionLog,
          `Kachua put ${drawnDragon.card.name} from deck into the battle zone (Speed Attacker, destroys at end of turn).`
        ]
      };
      return triggerCIP(nextState, owner, summonedDragon);
    }
    return nextState;
  }

  return nextState;
}
