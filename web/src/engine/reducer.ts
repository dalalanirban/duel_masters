import type { GameState, GameAction, PlayerId, AttackTarget } from './types.ts';
import { getActiveForcedLureTargets, getOpponentId, isCreatureMandatoryAttacker } from './cardUtils.ts';
import { chargeMana, undoChargeMana, toManaCard, toggleManaTap } from './mana.ts';
import { summonCreature } from './evolution.ts';
import { canCreatureAttack } from './continuous.ts';
import { castSpell, resolveSpellEffect } from './spells.ts';
import { getRegisteredCardById } from '../data/cardCatalogCore.ts';
import {
  declareAttack,
  declareBlock,
  resolveShieldTrigger,
  hasMandatoryAttackers,
  resumeCombatAfterInteraction
} from './combat.ts';
import { passToMainPhase, endTurn, startTurn, completeHumanSilentSkills, finalizeEndTurn } from './turn.ts';
import { resolveSilentSkill } from './advancedMechanics.ts';
import { triggerCIP } from './triggers.ts';
import { canActivateTapAbility, resolveTapAbility } from './tapAbilities.ts';
import { resolveZoneSelectionAction, resolveOptionalChoiceAction } from './zoneSelection.ts';
import { enqueueInteraction } from './interactionHelpers.ts';

function findCardDefInState(state: GameState, cardId: string) {
  for (const pid of ['player', 'opponent'] as const) {
    const p = state.players[pid];
    for (const c of p.hand) if (c.card.id === cardId) return c.card;
    for (const c of p.manaZone) if (c.card.id === cardId) return c.card;
    for (const c of p.graveyard) if (c.card.id === cardId) return c.card;
    for (const c of p.deck) if (c.card.id === cardId) return c.card;
    for (const s of p.shields) if (s.card.id === cardId) return s.card;
    for (const bz of p.battleZone) {
      if (bz.card.id === cardId) return bz.card;
      if (bz.evolvedOn) {
        for (const base of bz.evolvedOn) {
          if (base.card.id === cardId) return base.card;
        }
      }
    }
  }
  return undefined;
}

/**
 * Checks whether any creature controlled by the active player in the battle zone
 * can currently legally declare an attack.
 */
function hasEligibleAttackers(state: GameState): boolean {
  const activeId = state.activePlayer;
  return state.players[activeId].battleZone.some(
    (creature) =>
      canCreatureAttack(state, creature, undefined, activeId).valid ||
      canActivateTapAbility(state, creature, activeId, { ignorePhase: true }).valid
  );
}

/**
 * Automatically triggers a required attack for mandatory attackers (e.g. Deadly Fighter Braid Claw).
 */
function executeMandatoryAttack(state: GameState, player: PlayerId): GameState {
  const activePlayer = state.players[player];
  const oppId = getOpponentId(player);
  const opp = state.players[oppId];

  const forcedRaces = activePlayer.tempAttacksIfAbleRacesThisTurn || [];

  const activeGiants = getActiveForcedLureTargets(state, player);

  const mandatoryCreature = activePlayer.battleZone.find((c) => {
    const isLured = activeGiants.some(
      (g) => canCreatureAttack(state, c, { type: 'creature', instanceId: g.instanceId }, player).valid
    );
    return (
      (isCreatureMandatoryAttacker(c, forcedRaces, state, player) || isLured) &&
      canCreatureAttack(state, c, undefined, player).valid
    );
  });

  if (!mandatoryCreature) {
    return endTurn(state);
  }

  // Prefer shield/player if legally able to attack players
  const unbrokenShieldIdx = opp.shields.findIndex((s) => !s.isBroken);
  const playerTarget: AttackTarget =
    unbrokenShieldIdx !== -1
      ? { type: 'shield', index: unbrokenShieldIdx }
      : { type: 'player' };

  if (canCreatureAttack(state, mandatoryCreature, playerTarget, player).valid) {
    return declareAttack(state, mandatoryCreature.instanceId, playerTarget);
  }

  // Otherwise find a legal creature target
  for (const def of opp.battleZone) {
    const cTarget: AttackTarget = { type: 'creature', instanceId: def.instanceId };
    if (canCreatureAttack(state, mandatoryCreature, cTarget, player).valid) {
      return declareAttack(state, mandatoryCreature.instanceId, cTarget);
    }
  }

  return endTurn(state);
}

/**
 * After resolving an interaction (target selection, optional choice, deck search, or shield trigger),
 * restores any queued Shield Trigger batches or resumes paused combat steps cleanly.
 */
function advancePendingState(state: GameState): GameState {
  if (Boolean(state.winner) || state.pendingInteraction) {
    return state;
  }

  if (state.pendingInteractionQueue && state.pendingInteractionQueue.length > 0) {
    const [nextInteraction, ...restQueue] = state.pendingInteractionQueue;
    return {
      ...state,
      pendingInteraction: nextInteraction,
      pendingInteractionQueue: restQueue.length > 0 ? restQueue : undefined
    };
  }

  if (state.pendingTriggerQueue && state.pendingTriggerQueue.length > 0) {
    const [head, ...rest] = state.pendingTriggerQueue;
    return {
      ...state,
      pendingTriggerQueue: rest.length > 0 ? rest : undefined,
      pendingInteraction: {
        type: 'SHIELD_TRIGGER_RESOLUTION',
        player: head.player,
        shieldCards: head.shieldCards,
        triggers: head.triggers
      }
    };
  }

  if (state.phase === 'START_OF_TURN') {
    return completeHumanSilentSkills(state, state.pendingKeptSilentIds || []);
  }

  if (
    state.combatState &&
    (state.combatState.stage === 'ATTACK' ||
      state.combatState.stage === 'BATTLE' ||
      state.combatState.stage === 'SHIELD_BREAK')
  ) {
    return resumeCombatAfterInteraction(state);
  }

  return state;
}

/**
 * Master Reducer for the Duel Masters Engine.
 * Dispatches player actions and advances the game state cleanly and immutably.
 */
export function step(state: GameState, action: GameAction): GameState {
  if (Boolean(state.winner)) {
    return state;
  }

  try {
    switch (action.type) {
      case 'CHARGE_MANA': {
        const player: PlayerId = action.player || state.activePlayer;
        return chargeMana(state, player, action.cardInstanceId);
      }

      case 'UNDO_CHARGE_MANA': {
        const player: PlayerId = action.player || state.activePlayer;
        return undoChargeMana(state, player);
      }

      case 'SUMMON_CREATURE': {
        const player: PlayerId = action.player || state.activePlayer;
        const baits = action.baitInstanceIds || action.baitInstanceId;
        return advancePendingState(
          summonCreature(state, player, action.cardInstanceId, baits, action.targets, action.manaInstanceIds)
        );
      }

      case 'CAST_SPELL': {
        const player: PlayerId = action.player || state.activePlayer;
        return advancePendingState(
          castSpell(state, player, action.cardInstanceId, action.targets, action.manaInstanceIds)
        );
      }

      case 'DECLARE_ATTACK': {
        const attackerId = action.attackerInstanceId || action.attackerId;
        if (!attackerId) {
          throw new Error('DECLARE_ATTACK requires an attackerInstanceId or attackerId.');
        }
        return declareAttack(state, attackerId, action.target);
      }

      case 'DECLARE_BLOCK': {
        const blockerId =
          action.blockerInstanceId !== undefined
            ? action.blockerInstanceId
            : action.blockerId;
        return declareBlock(state, blockerId ?? null);
      }

      case 'RESOLVE_SHIELD_TRIGGER':
      case 'RESOLVE_TRIGGER': {
        const activate =
          action.activate !== undefined
            ? action.activate
            : action.playTrigger !== undefined
            ? action.playTrigger
            : true;
        return advancePendingState(
          resolveShieldTrigger(state, action.shieldId, activate, action.targets)
        );
      }

      case 'PASS_PHASE':
      case 'NEXT_PHASE': {
        if (state.phase === 'MANA_CHARGE') {
          return passToMainPhase(state);
        }

        if (state.phase === 'MAIN') {
          if (
            action.targetPhase === 'END_OF_TURN' ||
            action.targetPhase === 'END_TURN'
          ) {
            if (hasMandatoryAttackers(state, state.activePlayer)) {
              return executeMandatoryAttack(state, state.activePlayer);
            }
            return endTurn(state);
          }

          if (!hasEligibleAttackers(state)) {
            if (hasMandatoryAttackers(state, state.activePlayer)) {
              return executeMandatoryAttack(state, state.activePlayer);
            }
            return endTurn(state);
          }

          return {
            ...state,
            phase: 'ATTACK',
            actionLog: [...state.actionLog, `${state.activePlayer} entered ATTACK phase.`]
          };
        }

        if (state.phase === 'ATTACK') {
          if (hasMandatoryAttackers(state, state.activePlayer)) {
            return executeMandatoryAttack(state, state.activePlayer);
          }
          return endTurn(state);
        }

        return state;
      }

      case 'END_TURN': {
        const player = action.player || state.activePlayer;
        if (hasMandatoryAttackers(state, player)) {
          return executeMandatoryAttack(state, player);
        }
        return endTurn(state);
      }

      case 'START_TURN': {
        return startTurn(state);
      }

      case 'SELECT_TARGETS': {
        if (!state.pendingInteraction || state.pendingInteraction.type !== 'TARGET_SELECTION') {
          return state;
        }
        const interaction = state.pendingInteraction;
        const player = action.player || interaction.player;
        if (player !== interaction.player) {
          throw new Error(`Target selection is pending for ${interaction.player}, not ${player}.`);
        }
        const selectedIds = action.selectedIds || [];
        for (const id of selectedIds) {
          if (!interaction.validTargetIds.includes(id)) {
            throw new Error(`Invalid target ${id} selected.`);
          }
        }
        if (selectedIds.length < interaction.minTargets || selectedIds.length > interaction.maxTargets) {
          throw new Error(
            `Invalid number of targets: expected ${interaction.minTargets}-${interaction.maxTargets}, got ${selectedIds.length}.`
          );
        }

        const stateWithoutPending: GameState = {
          ...state,
          pendingInteraction: null
        };

        let result = stateWithoutPending;
        if (interaction.actionType === 'SPELL_TARGET') {
          const cardDef =
            getRegisteredCardById(interaction.sourceCardId) ??
            findCardDefInState(stateWithoutPending, interaction.sourceCardId);
          if (cardDef) {
            result = resolveSpellEffect(stateWithoutPending, player, cardDef, selectedIds);
          }
        } else if (interaction.actionType === 'EFFECT_TARGET') {
          if (selectedIds.length === 0) {
            result = {
              ...stateWithoutPending,
              actionLog: [...stateWithoutPending.actionLog, `${player} skipped optional target selection.`]
            };
          } else {
            const oppId = getOpponentId(player);
            const oppBZ = stateWithoutPending.players[oppId].battleZone;
            const targetId = selectedIds[0];
            const targetCreature = oppBZ.find((c) => c.instanceId === targetId);
            if (targetCreature) {
              const updatedOppBZ = oppBZ.map((c) =>
                c.instanceId === targetId ? { ...c, isTapped: true } : c
              );
              result = {
                ...stateWithoutPending,
                players: {
                  ...stateWithoutPending.players,
                  [oppId]: {
                    ...stateWithoutPending.players[oppId],
                    battleZone: updatedOppBZ
                  }
                },
                actionLog: [
                  ...stateWithoutPending.actionLog,
                  `${player} tapped ${targetCreature.card.name} with creature ability.`
                ]
              };
            }
          }
        }

        return advancePendingState(result);
      }

      case 'RESOLVE_OPTIONAL_CHOICE': {
        if (!state.pendingInteraction || state.pendingInteraction.type !== 'OPTIONAL_CHOICE') {
          return state;
        }
        const interaction = state.pendingInteraction;
        const player = action.player || interaction.player;
        let result = resolveOptionalChoiceAction(
          state,
          interaction,
          player,
          action.accept,
          action.selectedTargetId
        );
        if (interaction.followUpAction?.kind === 'COMPLETE_END_TURN' && !result.pendingInteraction && !result.pendingInteractionQueue?.length) {
          result = finalizeEndTurn(result);
        }
        return advancePendingState(result);
      }

      case 'RESOLVE_ZONE_SELECTION': {
        if (!state.pendingInteraction || state.pendingInteraction.type !== 'ZONE_SELECTION') {
          return state;
        }
        const interaction = state.pendingInteraction;
        const player = action.player || interaction.player;
        const result = resolveZoneSelectionAction(
          state,
          interaction,
          player,
          action.selectedIds || [],
          action.selectedRace
        );
        return advancePendingState(result);
      }

      case 'RESOLVE_SILENT_SKILL_CHOICE': {
        if (!state.pendingInteraction || state.pendingInteraction.type !== 'SILENT_SKILL_CHOICE') {
          return state;
        }
        const interaction = state.pendingInteraction;
        const player = action.player || interaction.player;
        const kept = [...(interaction.keptTappedIds || [])];
        let result: GameState = {
          ...state,
          pendingInteraction: null,
          pendingKeptSilentIds: kept
        };

        if (action.activate) {
          kept.push(interaction.creatureInstanceId);
          result = { ...result, pendingKeptSilentIds: kept };
          result = resolveSilentSkill(result, interaction.creatureInstanceId, action.targets);
        }

        const remaining = [...(interaction.remainingCreatureIds || [])];
        while (remaining.length > 0) {
          const nextId = remaining.shift()!;
          const nextCreature = result.players[player].battleZone.find((c) => c.instanceId === nextId);
          if (nextCreature && nextCreature.isTapped) {
            result = enqueueInteraction(result, {
              type: 'SILENT_SKILL_CHOICE',
              player,
              creatureInstanceId: nextCreature.instanceId,
              card: nextCreature.card,
              remainingCreatureIds: remaining,
              keptTappedIds: kept
            });
            break;
          }
        }

        return advancePendingState(result);
      }

      case 'RESOLVE_DECK_SEARCH': {
        if (!state.pendingInteraction || state.pendingInteraction.type !== 'DECK_SEARCH') {
          return state;
        }
        const interaction = state.pendingInteraction;
        const player = action.player || interaction.player;
        const pState = state.players[player];
        const stateWithoutPending: GameState = {
          ...state,
          pendingInteraction: null
        };

        if (!action.selectedCardInstanceId) {
          return advancePendingState({
            ...stateWithoutPending,
            actionLog: [
              ...stateWithoutPending.actionLog,
              `${player} searched deck (${interaction.sourceCardName}) but chose not to take a card.`
            ]
          });
        }

        const cardIndex = pState.deck.findIndex((c) => c.instanceId === action.selectedCardInstanceId);
        if (cardIndex === -1) {
          return advancePendingState(stateWithoutPending);
        }

        const chosenCard = pState.deck[cardIndex];
        const nextDeck = pState.deck.filter((_, idx) => idx !== cardIndex);

        // Shuffle deck after searching
        const shuffledDeck = [...nextDeck];
        for (let i = shuffledDeck.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffledDeck[i], shuffledDeck[j]] = [shuffledDeck[j], shuffledDeck[i]];
        }

        const dest = interaction.destination;
        if (dest === 'manaZone') {
          const manaCard = toManaCard(chosenCard);
          return advancePendingState({
            ...stateWithoutPending,
            players: {
              ...stateWithoutPending.players,
              [player]: {
                ...pState,
                deck: shuffledDeck,
                manaZone: [...pState.manaZone, manaCard]
              }
            },
            actionLog: [
              ...stateWithoutPending.actionLog,
              `${player} searched deck (${interaction.sourceCardName}) and put ${chosenCard.card.name} into mana zone${
                manaCard.isTapped ? ' (tapped)' : ''
              }.`
            ]
          });
        }

        if (dest === 'battleZone') {
          const isKachua = interaction.sourceCardName.toLowerCase().includes('kachua');
          const summonedCreature = {
            instanceId: chosenCard.instanceId,
            card: chosenCard.card,
            owner: player,
            isTapped: false,
            powerModifier: 0,
            summonedTurn: state.turn,
            ...(isKachua ? { tempSpeedAttacker: true, tempDestroyAtEndTurn: true } : {})
          };
          const stateWithBZ: GameState = {
            ...stateWithoutPending,
            players: {
              ...stateWithoutPending.players,
              [player]: {
                ...pState,
                deck: shuffledDeck,
                battleZone: [...pState.battleZone, summonedCreature]
              }
            },
            actionLog: [
              ...stateWithoutPending.actionLog,
              `${player} searched deck (${interaction.sourceCardName}) and put ${chosenCard.card.name} into battle zone.`
            ]
          };
          return advancePendingState(triggerCIP(stateWithBZ, player, summonedCreature));
        }

        return advancePendingState({
          ...stateWithoutPending,
          players: {
            ...stateWithoutPending.players,
            [player]: {
              ...pState,
              deck: shuffledDeck,
              hand: [...pState.hand, chosenCard]
            }
          },
          actionLog: [
            ...stateWithoutPending.actionLog,
            `${player} searched deck (${interaction.sourceCardName}) and put ${chosenCard.card.name} into hand.`
          ]
        });
      }

      case 'TOGGLE_MANA_TAP': {
        const player = action.player || 'player';
        return toggleManaTap(state, player, action.cardInstanceId, action.forceTapped);
      }

      case 'ACTIVATE_SILENT_SKILL': {
        return advancePendingState(resolveSilentSkill(state, action.creatureInstanceId, action.targets));
      }

      case 'ACTIVATE_TAP_ABILITY': {
        return advancePendingState(
          resolveTapAbility(state, action.creatureInstanceId, action.targets, action.selectedRace)
        );
      }

      default: {
        const unknownType = (action as { type: string }).type;
        return {
          ...state,
          actionLog: [...state.actionLog, `Unhandled action type: ${unknownType}`]
        };
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ...state,
      actionLog: [...state.actionLog, `Action error (${action.type}): ${message}`]
    };
  }
}

export { step as gameReducer };
