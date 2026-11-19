import type { GameState, GameAction, PlayerId, CardInstance, CreatureInstance } from './types.ts';
import { canPayManaCost } from './mana.ts';
import {
  isSummoningSick,
  isValidEvolutionBait,
  isEvolutionCreature,
  isVortexEvolution,
  findValidVortexBaits
} from './evolution.ts';
import { getCreatureEffectivePower, hasCreatureSlayer } from './combat.ts';
import { getSpellTargetRequirement } from './targeting.ts';

/**
 * Intelligent AI player step generator.
 * Evaluates the current game state and determines the optimal next action
 * for the given player ('opponent' by default).
 */
export function getAiAction(state: GameState, aiPlayer: PlayerId = 'opponent'): GameAction | null {
  if (state.winner !== null) return null;

  const defendingPlayer: PlayerId = aiPlayer === 'player' ? 'opponent' : 'player';
  const aiState = state.players[aiPlayer];
  const oppState = state.players[defendingPlayer];

  // 1. Pending interactions
  if (state.pendingInteraction) {
    const interaction = state.pendingInteraction;

    // Blocker choice interaction
    if (
      interaction.type === 'BLOCK_DECLARATION' ||
      interaction.type === 'BLOCKER_CHOICE'
    ) {
      if (interaction.defendingPlayer === aiPlayer) {
        const validBlockers = aiState.battleZone.filter((c) =>
          interaction.validBlockerIds.includes(c.instanceId)
        );
        if (validBlockers.length === 0) {
          return { type: 'DECLARE_BLOCK', player: aiPlayer, blockerId: null };
        }

        const attacker = oppState.battleZone.find((c) => c.instanceId === interaction.attackerId);
        const attPower = attacker ? getCreatureEffectivePower(attacker, true, oppState) : 0;

        // 1. Try to find a blocker that can win the battle (defPower > attPower)
        const winningBlocker = validBlockers.find(
          (b) => getCreatureEffectivePower(b, false) > attPower
        );
        if (winningBlocker) {
          return {
            type: 'DECLARE_BLOCK',
            player: aiPlayer,
            blockerId: winningBlocker.instanceId
          };
        }

        // 2. Check if a blocker has Slayer to trade with a high-threat attacker (attPower >= 4000 or direct attack)
        const isDirectAttack = state.combatState?.target.type === 'player';
        if (attPower >= 4000 || isDirectAttack) {
          const slayerBlockers = validBlockers.filter((b) =>
            hasCreatureSlayer(b, aiState.battleZone)
          );
          if (slayerBlockers.length > 0) {
            const sortedSlayers = [...slayerBlockers].sort(
              (a, b) => getCreatureEffectivePower(a, false) - getCreatureEffectivePower(b, false)
            );
            return {
              type: 'DECLARE_BLOCK',
              player: aiPlayer,
              blockerId: sortedSlayers[0].instanceId
            };
          }
        }

        // 3. If AI has 0 unbroken shields and attack is on player, sacrifice lowest power blocker to survive!
        const unbrokenCount = aiState.shields.filter((s) => !s.isBroken).length;
        if (unbrokenCount === 0) {
          const sorted = [...validBlockers].sort(
            (a, b) => getCreatureEffectivePower(a, false) - getCreatureEffectivePower(b, false)
          );
          return {
            type: 'DECLARE_BLOCK',
            player: aiPlayer,
            blockerId: sorted[0].instanceId
          };
        }

        // Otherwise pass the block
        return { type: 'DECLARE_BLOCK', player: aiPlayer, blockerId: null };
      }
    }

    // Shield trigger resolution
    if (
      interaction.type === 'SHIELD_TRIGGER_RESOLUTION' ||
      interaction.type === 'SHIELD_TRIGGER_CHOICE'
    ) {
      if (interaction.player === aiPlayer) {
        const triggers = interaction.triggers || [];
        if (triggers.length > 0) {
          const currentTrigger = triggers[0];
          let targets: string[] | undefined;
          if (oppState.battleZone.length > 0) {
            // Pick highest power opponent creature
            const sortedOpp = [...oppState.battleZone].sort(
              (a, b) => getCreatureEffectivePower(b, false) - getCreatureEffectivePower(a, false)
            );
            targets = [sortedOpp[0].instanceId];
          }
          return {
            type: 'RESOLVE_SHIELD_TRIGGER',
            player: aiPlayer,
            shieldId: currentTrigger.shieldId,
            activate: true,
            targets
          };
        }
      }
    }

    // Interactive target selection
    if (interaction.type === 'TARGET_SELECTION' && interaction.player === aiPlayer) {
      const needed = Math.min(interaction.minTargets || 1, interaction.validTargetIds.length);
      const selected = interaction.validTargetIds.slice(0, needed);
      return {
        type: 'SELECT_TARGETS',
        player: aiPlayer,
        selectedIds: selected
      };
    }

    // Optional choice interaction
    if (interaction.type === 'OPTIONAL_CHOICE' && interaction.player === aiPlayer) {
      const safeToDraw = interaction.effectType !== 'DRAW' || aiState.deck.length > 2;
      return {
        type: 'RESOLVE_OPTIONAL_CHOICE',
        player: aiPlayer,
        accept: safeToDraw
      };
    }

    return null;
  }

  // If not AI's turn, no action
  if (state.activePlayer !== aiPlayer) {
    return null;
  }

  // 2. Turn Lifecycle Phases
  switch (state.phase) {
    case 'MANA_CHARGE': {
      // Charge mana if not yet charged this turn
      if (!aiState.manaChargedThisTurn && aiState.hand.length > 0) {
        // Prefer charging high cost or redundant cards
        const sortedHand = [...aiState.hand].sort(
          (a, b) => b.card.manaCost - a.card.manaCost
        );
        return {
          type: 'CHARGE_MANA',
          player: aiPlayer,
          cardInstanceId: sortedHand[0].instanceId
        };
      }
      return { type: 'PASS_PHASE', player: aiPlayer };
    }

    case 'MAIN': {
      // 1. Try to summon highest cost affordable creature
      const affordableCreatures: {
        cardInstance: CardInstance;
        baitId?: string;
        baitIds?: string[];
      }[] = [];

      for (const item of aiState.hand) {
        if (item.card.type.includes('Creature')) {
          if (canPayManaCost(aiState.manaZone, item.card)) {
            if (isEvolutionCreature(item.card)) {
              if (isVortexEvolution(item.card)) {
                const vortexBaits = findValidVortexBaits(item.card, aiState.battleZone);
                if (vortexBaits) {
                  affordableCreatures.push({
                    cardInstance: item,
                    baitIds: [vortexBaits[0].instanceId, vortexBaits[1].instanceId]
                  });
                }
              } else {
                const validBait = aiState.battleZone.find((c) =>
                  isValidEvolutionBait(item.card, c)
                );
                if (validBait) {
                  affordableCreatures.push({
                    cardInstance: item,
                    baitId: validBait.instanceId
                  });
                }
              }
            } else {
              affordableCreatures.push({ cardInstance: item });
            }
          }
        }
      }

      if (affordableCreatures.length > 0) {
        affordableCreatures.sort(
          (a, b) => b.cardInstance.card.manaCost - a.cardInstance.card.manaCost
        );
        const pick = affordableCreatures[0];
        return {
          type: 'SUMMON_CREATURE',
          player: aiPlayer,
          cardInstanceId: pick.cardInstance.instanceId,
          baitInstanceId: pick.baitId,
          baitInstanceIds: pick.baitIds
        };
      }

      // 2. Try to cast affordable spell
      for (const item of aiState.hand) {
        if (item.card.type.includes('Spell')) {
          if (canPayManaCost(aiState.manaZone, item.card)) {
            const req = getSpellTargetRequirement(item.card, aiState, oppState);
            if (req.minTargets > 0 && req.validTargetIds.length < req.minTargets) {
              continue; // Cannot cast because required targets are missing
            }

            let targets: string[] | undefined;
            if (req.minTargets > 0 || (req.requiresTarget && req.validTargetIds.length > 0)) {
              // Prefer opponent creatures with highest power
              const oppTargets = oppState.battleZone.filter((c) =>
                req.validTargetIds.includes(c.instanceId)
              );
              if (oppTargets.length > 0) {
                oppTargets.sort(
                  (a, b) =>
                    getCreatureEffectivePower(b, false, oppState, aiState) -
                    getCreatureEffectivePower(a, false, oppState, aiState)
                );
                targets = oppTargets.slice(0, req.maxTargets).map((c) => c.instanceId);
              } else {
                targets = req.validTargetIds.slice(0, req.maxTargets);
              }
            }

            return {
              type: 'CAST_SPELL',
              player: aiPlayer,
              cardInstanceId: item.instanceId,
              targets
            };
          }
        }
      }

      // No plays left; advance phase
      return { type: 'PASS_PHASE', player: aiPlayer };
    }

    case 'ATTACK': {
      const hasTappedOpponentCreatures = oppState.battleZone.some((c) => c.isTapped);

      // Find ready untapped creatures without summoning sickness and respecting attack restrictions
      const eligible = aiState.battleZone.filter((c) => {
        if (c.isTapped || isSummoningSick(c, state.turn, aiState.battleZone)) return false;
        const rules = c.card.rulesText || '';
        if (/this creature can't attack(?!\s+players)/i.test(rules)) return false;
        if (/this creature can't attack players/i.test(rules) && !hasTappedOpponentCreatures) return false;
        return true;
      });

      if (eligible.length === 0) {
        return { type: 'END_TURN', player: aiPlayer };
      }

      // Check for mandatory attackers first (e.g. Deadly Fighter Braid Claw)
      const mandatory = eligible.filter(
        (c) => c.card.id === 'DM01-074' || /attacks each turn if able/i.test(c.card.rulesText || '')
      );

      let attacker: CreatureInstance;
      if (mandatory.length > 0) {
        attacker = mandatory[0];
      } else {
        // Sort by highest effective power
        eligible.sort(
          (a, b) =>
            getCreatureEffectivePower(b, true, aiState) -
            getCreatureEffectivePower(a, true, aiState)
        );
        attacker = eligible[0];
      }

      const attPower = getCreatureEffectivePower(attacker, true, aiState);
      const attackerRules = attacker.card.rulesText || '';
      const cantAttackPlayers = /this creature can't attack players/i.test(attackerRules);

      const unbrokenShields = oppState.shields
        .map((s, index) => ({ s, index }))
        .filter((x) => !x.s.isBroken);

      // Strategy 1: Direct attack if player has 0 shields (only if attacker can attack players!)
      if (unbrokenShields.length === 0 && !cantAttackPlayers) {
        return {
          type: 'DECLARE_ATTACK',
          player: aiPlayer,
          attackerInstanceId: attacker.instanceId,
          target: { type: 'player' }
        };
      }

      // Strategy 2: Attack tapped opponent creature if we can beat it
      const tappedOpponents = oppState.battleZone.filter((c) => c.isTapped);
      const beatableOpponents = tappedOpponents.filter(
        (c) => attPower > getCreatureEffectivePower(c, false)
      );

      if (beatableOpponents.length > 0) {
        beatableOpponents.sort(
          (a, b) => getCreatureEffectivePower(b, false) - getCreatureEffectivePower(a, false)
        );
        return {
          type: 'DECLARE_ATTACK',
          player: aiPlayer,
          attackerInstanceId: attacker.instanceId,
          target: { type: 'creature', instanceId: beatableOpponents[0].instanceId }
        };
      }

      // If creature can't attack players and cannot beat tapped opponent, but there are tapped opponents
      if (cantAttackPlayers) {
        if (tappedOpponents.length > 0) {
          tappedOpponents.sort(
            (a, b) => getCreatureEffectivePower(a, false) - getCreatureEffectivePower(b, false)
          );
          return {
            type: 'DECLARE_ATTACK',
            player: aiPlayer,
            attackerInstanceId: attacker.instanceId,
            target: { type: 'creature', instanceId: tappedOpponents[0].instanceId }
          };
        }
        return { type: 'END_TURN', player: aiPlayer };
      }

      // Strategy 3: Attack a shield!
      if (unbrokenShields.length > 0) {
        const breakerCount = Math.max(1, attacker.card.breakerCount || 1);
        const targetIndices = unbrokenShields.slice(0, breakerCount).map((x) => x.index);
        return {
          type: 'DECLARE_ATTACK',
          player: aiPlayer,
          attackerInstanceId: attacker.instanceId,
          target: {
            type: 'shield',
            index: targetIndices[0],
            indices: targetIndices
          }
        };
      }

      // Strategy 4: Direct attack
      return {
        type: 'DECLARE_ATTACK',
        player: aiPlayer,
        attackerInstanceId: attacker.instanceId,
        target: { type: 'player' }
      };
    }

    default:
      return { type: 'END_TURN', player: aiPlayer };
  }
}
