import { CardDefinition, Civilization, CardType } from '../types/card';
import rawData from './dm01.json';

export const DM01_CARDS: CardDefinition[] = rawData as CardDefinition[];

export const CARD_MAP = new Map<string, CardDefinition>(
  DM01_CARDS.map(c => [c.id, c])
);

export function getCardById(id: string): CardDefinition | undefined {
  return CARD_MAP.get(id);
}

export interface CardFilterOptions {
  searchQuery?: string;
  civilizations?: Civilization[];
  cardTypes?: CardType[];
  isShieldTrigger?: boolean;
  isBlocker?: boolean;
  isSlayer?: boolean;
  isDoubleBreaker?: boolean;
  isPowerAttacker?: boolean;
  minCost?: number;
  maxCost?: number;
  race?: string;
  sortBy?: 'cost-asc' | 'cost-desc' | 'power-desc' | 'name-asc' | 'id-asc';
}

export function filterCards(options: CardFilterOptions): CardDefinition[] {
  let result = DM01_CARDS.filter(card => {
    // Search query matches name, races, or rulesText
    if (options.searchQuery && options.searchQuery.trim() !== '') {
      const q = options.searchQuery.toLowerCase().trim();
      const nameMatch = card.name.toLowerCase().includes(q);
      const textMatch = card.rulesText.toLowerCase().includes(q);
      const raceMatch = card.races.some(r => r.toLowerCase().includes(q));
      if (!nameMatch && !textMatch && !raceMatch) return false;
    }

    // Civilization filter
    if (options.civilizations && options.civilizations.length > 0) {
      const hasMatchingCiv = card.civilizations.some(c => options.civilizations!.includes(c));
      if (!hasMatchingCiv) return false;
    }

    // Card type filter
    if (options.cardTypes && options.cardTypes.length > 0) {
      if (!options.cardTypes.includes(card.type)) return false;
    }

    // Keyword filters
    if (options.isShieldTrigger && !card.isShieldTrigger) return false;
    if (options.isBlocker && !card.isBlocker) return false;
    if (options.isSlayer && !card.isSlayer) return false;
    if (options.isDoubleBreaker && card.breakerCount < 2) return false;
    if (options.isPowerAttacker && card.powerAttackerBonus <= 0) return false;

    // Cost range
    if (options.minCost !== undefined && card.manaCost < options.minCost) return false;
    if (options.maxCost !== undefined && card.manaCost > options.maxCost) return false;

    // Race
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
