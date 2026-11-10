import type { GameState, GameAction, PlayerId, AttackTarget } from './types.ts';
import { chargeMana } from './mana.ts';
import { summonCreature, isSummoningSick } from './evolution.ts';
import { castSpell } from './spells.ts';
import { declareAttack, declareBlock, resolveShieldTrigger, hasMandatoryAttackers } from './combat.ts';
import { passToMainPhase, endTurn, startTurn } from './turn.ts';

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
    // Evolution creatures ignore summoning sickness
    if (creature.card.type === 'Evolution Creature' || creature.card.isEvolution) {
      return true;
    }
    // Speed attackers ignore summoning sickness
    if (creature.card.isSpeedAttacker) {
      return true;
    }
    // Regular creatures can attack if summoned on an earlier turn
    return creature.summonedTurn < state.turn;
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
    if (c.isTapped || isSummoningSick(c, state.turn)) return false;
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
        return state;
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
