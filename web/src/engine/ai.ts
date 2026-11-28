import type {
  GameState,
  GameAction,
  PlayerId,
  CardInstance,
  AttackTarget
} from './types.ts';
import { canPayManaCost, getEffectiveManaCost } from './mana.ts';
import {
  canSummonCreature,
  isValidEvolutionBait,
  isEvolutionCreature,
  isVortexEvolution,
  findValidVortexBaits
} from './evolution.ts';
import {
  getCreatureEffectivePower,
  hasCreatureSlayer,
  getCreatureBreakerCount,
  canCreatureAttack
} from './combat.ts';
import { getSpellTargetRequirement } from './targeting.ts';
import { canCastSpell } from './spells.ts';
import { canActivateTapAbility } from './tapAbilities.ts';
import { shouldAiActivateSilentSkill } from './advancedMechanics.ts';
import {
  getActiveForcedLureTargets,
  getCardCapabilities,
  getCreatureRaces,
  isCreatureForcedBlocker,
  isCreatureMandatoryAttacker,
  normalizeRace
} from './cardUtils.ts';

/**
 * Intelligent AI player step generator.
 * Uses the engine's canonical legality helpers (`canCreatureAttack`, `canCastSpell`, `getSpellTargetRequirement`,
 * `canPayManaCost`) so the AI respects all DM-01–DM-12 card restrictions and never stalls on invalid moves.
 */
/**
 * Shared guard so AI never casts mandatory single-target removal/tap/bounce spells
 * (in Main Phase or as Shield Triggers) when 0 valid choosable targets exist or only friendly creatures would be harmed.
 */
function shouldAiSkipSpell(
  card: import('../types/card.ts').CardDefinition,
  _aiState: import('./types.ts').PlayerState,
  oppState: import('./types.ts').PlayerState,
  req: ReturnType<typeof getSpellTargetRequirement>
): boolean {
  const rulesLower = (card.rulesText || '').toLowerCase();
  const hasNonTargetBenefit =
    /\bdraw\b|put the top|add the top|tap all|destroy all|return .* from your graveyard|search your deck|during your opponent's next turn|each of your opponent's creatures attacks/i.test(
      rulesLower
    );

  if (req.minTargets > req.validTargetIds.length) {
    return true;
  }
  if (req.requiresTarget && req.validTargetIds.length === 0) {
    return true;
  }
  if (
    !hasNonTargetBenefit &&
    req.validTargetIds.length === 0 &&
    /choose|destroy|return|tap/i.test(rulesLower)
  ) {
    return true;
  }

  // Never waste removal/bounce on own creatures if no opponent targets exist and spell doesn't mandate buffing self
  if (req.requiresTarget && req.validTargetIds.length > 0) {
    const oppHit = oppState.battleZone.some((c) => req.validTargetIds.includes(c.instanceId));
    const isFriendlyBuff = /energy charger|colossus boost|protective force|magma gazer|burning power|sonic wing|cosmic wing|laser wing|miracle portal|fists of forever|lunar charger|supersonic jet pack|venom charger/i.test(
      card.name.toLowerCase()
    );
    if (!oppHit && !isFriendlyBuff) {
      return true;
    }
  }

  return false;
}

export function getAiAction(state: GameState, aiPlayer: PlayerId = 'opponent'): GameAction | null {
  if (Boolean(state.winner)) return null;

  const defendingPlayer: PlayerId = aiPlayer === 'player' ? 'opponent' : 'player';
  const aiState = state.players[aiPlayer];
  const oppState = state.players[defendingPlayer];

  // 1. Pending interactions
  if (state.pendingInteraction) {
    const interaction = state.pendingInteraction;

    // Blocker choice interaction
    if (
      (interaction.type === 'BLOCK_DECLARATION' || interaction.type === 'BLOCKER_CHOICE') &&
      interaction.defendingPlayer === aiPlayer
    ) {
      const validBlockers = aiState.battleZone.filter((c) =>
        interaction.validBlockerIds.includes(c.instanceId)
      );
      if (validBlockers.length === 0) {
        return { type: 'DECLARE_BLOCK', player: aiPlayer, blockerId: null };
      }

      // Forced-block check: Storm Wrangler OR native `blocksIfAble` (Pierr, Ardent Lunatron, Messa Bahna, Belmol)
      const mandatoryBlockers = validBlockers.filter(
        (b) => interaction.isMandatory || isCreatureForcedBlocker(b, interaction.attackerId)
      );
      if (mandatoryBlockers.length === 1) {
        return {
          type: 'DECLARE_BLOCK',
          player: aiPlayer,
          blockerId: mandatoryBlockers[0].instanceId
        };
      }
      const candidateBlockers = mandatoryBlockers.length > 0 ? mandatoryBlockers : validBlockers;

      const attacker = oppState.battleZone.find((c) => c.instanceId === interaction.attackerId);
      const attPower = attacker
        ? getCreatureEffectivePower(attacker, true, oppState, aiState, false, state)
        : 0;

      // 1. Blocker that wins the battle cleanly
      const winningBlocker = candidateBlockers.find(
        (b) => getCreatureEffectivePower(b, false, aiState, oppState, true, state) > attPower
      );
      if (winningBlocker) {
        return {
          type: 'DECLARE_BLOCK',
          player: aiPlayer,
          blockerId: winningBlocker.instanceId
        };
      }

      // 2. Slayer trade against high-threat or lethal attackers
      const isDirectAttack = state.combatState?.target.type === 'player';
      if (attPower >= 4000 || isDirectAttack || mandatoryBlockers.length > 0) {
        const slayerBlockers = candidateBlockers.filter((b) =>
          hasCreatureSlayer(b, aiState.battleZone, oppState.battleZone, aiState)
        );
        if (slayerBlockers.length > 0) {
          const sortedSlayers = [...slayerBlockers].sort(
            (a, b) =>
              getCreatureEffectivePower(a, false, aiState, oppState, true, state) -
              getCreatureEffectivePower(b, false, aiState, oppState, true, state)
          );
          return {
            type: 'DECLARE_BLOCK',
            player: aiPlayer,
            blockerId: sortedSlayers[0].instanceId
          };
        }
      }

      // 3. Desperation chump block (or mandatory chump block)
      const unbrokenCount = aiState.shields.filter((s) => !s.isBroken).length;
      if ((unbrokenCount === 0 && isDirectAttack) || mandatoryBlockers.length > 0) {
        const sorted = [...candidateBlockers].sort(
          (a, b) =>
            getCreatureEffectivePower(a, false, aiState, oppState, true, state) -
            getCreatureEffectivePower(b, false, aiState, oppState, true, state)
        );
        return {
          type: 'DECLARE_BLOCK',
          player: aiPlayer,
          blockerId: sorted[0].instanceId
        };
      }

      return { type: 'DECLARE_BLOCK', player: aiPlayer, blockerId: null };
    }

    // Shield trigger resolution
    if (
      (interaction.type === 'SHIELD_TRIGGER_RESOLUTION' ||
        interaction.type === 'SHIELD_TRIGGER_CHOICE') &&
      interaction.player === aiPlayer
    ) {
      const triggers = interaction.triggers || [];
      if (triggers.length > 0) {
        const currentTrigger = triggers[0];

        if (currentTrigger.card.type === 'Spell') {
          const req = getSpellTargetRequirement(currentTrigger.card, aiState, oppState);

          // Decline if required targets are missing or pure removal spell has no legal target
          if (shouldAiSkipSpell(currentTrigger.card, aiState, oppState, req)) {
            return {
              type: 'RESOLVE_SHIELD_TRIGGER',
              player: aiPlayer,
              shieldId: currentTrigger.shieldId,
              activate: false
            };
          }

          let targets: string[] | undefined;
          if (req.requiresTarget && req.validTargetIds.length > 0) {
            const oppTargets = oppState.battleZone.filter((c) =>
              req.validTargetIds.includes(c.instanceId)
            );
            if (oppTargets.length > 0) {
              oppTargets.sort(
                (a, b) =>
                  getCreatureEffectivePower(b, false, oppState, aiState, false, state) -
                  getCreatureEffectivePower(a, false, oppState, aiState, false, state)
              );
              targets = oppTargets.slice(0, req.maxTargets).map((c) => c.instanceId);
            } else if (req.minTargets === 0) {
              // Do not bounce/destroy our own creature for free if optional
              return {
                type: 'RESOLVE_SHIELD_TRIGGER',
                player: aiPlayer,
                shieldId: currentTrigger.shieldId,
                activate: false
              };
            } else {
              targets = req.validTargetIds.slice(0, req.maxTargets);
            }
          }

          return {
            type: 'RESOLVE_SHIELD_TRIGGER',
            player: aiPlayer,
            shieldId: currentTrigger.shieldId,
            activate: true,
            targets
          };
        }

        // Creature Shield Trigger: pick best opponent target if CIP accepts one
        let targets: string[] | undefined;
        if (oppState.battleZone.length > 0) {
          const sortedOpp = [...oppState.battleZone].sort(
            (a, b) =>
              getCreatureEffectivePower(b, false, oppState, aiState, false, state) -
              getCreatureEffectivePower(a, false, oppState, aiState, false, state)
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

    // Interactive target selection
    if (interaction.type === 'TARGET_SELECTION' && interaction.player === aiPlayer) {
      const oppTargets = oppState.battleZone.filter((c) =>
        interaction.validTargetIds.includes(c.instanceId)
      );
      let selected: string[];
      if (oppTargets.length > 0) {
        oppTargets.sort(
          (a, b) =>
            getCreatureEffectivePower(b, false, oppState, aiState, false, state) -
            getCreatureEffectivePower(a, false, oppState, aiState, false, state)
        );
        const count = Math.min(interaction.maxTargets || 1, oppTargets.length);
        selected = oppTargets.slice(0, count).map((c) => c.instanceId);
      } else {
        const needed = Math.min(interaction.minTargets || 0, interaction.validTargetIds.length);
        selected = interaction.validTargetIds.slice(0, needed);
      }
      return {
        type: 'SELECT_TARGETS',
        player: aiPlayer,
        selectedIds: selected
      };
    }

    // Optional choice interaction
    if (interaction.type === 'OPTIONAL_CHOICE' && interaction.player === aiPlayer) {
      let accept = true;
      if (interaction.effectType === 'DRAW') {
        accept = aiState.deck.length > 2;
      } else if (interaction.effectType === 'SHIELD_SACRIFICE_REPLACEMENT') {
        accept = aiState.shields.filter((s) => !s.isBroken).length <= 2;
      } else if (interaction.effectType === 'SAVER_REPLACEMENT' && interaction.targetInstanceId) {
        const target = aiState.battleZone.find((c) => c.instanceId === interaction.targetInstanceId);
        accept = (target?.card.power ?? 0) >= 4000;
      } else if (interaction.effectType === 'GIGABEROS_SACRIFICE_TWO') {
        accept = aiState.battleZone.length >= 3;
      } else if (interaction.effectType === 'CAST_FREE_SPELL') {
        accept = true;
      }
      return {
        type: 'RESOLVE_OPTIONAL_CHOICE',
        player: aiPlayer,
        accept
      };
    }

    // Silent Skill start-of-turn choice
    if (interaction.type === 'SILENT_SKILL_CHOICE' && interaction.player === aiPlayer) {
      const creature = aiState.battleZone.find((c) => c.instanceId === interaction.creatureInstanceId);
      return {
        type: 'RESOLVE_SILENT_SKILL_CHOICE',
        player: aiPlayer,
        activate: creature ? shouldAiActivateSilentSkill(state, aiPlayer, creature) : false
      };
    }

    // Generic 6-zone interactive selection
    if (interaction.type === 'ZONE_SELECTION' && interaction.player === aiPlayer) {
      if (
        interaction.actionKind === 'TAP_CHOOSE_RACE' ||
        interaction.actionKind === 'SPELL_CHOOSE_RACE' ||
        interaction.actionKind === 'CIP_CHOOSE_RACE' ||
        interaction.actionKind === 'CHOOSE_NUMBER'
      ) {
        if (interaction.actionKind === 'CHOOSE_NUMBER') {
          return {
            type: 'RESOLVE_ZONE_SELECTION',
            player: aiPlayer,
            selectedIds: [],
            selectedRace: interaction.raceOptions?.[0] || '2000'
          };
        }
        const allowedSet = interaction.raceOptions?.length
          ? new Set(interaction.raceOptions.map(normalizeRace))
          : null;
        const raceCounts = new Map<string, { raw: string; count: number }>();
        for (const c of aiState.battleZone) {
          for (const r of getCreatureRaces(c)) {
            const norm = normalizeRace(r);
            if (allowedSet && !allowedSet.has(norm)) continue;
            const cur = raceCounts.get(norm) || { raw: r, count: 0 };
            raceCounts.set(norm, { raw: cur.raw, count: cur.count + 1 });
          }
        }
        const bestRace =
          Array.from(raceCounts.values()).sort((a, b) => b.count - a.count)[0]?.raw ||
          interaction.raceOptions?.[0] ||
          'Liquid People';
        return {
          type: 'RESOLVE_ZONE_SELECTION',
          player: aiPlayer,
          selectedIds: [],
          selectedRace: bestRace
        };
      }

      const kind = interaction.actionKind;
      const opts = [...interaction.options];
      const count = Math.min(Math.max(interaction.minSelections, 1), opts.length);

      if (kind === 'MIRACULOUS_MELTDOWN_KEEP' || kind === 'OPPONENT_CHOOSE_SHIELD' || kind === 'COSMIC_DARTS_PICK_SHIELD') {
        opts.sort((a, b) => (b.card.isShieldTrigger ? 1 : 0) - (a.card.isShieldTrigger ? 1 : 0));
      } else if (
        kind === 'PLAYER_SACRIFICE_BZ' ||
        kind === 'OPPONENT_SACRIFICE_BZ' ||
        kind === 'OPPONENT_DISCARD_HAND' ||
        kind === 'PLAYER_DISCARD_FROM_HAND' ||
        kind === 'OPPONENT_MANA_SEND_BZ' ||
        kind === 'PLAYER_MANA_TO_GY' ||
        kind === 'OPPONENT_MANA_TO_GY' ||
        kind === 'PLAYER_MANA_RECOVERY' ||
        kind === 'PLAYER_SHIELD_TO_GY' ||
        kind === 'PLAYER_SHIELD_TO_HAND' ||
        kind === 'PLAYER_SHIELD_TO_MANA' ||
        kind === 'OPPONENT_CRISIS_BOULDER' ||
        kind === 'OPPONENT_GRINNING_HUNGER' ||
        kind === 'RONDOBIL_CREATURE_TO_SHIELD' ||
        kind === 'DE_EVOLVE_TO_GY' ||
        kind === 'DE_EVOLVE_TO_MANA' ||
        kind === 'OPPONENT_DECK_TO_GY' ||
        kind === 'SEARCH_DECK_TO_GY' ||
        kind === 'TRANSMOGRIFY_DESTROY' ||
        kind === 'SOULSWAP_BZ_TO_MANA' ||
        kind === 'RAPID_REINCARNATION_SACRIFICE' ||
        kind === 'MIRACULOUS_PLAGUE_OPP_CREATURES' ||
        kind === 'MIRACULOUS_PLAGUE_OPP_MANA'
      ) {
        const ownsOptions = opts[0]?.owner === aiPlayer;
        if (ownsOptions) {
          // Sacrifice / discard lowest-value options
          opts.sort((a, b) => (a.card.power ?? a.card.manaCost * 1000) - (b.card.power ?? b.card.manaCost * 1000));
        } else {
          // Harm opponent's highest-value options
          opts.sort((a, b) => (b.card.power ?? b.card.manaCost * 1000) - (a.card.power ?? a.card.manaCost * 1000));
        }
      } else {
        // Beneficial salvage / ramp / buff / Static Warp keep / deck multi: prefer highest power/cost
        opts.sort((a, b) => (b.card.power ?? b.card.manaCost * 1000) - (a.card.power ?? a.card.manaCost * 1000));
      }

      const pickN =
        interaction.minSelections === 0 && opts.length > 0 && kind !== 'PLAYER_SHIELD_PEEK'
          ? Math.min(interaction.maxSelections, opts.length)
          : interaction.minSelections === 0
          ? 0
          : count;

      return {
        type: 'RESOLVE_ZONE_SELECTION',
        player: aiPlayer,
        selectedIds: opts.slice(0, pickN).map((o) => o.instanceId)
      };
    }

    // Deck search interaction
    if (interaction.type === 'DECK_SEARCH' && interaction.player === aiPlayer) {
      const candidates = aiState.deck.filter((c) =>
        interaction.validCardInstanceIds.includes(c.instanceId)
      );
      if (candidates.length === 0) {
        return {
          type: 'RESOLVE_DECK_SEARCH',
          player: aiPlayer,
          selectedCardInstanceId: null
        };
      }
      candidates.sort(
        (a, b) => (b.card.power || b.card.manaCost * 1000) - (a.card.power || a.card.manaCost * 1000)
      );
      return {
        type: 'RESOLVE_DECK_SEARCH',
        player: aiPlayer,
        selectedCardInstanceId: candidates[0].instanceId
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
      if (!aiState.manaChargedThisTurn && aiState.hand.length > 0) {
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
      // 1. Summon highest cost affordable creature (with cost reduction & Vortex checks)
      const affordableCreatures: {
        cardInstance: CardInstance;
        baitId?: string;
        baitIds?: string[];
      }[] = [];

      for (const item of aiState.hand) {
        if (!item.card.type.includes('Creature')) continue;
        if (!canSummonCreature(state, aiPlayer, item.card).allowed) {
          continue;
        }
        if (!canPayManaCost(aiState.manaZone, item.card, aiState.battleZone, oppState.battleZone)) {
          continue;
        }
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
            const validBait = aiState.battleZone.find((c) => isValidEvolutionBait(item.card, c));
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

      if (affordableCreatures.length > 0) {
        affordableCreatures.sort(
          (a, b) =>
            getEffectiveManaCost(b.cardInstance.card, aiState.battleZone, oppState.battleZone) -
            getEffectiveManaCost(a.cardInstance.card, aiState.battleZone, oppState.battleZone)
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

      // 2. Cast affordable spell that satisfies preconditions & valid targets
      for (const item of aiState.hand) {
        if (!item.card.type.includes('Spell')) continue;
        if (!canPayManaCost(aiState.manaZone, item.card, aiState.battleZone, oppState.battleZone)) {
          continue;
        }
        if (!canCastSpell(state, aiPlayer, item.card).allowed) {
          continue;
        }

        const req = getSpellTargetRequirement(item.card, aiState, oppState);
        if (shouldAiSkipSpell(item.card, aiState, oppState, req)) {
          continue;
        }

        let targets: string[] | undefined;
        if (req.minTargets > 0 || (req.requiresTarget && req.validTargetIds.length > 0)) {
          const oppTargets = oppState.battleZone.filter((c) =>
            req.validTargetIds.includes(c.instanceId)
          );
          if (oppTargets.length > 0) {
            oppTargets.sort(
              (a, b) =>
                getCreatureEffectivePower(b, false, oppState, aiState, false, state) -
                getCreatureEffectivePower(a, false, oppState, aiState, false, state)
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

      return { type: 'PASS_PHASE', player: aiPlayer };
    }

    case 'ATTACK': {
      // Consider high-value $tap abilities before declaring attacks (when no mandatory attack blocks them)
      const forcedRaces = aiState.tempAttacksIfAbleRacesThisTurn || [];
      const activeGiants = getActiveForcedLureTargets(state, aiPlayer);
      const isForcedAttacker = (c: typeof aiState.battleZone[number]) =>
        isCreatureMandatoryAttacker(c, forcedRaces, state, aiPlayer) ||
        activeGiants.some((g) => canCreatureAttack(state, c, { type: 'creature', instanceId: g.instanceId }, aiPlayer).valid);

      const hasMandatoryPending = aiState.battleZone.some(
        (c) =>
          isForcedAttacker(c) &&
          canCreatureAttack(state, c, undefined, aiPlayer).valid
      );

      if (!hasMandatoryPending) {
        const tapCandidate = aiState.battleZone.find((c) => {
          if (!canActivateTapAbility(state, c, aiPlayer).valid) return false;
          const n = getCardCapabilities(c.card).nameLower;
          if (n.includes('kachua') && aiState.deck.some((d) => (d.card.races || []).some((r) => /dragon/i.test(r) && !/dragonoid/i.test(r)))) return true;
          if (n.includes('charmilia') && aiState.deck.some((d) => d.card.type.includes('Creature'))) return true;
          if (n.includes('neon cluster') && aiState.deck.length > 3) return true;
          if (n.includes('tank mutant') && oppState.battleZone.length > 0) return true;
          if (n.includes('aeropica') && oppState.battleZone.length > 0) return true;
          if (n.includes("kipo's contraption") && oppState.battleZone.some((o) => (o.card.power ?? 0) <= 2000)) return true;
          if (n.includes("rikabu's screwdriver") && oppState.battleZone.some((o) => (o.card.rulesText || '').toLowerCase().includes('blocker'))) return true;
          if (n.includes('mighty bandit') && aiState.battleZone.length >= 2) return true;
          return false;
        });
        if (tapCandidate) {
          return {
            type: 'ACTIVATE_TAP_ABILITY',
            player: aiPlayer,
            creatureInstanceId: tapCandidate.instanceId
          };
        }
      }

      const eligible = aiState.battleZone.filter(
        (c) => canCreatureAttack(state, c, undefined, aiPlayer).valid
      );

      if (eligible.length === 0) {
        return { type: 'END_TURN', player: aiPlayer };
      }

      const mandatory = eligible.filter((c) => isForcedAttacker(c));

      const orderedAttackers =
        mandatory.length > 0
          ? mandatory
          : [...eligible].sort(
              (a, b) =>
                getCreatureEffectivePower(b, true, aiState, oppState, false, state) -
                getCreatureEffectivePower(a, true, aiState, oppState, false, state)
            );

      const unbrokenShields = oppState.shields
        .map((s, index) => ({ s, index }))
        .filter((x) => !x.s.isBroken);

      for (const attacker of orderedAttackers) {
        const attPower = getCreatureEffectivePower(attacker, true, aiState, oppState, false, state);

        // Strategy 1: Direct attack if opponent has 0 unbroken shields and legal
        if (
          unbrokenShields.length === 0 &&
          canCreatureAttack(state, attacker, { type: 'player' }, aiPlayer).valid
        ) {
          return {
            type: 'DECLARE_ATTACK',
            player: aiPlayer,
            attackerInstanceId: attacker.instanceId,
            target: { type: 'player' }
          };
        }

        // Strategy 2: Attack any legally attackable opponent creature that we beat cleanly
        const legalCreatureTargets = oppState.battleZone.filter(
          (c) =>
            canCreatureAttack(state, attacker, { type: 'creature', instanceId: c.instanceId }, aiPlayer)
              .valid
        );
        const beatableTargets = legalCreatureTargets.filter(
          (c) =>
            attPower > getCreatureEffectivePower(c, false, oppState, aiState, false, state)
        );
        if (beatableTargets.length > 0) {
          beatableTargets.sort(
            (a, b) =>
              getCreatureEffectivePower(b, false, oppState, aiState, false, state) -
              getCreatureEffectivePower(a, false, oppState, aiState, false, state)
          );
          return {
            type: 'DECLARE_ATTACK',
            player: aiPlayer,
            attackerInstanceId: attacker.instanceId,
            target: { type: 'creature', instanceId: beatableTargets[0].instanceId }
          };
        }

        // Strategy 3: Attack shield(s) if legal
        if (unbrokenShields.length > 0) {
          const breakerCount = getCreatureBreakerCount(
            attacker,
            aiState.battleZone,
            oppState.battleZone,
            state,
            aiPlayer
          );
          const targetIndices = unbrokenShields.slice(0, breakerCount).map((x) => x.index);
          const shieldTarget: AttackTarget = {
            type: 'shield',
            index: targetIndices[0],
            indices: targetIndices
          };
          if (canCreatureAttack(state, attacker, shieldTarget, aiPlayer).valid) {
            return {
              type: 'DECLARE_ATTACK',
              player: aiPlayer,
              attackerInstanceId: attacker.instanceId,
              target: shieldTarget
            };
          }
        }

        // Strategy 4: Fallback legal creature target (e.g. mandatory attacker forced into stronger tapped creature)
        if (legalCreatureTargets.length > 0) {
          const sortedWeakest = [...legalCreatureTargets].sort(
            (a, b) =>
              getCreatureEffectivePower(a, false, oppState, aiState, false, state) -
              getCreatureEffectivePower(b, false, oppState, aiState, false, state)
          );
          return {
            type: 'DECLARE_ATTACK',
            player: aiPlayer,
            attackerInstanceId: attacker.instanceId,
            target: { type: 'creature', instanceId: sortedWeakest[0].instanceId }
          };
        }
      }

      return { type: 'END_TURN', player: aiPlayer };
    }

    default:
      return { type: 'END_TURN', player: aiPlayer };
  }
}
