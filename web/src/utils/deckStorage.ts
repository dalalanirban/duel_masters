import type { Deck } from '../types/card';

export const SAVED_DECKS_STORAGE_KEY = 'dm_saved_decks_v1';
export const ACTIVE_DECK_STORAGE_KEY = 'dm_active_deck_v1';

function generateDeckId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `deck-${crypto.randomUUID()}`;
  }
  return `deck-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Checks whether a deck meets the official tournament legality size (strictly 40 cards).
 */
export function isDeckLegal(totalCards: number): boolean {
  return totalCards === 40;
}

/**
 * Creates a new blank deck with 0 items, a unique ID, and current timestamp.
 */
export function createEmptyDeck(name: string = 'Untitled Deck'): Deck {
  const trimmedName = name.trim();
  return {
    id: generateDeckId(),
    name: trimmedName.length > 0 ? trimmedName : 'Untitled Deck',
    items: [],
    updatedAt: Date.now()
  };
}

/**
 * Safely loads user saved decks from localStorage.
 * Returns empty array if localStorage is unavailable or if stored data is corrupted.
 */
export function loadSavedDecks(): Deck[] {
  if (typeof localStorage === 'undefined') {
    return [];
  }
  try {
    const raw = localStorage.getItem(SAVED_DECKS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch (err) {
    console.error('Failed to load saved decks from localStorage', err);
    return [];
  }
}

/**
 * Pure helper to update or insert a deck into the list of saved decks.
 * If the deck already exists (by ID), it updates that entry.
 * If it does not exist (or has a preset ID), it adds a new entry with a custom ID.
 */
export function saveDeckToList(
  currentDeck: Deck,
  newName: string,
  existingDecks: Deck[]
): { updatedDeck: Deck; savedDecks: Deck[] } {
  const trimmedName = newName.trim() || currentDeck.name.trim() || 'Untitled Deck';
  const existingIndex = existingDecks.findIndex(d => d.id === currentDeck.id);

  if (existingIndex >= 0) {
    const updatedDeck: Deck = {
      ...currentDeck,
      name: trimmedName,
      updatedAt: Date.now()
    };
    const savedDecks = [...existingDecks];
    savedDecks[existingIndex] = updatedDeck;
    return { updatedDeck, savedDecks };
  }

  // If the deck is new or was derived from a preset deck, ensure it has a unique custom ID
  const targetId = currentDeck.id && !currentDeck.id.startsWith('preset-')
    ? currentDeck.id
    : generateDeckId();

  const updatedDeck: Deck = {
    ...currentDeck,
    id: targetId,
    name: trimmedName,
    updatedAt: Date.now()
  };

  return {
    updatedDeck,
    savedDecks: [...existingDecks, updatedDeck]
  };
}

/**
 * Pure helper to remove a deck by its ID from a list of saved decks.
 */
export function deleteDeckFromList(deckId: string, existingDecks: Deck[]): Deck[] {
  return existingDecks.filter(deck => deck.id !== deckId);
}
