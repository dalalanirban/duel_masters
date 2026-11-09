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
  powerAttackerBonus: number;
  breakerCount: number;
  rulesText: string;
  flavorText: string | null;
  rarity: Rarity;
  illustrator: string | null;
  imageAssetPath: string;
  imageUrl: string;
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
