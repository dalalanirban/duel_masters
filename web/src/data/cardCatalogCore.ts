import type {
  CardDefinition,
  SetDefinition,
  CardFilterOptions,
  Deck,
  DeckItem
} from '../types/card.ts';
import { PRESET_DECK_RECIPES } from './presetRecipes.ts';

export type { CardDefinition, SetDefinition, CardFilterOptions, Deck };

export interface CardCatalog {
  cardList: CardDefinition[];
  cardMap: Map<string, CardDefinition>;
  cardByNameMap: Map<string, CardDefinition>;
  sets: SetDefinition[];
  allRaces: string[];
  dm01Cards: CardDefinition[];
  presetDecks: Deck[];
}

let registeredCatalog: CardCatalog | null = null;

export function buildCardMap(cards: CardDefinition[]): Map<string, CardDefinition> {
  return new Map<string, CardDefinition>(cards.map(card => [card.id, card]));
}

export function buildCardByNameMap(cards: CardDefinition[]): Map<string, CardDefinition> {
  const map = new Map<string, CardDefinition>();
  for (const card of cards) {
    if (!map.has(card.name)) {
      map.set(card.name, card);
    }
  }
  return map;
}

export function extractAllRaces(cards: CardDefinition[]): string[] {
  return Array.from(
    new Set(
      cards
        .flatMap(c => c.races || [])
        .map(r => r.trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));
}

export function buildPresetDecks(cardMap: Map<string, CardDefinition>): Deck[] {
  const now = Date.now();
  return PRESET_DECK_RECIPES.map(recipe => {
    const items: DeckItem[] = [];
    for (const [cardId, count] of Object.entries(recipe.cardCounts)) {
      const card = cardMap.get(cardId);
      if (card) {
        items.push({ card, count });
      }
    }
    return {
      id: recipe.id,
      name: recipe.name,
      items,
      updatedAt: now
    };
  });
}

export function buildCardCatalog(
  cards: CardDefinition[],
  sets: SetDefinition[]
): CardCatalog {
  const cardMap = buildCardMap(cards);
  const cardByNameMap = buildCardByNameMap(cards);
  const allRaces = extractAllRaces(cards);
  const dm01Cards = cards.filter(c => c.set === 'DM-01');
  const presetDecks = buildPresetDecks(cardMap);

  return {
    cardList: cards,
    cardMap,
    cardByNameMap,
    sets,
    allRaces,
    dm01Cards,
    presetDecks
  };
}

export function registerCardCatalog(catalog: CardCatalog): CardCatalog {
  registeredCatalog = catalog;
  return catalog;
}

export function getRegisteredCardCatalog(): CardCatalog | null {
  return registeredCatalog;
}

export function getRegisteredCardById(id: string): CardDefinition | undefined {
  return registeredCatalog?.cardMap.get(id);
}

export function clearRegisteredCardCatalogForTest(): void {
  registeredCatalog = null;
}

export function filterCardList(
  cards: CardDefinition[],
  options: CardFilterOptions = {}
): CardDefinition[] {
  const result = cards.filter(card => {
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
    if (options.race && options.race.trim() !== '' && options.race.toLowerCase() !== 'all') {
      const targetRace = options.race.toLowerCase().trim();
      if (!card.races || !card.races.some(r => r.toLowerCase() === targetRace)) {
        return false;
      }
    }

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
