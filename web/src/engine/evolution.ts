import type { CardDefinition } from '../types/card';
import type { GameState, PlayerId, CreatureInstance, CardInstance } from './types';
import { canPayManaCost, payManaCost } from './mana.ts';
import { resolveCreatureCIPEffect } from './spells.ts';
import { isSurvivor, getSurvivorSharedAbilities } from './effects.ts';

/**
 * Normalizes race strings for comparison (case-insensitive, trims whitespace, handles plurals and aliases).
 */
export function normalizeRace(race: string): string {
  return race
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/xeno\s*parts?/i, 'xenoparts')
    .replace(/horned\s*beasts?/i, 'hornbeast')
    .replace(/horn\s*beasts?/i, 'hornbeast')
    .replace(/rainbow\s*phantoms?/i, 'rainbowphantom')
    .replace(/wild\s*veggies?/i, 'wildveggie')
    .replace(/earth\s*eaters?/i, 'eartheater')
    .replace(/cyber\s*lords?/i, 'cyberlord')
    .replace(/cyber\s*viruses?/i, 'cybervirus')
    .replace(/cyber\s*clusters?/i, 'cybercluster')
    .replace(/fire\s*birds?/i, 'firebird')
    .replace(/earth\s*dragons?/i, 'earthdragon')
    .replace(/armored\s*dragons?/i, 'armoreddragon')
    .replace(/zombie\s*dragons?/i, 'zombiedragon')
    .replace(/light\s*bringers?/i, 'lightbringer')
    .replace(/angel\s*commands?/i, 'angelcommand')
    .replace(/demon\s*commands?/i, 'demoncommand')
    .replace(/parasite\s*worms?/i, 'parasiteworm')
    .replace(/rock\s*beasts?/i, 'rockbeast')
    .replace(/giant\s*insects?/i, 'giantinsect')
    .replace(/beast\s*folk/i, 'beastfolk')
    .replace(/liquid\s*people/i, 'liquidpeople')
    .replace(/s$/, ''); // strip trailing 's'
}

/**
 * Checks whether any of the bait's races matches a required evolution race.
 */
export function matchesBaitRace(baitRaces: string[] = [], requirement: string): boolean {
  const reqClean = requirement.toLowerCase().trim();
  if (reqClean === 'dragon' || reqClean.includes('dragon in its race')) {
    return baitRaces.some((r) => r.toLowerCase().includes('dragon'));
  }
  const reqNorm = normalizeRace(requirement);
  return baitRaces.some((r) => {
    const rNorm = normalizeRace(r);
    return rNorm === reqNorm || rNorm.includes(reqNorm) || reqNorm.includes(rNorm);
  });
}

/**
 * Determines whether a card definition represents an Evolution Creature.
 */
export function isEvolutionCreature(card: CardDefinition): boolean {
  return card.type === 'Evolution Creature' || Boolean(card.isEvolution);
}

/**
 * Checks whether an evolution creature is a Vortex Evolution creature.
 * Vortex Evolution creatures require two distinct creatures in the battle zone.
 */
export function isVortexEvolution(card: CardDefinition): boolean {
  return /vortex evolution/i.test(card.rulesText || '');
}

export interface VortexEvolutionRequirement {
  race1: string;
  race2: string;
}

/**
 * Extracts the two required bait races for a Vortex Evolution creature.
 */
export function getVortexEvolutionRequirements(
  card: CardDefinition
): VortexEvolutionRequirement | null {
  const rules = card.rulesText || '';
  const match = rules.match(
    /vortex evolution[—\-]\s*(?:put on (?:one of your|2 of your creatures:?\s*(?:one|1)?))?\s*([^.]+?)\s*(?:and|\+)\s*(?:one of your\s*)?([^.]+?)\./i
  );
  if (match) {
    return {
      race1: match[1].trim(),
      race2: match[2].trim()
    };
  }
  return null;
}

/**
 * Extracts the required bait creature races for an evolution creature.
 * For either-or evolution creatures, returns the list of allowed races.
 */
export function getEvolutionBaitRequirements(card: CardDefinition): string[] {
  const rules = card.rulesText || '';

  // 1. Vortex evolution requirements
  const vortex = getVortexEvolutionRequirements(card);
  if (vortex) {
    return [vortex.race1, vortex.race2];
  }

  // 2. Either/Or evolution: "Evolution—Put on one of your [Race A] or [Race B]."
  const orMatch = rules.match(
    /evolution[—\-]\s*put on one of your\s+([^.]+?)\s+or\s+(?:a\s+)?([^.]+?)\./i
  );
  if (orMatch) {
    return [orMatch[1].trim(), orMatch[2].trim()];
  }

  // 3. Dragon rules text check: "Evolution—Put on one of your creatures that has Dragon in its race."
  if (/that has Dragon in its race/i.test(rules)) {
    return ['Dragon'];
  }

  // 4. Standard single-race evolution: "Evolution—Put on one of your [Race]."
  const singleMatch = rules.match(/evolution[—\-]\s*put on one of your\s+([^.]+?)\./i);
  if (singleMatch) {
    return [singleMatch[1].trim()];
  }

  if (card.evolutionRaces && card.evolutionRaces.length > 0) {
    return card.evolutionRaces;
  }

  // Standard evolution creatures have their required race as their race
  if (card.races && card.races.length > 0) {
    return card.races;
  }

  return [];
}

/**
 * Validates whether a given creature instance in the battle zone can serve as bait
 * for a standard or either-or evolution creature.
 */
export function isValidEvolutionBait(
  evolutionCard: CardDefinition,
  baitCreature: CreatureInstance
): boolean {
  const reqs = getEvolutionBaitRequirements(evolutionCard);
  if (reqs.length === 0) {
    return false;
  }

  const baitRaces = baitCreature.card.races || [];
  return reqs.some((req) => matchesBaitRace(baitRaces, req));
}

/**
 * Validates whether two distinct creatures in the battle zone can serve as baits
 * for a Vortex Evolution creature (one matching race1, the other matching race2).
 */
export function isValidVortexEvolutionBaits(
  evolutionCard: CardDefinition,
  bait1: CreatureInstance,
  bait2: CreatureInstance
): boolean {
  if (bait1.instanceId === bait2.instanceId) {
    return false;
  }

  const vortexReq = getVortexEvolutionRequirements(evolutionCard);
  if (!vortexReq) {
    return false;
  }

  const races1 = bait1.card.races || [];
  const races2 = bait2.card.races || [];

  const matchForward =
    matchesBaitRace(races1, vortexReq.race1) && matchesBaitRace(races2, vortexReq.race2);
  const matchReverse =
    matchesBaitRace(races1, vortexReq.race2) && matchesBaitRace(races2, vortexReq.race1);

  return matchForward || matchReverse;
}

/**
 * Finds a valid pair of bait creatures in the given battle zone for a Vortex Evolution creature.
 */
export function findValidVortexBaits(
  evolutionCard: CardDefinition,
  battleZone: CreatureInstance[]
): [CreatureInstance, CreatureInstance] | null {
  for (let i = 0; i < battleZone.length; i++) {
    for (let j = i + 1; j < battleZone.length; j++) {
      if (isValidVortexEvolutionBaits(evolutionCard, battleZone[i], battleZone[j])) {
        return [battleZone[i], battleZone[j]];
      }
    }
  }
  return null;
}

/**
 * Checks whether a creature has summoning sickness on a given turn.
 * - Regular creatures cannot attack on the turn summoned unless isSpeedAttacker is true.
 * - Evolution creatures ignore summoning sickness and can attack on the turn summoned.
 */
export function isSummoningSick(
  creature: CreatureInstance,
  currentTurn: number,
  friendlyBattleZone?: CreatureInstance[]
): boolean {
  if (isEvolutionCreature(creature.card)) {
    return false;
  }

  if (creature.card.isSpeedAttacker || /speed attacker/i.test(creature.card.rulesText || '')) {
    return false;
  }

  if (friendlyBattleZone) {
    if (isSurvivor(creature.card)) {
      const abilities = getSurvivorSharedAbilities(friendlyBattleZone);
      if (abilities.hasSpeedAttacker) {
        return false;
      }
    }

    // Burnwisp Lizard: Each of your creatures that has "silent skill" has "speed attacker"
    const hasBurnwispLizard = friendlyBattleZone.some((c) =>
      c.card.name.toLowerCase().includes('burnwisp lizard')
    );
    if (hasBurnwispLizard && /silent skill/i.test(creature.card.rulesText || '')) {
      return false;
    }
  }

  return creature.summonedTurn >= currentTurn;
}

/**
 * Summons a standard creature or evolution creature from the active player's hand:
 * 1. Validates game state, turn, phase (MANA_CHARGE auto-transitions to MAIN).
 * 2. Validates hand presence, card type, and mana cost affordability.
 * 3. Taps required mana in mana zone.
 * 4. If standard/either-or evolution creature:
 *    - Validates presence and race compatibility of bait in friendly battle zone.
 *    - Stacks on bait and inherits tapped state.
 * 5. If Vortex Evolution creature:
 *    - Validates presence and race compatibility of TWO distinct baits in friendly battle zone.
 *    - Stacks on both baits. Enters tapped if EITHER bait was tapped; enters untapped only if both were untapped.
 * 6. Places creature in battle zone.
 * 7. Deducts card from hand and logs the action.
 * 8. Pure and immutable.
 */
export function summonCreature(
  state: GameState,
  player: PlayerId,
  cardInstanceId: string,
  baitInstanceId?: string | string[],
  targets?: string[]
): GameState {
  if (state.winner !== null) {
    throw new Error(`Game has already ended. Winner: ${state.winner}`);
  }

  if (state.activePlayer !== player) {
    throw new Error(`Cannot summon creature when it is not ${player}'s turn.`);
  }

  if (state.phase !== 'MAIN' && state.phase !== 'MANA_CHARGE') {
    throw new Error(`Cannot summon creature during ${state.phase} phase.`);
  }

  const playerState = state.players[player];
  const cardIndex = playerState.hand.findIndex((c) => c.instanceId === cardInstanceId);
  if (cardIndex === -1) {
    throw new Error(`Card ${cardInstanceId} not found in ${player}'s hand.`);
  }

  const handCard = playerState.hand[cardIndex];
  const isEvo = isEvolutionCreature(handCard.card);
  const isVortex = isEvo && isVortexEvolution(handCard.card);
  const isCreature = isEvo || handCard.card.type === 'Creature';

  if (!isCreature) {
    throw new Error(`Card ${handCard.card.name} is not a creature.`);
  }

  if (!canPayManaCost(playerState.manaZone, handCard.card)) {
    throw new Error(`Cannot afford mana cost for ${handCard.card.name}.`);
  }

  const { success, updatedManaZone } = payManaCost(playerState.manaZone, handCard.card);
  if (!success) {
    throw new Error(`Failed to pay mana cost for ${handCard.card.name}.`);
  }

  let baitCreature1: CreatureInstance | undefined;
  let baitCreature2: CreatureInstance | undefined;

  if (isVortex) {
    // Parse two bait instance IDs
    let baitIds: string[] = [];
    if (Array.isArray(baitInstanceId)) {
      baitIds = baitInstanceId;
    } else if (typeof baitInstanceId === 'string') {
      baitIds = baitInstanceId.split(/[\s,]+/).filter(Boolean);
    }

    if (baitIds.length !== 2) {
      throw new Error(
        `Vortex Evolution creature ${handCard.card.name} requires two bait creatures in the battle zone.`
      );
    }

    baitCreature1 = playerState.battleZone.find((c) => c.instanceId === baitIds[0]);
    baitCreature2 = playerState.battleZone.find((c) => c.instanceId === baitIds[1]);

    if (!baitCreature1 || !baitCreature2) {
      throw new Error(
        `One or more bait creatures not found in ${player}'s battle zone for Vortex Evolution.`
      );
    }

    if (!isValidVortexEvolutionBaits(handCard.card, baitCreature1, baitCreature2)) {
      throw new Error(
        `Baits ${baitCreature1.card.name} and ${baitCreature2.card.name} are not valid evolution baits for Vortex Evolution ${handCard.card.name}.`
      );
    }
  } else if (isEvo) {
    const singleBaitId = Array.isArray(baitInstanceId) ? baitInstanceId[0] : baitInstanceId;
    if (!singleBaitId) {
      throw new Error(
        `Evolution creature ${handCard.card.name} requires a bait creature in the battle zone.`
      );
    }

    baitCreature1 = playerState.battleZone.find((c) => c.instanceId === singleBaitId);
    if (!baitCreature1) {
      throw new Error(`Bait creature ${singleBaitId} not found in ${player}'s battle zone.`);
    }

    if (!isValidEvolutionBait(handCard.card, baitCreature1)) {
      throw new Error(
        `Bait creature ${baitCreature1.card.name} is not a valid evolution bait for ${handCard.card.name}.`
      );
    }
  } else if (baitInstanceId && (Array.isArray(baitInstanceId) ? baitInstanceId.length > 0 : true)) {
    throw new Error(
      `Cannot provide bait creature for non-evolution creature ${handCard.card.name}.`
    );
  }

  // Construct evolvedOn stack
  let evolvedOnStack: CardInstance[] | undefined;
  let enterTapped = false;

  const hasMysticMagician = playerState.battleZone.some((c) =>
    c.card.name.toLowerCase().includes('mystic magician')
  );
  const silentSkillTapped = hasMysticMagician && /silent skill/i.test(handCard.card.rulesText || '');

  if (isVortex && baitCreature1 && baitCreature2) {
    const bait1CardInstance: CardInstance = {
      instanceId: baitCreature1.instanceId,
      card: baitCreature1.card,
      owner: baitCreature1.owner
    };
    const bait2CardInstance: CardInstance = {
      instanceId: baitCreature2.instanceId,
      card: baitCreature2.card,
      owner: baitCreature2.owner
    };

    evolvedOnStack = [
      ...(baitCreature1.evolvedOn || []),
      bait1CardInstance,
      ...(baitCreature2.evolvedOn || []),
      bait2CardInstance
    ];

    // Vortex Evolution rule: Enters tapped if EITHER bait was tapped; enters untapped only if both were untapped
    enterTapped = baitCreature1.isTapped || baitCreature2.isTapped || silentSkillTapped;
  } else if (isEvo && baitCreature1) {
    const baitCardInstance: CardInstance = {
      instanceId: baitCreature1.instanceId,
      card: baitCreature1.card,
      owner: baitCreature1.owner
    };

    evolvedOnStack = [...(baitCreature1.evolvedOn || []), baitCardInstance];
    enterTapped = baitCreature1.isTapped || silentSkillTapped;
  } else {
    enterTapped = silentSkillTapped;
  }

  const newCreature: CreatureInstance = {
    instanceId: handCard.instanceId,
    card: handCard.card,
    owner: player,
    isTapped: enterTapped,
    summonedTurn: state.turn,
    powerModifier: 0,
    ...(evolvedOnStack ? { evolvedOn: evolvedOnStack } : {})
  };

  const nextHand = playerState.hand.filter((_, idx) => idx !== cardIndex);

  let nextBattleZone: CreatureInstance[];
  let actionMessage: string;

  if (isVortex && baitCreature1 && baitCreature2) {
    const removedIds = new Set([baitCreature1.instanceId, baitCreature2.instanceId]);
    nextBattleZone = [
      ...playerState.battleZone.filter((c) => !removedIds.has(c.instanceId)),
      newCreature
    ];
    actionMessage = `${player} evolved ${handCard.card.name} (Vortex Evolution) on top of ${baitCreature1.card.name} and ${baitCreature2.card.name}.`;
  } else if (isEvo && baitCreature1) {
    nextBattleZone = playerState.battleZone.map((c) =>
      c.instanceId === baitCreature1!.instanceId ? newCreature : c
    );
    actionMessage = `${player} evolved ${handCard.card.name} on top of ${baitCreature1.card.name}.`;
  } else {
    nextBattleZone = [...playerState.battleZone, newCreature];
    actionMessage = `${player} summoned ${handCard.card.name}.`;
  }

  const stateWithSummonedCreature: GameState = {
    ...state,
    phase: 'MAIN',
    players: {
      ...state.players,
      [player]: {
        ...playerState,
        hand: nextHand,
        manaZone: updatedManaZone,
        battleZone: nextBattleZone
      }
    },
    actionLog: [...state.actionLog, actionMessage]
  };

  return resolveCreatureCIPEffect(stateWithSummonedCreature, player, newCreature, targets);
}
