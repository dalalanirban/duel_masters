import type { CardInstance, CreatureInstance } from './types.ts';
import type { CardDefinition } from '../types/card.ts';
import {
  getCardCapabilities,
  getCardCivilizations,
  getCreatureRaces,
  isMultiCivilization
} from './cardUtils.ts';

/**
 * Checks whether an ally creature acts as a Saver for a victim creature:
 * E.g. Kip Chippotto: "When one of your Armored Dragons would be destroyed, you may destroy this creature instead."
 * Accepts optional excludedIds (e.g. creatures being simultaneously destroyed by a board wipe).
 */
export function findSaverInBattleZone(
  battleZone: CreatureInstance[],
  victim: CreatureInstance,
  excludedIds?: Set<string>
): CreatureInstance | null {
  const victimRaces = getCreatureRaces(victim).map((r) => r.toLowerCase());
  const victimCivs = getCardCivilizations(victim.card).map((c) => c.toLowerCase());
  const isVictimMulti = isMultiCivilization(victim.card);

  for (const saver of battleZone) {
    if (saver.instanceId === victim.instanceId) continue;
    if (excludedIds && excludedIds.has(saver.instanceId)) continue;

    const rules = saver.card.rulesText || '';
    const nameLower = getCardCapabilities(saver.card).nameLower;

    // 1. Explicit Saver regex
    const saverMatch = rules.match(
      /when(?:ever)? one of your (.+?) would be destroyed, you may destroy this creature instead/i
    );
    if (saverMatch) {
      const targetSpec = saverMatch[1].toLowerCase().trim();

      const matchesRace = victimRaces.some((r) => {
        const singular = r.replace(/s$/, '');
        return targetSpec.includes(r) || targetSpec.includes(singular);
      });

      const matchesCiv = victimCivs.some((c) => targetSpec.includes(c));
      const matchesMulti = targetSpec.includes('multicolor') && isVictimMulti;

      if (matchesRace || matchesCiv || matchesMulti || targetSpec === 'creatures') {
        return saver;
      }
    }

    // 2. Iconic cards with Saver by name (Dragon excludes Dragonoid)
    if (nameLower.includes('kip chippotto')) {
      if (victimRaces.some((r) => r.includes('dragon') && !r.includes('dragonoid'))) {
        return saver;
      }
    }
  }

  return null;
}

/**
 * Checks whether a card being discarded from hand has a Madness replacement:
 * "During your opponent's turn, if this creature would be discarded from your hand, put it into the battle zone instead."
 */
export function isMadnessDiscardReplacement(
  card: CardDefinition,
  isOpponentTurn: boolean
): boolean {
  if (!isOpponentTurn) return false;
  return getCardCapabilities(card).isMadness;
}

/**
 * Checks whether the attacker has a Shield Burn replacement:
 * E.g. Bolmeteus Steel Dragon / Death Phoenix: "Whenever this creature would break a shield, your opponent puts that shield into his graveyard instead."
 */
export function hasShieldBurnReplacement(attacker: CreatureInstance): boolean {
  return getCardCapabilities(attacker.card).hasShieldBurn;
}

/**
 * Checks whether an evolution creature has a leave-substitution replacement effect
 * (e.g. Soul Phoenix, Avatar of Unity: "When this card would leave the battle zone, only the top card leaves the battle zone instead").
 */
export function hasLeaveSubstitution(creature: CreatureInstance): boolean {
  return getCardCapabilities(creature.card).hasLeaveSubstitution;
}

/**
 * Separates the cards underneath an evolution creature back into individual creatures in the battle zone.
 * Official DM-12 ruling: separated creatures preserve original summonedTurn (they never left the BZ,
 * so creatures summoned on earlier turns do NOT regain summoning sickness) and inherit tapped state.
 */
/**
 * Flattens nested evolution sub-stacks into individual flat CardInstance cards
 * (used when an evolution creature leaves the battle zone without a leave-substitution effect).
 */
export function flattenEvolutionStack(cards?: CardInstance[]): CardInstance[] {
  if (!cards || cards.length === 0) return [];
  const flat: CardInstance[] = [];
  for (const item of cards) {
    if (item.evolvedOn && item.evolvedOn.length > 0) {
      flat.push(...flattenEvolutionStack(item.evolvedOn));
    }
    const { evolvedOn: _omit, ...cleanCard } = item;
    flat.push(cleanCard);
  }
  return flat;
}

/**
 * Separates the direct underlying baits of a Phoenix/Vortex creature back into Battle Zone creatures:
 * - Preserves each bait's original `summonedTurn` (no false summoning sickness).
 * - Preserves each bait's own nested `evolvedOn` sub-stack if a bait itself was an Evolution creature!
 */
export function separateEvolutionUnderlyingCreatures(
  creature: CreatureInstance,
  currentTurn: number
): CreatureInstance[] {
  if (!creature.evolvedOn || creature.evolvedOn.length === 0) {
    return [];
  }
  const fallbackTurn =
    typeof creature.summonedTurn === 'number' && creature.summonedTurn < currentTurn
      ? creature.summonedTurn
      : currentTurn - 1;

  return creature.evolvedOn.map((underCard) => ({
    instanceId: underCard.instanceId,
    card: underCard.card,
    owner: underCard.owner || creature.owner,
    isTapped: creature.isTapped,
    summonedTurn:
      typeof underCard.summonedTurn === 'number' ? underCard.summonedTurn : fallbackTurn,
    powerModifier: 0,
    ...(underCard.evolvedOn && underCard.evolvedOn.length > 0
      ? { evolvedOn: underCard.evolvedOn }
      : {})
  }));
}
