import type { CardDefinition, SetDefinition, CardFilterOptions } from '../types/card';
import allCardsData from './all_cards.json' with { type: 'json' };
import setsData from './sets.json' with { type: 'json' };

export type { CardDefinition, SetDefinition, CardFilterOptions };

export const CARD_LIST: CardDefinition[] = allCardsData as unknown as CardDefinition[];

export const SETS: SetDefinition[] = setsData as unknown as SetDefinition[];

export const CARD_MAP = new Map<string, CardDefinition>(
  CARD_LIST.map(card => [card.id, card])
);

export const DM01_CARDS: CardDefinition[] = CARD_LIST.filter(c => c.set === 'DM-01');

export function getCardById(id: string): CardDefinition | undefined {
  return CARD_MAP.get(id);
}

export function filterCards(options: CardFilterOptions = {}): CardDefinition[] {
  let result = CARD_LIST.filter(card => {
    // Search query matches name, races, or rulesText
    if (options.searchQuery && options.searchQuery.trim() !== '') {
      const q = options.searchQuery.toLowerCase().trim();
      const nameMatch = card.name.toLowerCase().includes(q);
      const textMatch = card.rulesText.toLowerCase().includes(q);
      const raceMatch = card.races.some(r => r.toLowerCase().includes(q));
      if (!nameMatch && !textMatch && !raceMatch) return false;
    }

    // Set filter
    if (options.set && options.set.trim() !== '' && options.set.toLowerCase() !== 'all') {
      if (card.set.toLowerCase() !== options.set.toLowerCase()) return false;
    }

    // Civilization filter
    if (options.civilizations && options.civilizations.length > 0) {
      const hasMatchingCiv = card.civilizations.some(c => options.civilizations!.includes(c));
      if (!hasMatchingCiv) return false;
    }

    // Card type filter (supports options.types or legacy options.cardTypes)
    const selectedTypes = options.types || options.cardTypes;
    if (selectedTypes && selectedTypes.length > 0) {
      if (!selectedTypes.includes(card.type)) return false;
    }

    // Keyword filters via array
    if (options.keywords && options.keywords.length > 0) {
      for (const kw of options.keywords) {
        const k = kw.toLowerCase().trim();
        if (k === 'evolution' && !(card.isEvolution || card.type === 'Evolution Creature')) {
          return false;
        }
        if (k === 'survivor' && !card.isSurvivor) {
          return false;
        }
        if (k === 'charger' && !card.isCharger) {
          return false;
        }
        if (k === 'multi-civ' && !(card.isMultiCiv || card.civilizations.length > 1)) {
          return false;
        }
        if ((k === 'trigger' || k === 'shield-trigger') && !card.isShieldTrigger) {
          return false;
        }
        if (k === 'blocker' && !card.isBlocker) {
          return false;
        }
        if (k === 'slayer' && !card.isSlayer) {
          return false;
        }
        if (k === 'speed-attacker' && !card.isSpeedAttacker) {
          return false;
        }
        if (k === 'double-breaker' && card.breakerCount < 2) {
          return false;
        }
        if (k === 'power-attacker' && card.powerAttackerBonus <= 0) {
          return false;
        }
      }
    }

    // Legacy keyword boolean flags
    if (options.isShieldTrigger && !card.isShieldTrigger) return false;
    if (options.isBlocker && !card.isBlocker) return false;
    if (options.isSlayer && !card.isSlayer) return false;
    if (options.isDoubleBreaker && card.breakerCount < 2) return false;
    if (options.isPowerAttacker && card.powerAttackerBonus <= 0) return false;

    // Mana cost list
    if (options.manaCosts && options.manaCosts.length > 0) {
      if (!options.manaCosts.includes(card.manaCost)) return false;
    }

    // Mana cost range
    if (options.minCost !== undefined && card.manaCost < options.minCost) return false;
    if (options.maxCost !== undefined && card.manaCost > options.maxCost) return false;

    // Rarity filter
    if (options.rarities && options.rarities.length > 0) {
      if (!options.rarities.includes(card.rarity)) return false;
    }

    // Race filter
    if (options.race && !card.races.includes(options.race)) return false;

    return true;
  });

  // Sorting
  switch (options.sortBy) {
    case 'cost-asc':
      result.sort((a, b) => a.manaCost - b.manaCost || a.name.localeCompare(b.name));
      break;
    case 'cost-desc':
      result.sort((a, b) => b.manaCost - a.manaCost || a.name.localeCompare(b.name));
      break;
    case 'power-desc':
      result.sort((a, b) => (b.power ?? -1) - (a.power ?? -1) || a.name.localeCompare(b.name));
      break;
    case 'name-asc':
      result.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case 'id-asc':
    default:
      result.sort((a, b) => a.id.localeCompare(b.id));
      break;
  }

  return result;
}
