import type {
  GameState,
  PlayerId,
  PlayerState
} from './types.ts';
import type { CardDefinition } from '../types/card.ts';
import { getCreatureEffectivePower } from './combat.ts';
import { hasCreatureBlocker } from './effects.ts';

export interface TargetRequirement {
  requiresTarget: boolean;
  minTargets: number;
  maxTargets: number;
  validTargetIds: string[];
  prompt: string;
}

/**
 * Evaluates whether a spell requires targets and returns the valid target candidate creature instance IDs.
 */
export function getSpellTargetRequirement(
  card: CardDefinition,
  stateOrCasterState: GameState | PlayerState,
  casterOrOpponentState: PlayerId | PlayerState
): TargetRequirement {
  let casterState: PlayerState;
  let opponentState: PlayerState;

  if ('players' in (stateOrCasterState as GameState)) {
    const state = stateOrCasterState as GameState;
    const caster = casterOrOpponentState as PlayerId;
    const opponent: PlayerId = caster === 'player' ? 'opponent' : 'player';
    casterState = state.players[caster];
    opponentState = state.players[opponent];
  } else {
    casterState = stateOrCasterState as PlayerState;
    opponentState = casterOrOpponentState as PlayerState;
  }

  const rules = card.rulesText || '';
  const nameLower = card.name.toLowerCase();

  // 1a. Comet Missile: Destroy 1 opponent creature that has "blocker" and power 6000 or less
  if (
    nameLower.includes('comet missile') ||
    (/destroy (?:one|1) of your opponent's creatures that has "blocker" and power 6000 or less/i.test(rules))
  ) {
    const valid = opponentState.battleZone
      .filter(
        (c) =>
          hasCreatureBlocker(c, opponentState.battleZone) &&
          getCreatureEffectivePower(c, false, opponentState, casterState) <= 6000
      )
      .map((c) => c.instanceId);

    return {
      requiresTarget: valid.length > 0,
      minTargets: valid.length > 0 ? 1 : 0,
      maxTargets: 1,
      validTargetIds: valid,
      prompt: "Choose 1 opponent creature with Blocker and power 6000 or less to destroy."
    };
  }

  // 1b. Critical Blade: Destroy 1 opponent creature that has "blocker"
  if (
    nameLower.includes('critical blade') ||
    (/destroy (?:one|1) of your opponent's creatures that has "blocker"/i.test(rules) && !/power/i.test(rules))
  ) {
    const valid = opponentState.battleZone
      .filter((c) => hasCreatureBlocker(c, opponentState.battleZone))
      .map((c) => c.instanceId);

    return {
      requiresTarget: valid.length > 0,
      minTargets: valid.length > 0 ? 1 : 0,
      maxTargets: 1,
      validTargetIds: valid,
      prompt: "Choose 1 opponent creature with Blocker to destroy."
    };
  }

  // 1c. Destroy 1 opponent creature without power restriction (e.g. Terror Pit)
  if (
    nameLower.includes('terror pit') ||
    (/destroy (?:one|1) of your opponent's creatures/i.test(rules) &&
      !/power \d+ or less/i.test(rules) &&
      !/"blocker"/i.test(rules))
  ) {
    const valid = opponentState.battleZone.map((c) => c.instanceId);
    return {
      requiresTarget: valid.length > 0,
      minTargets: valid.length > 0 ? 1 : 0,
      maxTargets: 1,
      validTargetIds: valid,
      prompt: "Choose 1 opponent creature to destroy."
    };
  }

  // 2. Put opponent creature into mana zone (e.g. Natural Snare)
  if (
    nameLower.includes('natural snare') ||
    /put (?:it|that creature|one of your opponent's creatures) into (?:his|their) mana zone/i.test(rules)
  ) {
    const valid = opponentState.battleZone.map((c) => c.instanceId);
    return {
      requiresTarget: valid.length > 0,
      minTargets: valid.length > 0 ? 1 : 0,
      maxTargets: 1,
      validTargetIds: valid,
      prompt: "Choose 1 opponent creature to send to the mana zone."
    };
  }

  // 3. Bounce up to 2 creatures (e.g. Teleportation)
  if (
    nameLower.includes('teleportation') ||
    /choose up to 2 creatures.*return them to (?:their )?owners?'? hands/i.test(rules)
  ) {
    const allCreatures = [...casterState.battleZone, ...opponentState.battleZone];
    const valid = allCreatures.map((c) => c.instanceId);
    return {
      requiresTarget: valid.length > 0,
      minTargets: 0,
      maxTargets: 2,
      validTargetIds: valid,
      prompt: "Choose up to 2 creatures to return to hand."
    };
  }

  // 4. Bounce 1 creature (e.g. Spiral Gate)
  if (
    nameLower.includes('spiral gate') ||
    /return (?:it|a creature) to (?:its|their) owner's hand/i.test(rules)
  ) {
    const allCreatures = [...casterState.battleZone, ...opponentState.battleZone];
    const valid = allCreatures.map((c) => c.instanceId);
    return {
      requiresTarget: valid.length > 0,
      minTargets: valid.length > 0 ? 1 : 0,
      maxTargets: 1,
      validTargetIds: valid,
      prompt: "Choose 1 creature to return to hand."
    };
  }

  // 5. Destroy creature with power threshold (e.g. Crimson Hammer <= 2000, Tornado Flame <= 3000)
  const powerDestroyMatch = rules.match(/destroy (?:one|1) of your opponent's creatures that has power (\d+) or less/i);
  if (powerDestroyMatch || nameLower.includes('crimson hammer') || nameLower.includes('tornado flame')) {
    const maxPower = powerDestroyMatch
      ? parseInt(powerDestroyMatch[1], 10)
      : nameLower.includes('crimson hammer')
      ? 2000
      : 3000;

    const valid = opponentState.battleZone
      .filter((c) => getCreatureEffectivePower(c, false, opponentState, casterState) <= maxPower)
      .map((c) => c.instanceId);

    return {
      requiresTarget: valid.length > 0,
      minTargets: valid.length > 0 ? 1 : 0,
      maxTargets: 1,
      validTargetIds: valid,
      prompt: `Choose 1 opponent creature with power ${maxPower} or less to destroy.`
    };
  }

  // 6. Tap 1 opponent creature (e.g. Solar Ray)
  if (
    nameLower.includes('solar ray') ||
    /choose (?:one|1) of your opponent's creatures.*and tap it/i.test(rules)
  ) {
    const valid = opponentState.battleZone.filter((c) => !c.isTapped).map((c) => c.instanceId);
    return {
      requiresTarget: valid.length > 0,
      minTargets: valid.length > 0 ? 1 : 0,
      maxTargets: 1,
      validTargetIds: valid,
      prompt: "Choose 1 untapped opponent creature to tap."
    };
  }

  return {
    requiresTarget: false,
    minTargets: 0,
    maxTargets: 0,
    validTargetIds: [],
    prompt: ""
  };
}
