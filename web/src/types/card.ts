export type Civilization = 'Light' | 'Water' | 'Darkness' | 'Fire' | 'Nature';

export type CardType = 'Creature' | 'Spell' | 'Evolution Creature';

export type Rarity = 'Common' | 'Uncommon' | 'Rare' | 'Very Rare' | 'Super Rare';

export interface CardDefinition {
  id: string;
  name: string;
  set: string;
  collectorNumber: string;
  civilizations: Civilization[];
  type: CardType;
  manaCost: number;
  manaNumber: number;
  power: number | null;
  races: string[];
  isShieldTrigger: boolean;
  isBlocker: boolean;
  isSlayer: boolean;
  isSpeedAttacker: boolean;
  isEvolution?: boolean;
  isSurvivor?: boolean;
  isCharger?: boolean;
  isMultiCiv?: boolean;
  evolutionRaces?: string[];
  powerAttackerBonus: number;
  breakerCount: number;
  rulesText: string;
  flavorText?: string | null;
  rarity: Rarity;
  illustrator?: string | null;
  imageAssetPath: string | null;
  imageUrl?: string;
}

export interface SetDefinition {
  id: string;
  name: string;
  code: string;
  fullName?: string;
  releaseYear?: number;
  cardCount: number;
}

export interface CardFilterOptions {
  searchQuery?: string;
  civilizations?: Civilization[];
  types?: CardType[];
  cardTypes?: CardType[];
  set?: string; // e.g. "DM-01", "DM-02", ... or "all"
  manaCosts?: number[];
  keywords?: string[]; // trigger, blocker, slayer, speed-attacker, evolution, survivor, charger, multi-civ
  isShieldTrigger?: boolean;
  isBlocker?: boolean;
  isSlayer?: boolean;
  isDoubleBreaker?: boolean;
  isPowerAttacker?: boolean;
  minCost?: number;
  maxCost?: number;
  race?: string;
  rarities?: Rarity[];
  sortBy?: 'id-asc' | 'cost-asc' | 'cost-desc' | 'power-desc' | 'name-asc';
}

export interface DeckItem {
  card: CardDefinition;
  count: number;
}

export interface Deck {
  id: string;
  name: string;
  items: DeckItem[];
  updatedAt: number;
}
