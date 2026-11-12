import type { GameState, GameAction, PlayerId, AttackTarget } from './types.ts';
import { chargeMana, undoChargeMana } from './mana.ts';
import { summonCreature, isSummoningSick } from './evolution.ts';
import { castSpell, resolveSpellEffect } from './spells.ts';
import { CARD_MAP } from '../data/cardLoader.ts';
import { declareAttack, declareBlock, resolveShieldTrigger, hasMandatoryAttackers } from './combat.ts';
import { passToMainPhase, endTurn, startTurn } from './turn.ts';
import { resolveSilentSkill } from './advancedMechanics.ts';
import { drawCards, searchDeckForCard, isSurvivor } from './effects.ts';

/**
 * Checks whether any creature controlled by the active player in the battle zone
 * is currently able to declare an attack.
 */
function hasEligibleAttackers(state: GameState): boolean {
  const activeId = state.activePlayer;
  const defendingId: PlayerId = activeId === 'player' ? 'opponent' : 'player';
  const activePlayer = state.players[activeId];
  const defendingPlayer = state.players[defendingId];
  const hasTappedOpponentCreatures = defendingPlayer.battleZone.some((c) => c.isTapped);

  return activePlayer.battleZone.some((creature) => {
    if (creature.isTapped) {
      return false;
    }
    const rules = creature.card.rulesText || '';
    if (/this creature can't attack(?!\s+players)/i.test(rules)) {
      return false;
    }
    if (/this creature can't attack players/i.test(rules) && !hasTappedOpponentCreatures) {
      return false;
    }
    return !isSummoningSick(creature, state.turn, activePlayer.battleZone);
  });
}

/**
 * Automatically triggers a required attack for mandatory attackers (e.g. Deadly Fighter Braid Claw).
 */
function executeMandatoryAttack(state: GameState, player: PlayerId): GameState {
  const activeBZ = state.players[player].battleZone;
  const oppId: PlayerId = player === 'player' ? 'opponent' : 'player';
  const opp = state.players[oppId];

  // Find the first mandatory attacker
  const mandatoryCreature = activeBZ.find((c) => {
    if (c.isTapped || isSummoningSick(c, state.turn, activeBZ)) return false;
    const rules = c.card.rulesText || '';
    return c.card.id === 'DM01-074' || /attacks each turn if able/i.test(rules);
  });

  if (!mandatoryCreature) {
    return endTurn(state);
  }

  const rules = mandatoryCreature.card.rulesText || '';
  const cantAttackPlayers = /this creature can't attack players/i.test(rules);

  if (cantAttackPlayers) {
    const tappedOpp = opp.battleZone.find((c) => c.isTapped);
    if (tappedOpp) {
      return declareAttack(state, mandatoryCreature.instanceId, {
        type: 'creature',
        instanceId: tappedOpp.instanceId
      });
    }
    return endTurn(state);
  }

  const unbrokenShieldIdx = opp.shields.findIndex((s) => !s.isBroken);
  let target: AttackTarget;
  if (unbrokenShieldIdx !== -1) {
    target = { type: 'shield', index: unbrokenShieldIdx };
  } else {
    target = { type: 'player' };
  }

  return declareAttack(state, mandatoryCreature.instanceId, target);
}

/**
 * Master Reducer for the Duel Masters Engine.
 * Dispatches player actions and advances the game state in a pure, immutable manner.
 * Guards against actions after game has ended, and records any unhandled or invalid action
 * into actionLog without throwing unhandled exceptions.
 */
export function step(state: GameState, action: GameAction): GameState {
  // Guard against any actions once the duel has ended
  if (state.winner !== null) {
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
        return summonCreature(
          state,
          player,
          action.cardInstanceId,
          action.baitInstanceId,
          action.targets
        );
      }

      case 'CAST_SPELL': {
        const player: PlayerId = action.player || state.activePlayer;
        return castSpell(state, player, action.cardInstanceId, action.targets);
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
        return resolveShieldTrigger(state, action.shieldId, activate, action.targets);
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

          // If the player has no creatures that can attack, automatically end turn
          if (!hasEligibleAttackers(state)) {
            if (hasMandatoryAttackers(state, state.activePlayer)) {
              return executeMandatoryAttack(state, state.activePlayer);
            }
            return endTurn(state);
          }

          // Otherwise, proceed to ATTACK phase
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

        if (interaction.actionType === 'SPELL_TARGET') {
          const cardDef = CARD_MAP.get(interaction.sourceCardId);
          if (cardDef) {
            return resolveSpellEffect(stateWithoutPending, player, cardDef, selectedIds);
          }
        } else if (interaction.actionType === 'EFFECT_TARGET') {
          if (selectedIds.length === 0) {
            return {
              ...stateWithoutPending,
              actionLog: [...stateWithoutPending.actionLog, `${player} skipped optional target selection.`]
            };
          }
          const oppId: PlayerId = player === 'player' ? 'opponent' : 'player';
          const oppBZ = stateWithoutPending.players[oppId].battleZone;
          const targetId = selectedIds[0];
          const targetCreature = oppBZ.find((c) => c.instanceId === targetId);
          if (targetCreature) {
            const updatedOppBZ = oppBZ.map((c) =>
              c.instanceId === targetId ? { ...c, isTapped: true } : c
            );
            return {
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

        return stateWithoutPending;
      }

      case 'RESOLVE_OPTIONAL_CHOICE': {
        if (!state.pendingInteraction || state.pendingInteraction.type !== 'OPTIONAL_CHOICE') {
          return state;
        }
        const interaction = state.pendingInteraction;
        const player = action.player || interaction.player;
        const stateWithoutPending: GameState = {
          ...state,
          pendingInteraction: null
        };

        if (!action.accept) {
          return {
            ...stateWithoutPending,
            actionLog: [
              ...stateWithoutPending.actionLog,
              `${player} chose not to use optional ability (${interaction.abilityName}).`
            ]
          };
        }

        // Action accepted: execute effect
        if (interaction.effectType === 'DRAW') {
          const count = interaction.drawCount || 1;
          return drawCards(stateWithoutPending, player, count);
        } else if (interaction.effectType === 'SEARCH_DECK') {
          const cardDef = CARD_MAP.get(interaction.sourceCardId);
          if (cardDef?.name.toLowerCase().includes('forbos')) {
            return searchDeckForCard(stateWithoutPending, player, (c) => c.type === 'Spell', 'hand');
          } else {
            return searchDeckForCard(stateWithoutPending, player, (c) => isSurvivor(c), 'hand');
          }
        }
        return stateWithoutPending;
      }

      case 'ACTIVATE_SILENT_SKILL': {
        return resolveSilentSkill(state, action.creatureInstanceId, action.targets);
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
