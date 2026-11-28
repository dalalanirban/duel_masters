import type { CardDefinition, Civilization } from '../types/card.ts';
import type {
  GameState,
  PlayerId,
  CreatureInstance,
  CardInstance,
  ManaCardInstance,
  PlayerState,
  ShieldInstance
} from './types.ts';
import {
  getCardCapabilities,
  getCardCivilizations,
  getCreatureRaces,
  getOpponentId,
  normalizeRace
} from './cardUtils.ts';
import {
  canPayManaCost,
  getManaPaymentFailureReason,
  isMultiCivilization,
  payManaCost,
  toManaCard
} from './mana.ts';
import {
  getCreatureEffectivePower,
  hasCreatureBlocker
} from './continuous.ts';
import { isUntargetableByOpponent } from './targeting.ts';
import {
  addShieldFromDeck,
  bounceCreature,
  breakOpponentShields,
  destroyCreature,
  destroyCreaturesBatch,
  destroyOpponentShields,
  discardHandCardsByIndices,
  discardRandomHandCards,
  drawCards,
  makeShieldId,
  rampTopDeckToManaZone,
  searchDeckForCard,
  sendCreatureToManaZone,
  sendCreatureToShields
} from './zones.ts';
import { shuffleCards } from './state.ts';
import { triggerCIP } from './triggers.ts';
import { buildZoneOptions, enqueueInteraction } from './interactionHelpers.ts';
import { dispatchRegisteredSpell, registerEngineDispatchHooks } from './cardEffectRegistry.ts';

// Re-export zone primitives for existing direct imports from './spells.ts' without duplication
export {
  addShieldFromDeck,
  bounceCreature,
  breakOpponentShields,
  destroyCreature,
  destroyCreaturesBatch,
  destroyOpponentShields,
  discardRandomHandCards,
  drawCards,
  rampTopDeckToManaZone,
  sendCreatureToManaZone
};

/**
 * Checks whether a card definition represents a Charger spell.
 */
export function isChargerSpell(card: CardDefinition): boolean {
  return getCardCapabilities(card).isCharger;
}

/**
 * Delegates to triggers.triggerCIP for backward compatibility.
 */
export function resolveCreatureCIPEffect(
  state: GameState,
  player: PlayerId,
  creature: CreatureInstance,
  targets?: string[]
): GameState {
  return triggerCIP(state, player, creature, targets);
}

/**
 * Picks most represented race in a creature list (or common race of targets).
 */
function pickMostCommonRace(cards: Array<{ card: CardDefinition }>): string {
  const counts = new Map<string, number>();
  for (const c of cards) {
    const races = c.card.races || ((c.card as unknown as { race?: string }).race ? [(c.card as unknown as { race: string }).race] : []);
    for (const r of races) {
      counts.set(r, (counts.get(r) || 0) + 1);
    }
  }
  let best = '';
  let max = 0;
  for (const [r, cnt] of counts.entries()) {
    if (cnt > max) {
      max = cnt;
      best = r;
    }
  }
  return best;
}

/**
 * Picks best race on a player's board (used when UI didn't supply a race selector).
 */
function pickDominantRaceOnBoard(bz: CreatureInstance[]): string {
  const r = pickMostCommonRace(bz);
  return normalizeRace(r || 'Human');
}

/**
 * Resolves a single-target creature spell against legal choosable targets:
 * - If explicit `targets?.[0]` was supplied, validates existence, untargetability, and spell predicate.
 * - If omitted or empty, filters out opponent untargetable creatures (`!isUntargetableByOpponent`) and picks the first legal match,
 *   or returns a logged no-op state instead of throwing when no valid targets exist (e.g. empty board or Petrova-only board).
 */
function resolveSingleCreatureTarget(
  state: GameState,
  player: PlayerId,
  card: CardDefinition,
  scope: 'opponent' | 'friendly' | 'any',
  targets: string[] | undefined,
  opts?: {
    isValid?: (c: CreatureInstance) => boolean;
    validateError?: (c: CreatureInstance) => string | null;
    notFoundError?: (targetId: string) => string;
  }
): { target: CreatureInstance } | { target: null; state: GameState } {
  const opp = getOpponentId(player);
  const candidates =
    scope === 'opponent'
      ? state.players[opp].battleZone
      : scope === 'friendly'
      ? state.players[player].battleZone
      : [...state.players[opp].battleZone, ...state.players[player].battleZone];

  if (targets && targets.length > 0) {
    const targetId = targets[0];
    const found = candidates.find((c) => c.instanceId === targetId);
    if (!found) {
      throw new Error(
        opts?.notFoundError
          ? opts.notFoundError(targetId)
          : `Target creature ${targetId} not found in ${
              scope === 'any'
                ? 'battle zone'
                : scope === 'opponent'
                ? "opponent's battle zone"
                : `${player}'s battle zone`
            }.`
      );
    }
    if (found.owner !== player && isUntargetableByOpponent(found)) {
      throw new Error(`${found.card.name} cannot be chosen by opponent spells or abilities.`);
    }
    if (opts?.validateError) {
      const err = opts.validateError(found);
      if (err) throw new Error(err);
    }
    return { target: found };
  }

  const valid = candidates.filter(
    (c) =>
      (c.owner === player || !isUntargetableByOpponent(c)) &&
      (!opts?.isValid || opts.isValid(c))
  );
  if (valid.length === 0) {
    return {
      target: null,
      state: {
        ...state,
        actionLog: [...state.actionLog, `${player} cast ${card.name} with no legal targets.`]
      }
    };
  }
  return { target: valid[0] };
}

/**
 * Resolves the rules text effects of a cast spell (or Shield Trigger spell).
 */
export function resolveSpellEffect(
  state: GameState,
  player: PlayerId,
  card: CardDefinition,
  targets?: string[]
): GameState {
  const registeredResult = dispatchRegisteredSpell(state, player, card, targets);
  if (registeredResult) {
    return registeredResult;
  }

  const opponent = getOpponentId(player);
  const casterState = state.players[player];
  const opponentState = state.players[opponent];
  const cardName = getCardCapabilities(card).nameLower.trim();
  const rules = card.rulesText || '';

  const effPower = (c: CreatureInstance, owner: PlayerState, opp: PlayerState) =>
    getCreatureEffectivePower(c, false, owner, opp, false, state);

  // 1. Holy Awe: Tap all opponent creatures
  if (cardName === 'holy awe' || /tap all (?:your )?opponent's creatures/i.test(rules)) {
    return {
      ...state,
      players: {
        ...state.players,
        [opponent]: {
          ...opponentState,
          battleZone: opponentState.battleZone.map((c) => ({ ...c, isTapped: true }))
        }
      },
      actionLog: [...state.actionLog, `${player} tapped all opponent creatures with ${card.name}.`]
    };
  }

  // 1b. Bonds of Justice / Screaming Sunburst / Justice Jamming / Static Warp
  if (cardName === 'bonds of justice') {
    return {
      ...state,
      players: {
        player: {
          ...state.players.player,
          battleZone: state.players.player.battleZone.map((c) =>
            !hasCreatureBlocker(c, state.players.player.battleZone, state.players.opponent.battleZone, state.players.player)
              ? { ...c, isTapped: true }
              : c
          )
        },
        opponent: {
          ...state.players.opponent,
          battleZone: state.players.opponent.battleZone.map((c) =>
            !hasCreatureBlocker(c, state.players.opponent.battleZone, state.players.player.battleZone, state.players.opponent)
              ? { ...c, isTapped: true }
              : c
          )
        }
      },
      actionLog: [...state.actionLog, `${player} tapped all non-Blocker creatures with ${card.name}.`]
    };
  }

  if (cardName === 'screaming sunburst') {
    return {
      ...state,
      players: {
        player: {
          ...state.players.player,
          battleZone: state.players.player.battleZone.map((c) =>
            !getCardCivilizations(c.card).includes('Light') ? { ...c, isTapped: true } : c
          )
        },
        opponent: {
          ...state.players.opponent,
          battleZone: state.players.opponent.battleZone.map((c) =>
            !getCardCivilizations(c.card).includes('Light') ? { ...c, isTapped: true } : c
          )
        }
      },
      actionLog: [...state.actionLog, `${player} tapped all non-Light creatures with ${card.name}.`]
    };
  }

  if (cardName === 'justice jamming') {
    const oppDark = opponentState.battleZone.filter((c) => !c.isTapped && getCardCivilizations(c.card).includes('Darkness')).length;
    const oppFire = opponentState.battleZone.filter((c) => !c.isTapped && getCardCivilizations(c.card).includes('Fire')).length;
    const targetCiv: Civilization = oppDark >= oppFire ? 'Darkness' : 'Fire';
    return {
      ...state,
      players: {
        player: {
          ...state.players.player,
          battleZone: state.players.player.battleZone.map((c) =>
            getCardCivilizations(c.card).includes(targetCiv) ? { ...c, isTapped: true } : c
          )
        },
        opponent: {
          ...state.players.opponent,
          battleZone: state.players.opponent.battleZone.map((c) =>
            getCardCivilizations(c.card).includes(targetCiv) ? { ...c, isTapped: true } : c
          )
        }
      },
      actionLog: [...state.actionLog, `${player} tapped all ${targetCiv} creatures with ${card.name}.`]
    };
  }

  if (cardName === 'moonlight flash') {
    const oppBZ = opponentState.battleZone;
    const targetIds =
      targets && targets.length > 0
        ? targets.slice(0, 2)
        : oppBZ.filter((c) => !c.isTapped).slice(0, 2).map((c) => c.instanceId);
    const idSet = new Set(targetIds);
    return {
      ...state,
      players: {
        ...state.players,
        [opponent]: {
          ...opponentState,
          battleZone: oppBZ.map((c) => (idSet.has(c.instanceId) ? { ...c, isTapped: true } : c))
        }
      },
      actionLog: [...state.actionLog, `${player} tapped ${targetIds.length} opponent creature(s) with ${card.name}.`]
    };
  }

  // 2. Solar Ray / Lightning Charger / Virtual Tripwire / Solar Trap / Dracobarrier: Tap 1 opponent creature
  if (
    cardName === 'solar ray' ||
    cardName === 'lightning charger' ||
    cardName === 'virtual tripwire' ||
    cardName === 'solar trap' ||
    cardName === 'dracobarrier' ||
    /choose (?:1|one) of your opponent's creatures.*and tap it/i.test(rules)
  ) {
    const resolved = resolveSingleCreatureTarget(state, player, card, 'opponent', targets, {
      isValid: (c) => !c.isTapped
    });
    if (!resolved.target) return resolved.state;
    const targetCreature = resolved.target;
    const targetId = targetCreature.instanceId;
    let nextState: GameState = {
      ...state,
      players: {
        ...state.players,
        [opponent]: {
          ...opponentState,
          battleZone: opponentState.battleZone.map((c) =>
            c.instanceId === targetId ? { ...c, isTapped: true } : c
          )
        }
      },
      actionLog: [...state.actionLog, `${player} tapped ${targetCreature.card.name}.`]
    };
    // Dracobarrier: if tapped creature has Dragon in its race, add top card of deck to shields
    if (cardName === 'dracobarrier' && getCreatureRaces(targetCreature).some((r) => r.toLowerCase().includes('dragon') && !r.toLowerCase().includes('dragonoid'))) {
      nextState = addShieldFromDeck(nextState, player, 1);
    }
    return nextState;
  }

  // 2b. Laser Whip: Tap 1 opp creature, then 1 friendly creature can't be blocked this turn
  if (cardName === 'laser whip') {
    let nextState = state;
    const oppBZ = nextState.players[opponent].battleZone;
    const tapId =
      targets?.[0] ||
      oppBZ.find((c) => !c.isTapped && !isUntargetableByOpponent(c))?.instanceId;
    if (tapId) {
      nextState = {
        ...nextState,
        players: {
          ...nextState.players,
          [opponent]: {
            ...nextState.players[opponent],
            battleZone: oppBZ.map((c) => (c.instanceId === tapId ? { ...c, isTapped: true } : c))
          }
        }
      };
    }
    const friendlyBZ = nextState.players[player].battleZone;
    const unblockId = targets?.[1] || friendlyBZ.find((c) => !c.isTapped)?.instanceId || friendlyBZ[0]?.instanceId;
    if (unblockId) {
      nextState = {
        ...nextState,
        players: {
          ...nextState.players,
          [player]: {
            ...nextState.players[player],
            battleZone: friendlyBZ.map((c) => (c.instanceId === unblockId ? { ...c, tempUnblockable: true } : c))
          }
        }
      };
    }
    return nextState;
  }

  // 3. Death Smoke / Vacuum Gel
  if (
    cardName === 'death smoke' ||
    /destroy (?:1|one) of your opponent's untapped creatures/i.test(rules)
  ) {
    const resolved = resolveSingleCreatureTarget(state, player, card, 'opponent', targets, {
      isValid: (c) => !c.isTapped,
      validateError: (c) => (c.isTapped ? 'Death Smoke can only target an untapped creature.' : null)
    });
    if (!resolved.target) return resolved.state;
    return destroyCreature(state, resolved.target.instanceId);
  }

  if (cardName === 'vacuum gel') {
    const resolved = resolveSingleCreatureTarget(state, player, card, 'opponent', targets, {
      isValid: (c) => !c.isTapped && getCardCivilizations(c.card).some((civ) => civ === 'Light' || civ === 'Nature'),
      validateError: (c) => {
        if (c.isTapped) return 'Vacuum Gel can only target an untapped creature.';
        if (!getCardCivilizations(c.card).some((civ) => civ === 'Light' || civ === 'Nature')) {
          return 'Vacuum Gel can only target a Light or Nature creature.';
        }
        return null;
      }
    });
    if (!resolved.target) return resolved.state;
    return destroyCreature(state, resolved.target.instanceId);
  }

  // 4a. Comet Missile: Destroy 1 opponent creature with Blocker and power <= 6000
  if (
    cardName === 'comet missile' ||
    /destroy (?:1|one) of your opponent's creatures that has "blocker" and power 6000 or less/i.test(rules)
  ) {
    const isMatch = (c: CreatureInstance) =>
      hasCreatureBlocker(c, opponentState.battleZone, casterState.battleZone, opponentState) &&
      effPower(c, opponentState, casterState) <= 6000;
    const resolved = resolveSingleCreatureTarget(state, player, card, 'opponent', targets, {
      isValid: isMatch,
      validateError: (c) => {
        if (!hasCreatureBlocker(c, opponentState.battleZone, casterState.battleZone, opponentState)) {
          return 'Comet Missile can only target a creature with Blocker.';
        }
        if (effPower(c, opponentState, casterState) > 6000) {
          return 'Comet Missile can only target a creature with power 6000 or less.';
        }
        return null;
      }
    });
    if (!resolved.target) return resolved.state;
    return destroyCreature(state, resolved.target.instanceId);
  }

  // 4b. Critical Blade: Destroy 1 opponent Blocker
  if (
    cardName === 'critical blade' ||
    (/destroy (?:1|one) of your opponent's creatures that has "blocker"/i.test(rules) &&
      !/power \d+ or less/i.test(rules))
  ) {
    const resolved = resolveSingleCreatureTarget(state, player, card, 'opponent', targets, {
      isValid: (c) => hasCreatureBlocker(c, opponentState.battleZone, casterState.battleZone, opponentState),
      validateError: (c) =>
        !hasCreatureBlocker(c, opponentState.battleZone, casterState.battleZone, opponentState)
          ? 'Critical Blade can only target a creature with Blocker.'
          : null
    });
    if (!resolved.target) return resolved.state;
    return destroyCreature(state, resolved.target.instanceId);
  }

  // 4c. Hand Discard spells (Ghost Touch, Lost Soul, Cranium Clamp, Soul Gulp, Rain of Arrows)
  if (cardName === 'ghost touch' || /opponent discards a card at random/i.test(rules)) {
    return discardRandomHandCards(state, opponent, 1);
  }
  if (cardName === 'cranium clamp') {
    if (opponent === 'player' && state.interactiveHuman && !targets?.length && opponentState.hand.length > 0) {
      const pickCount = Math.min(2, opponentState.hand.length);
      return enqueueInteraction(state, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: card.id,
        sourceCardName: card.name,
        actionKind: 'OPPONENT_DISCARD_HAND',
        prompt: `Cranium Clamp: Choose ${pickCount} card(s) in your hand to discard.`,
        options: buildZoneOptions(state, 'player', ['hand']),
        minSelections: pickCount,
        maxSelections: pickCount
      });
    }
    return discardRandomHandCards(state, opponent, 2);
  }
  if (cardName === 'soul gulp') {
    const oppLightCount = opponentState.battleZone.filter((c) =>
      getCardCivilizations(c.card).includes('Light')
    ).length;
    if (opponent === 'player' && state.interactiveHuman && !targets?.length && oppLightCount > 0 && opponentState.hand.length > 0) {
      const pickCount = Math.min(oppLightCount, opponentState.hand.length);
      return enqueueInteraction(state, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: card.id,
        sourceCardName: card.name,
        actionKind: 'OPPONENT_DISCARD_HAND',
        prompt: `Soul Gulp: Choose ${pickCount} card(s) in your hand to discard.`,
        options: buildZoneOptions(state, 'player', ['hand']),
        minSelections: pickCount,
        maxSelections: pickCount
      });
    }
    return discardRandomHandCards(state, opponent, oppLightCount);
  }
  if (cardName === 'rain of arrows') {
    const toDiscardIdx: number[] = [];
    opponentState.hand.forEach((c, idx) => {
      if (c.card.type === 'Spell' && getCardCivilizations(c.card).includes('Darkness')) {
        toDiscardIdx.push(idx);
      }
    });
    return discardHandCardsByIndices(state, opponent, toDiscardIdx, 'discarded (Darkness spells)');
  }
  if (cardName === 'lost soul' || /opponent discards all cards/i.test(rules)) {
    if (opponentState.hand.length === 0) {
      return {
        ...state,
        actionLog: [...state.actionLog, `${player} cast ${card.name}, but ${opponent}'s hand is empty.`]
      };
    }
    return discardHandCardsByIndices(
      state,
      opponent,
      opponentState.hand.map((_, i) => i),
      'discarded entire hand'
    );
  }

  // 5. Threshold Destroy spells: Tornado Flame (4000), Spastic/Ten-Ton (3000), Crimson Hammer / Volcano Charger / Phantom Dragon's Flame (2000)
  const thresholdDestroyMatch = rules.match(
    /destroy (?:1|one) of your opponent's creatures that has power (\d+) or less/i
  );
  if (
    thresholdDestroyMatch ||
    cardName === 'tornado flame' ||
    cardName === 'volcano charger' ||
    cardName === 'crimson hammer' ||
    cardName === "phantom dragon's flame" ||
    cardName === 'spastic missile' ||
    cardName === 'ten-ton crunch'
  ) {
    const maxPower = thresholdDestroyMatch
      ? parseInt(thresholdDestroyMatch[1], 10)
      : cardName === 'tornado flame'
      ? 4000
      : cardName === 'spastic missile' || cardName === 'ten-ton crunch'
      ? 3000
      : 2000;

    const resolved = resolveSingleCreatureTarget(state, player, card, 'opponent', targets, {
      isValid: (c) => effPower(c, opponentState, casterState) <= maxPower,
      validateError: (c) => {
        const power = effPower(c, opponentState, casterState);
        return power > maxPower
          ? `Target creature has power ${power} (cannot target power > ${maxPower}).`
          : null;
      }
    });
    if (!resolved.target) return resolved.state;
    return destroyCreature(state, resolved.target.instanceId);
  }

  // Volcanic Arrows: destroy a creature <= 6000, put 1 friendly shield into graveyard
  if (cardName === 'volcanic arrows') {
    let nextState = state;
    const resolved = resolveSingleCreatureTarget(state, player, card, 'any', targets, {
      isValid: (c) =>
        c.owner === player
          ? effPower(c, casterState, opponentState) <= 6000
          : effPower(c, opponentState, casterState) <= 6000,
      validateError: (c) => {
        const p =
          c.owner === player
            ? effPower(c, casterState, opponentState)
            : effPower(c, opponentState, casterState);
        return p > 6000 ? `Target creature has power ${p} (cannot target power > 6000).` : null;
      }
    });
    if (resolved.target) {
      nextState = destroyCreature(nextState, resolved.target.instanceId);
    } else {
      nextState = resolved.state;
    }
    const cState = nextState.players[player];
    const unbroken = cState.shields.filter((s) => !s.isBroken);
    if (unbroken.length > 0) {
      const sh = unbroken[0];
      nextState = {
        ...nextState,
        players: {
          ...nextState.players,
          [player]: {
            ...cState,
            shields: cState.shields.filter((s) => s.id !== sh.id),
            graveyard: [...cState.graveyard, { instanceId: sh.id, card: sh.card, owner: player }]
          }
        }
      };
    }
    return nextState;
  }

  // Burst Shot / Blizzard of Spears (simultaneous batch destruction honoring Saver exclusion)
  if (cardName === 'burst shot' || /destroy all creatures that have power 2000 or less/i.test(rules)) {
    const ids: string[] = [];
    for (const c of state.players.player.battleZone) {
      if (effPower(c, state.players.player, state.players.opponent) <= 2000) ids.push(c.instanceId);
    }
    for (const c of state.players.opponent.battleZone) {
      if (effPower(c, state.players.opponent, state.players.player) <= 2000) ids.push(c.instanceId);
    }
    const nextState = destroyCreaturesBatch(state, ids);
    return {
      ...nextState,
      actionLog: [...nextState.actionLog, `${player} destroyed ${ids.length} creature(s) with power 2000 or less with ${card.name}.`]
    };
  }

  if (cardName === 'blizzard of spears' || /destroy all creatures that have power 4000 or less/i.test(rules)) {
    const ids: string[] = [];
    for (const c of state.players.player.battleZone) {
      if (effPower(c, state.players.player, state.players.opponent) <= 4000) ids.push(c.instanceId);
    }
    for (const c of state.players.opponent.battleZone) {
      if (effPower(c, state.players.opponent, state.players.player) <= 4000) ids.push(c.instanceId);
    }
    const nextState = destroyCreaturesBatch(state, ids);
    return {
      ...nextState,
      actionLog: [...nextState.actionLog, `${player} destroyed ${ids.length} creature(s) with power 4000 or less with ${card.name}.`]
    };
  }

  // Searing Wave
  if (
    cardName === 'searing wave' ||
    /destroy all (?:your )?opponent's creatures that have power 3000 or less/i.test(rules)
  ) {
    const ids = opponentState.battleZone
      .filter((c) => effPower(c, opponentState, casterState) <= 3000)
      .map((c) => c.instanceId);
    let nextState = destroyCreaturesBatch(state, ids);

    const curCaster = nextState.players[player];
    const unbrokenShields = curCaster.shields.filter((s) => !s.isBroken);
    if (unbrokenShields.length > 0) {
      if (player === 'player' && nextState.interactiveHuman && !targets?.length) {
        return enqueueInteraction(nextState, {
          type: 'ZONE_SELECTION',
          player: 'player',
          sourceCardId: card.id,
          sourceCardName: card.name,
          actionKind: 'SEARING_WAVE_SHIELD',
          prompt: `${card.name}: Choose 1 of your shields to put into your graveyard.`,
          options: buildZoneOptions(nextState, 'player', ['shields'], undefined, { hideCards: true }),
          minSelections: 1,
          maxSelections: 1
        });
      }
      const chosenShield =
        (targets && targets.length > 0
          ? unbrokenShields.find((s) => targets.includes(s.id) || (s.shieldId && targets.includes(s.shieldId)))
          : undefined) || unbrokenShields[0];
      const graveCard: CardInstance = {
        instanceId: chosenShield.id,
        card: chosenShield.card,
        owner: player
      };
      nextState = {
        ...nextState,
        players: {
          ...nextState.players,
          [player]: {
            ...curCaster,
            shields: curCaster.shields.filter((s) => s.id !== chosenShield.id),
            graveyard: [...curCaster.graveyard, graveCard]
          }
        },
        actionLog: [
          ...nextState.actionLog,
          `${player} put a shield (${chosenShield.card.name}) into the graveyard with ${card.name}.`
        ]
      };
    }

    return {
      ...nextState,
      actionLog: [
        ...nextState.actionLog,
        `${player} destroyed ${ids.length} opponent creature(s) with power 3000 or less with ${card.name}.`
      ]
    };
  }

  // Invincible Abyss
  if (
    cardName === 'invincible abyss' ||
    (/destroy all (?:your )?opponent's creatures\b/i.test(rules) && !/power/i.test(rules))
  ) {
    const ids = opponentState.battleZone.map((c) => c.instanceId);
    const nextState = destroyCreaturesBatch(state, ids);
    return {
      ...nextState,
      actionLog: [...nextState.actionLog, `${player} destroyed all ${ids.length} opponent creature(s) with ${card.name}.`]
    };
  }

  // Apocalypse Day
  if (
    cardName === 'apocalypse day' ||
    (/destroy all creatures/i.test(rules) && /6 or more/i.test(rules))
  ) {
    const totalCreatures =
      state.players.player.battleZone.length + state.players.opponent.battleZone.length;
    if (totalCreatures < 6) {
      return {
        ...state,
        actionLog: [
          ...state.actionLog,
          `${player} cast ${card.name}, but there are only ${totalCreatures} creature(s) in the battle zone (requires 6 or more).`
        ]
      };
    }
    const allIds = [
      ...state.players.player.battleZone.map((c) => c.instanceId),
      ...state.players.opponent.battleZone.map((c) => c.instanceId)
    ];
    const nextState = destroyCreaturesBatch(state, allIds);
    return {
      ...nextState,
      actionLog: [...nextState.actionLog, `${player} destroyed all ${allIds.length} creatures in the battle zone with ${card.name}.`]
    };
  }

  // Apocalypse Vise
  if (
    cardName === 'apocalypse vise' ||
    /destroy any number of (?:your )?opponent's creatures that have total power 8000 or less/i.test(rules)
  ) {
    const opponentBZ = opponentState.battleZone;
    if (opponentBZ.length === 0) return state;

    let targetsToDestroy: string[] = [];
    if (targets && targets.length > 0) {
      const targetCreatures: CreatureInstance[] = [];
      for (const tid of targets) {
        const found = opponentBZ.find((c) => c.instanceId === tid);
        if (!found) {
          throw new Error(`Target creature ${tid} not found in opponent's battle zone.`);
        }
        targetCreatures.push(found);
      }
      const totalPower = targetCreatures.reduce(
        (sum, c) => sum + effPower(c, opponentState, casterState),
        0
      );
      if (totalPower > 8000) {
        throw new Error(
          `Target creatures have total power ${totalPower}, exceeding the 8000 limit for ${card.name}.`
        );
      }
      targetsToDestroy = targetCreatures.map((c) => c.instanceId);
    } else {
      const sorted = opponentBZ
        .filter((c) => !isUntargetableByOpponent(c))
        .sort((a, b) => effPower(b, opponentState, casterState) - effPower(a, opponentState, casterState));
      let remainingPower = 8000;
      for (const c of sorted) {
        const p = effPower(c, opponentState, casterState);
        if (p <= remainingPower) {
          targetsToDestroy.push(c.instanceId);
          remainingPower -= p;
        }
      }
    }

    const nextState = destroyCreaturesBatch(state, targetsToDestroy);
    return {
      ...nextState,
      actionLog: [...nextState.actionLog, `${player} destroyed ${targetsToDestroy.length} opponent creature(s) with ${card.name}.`]
    };
  }

  // Proclamation of Death / Chains of Sacrifice / Intense Evil / Grinning Hunger / Crisis Boulder / Miraculous Rebirth
  if (cardName === 'proclamation of death') {
    if (opponentState.battleZone.length === 0) return state;
    if (opponent === 'player' && state.interactiveHuman && !targets?.length) {
      return enqueueInteraction(state, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: card.id,
        sourceCardName: card.name,
        actionKind: 'OPPONENT_SACRIFICE_BZ',
        prompt: 'Proclamation of Death: Choose 1 of your creatures in the battle zone to destroy.',
        options: buildZoneOptions(state, 'player', ['battleZone']),
        minSelections: 1,
        maxSelections: 1
      });
    }
    const sorted = [...opponentState.battleZone].sort(
      (a, b) => effPower(a, opponentState, casterState) - effPower(b, opponentState, casterState)
    );
    return destroyCreature(state, sorted[0].instanceId);
  }

  if (cardName === 'crisis boulder') {
    const opts = [
      ...buildZoneOptions(state, opponent, ['battleZone']),
      ...buildZoneOptions(state, opponent, ['manaZone'])
    ];
    if (opts.length === 0) return state;
    if (opponent === 'player' && state.interactiveHuman && !targets?.length) {
      return enqueueInteraction(state, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: card.id,
        sourceCardName: card.name,
        actionKind: 'OPPONENT_CRISIS_BOULDER',
        prompt: 'Crisis Boulder: Choose 1 of your creatures or 1 card in your mana zone to put into your graveyard.',
        options: opts,
        minSelections: 1,
        maxSelections: 1
      });
    }
    if (opponentState.battleZone.length > 0) {
      const lowest = [...opponentState.battleZone].sort(
        (a, b) => effPower(a, opponentState, casterState) - effPower(b, opponentState, casterState)
      )[0];
      return destroyCreature(state, lowest.instanceId);
    }
    const lostM = opponentState.manaZone[0];
    return {
      ...state,
      players: {
        ...state.players,
        [opponent]: {
          ...opponentState,
          manaZone: opponentState.manaZone.slice(1),
          graveyard: [...opponentState.graveyard, { instanceId: lostM.instanceId, card: lostM.card, owner: opponent }]
        }
      },
      actionLog: [...state.actionLog, `${opponent} put ${lostM.card.name} from mana zone into graveyard (Crisis Boulder).`]
    };
  }

  if (cardName === 'grinning hunger') {
    const opts = [
      ...buildZoneOptions(state, opponent, ['battleZone']),
      ...buildZoneOptions(state, opponent, ['shields'], undefined, { hideCards: true })
    ];
    if (opts.length === 0) return state;
    if (opponent === 'player' && state.interactiveHuman && !targets?.length) {
      return enqueueInteraction(state, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: card.id,
        sourceCardName: card.name,
        actionKind: 'OPPONENT_GRINNING_HUNGER',
        prompt: 'Grinning Hunger: Choose 1 of your creatures or 1 of your shields to put into your graveyard.',
        options: opts,
        minSelections: 1,
        maxSelections: 1
      });
    }
    if (opponentState.battleZone.length > 0) {
      const lowest = [...opponentState.battleZone].sort(
        (a, b) => effPower(a, opponentState, casterState) - effPower(b, opponentState, casterState)
      )[0];
      return destroyCreature(state, lowest.instanceId);
    }
    const lostS = opponentState.shields.find((s) => !s.isBroken);
    if (!lostS) return state;
    return {
      ...state,
      players: {
        ...state.players,
        [opponent]: {
          ...opponentState,
          shields: opponentState.shields.filter((s) => s.id !== lostS.id),
          graveyard: [...opponentState.graveyard, { instanceId: lostS.id, card: lostS.card, owner: opponent }]
        }
      },
      actionLog: [...state.actionLog, `${opponent} put a shield into graveyard (Grinning Hunger).`]
    };
  }

  if (cardName === 'chains of sacrifice') {
    const oppIds =
      targets && targets.length > 0
        ? targets.slice(0, 2)
        : [...opponentState.battleZone]
            .sort((a, b) => effPower(b, opponentState, casterState) - effPower(a, opponentState, casterState))
            .slice(0, 2)
            .map((c) => c.instanceId);
    let nextState = destroyCreaturesBatch(state, oppIds);
    const ownLowest = [...nextState.players[player].battleZone].sort(
      (a, b) => effPower(a, nextState.players[player], nextState.players[opponent]) - effPower(b, nextState.players[player], nextState.players[opponent])
    )[0];
    if (ownLowest) nextState = destroyCreature(nextState, ownLowest.instanceId);
    return nextState;
  }

  if (cardName === 'miraculous rebirth') {
    const valid = opponentState.battleZone.filter((c) => effPower(c, opponentState, casterState) <= 5000);
    if (valid.length === 0) return state;
    const chosen = targets?.[0] ? valid.find((c) => c.instanceId === targets[0]) || valid[0] : valid[0];
    const targetCost = chosen.card.manaCost;
    let nextState = destroyCreature(state, chosen.instanceId);
    // If put in graveyard, put same-cost creature from deck into BZ
    const dIdx = nextState.players[player].deck.findIndex(
      (ci) => ci.card.type === 'Creature' && !ci.card.isEvolution && ci.card.manaCost === targetCost
    );
    if (dIdx !== -1) {
      const pulled = nextState.players[player].deck[dIdx];
      const remDeck = shuffleCards(nextState.players[player].deck.filter((_, idx) => idx !== dIdx));
      const newC: CreatureInstance = {
        instanceId: pulled.instanceId,
        card: pulled.card,
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
            ...nextState.players[player],
            deck: remDeck,
            battleZone: [...nextState.players[player].battleZone, newC]
          }
        }
      };
      nextState = triggerCIP(nextState, player, newC);
    }
    return nextState;
  }

  if (cardName === 'slash and burn') {
    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...casterState,
          tempOppDestroyTriggerPenalties: (casterState.tempOppDestroyTriggerPenalties || 0) + 1
        }
      },
      actionLog: [...state.actionLog, `${player} cast Slash and Burn.`]
    };
  }

  // 6. Terror Pit / Hopeless Vortex: destroy 1 opponent creature
  if (
    cardName === 'terror pit' ||
    cardName === 'hopeless vortex' ||
    /destroy (?:1|one) of your opponent's creatures/i.test(rules)
  ) {
    const resolved = resolveSingleCreatureTarget(state, player, card, 'opponent', targets);
    if (!resolved.target) return resolved.state;
    return destroyCreature(state, resolved.target.instanceId);
  }

  // 7. Bounce Spells (Spiral Gate, Riptide Charger, Wave Lance, Hide and Seek, Teleportation, Abduction Charger, Hydro Hurricane)
  if (cardName === 'hydro hurricane') {
    const lightCount = casterState.battleZone.filter((c) => getCardCivilizations(c.card).includes('Light')).length;
    const darkCount = casterState.battleZone.filter((c) => getCardCivilizations(c.card).includes('Darkness')).length;
    let nextState = state;
    if (player === 'player' && nextState.interactiveHuman && !targets?.length) {
      if (lightCount > 0 && opponentState.manaZone.length > 0) {
        const oppManaOpts = buildZoneOptions(nextState, opponent, ['manaZone']);
        nextState = enqueueInteraction(nextState, {
          type: 'ZONE_SELECTION',
          player: 'player',
          sourceCardId: card.id,
          sourceCardName: card.name,
          actionKind: 'OPPONENT_MANA_TO_HAND',
          prompt: `Hydro Hurricane: Choose up to ${lightCount} card(s) in opponent's mana zone to return to their hand.`,
          options: oppManaOpts,
          minSelections: 0,
          maxSelections: Math.min(lightCount, oppManaOpts.length)
        });
      }
      if (darkCount > 0 && opponentState.battleZone.length > 0) {
        const oppBZOpts = buildZoneOptions(nextState, opponent, ['battleZone']);
        nextState = enqueueInteraction(nextState, {
          type: 'ZONE_SELECTION',
          player: 'player',
          sourceCardId: card.id,
          sourceCardName: card.name,
          actionKind: 'OPPONENT_BOUNCE_BZ',
          prompt: `Hydro Hurricane: Choose up to ${darkCount} opponent creature(s) in battle zone to return to hand.`,
          options: oppBZOpts,
          minSelections: 0,
          maxSelections: Math.min(darkCount, oppBZOpts.length)
        });
      }
      return nextState;
    }
    if (lightCount > 0 && nextState.players[opponent].manaZone.length > 0) {
      const oppM = nextState.players[opponent].manaZone;
      const bounceM = oppM.slice(0, lightCount);
      const keepM = oppM.slice(lightCount);
      nextState = {
        ...nextState,
        players: {
          ...nextState.players,
          [opponent]: {
            ...nextState.players[opponent],
            manaZone: keepM,
            hand: [...nextState.players[opponent].hand, ...bounceM.map((m) => ({ instanceId: m.instanceId, card: m.card, owner: opponent }))]
          }
        },
        actionLog: [...nextState.actionLog, `Hydro Hurricane returned ${bounceM.length} mana card(s) of ${opponent} to hand.`]
      };
    }
    if (darkCount > 0 && nextState.players[opponent].battleZone.length > 0) {
      const topOpp = [...nextState.players[opponent].battleZone]
        .sort((a, b) => effPower(b, nextState.players[opponent], nextState.players[player]) - effPower(a, nextState.players[opponent], nextState.players[player]))
        .slice(0, darkCount);
      for (const c of topOpp) {
        nextState = bounceCreature(nextState, c.instanceId);
      }
    }
    return nextState;
  }

  if (cardName === 'hide and seek') {
    const resolved = resolveSingleCreatureTarget(state, player, card, 'opponent', targets, {
      isValid: (c) => c.card.type !== 'Evolution Creature' && !c.card.isEvolution,
      validateError: (c) =>
        c.card.type === 'Evolution Creature' || c.card.isEvolution
          ? 'Hide and Seek can only target a non-evolution creature.'
          : null
    });
    const nextState = resolved.target ? bounceCreature(state, resolved.target.instanceId) : resolved.state;
    return discardRandomHandCards(nextState, opponent, 1);
  }

  if (
    cardName === 'spiral gate' ||
    cardName === 'riptide charger' ||
    cardName === 'wave lance' ||
    /choose a creature in the battle zone and return it to its owner's hand/i.test(rules)
  ) {
    const resolved = resolveSingleCreatureTarget(state, player, card, 'any', targets, {
      notFoundError: (tid) => `Target creature ${tid} not found in battle zone.`
    });
    if (!resolved.target) return resolved.state;
    const foundCreature = resolved.target;
    const isDragon = getCreatureRaces(foundCreature).some(
      (r) => r.toLowerCase().includes('dragon') && !r.toLowerCase().includes('dragonoid')
    );
    let nextState = bounceCreature(state, foundCreature.instanceId);
    if (cardName === 'wave lance' && isDragon) {
      nextState = drawCards(nextState, player, 1);
    }
    return nextState;
  }

  if (
    cardName === 'teleportation' ||
    cardName === 'abduction charger' ||
    /choose up to 2 creatures in the battle zone and return them to their owners?'? hands/i.test(rules)
  ) {
    let targetsToBounce: string[] = [];
    if (targets && targets.length > 0) {
      targetsToBounce = targets.slice(0, 2);
    } else if (opponentState.battleZone.length > 0) {
      targetsToBounce = opponentState.battleZone
        .filter((c) => !isUntargetableByOpponent(c))
        .sort((a, b) => effPower(b, opponentState, casterState) - effPower(a, opponentState, casterState))
        .slice(0, 2)
        .map((c) => c.instanceId);
    }
    if (targetsToBounce.length === 0) return state;
    let nextState = state;
    for (const tid of targetsToBounce) {
      nextState = bounceCreature(nextState, tid);
    }
    return nextState;
  }

  // 8b. Miraculous Snare (non-evolution creature -> shields)
  if (cardName === 'miraculous snare') {
    const resolved = resolveSingleCreatureTarget(state, player, card, 'any', targets, {
      isValid: (c) => c.card.type !== 'Evolution Creature' && !c.card.isEvolution,
      validateError: (c) =>
        c.card.type === 'Evolution Creature' || c.card.isEvolution
          ? 'Miraculous Snare can only target a non-evolution creature.'
          : null
    });
    if (!resolved.target) return resolved.state;
    return sendCreatureToShields(state, resolved.target.instanceId);
  }

  // 9. Natural Snare / Freezing Icehammer / Vine Charger / Mulch Charger / Pangaea's Song (creature -> mana zone)
  if (cardName === 'freezing icehammer') {
    const resolved = resolveSingleCreatureTarget(state, player, card, 'opponent', targets, {
      isValid: (c) => getCardCivilizations(c.card).some((civ) => civ === 'Water' || civ === 'Darkness')
    });
    if (!resolved.target) return resolved.state;
    return sendCreatureToManaZone(state, resolved.target.instanceId);
  }

  if (cardName === 'vine charger') {
    if (opponentState.battleZone.length === 0) return state;
    if (opponent === 'player' && state.interactiveHuman && !targets?.length) {
      return enqueueInteraction(state, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: card.id,
        sourceCardName: card.name,
        actionKind: 'OPPONENT_MANA_SEND_BZ',
        prompt: 'Vine Charger: Choose 1 of your creatures in the battle zone to put into your mana zone.',
        options: buildZoneOptions(state, 'player', ['battleZone']),
        minSelections: 1,
        maxSelections: 1
      });
    }
    const weakest = [...opponentState.battleZone].sort(
      (a, b) => effPower(a, opponentState, casterState) - effPower(b, opponentState, casterState)
    )[0];
    return sendCreatureToManaZone(state, weakest.instanceId);
  }

  if (
    cardName === 'natural snare' ||
    /choose 1 of your opponent's creatures in the battle zone and put it into (?:his|their) mana zone/i.test(rules)
  ) {
    const resolved = resolveSingleCreatureTarget(state, player, card, 'opponent', targets);
    if (!resolved.target) return resolved.state;
    return sendCreatureToManaZone(state, resolved.target.instanceId);
  }

  if (
    cardName === 'mulch charger' ||
    cardName === "pangaea's song" ||
    /put (?:1|one) of your creatures from the battle zone into your mana zone/i.test(rules)
  ) {
    const resolved = resolveSingleCreatureTarget(state, player, card, 'friendly', targets);
    if (!resolved.target) return resolved.state;
    return sendCreatureToManaZone(state, resolved.target.instanceId);
  }

  // 11. Mana Ramp Spells (Faerie Life, Ultimate Force, Glory Snow, Mana Bonanza, Rainbow Stone, Mystic Treasure Chest)
  if (
    cardName === 'faerie life' ||
    (/put the top card of (?:your )?deck into (?:your )?mana zone/i.test(rules) &&
      !/opponent/i.test(rules) &&
      !/graveyard/i.test(rules))
  ) {
    return rampTopDeckToManaZone(state, player, 1);
  }

  if (
    cardName === 'ultimate force' ||
    /put the top 2 cards of (?:your )?deck into (?:your )?mana zone/i.test(rules)
  ) {
    return rampTopDeckToManaZone(state, player, 2);
  }

  if (cardName === 'glory snow') {
    if (opponentState.manaZone.length > casterState.manaZone.length) {
      return rampTopDeckToManaZone(state, player, 2);
    }
    return { ...state, actionLog: [...state.actionLog, `${player} cast Glory Snow, but opponent does not have more mana cards.`] };
  }

  if (cardName === 'mana bonanza') {
    return rampTopDeckToManaZone(state, player, casterState.manaZone.length, true);
  }

  // 11b. Miraculous Meltdown / Invincible Cataclysm / Invincible Aura / Mystic Inscription / Sphere of Wonder
  if (
    cardName === 'miraculous meltdown' ||
    /opponent chooses one of his shields for each shield you have/i.test(rules)
  ) {
    const playerShields = casterState.shields.filter((s) => !s.isBroken).length;
    const opponentShields = opponentState.shields.filter((s) => !s.isBroken).length;
    const diff = opponentShields - playerShields;
    if (diff > 0) {
      if (opponent === 'player' && state.interactiveHuman && !targets?.length && playerShields > 0) {
        return enqueueInteraction(state, {
          type: 'ZONE_SELECTION',
          player: 'player',
          sourceCardId: card.id,
          sourceCardName: card.name,
          actionKind: 'MIRACULOUS_MELTDOWN_KEEP',
          prompt: `Miraculous Meltdown: Choose ${playerShields} shield(s) to KEEP (remaining ${diff} go to hand).`,
          options: buildZoneOptions(state, 'player', ['shields'], undefined, { hideCards: true }),
          minSelections: playerShields,
          maxSelections: playerShields
        });
      }
      return breakOpponentShields(state, player, diff, targets);
    }
    return {
      ...state,
      actionLog: [...state.actionLog, `${player} cast Miraculous Meltdown, but opponent does not have more shields.`]
    };
  }

  if (cardName === 'invincible cataclysm') {
    return destroyOpponentShields(state, player, 3, targets);
  }
  if (cardName === 'invincible aura') {
    return addShieldFromDeck(state, player, 3);
  }
  if (cardName === 'mystic inscription') {
    return addShieldFromDeck(state, player, 1);
  }
  if (cardName === 'sphere of wonder') {
    const myS = casterState.shields.filter((s) => !s.isBroken).length;
    const oppS = opponentState.shields.filter((s) => !s.isBroken).length;
    return oppS > myS ? addShieldFromDeck(state, player, 1) : state;
  }

  // 11c. Reverse Armor: Untap friendly creature
  if (cardName === 'reverse armor' || /untap (?:a|one|that|the) creature/i.test(rules)) {
    const friendlyBZ = casterState.battleZone;
    if (friendlyBZ.length === 0) return state;
    const targetId = targets?.[0] || friendlyBZ.find((c) => c.isTapped)?.instanceId || friendlyBZ[0].instanceId;
    const targetCreature = friendlyBZ.find((c) => c.instanceId === targetId);
    if (!targetCreature) return state;
    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...casterState,
          battleZone: friendlyBZ.map((c) => (c.instanceId === targetId ? { ...c, isTapped: false } : c))
        }
      },
      actionLog: [...state.actionLog, `${player} untapped ${targetCreature.card.name} with ${card.name}.`]
    };
  }

  // 11d. Sundrop Armor / Nexus Charger: Add card from hand to shields
  if (
    cardName === 'sundrop armor' ||
    cardName === 'nexus charger' ||
    /add a card from your hand to your shields/i.test(rules)
  ) {
    const curHand = casterState.hand;
    if (curHand.length === 0) return state;
    const chosenIndex =
      targets && targets.length > 0
        ? Math.max(0, curHand.findIndex((c) => c.instanceId === targets[0]))
        : 0;
    const chosenCard = curHand[chosenIndex];
    const shieldId = makeShieldId(player, casterState.shields.length);
    const newShield: ShieldInstance = { id: shieldId, shieldId, card: chosenCard.card, isBroken: false };
    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...casterState,
          hand: curHand.filter((_, idx) => idx !== chosenIndex),
          shields: [...casterState.shields, newShield]
        }
      },
      actionLog: [...state.actionLog, `${player} added a card from hand to shields with ${card.name}.`]
    };
  }

  // Mana-to-Hand / Shield / Graveyard Spells (Boomerang Comet, Flood Valve, Clone Factory, Mystic Dreamscape, Logic Sphere, Roar of the Earth, Aurora of Reversal, Mana Nexus, Enchanted Soil)
  if (
    cardName === 'boomerang comet' ||
    cardName === 'flood valve' ||
    cardName === 'clone factory' ||
    cardName === 'mystic dreamscape' ||
    cardName === 'logic sphere' ||
    cardName === 'roar of the earth'
  ) {
    const maxCount = cardName === 'mystic dreamscape' ? 3 : cardName === 'clone factory' ? 2 : 1;
    const pMana = casterState.manaZone;
    const filterMana = (m: ManaCardInstance) => {
      if (cardName === 'logic sphere') return m.card.type === 'Spell';
      if (cardName === 'roar of the earth') return m.card.type.includes('Creature') && m.card.manaCost >= 6;
      return true;
    };
    const matching = pMana.filter(filterMana).slice(0, maxCount);
    if (matching.length === 0) return state;
    const ids = new Set(matching.map((m) => m.instanceId));
    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...casterState,
          manaZone: pMana.filter((m) => !ids.has(m.instanceId)),
          hand: [...casterState.hand, ...matching.map((m) => ({ instanceId: m.instanceId, card: m.card, owner: player }))]
        }
      },
      actionLog: [...state.actionLog, `${player} returned ${matching.length} card(s) from mana zone to hand with ${card.name}.`]
    };
  }

  if (cardName === 'mana nexus' && casterState.manaZone.length > 0) {
    const m0 = casterState.manaZone[0];
    const sid = makeShieldId(player, casterState.shields.length);
    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...casterState,
          manaZone: casterState.manaZone.slice(1),
          shields: [...casterState.shields, { id: sid, shieldId: sid, card: m0.card, isBroken: false }]
        }
      },
      actionLog: [...state.actionLog, `${player} added ${m0.card.name} from mana zone to shields with Mana Nexus.`]
    };
  }

  if (cardName === 'enchanted soil') {
    const graveCreatures = casterState.graveyard.filter((c) => c.card.type.includes('Creature')).slice(0, 2);
    if (graveCreatures.length === 0) return state;
    const ids = new Set(graveCreatures.map((c) => c.instanceId));
    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...casterState,
          graveyard: casterState.graveyard.filter((c) => !ids.has(c.instanceId)),
          manaZone: [...casterState.manaZone, ...graveCreatures.map((c) => toManaCard(c))]
        }
      },
      actionLog: [...state.actionLog, `${player} put ${graveCreatures.length} creature(s) from graveyard into mana zone.`]
    };
  }

  // Dark Reversal / Corpse Charger
  if (
    cardName === 'dark reversal' ||
    cardName === 'corpse charger' ||
    /return a creature from your graveyard to your hand/i.test(rules) ||
    /put a creature from your graveyard into your hand/i.test(rules)
  ) {
    const creatureIndices = casterState.graveyard
      .map((c, idx) => ({ c, idx }))
      .filter((x) => x.c.card.type.includes('Creature'));
    if (creatureIndices.length === 0) {
      return {
        ...state,
        actionLog: [...state.actionLog, `${player} cast ${card.name}, but there are no creatures in the graveyard.`]
      };
    }
    if (player === 'player' && state.interactiveHuman && !targets?.length) {
      const opts = buildZoneOptions(state, 'player', ['graveyard'], (o) => o.card.type.includes('Creature'));
      return enqueueInteraction(state, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: card.id,
        sourceCardName: card.name,
        actionKind: 'PLAYER_SALVAGE_GY',
        prompt: `${card.name}: Choose 1 creature from your graveyard to return to your hand.`,
        options: opts,
        minSelections: 1,
        maxSelections: 1
      });
    }
    let chosenIndex = -1;
    if (targets && targets.length > 0) {
      const match = creatureIndices.find((x) => x.c.instanceId === targets[0] || x.c.card.id === targets[0]);
      if (match) chosenIndex = match.idx;
    }
    if (chosenIndex === -1) {
      chosenIndex = [...creatureIndices].sort((a, b) => (b.c.card.power ?? 0) - (a.c.card.power ?? 0))[0].idx;
    }
    const chosenCard = casterState.graveyard[chosenIndex];
    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...casterState,
          graveyard: casterState.graveyard.filter((_, idx) => idx !== chosenIndex),
          hand: [...casterState.hand, chosenCard]
        }
      },
      actionLog: [...state.actionLog, `${player} returned ${chosenCard.card.name} from graveyard to hand with ${card.name}.`]
    };
  }

  // Morbid Medicine
  if (
    cardName === 'morbid medicine' ||
    /return up to 2 creatures from your graveyard to your hand/i.test(rules)
  ) {
    const creatureIndices = casterState.graveyard
      .map((c, idx) => ({ c, idx }))
      .filter((x) => x.c.card.type.includes('Creature'));
    if (creatureIndices.length === 0) {
      return {
        ...state,
        actionLog: [...state.actionLog, `${player} cast ${card.name}, but there are no creatures in the graveyard.`]
      };
    }
    if (player === 'player' && state.interactiveHuman && !targets?.length) {
      const opts = buildZoneOptions(state, 'player', ['graveyard'], (o) => o.card.type.includes('Creature'));
      return enqueueInteraction(state, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: card.id,
        sourceCardName: card.name,
        actionKind: 'PLAYER_SALVAGE_GY',
        prompt: `${card.name}: Choose up to 2 creatures from your graveyard to return to your hand.`,
        options: opts,
        minSelections: 0,
        maxSelections: Math.min(2, opts.length)
      });
    }
    const chosenIndices: number[] = [];
    if (targets && targets.length > 0) {
      for (const tid of targets.slice(0, 2)) {
        const match = creatureIndices.find(
          (x) => !chosenIndices.includes(x.idx) && (x.c.instanceId === tid || x.c.card.id === tid)
        );
        if (match) chosenIndices.push(match.idx);
      }
    }
    if (chosenIndices.length === 0) {
      const sorted = [...creatureIndices].sort((a, b) => (b.c.card.power ?? 0) - (a.c.card.power ?? 0));
      for (const item of sorted.slice(0, 2)) chosenIndices.push(item.idx);
    }
    const chosenCards = chosenIndices.map((idx) => casterState.graveyard[idx]);
    const chosenSet = new Set(chosenIndices);
    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...casterState,
          graveyard: casterState.graveyard.filter((_, idx) => !chosenSet.has(idx)),
          hand: [...casterState.hand, ...chosenCards]
        }
      },
      actionLog: [
        ...state.actionLog,
        `${player} returned ${chosenCards.map((c) => c.card.name).join(', ')} from graveyard to hand with ${card.name}.`
      ]
    };
  }

  // Zombie Carnival
  if (
    cardName === 'zombie carnival' ||
    (/choose a race/i.test(rules) && /from your graveyard to your hand/i.test(rules))
  ) {
    const creatureIndices = casterState.graveyard
      .map((c, idx) => ({ c, idx }))
      .filter((x) => x.c.card.type.includes('Creature'));
    if (creatureIndices.length === 0) {
      return {
        ...state,
        actionLog: [...state.actionLog, `${player} cast ${card.name}, but there are no creatures in the graveyard.`]
      };
    }
    if (player === 'player' && state.interactiveHuman && !targets?.length) {
      const opts = buildZoneOptions(state, 'player', ['graveyard'], (o) => o.card.type.includes('Creature'));
      return enqueueInteraction(state, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: card.id,
        sourceCardName: card.name,
        actionKind: 'PLAYER_SALVAGE_GY',
        prompt: `${card.name}: Choose up to 3 creatures sharing one race from your graveyard to return to your hand.`,
        options: opts,
        minSelections: 0,
        maxSelections: Math.min(3, opts.length)
      });
    }
    const getRaces = (cd: CardDefinition): string[] => {
      const list = [...(cd.races || [])];
      const legacy = (cd as unknown as { race?: string }).race;
      if (legacy) list.push(legacy);
      return list;
    };
    let chosenCards: CardInstance[] = [];
    let chosenRace = '';
    if (targets && targets.length > 0) {
      const targetCreatures: { c: CardInstance; idx: number }[] = [];
      for (const tid of targets.slice(0, 3)) {
        const match = creatureIndices.find(
          (x) => !targetCreatures.some((tc) => tc.idx === x.idx) && (x.c.instanceId === tid || x.c.card.id === tid)
        );
        if (match) targetCreatures.push(match);
      }
      if (targetCreatures.length > 0) {
        let commonRaces = getRaces(targetCreatures[0].c.card);
        for (let i = 1; i < targetCreatures.length; i++) {
          const rList = getRaces(targetCreatures[i].c.card);
          commonRaces = commonRaces.filter((r) => rList.includes(r));
        }
        if (commonRaces.length === 0) {
          throw new Error(`Target creatures do not share a common race for ${card.name}.`);
        }
        chosenRace = commonRaces[0];
        chosenCards = targetCreatures.map((x) => x.c);
      }
    }
    if (chosenCards.length === 0) {
      chosenRace = pickMostCommonRace(creatureIndices.map((x) => x.c));
      if (!chosenRace) {
        return {
          ...state,
          actionLog: [...state.actionLog, `${player} cast ${card.name}, but no creatures with races were found in graveyard.`]
        };
      }
      chosenCards = creatureIndices
        .filter((x) => getRaces(x.c.card).includes(chosenRace))
        .sort((a, b) => (b.c.card.power ?? 0) - (a.c.card.power ?? 0))
        .slice(0, 3)
        .map((x) => x.c);
    }
    const chosenIds = new Set(chosenCards.map((c) => c.instanceId));
    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...casterState,
          graveyard: casterState.graveyard.filter((c) => !chosenIds.has(c.instanceId)),
          hand: [...casterState.hand, ...chosenCards]
        }
      },
      actionLog: [
        ...state.actionLog,
        `${player} returned ${chosenCards.length} ${chosenRace} creature(s) (${chosenCards.map((c) => c.card.name).join(', ')}) from graveyard to hand with ${card.name}.`
      ]
    };
  }

  // Reap and Sow / Mana Crisis / Cataclysmic Eruption
  if (
    cardName === 'reap and sow' ||
    (/opponent's mana zone and put it into (?:his|their) graveyard/i.test(rules) &&
      /top card of (?:your )?deck into (?:your )?mana zone/i.test(rules))
  ) {
    let nextState = state;
    const oppMana = opponentState.manaZone;
    if (oppMana.length > 0) {
      if (player === 'player' && state.interactiveHuman && !targets?.length) {
        return enqueueInteraction(state, {
          type: 'ZONE_SELECTION',
          player: 'player',
          sourceCardId: card.id,
          sourceCardName: card.name,
          actionKind: 'OPPONENT_MANA_TO_GY',
          prompt: `${card.name}: Choose 1 card in opponent's mana zone to put into their graveyard (then you ramp 1).`,
          options: buildZoneOptions(state, opponent, ['manaZone']),
          minSelections: 1,
          maxSelections: 1,
          contextData: { rampCaster: 'player' }
        });
      }
      let targetIndex = 0;
      if (targets && targets.length > 0) {
        const idx = oppMana.findIndex((m) => m.instanceId === targets[0] || m.card.id === targets[0]);
        if (idx !== -1) targetIndex = idx;
      }
      const destroyedMana = oppMana[targetIndex];
      nextState = {
        ...state,
        players: {
          ...state.players,
          [opponent]: {
            ...opponentState,
            manaZone: oppMana.filter((_, idx) => idx !== targetIndex),
            graveyard: [...opponentState.graveyard, { instanceId: destroyedMana.instanceId, card: destroyedMana.card, owner: opponent }]
          }
        },
        actionLog: [
          ...state.actionLog,
          `${player} put ${destroyedMana.card.name} from ${opponent}'s mana zone into the graveyard with ${card.name}.`
        ]
      };
    }
    return rampTopDeckToManaZone(nextState, player, 1);
  }

  if (
    cardName === 'mana crisis' ||
    /choose a card in your opponent's mana zone and put it into (?:his|their) graveyard/i.test(rules)
  ) {
    const oppMana = opponentState.manaZone;
    if (oppMana.length === 0) {
      return {
        ...state,
        actionLog: [...state.actionLog, `${player} cast ${card.name}, but ${opponent} has no cards in the mana zone.`]
      };
    }
    if (player === 'player' && state.interactiveHuman && !targets?.length) {
      return enqueueInteraction(state, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: card.id,
        sourceCardName: card.name,
        actionKind: 'OPPONENT_MANA_TO_GY',
        prompt: `${card.name}: Choose 1 card in opponent's mana zone to put into their graveyard.`,
        options: buildZoneOptions(state, opponent, ['manaZone']),
        minSelections: 1,
        maxSelections: 1
      });
    }
    let targetIndex = 0;
    if (targets && targets.length > 0) {
      const idx = oppMana.findIndex((m) => m.instanceId === targets[0] || m.card.id === targets[0]);
      if (idx !== -1) targetIndex = idx;
    }
    const destroyedMana = oppMana[targetIndex];
    return {
      ...state,
      players: {
        ...state.players,
        [opponent]: {
          ...opponentState,
          manaZone: oppMana.filter((_, idx) => idx !== targetIndex),
          graveyard: [...opponentState.graveyard, { instanceId: destroyedMana.instanceId, card: destroyedMana.card, owner: opponent }]
        }
      },
      actionLog: [
        ...state.actionLog,
        `${player} put ${destroyedMana.card.name} from ${opponent}'s mana zone into the graveyard with ${card.name}.`
      ]
    };
  }

  if (cardName === 'cataclysmic eruption') {
    const natureCount = casterState.battleZone.filter((c) => getCardCivilizations(c.card).includes('Nature')).length;
    const countToKill = Math.min(natureCount, opponentState.manaZone.length);
    if (countToKill <= 0) return state;
    if (player === 'player' && state.interactiveHuman && !targets?.length) {
      return enqueueInteraction(state, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: card.id,
        sourceCardName: card.name,
        actionKind: 'OPPONENT_MANA_TO_GY',
        prompt: `${card.name}: Choose ${countToKill} card(s) in opponent's mana zone to put into their graveyard.`,
        options: buildZoneOptions(state, opponent, ['manaZone']),
        minSelections: countToKill,
        maxSelections: countToKill
      });
    }
    const lost = opponentState.manaZone.slice(0, countToKill);
    return {
      ...state,
      players: {
        ...state.players,
        [opponent]: {
          ...opponentState,
          manaZone: opponentState.manaZone.slice(countToKill),
          graveyard: [...opponentState.graveyard, ...lost.map((m) => ({ instanceId: m.instanceId, card: m.card, owner: opponent }))]
        }
      },
      actionLog: [...state.actionLog, `${player} destroyed ${countToKill} mana card(s) with Cataclysmic Eruption.`]
    };
  }

  // Draw / Filter Spells
  if (cardName === 'brain serum' || cardName === 'energy stream') return drawCards(state, player, 2);
  if (cardName === 'cyber brain') return drawCards(state, player, 3);
  if (cardName === 'eureka charger') return drawCards(state, player, 1);
  if (cardName === 'thought probe') {
    return opponentState.battleZone.length >= 3 ? drawCards(state, player, 3) : state;
  }
  if (cardName === 'emergency typhoon') {
    const drawn = drawCards(state, player, 2);
    if (player === 'player' && drawn.interactiveHuman && drawn.players[player].hand.length > 0 && !targets?.length) {
      return enqueueInteraction(drawn, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: card.id,
        sourceCardName: card.name,
        actionKind: 'PLAYER_DISCARD_FROM_HAND',
        prompt: 'Emergency Typhoon: Choose 1 card from your hand to discard.',
        options: buildZoneOptions(drawn, 'player', ['hand']),
        minSelections: 1,
        maxSelections: 1
      });
    }
    return drawn.players[player].hand.length > 0 ? discardRandomHandCards(drawn, player, 1) : drawn;
  }
  if (cardName === 'enigmatic cascade') {
    if (player === 'player' && state.interactiveHuman && !targets?.length && casterState.hand.length > 0) {
      return enqueueInteraction(state, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: card.id,
        sourceCardName: card.name,
        actionKind: 'PLAYER_DISCARD_FROM_HAND',
        prompt: 'Enigmatic Cascade: Choose up to 2 cards from your hand to discard (draw 1 per discarded card).',
        options: buildZoneOptions(state, 'player', ['hand']),
        minSelections: 0,
        maxSelections: Math.min(2, casterState.hand.length),
        contextData: { drawPerDiscard: true }
      });
    }
    const count = Math.min(2, casterState.hand.length);
    const afterDiscard = discardRandomHandCards(state, player, count);
    return drawCards(afterDiscard, player, count);
  }
  if (cardName === 'psychic shaper') {
    const top4 = casterState.deck.slice(0, 4);
    const remDeck = casterState.deck.slice(4);
    const waterCards = top4.filter((c) => getCardCivilizations(c.card).includes('Water'));
    const otherCards = top4.filter((c) => !getCardCivilizations(c.card).includes('Water'));
    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...casterState,
          deck: remDeck,
          hand: [...casterState.hand, ...waterCards],
          graveyard: [...casterState.graveyard, ...otherCards]
        }
      },
      actionLog: [...state.actionLog, `${player} revealed top 4 cards with Psychic Shaper and put ${waterCards.length} Water card(s) into hand.`]
    };
  }
  if (cardName === 'submarine project' && casterState.deck.length > 0) {
    const top4 = casterState.deck.slice(0, 4);
    const restDeck = casterState.deck.slice(4);
    const [pick, ...others] = top4;
    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...casterState,
          deck: [...restDeck, ...others],
          hand: [...casterState.hand, pick]
        }
      },
      actionLog: [...state.actionLog, `${player} looked at top 4 cards with Submarine Project and kept 1.`]
    };
  }
  if (cardName === 'rise and shine' && casterState.deck.length > 0) {
    const top4 = casterState.deck.slice(0, 4);
    const restDeck = casterState.deck.slice(4);
    const blockerIdx = top4.findIndex((c) => getCardCapabilities(c.card).isBlocker);
    if (blockerIdx === -1) {
      return {
        ...state,
        players: { ...state.players, [player]: { ...casterState, deck: [...restDeck, ...top4] } }
      };
    }
    const picked = top4[blockerIdx];
    const others = top4.filter((_, i) => i !== blockerIdx);
    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...casterState,
          deck: [...restDeck, ...others],
          hand: [...casterState.hand, picked]
        }
      },
      actionLog: [...state.actionLog, `${player} found blocker ${picked.card.name} with Rise and Shine.`]
    };
  }

  // Buffs & Temporary Combat/Rule Grants
  if (cardName === 'energy charger' || /gets \+2000 power until the end of the turn/i.test(rules)) {
    const resolved = resolveSingleCreatureTarget(state, player, card, 'friendly', targets);
    if (!resolved.target) return resolved.state;
    const targetCreature = resolved.target;
    const targetId = targetCreature.instanceId;
    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...casterState,
          battleZone: casterState.battleZone.map((c) =>
            c.instanceId === targetId ? { ...c, powerModifier: c.powerModifier + 2000 } : c
          )
        }
      },
      actionLog: [...state.actionLog, `${player} gave +2000 power to ${targetCreature.card.name}.`]
    };
  }

  if (cardName === 'colossus boost' || cardName === 'protective force') {
    const friendlyBZ = casterState.battleZone;
    if (friendlyBZ.length === 0) return state;
    const candidates = cardName === 'protective force'
      ? friendlyBZ.filter((c) => hasCreatureBlocker(c, friendlyBZ, opponentState.battleZone, casterState))
      : friendlyBZ;
    if (candidates.length === 0) return state;
    const tid = targets?.[0] || candidates[0].instanceId;
    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...casterState,
          battleZone: friendlyBZ.map((c) => (c.instanceId === tid ? { ...c, powerModifier: c.powerModifier + 4000 } : c))
        }
      },
      actionLog: [...state.actionLog, `${player} boosted creature power by +4000 with ${card.name}.`]
    };
  }

  if (cardName === 'magma gazer') {
    const friendlyBZ = casterState.battleZone;
    if (friendlyBZ.length === 0) return state;
    const tid = targets?.[0] || friendlyBZ[0].instanceId;
    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...casterState,
          battleZone: friendlyBZ.map((c) =>
            c.instanceId === tid
              ? { ...c, tempPowerAttackerBonus: (c.tempPowerAttackerBonus || 0) + 4000, tempDoubleBreaker: true }
              : c
          )
        }
      },
      actionLog: [...state.actionLog, `${player} cast Magma Gazer (+4000 PA and Double Breaker).`]
    };
  }

  if (
    cardName === 'burning power' ||
    /gets (?:“|")?power attacker \+2000(?:”|")?/i.test(rules)
  ) {
    const friendlyBZ = casterState.battleZone;
    if (friendlyBZ.length === 0) return state;
    const targetId = targets?.[0] || friendlyBZ[0].instanceId;
    const targetCreature = friendlyBZ.find((c) => c.instanceId === targetId);
    if (!targetCreature) return state;
    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...casterState,
          battleZone: friendlyBZ.map((c) =>
            c.instanceId === targetId
              ? { ...c, tempPowerAttackerBonus: (c.tempPowerAttackerBonus || 0) + 2000 }
              : c
          )
        }
      },
      actionLog: [...state.actionLog, `${player} gave power attacker +2000 to ${targetCreature.card.name} with ${card.name}.`]
    };
  }

  if (cardName === 'muscle charger') {
    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...casterState,
          battleZone: casterState.battleZone.map((c) => ({ ...c, powerModifier: c.powerModifier + 3000 }))
        }
      },
      actionLog: [...state.actionLog, `${player} gave all friendly creatures +3000 power with Muscle Charger.`]
    };
  }

  if (cardName === 'invincible unity') {
    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...casterState,
          battleZone: casterState.battleZone.map((c) => ({
            ...c,
            powerModifier: c.powerModifier + 8000,
            tempTripleBreaker: true
          }))
        }
      },
      actionLog: [...state.actionLog, `${player} cast Invincible Unity (+8000 power and Triple Breaker)!`]
    };
  }

  if (cardName === 'aura blast' || cardName === 'thirst for the hunt') {
    const bonus = cardName === 'aura blast' ? 2000 : 1000;
    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...casterState,
          battleZone: casterState.battleZone.map((c) => ({
            ...c,
            tempPowerAttackerBonus: (c.tempPowerAttackerBonus || 0) + bonus
          }))
        }
      },
      actionLog: [...state.actionLog, `${player} gave all creatures power attacker +${bonus} with ${card.name}.`]
    };
  }

  if (cardName === 'blaze cannon') {
    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...casterState,
          battleZone: casterState.battleZone.map((c) => ({
            ...c,
            tempPowerAttackerBonus: (c.tempPowerAttackerBonus || 0) + 4000,
            tempDoubleBreaker: true
          }))
        }
      },
      actionLog: [...state.actionLog, `${player} cast Blaze Cannon (+4000 PA and Double Breaker for all creatures)!`]
    };
  }

  if (cardName === 'snake attack') {
    let nextState: GameState = {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...casterState,
          battleZone: casterState.battleZone.map((c) => ({ ...c, tempDoubleBreaker: true }))
        }
      }
    };
    const cS = nextState.players[player];
    const unbroken = cS.shields.filter((s) => !s.isBroken);
    if (unbroken.length > 0) {
      const sh = unbroken[0];
      nextState = {
        ...nextState,
        players: {
          ...nextState.players,
          [player]: {
            ...cS,
            shields: cS.shields.filter((s) => s.id !== sh.id),
            graveyard: [...cS.graveyard, { instanceId: sh.id, card: sh.card, owner: player }]
          }
        }
      };
    }
    return nextState;
  }

  if (cardName === 'furious onslaught') {
    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...casterState,
          battleZone: casterState.battleZone.map((c) =>
            getCreatureRaces(c).some((r) => normalizeRace(r) === 'dragonoid')
              ? {
                  ...c,
                  powerModifier: c.powerModifier + 4000,
                  tempDoubleBreaker: true,
                  tempExtraRaces: [...(c.tempExtraRaces || []), 'Armored Dragon']
                }
              : c
          )
        }
      },
      actionLog: [...state.actionLog, `${player} cast Furious Onslaught!`]
    };
  }

  if (cardName === 'rumble gate') {
    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...casterState,
          tempAttackUntappedAllThisTurn: true,
          battleZone: casterState.battleZone.map((c) => ({ ...c, powerModifier: c.powerModifier + 1000 }))
        }
      },
      actionLog: [...state.actionLog, `${player} cast Rumble Gate (+1000 power & can attack untapped creatures).`]
    };
  }

  if (cardName === 'diamond cutter') {
    return {
      ...state,
      players: {
        ...state.players,
        [player]: { ...casterState, tempIgnoreAttackPrevention: true }
      },
      actionLog: [...state.actionLog, `${player} cast Diamond Cutter! Attack restrictions against opponent ignored this turn.`]
    };
  }

  if (cardName === 'miracle portal') {
    const friendlyBZ = casterState.battleZone;
    if (friendlyBZ.length === 0) return state;
    const tid = targets?.[0] || friendlyBZ[0].instanceId;
    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...casterState,
          tempIgnoreAttackPrevention: true,
          battleZone: friendlyBZ.map((c) => (c.instanceId === tid ? { ...c, tempUnblockable: true } : c))
        }
      },
      actionLog: [...state.actionLog, `${player} cast Miracle Portal!`]
    };
  }

  if (cardName === 'chaos strike') {
    const resolved = resolveSingleCreatureTarget(state, player, card, 'opponent', targets, {
      isValid: (c) => !c.isTapped
    });
    if (!resolved.target) return resolved.state;
    const tid = resolved.target.instanceId;
    return {
      ...state,
      players: {
        ...state.players,
        [opponent]: {
          ...opponentState,
          tempAttackableUntappedIds: [...(opponentState.tempAttackableUntappedIds || []), tid]
        }
      },
      actionLog: [...state.actionLog, `${player} cast Chaos Strike on ${resolved.target.card.name}.`]
    };
  }

  if (cardName === 'sonic wing' || cardName === 'cosmic wing' || cardName === 'laser wing') {
    const maxCount = cardName === 'laser wing' ? 2 : 1;
    const ids = new Set(
      targets && targets.length > 0
        ? targets.slice(0, maxCount)
        : casterState.battleZone.slice(0, maxCount).map((c) => c.instanceId)
    );
    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...casterState,
          battleZone: casterState.battleZone.map((c) =>
            ids.has(c.instanceId) ? { ...c, tempUnblockable: true } : c
          )
        }
      },
      actionLog: [...state.actionLog, `${player} made ${ids.size} creature(s) unblockable this turn with ${card.name}.`]
    };
  }

  if (cardName === 'marine scramble') {
    return {
      ...state,
      players: { ...state.players, [player]: { ...casterState, tempAllUnblockableThisTurn: true } },
      actionLog: [...state.actionLog, `${player} cast Marine Scramble (your creatures can't be blocked this turn).`]
    };
  }

  if (cardName === 'impossible tunnel') {
    const race = pickDominantRaceOnBoard(casterState.battleZone);
    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...casterState,
          tempUnblockableRacesThisTurn: [...(casterState.tempUnblockableRacesThisTurn || []), race]
        }
      },
      actionLog: [...state.actionLog, `${player} cast Impossible Tunnel for ${race}.`]
    };
  }

  if (cardName === 'full defensor') {
    return {
      ...state,
      players: { ...state.players, [player]: { ...casterState, tempAllBlockersUntilNextTurn: true } },
      actionLog: [...state.actionLog, `${player} cast Full Defensor (all friendly creatures gain Blocker until next turn).`]
    };
  }

  if (cardName === 'unified resistance') {
    const race = pickDominantRaceOnBoard(casterState.battleZone);
    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...casterState,
          tempRaceBlockersUntilNextTurn: [...(casterState.tempRaceBlockersUntilNextTurn || []), race]
        }
      },
      actionLog: [...state.actionLog, `${player} cast Unified Resistance granting Blocker to ${race}.`]
    };
  }

  if (cardName === 'miraculous truce') {
    // Pick most threatening civilization on opponent board/mana
    const civCounts: Partial<Record<Civilization, number>> = {};
    for (const c of opponentState.battleZone) {
      for (const civ of getCardCivilizations(c.card)) {
        civCounts[civ] = (civCounts[civ] || 0) + 1;
      }
    }
    const chosenCiv =
      (Object.entries(civCounts).sort((a, b) => b[1] - a[1])[0]?.[0] as Civilization) ||
      getCardCivilizations(opponentState.manaZone[0]?.card)[0] ||
      'Fire';
    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...casterState,
          tempProtectedFromAttackCivs: [...(casterState.tempProtectedFromAttackCivs || []), chosenCiv]
        }
      },
      actionLog: [...state.actionLog, `${player} cast Miraculous Truce naming ${chosenCiv}!`]
    };
  }

  if (cardName === 'creeping plague') {
    return {
      ...state,
      players: { ...state.players, [player]: { ...casterState, tempSlayerOnBlockedThisTurn: true } },
      actionLog: [...state.actionLog, `${player} cast Creeping Plague.`]
    };
  }

  // Forced Attack Spells: Slime Veil, Infernal Command, Forced Frenzy
  if (cardName === 'slime veil') {
    return {
      ...state,
      players: {
        ...state.players,
        [opponent]: {
          ...opponentState,
          tempForceAllAttacksUntilNextTurn: true,
          tempForceAllAttacksGrantedBy: player
        }
      },
      actionLog: [
        ...state.actionLog,
        `${player} cast Slime Veil: all of ${opponent}'s creatures must attack if able next turn.`
      ]
    };
  }

  if (cardName === 'infernal command') {
    const resolved = resolveSingleCreatureTarget(state, player, card, 'opponent', targets);
    if (!resolved.target) return resolved.state;
    const tid = resolved.target.instanceId;
    return {
      ...state,
      players: {
        ...state.players,
        [opponent]: {
          ...opponentState,
          battleZone: opponentState.battleZone.map((c) =>
            c.instanceId === tid
              ? { ...c, tempAttacksIfAble: true, tempAttacksIfAbleUntilTurnOf: player }
              : c
          )
        }
      },
      actionLog: [
        ...state.actionLog,
        `${player} cast Infernal Command on ${resolved.target.card.name} (attacks if able until start of ${player}'s next turn).`
      ]
    };
  }

  if (cardName === 'forced frenzy') {
    return {
      ...state,
      players: {
        ...state.players,
        [opponent]: {
          ...opponentState,
          battleZone: opponentState.battleZone.map((c) => ({
            ...c,
            tempAttacksIfAble: true,
            tempAttacksIfAbleUntilTurnOf: player
          }))
        }
      },
      actionLog: [
        ...state.actionLog,
        `${player} cast Forced Frenzy: ${opponent}'s creatures get "attacks if able" until start of ${player}'s next turn.`
      ]
    };
  }

  if (cardName === 'venom charger' && casterState.battleZone.length > 0) {
    const tid = targets?.[0] || casterState.battleZone[0].instanceId;
    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...casterState,
          battleZone: casterState.battleZone.map((c) => (c.instanceId === tid ? { ...c, tempSlayer: true } : c))
        }
      },
      actionLog: [...state.actionLog, `${player} granted Slayer to a creature with Venom Charger.`]
    };
  }

  if (cardName === 'supersonic jet pack' && casterState.battleZone.length > 0) {
    const tid = targets?.[0] || casterState.battleZone[0].instanceId;
    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...casterState,
          battleZone: casterState.battleZone.map((c) => (c.instanceId === tid ? { ...c, tempSpeedAttacker: true } : c))
        }
      },
      actionLog: [...state.actionLog, `${player} granted Speed Attacker with Supersonic Jet Pack.`]
    };
  }

  if (cardName === 'root charger' || cardName === 'fruit of eternity') {
    return {
      ...state,
      players: { ...state.players, [player]: { ...casterState, tempManaOnDestroyThisTurn: true } },
      actionLog: [...state.actionLog, `${player} cast ${card.name} (destroyed creatures go to mana zone this turn).`]
    };
  }

  if (cardName === 'fists of forever' && casterState.battleZone.length > 0) {
    const tid = targets?.[0] || casterState.battleZone[0].instanceId;
    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...casterState,
          battleZone: casterState.battleZone.map((c) =>
            c.instanceId === tid ? { ...c, tempUntapOnWinBattle: true } : c
          )
        }
      },
      actionLog: [...state.actionLog, `${player} cast Fists of Forever.`]
    };
  }

  if (cardName === 'whisking whirlwind') {
    return {
      ...state,
      players: { ...state.players, [player]: { ...casterState, tempUntapAllAtEndTurn: true } },
      actionLog: [...state.actionLog, `${player} cast Whisking Whirlwind.`]
    };
  }

  if (cardName === 'lunar charger') {
    const ids = new Set(
      targets && targets.length > 0
        ? targets.slice(0, 2)
        : casterState.battleZone.slice(0, 2).map((c) => c.instanceId)
    );
    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...casterState,
          battleZone: casterState.battleZone.map((c) =>
            ids.has(c.instanceId) ? { ...c, tempUntapAtEndTurn: true } : c
          )
        }
      },
      actionLog: [...state.actionLog, `${player} cast Lunar Charger.`]
    };
  }

  if (cardName === 'miracle quest') {
    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...casterState,
          tempDrawPerShieldBrokenOnAttack:
            (casterState.tempDrawPerShieldBrokenOnAttack || 0) + 2
        }
      },
      actionLog: [
        ...state.actionLog,
        `${player} cast Miracle Quest (draw 2 cards per shield broken on attack this turn).`
      ]
    };
  }

  // Search Deck Spells (Dimension Gate, Crystal Memory, Logic Cube, Rainbow Stone, Rainbow Gate, Mystic Treasure Chest)
  if (
    cardName === 'dimension gate' ||
    /search your deck.*take a creature from your deck.*put it into your hand/i.test(rules)
  ) {
    return searchDeckForCard(state, player, (c) => c.type.includes('Creature'), 'hand', {
      shuffleAfter: true,
      specificInstanceId: targets?.[0],
      preferHighestPower: true
    });
  }

  if (cardName === 'crystal memory') {
    return searchDeckForCard(state, player, () => true, 'hand', {
      shuffleAfter: true,
      specificInstanceId: targets?.[0]
    });
  }

  if (cardName === 'logic cube') {
    return searchDeckForCard(state, player, (c) => c.type === 'Spell', 'hand', {
      shuffleAfter: true,
      specificInstanceId: targets?.[0]
    });
  }

  if (cardName === 'rainbow gate') {
    return searchDeckForCard(
      state,
      player,
      (c) => c.type.includes('Creature') && isMultiCivilization(c),
      'hand',
      { shuffleAfter: true, specificInstanceId: targets?.[0], preferHighestPower: true }
    );
  }

  if (cardName === 'rainbow stone') {
    return searchDeckForCard(state, player, () => true, 'manaZone', {
      shuffleAfter: true,
      specificInstanceId: targets?.[0]
    });
  }

  if (cardName === 'mystic treasure chest') {
    return searchDeckForCard(
      state,
      player,
      (c) => !getCardCivilizations(c).includes('Nature'),
      'manaZone',
      { shuffleAfter: true, specificInstanceId: targets?.[0] }
    );
  }

  // Generic Draw regex fallback (guard against triggered-later "Whenever..." enchantments)
  const drawMatch = !/whenever/i.test(rules)
    ? rules.match(/draw (?:up to )?(\d+) cards?/i)
    : null;
  if (drawMatch) {
    return drawCards(state, player, parseInt(drawMatch[1], 10));
  }

  // Generic fallback
  return {
    ...state,
    actionLog: [...state.actionLog, `${player} resolved ${card.name}.`]
  };
}

/**
 * Validates whether a spell satisfies cast-only preconditions (e.g. Blaze Cannon, Miraculous Meltdown).
 */
export function canCastSpell(
  state: GameState,
  player: PlayerId,
  card: CardDefinition
): { allowed: boolean; reason?: string } {
  const playerState = state.players[player];
  const oppState = state.players[getOpponentId(player)];
  const nameLower = getCardCapabilities(card).nameLower;

  if (
    !canPayManaCost(playerState.manaZone, card, playerState.battleZone, oppState.battleZone)
  ) {
    return { allowed: false, reason: `Cannot afford mana cost for ${card.name}.` };
  }

  if (nameLower === 'blaze cannon') {
    if (
      playerState.manaZone.length === 0 ||
      !playerState.manaZone.every((m) => getCardCivilizations(m.card).includes('Fire'))
    ) {
      return {
        allowed: false,
        reason: 'Blaze Cannon can only be cast if all cards in your mana zone are Fire.'
      };
    }
  }

  if (nameLower === 'miraculous meltdown') {
    const myShields = playerState.shields.filter((s) => !s.isBroken).length;
    const oppShields = oppState.shields.filter((s) => !s.isBroken).length;
    if (oppShields <= myShields) {
      return {
        allowed: false,
        reason: 'Miraculous Meltdown can only be cast when opponent has more shields than you do.'
      };
    }
  }

  return { allowed: true };
}

/**
 * Casts a spell card from the active player's hand:
 * - Supports cost reduction (Essence Elf), cast preconditions, and multi-civ Charger tapped entry.
 */
export function castSpell(
  state: GameState,
  player: PlayerId,
  cardInstanceId: string,
  targets?: string[],
  manaInstanceIds?: string[]
): GameState {
  if (Boolean(state.winner)) {
    throw new Error(`Game has already ended. Winner: ${state.winner}`);
  }

  if (state.activePlayer !== player) {
    throw new Error(`Cannot cast spell when it is not ${player}'s turn.`);
  }

  if (state.phase !== 'MAIN' && state.phase !== 'MANA_CHARGE') {
    throw new Error(`Cannot cast spell during ${state.phase} phase.`);
  }

  const playerState = state.players[player];
  const opponentState = state.players[getOpponentId(player)];
  const cardIndex = playerState.hand.findIndex((c) => c.instanceId === cardInstanceId);
  if (cardIndex === -1) {
    throw new Error(`Card ${cardInstanceId} not found in ${player}'s hand.`);
  }

  const spellCard = playerState.hand[cardIndex];
  if (spellCard.card.type !== 'Spell') {
    throw new Error(`Card ${spellCard.card.name} is not a spell.`);
  }

  const precondition = canCastSpell(state, player, spellCard.card);
  if (!precondition.allowed) {
    throw new Error(precondition.reason || `Cannot cast ${spellCard.card.name}.`);
  }

  if (
    !canPayManaCost(
      playerState.manaZone,
      spellCard.card,
      playerState.battleZone,
      opponentState.battleZone,
      manaInstanceIds
    )
  ) {
    throw new Error(
      getManaPaymentFailureReason(
        playerState.manaZone,
        spellCard.card,
        playerState.battleZone,
        opponentState.battleZone
      )
    );
  }

  const { success, updatedManaZone } = payManaCost(
    playerState.manaZone,
    spellCard.card,
    playerState.battleZone,
    opponentState.battleZone,
    manaInstanceIds
  );
  if (!success) {
    throw new Error(`Failed to pay mana cost for ${spellCard.card.name}.`);
  }

  const nextHand = playerState.hand.filter((_, idx) => idx !== cardIndex);
  const isCharger = isChargerSpell(spellCard.card);
  const spellActionLog = `${player} cast ${spellCard.card.name}${
    isCharger ? ' (Charger -> Mana Zone)' : ''
  }.`;

  const stateAfterPayment: GameState = {
    ...state,
    phase: 'MAIN',
    players: {
      ...state.players,
      [player]: {
        ...playerState,
        hand: nextHand,
        manaZone: updatedManaZone,
        spellsCastThisTurn: (playerState.spellsCastThisTurn || 0) + 1
      }
    },
    actionLog: [...state.actionLog, spellActionLog]
  };

  const stateAfterEffect = resolveSpellEffect(
    stateAfterPayment,
    player,
    spellCard.card,
    targets
  );

  const casterState = stateAfterEffect.players[player];

  let nextCasterState: PlayerState;
  if (isCharger) {
    const manaCard: ManaCardInstance = toManaCard(spellCard);
    nextCasterState = {
      ...casterState,
      manaZone: [...casterState.manaZone, manaCard]
    };
  } else {
    const graveCard: CardInstance = {
      instanceId: spellCard.instanceId,
      card: spellCard.card,
      owner: player
    };
    nextCasterState = {
      ...casterState,
      graveyard: [...casterState.graveyard, graveCard]
    };
  }

  return {
    ...stateAfterEffect,
    players: {
      ...stateAfterEffect.players,
      [player]: nextCasterState
    }
  };
}

registerEngineDispatchHooks({ resolveSpellEffect });
