import type { GameState, GameAction, PlayerId } from './types.ts';
import { chargeMana } from './mana.ts';
import { summonCreature } from './evolution.ts';
import { castSpell } from './spells.ts';
import { declareAttack, declareBlock, resolveShieldTrigger } from './combat.ts';
import { passToMainPhase, endTurn, startTurn } from './turn.ts';

/**
 * Checks whether any creature controlled by the active player in the battle zone
 * is currently able to declare an attack.
 */
function hasEligibleAttackers(state: GameState): boolean {
  const activePlayer = state.players[state.activePlayer];
  return activePlayer.battleZone.some((creature) => {
    if (creature.isTapped) {
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
            return endTurn(state);
          }

          // If the player has no creatures that can attack, automatically end turn
          if (!hasEligibleAttackers(state)) {
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
          return endTurn(state);
        }

        return state;
      }

      case 'END_TURN': {
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
