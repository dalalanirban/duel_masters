import { Deck } from '../types/card';
import { CARD_MAP } from './cardLoader';

function createDeck(id: string, name: string, cardCounts: { [cardId: string]: number }): Deck {
  const items = Object.entries(cardCounts)
    .map(([cId, count]) => {
      const card = CARD_MAP.get(cId);
      if (!card) return null;
      return { card, count };
    })
    .filter((item): item is { card: NonNullable<typeof item>['card']; count: number } => item !== null);

  return {
    id,
    name,
    items,
    updatedAt: Date.now()
  };
}

export const PRESET_DECKS: Deck[] = [
  // 1. Shobu's Fire / Nature Beatdown (40 cards)
  createDeck('preset-shobu-beatdown', "Shobu's Fire/Nature Beatdown", {
    'DM01-074': 4, // Deadly Fighter Braid Claw (1 Fire)
    'DM01-080': 4, // Immortal Baron, Vorg (2 Fire)
    'DM01-091': 4, // Burning Mane (2 Nature)
    'DM01-070': 4, // Brawler Zyler (2 Fire)
    'DM01-090': 4, // Bronze-Arm Tribe (3 Nature)
    'DM01-073': 4, // Crimson Hammer (2 Fire Spell)
    'DM01-071': 2, // Burning Power (1 Fire Spell)
    'DM01-093': 2, // Dimension Gate (3 Nature Spell - Shield Trigger)
    'DM01-099': 4, // Natural Snare (6 Nature Spell - Shield Trigger)
    'DM01-088': 4, // Tornado Flame (5 Fire Spell - Shield Trigger)
    'DM01-069': 4, // Bolshack Dragon (6 Fire)
  }),

  // 2. Kokujo's Darkness / Water Control (40 cards)
  createDeck('preset-kokujo-control', "Kokujo's Darkness/Water Control", {
    'DM01-026': 4, // Aqua Vehicle (2 Water)
    'DM01-028': 4, // Candy Drop (3 Water)
    'DM01-023': 4, // Aqua Hulcus (3 Water)
    'DM01-054': 4, // Ghost Touch (2 Darkness Spell - Shield Trigger)
    'DM01-040': 4, // Spiral Gate (2 Water Spell - Shield Trigger)
    'DM01-053': 4, // Death Smoke (4 Darkness Spell)
    'DM01-027': 2, // Brain Serum (4 Water Spell - Shield Trigger)
    'DM01-063': 4, // Terror Pit (6 Darkness Spell - Shield Trigger)
    'DM01-041': 2, // Teleportation (5 Water Spell)
    'DM01-058': 4, // Masked Horror, Shadow of Scorn (5 Darkness)
    'DM01-S05': 2, // Deathliger, Lion of Chaos (7 Darkness Super Rare)
    'DM01-S03': 2, // Aqua Sniper (8 Water Super Rare)
  }),

  // 3. Hakuoh's Light / Water Guardian Stall (40 cards)
  createDeck('preset-hakuoh-stall', "Hakuoh's Light/Water Guardian Stall", {
    'DM01-009': 4, // La Ura Giga, Sky Guardian (1 Light Blocker)
    'DM01-035': 4, // Marine Flower (1 Water Blocker)
    'DM01-003': 4, // Emerald Grass (2 Light Blocker)
    'DM01-031': 4, // Hunter Fish (2 Water Blocker)
    'DM01-023': 4, // Aqua Hulcus (3 Water Draw)
    'DM01-002': 4, // Dia Nork, Moonlight Guardian (4 Light Blocker)
    'DM01-019': 4, // Solar Ray (2 Light Spell - Shield Trigger)
    'DM01-040': 4, // Spiral Gate (2 Water Spell - Shield Trigger)
    'DM01-006': 4, // Holy Awe (6 Light Spell - Shield Trigger)
    'DM01-S02': 2, // Urth, Purifying Elemental (6 Light Super Rare)
    'DM01-S04': 2, // King Depthcon (7 Water Super Rare)
  })
];
