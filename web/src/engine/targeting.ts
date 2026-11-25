import type { CreatureInstance, GameState, PlayerId, PlayerState } from './types.ts';
import type { CardDefinition } from '../types/card.ts';
import {
  getCardCapabilities,
  getCardCivilizations
} from './cardUtils.ts';
import {
  getCreatureEffectivePower,
  hasCreatureBlocker
} from './continuous.ts';

export interface TargetRequirement {
  requiresTarget: boolean;
  minTargets: number;
  maxTargets: number;
  validTargetIds: string[];
  prompt: string;
}

/**
 * Checks if a creature cannot be chosen by opponent spells/abilities (e.g. Petrova, Channeler of Suns).
 */
export function isUntargetableByOpponent(creature: CreatureInstance): boolean {
  const caps = getCardCapabilities(creature.card);
  return (
    caps.nameLower.includes('petrova') ||
    /whenever your opponent would choose a creature in the battle zone,\s*he can't choose this one/i.test(
      creature.card.rulesText || ''
    )
  );
}

/**
 * Single Source of Truth for spell & shield-trigger target requirements across engine, AI, and React UI!
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
  const nameLower = getCardCapabilities(card).nameLower.trim();
  const oppBZ = opponentState.battleZone || [];
  const casterBZ = casterState.battleZone || [];
  const choosableOpp = oppBZ.filter((c) => !isUntargetableByOpponent(c));
  const choosableAll = [...casterBZ, ...choosableOpp];

  const effPower = (c: CreatureInstance, ownerZone: PlayerState, oppZone: PlayerState) =>
    getCreatureEffectivePower(c, false, ownerZone, oppZone);

  // 1a. Comet Missile: Destroy 1 opponent creature with Blocker and power <= 6000
  if (
    nameLower.includes('comet missile') ||
    /destroy (?:one|1) of your opponent's creatures that has "blocker" and power 6000 or less/i.test(rules)
  ) {
    const valid = choosableOpp
      .filter(
        (c) =>
          hasCreatureBlocker(c, oppBZ, casterBZ, opponentState) &&
          effPower(c, opponentState, casterState) <= 6000
      )
      .map((c) => c.instanceId);
    return {
      requiresTarget: valid.length > 0,
      minTargets: valid.length > 0 ? 1 : 0,
      maxTargets: 1,
      validTargetIds: valid,
      prompt: 'Choose 1 opponent creature with Blocker and power 6000 or less to destroy.'
    };
  }

  // 1b. Critical Blade: Destroy 1 opponent Blocker
  if (
    nameLower.includes('critical blade') ||
    (/destroy (?:one|1) of your opponent's creatures that has "blocker"/i.test(rules) && !/power/i.test(rules))
  ) {
    const valid = choosableOpp
      .filter((c) => hasCreatureBlocker(c, oppBZ, casterBZ, opponentState))
      .map((c) => c.instanceId);
    return {
      requiresTarget: valid.length > 0,
      minTargets: valid.length > 0 ? 1 : 0,
      maxTargets: 1,
      validTargetIds: valid,
      prompt: 'Choose 1 opponent creature with Blocker to destroy.'
    };
  }

  // 1c. Vacuum Gel: Destroy 1 untapped Light or untapped Nature opponent creature
  if (nameLower.includes('vacuum gel')) {
    const valid = choosableOpp
      .filter(
        (c) =>
          !c.isTapped &&
          getCardCivilizations(c.card).some((civ) => civ === 'Light' || civ === 'Nature')
      )
      .map((c) => c.instanceId);
    return {
      requiresTarget: valid.length > 0,
      minTargets: valid.length > 0 ? 1 : 0,
      maxTargets: 1,
      validTargetIds: valid,
      prompt: 'Choose 1 untapped Light or Nature opponent creature to destroy.'
    };
  }

  // 1d. Death Smoke: Destroy 1 untapped opponent creature
  if (
    nameLower === 'death smoke' ||
    /destroy (?:1|one) of your opponent's untapped creatures/i.test(rules)
  ) {
    const valid = choosableOpp.filter((c) => !c.isTapped).map((c) => c.instanceId);
    return {
      requiresTarget: valid.length > 0,
      minTargets: valid.length > 0 ? 1 : 0,
      maxTargets: 1,
      validTargetIds: valid,
      prompt: 'Choose 1 untapped opponent creature to destroy.'
    };
  }

  // 1e. Power threshold destroy spells (Crimson Hammer <= 2000, Spastic/Ten-Ton/Cloned Blade <= 3000, Tornado Flame <= 4000, Miraculous Rebirth <= 5000)
  const powerDestroyMatch = rules.match(
    /(?:destroy|choose) (?:one|1|an) of your opponent's creatures(?: in the battle zone)? that has power (\d+) or less/i
  );
  if (
    powerDestroyMatch ||
    nameLower.includes('crimson hammer') ||
    nameLower.includes('tornado flame') ||
    nameLower.includes('volcano charger') ||
    nameLower.includes("phantom dragon's flame") ||
    nameLower.includes('spastic missile') ||
    nameLower.includes('ten-ton crunch') ||
    nameLower.includes('cloned blade') ||
    nameLower.includes('miraculous rebirth') ||
    nameLower.includes('hurlosaur')
  ) {
    const maxPower = powerDestroyMatch
      ? parseInt(powerDestroyMatch[1], 10)
      : nameLower.includes('tornado flame')
      ? 4000
      : nameLower.includes('miraculous rebirth')
      ? 5000
      : nameLower.includes('hurlosaur')
      ? 1000
      : nameLower.includes('spastic missile') ||
        nameLower.includes('ten-ton crunch') ||
        nameLower.includes('cloned blade')
      ? 3000
      : 2000;

    const valid = choosableOpp
      .filter((c) => effPower(c, opponentState, casterState) <= maxPower)
      .map((c) => c.instanceId);

    return {
      requiresTarget: valid.length > 0,
      minTargets: valid.length > 0 ? 1 : 0,
      maxTargets: 1,
      validTargetIds: valid,
      prompt: `Choose 1 opponent creature with power ${maxPower} or less to destroy.`
    };
  }

  // 1f. Volcanic Arrows: Destroy a creature (either side) with power 6000 or less
  if (nameLower.includes('volcanic arrows')) {
    const valid = [
      ...casterBZ.filter((c) => effPower(c, casterState, opponentState) <= 6000),
      ...choosableOpp.filter((c) => effPower(c, opponentState, casterState) <= 6000)
    ].map((c) => c.instanceId);
    return {
      requiresTarget: valid.length > 0,
      minTargets: valid.length > 0 ? 1 : 0,
      maxTargets: 1,
      validTargetIds: valid,
      prompt: 'Choose a creature with power 6000 or less to destroy.'
    };
  }

  // 1g. Terror Pit / Hopeless Vortex: Destroy 1 opponent creature without power restriction
  if (
    nameLower.includes('terror pit') ||
    nameLower.includes('hopeless vortex') ||
    (/destroy (?:one|1) of your opponent's creatures/i.test(rules) &&
      !/power \d+ or less/i.test(rules) &&
      !/"blocker"/i.test(rules))
  ) {
    const valid = choosableOpp.map((c) => c.instanceId);
    return {
      requiresTarget: valid.length > 0,
      minTargets: valid.length > 0 ? 1 : 0,
      maxTargets: 1,
      validTargetIds: valid,
      prompt: 'Choose 1 opponent creature to destroy.'
    };
  }

  // 2. Freezing Icehammer / Natural Snare: opponent creature -> mana zone
  if (nameLower.includes('freezing icehammer')) {
    const valid = choosableOpp
      .filter((c) =>
        getCardCivilizations(c.card).some((civ) => civ === 'Water' || civ === 'Darkness')
      )
      .map((c) => c.instanceId);
    return {
      requiresTarget: valid.length > 0,
      minTargets: valid.length > 0 ? 1 : 0,
      maxTargets: 1,
      validTargetIds: valid,
      prompt: 'Choose 1 opponent Water or Darkness creature to put into their mana zone.'
    };
  }

  if (
    nameLower.includes('natural snare') ||
    /choose 1 of your opponent's creatures in the battle zone and put it into (?:his|their) mana zone/i.test(
      rules
    )
  ) {
    const valid = choosableOpp.map((c) => c.instanceId);
    return {
      requiresTarget: valid.length > 0,
      minTargets: valid.length > 0 ? 1 : 0,
      maxTargets: 1,
      validTargetIds: valid,
      prompt: 'Choose 1 opponent creature to send to the mana zone.'
    };
  }

  // 3. Bounce spells
  if (
    nameLower.includes('teleportation') ||
    nameLower.includes('abduction charger') ||
    /choose up to 2 creatures.*return them to (?:their )?owners?'? hands/i.test(rules)
  ) {
    const valid = choosableAll.map((c) => c.instanceId);
    return {
      requiresTarget: valid.length > 0,
      minTargets: 0,
      maxTargets: 2,
      validTargetIds: valid,
      prompt: 'Choose up to 2 creatures to return to hand.'
    };
  }

  if (nameLower.includes('hide and seek')) {
    const valid = choosableOpp
      .filter((c) => c.card.type !== 'Evolution Creature' && !c.card.isEvolution)
      .map((c) => c.instanceId);
    return {
      requiresTarget: valid.length > 0,
      minTargets: valid.length > 0 ? 1 : 0,
      maxTargets: 1,
      validTargetIds: valid,
      prompt: 'Choose 1 opponent non-evolution creature to return to hand.'
    };
  }

  if (
    nameLower.includes('spiral gate') ||
    nameLower.includes('aqua surfer') ||
    nameLower.includes('riptide charger') ||
    nameLower.includes('wave lance') ||
    /return (?:it|a creature|1 creature) to (?:its|their) owner's hand/i.test(rules)
  ) {
    const valid = choosableAll.map((c) => c.instanceId);
    return {
      requiresTarget: valid.length > 0,
      minTargets: valid.length > 0 ? 1 : 0,
      maxTargets: 1,
      validTargetIds: valid,
      prompt: 'Choose 1 creature to return to hand.'
    };
  }

  // 4. Miraculous Snare (non-evolution creature -> shields)
  if (nameLower.includes('miraculous snare')) {
    const valid = choosableAll
      .filter((c) => c.card.type !== 'Evolution Creature' && !c.card.isEvolution)
      .map((c) => c.instanceId);
    return {
      requiresTarget: valid.length > 0,
      minTargets: valid.length > 0 ? 1 : 0,
      maxTargets: 1,
      validTargetIds: valid,
      prompt: 'Choose a non-evolution creature to add to shields.'
    };
  }

  // 5. Tap opponent creatures (Solar Ray, Lightning Charger, Virtual Tripwire, Solar Trap, Dracobarrier, Moonlight Flash)
  if (nameLower.includes('moonlight flash')) {
    const valid = choosableOpp.filter((c) => !c.isTapped).map((c) => c.instanceId);
    return {
      requiresTarget: valid.length > 0,
      minTargets: 0,
      maxTargets: 2,
      validTargetIds: valid,
      prompt: 'Choose up to 2 opponent creatures to tap.'
    };
  }

  if (
    nameLower.includes('solar ray') ||
    nameLower.includes('lightning charger') ||
    nameLower.includes('virtual tripwire') ||
    nameLower.includes('solar trap') ||
    nameLower.includes('dracobarrier') ||
    /choose (?:one|1) of your opponent's creatures.*and tap it/i.test(rules)
  ) {
    const valid = choosableOpp.filter((c) => !c.isTapped).map((c) => c.instanceId);
    return {
      requiresTarget: valid.length > 0,
      minTargets: valid.length > 0 ? 1 : 0,
      maxTargets: 1,
      validTargetIds: valid,
      prompt: 'Choose 1 untapped opponent creature to tap.'
    };
  }

  // 6. Friendly creature buff / utility targets (Protective Force, Energy Charger, Magma Gazer, Burning Power, Colossus Boost, Mulch Charger, Pangaea's Song, Sonic Wing, Cosmic Wing, Laser Wing, Chaos Strike)
  if (nameLower.includes('protective force')) {
    const valid = casterBZ
      .filter((c) => hasCreatureBlocker(c, casterBZ, oppBZ, casterState))
      .map((c) => c.instanceId);
    return {
      requiresTarget: valid.length > 0,
      minTargets: valid.length > 0 ? 1 : 0,
      maxTargets: 1,
      validTargetIds: valid,
      prompt: 'Choose 1 friendly Blocker to gain +4000 power.'
    };
  }

  if (
    nameLower.includes('energy charger') ||
    nameLower.includes('colossus boost') ||
    nameLower.includes('magma gazer') ||
    nameLower.includes('burning power') ||
    nameLower.includes('supersonic jet pack') ||
    nameLower.includes('venom charger') ||
    nameLower.includes('fists of forever') ||
    nameLower.includes('sonic wing') ||
    nameLower.includes('cosmic wing') ||
    nameLower.includes('miracle portal') ||
    nameLower.includes('mulch charger') ||
    nameLower.includes("pangaea's song")
  ) {
    const valid = casterBZ.map((c) => c.instanceId);
    return {
      requiresTarget: valid.length > 0,
      minTargets: valid.length > 0 ? 1 : 0,
      maxTargets: 1,
      validTargetIds: valid,
      prompt: `Choose 1 of your creatures for ${card.name}.`
    };
  }

  if (nameLower.includes('laser wing') || nameLower.includes('lunar charger')) {
    const valid = casterBZ.map((c) => c.instanceId);
    return {
      requiresTarget: valid.length > 0,
      minTargets: 0,
      maxTargets: 2,
      validTargetIds: valid,
      prompt: `Choose up to 2 of your creatures for ${card.name}.`
    };
  }

  if (nameLower.includes('chaos strike')) {
    const valid = choosableOpp.filter((c) => !c.isTapped).map((c) => c.instanceId);
    return {
      requiresTarget: valid.length > 0,
      minTargets: valid.length > 0 ? 1 : 0,
      maxTargets: 1,
      validTargetIds: valid,
      prompt: 'Choose 1 untapped opponent creature so your creatures can attack it as if tapped.'
    };
  }

  return {
    requiresTarget: false,
    minTargets: 0,
    maxTargets: 0,
    validTargetIds: [],
    prompt: ''
  };
}
