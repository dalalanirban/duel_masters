import type { CreatureInstance } from './types.ts';
import type { CardDefinition } from '../types/card.ts';

/**
 * Checks whether an ally creature acts as a Saver for a victim creature:
 * E.g. Kip Chippotto: "When one of your Armored Dragons would be destroyed, you may destroy this creature instead."
 */
export function findSaverInBattleZone(
  battleZone: CreatureInstance[],
  victim: CreatureInstance
): CreatureInstance | null {
  for (const saver of battleZone) {
    if (saver.instanceId === victim.instanceId) continue;
    const rules = saver.card.rulesText || '';
    const nameLower = saver.card.name.toLowerCase();

    // 1. Explicit Saver keyword or regex
    const saverMatch = rules.match(/when(?:ever)? one of your (.+?) would be destroyed, you may destroy this creature instead/i);
    if (saverMatch) {
      const targetSpec = saverMatch[1].toLowerCase().trim();
      const victimRaces = (victim.card.races || [(victim.card as any).race || '']).map((r) => r.toLowerCase());
      const victimCivs = (victim.card.civilizations || [(victim.card as any).civilization || '']).map((c) => c.toLowerCase());

      // Check race matches (e.g. "armored dragons", "dragons", "angel commands")
      const matchesRace = victimRaces.some((r) => {
        const singular = r.replace(/s$/, '');
        return targetSpec.includes(r) || targetSpec.includes(singular);
      });

      // Check civ matches (e.g. "light creatures", "darkness creatures")
      const matchesCiv = victimCivs.some((c) => targetSpec.includes(c));

      // Check general / multicolored
      const isMulti = Boolean(victim.card.isMultiCiv || (victim.card.civilizations && victim.card.civilizations.length > 1));
      const matchesMulti = targetSpec.includes('multicolor') && isMulti;

      if (matchesRace || matchesCiv || matchesMulti || targetSpec === 'creatures') {
        return saver;
      }
    }

    // 2. Iconic cards with Saver by name
    if (nameLower.includes('kip chippotto')) {
      const victimRaces = (victim.card.races || [(victim.card as any).race || '']).map((r) => r.toLowerCase());
      if (victimRaces.some((r) => r.includes('dragon'))) {
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
  const rules = card.rulesText || '';
  const nameLower = card.name.toLowerCase();

  return (
    /would be discarded.*put it into the battle zone instead/i.test(rules) ||
    nameLower.includes('dava torey') ||
    nameLower.includes('sanfist') ||
    nameLower.includes('bingole') ||
    nameLower.includes('arque delacerna')
  );
}

/**
 * Checks whether the attacker has a Shield Burn replacement:
 * E.g. Death Phoenix: "Whenever this creature would break a shield, your opponent puts that shield into his graveyard instead."
 */
export function hasShieldBurnReplacement(attacker: CreatureInstance): boolean {
  const rules = attacker.card.rulesText || '';
  const nameLower = attacker.card.name.toLowerCase();

  return (
    /would break a shield.*puts that shield into his graveyard instead/i.test(rules) ||
    nameLower.includes('death phoenix')
  );
}
