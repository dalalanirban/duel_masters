import type { GameState, GameAction, PlayerId, CardInstance } from './types.ts';
import { canPayManaCost } from './mana.ts';
import { isSummoningSick, isValidEvolutionBait, isEvolutionCreature } from './evolution.ts';
import { getCreatureEffectivePower } from './combat.ts';

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
        const attPower = attacker ? getCreatureEffectivePower(attacker, true) : 0;

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

        // 2. If AI has 0 unbroken shields and attack is on player, sacrifice lowest power blocker to survive!
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
      const affordableCreatures: { cardInstance: CardInstance; baitId?: string }[] = [];

      for (const item of aiState.hand) {
        if (item.card.type.includes('Creature')) {
          if (canPayManaCost(aiState.manaZone, item.card)) {
            if (isEvolutionCreature(item.card)) {
              const validBait = aiState.battleZone.find((c) =>
                isValidEvolutionBait(item.card, c)
              );
              if (validBait) {
                affordableCreatures.push({
                  cardInstance: item,
                  baitId: validBait.instanceId
                });
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
          baitInstanceId: pick.baitId
        };
      }

      // 2. Try to cast affordable spell
      for (const item of aiState.hand) {
        if (item.card.type.includes('Spell')) {
          if (canPayManaCost(aiState.manaZone, item.card)) {
            let targets: string[] | undefined;
            if (oppState.battleZone.length > 0) {
              const sortedOpp = [...oppState.battleZone].sort(
                (a, b) => getCreatureEffectivePower(b, false) - getCreatureEffectivePower(a, false)
              );
              targets = [sortedOpp[0].instanceId];
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
      // Find ready untapped creatures without summoning sickness
      const eligible = aiState.battleZone.filter(
        (c) => !c.isTapped && !isSummoningSick(c, state.turn)
      );

      if (eligible.length === 0) {
        return { type: 'END_TURN', player: aiPlayer };
      }

      // Sort by highest effective power
      eligible.sort(
        (a, b) => getCreatureEffectivePower(b, true) - getCreatureEffectivePower(a, true)
      );
      const attacker = eligible[0];
      const attPower = getCreatureEffectivePower(attacker, true);

      const unbrokenShields = oppState.shields
        .map((s, index) => ({ s, index }))
        .filter((x) => !x.s.isBroken);

      // Strategy 1: Direct attack if player has 0 shields
      if (unbrokenShields.length === 0) {
        return {
          type: 'DECLARE_ATTACK',
          player: aiPlayer,
          attackerInstanceId: attacker.instanceId,
          target: { type: 'player' }
        };
      }

      // Strategy 2: Attack tapped opponent creature if we can beat it
      const tappedOpponents = oppState.battleZone.filter(
        (c) => c.isTapped && attPower > getCreatureEffectivePower(c, false)
      );
      if (tappedOpponents.length > 0) {
        tappedOpponents.sort(
          (a, b) => getCreatureEffectivePower(b, false) - getCreatureEffectivePower(a, false)
        );
        return {
          type: 'DECLARE_ATTACK',
          player: aiPlayer,
          attackerInstanceId: attacker.instanceId,
          target: { type: 'creature', instanceId: tappedOpponents[0].instanceId }
        };
      }

      // Strategy 3: Attack a shield!
      return {
        type: 'DECLARE_ATTACK',
        player: aiPlayer,
        attackerInstanceId: attacker.instanceId,
        target: { type: 'shield', index: unbrokenShields[0].index }
      };
    }

    default:
      return { type: 'END_TURN', player: aiPlayer };
  }
}
