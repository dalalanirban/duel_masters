import type { CardDefinition } from '../types/card.ts';
import type {
  AttackTarget,
  CardInstance,
  CreatureInstance,
  GameState,
  ManaCardInstance,
  PlayerId,
  PlayerState
} from './types.ts';
import {
  getCardCapabilities,
  getCardCivilizations,
  getCreatureRaces,
  getOpponentId,
  hasDragonRace,
  normalizeRace
} from './cardUtils.ts';
import {
  getCreatureEffectivePower,
  hasCreatureBlocker
} from './continuous.ts';
import { isUntargetableByOpponent } from './targeting.ts';
import { toManaCard } from './mana.ts';
import { shuffleCards } from './state.ts';
import { buildZoneOptions, enqueueInteraction } from './interactionHelpers.ts';
import {
  addShieldFromDeck,
  bounceCreature,
  deEvolveCreature,
  destroyCreature,
  destroyCreaturesBatch,
  discardHandCardsByIndices,
  discardRandomHandCards,
  drawCards,
  findCreature,
  makeShieldId,
  moveOwnShieldsToHand,
  rampTopDeckToManaZone,
  salvageFromGraveyard,
  searchDeckForCard,
  sendCreatureToManaZone
} from './zones.ts';

export interface CardEffectDefinition {
  onSpell?: (
    state: GameState,
    player: PlayerId,
    card: CardDefinition,
    targets?: string[]
  ) => GameState;
  onCIP?: (
    state: GameState,
    player: PlayerId,
    creature: CreatureInstance,
    targets?: string[]
  ) => GameState;
  onAttack?: (
    state: GameState,
    player: PlayerId,
    attacker: CreatureInstance,
    target: AttackTarget
  ) => GameState;
}

export const CARD_EFFECT_REGISTRY = new Map<string, CardEffectDefinition>();

function registerCard(
  name: string,
  def: CardEffectDefinition
): void {
  CARD_EFFECT_REGISTRY.set(name.trim().toLowerCase(), def);
}

type CipRunner = (
  state: GameState,
  player: PlayerId,
  creature: CreatureInstance,
  targets?: string[]
) => GameState;

type SpellRunner = (
  state: GameState,
  player: PlayerId,
  card: CardDefinition,
  targets?: string[]
) => GameState;

let cipRunner: CipRunner | null = null;
let spellRunner: SpellRunner | null = null;

/**
 * Registers runtime dispatch hooks from `triggers.ts` and `spells.ts` so registry helpers
 * can trigger CIPs or free spells without introducing circular ESM module imports.
 */
export function registerEngineDispatchHooks(hooks: {
  triggerCIP?: CipRunner;
  resolveSpellEffect?: SpellRunner;
}): void {
  if (hooks.triggerCIP) cipRunner = hooks.triggerCIP;
  if (hooks.resolveSpellEffect) spellRunner = hooks.resolveSpellEffect;
}

export function runRegisteredCipHook(
  state: GameState,
  player: PlayerId,
  creature: CreatureInstance,
  targets?: string[]
): GameState {
  return cipRunner ? cipRunner(state, player, creature, targets) : state;
}

export function runRegisteredSpellHook(
  state: GameState,
  player: PlayerId,
  card: CardDefinition,
  targets?: string[]
): GameState {
  return spellRunner ? spellRunner(state, player, card, targets) : state;
}

export function dispatchRegisteredSpell(
  state: GameState,
  player: PlayerId,
  card: CardDefinition,
  targets?: string[]
): GameState | null {
  const entry = CARD_EFFECT_REGISTRY.get(card.name.trim().toLowerCase());
  if (!entry?.onSpell) return null;
  return entry.onSpell(state, player, card, targets);
}

export function dispatchRegisteredCIP(
  state: GameState,
  player: PlayerId,
  creature: CreatureInstance,
  targets?: string[]
): GameState | null {
  const entry = CARD_EFFECT_REGISTRY.get(creature.card.name.trim().toLowerCase());
  if (!entry?.onCIP) return null;
  return entry.onCIP(state, player, creature, targets);
}

export function dispatchRegisteredAttack(
  state: GameState,
  player: PlayerId,
  attacker: CreatureInstance,
  target: AttackTarget
): GameState | null {
  const entry = CARD_EFFECT_REGISTRY.get(attacker.card.name.trim().toLowerCase());
  if (!entry?.onAttack) return null;
  return entry.onAttack(state, player, attacker, target);
}

// ============================================================================
// SHARED COMPOSABLE PRIMITIVES
// ============================================================================

function effPower(
  state: GameState,
  c: CreatureInstance,
  ownerState: PlayerState,
  oppState: PlayerState
): number {
  return getCreatureEffectivePower(c, false, ownerState, oppState, false, state);
}

function getAllBoardRaces(state: GameState, excludeRaceNormalized?: string): string[] {
  const seen = new Map<string, string>();
  const addRace = (r: string) => {
    const norm = normalizeRace(r);
    if (!norm || norm === excludeRaceNormalized) return;
    if (!seen.has(norm)) seen.set(norm, r);
  };
  for (const pid of ['player', 'opponent'] as const) {
    for (const c of state.players[pid].battleZone) {
      getCreatureRaces(c).forEach(addRace);
    }
    for (const h of state.players[pid].hand) {
      (h.card.races || []).forEach(addRace);
    }
  }
  const defaults = [
    'Guardian',
    'Angel Command',
    'Liquid People',
    'Cyber Lord',
    'Demon Command',
    'Armored Dragon',
    'Human',
    'Beast Folk',
    'Giant Insect',
    'Snow Faerie'
  ];
  defaults.forEach(addRace);
  return Array.from(seen.values());
}

/**
 * Resolves lowest-power creature destruction across both battle zones, prompting on ties.
 */
export function resolveDestroyLowestPowerCreature(
  state: GameState,
  controller: PlayerId,
  sourceCard: CardDefinition,
  targets?: string[]
): GameState {
  const allCreatures = [...state.players.player.battleZone, ...state.players.opponent.battleZone];
  if (allCreatures.length === 0) {
    return {
      ...state,
      actionLog: [...state.actionLog, `${sourceCard.name}: No creatures in the battle zone.`]
    };
  }

  let minPower = Infinity;
  const powered = allCreatures.map((c) => {
    const o = c.owner;
    const opp = getOpponentId(o);
    const p = effPower(state, c, state.players[o], state.players[opp]);
    if (p < minPower) minPower = p;
    return { c, p };
  });

  const tiedAll = powered.filter((x) => x.p === minPower).map((x) => x.c);
  if (tiedAll.length === 1) {
    return destroyCreature(state, tiedAll[0].instanceId);
  }

  // On ties, controller chooses among tied creatures (respecting opponent untargetability)
  const choosableTied = tiedAll.filter(
    (c) => c.owner === controller || !isUntargetableByOpponent(c)
  );
  const pool = choosableTied.length > 0 ? choosableTied : tiedAll;

  if (targets && targets.length > 0) {
    const exact = pool.find((c) => c.instanceId === targets[0]);
    if (exact) return destroyCreature(state, exact.instanceId);
  }

  if (controller === 'player' && state.interactiveHuman) {
    const idSet = new Set(pool.map((c) => c.instanceId));
    const opp = getOpponentId(controller);
    const opts = [
      ...buildZoneOptions(state, opp, ['battleZone'], (o) => idSet.has(o.instanceId)),
      ...buildZoneOptions(state, controller, ['battleZone'], (o) => idSet.has(o.instanceId))
    ];
    return enqueueInteraction(state, {
      type: 'ZONE_SELECTION',
      player: 'player',
      sourceCardId: sourceCard.id,
      sourceCardName: sourceCard.name,
      actionKind: 'OPPONENT_SACRIFICE_BZ',
      prompt: `${sourceCard.name}: Tie at ${minPower} power — choose 1 creature to destroy.`,
      options: opts,
      minSelections: 1,
      maxSelections: 1
    });
  }

  const oppTarget = pool.find((c) => c.owner !== controller);
  return destroyCreature(state, (oppTarget || pool[0]).instanceId);
}

/**
 * Transmogrify resolution: after destroying a creature, owner reveals top cards until a non-evolution creature,
 * puts it into BZ (firing CIP), and puts revealed non-matching cards into graveyard.
 */
export function resolveTransmogrifyReveal(
  state: GameState,
  targetOwner: PlayerId,
  sourceCardName: string
): GameState {
  const ownerState = state.players[targetOwner];
  if (ownerState.deck.length === 0) return state;

  const revealIndex = ownerState.deck.findIndex(
    (d) => d.card.type === 'Creature' && !d.card.isEvolution
  );
  if (revealIndex === -1) {
    return {
      ...state,
      players: {
        ...state.players,
        [targetOwner]: {
          ...ownerState,
          deck: shuffleCards(ownerState.deck)
        }
      },
      actionLog: [
        ...state.actionLog,
        `${sourceCardName}: ${targetOwner} revealed their deck but found no non-evolution creature.`
      ]
    };
  }

  const milled = ownerState.deck.slice(0, revealIndex);
  const picked = ownerState.deck[revealIndex];
  const restDeck = ownerState.deck.slice(revealIndex + 1);

  const summoned: CreatureInstance = {
    instanceId: picked.instanceId,
    card: picked.card,
    owner: targetOwner,
    isTapped: false,
    summonedTurn: state.turn,
    powerModifier: 0
  };

  const nextState: GameState = {
    ...state,
    players: {
      ...state.players,
      [targetOwner]: {
        ...ownerState,
        deck: restDeck,
        graveyard: [...ownerState.graveyard, ...milled],
        battleZone: [...ownerState.battleZone, summoned]
      }
    },
    actionLog: [
      ...state.actionLog,
      `${sourceCardName}: ${targetOwner} revealed ${revealIndex + 1} card(s), put ${picked.card.name} into the battle zone, and put ${milled.length} card(s) into graveyard.`
    ]
  };

  return runRegisteredCipHook(nextState, targetOwner, summoned);
}

/**
 * Simultaneously swaps all mana cards to hand and all hand cards to mana zone tapped
 * (used by Upheaval for both players and Carnival Totem for controller).
 */
export function swapManaAndHandSimultaneously(
  state: GameState,
  playerIds: PlayerId[],
  sourceCardName: string
): GameState {
  let nextPlayers = { ...state.players };
  const logs: string[] = [];

  for (const pid of playerIds) {
    const p = nextPlayers[pid];
    const oldManaToHand: CardInstance[] = p.manaZone.map((m) => ({
      instanceId: m.instanceId,
      card: m.card,
      owner: pid
    }));
    const oldHandToManaTapped: ManaCardInstance[] = p.hand.map((h) =>
      toManaCard(h, true)
    );
    nextPlayers = {
      ...nextPlayers,
      [pid]: {
        ...p,
        hand: oldManaToHand,
        manaZone: oldHandToManaTapped
      }
    };
    logs.push(
      `${pid} swapped ${oldManaToHand.length} mana card(s) to hand and ${oldHandToManaTapped.length} hand card(s) to mana (tapped).`
    );
  }

  return {
    ...state,
    players: nextPlayers,
    actionLog: [...state.actionLog, `${sourceCardName}: ${logs.join(' ')}`]
  };
}

export function executeStaticWarpKeep(
  state: GameState,
  caster: PlayerId,
  casterKeepId?: string,
  oppKeepId?: string
): GameState {
  const opp = getOpponentId(caster);
  const cState = state.players[caster];
  const oState = state.players[opp];

  const cPick =
    (casterKeepId && cState.battleZone.find((c) => c.instanceId === casterKeepId)?.instanceId) ||
    [...cState.battleZone]
      .sort(
        (a, b) =>
          (a.isTapped ? 1 : 0) - (b.isTapped ? 1 : 0) ||
          effPower(state, b, cState, oState) - effPower(state, a, cState, oState)
      )[0]?.instanceId;

  const oPick =
    (oppKeepId && oState.battleZone.find((c) => c.instanceId === oppKeepId)?.instanceId) ||
    [...oState.battleZone]
      .sort(
        (a, b) =>
          (a.isTapped ? 1 : 0) - (b.isTapped ? 1 : 0) ||
          effPower(state, b, oState, cState) - effPower(state, a, oState, cState)
      )[0]?.instanceId;

  return {
    ...state,
    players: {
      ...state.players,
      [caster]: {
        ...cState,
        battleZone: cState.battleZone.map((c) =>
          c.instanceId === cPick ? c : { ...c, isTapped: true }
        )
      },
      [opp]: {
        ...oState,
        battleZone: oState.battleZone.map((c) =>
          c.instanceId === oPick ? c : { ...c, isTapped: true }
        )
      }
    },
    actionLog: [
      ...state.actionLog,
      `Static Warp: Each player chose 1 creature to keep; all other creatures were tapped.`
    ]
  };
}

export function executeMechadragonsBreath(
  state: GameState,
  chosenPower: number,
  sourceName: string = "Mechadragon's Breath"
): GameState {
  const cappedPower = Math.min(6000, Math.max(0, chosenPower));
  const toDestroy: string[] = [];
  for (const pid of ['player', 'opponent'] as const) {
    const opp = getOpponentId(pid);
    for (const c of state.players[pid].battleZone) {
      if (effPower(state, c, state.players[pid], state.players[opp]) === cappedPower) {
        toDestroy.push(c.instanceId);
      }
    }
  }
  const nextState = destroyCreaturesBatch(state, toDestroy);
  return {
    ...nextState,
    actionLog: [
      ...nextState.actionLog,
      `${sourceName}: Chose power ${cappedPower} and destroyed ${toDestroy.length} creature(s).`
    ]
  };
}

export function executeRouletteOfRuin(
  state: GameState,
  caster: PlayerId,
  chosenCost: number,
  sourceName: string = 'Roulette of Ruin'
): GameState {
  let nextState = state;
  const opp = getOpponentId(caster);
  for (const pid of [caster, opp]) {
    const p = nextState.players[pid];
    const handLog = p.hand.map((h) => `${h.card.name} (${h.card.manaCost})`).join(', ') || 'empty';
    const matchingIndices: number[] = [];
    p.hand.forEach((h, idx) => {
      if (h.card.manaCost === chosenCost) matchingIndices.push(idx);
    });
    nextState = {
      ...nextState,
      actionLog: [
        ...nextState.actionLog,
        `${sourceName}: ${pid} showed hand [${handLog}] for cost ${chosenCost}.`
      ]
    };
    if (matchingIndices.length > 0) {
      nextState = discardHandCardsByIndices(
        nextState,
        pid,
        matchingIndices,
        `discarded (cost ${chosenCost})`
      );
    }
  }
  return nextState;
}

export function applySoulswapStep2(
  state: GameState,
  chooser: PlayerId,
  targetOwner: PlayerId,
  chosenManaCardId: string | undefined,
  sourceCardName: string = 'Soulswap'
): GameState {
  const ownerState = state.players[targetOwner];
  const maxCost = ownerState.manaZone.length;
  const candidates = ownerState.manaZone.filter(
    (m) => m.card.type === 'Creature' && !m.card.isEvolution && m.card.manaCost <= maxCost
  );
  if (candidates.length === 0) {
    return {
      ...state,
      actionLog: [
        ...state.actionLog,
        `${sourceCardName}: ${targetOwner} has no non-evolution creature in mana costing <= ${maxCost}.`
      ]
    };
  }

  const picked =
    (chosenManaCardId && candidates.find((c) => c.instanceId === chosenManaCardId)) ||
    [...candidates].sort(
      (a, b) =>
        chooser === targetOwner
          ? (b.card.power ?? 0) - (a.card.power ?? 0)
          : (a.card.power ?? 0) - (b.card.power ?? 0)
    )[0];

  const summoned: CreatureInstance = {
    instanceId: picked.instanceId,
    card: picked.card,
    owner: targetOwner,
    isTapped: false,
    summonedTurn: state.turn,
    powerModifier: 0
  };

  const nextState: GameState = {
    ...state,
    players: {
      ...state.players,
      [targetOwner]: {
        ...ownerState,
        manaZone: ownerState.manaZone.filter((m) => m.instanceId !== picked.instanceId),
        battleZone: [...ownerState.battleZone, summoned]
      }
    },
    actionLog: [
      ...state.actionLog,
      `${sourceCardName}: ${targetOwner} put ${picked.card.name} from mana zone into the battle zone!`
    ]
  };

  return runRegisteredCipHook(nextState, targetOwner, summoned);
}

// ============================================================================
// GENERIC BOARD WATCHERS (Whenever YOU put X into BZ -> Scream Slicer / Motherboard / Scout / Azaghast / Bakkra / Micute / Zaltan)
// ============================================================================

export function resolveSummonWatchersInTriggers(
  state: GameState,
  summoningPlayer: PlayerId,
  enteringCreature: CreatureInstance
): GameState {
  let nextState = state;
  const enteringCard = enteringCreature.card;
  const enteringRaces = getCreatureRaces(enteringCreature);
  const enteringNormRaces = enteringRaces.map(normalizeRace);
  const isDragonOrDragonoid =
    hasDragonRace(enteringRaces) || enteringNormRaces.includes('dragonoid');
  const isCyber = enteringNormRaces.some((r) => r.includes('cyber'));
  const isCyberVirus = enteringNormRaces.includes('cybervirus');
  const isGhost = enteringNormRaces.includes('ghost');
  const isGuardian = enteringNormRaces.includes('guardian');
  const opp = getOpponentId(summoningPlayer);

  // Snapshot friendly battle zone watchers before removals mutate lists
  const friendlyWatchers = [...nextState.players[summoningPlayer].battleZone];
  for (const w of friendlyWatchers) {
    const wName = getCardCapabilities(w.card).nameLower;

    // 1. Emperor Maroll
    if (w.instanceId !== enteringCreature.instanceId && wName.includes('emperor maroll')) {
      nextState = bounceCreature(nextState, w.instanceId);
    }

    // 2. Vreemah, Freaky Mojo Totem
    if (w.instanceId !== enteringCreature.instanceId && wName.includes('vreemah')) {
      for (const pid of ['player', 'opponent'] as const) {
        const bz = nextState.players[pid].battleZone;
        nextState = {
          ...nextState,
          players: {
            ...nextState.players,
            [pid]: {
              ...nextState.players[pid],
              battleZone: bz.map((c) =>
                getCreatureRaces(c).some((r) => normalizeRace(r) === 'beastfolk')
                  ? { ...c, powerModifier: c.powerModifier + 2000, tempDoubleBreaker: true }
                  : c
              )
            }
          }
        };
      }
    }

    // 3. Scout Cluster: "Whenever you put another creature into the battle zone, return this creature from the battle zone to your hand."
    if (w.instanceId !== enteringCreature.instanceId && wName.includes('scout cluster')) {
      nextState = bounceCreature(nextState, w.instanceId);
    }

    // 4. Marching Motherboard: "Whenever you put another creature that has Cyber in its race into the battle zone, you may draw a card."
    if (
      w.instanceId !== enteringCreature.instanceId &&
      wName.includes('marching motherboard') &&
      isCyber
    ) {
      if (summoningPlayer === 'player' && nextState.interactiveHuman && nextState.players.player.deck.length > 0) {
        nextState = enqueueInteraction(nextState, {
          type: 'OPTIONAL_CHOICE',
          player: 'player',
          sourceCardId: w.card.id,
          sourceInstanceId: w.instanceId,
          abilityName: w.card.name,
          effectType: 'DRAW',
          drawCount: 1,
          prompt: `${w.card.name}: Draw a card for putting ${enteringCard.name} into the battle zone?`
        });
      } else {
        nextState = drawCards(nextState, summoningPlayer, 1);
      }
    }

    // 5. Scream Slicer, Shadow of Fear: Dragonoid or Dragon enters -> destroy lowest power in BZ
    if (wName.includes('scream slicer') && isDragonOrDragonoid) {
      nextState = resolveDestroyLowestPowerCreature(nextState, summoningPlayer, w.card);
    }

    // 6. Bakkra Horn, the Silent: Dragonoid or Dragon enters -> put top card of deck into mana zone
    if (wName.includes('bakkra horn') && isDragonOrDragonoid) {
      nextState = rampTopDeckToManaZone(nextState, summoningPlayer, 1);
    }

    // 7. Azaghast, Tyrant of Shadows: Ghost enters -> may destroy 1 untapped opp creature
    if (wName.includes('azaghast') && isGhost) {
      const untappedOpp = nextState.players[opp].battleZone.filter(
        (c) => !c.isTapped && !isUntargetableByOpponent(c)
      );
      if (untappedOpp.length > 0) {
        if (summoningPlayer === 'player' && nextState.interactiveHuman) {
          const validIds = new Set(untappedOpp.map((c) => c.instanceId));
          nextState = enqueueInteraction(nextState, {
            type: 'ZONE_SELECTION',
            player: 'player',
            sourceCardId: w.card.id,
            sourceCardName: w.card.name,
            actionKind: 'OPPONENT_SACRIFICE_BZ',
            prompt: `${w.card.name}: You may destroy 1 opponent untapped creature.`,
            options: buildZoneOptions(nextState, opp, ['battleZone'], (o) => validIds.has(o.instanceId)),
            minSelections: 0,
            maxSelections: 1
          });
        } else {
          nextState = destroyCreature(nextState, untappedOpp[0].instanceId);
        }
      }
    }

    // 8. Micute, the Oracle: Guardian enters -> may tap 1 opp creature
    if (wName.includes('micute') && isGuardian) {
      const oppTargets = nextState.players[opp].battleZone.filter(
        (c) => !isUntargetableByOpponent(c)
      );
      if (oppTargets.length > 0) {
        if (summoningPlayer === 'player' && nextState.interactiveHuman) {
          const validIds = new Set(oppTargets.map((c) => c.instanceId));
          nextState = enqueueInteraction(nextState, {
            type: 'ZONE_SELECTION',
            player: 'player',
            sourceCardId: w.card.id,
            sourceCardName: w.card.name,
            actionKind: 'PLAYER_TAP_OPP_BZ',
            prompt: `${w.card.name}: Tap 1 opponent creature? (Optional)`,
            options: buildZoneOptions(nextState, opp, ['battleZone'], (o) => validIds.has(o.instanceId)),
            minSelections: 0,
            maxSelections: 1
          });
        } else {
          const t = oppTargets.find((c) => !c.isTapped) ?? oppTargets[0];
          nextState = {
            ...nextState,
            players: {
              ...nextState.players,
              [opp]: {
                ...nextState.players[opp],
                battleZone: nextState.players[opp].battleZone.map((c) =>
                  c.instanceId === t.instanceId ? { ...c, isTapped: true } : c
                )
              }
            },
            actionLog: [...nextState.actionLog, `${w.card.name} tapped ${t.card.name}.`]
          };
        }
      }
    }

    // 9. Zaltan: Cyber Virus enters -> may discard up to 2 cards -> bounce that many BZ creatures
    if (wName.includes('zaltan') && isCyberVirus) {
      const pS = nextState.players[summoningPlayer];
      const oppBZ = nextState.players[opp].battleZone.filter((c) => !isUntargetableByOpponent(c));
      if (pS.hand.length > 0 && oppBZ.length > 0) {
        if (summoningPlayer === 'player' && nextState.interactiveHuman) {
          nextState = enqueueInteraction(nextState, {
            type: 'ZONE_SELECTION',
            player: 'player',
            sourceCardId: w.card.id,
            sourceCardName: w.card.name,
            actionKind: 'PLAYER_DISCARD_FROM_HAND',
            prompt: `${w.card.name}: Discard up to 2 cards from hand to return that many creatures to hand?`,
            options: buildZoneOptions(nextState, 'player', ['hand']),
            minSelections: 0,
            maxSelections: Math.min(2, pS.hand.length),
            contextData: { thenBounceSameCount: true }
          });
        } else {
          nextState = discardRandomHandCards(nextState, summoningPlayer, 1);
          nextState = bounceCreature(nextState, oppBZ[0].instanceId);
        }
      }
    }

    // 10. Tyrant Worm (DM08-035): "When you put another creature into the battle zone, destroy this creature."
    if (w.instanceId !== enteringCreature.instanceId && wName.includes('tyrant worm')) {
      nextState = destroyCreature(nextState, w.instanceId);
    }
  }

  // Global both-player watchers (either player puts a creature or evolves a creature)
  const isEvoEntry =
    Boolean(enteringCard.isEvolution) || enteringCard.type === 'Evolution Creature';
  for (const pid of ['player', 'opponent'] as const) {
    const watchers = [...nextState.players[pid].battleZone];
    for (const w of watchers) {
      if (w.instanceId === enteringCreature.instanceId) continue;
      const wName = getCardCapabilities(w.card).nameLower;

      // Whirling Warrior Malian (DM12-012) & Gandaval's Stapler (DM12-051):
      // "When(ever) another creature is put into (the) battle zone, tap this creature."
      if (
        (wName.includes('whirling warrior malian') || wName.includes("gandaval's stapler")) &&
        !w.isTapped
      ) {
        const curBZ = nextState.players[pid].battleZone;
        nextState = {
          ...nextState,
          players: {
            ...nextState.players,
            [pid]: {
              ...nextState.players[pid],
              battleZone: curBZ.map((c) =>
                c.instanceId === w.instanceId ? { ...c, isTapped: true } : c
              )
            }
          },
          actionLog: [
            ...nextState.actionLog,
            `${w.card.name} tapped because another creature (${enteringCard.name}) was put into the battle zone.`
          ]
        };
      }

      // Copper Locust (DM12-052): "When a player evolves another creature, destroy this creature."
      if (isEvoEntry && wName.includes('copper locust')) {
        nextState = destroyCreature(nextState, w.instanceId);
      }
    }
  }

  return nextState;
}

// ============================================================================
// SPELL HELPERS & REGISTRATIONS (ALL 35 CONFIRMED SILENT NO-OP SPELLS)
// ============================================================================

function countInBothGraveyards(state: GameState, cardNameLower: string): number {
  let count = 0;
  for (const pid of ['player', 'opponent'] as const) {
    for (const g of state.players[pid].graveyard) {
      if (g.card.name.trim().toLowerCase() === cardNameLower) count++;
    }
  }
  return count;
}

registerCard('recon operation', {
  onSpell: (state, player, card) => {
    const opp = getOpponentId(player);
    const oppShields = state.players[opp].shields.filter((s) => !s.isBroken);
    if (oppShields.length === 0) return state;
    const maxPeek = Math.min(3, oppShields.length);
    if (player === 'player' && state.interactiveHuman) {
      return enqueueInteraction(state, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: card.id,
        sourceCardName: card.name,
        actionKind: 'PLAYER_SHIELD_PEEK',
        prompt: `${card.name}: Look at up to ${maxPeek} of opponent's shields.`,
        options: buildZoneOptions(state, opp, ['shields'], undefined, { hideCards: true }),
        minSelections: 0,
        maxSelections: maxPeek
      });
    }
    const peeked = oppShields.slice(0, maxPeek);
    return {
      ...state,
      actionLog: [
        ...state.actionLog,
        `${player} looked at ${peeked.length} opponent shield(s) (${peeked.map((s) => s.card.name).join(', ')}) with ${card.name}.`
      ]
    };
  }
});

registerCard('liquid scope', {
  onSpell: (state, player, card) => {
    const opp = getOpponentId(player);
    const oppS = state.players[opp];
    const handList = oppS.hand.map((h) => h.card.name).join(', ') || 'empty';
    const shieldList =
      oppS.shields.filter((s) => !s.isBroken).map((s) => s.card.name).join(', ') || 'none';
    return {
      ...state,
      actionLog: [
        ...state.actionLog,
        `${player} looked at ${opp}'s hand [${handList}] and shields [${shieldList}] (${card.name}).`
      ]
    };
  }
});

registerCard('eldritch poison', {
  onSpell: (state, player, card, targets) => {
    const caster = state.players[player];
    const darkCreatures = caster.battleZone.filter((c) =>
      getCardCivilizations(c.card).includes('Darkness')
    );
    const manaCreatures = caster.manaZone.filter((m) => m.card.type.includes('Creature'));
    if (darkCreatures.length === 0) return state;

    if (player === 'player' && state.interactiveHuman && !targets?.length) {
      const darkSet = new Set(darkCreatures.map((c) => c.instanceId));
      return enqueueInteraction(state, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: card.id,
        sourceCardName: card.name,
        actionKind: 'PLAYER_SACRIFICE_BZ',
        prompt: `${card.name}: You may destroy 1 of your Darkness creatures to return a creature from mana zone to hand.`,
        options: buildZoneOptions(state, 'player', ['battleZone'], (o) => darkSet.has(o.instanceId)),
        minSelections: 0,
        maxSelections: 1,
        contextData: { thenManaCreatureToHand: true }
      });
    }

    const sacTarget =
      (targets?.[0] && darkCreatures.find((c) => c.instanceId === targets[0])) ||
      [...darkCreatures].sort(
        (a, b) =>
          effPower(state, a, caster, state.players[getOpponentId(player)]) -
          effPower(state, b, caster, state.players[getOpponentId(player)])
      )[0];
    let nextState = destroyCreature(state, sacTarget.instanceId);
    const cAfter = nextState.players[player];
    const mChoices = cAfter.manaZone.filter((m) => m.card.type.includes('Creature'));
    if (mChoices.length > 0 && manaCreatures.length >= 0) {
      const ret =
        (targets?.[1] && mChoices.find((m) => m.instanceId === targets[1])) || mChoices[0];
      nextState = {
        ...nextState,
        players: {
          ...nextState.players,
          [player]: {
            ...cAfter,
            manaZone: cAfter.manaZone.filter((m) => m.instanceId !== ret.instanceId),
            hand: [...cAfter.hand, { instanceId: ret.instanceId, card: ret.card, owner: player }]
          }
        },
        actionLog: [
          ...nextState.actionLog,
          `${card.name}: returned ${ret.card.name} from mana zone to hand.`
        ]
      };
    }
    return nextState;
  }
});

registerCard('ghastly drain', {
  onSpell: (state, player, card, targets) => {
    const unbroken = state.players[player].shields.filter((s) => !s.isBroken);
    if (unbroken.length === 0) return state;
    if (player === 'player' && state.interactiveHuman && !targets?.length) {
      return enqueueInteraction(state, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: card.id,
        sourceCardName: card.name,
        actionKind: 'PLAYER_SHIELD_TO_HAND',
        prompt: `${card.name}: Choose any number of your shields to put into your hand (no Shield Trigger).`,
        options: buildZoneOptions(state, 'player', ['shields'], undefined, { hideCards: true }),
        minSelections: 0,
        maxSelections: unbroken.length,
        contextData: { allowShieldTrigger: false }
      });
    }
    const pickedIds =
      targets && targets.length > 0
        ? unbroken.filter((s) => targets.includes(s.id)).map((s) => s.id)
        : [unbroken[0].id];
    return moveOwnShieldsToHand(state, player, pickedIds, false, card.name);
  }
});

registerCard('aurora of reversal', {
  onSpell: (state, player, card, targets) => {
    const pS = state.players[player];
    const unbroken = pS.shields.filter((s) => !s.isBroken);
    if (unbroken.length === 0) return state;
    if (player === 'player' && state.interactiveHuman && !targets?.length) {
      return enqueueInteraction(state, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: card.id,
        sourceCardName: card.name,
        actionKind: 'PLAYER_SHIELD_TO_MANA',
        prompt: `${card.name}: Choose any number of your shields to put into your mana zone.`,
        options: buildZoneOptions(state, 'player', ['shields'], undefined, { hideCards: true }),
        minSelections: 0,
        maxSelections: unbroken.length
      });
    }
    const moveIds = new Set(
      targets && targets.length > 0
        ? unbroken.filter((s) => targets.includes(s.id)).map((s) => s.id)
        : [unbroken[0].id]
    );
    const moved = unbroken.filter((s) => moveIds.has(s.id));
    if (moved.length === 0) return state;
    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...pS,
          shields: pS.shields.filter((s) => !moveIds.has(s.id)),
          manaZone: [...pS.manaZone, ...moved.map((s) => toManaCard({ instanceId: s.id, card: s.card }))]
        }
      },
      actionLog: [
        ...state.actionLog,
        `${player} put ${moved.length} shield(s) into mana zone (${card.name}).`
      ]
    };
  }
});

registerCard('darkpact', {
  onSpell: (state, player, card, targets) => {
    const pS = state.players[player];
    if (pS.manaZone.length === 0) return state;
    if (player === 'player' && state.interactiveHuman && !targets?.length) {
      return enqueueInteraction(state, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: card.id,
        sourceCardName: card.name,
        actionKind: 'PLAYER_MANA_TO_GY',
        prompt: `${card.name}: Put any number of cards from mana zone into graveyard, then draw that many cards.`,
        options: buildZoneOptions(state, 'player', ['manaZone']),
        minSelections: 0,
        maxSelections: pS.manaZone.length,
        contextData: { drawPerSelection: true }
      });
    }
    const lostIds = new Set(
      targets && targets.length > 0 ? targets : [pS.manaZone[0].instanceId]
    );
    const lost = pS.manaZone.filter((m) => lostIds.has(m.instanceId));
    if (lost.length === 0) return state;
    const afterGym = {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...pS,
          manaZone: pS.manaZone.filter((m) => !lostIds.has(m.instanceId)),
          graveyard: [
            ...pS.graveyard,
            ...lost.map((m) => ({ instanceId: m.instanceId, card: m.card, owner: player }))
          ]
        }
      },
      actionLog: [
        ...state.actionLog,
        `${player} put ${lost.length} mana card(s) into graveyard with ${card.name}.`
      ]
    };
    return drawCards(afterGym, player, lost.length);
  }
});

registerCard('mega detonator', {
  onSpell: (state, player, card, targets) => {
    const pS = state.players[player];
    const maxN = Math.min(pS.hand.length, pS.battleZone.length);
    if (maxN === 0) return state;
    if (player === 'player' && state.interactiveHuman && !targets?.length) {
      return enqueueInteraction(state, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: card.id,
        sourceCardName: card.name,
        actionKind: 'PLAYER_DISCARD_FROM_HAND',
        prompt: `${card.name}: Discard any number of cards from hand; choose that many creatures to gain Double Breaker.`,
        options: buildZoneOptions(state, 'player', ['hand']),
        minSelections: 0,
        maxSelections: maxN,
        contextData: { thenGrantDoubleBreaker: true }
      });
    }
    const discardCount = targets && targets.length > 0 ? Math.min(targets.length, maxN) : 1;
    const discardedIdx =
      targets && targets.length > 0
        ? pS.hand
            .map((h, i) => (targets.includes(h.instanceId) ? i : -1))
            .filter((i) => i !== -1)
            .slice(0, maxN)
        : [0];
    if (discardedIdx.length === 0 && discardCount > 0) discardedIdx.push(0);
    let nextState = discardHandCardsByIndices(state, player, discardedIdx, 'discarded');
    const cNow = nextState.players[player];
    const buffIds = new Set(cNow.battleZone.slice(0, discardedIdx.length).map((c) => c.instanceId));
    nextState = {
      ...nextState,
      players: {
        ...nextState.players,
        [player]: {
          ...cNow,
          battleZone: cNow.battleZone.map((c) =>
            buffIds.has(c.instanceId) ? { ...c, tempDoubleBreaker: true } : c
          )
        }
      },
      actionLog: [
        ...nextState.actionLog,
        `${card.name}: Granted Double Breaker until end of turn to ${buffIds.size} creature(s).`
      ]
    };
    return nextState;
  }
});

registerCard('sword of malevolent death', {
  onSpell: (state, player, card) => {
    const pS = state.players[player];
    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...pS,
          tempSwordMalevolentDeathCount: (pS.tempSwordMalevolentDeathCount || 0) + 1
        }
      },
      actionLog: [
        ...state.actionLog,
        `${player} cast ${card.name}: creatures gain +1000 power while attacking per Darkness mana card until end of turn.`
      ]
    };
  }
});

registerCard('sword of benevolent life', {
  onSpell: (state, player, card) => {
    const pS = state.players[player];
    const lightCount = pS.battleZone.filter((c) =>
      getCardCivilizations(c.card).includes('Light')
    ).length;
    if (lightCount === 0 || pS.battleZone.length === 0) {
      return {
        ...state,
        actionLog: [...state.actionLog, `${player} cast ${card.name} (+0 power).`]
      };
    }
    const bonus = lightCount * 1000;
    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...pS,
          battleZone: pS.battleZone.map((c) => ({ ...c, powerModifier: c.powerModifier + bonus }))
        }
      },
      actionLog: [
        ...state.actionLog,
        `${player} cast ${card.name}: all friendly creatures gained +${bonus} power until end of turn (${lightCount} Light creature(s)).`
      ]
    };
  }
});

registerCard('divine riptide', {
  onSpell: (state, _player, card) => {
    const nextPlayers = { ...state.players };
    for (const pid of ['player', 'opponent'] as const) {
      const p = nextPlayers[pid];
      nextPlayers[pid] = {
        ...p,
        manaZone: [],
        hand: [
          ...p.hand,
          ...p.manaZone.map((m) => ({ instanceId: m.instanceId, card: m.card, owner: pid }))
        ]
      };
    }
    return {
      ...state,
      players: nextPlayers,
      actionLog: [
        ...state.actionLog,
        `${card.name}: Each player returned all cards from their mana zone to their hand.`
      ]
    };
  }
});

registerCard('scheming hands', {
  onSpell: (state, player, card, targets) => {
    const opp = getOpponentId(player);
    const oppS = state.players[opp];
    if (oppS.hand.length === 0) return state;
    if (player === 'player' && state.interactiveHuman && !targets?.length) {
      return enqueueInteraction(state, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: card.id,
        sourceCardName: card.name,
        actionKind: 'OPPONENT_DISCARD_HAND',
        prompt: `${card.name}: Look at opponent's hand and choose 1 card to discard.`,
        options: buildZoneOptions(state, opp, ['hand'], undefined, { hideCards: false }),
        minSelections: 1,
        maxSelections: 1
      });
    }
    let idx = -1;
    if (targets?.[0]) {
      idx = oppS.hand.findIndex((h) => h.instanceId === targets[0]);
    }
    if (idx === -1) {
      const best = oppS.hand
        .map((h, i) => ({ h, i }))
        .sort((a, b) => b.h.card.manaCost - a.h.card.manaCost)[0];
      idx = best.i;
    }
    return discardHandCardsByIndices(state, opp, [idx], 'discarded (Scheming Hands)');
  }
});

registerCard('cyclone panic', {
  onSpell: (state, _player, card) => {
    let nextState = state;
    for (const pid of ['player', 'opponent'] as const) {
      const p = nextState.players[pid];
      const count = p.hand.length;
      if (count > 0) {
        const shuffledDeck = shuffleCards([...p.deck, ...p.hand]);
        nextState = {
          ...nextState,
          players: {
            ...nextState.players,
            [pid]: {
              ...p,
              hand: [],
              deck: shuffledDeck
            }
          }
        };
        nextState = drawCards(nextState, pid, count);
      }
    }
    return {
      ...nextState,
      actionLog: [
        ...nextState.actionLog,
        `${card.name}: Each player shuffled their hand into deck and drew that many cards.`
      ]
    };
  }
});

registerCard('invincible technology', {
  onSpell: (state, player, card, targets) => {
    const pS = state.players[player];
    if (pS.deck.length === 0) return state;
    if (player === 'player' && state.interactiveHuman && !targets?.length) {
      return enqueueInteraction(state, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: card.id,
        sourceCardName: card.name,
        actionKind: 'PLAYER_DECK_TO_HAND_MULTI',
        prompt: `${card.name}: Choose any number of cards from your deck to add to hand (then shuffle deck).`,
        options: buildZoneOptions(state, 'player', ['deck']),
        minSelections: 0,
        maxSelections: pS.deck.length
      });
    }
    const chosen =
      targets && targets.length > 0
        ? pS.deck.filter((d) => targets.includes(d.instanceId))
        : pS.deck.slice(0, Math.min(3, pS.deck.length));
    const chosenSet = new Set(chosen.map((c) => c.instanceId));
    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...pS,
          deck: shuffleCards(pS.deck.filter((d) => !chosenSet.has(d.instanceId))),
          hand: [...pS.hand, ...chosen]
        }
      },
      actionLog: [
        ...state.actionLog,
        `${player} searched deck with ${card.name} and added ${chosen.length} card(s) to hand.`
      ]
    };
  }
});

registerCard('shock hurricane', {
  onSpell: (state, player, card, targets) => {
    const opp = getOpponentId(player);
    const pBZ = state.players[player].battleZone;
    const oppChoosable = state.players[opp].battleZone.filter((c) => !isUntargetableByOpponent(c));
    if (pBZ.length === 0) return state;

    if (player === 'player' && state.interactiveHuman && !targets?.length) {
      return enqueueInteraction(state, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: card.id,
        sourceCardName: card.name,
        actionKind: 'PLAYER_BOUNCE_OWN_FOR_OPP',
        prompt: `${card.name}: Return any number of your creatures to hand, then return up to that many opponent creatures.`,
        options: buildZoneOptions(state, 'player', ['battleZone']),
        minSelections: 0,
        maxSelections: pBZ.length
      });
    }

    const ownCount =
      targets && targets.length > 0
        ? targets.filter((tid) => pBZ.some((c) => c.instanceId === tid)).length
        : Math.min(1, pBZ.length);
    const ownToBounce =
      targets && targets.length > 0
        ? targets.filter((tid) => pBZ.some((c) => c.instanceId === tid))
        : [pBZ[0].instanceId];

    let nextState = state;
    for (const id of ownToBounce) {
      nextState = bounceCreature(nextState, id);
    }
    const oppNow = nextState.players[opp].battleZone.filter((c) => !isUntargetableByOpponent(c));
    const oppToBounce =
      targets && targets.length > 0
        ? targets.filter((tid) => oppChoosable.some((c) => c.instanceId === tid)).slice(0, ownCount)
        : oppNow.slice(0, ownCount).map((c) => c.instanceId);
    for (const id of oppToBounce) {
      nextState = bounceCreature(nextState, id);
    }
    return nextState;
  }
});

registerCard('future slash', {
  onSpell: (state, player, card, targets) => {
    const opp = getOpponentId(player);
    const oppS = state.players[opp];
    if (oppS.deck.length === 0) return state;
    if (player === 'player' && state.interactiveHuman && !targets?.length) {
      return enqueueInteraction(state, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: card.id,
        sourceCardName: card.name,
        actionKind: 'OPPONENT_DECK_TO_GY',
        prompt: `${card.name}: Choose up to 2 cards from opponent's deck to put into opponent's graveyard.`,
        options: buildZoneOptions(state, opp, ['deck']),
        minSelections: 0,
        maxSelections: Math.min(2, oppS.deck.length)
      });
    }
    const chosen =
      targets && targets.length > 0
        ? oppS.deck.filter((d) => targets.includes(d.instanceId)).slice(0, 2)
        : [...oppS.deck].sort((a, b) => b.card.manaCost - a.card.manaCost).slice(0, 2);
    const chosenSet = new Set(chosen.map((c) => c.instanceId));
    return {
      ...state,
      players: {
        ...state.players,
        [opp]: {
          ...oppS,
          deck: shuffleCards(oppS.deck.filter((d) => !chosenSet.has(d.instanceId))),
          graveyard: [...oppS.graveyard, ...chosen]
        }
      },
      actionLog: [
        ...state.actionLog,
        `${card.name}: Put ${chosen.map((c) => c.card.name).join(', ')} from ${opp}'s deck into graveyard.`
      ]
    };
  }
});

registerCard('intense evil', {
  onSpell: (state, player, card, targets) => {
    const pS = state.players[player];
    if (pS.battleZone.length === 0) return state;
    if (player === 'player' && state.interactiveHuman && !targets?.length) {
      return enqueueInteraction(state, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: card.id,
        sourceCardName: card.name,
        actionKind: 'PLAYER_SACRIFICE_BZ',
        prompt: `${card.name}: Destroy any number of your creatures, then draw that many cards.`,
        options: buildZoneOptions(state, 'player', ['battleZone']),
        minSelections: 0,
        maxSelections: pS.battleZone.length,
        contextData: { drawPerSelection: true }
      });
    }
    const sacIds =
      targets && targets.length > 0
        ? targets.filter((id) => pS.battleZone.some((c) => c.instanceId === id))
        : [
            [...pS.battleZone].sort(
              (a, b) =>
                effPower(state, a, pS, state.players[getOpponentId(player)]) -
                effPower(state, b, pS, state.players[getOpponentId(player)])
            )[0].instanceId
          ];
    if (sacIds.length === 0) return state;
    const afterSac = destroyCreaturesBatch(state, sacIds);
    return drawCards(afterSac, player, sacIds.length);
  }
});

registerCard("pangaea's will", {
  onSpell: (state, player, card, targets) => {
    const opp = getOpponentId(player);
    const evoTargets = state.players[opp].battleZone.filter(
      (c) => !isUntargetableByOpponent(c) && (c.card.isEvolution || c.card.type === 'Evolution Creature')
    );
    if (evoTargets.length === 0) return state;
    if (player === 'player' && state.interactiveHuman && !targets?.length) {
      const idSet = new Set(evoTargets.map((c) => c.instanceId));
      return enqueueInteraction(state, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: card.id,
        sourceCardName: card.name,
        actionKind: 'DE_EVOLVE_TO_MANA',
        prompt: `${card.name}: Choose 1 opponent evolution creature to put its top card into mana zone.`,
        options: buildZoneOptions(state, opp, ['battleZone'], (o) => idSet.has(o.instanceId)),
        minSelections: 1,
        maxSelections: 1
      });
    }
    const target =
      (targets?.[0] && evoTargets.find((c) => c.instanceId === targets[0])) || evoTargets[0];
    return deEvolveCreature(state, target.instanceId, 'manaZone', card.name);
  }
});

registerCard('slash charger', {
  onSpell: (state, player, card, targets) => {
    const opp = getOpponentId(player);
    const hasOppDeck = state.players[opp].deck.length > 0;
    const hasOwnDeck = state.players[player].deck.length > 0;
    if (!hasOppDeck && !hasOwnDeck) return state;
    if (player === 'player' && state.interactiveHuman && !targets?.length) {
      const opts = [
        ...buildZoneOptions(state, opp, ['deck']),
        ...buildZoneOptions(state, 'player', ['deck'])
      ];
      return enqueueInteraction(state, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: card.id,
        sourceCardName: card.name,
        actionKind: 'SEARCH_DECK_TO_GY',
        prompt: `${card.name}: Search a player's deck and put 1 card into that player's graveyard.`,
        options: opts,
        minSelections: 0,
        maxSelections: 1
      });
    }
    const targetOwner: PlayerId = hasOppDeck ? opp : player;
    const deckOwnerState = state.players[targetOwner];
    const picked =
      (targets?.[0] && deckOwnerState.deck.find((d) => d.instanceId === targets[0])) ||
      [...deckOwnerState.deck].sort((a, b) => b.card.manaCost - a.card.manaCost)[0];
    return {
      ...state,
      players: {
        ...state.players,
        [targetOwner]: {
          ...deckOwnerState,
          deck: shuffleCards(deckOwnerState.deck.filter((d) => d.instanceId !== picked.instanceId)),
          graveyard: [...deckOwnerState.graveyard, picked]
        }
      },
      actionLog: [
        ...state.actionLog,
        `${card.name}: Put ${picked.card.name} from ${targetOwner}'s deck into graveyard.`
      ]
    };
  }
});

registerCard('relentless blitz', {
  onSpell: (state, player, card, targets) => {
    const caster = state.players[player];
    const raceOpts = getAllBoardRaces(state);
    if (player === 'player' && state.interactiveHuman && !targets?.length) {
      return enqueueInteraction(state, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: card.id,
        sourceCardName: card.name,
        actionKind: 'SPELL_CHOOSE_RACE',
        prompt: `${card.name}: Choose a race (creatures of that race can attack untapped creatures & can't be blocked while attacking a creature).`,
        options: [],
        raceOptions: raceOpts,
        minSelections: 1,
        maxSelections: 1
      });
    }
    const chosenRace =
      targets?.[0] ||
      (caster.battleZone[0] ? getCreatureRaces(caster.battleZone[0])[0] : raceOpts[0]) ||
      'Guardian';
    const norm = normalizeRace(chosenRace);
    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...caster,
          tempAttackUntappedRacesThisTurn: [...(caster.tempAttackUntappedRacesThisTurn || []), norm],
          tempUnblockableVsCreaturesRacesThisTurn: [
            ...(caster.tempUnblockableVsCreaturesRacesThisTurn || []),
            norm
          ]
        }
      },
      actionLog: [
        ...state.actionLog,
        `${player} cast ${card.name} naming "${chosenRace}".`
      ]
    };
  }
});

registerCard('dance of the sproutlings', {
  onSpell: (state, player, card, targets) => {
    const caster = state.players[player];
    const handCreatures = caster.hand.filter((h) => h.card.type.includes('Creature'));
    const handRaces = Array.from(
      new Set(handCreatures.flatMap((h) => h.card.races || []))
    );
    const raceOpts = handRaces.length > 0 ? handRaces : getAllBoardRaces(state);
    if (player === 'player' && state.interactiveHuman && !targets?.length) {
      return enqueueInteraction(state, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: card.id,
        sourceCardName: card.name,
        actionKind: 'SPELL_CHOOSE_RACE',
        prompt: `${card.name}: Choose a race, then put any number of creatures of that race from your hand into mana.`,
        options: [],
        raceOptions: raceOpts,
        minSelections: 1,
        maxSelections: 1
      });
    }
    const chosenRace = targets?.[0] || handRaces[0] || raceOpts[0];
    if (!chosenRace || handCreatures.length === 0) return state;
    const norm = normalizeRace(chosenRace);
    const moved = handCreatures.filter((h) =>
      (h.card.races || []).some((r) => normalizeRace(r) === norm)
    );
    if (moved.length === 0) return state;
    const movedSet = new Set(moved.map((m) => m.instanceId));
    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...caster,
          hand: caster.hand.filter((h) => !movedSet.has(h.instanceId)),
          manaZone: [...caster.manaZone, ...moved.map((m) => toManaCard(m))]
        }
      },
      actionLog: [
        ...state.actionLog,
        `${player} cast ${card.name} (${chosenRace}) and put ${moved.length} creature(s) from hand into mana.`
      ]
    };
  }
});

registerCard('rapid reincarnation', {
  onSpell: (state, player, card, targets) => {
    const caster = state.players[player];
    if (caster.battleZone.length === 0) return state;
    if (player === 'player' && state.interactiveHuman && !targets?.length) {
      return enqueueInteraction(state, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: card.id,
        sourceCardName: card.name,
        actionKind: 'RAPID_REINCARNATION_SACRIFICE',
        prompt: `${card.name}: You may destroy 1 of your creatures, then put a creature from hand costing <= mana into BZ.`,
        options: buildZoneOptions(state, 'player', ['battleZone']),
        minSelections: 0,
        maxSelections: 1
      });
    }
    const sacCreature =
      (targets?.[0] && caster.battleZone.find((c) => c.instanceId === targets[0])) ||
      [...caster.battleZone].sort(
        (a, b) =>
          effPower(state, a, caster, state.players[getOpponentId(player)]) -
          effPower(state, b, caster, state.players[getOpponentId(player)])
      )[0];
    let nextState = destroyCreature(state, sacCreature.instanceId);
    const cAfter = nextState.players[player];
    const maxCost = cAfter.manaZone.length;
    const validHand = cAfter.hand.filter(
      (h) => h.card.type === 'Creature' && !h.card.isEvolution && h.card.manaCost <= maxCost
    );
    if (validHand.length > 0) {
      const picked =
        (targets?.[1] && validHand.find((h) => h.instanceId === targets[1])) ||
        [...validHand].sort((a, b) => (b.card.power ?? 0) - (a.card.power ?? 0))[0];
      const newC: CreatureInstance = {
        instanceId: picked.instanceId,
        card: picked.card,
        owner: player,
        isTapped: false,
        summonedTurn: nextState.turn,
        powerModifier: 0
      };
      nextState = {
        ...nextState,
        players: {
          ...nextState.players,
          [player]: {
            ...cAfter,
            hand: cAfter.hand.filter((h) => h.instanceId !== picked.instanceId),
            battleZone: [...cAfter.battleZone, newC]
          }
        },
        actionLog: [
          ...nextState.actionLog,
          `${card.name}: put ${picked.card.name} from hand into the battle zone!`
        ]
      };
      nextState = runRegisteredCipHook(nextState, player, newC);
    }
    return nextState;
  }
});

registerCard('static warp', {
  onSpell: (state, player, card, targets) => {
    const opp = getOpponentId(player);
    const cBZ = state.players[player].battleZone;
    const oBZ = state.players[opp].battleZone;
    if (cBZ.length === 0 && oBZ.length === 0) return state;
    if (player === 'player' && state.interactiveHuman && cBZ.length > 0 && !targets?.length) {
      return enqueueInteraction(state, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: card.id,
        sourceCardName: card.name,
        actionKind: 'STATIC_WARP_KEEP',
        prompt: `${card.name}: Choose 1 of your creatures to keep untapped; tap the rest of the battle zone.`,
        options: buildZoneOptions(state, 'player', ['battleZone']),
        minSelections: 1,
        maxSelections: 1
      });
    }
    return executeStaticWarpKeep(state, player, targets?.[0], targets?.[1]);
  }
});

registerCard('siren concerto', {
  onSpell: (state, player, card, targets) => {
    const caster = state.players[player];
    if (caster.manaZone.length === 0) {
      if (caster.hand.length === 0) return state;
      const putM = caster.hand[0];
      return {
        ...state,
        players: {
          ...state.players,
          [player]: {
            ...caster,
            hand: caster.hand.slice(1),
            manaZone: [...caster.manaZone, toManaCard(putM)]
          }
        },
        actionLog: [
          ...state.actionLog,
          `${card.name}: put ${putM.card.name} from hand into mana zone.`
        ]
      };
    }
    if (player === 'player' && state.interactiveHuman && !targets?.length) {
      return enqueueInteraction(state, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: card.id,
        sourceCardName: card.name,
        actionKind: 'PLAYER_MANA_RECOVERY',
        prompt: `${card.name}: Step 1 — Put 1 card from your mana zone into your hand.`,
        options: buildZoneOptions(state, 'player', ['manaZone']),
        minSelections: 1,
        maxSelections: 1,
        contextData: { thenHandToMana: true }
      });
    }
    const pickM = (targets?.[0] && caster.manaZone.find((m) => m.instanceId === targets[0])) || caster.manaZone[0];
    const midHand = [...caster.hand, { instanceId: pickM.instanceId, card: pickM.card, owner: player }];
    const midMana = caster.manaZone.filter((m) => m.instanceId !== pickM.instanceId);
    const putH = (targets?.[1] && midHand.find((h) => h.instanceId === targets[1])) || midHand[0];
    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...caster,
          hand: midHand.filter((h) => h.instanceId !== putH.instanceId),
          manaZone: [...midMana, toManaCard(putH)]
        }
      },
      actionLog: [
        ...state.actionLog,
        `${card.name}: returned ${pickM.card.name} from mana to hand and put ${putH.card.name} into mana.`
      ]
    };
  }
});

registerCard('transmogrify', {
  onSpell: (state, player, card, targets) => {
    const opp = getOpponentId(player);
    const choosableOpp = state.players[opp].battleZone.filter((c) => !isUntargetableByOpponent(c));
    const casterBZ = state.players[player].battleZone;
    const allChoosable = [...choosableOpp, ...casterBZ];
    if (allChoosable.length === 0) return state;
    if (player === 'player' && state.interactiveHuman && !targets?.length) {
      const oppIds = new Set(choosableOpp.map((c) => c.instanceId));
      return enqueueInteraction(state, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: card.id,
        sourceCardName: card.name,
        actionKind: 'TRANSMOGRIFY_DESTROY',
        prompt: `${card.name}: You may destroy a creature; its owner reveals from deck until a non-evolution creature and puts it into play.`,
        options: [
          ...buildZoneOptions(state, opp, ['battleZone'], (o) => oppIds.has(o.instanceId)),
          ...buildZoneOptions(state, 'player', ['battleZone'])
        ],
        minSelections: 0,
        maxSelections: 1
      });
    }
    const picked =
      (targets?.[0] && allChoosable.find((c) => c.instanceId === targets[0])) ||
      [...choosableOpp].sort(
        (a, b) =>
          effPower(state, b, state.players[opp], state.players[player]) -
          effPower(state, a, state.players[opp], state.players[player])
      )[0] ||
      casterBZ[0];
    const targetOwner = picked.owner;
    const afterDestroy = destroyCreature(state, picked.instanceId);
    const stillOnBoard = Boolean(findCreature(afterDestroy, picked.instanceId));
    if (stillOnBoard) return afterDestroy;
    return resolveTransmogrifyReveal(afterDestroy, targetOwner, card.name);
  }
});

registerCard('upheaval', {
  onSpell: (state, _player, card) =>
    swapManaAndHandSimultaneously(state, ['player', 'opponent'], card.name)
});

registerCard('soulswap', {
  onSpell: (state, player, card, targets) => {
    const opp = getOpponentId(player);
    const choosableOpp = state.players[opp].battleZone.filter((c) => !isUntargetableByOpponent(c));
    const casterBZ = state.players[player].battleZone;
    const allChoosable = [...casterBZ, ...choosableOpp];
    if (allChoosable.length === 0) return state;

    if (player === 'player' && state.interactiveHuman && !targets?.length) {
      const oppIds = new Set(choosableOpp.map((c) => c.instanceId));
      return enqueueInteraction(state, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: card.id,
        sourceCardName: card.name,
        actionKind: 'SOULSWAP_BZ_TO_MANA',
        prompt: `${card.name}: You may put 1 creature from battle zone into its owner's mana zone, then put a non-evolution creature from that mana zone into play.`,
        options: [
          ...buildZoneOptions(state, 'player', ['battleZone']),
          ...buildZoneOptions(state, opp, ['battleZone'], (o) => oppIds.has(o.instanceId))
        ],
        minSelections: 0,
        maxSelections: 1
      });
    }

    const picked =
      (targets?.[0] && allChoosable.find((c) => c.instanceId === targets[0])) ||
      casterBZ[0] ||
      choosableOpp[0];
    const targetOwner = picked.owner;
    let nextState = sendCreatureToManaZone(state, picked.instanceId);
    const wasRemoved = !findCreature(nextState, picked.instanceId);
    if (!wasRemoved) return nextState;
    return applySoulswapStep2(nextState, player, targetOwner, targets?.[1], card.name);
  }
});

registerCard('roulette of ruin', {
  onSpell: (state, player, card, targets) => {
    const opp = getOpponentId(player);
    const costs = Array.from(
      new Set([
        ...state.players[opp].hand.map((h) => h.card.manaCost),
        ...state.players[player].hand.map((h) => h.card.manaCost),
        1, 2, 3, 4, 5, 6, 7
      ])
    ).sort((a, b) => {
      const oppScore =
        state.players[opp].hand.filter((h) => h.card.manaCost === b).length -
        state.players[player].hand.filter((h) => h.card.manaCost === b).length -
        (state.players[opp].hand.filter((h) => h.card.manaCost === a).length -
          state.players[player].hand.filter((h) => h.card.manaCost === a).length);
      return oppScore !== 0 ? oppScore : a - b;
    });

    if (player === 'player' && state.interactiveHuman && !targets?.length) {
      return enqueueInteraction(state, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: card.id,
        sourceCardName: card.name,
        actionKind: 'CHOOSE_NUMBER',
        prompt: `${card.name}: Choose a mana cost number. Both players show hands and discard all cards of that cost.`,
        options: [],
        raceOptions: costs.map(String),
        minSelections: 1,
        maxSelections: 1
      });
    }
    const chosenCost = targets?.[0] ? parseInt(targets[0], 10) : costs[0];
    return executeRouletteOfRuin(
      state,
      player,
      Number.isFinite(chosenCost) ? chosenCost : costs[0],
      card.name
    );
  }
});

registerCard('live and breathe', {
  onSpell: (state, player, card) => {
    const pS = state.players[player];
    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...pS,
          tempLiveAndBreatheCount: (pS.tempLiveAndBreatheCount || 0) + 1
        }
      },
      actionLog: [
        ...state.actionLog,
        `${player} cast ${card.name}: summoning a creature this turn searches deck for a copy to put into the battle zone.`
      ]
    };
  }
});

registerCard('miraculous plague', {
  onSpell: (state, player, card, targets) => {
    const opp = getOpponentId(player);
    const oppBZ = state.players[opp].battleZone.filter((c) => !isUntargetableByOpponent(c));
    const oppMana = state.players[opp].manaZone;

    if (player === 'player' && state.interactiveHuman && !targets?.length) {
      if (oppBZ.length >= 2) {
        const validSet = new Set(oppBZ.map((c) => c.instanceId));
        return enqueueInteraction(state, {
          type: 'ZONE_SELECTION',
          player: 'player',
          sourceCardId: card.id,
          sourceCardName: card.name,
          actionKind: 'MIRACULOUS_PLAGUE_OPP_CREATURES',
          prompt: `${card.name}: Choose 2 opponent creatures (opponent puts 1 into hand, destroys the other).`,
          options: buildZoneOptions(state, opp, ['battleZone'], (o) => validSet.has(o.instanceId)),
          minSelections: 2,
          maxSelections: 2
        });
      }
      if (oppMana.length >= 2) {
        return enqueueInteraction(state, {
          type: 'ZONE_SELECTION',
          player: 'player',
          sourceCardId: card.id,
          sourceCardName: card.name,
          actionKind: 'MIRACULOUS_PLAGUE_OPP_MANA',
          prompt: `${card.name}: Choose 2 cards in opponent's mana zone (opponent puts 1 to hand, 1 to graveyard).`,
          options: buildZoneOptions(state, opp, ['manaZone']),
          minSelections: 2,
          maxSelections: 2
        });
      }
    }

    let nextState = state;
    const pickedBZ =
      targets && targets.length > 0
        ? oppBZ.filter((c) => targets.includes(c.instanceId)).slice(0, 2)
        : [...oppBZ]
            .sort(
              (a, b) =>
                effPower(state, b, state.players[opp], state.players[player]) -
                effPower(state, a, state.players[opp], state.players[player])
            )
            .slice(0, 2);

    if (pickedBZ.length === 2) {
      // Opponent keeps stronger one in hand, destroys the other (unless opponent === 'player' and interactive)
      const [keepToHand, destroyOther] = [...pickedBZ].sort(
        (a, b) =>
          effPower(nextState, b, nextState.players[opp], nextState.players[player]) -
          effPower(nextState, a, nextState.players[opp], nextState.players[player])
      );
      nextState = bounceCreature(nextState, keepToHand.instanceId);
      nextState = destroyCreature(nextState, destroyOther.instanceId);
    } else if (pickedBZ.length === 1) {
      nextState = bounceCreature(nextState, pickedBZ[0].instanceId);
    }

    const oppManaNow = nextState.players[opp].manaZone;
    const pickedMana =
      targets && targets.length > 0
        ? oppManaNow.filter((m) => targets.includes(m.instanceId)).slice(0, 2)
        : oppManaNow.slice(0, 2);
    if (pickedMana.length === 2) {
      const [toHand, toGY] = pickedMana;
      const oppCur = nextState.players[opp];
      const remSet = new Set([toHand.instanceId, toGY.instanceId]);
      nextState = {
        ...nextState,
        players: {
          ...nextState.players,
          [opp]: {
            ...oppCur,
            manaZone: oppCur.manaZone.filter((m) => !remSet.has(m.instanceId)),
            hand: [...oppCur.hand, { instanceId: toHand.instanceId, card: toHand.card, owner: opp }],
            graveyard: [
              ...oppCur.graveyard,
              { instanceId: toGY.instanceId, card: toGY.card, owner: opp }
            ]
          }
        },
        actionLog: [
          ...nextState.actionLog,
          `${card.name}: ${opp} put ${toHand.card.name} to hand and ${toGY.card.name} to graveyard.`
        ]
      };
    } else if (pickedMana.length === 1) {
      const oppCur = nextState.players[opp];
      const m0 = pickedMana[0];
      nextState = {
        ...nextState,
        players: {
          ...nextState.players,
          [opp]: {
            ...oppCur,
            manaZone: oppCur.manaZone.filter((m) => m.instanceId !== m0.instanceId),
            hand: [...oppCur.hand, { instanceId: m0.instanceId, card: m0.card, owner: opp }]
          }
        }
      };
    }

    return nextState;
  }
});

registerCard('cosmic darts', {
  onSpell: (state, player, card, targets) => {
    const pS = state.players[player];
    const opp = getOpponentId(player);
    const unbroken = pS.shields.filter((s) => !s.isBroken);
    if (unbroken.length === 0) return state;

    if (opp === 'player' && state.interactiveHuman && !targets?.length) {
      return enqueueInteraction(state, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: card.id,
        sourceCardName: card.name,
        actionKind: 'COSMIC_DARTS_PICK_SHIELD',
        prompt: `${card.name}: Choose 1 of your opponent's shields.`,
        options: buildZoneOptions(state, opp, ['shields'], undefined, { hideCards: true }),
        minSelections: 1,
        maxSelections: 1,
        contextData: { caster: player }
      });
    }

    const chosenShield =
      (targets?.[0] && unbroken.find((s) => s.id === targets[0] || s.shieldId === targets[0])) ||
      unbroken[0];

    let nextState: GameState = {
      ...state,
      actionLog: [
        ...state.actionLog,
        `${card.name}: ${opp} chose shield #1 of ${player}, revealing ${chosenShield.card.name}!`
      ]
    };

    if (chosenShield.card.type === 'Spell') {
      if (player === 'player' && nextState.interactiveHuman) {
        return enqueueInteraction(nextState, {
          type: 'OPTIONAL_CHOICE',
          player: 'player',
          sourceCardId: chosenShield.card.id,
          abilityName: card.name,
          effectType: 'CAST_FREE_SPELL',
          freeSpellCard: chosenShield.card,
          freeSpellShieldId: chosenShield.id,
          prompt: `Cosmic Darts revealed Spell "${chosenShield.card.name}"! Cast it immediately for no cost?`
        });
      }
      // Non-interactive: cast spell immediately for free
      const curP = nextState.players[player];
      nextState = {
        ...nextState,
        players: {
          ...nextState.players,
          [player]: {
            ...curP,
            shields: curP.shields.filter((s) => s.id !== chosenShield.id)
          }
        }
      };
      nextState = runRegisteredSpellHook(nextState, player, chosenShield.card);
      const afterP = nextState.players[player];
      nextState = {
        ...nextState,
        players: {
          ...nextState.players,
          [player]: {
            ...afterP,
            graveyard: [
              ...afterP.graveyard,
              { instanceId: chosenShield.id, card: chosenShield.card, owner: player }
            ]
          }
        }
      };
    }

    return nextState;
  }
});

registerCard("mechadragon's breath", {
  onSpell: (state, player, card, targets) => {
    const opp = getOpponentId(player);
    const candidatePowers = new Set<number>();
    for (const pid of ['player', 'opponent'] as const) {
      const other = getOpponentId(pid);
      for (const c of state.players[pid].battleZone) {
        const p = effPower(state, c, state.players[pid], state.players[other]);
        if (p <= 6000) candidatePowers.add(p);
      }
    }
    const standard = [1000, 2000, 3000, 4000, 5000, 6000];
    standard.forEach((p) => candidatePowers.add(p));

    const scorePower = (val: number) => {
      const oppKill = state.players[opp].battleZone.filter(
        (c) => effPower(state, c, state.players[opp], state.players[player]) === val
      ).length;
      const ownKill = state.players[player].battleZone.filter(
        (c) => effPower(state, c, state.players[player], state.players[opp]) === val
      ).length;
      return oppKill - ownKill;
    };
    const sortedPowers = Array.from(candidatePowers).sort((a, b) => {
      const diff = scorePower(b) - scorePower(a);
      return diff !== 0 ? diff : b - a;
    });

    if (player === 'player' && state.interactiveHuman && !targets?.length) {
      return enqueueInteraction(state, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: card.id,
        sourceCardName: card.name,
        actionKind: 'CHOOSE_NUMBER',
        prompt: `${card.name}: Choose a power <= 6000. Destroy all creatures with that power.`,
        options: [],
        raceOptions: sortedPowers.map(String),
        minSelections: 1,
        maxSelections: 1
      });
    }

    const picked = targets?.[0] ? parseInt(targets[0], 10) : sortedPowers[0] ?? 2000;
    return executeMechadragonsBreath(state, Number.isFinite(picked) ? picked : 2000, card.name);
  }
});

// Cloned Spell Family (DM-12)
registerCard('cloned deflector', {
  onSpell: (state, player, card, targets) => {
    const opp = getOpponentId(player);
    const maxTargets = 1 + countInBothGraveyards(state, 'cloned deflector');
    const valid = state.players[opp].battleZone.filter((c) => !isUntargetableByOpponent(c));
    if (valid.length === 0) return state;

    const chosenIds =
      targets && targets.length > 0
        ? targets.filter((id) => valid.some((v) => v.instanceId === id)).slice(0, maxTargets)
        : valid
            .filter((v) => !v.isTapped)
            .concat(valid.filter((v) => v.isTapped))
            .slice(0, Math.min(maxTargets, valid.length))
            .map((v) => v.instanceId);
    if (chosenIds.length === 0) return state;
    const idSet = new Set(chosenIds);
    return {
      ...state,
      players: {
        ...state.players,
        [opp]: {
          ...state.players[opp],
          battleZone: state.players[opp].battleZone.map((c) =>
            idSet.has(c.instanceId) ? { ...c, isTapped: true } : c
          )
        }
      },
      actionLog: [
        ...state.actionLog,
        `${player} tapped ${idSet.size} creature(s) with ${card.name} (${maxTargets} max).`
      ]
    };
  }
});

registerCard('cloned spiral', {
  onSpell: (state, player, card, targets) => {
    const opp = getOpponentId(player);
    const maxTargets = 1 + countInBothGraveyards(state, 'cloned spiral');
    const choosableOpp = state.players[opp].battleZone.filter((c) => !isUntargetableByOpponent(c));
    const choosableAll = [...choosableOpp, ...state.players[player].battleZone];
    if (choosableAll.length === 0) return state;

    const chosenIds =
      targets && targets.length > 0
        ? targets.filter((id) => choosableAll.some((v) => v.instanceId === id)).slice(0, maxTargets)
        : (choosableOpp.length > 0 ? choosableOpp : choosableAll)
            .slice(0, maxTargets)
            .map((c) => c.instanceId);
    let nextState = state;
    for (const id of chosenIds) {
      nextState = bounceCreature(nextState, id);
    }
    return {
      ...nextState,
      actionLog: [
        ...nextState.actionLog,
        `${player} bounced ${chosenIds.length} creature(s) with ${card.name} (${maxTargets} max).`
      ]
    };
  }
});

registerCard('cloned nightmare', {
  onSpell: (state, player, _card) => {
    const opp = getOpponentId(player);
    const totalDiscard = 1 + countInBothGraveyards(state, 'cloned nightmare');
    return discardRandomHandCards(state, opp, totalDiscard);
  }
});

registerCard('cloned blade', {
  onSpell: (state, player, card, targets) => {
    const opp = getOpponentId(player);
    const maxTargets = 1 + countInBothGraveyards(state, 'cloned blade');
    const valid = state.players[opp].battleZone.filter(
      (c) =>
        !isUntargetableByOpponent(c) &&
        effPower(state, c, state.players[opp], state.players[player]) <= 3000
    );
    if (valid.length === 0) return state;

    const chosenIds =
      targets && targets.length > 0
        ? targets.filter((id) => valid.some((v) => v.instanceId === id)).slice(0, maxTargets)
        : [...valid]
            .sort(
              (a, b) =>
                effPower(state, b, state.players[opp], state.players[player]) -
                effPower(state, a, state.players[opp], state.players[player])
            )
            .slice(0, maxTargets)
            .map((v) => v.instanceId);
    const nextState = destroyCreaturesBatch(state, chosenIds);
    return {
      ...nextState,
      actionLog: [
        ...nextState.actionLog,
        `${player} destroyed ${chosenIds.length} creature(s) <= 3000 power with ${card.name} (${maxTargets} max).`
      ]
    };
  }
});

// ============================================================================
// CIP HELPERS & REGISTRATIONS (CONFIRMED BROKEN CIP + PARTIAL-REGEX FIXES)
// ============================================================================

function registerOwnSacrificeCIP(name: string, maxPower?: number) {
  registerCard(name, {
    onCIP: (state, player, creature, targets) => {
      const pS = state.players[player];
      const opp = getOpponentId(player);
      const candidates =
        maxPower !== undefined
          ? pS.battleZone.filter((c) => effPower(state, c, pS, state.players[opp]) <= maxPower)
          : pS.battleZone;
      if (candidates.length === 0) return state;

      if (player === 'player' && state.interactiveHuman && !targets?.length) {
        const idSet = new Set(candidates.map((c) => c.instanceId));
        return enqueueInteraction(state, {
          type: 'ZONE_SELECTION',
          player: 'player',
          sourceCardId: creature.card.id,
          sourceCardName: creature.card.name,
          actionKind: 'PLAYER_SACRIFICE_BZ',
          prompt: `${creature.card.name}: Choose 1 of your creatures${maxPower ? ` with power ${maxPower} or less` : ''} to destroy.`,
          options: buildZoneOptions(state, 'player', ['battleZone'], (o) => idSet.has(o.instanceId)),
          minSelections: 1,
          maxSelections: 1
        });
      }
      const chosen =
        (targets?.[0] && candidates.find((c) => c.instanceId === targets[0])) ||
        [...candidates].sort(
          (a, b) =>
            effPower(state, a, pS, state.players[opp]) -
            effPower(state, b, pS, state.players[opp])
        )[0];
      return destroyCreature(state, chosen.instanceId);
    }
  });
}

registerOwnSacrificeCIP('black feather, shadow of rage');
registerOwnSacrificeCIP('stinger worm');
registerOwnSacrificeCIP('poison worm', 3000);

registerCard('gigaberos', {
  onCIP: (state, player, creature, targets) => {
    const pS = state.players[player];
    const opp = getOpponentId(player);
    const others = pS.battleZone.filter((c) => c.instanceId !== creature.instanceId);
    if (others.length < 2) {
      return destroyCreature(state, creature.instanceId);
    }
    if (targets && targets.length >= 2) {
      const sacIds = targets.filter((id) => others.some((o) => o.instanceId === id)).slice(0, 2);
      if (sacIds.length === 2) return destroyCreaturesBatch(state, sacIds);
    }
    if (player === 'player' && state.interactiveHuman) {
      return enqueueInteraction(state, {
        type: 'OPTIONAL_CHOICE',
        player: 'player',
        sourceCardId: creature.card.id,
        sourceInstanceId: creature.instanceId,
        abilityName: creature.card.name,
        effectType: 'GIGABEROS_SACRIFICE_TWO',
        targetInstanceId: creature.instanceId,
        prompt: `${creature.card.name}: Destroy 2 of your other creatures to keep Gigaberos (or Decline to destroy Gigaberos)?`
      });
    }
    const twoWeakest = [...others]
      .sort(
        (a, b) =>
          effPower(state, a, pS, state.players[opp]) -
          effPower(state, b, pS, state.players[opp])
      )
      .slice(0, 2)
      .map((c) => c.instanceId);
    return destroyCreaturesBatch(state, twoWeakest);
  }
});

registerCard('death cruzer, the annihilator', {
  onCIP: (state, player, creature) => {
    const others = state.players[player].battleZone
      .filter((c) => c.instanceId !== creature.instanceId)
      .map((c) => c.instanceId);
    if (others.length === 0) return state;
    return destroyCreaturesBatch(state, others);
  }
});

function registerOwnManaToGyCIP(name: string, count: number) {
  registerCard(name, {
    onCIP: (state, player, creature, targets) => {
      const pS = state.players[player];
      const pickN = Math.min(count, pS.manaZone.length);
      if (pickN === 0) return state;
      if (player === 'player' && state.interactiveHuman && !targets?.length) {
        return enqueueInteraction(state, {
          type: 'ZONE_SELECTION',
          player: 'player',
          sourceCardId: creature.card.id,
          sourceCardName: creature.card.name,
          actionKind: 'PLAYER_MANA_TO_GY',
          prompt: `${creature.card.name}: Choose ${pickN} card(s) in your mana zone to put into your graveyard.`,
          options: buildZoneOptions(state, 'player', ['manaZone']),
          minSelections: pickN,
          maxSelections: pickN
        });
      }
      const chosen =
        targets && targets.length > 0
          ? pS.manaZone.filter((m) => targets.includes(m.instanceId)).slice(0, pickN)
          : pS.manaZone.slice(0, pickN);
      const idSet = new Set(chosen.map((m) => m.instanceId));
      return {
        ...state,
        players: {
          ...state.players,
          [player]: {
            ...pS,
            manaZone: pS.manaZone.filter((m) => !idSet.has(m.instanceId)),
            graveyard: [
              ...pS.graveyard,
              ...chosen.map((m) => ({ instanceId: m.instanceId, card: m.card, owner: player }))
            ]
          }
        },
        actionLog: [
          ...state.actionLog,
          `${creature.card.name}: ${player} put ${chosen.length} mana card(s) into graveyard.`
        ]
      };
    }
  });
}

registerOwnManaToGyCIP('artisan picora', 1);
registerOwnManaToGyCIP('onslaughter triceps', 1);
registerOwnManaToGyCIP('explosive fighter ucarn', 2);

registerCard('vampire silphy', {
  onCIP: (state, _player, creature) => {
    const ids: string[] = [];
    for (const pid of ['player', 'opponent'] as const) {
      const opp = getOpponentId(pid);
      for (const c of state.players[pid].battleZone) {
        if (effPower(state, c, state.players[pid], state.players[opp]) <= 3000) {
          ids.push(c.instanceId);
        }
      }
    }
    const next = destroyCreaturesBatch(state, ids);
    return {
      ...next,
      actionLog: [
        ...next.actionLog,
        `${creature.card.name} destroyed ${ids.length} creature(s) with power 3000 or less.`
      ]
    };
  }
});

registerCard('galklife dragon', {
  onCIP: (state, _player, creature) => {
    const ids: string[] = [];
    for (const pid of ['player', 'opponent'] as const) {
      const opp = getOpponentId(pid);
      for (const c of state.players[pid].battleZone) {
        if (
          getCardCivilizations(c.card).includes('Light') &&
          effPower(state, c, state.players[pid], state.players[opp]) <= 4000
        ) {
          ids.push(c.instanceId);
        }
      }
    }
    const next = destroyCreaturesBatch(state, ids);
    return {
      ...next,
      actionLog: [
        ...next.actionLog,
        `${creature.card.name} destroyed ${ids.length} Light creature(s) with power 4000 or less.`
      ]
    };
  }
});

registerCard('ballom, master of death', {
  onCIP: (state, _player, creature) => {
    const ids: string[] = [];
    for (const pid of ['player', 'opponent'] as const) {
      for (const c of state.players[pid].battleZone) {
        if (!getCardCivilizations(c.card).includes('Darkness')) {
          ids.push(c.instanceId);
        }
      }
    }
    const next = destroyCreaturesBatch(state, ids);
    return {
      ...next,
      actionLog: [
        ...next.actionLog,
        `${creature.card.name} destroyed ${ids.length} non-Darkness creature(s).`
      ]
    };
  }
});

registerCard('saucer-head shark', {
  onCIP: (state, _player, creature) => {
    const ids: string[] = [];
    for (const pid of ['player', 'opponent'] as const) {
      const opp = getOpponentId(pid);
      for (const c of state.players[pid].battleZone) {
        if (effPower(state, c, state.players[pid], state.players[opp]) <= 2000) {
          ids.push(c.instanceId);
        }
      }
    }
    let next = state;
    for (const id of ids) next = bounceCreature(next, id);
    return {
      ...next,
      actionLog: [
        ...next.actionLog,
        `${creature.card.name} returned ${ids.length} creature(s) with power 2000 or less to hand.`
      ]
    };
  }
});

registerCard('crystal paladin', {
  onCIP: (state, _player, creature) => {
    const ids: string[] = [];
    for (const pid of ['player', 'opponent'] as const) {
      const opp = getOpponentId(pid);
      for (const c of state.players[pid].battleZone) {
        if (hasCreatureBlocker(c, state.players[pid].battleZone, state.players[opp].battleZone, state.players[pid])) {
          ids.push(c.instanceId);
        }
      }
    }
    let next = state;
    for (const id of ids) next = bounceCreature(next, id);
    return {
      ...next,
      actionLog: [
        ...next.actionLog,
        `${creature.card.name} returned ${ids.length} Blocker creature(s) to hand.`
      ]
    };
  }
});

registerCard('king tsunami', {
  onCIP: (state, _player, creature) => {
    const ids = [...state.players.player.battleZone, ...state.players.opponent.battleZone]
      .filter((c) => c.instanceId !== creature.instanceId)
      .map((c) => c.instanceId);
    let next = state;
    for (const id of ids) next = bounceCreature(next, id);
    return {
      ...next,
      actionLog: [
        ...next.actionLog,
        `${creature.card.name} returned ${ids.length} other creature(s) to owners' hands.`
      ]
    };
  }
});

registerCard('extreme crawler', {
  onCIP: (state, player, creature) => {
    const ownOthers = state.players[player].battleZone
      .filter((c) => c.instanceId !== creature.instanceId)
      .map((c) => c.instanceId);
    let next = state;
    for (const id of ownOthers) next = bounceCreature(next, id);
    return next;
  }
});

registerCard('larba geer, the immaculate', {
  onCIP: (state, player, creature) => {
    const opp = getOpponentId(player);
    const oppS = state.players[opp];
    const pS = state.players[player];
    let tappedCount = 0;
    const updatedOpp = oppS.battleZone.map((c) => {
      if (!c.isTapped && hasCreatureBlocker(c, oppS.battleZone, pS.battleZone, oppS)) {
        tappedCount++;
        return { ...c, isTapped: true };
      }
      return c;
    });
    return {
      ...state,
      players: {
        ...state.players,
        [opp]: { ...oppS, battleZone: updatedOpp }
      },
      actionLog: [
        ...state.actionLog,
        `${creature.card.name} tapped ${tappedCount} opponent Blocker(s).`
      ]
    };
  }
});

registerCard('craze valkyrie, the drastic', {
  onCIP: (state, player, creature, targets) => {
    const opp = getOpponentId(player);
    const valid = state.players[opp].battleZone.filter((c) => !isUntargetableByOpponent(c));
    if (valid.length === 0) return state;
    if (player === 'player' && state.interactiveHuman && !targets?.length) {
      const idSet = new Set(valid.map((c) => c.instanceId));
      return enqueueInteraction(state, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: creature.card.id,
        sourceCardName: creature.card.name,
        actionKind: 'PLAYER_TAP_OPP_BZ',
        prompt: `${creature.card.name}: Choose up to 2 opponent creatures to tap.`,
        options: buildZoneOptions(state, opp, ['battleZone'], (o) => idSet.has(o.instanceId)),
        minSelections: 0,
        maxSelections: Math.min(2, valid.length)
      });
    }
    const toTap = new Set(
      targets && targets.length > 0
        ? targets.slice(0, 2)
        : valid
            .filter((c) => !c.isTapped)
            .concat(valid.filter((c) => c.isTapped))
            .slice(0, 2)
            .map((c) => c.instanceId)
    );
    return {
      ...state,
      players: {
        ...state.players,
        [opp]: {
          ...state.players[opp],
          battleZone: state.players[opp].battleZone.map((c) =>
            toTap.has(c.instanceId) ? { ...c, isTapped: true } : c
          )
        }
      },
      actionLog: [
        ...state.actionLog,
        `${creature.card.name} tapped ${toTap.size} opponent creature(s).`
      ]
    };
  }
});

registerCard('rimuel, cloudbreak elemental', {
  onCIP: (state, player, creature, targets) => {
    const opp = getOpponentId(player);
    const untappedLightMana = state.players[player].manaZone.filter(
      (m) => !m.isTapped && getCardCivilizations(m.card).includes('Light')
    ).length;
    const valid = state.players[opp].battleZone.filter((c) => !isUntargetableByOpponent(c));
    const count = Math.min(untappedLightMana, valid.length);
    if (count === 0) return state;

    if (player === 'player' && state.interactiveHuman && !targets?.length) {
      const idSet = new Set(valid.map((c) => c.instanceId));
      return enqueueInteraction(state, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: creature.card.id,
        sourceCardName: creature.card.name,
        actionKind: 'PLAYER_TAP_OPP_BZ',
        prompt: `${creature.card.name}: Tap ${count} opponent creature(s) (1 per untapped Light mana card).`,
        options: buildZoneOptions(state, opp, ['battleZone'], (o) => idSet.has(o.instanceId)),
        minSelections: count,
        maxSelections: count
      });
    }
    const chosen = new Set(
      targets && targets.length > 0
        ? targets.slice(0, count)
        : valid
            .filter((c) => !c.isTapped)
            .concat(valid.filter((c) => c.isTapped))
            .slice(0, count)
            .map((c) => c.instanceId)
    );
    return {
      ...state,
      players: {
        ...state.players,
        [opp]: {
          ...state.players[opp],
          battleZone: state.players[opp].battleZone.map((c) =>
            chosen.has(c.instanceId) ? { ...c, isTapped: true } : c
          )
        }
      },
      actionLog: [
        ...state.actionLog,
        `${creature.card.name} tapped ${chosen.size} opponent creature(s).`
      ]
    };
  }
});

function registerDestroyOppCIP(
  name: string,
  opts: {
    maxPower?: number;
    optional?: boolean;
    maxOppShields?: number;
  }
) {
  registerCard(name, {
    onCIP: (state, player, creature, targets) => {
      const opp = getOpponentId(player);
      const oppS = state.players[opp];
      const pS = state.players[player];
      if (opts.maxOppShields !== undefined) {
        const oppShieldCount = oppS.shields.filter((s) => !s.isBroken).length;
        if (oppShieldCount > opts.maxOppShields) return state;
      }
      const valid = oppS.battleZone.filter(
        (c) =>
          !isUntargetableByOpponent(c) &&
          (opts.maxPower === undefined || effPower(state, c, oppS, pS) <= opts.maxPower)
      );
      if (valid.length === 0) return state;

      if (player === 'player' && state.interactiveHuman && !targets?.length) {
        const idSet = new Set(valid.map((c) => c.instanceId));
        return enqueueInteraction(state, {
          type: 'ZONE_SELECTION',
          player: 'player',
          sourceCardId: creature.card.id,
          sourceCardName: creature.card.name,
          actionKind: 'OPPONENT_SACRIFICE_BZ',
          prompt: `${creature.card.name}: Choose 1 opponent creature${opts.maxPower ? ` with power ${opts.maxPower} or less` : ''} to destroy${opts.optional ? ' (Optional)' : ''}.`,
          options: buildZoneOptions(state, opp, ['battleZone'], (o) => idSet.has(o.instanceId)),
          minSelections: opts.optional ? 0 : 1,
          maxSelections: 1
        });
      }
      const chosen =
        (targets?.[0] && valid.find((c) => c.instanceId === targets[0])) ||
        [...valid].sort(
          (a, b) => effPower(state, b, oppS, pS) - effPower(state, a, oppS, pS)
        )[0];
      return destroyCreature(state, chosen.instanceId);
    }
  });
}

registerDestroyOppCIP('meteosaur', { maxPower: 2000, optional: true });
registerDestroyOppCIP('hurlosaur', { maxPower: 1000, optional: false });
registerDestroyOppCIP('doboulgyser, giant rock beast', { maxPower: 3000, optional: true });
registerDestroyOppCIP('armored decimator valkaizer', { maxPower: 4000, optional: true });
registerDestroyOppCIP('chaos worm', { optional: true });
registerDestroyOppCIP('explosive trooper zalmez', { maxPower: 3000, optional: true, maxOppShields: 2 });

registerCard('punch trooper bronks', {
  onCIP: (state, player, creature, targets) =>
    resolveDestroyLowestPowerCreature(state, player, creature.card, targets)
});

function registerBounceAnyCIP(name: string) {
  registerCard(name, {
    onCIP: (state, player, creature, targets) => {
      const opp = getOpponentId(player);
      const choosableOpp = state.players[opp].battleZone.filter((c) => !isUntargetableByOpponent(c));
      const allChoosable = [...choosableOpp, ...state.players[player].battleZone];
      if (allChoosable.length === 0) return state;

      if (player === 'player' && state.interactiveHuman && !targets?.length) {
        const oppIds = new Set(choosableOpp.map((c) => c.instanceId));
        return enqueueInteraction(state, {
          type: 'ZONE_SELECTION',
          player: 'player',
          sourceCardId: creature.card.id,
          sourceCardName: creature.card.name,
          actionKind: 'OPPONENT_BOUNCE_BZ',
          prompt: `${creature.card.name}: You may choose a creature in the battle zone and return it to its owner's hand.`,
          options: [
            ...buildZoneOptions(state, opp, ['battleZone'], (o) => oppIds.has(o.instanceId)),
            ...buildZoneOptions(state, 'player', ['battleZone'])
          ],
          minSelections: 0,
          maxSelections: 1
        });
      }
      const chosen =
        (targets?.[0] && allChoosable.find((c) => c.instanceId === targets[0])) ||
        (choosableOpp.length > 0
          ? [...choosableOpp].sort(
              (a, b) =>
                effPower(state, b, state.players[opp], state.players[player]) -
                effPower(state, a, state.players[opp], state.players[player])
            )[0]
          : allChoosable[0]);
      return bounceCreature(state, chosen.instanceId);
    }
  });
}

registerBounceAnyCIP('aqua bouncer');
registerBounceAnyCIP('king mazelan');

registerCard('frantic chieftain', {
  onCIP: (state, player, creature, targets) => {
    const valid = state.players[player].battleZone.filter((c) => c.card.manaCost <= 4);
    if (valid.length === 0) return state;
    if (player === 'player' && state.interactiveHuman && !targets?.length) {
      const idSet = new Set(valid.map((c) => c.instanceId));
      return enqueueInteraction(state, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: creature.card.id,
        sourceCardName: creature.card.name,
        actionKind: 'OPPONENT_BOUNCE_BZ',
        prompt: `${creature.card.name}: Return 1 of your creatures that costs 4 or less to hand.`,
        options: buildZoneOptions(state, 'player', ['battleZone'], (o) => idSet.has(o.instanceId)),
        minSelections: 1,
        maxSelections: 1
      });
    }
    const chosen =
      (targets?.[0] && valid.find((c) => c.instanceId === targets[0])) ||
      valid.find((c) => c.instanceId !== creature.instanceId) ||
      valid[0];
    return bounceCreature(state, chosen.instanceId);
  }
});

registerCard('pouch shell', {
  onCIP: (state, player, creature, targets) => {
    const opp = getOpponentId(player);
    const evos = state.players[opp].battleZone.filter(
      (c) => !isUntargetableByOpponent(c) && (c.card.isEvolution || c.card.type === 'Evolution Creature')
    );
    if (evos.length === 0) return state;
    if (player === 'player' && state.interactiveHuman && !targets?.length) {
      const idSet = new Set(evos.map((c) => c.instanceId));
      return enqueueInteraction(state, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: creature.card.id,
        sourceCardName: creature.card.name,
        actionKind: 'DE_EVOLVE_TO_GY',
        prompt: `${creature.card.name}: Choose 1 opponent evolution creature to put its top card into graveyard? (Optional)`,
        options: buildZoneOptions(state, opp, ['battleZone'], (o) => idSet.has(o.instanceId)),
        minSelections: 0,
        maxSelections: 1
      });
    }
    const target = (targets?.[0] && evos.find((c) => c.instanceId === targets[0])) || evos[0];
    return deEvolveCreature(state, target.instanceId, 'graveyard', creature.card.name);
  }
});

// Salvage & Mana-to-Hand CIPs
registerCard('phal eega, dawn guardian', {
  onCIP: (state, player, creature, targets) => {
    const valid = state.players[player].graveyard.filter((g) => g.card.type === 'Spell');
    if (valid.length === 0) return state;
    if (player === 'player' && state.interactiveHuman && !targets?.length) {
      return enqueueInteraction(state, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: creature.card.id,
        sourceCardName: creature.card.name,
        actionKind: 'PLAYER_SALVAGE_GY',
        prompt: `${creature.card.name}: Return a spell from your graveyard to hand? (Optional)`,
        options: buildZoneOptions(state, 'player', ['graveyard'], (o) => o.card.type === 'Spell'),
        minSelections: 0,
        maxSelections: 1
      });
    }
    return salvageFromGraveyard(state, player, (c) => c.type === 'Spell', 'hand', {
      specificInstanceId: targets?.[0]
    });
  }
});

registerCard('king aquakamui', {
  onCIP: (state, player, creature) => {
    const pS = state.players[player];
    const isCommand = (c: CardDefinition) =>
      (c.races || []).some((r) => {
        const nr = normalizeRace(r);
        return nr === 'angelcommand' || nr === 'demoncommand';
      });
    const matched = pS.graveyard.filter((g) => isCommand(g.card));
    if (matched.length === 0) return state;
    const idSet = new Set(matched.map((m) => m.instanceId));
    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...pS,
          graveyard: pS.graveyard.filter((g) => !idSet.has(g.instanceId)),
          hand: [...pS.hand, ...matched]
        }
      },
      actionLog: [
        ...state.actionLog,
        `${creature.card.name}: returned ${matched.length} Angel/Demon Command(s) from graveyard to hand.`
      ]
    };
  }
});

registerCard('diamondia, the blizzard rider', {
  onCIP: (state, player, creature) => {
    const pS = state.players[player];
    const isFaerie = (c: CardDefinition) =>
      (c.races || []).some((r) => normalizeRace(r) === 'snowfaerie');
    const gyFaeries = pS.graveyard.filter((g) => isFaerie(g.card));
    const manaFaeries = pS.manaZone.filter((m) => isFaerie(m.card));
    if (gyFaeries.length === 0 && manaFaeries.length === 0) return state;
    const gySet = new Set(gyFaeries.map((g) => g.instanceId));
    const manaSet = new Set(manaFaeries.map((m) => m.instanceId));
    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...pS,
          graveyard: pS.graveyard.filter((g) => !gySet.has(g.instanceId)),
          manaZone: pS.manaZone.filter((m) => !manaSet.has(m.instanceId)),
          hand: [
            ...pS.hand,
            ...gyFaeries,
            ...manaFaeries.map((m) => ({ instanceId: m.instanceId, card: m.card, owner: player }))
          ]
        }
      },
      actionLog: [
        ...state.actionLog,
        `${creature.card.name}: returned ${gyFaeries.length + manaFaeries.length} Snow Faerie(s) from graveyard and mana zone to hand.`
      ]
    };
  }
});

function registerManaReturnCIP(
  name: string,
  opts: { filter: (c: CardDefinition) => boolean; optional: boolean; count: 'one' | 'all' | 'tapped' }
) {
  registerCard(name, {
    onCIP: (state, player, creature, targets) => {
      const pS = state.players[player];
      const matches = pS.manaZone.filter((m) => opts.filter(m.card) && (opts.count !== 'tapped' || m.isTapped));
      if (matches.length === 0) return state;

      if (opts.count === 'all' || opts.count === 'tapped') {
        const idSet = new Set(matches.map((m) => m.instanceId));
        return {
          ...state,
          players: {
            ...state.players,
            [player]: {
              ...pS,
              manaZone: pS.manaZone.filter((m) => !idSet.has(m.instanceId)),
              hand: [
                ...pS.hand,
                ...matches.map((m) => ({ instanceId: m.instanceId, card: m.card, owner: player }))
              ]
            }
          },
          actionLog: [
            ...state.actionLog,
            `${creature.card.name}: returned ${matches.length} card(s) from mana zone to hand.`
          ]
        };
      }

      if (player === 'player' && state.interactiveHuman && !targets?.length) {
        const idSet = new Set(matches.map((m) => m.instanceId));
        return enqueueInteraction(state, {
          type: 'ZONE_SELECTION',
          player: 'player',
          sourceCardId: creature.card.id,
          sourceCardName: creature.card.name,
          actionKind: 'PLAYER_MANA_RECOVERY',
          prompt: `${creature.card.name}: Return 1 matching card from mana zone to hand${opts.optional ? ' (Optional)' : ''}.`,
          options: buildZoneOptions(state, 'player', ['manaZone'], (o) => idSet.has(o.instanceId)),
          minSelections: opts.optional ? 0 : 1,
          maxSelections: 1
        });
      }
      const chosen = (targets?.[0] && matches.find((m) => m.instanceId === targets[0])) || matches[0];
      return {
        ...state,
        players: {
          ...state.players,
          [player]: {
            ...pS,
            manaZone: pS.manaZone.filter((m) => m.instanceId !== chosen.instanceId),
            hand: [...pS.hand, { instanceId: chosen.instanceId, card: chosen.card, owner: player }]
          }
        },
        actionLog: [
          ...state.actionLog,
          `${creature.card.name}: returned ${chosen.card.name} from mana zone to hand.`
        ]
      };
    }
  });
}

registerManaReturnCIP('lena, vizier of brilliance', { filter: (c) => c.type === 'Spell', optional: true, count: 'one' });
registerManaReturnCIP('syforce, aurora elemental', { filter: (c) => c.type === 'Spell', optional: true, count: 'one' });
registerManaReturnCIP('belix, the explorer', { filter: (c) => c.type === 'Spell', optional: false, count: 'one' });
registerManaReturnCIP('solidskin fish', { filter: () => true, optional: false, count: 'one' });
registerManaReturnCIP('thrash crawler', { filter: () => true, optional: false, count: 'one' });
registerManaReturnCIP('splash zebrafish', { filter: () => true, optional: false, count: 'one' });
registerManaReturnCIP('torpedo cluster', { filter: () => true, optional: false, count: 'one' });
registerManaReturnCIP('spark chemist, shadow of whim', { filter: () => true, optional: false, count: 'all' });
registerManaReturnCIP('earth ripper, talon of rage', { filter: () => true, optional: false, count: 'tapped' });

registerCard('midnight crawler', {
  onCIP: (state, player, creature, targets) => {
    const opp = getOpponentId(player);
    const oppMana = state.players[opp].manaZone;
    if (oppMana.length === 0) return state;
    if (player === 'player' && state.interactiveHuman && !targets?.length) {
      return enqueueInteraction(state, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: creature.card.id,
        sourceCardName: creature.card.name,
        actionKind: 'OPPONENT_MANA_TO_HAND',
        prompt: `${creature.card.name}: Choose 1 card in opponent's mana zone to return to opponent's hand.`,
        options: buildZoneOptions(state, opp, ['manaZone']),
        minSelections: 1,
        maxSelections: 1
      });
    }
    const chosen = (targets?.[0] && oppMana.find((m) => m.instanceId === targets[0])) || oppMana[0];
    return {
      ...state,
      players: {
        ...state.players,
        [opp]: {
          ...state.players[opp],
          manaZone: oppMana.filter((m) => m.instanceId !== chosen.instanceId),
          hand: [
            ...state.players[opp].hand,
            { instanceId: chosen.instanceId, card: chosen.card, owner: opp }
          ]
        }
      },
      actionLog: [
        ...state.actionLog,
        `${creature.card.name}: returned ${chosen.card.name} from ${opp}'s mana zone to hand.`
      ]
    };
  }
});

registerCard('ancient horn, the watcher', {
  onCIP: (state, player, creature) => {
    const pS = state.players[player];
    const unbrokenCount = pS.shields.filter((s) => !s.isBroken).length;
    if (unbrokenCount < 5) return state;
    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...pS,
          manaZone: pS.manaZone.map((m) => ({ ...m, isTapped: false, isSpent: false }))
        }
      },
      actionLog: [
        ...state.actionLog,
        `${creature.card.name}: ${player} untapped all cards in the mana zone.`
      ]
    };
  }
});

registerCard('karate potato', {
  onCIP: (state, player, creature, targets) => {
    const pS = state.players[player];
    if (pS.hand.length === 0) return state;
    if (player === 'player' && state.interactiveHuman && !targets?.length) {
      return enqueueInteraction(state, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: creature.card.id,
        sourceCardName: creature.card.name,
        actionKind: 'PLAYER_HAND_TO_MANA',
        prompt: `${creature.card.name}: Put up to 2 cards from your hand into mana zone? (Optional)`,
        options: buildZoneOptions(state, 'player', ['hand']),
        minSelections: 0,
        maxSelections: Math.min(2, pS.hand.length)
      });
    }
    const moved =
      targets && targets.length > 0
        ? pS.hand.filter((h) => targets.includes(h.instanceId)).slice(0, 2)
        : pS.hand.slice(0, Math.min(2, pS.hand.length));
    const movedSet = new Set(moved.map((m) => m.instanceId));
    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...pS,
          hand: pS.hand.filter((h) => !movedSet.has(h.instanceId)),
          manaZone: [...pS.manaZone, ...moved.map((h) => toManaCard(h))]
        }
      },
      actionLog: [
        ...state.actionLog,
        `${creature.card.name}: ${player} put ${moved.length} card(s) from hand into mana zone.`
      ]
    };
  }
});

registerCard('hurricane crawler', {
  onCIP: (state, player, creature, targets) => {
    const pS = state.players[player];
    const handCount = pS.hand.length;
    if (handCount === 0) return state;
    const newMana = [...pS.manaZone, ...pS.hand.map((h) => toManaCard(h))];
    const midState: GameState = {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...pS,
          hand: [],
          manaZone: newMana
        }
      }
    };
    const pickCount = Math.min(handCount, newMana.length);
    if (player === 'player' && state.interactiveHuman && !targets?.length) {
      return enqueueInteraction(midState, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: creature.card.id,
        sourceCardName: creature.card.name,
        actionKind: 'PLAYER_MANA_RECOVERY',
        prompt: `${creature.card.name}: Choose ${pickCount} card(s) from your mana zone to put into your hand.`,
        options: buildZoneOptions(midState, 'player', ['manaZone']),
        minSelections: pickCount,
        maxSelections: pickCount
      });
    }
    const chosen =
      targets && targets.length > 0
        ? newMana.filter((m) => targets.includes(m.instanceId)).slice(0, pickCount)
        : newMana.slice(0, pickCount);
    const chosenSet = new Set(chosen.map((m) => m.instanceId));
    return {
      ...midState,
      players: {
        ...midState.players,
        [player]: {
          ...midState.players[player],
          manaZone: newMana.filter((m) => !chosenSet.has(m.instanceId)),
          hand: chosen.map((m) => ({ instanceId: m.instanceId, card: m.card, owner: player }))
        }
      },
      actionLog: [
        ...midState.actionLog,
        `${creature.card.name}: moved ${handCount} hand card(s) to mana and returned ${chosen.length} to hand.`
      ]
    };
  }
});

registerCard('carnival totem', {
  onCIP: (state, player, creature) =>
    swapManaAndHandSimultaneously(state, [player], creature.card.name)
});

registerCard('gigandura', {
  onCIP: (state, player, creature, targets) => {
    const opp = getOpponentId(player);
    const oppS = state.players[opp];
    if (oppS.hand.length === 0) return state;

    if (player === 'player' && state.interactiveHuman && !targets?.length) {
      return enqueueInteraction(state, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: creature.card.id,
        sourceCardName: creature.card.name,
        actionKind: 'GIGANDURA_HAND_TO_MANA',
        prompt: `${creature.card.name}: Look at opponent's hand; choose 1 card to put into opponent's mana zone (then move 1 mana card to hand)?`,
        options: buildZoneOptions(state, opp, ['hand'], undefined, { hideCards: false }),
        minSelections: 0,
        maxSelections: 1
      });
    }

    const handPick = (targets?.[0] && oppS.hand.find((h) => h.instanceId === targets[0])) || oppS.hand[0];
    const newOppMana = [...oppS.manaZone, toManaCard(handPick)];
    const remOppHand = oppS.hand.filter((h) => h.instanceId !== handPick.instanceId);
    const manaPick =
      (targets?.[1] && newOppMana.find((m) => m.instanceId === targets[1])) || newOppMana[0];
    return {
      ...state,
      players: {
        ...state.players,
        [opp]: {
          ...oppS,
          hand: [...remOppHand, { instanceId: manaPick.instanceId, card: manaPick.card, owner: opp }],
          manaZone: newOppMana.filter((m) => m.instanceId !== manaPick.instanceId)
        }
      },
      actionLog: [
        ...state.actionLog,
        `${creature.card.name}: put ${handPick.card.name} from ${opp}'s hand into mana and ${manaPick.card.name} into hand.`
      ]
    };
  }
});

// Own Shield to Hand CIPs (with/without ST), Trenchdive Shark, Ularus
function registerOwnShieldToHandCIP(
  name: string,
  opts: { allowShieldTrigger: boolean; count: 'one' | 'all' }
) {
  registerCard(name, {
    onCIP: (state, player, creature, targets) => {
      const unbroken = state.players[player].shields.filter((s) => !s.isBroken);
      if (unbroken.length === 0) return state;
      if (opts.count === 'all') {
        return moveOwnShieldsToHand(
          state,
          player,
          unbroken.map((s) => s.id),
          opts.allowShieldTrigger,
          creature.card.name
        );
      }
      if (player === 'player' && state.interactiveHuman && !targets?.length) {
        return enqueueInteraction(state, {
          type: 'ZONE_SELECTION',
          player: 'player',
          sourceCardId: creature.card.id,
          sourceCardName: creature.card.name,
          actionKind: 'PLAYER_SHIELD_TO_HAND',
          prompt: `${creature.card.name}: Choose 1 of your shields to put into your hand (${opts.allowShieldTrigger ? 'Shield Trigger active' : 'no Shield Trigger'}).`,
          options: buildZoneOptions(state, 'player', ['shields'], undefined, { hideCards: true }),
          minSelections: 1,
          maxSelections: 1,
          contextData: { allowShieldTrigger: opts.allowShieldTrigger }
        });
      }
      const chosenId =
        (targets?.[0] && unbroken.find((s) => s.id === targets[0])?.id) || unbroken[0].id;
      return moveOwnShieldsToHand(state, player, [chosenId], opts.allowShieldTrigger, creature.card.name);
    }
  });
}

registerOwnShieldToHandCIP('baraga, blade of gloom', { allowShieldTrigger: false, count: 'one' });
registerOwnShieldToHandCIP('gigabuster', { allowShieldTrigger: false, count: 'one' });
registerOwnShieldToHandCIP('three-faced ashura fang', { allowShieldTrigger: false, count: 'one' });
registerOwnShieldToHandCIP('benzo, the hidden fury', { allowShieldTrigger: true, count: 'one' });
registerOwnShieldToHandCIP('uliya, the entrancer', { allowShieldTrigger: true, count: 'one' });
registerOwnShieldToHandCIP('necrodragon bryzenaga', { allowShieldTrigger: true, count: 'all' });

registerCard('trenchdive shark', {
  onCIP: (state, player, creature, targets) => {
    const pS = state.players[player];
    if (pS.hand.length === 0) return state;
    if (player === 'player' && state.interactiveHuman && !targets?.length) {
      return enqueueInteraction(state, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: creature.card.id,
        sourceCardName: creature.card.name,
        actionKind: 'TRENCHDIVE_HAND_TO_SHIELD',
        prompt: `${creature.card.name}: Choose up to 2 cards from hand to add to shields (then put same number of shields to hand).`,
        options: buildZoneOptions(state, 'player', ['hand']),
        minSelections: 0,
        maxSelections: Math.min(2, pS.hand.length)
      });
    }
    const addCards =
      targets && targets.length > 0
        ? pS.hand.filter((h) => targets.includes(h.instanceId)).slice(0, 2)
        : [pS.hand[0]];
    if (addCards.length === 0) return state;
    const addSet = new Set(addCards.map((c) => c.instanceId));
    const addedShields = addCards.map((c, idx) => {
      const sid = makeShieldId(player, pS.shields.length + idx);
      return { id: sid, shieldId: sid, card: c.card, isBroken: false };
    });
    const combinedShields = [...pS.shields, ...addedShields];
    const pickedToHand = combinedShields.slice(0, addCards.length);
    const pickSet = new Set(pickedToHand.map((s) => s.id));
    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...pS,
          hand: [
            ...pS.hand.filter((h) => !addSet.has(h.instanceId)),
            ...pickedToHand.map((s) => ({ instanceId: s.id, card: s.card, owner: player }))
          ],
          shields: combinedShields.filter((s) => !pickSet.has(s.id))
        }
      },
      actionLog: [
        ...state.actionLog,
        `${creature.card.name}: ${player} swapped ${addCards.length} hand card(s) with shields (no Shield Trigger).`
      ]
    };
  }
});

registerCard('ularus, punishment elemental', {
  onCIP: (state, player, creature, targets) => {
    const opp = getOpponentId(player);
    const maxCount = state.players[player].battleZone.length;
    if (maxCount === 0) return state;
    const faceDownIds = [
      ...state.players[opp].shields.filter((s) => !s.isBroken && !s.isFaceUp).map((s) => s.id),
      ...state.players[player].shields.filter((s) => !s.isBroken && !s.isFaceUp).map((s) => s.id)
    ];
    if (faceDownIds.length === 0) return state;

    if (player === 'player' && state.interactiveHuman && !targets?.length) {
      const opts = [
        ...buildZoneOptions(state, opp, ['shields'], (o) => faceDownIds.includes(o.instanceId), { hideCards: true }),
        ...buildZoneOptions(state, 'player', ['shields'], (o) => faceDownIds.includes(o.instanceId), { hideCards: true })
      ];
      return enqueueInteraction(state, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: creature.card.id,
        sourceCardName: creature.card.name,
        actionKind: 'TURN_SHIELD_FACE_UP',
        prompt: `${creature.card.name}: Choose up to ${Math.min(maxCount, opts.length)} shield(s) to turn face up.`,
        options: opts,
        minSelections: 0,
        maxSelections: Math.min(maxCount, opts.length)
      });
    }
    const chosenSet = new Set(
      targets && targets.length > 0 ? targets.slice(0, maxCount) : faceDownIds.slice(0, maxCount)
    );
    return {
      ...state,
      players: {
        ...state.players,
        player: {
          ...state.players.player,
          shields: state.players.player.shields.map((s) =>
            chosenSet.has(s.id) ? { ...s, isFaceUp: true } : s
          )
        },
        opponent: {
          ...state.players.opponent,
          shields: state.players.opponent.shields.map((s) =>
            chosenSet.has(s.id) ? { ...s, isFaceUp: true } : s
          )
        }
      },
      actionLog: [
        ...state.actionLog,
        `${creature.card.name} turned ${chosenSet.size} shield(s) face up!`
      ]
    };
  }
});

// Deck Search, Peek, Reveal & Reorder CIPs
function registerDeckSearchCIP(
  name: string,
  filter: (c: CardDefinition) => boolean,
  description: string
) {
  registerCard(name, {
    onCIP: (state, player, creature) => {
      const matches = state.players[player].deck.filter((d) => filter(d.card));
      if (matches.length === 0) return state;
      if (player === 'player' && state.interactiveHuman) {
        return enqueueInteraction(state, {
          type: 'DECK_SEARCH',
          player: 'player',
          sourceCardName: creature.card.name,
          filterDescription: description,
          validCardInstanceIds: matches.map((m) => m.instanceId),
          destination: 'hand'
        });
      }
      return searchDeckForCard(state, player, filter, 'hand', { shuffleAfter: true });
    }
  });
}

registerDeckSearchCIP('rumbling terahorn', (c) => c.type.includes('Creature'), 'Creature');
registerDeckSearchCIP(
  'niofa, horned protector',
  (c) => c.type.includes('Creature') && getCardCivilizations(c).includes('Nature'),
  'Nature Creature'
);
registerDeckSearchCIP(
  'scissor scarab',
  (c) => (c.races || []).some((r) => normalizeRace(r) === 'giantinsect'),
  'Giant Insect'
);
registerDeckSearchCIP(
  'whispering totem',
  (c) => c.name.trim().toLowerCase() === 'whispering totem',
  'Whispering Totem'
);
registerDeckSearchCIP('hawkeye lunatron', () => true, 'Any card');

registerCard('marinomancer', {
  onCIP: (state, player, creature) => {
    const pS = state.players[player];
    if (pS.deck.length === 0) return state;
    const top3 = pS.deck.slice(0, 3);
    const keep = top3.filter((c) => {
      const civs = getCardCivilizations(c.card);
      return civs.includes('Light') || civs.includes('Darkness');
    });
    const toGy = top3.filter((c) => !keep.some((k) => k.instanceId === c.instanceId));
    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...pS,
          deck: pS.deck.slice(top3.length),
          hand: [...pS.hand, ...keep],
          graveyard: [...pS.graveyard, ...toGy]
        }
      },
      actionLog: [
        ...state.actionLog,
        `${creature.card.name}: revealed ${top3.map((x) => x.card.name).join(', ')}; put ${keep.length} into hand and ${toGy.length} into graveyard.`
      ]
    };
  }
});

registerCard('raptor fish', {
  onCIP: (state, player, creature) => {
    const pS = state.players[player];
    const handCount = pS.hand.length;
    if (handCount === 0) return state;
    const shuffledDeck = shuffleCards([...pS.deck, ...pS.hand]);
    const mid: GameState = {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...pS,
          hand: [],
          deck: shuffledDeck
        }
      },
      actionLog: [
        ...state.actionLog,
        `${creature.card.name}: ${player} shuffled ${handCount} card(s) into deck and drew ${handCount}.`
      ]
    };
    return drawCards(mid, player, handCount);
  }
});

registerCard('telitol, the explorer', {
  onCIP: (state, player, creature) => {
    const shields = state.players[player].shields.filter((s) => !s.isBroken);
    if (shields.length === 0) return state;
    if (player === 'player' && state.interactiveHuman) {
      return enqueueInteraction(state, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: creature.card.id,
        sourceCardName: creature.card.name,
        actionKind: 'PLAYER_SHIELD_PEEK',
        prompt: `${creature.card.name}: Look at your shields? (Optional)`,
        options: buildZoneOptions(state, 'player', ['shields'], undefined, { hideCards: false }),
        minSelections: 0,
        maxSelections: shields.length
      });
    }
    return {
      ...state,
      actionLog: [
        ...state.actionLog,
        `${player} looked at own shields [${shields.map((s) => s.card.name).join(', ')}] with ${creature.card.name}.`
      ]
    };
  }
});

registerCard('grape globbo', {
  onCIP: (state, player, creature) => {
    const opp = getOpponentId(player);
    const handStr = state.players[opp].hand.map((h) => h.card.name).join(', ') || 'empty';
    return {
      ...state,
      actionLog: [
        ...state.actionLog,
        `${creature.card.name}: ${player} looked at ${opp}'s hand [${handStr}].`
      ]
    };
  }
});

registerCard('tekorax', {
  onCIP: (state, player, creature) => {
    const opp = getOpponentId(player);
    const shieldStr =
      state.players[opp].shields.filter((s) => !s.isBroken).map((s) => s.card.name).join(', ') ||
      'none';
    return {
      ...state,
      actionLog: [
        ...state.actionLog,
        `${creature.card.name}: ${player} looked at ${opp}'s shields [${shieldStr}].`
      ]
    };
  }
});

registerCard('time scout', {
  onCIP: (state, player, creature) => {
    const opp = getOpponentId(player);
    const topName = state.players[opp].deck[0]?.card.name ?? 'empty';
    return {
      ...state,
      actionLog: [
        ...state.actionLog,
        `${creature.card.name}: ${player} looked at top card of ${opp}'s deck [${topName}].`
      ]
    };
  }
});

registerCard('aqua strummer', {
  onCIP: (state, player, creature) => {
    const pS = state.players[player];
    const count = Math.min(5, pS.deck.length);
    if (count === 0) return state;
    const topCards = pS.deck.slice(0, count);
    if (player === 'player' && state.interactiveHuman) {
      return enqueueInteraction(state, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: creature.card.id,
        sourceCardName: creature.card.name,
        actionKind: 'REORDER_TOP_N',
        prompt: `${creature.card.name}: Click top ${count} cards in desired top-to-bottom order.`,
        options: topCards.map((c) => ({
          instanceId: c.instanceId,
          zone: 'deck' as const,
          owner: 'player' as const,
          card: c.card,
          label: c.card.name
        })),
        minSelections: 0,
        maxSelections: count,
        contextData: { count }
      });
    }
    return {
      ...state,
      actionLog: [
        ...state.actionLog,
        `${creature.card.name}: ${player} looked at top ${count} cards of deck [${topCards.map((c) => c.card.name).join(', ')}] and put them back in order.`
      ]
    };
  }
});

registerCard('petrova, channeler of suns', {
  onCIP: (state, player, creature, targets) => {
    const raceOpts = getAllBoardRaces(state, 'mechadelsol');
    if (player === 'player' && state.interactiveHuman && !targets?.length) {
      return enqueueInteraction(state, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: creature.card.id,
        sourceCardName: creature.card.name,
        actionKind: 'CIP_CHOOSE_RACE',
        prompt: `${creature.card.name}: Choose a race other than Mecha del Sol (gets +4000 power).`,
        options: [],
        raceOptions: raceOpts,
        minSelections: 1,
        maxSelections: 1,
        contextData: { creatureInstanceId: creature.instanceId }
      });
    }
    const chosenRace =
      targets?.find((r) => normalizeRace(r) !== 'mechadelsol') ||
      state.players[player].battleZone
        .filter((c) => c.instanceId !== creature.instanceId)
        .flatMap((c) => getCreatureRaces(c))
        .find((r) => normalizeRace(r) !== 'mechadelsol') ||
      raceOpts[0] ||
      'Guardian';
    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...state.players[player],
          battleZone: state.players[player].battleZone.map((c) =>
            c.instanceId === creature.instanceId ? { ...c, chosenRace } : c
          )
        }
      },
      actionLog: [
        ...state.actionLog,
        `${creature.card.name}: chose "${chosenRace}" (all ${chosenRace} creatures get +4000 power).`
      ]
    };
  }
});

registerCard('bombazar, dragon of destiny', {
  onCIP: (state, player, creature) => {
    const idsToDestroy: string[] = [];
    for (const pid of ['player', 'opponent'] as const) {
      const opp = getOpponentId(pid);
      for (const c of state.players[pid].battleZone) {
        if (
          c.instanceId !== creature.instanceId &&
          effPower(state, c, state.players[pid], state.players[opp]) === 6000
        ) {
          idsToDestroy.push(c.instanceId);
        }
      }
    }
    const afterDestroy = destroyCreaturesBatch(state, idsToDestroy);
    return {
      ...afterDestroy,
      extraTurnPlayer: player,
      pendingBombazarLossFor: player,
      actionLog: [
        ...afterDestroy.actionLog,
        `${creature.card.name}: destroyed ${idsToDestroy.length} other 6000-power creature(s); ${player} takes an extra turn after this one!`
      ]
    };
  }
});

// Conditional & Compound CIPs (Fixes for partial regexes in triggers.ts)
registerCard('dedreen, the hidden corrupter', {
  onCIP: (state, player) => {
    const opp = getOpponentId(player);
    const oppShields = state.players[opp].shields.filter((s) => !s.isBroken).length;
    return oppShields <= 3 ? discardRandomHandCards(state, opp, 1) : state;
  }
});

registerCard('lucky ball', {
  onCIP: (state, player, creature) => {
    const opp = getOpponentId(player);
    const oppShields = state.players[opp].shields.filter((s) => !s.isBroken).length;
    if (oppShields > 3) return state;
    if (player === 'player' && state.interactiveHuman && state.players[player].deck.length > 0) {
      return enqueueInteraction(state, {
        type: 'OPTIONAL_CHOICE',
        player: 'player',
        sourceCardId: creature.card.id,
        sourceInstanceId: creature.instanceId,
        abilityName: creature.card.name,
        effectType: 'DRAW',
        drawCount: 2,
        prompt: `${creature.card.name}: Opponent has <= 3 shields. Draw up to 2 cards?`
      });
    }
    return drawCards(state, player, Math.min(2, state.players[player].deck.length));
  }
});

registerCard('kulus, soulshine enforcer', {
  onCIP: (state, player) => {
    const opp = getOpponentId(player);
    if (state.players[opp].manaZone.length <= state.players[player].manaZone.length) {
      return state;
    }
    return rampTopDeckToManaZone(state, player, 1);
  }
});

registerCard('trox, general of destruction', {
  onCIP: (state, player, creature) => {
    const opp = getOpponentId(player);
    const otherDark = state.players[player].battleZone.filter(
      (c) => c.instanceId !== creature.instanceId && getCardCivilizations(c.card).includes('Darkness')
    ).length;
    return otherDark > 0 ? discardRandomHandCards(state, opp, otherDark) : state;
  }
});

registerCard('estol, vizier of aqua', {
  onCIP: (state, player, creature) => {
    const opp = getOpponentId(player);
    let nextState = addShieldFromDeck(state, player, 1);
    const oppShields = nextState.players[opp].shields.filter((s) => !s.isBroken);
    if (oppShields.length > 0) {
      if (player === 'player' && nextState.interactiveHuman) {
        return enqueueInteraction(nextState, {
          type: 'ZONE_SELECTION',
          player: 'player',
          sourceCardId: creature.card.id,
          sourceCardName: creature.card.name,
          actionKind: 'PLAYER_SHIELD_PEEK',
          prompt: `${creature.card.name}: Look at 1 of opponent's shields.`,
          options: buildZoneOptions(nextState, opp, ['shields'], undefined, { hideCards: true }),
          minSelections: 1,
          maxSelections: 1
        });
      }
      nextState = {
        ...nextState,
        actionLog: [
          ...nextState.actionLog,
          `${creature.card.name}: looked at ${opp}'s shield (${oppShields[0].card.name}).`
        ]
      };
    }
    return nextState;
  }
});

registerCard('pointa, the aqua shadow', {
  onCIP: (state, player, creature) => {
    const opp = getOpponentId(player);
    let nextState = state;
    const oppShields = nextState.players[opp].shields.filter((s) => !s.isBroken);
    if (oppShields.length > 0) {
      nextState = {
        ...nextState,
        actionLog: [
          ...nextState.actionLog,
          `${creature.card.name}: looked at ${opp}'s shield (${oppShields[0].card.name}).`
        ]
      };
    }
    return discardRandomHandCards(nextState, opp, 1);
  }
});

registerCard('galek, the shadow warrior', {
  onCIP: (state, player, creature, targets) => {
    const opp = getOpponentId(player);
    const oppBZ = state.players[opp].battleZone;
    const pBZ = state.players[player].battleZone;
    const blockers = oppBZ.filter(
      (c) =>
        !isUntargetableByOpponent(c) &&
        hasCreatureBlocker(c, oppBZ, pBZ, state.players[opp])
    );
    if (player === 'player' && state.interactiveHuman && blockers.length > 0 && !targets?.length) {
      const bSet = new Set(blockers.map((b) => b.instanceId));
      return enqueueInteraction(state, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: creature.card.id,
        sourceCardName: creature.card.name,
        actionKind: 'OPPONENT_SACRIFICE_BZ',
        prompt: `${creature.card.name}: Choose 1 opponent Blocker to destroy (then opponent discards 1 card at random).`,
        options: buildZoneOptions(state, opp, ['battleZone'], (o) => bSet.has(o.instanceId)),
        minSelections: 1,
        maxSelections: 1,
        contextData: { thenOppRandomDiscard: true }
      });
    }
    let nextState = state;
    if (blockers.length > 0) {
      const pick = (targets?.[0] && blockers.find((b) => b.instanceId === targets[0])) || blockers[0];
      nextState = destroyCreature(nextState, pick.instanceId);
    }
    return discardRandomHandCards(nextState, opp, 1);
  }
});

registerCard('skysword, the savage vizier', {
  onCIP: (state, player) => {
    const afterRamp = rampTopDeckToManaZone(state, player, 1);
    return addShieldFromDeck(afterRamp, player, 1);
  }
});

registerCard('funky wizard', {
  onCIP: (state, player) => {
    const opp = getOpponentId(player);
    let next = drawCards(state, player, Math.min(1, state.players[player].deck.length));
    next = drawCards(next, opp, Math.min(1, next.players[opp].deck.length));
    return next;
  }
});

// ============================================================================
// ON-ATTACK & DM-12 TYPO CIP REGISTRATIONS
// ============================================================================

registerCard('mizoy, the oracle', {
  onCIP: (state, player, creature, targets) => {
    const opp = getOpponentId(player);
    const isDarkOrFire = (c: CreatureInstance) => {
      const civs = getCardCivilizations(c.card);
      return civs.includes('Darkness') || civs.includes('Fire');
    };
    const oppMatches = state.players[opp].battleZone.filter(
      (c) => !isUntargetableByOpponent(c) && isDarkOrFire(c)
    );
    const allMatches = [
      ...oppMatches,
      ...state.players[player].battleZone.filter((c) => isDarkOrFire(c))
    ];
    if (allMatches.length === 0) return state;

    if (player === 'player' && state.interactiveHuman && !targets?.length) {
      const mSet = new Set(allMatches.map((c) => c.instanceId));
      return enqueueInteraction(state, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: creature.card.id,
        sourceCardName: creature.card.name,
        actionKind: 'PLAYER_TAP_OPP_BZ',
        prompt: `${creature.card.name}: Choose a Darkness or Fire creature in the battle zone to tap? (Optional)`,
        options: [
          ...buildZoneOptions(state, opp, ['battleZone'], (o) => mSet.has(o.instanceId)),
          ...buildZoneOptions(state, player, ['battleZone'], (o) => mSet.has(o.instanceId))
        ],
        minSelections: 0,
        maxSelections: 1
      });
    }

    const picked =
      (targets?.[0] && allMatches.find((c) => c.instanceId === targets[0])) ||
      oppMatches.find((c) => !c.isTapped) ||
      oppMatches[0];
    if (!picked) return state;
    const tOwner = picked.owner;
    return {
      ...state,
      players: {
        ...state.players,
        [tOwner]: {
          ...state.players[tOwner],
          battleZone: state.players[tOwner].battleZone.map((c) =>
            c.instanceId === picked.instanceId ? { ...c, isTapped: true } : c
          )
        }
      },
      actionLog: [
        ...state.actionLog,
        `${creature.card.name}: ${player} tapped ${picked.card.name}.`
      ]
    };
  }
});

registerCard('necrodragon zalva', {
  onCIP: (state, player) => {
    const opp = getOpponentId(player);
    return drawCards(state, opp, 1);
  }
});

registerCard('gigarayze', {
  onCIP: (state, player, creature, targets) => {
    const isWaterOrFireCreature = (c: CardDefinition) => {
      const civs = getCardCivilizations(c);
      return c.type.includes('Creature') && (civs.includes('Water') || civs.includes('Fire'));
    };
    const pS = state.players[player];
    const matches = pS.graveyard.filter((g) => isWaterOrFireCreature(g.card));
    if (matches.length === 0) return state;
    if (player === 'player' && state.interactiveHuman && !targets?.length) {
      const mSet = new Set(matches.map((m) => m.instanceId));
      return enqueueInteraction(state, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: creature.card.id,
        sourceCardName: creature.card.name,
        actionKind: 'PLAYER_SALVAGE_GY',
        prompt: `${creature.card.name}: Return a Water or Fire creature from your graveyard to your hand? (Optional)`,
        options: buildZoneOptions(state, 'player', ['graveyard'], (o) => mSet.has(o.instanceId)),
        minSelections: 0,
        maxSelections: 1
      });
    }
    return salvageFromGraveyard(state, player, isWaterOrFireCreature, 'hand', {
      pickMostRecent: true,
      specificInstanceId: targets?.[0]
    });
  }
});

registerCard('laguna, lightning enforcer', {
  onAttack: (state, player, attacker) => {
    const spellsInDeck = state.players[player].deck.filter((d) => d.card.type === 'Spell');
    if (spellsInDeck.length === 0) return state;
    if (player === 'player' && state.interactiveHuman) {
      return enqueueInteraction(state, {
        type: 'DECK_SEARCH',
        player: 'player',
        sourceCardName: attacker.card.name,
        filterDescription: 'Spell',
        validCardInstanceIds: spellsInDeck.map((d) => d.instanceId),
        destination: 'hand'
      });
    }
    return searchDeckForCard(state, player, (c) => c.type === 'Spell', 'hand', {
      shuffleAfter: true
    });
  }
});
