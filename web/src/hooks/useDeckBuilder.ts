import { useState, useEffect, useCallback } from 'react';
import type { CardDefinition, Deck, DeckItem } from '../types/card';
import { CARD_MAP } from '../data/cardLoader';
import { PRESET_DECKS } from '../data/presets';
import {
  loadSavedDecks,
  saveDeckToList,
  deleteDeckFromList,
  createEmptyDeck,
  isDeckLegal,
  SAVED_DECKS_STORAGE_KEY,
  ACTIVE_DECK_STORAGE_KEY
} from '../utils/deckStorage';

/**
 * Rehydrates a deck object loaded from JSON / localStorage, ensuring that all
 * card definitions are authoritative instances from CARD_MAP and counts are valid.
 */
export function hydrateDeck(
  raw: any,
  fallbackId: string = 'custom-deck-1',
  fallbackName: string = 'Custom Deck'
): Deck {
  if (!raw || typeof raw !== 'object') {
    return createEmptyDeck(fallbackName);
  }

  const hydratedItems: DeckItem[] = [];
  if (Array.isArray(raw.items)) {
    for (const it of raw.items) {
      if (!it) continue;
      const cardId = it.card?.id || it.cardId;
      if (!cardId || typeof cardId !== 'string') continue;
      const card = CARD_MAP.get(cardId);
      if (card && typeof it.count === 'number' && it.count > 0) {
        hydratedItems.push({ card, count: Math.min(it.count, 4) });
      }
    }
  }

  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : fallbackId,
    name: typeof raw.name === 'string' && raw.name ? raw.name : fallbackName,
    items: hydratedItems,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now()
  };
}

export function useDeckBuilder() {
  const [activeDeck, setActiveDeck] = useState<Deck>(() => {
    try {
      if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem(ACTIVE_DECK_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          return hydrateDeck(parsed);
        }
      }
    } catch (e) {
      console.error('Failed to load active deck from localStorage', e);
    }
    // Default to Shobu's Beatdown starter
    return PRESET_DECKS[0];
  });

  const [savedDecks, setSavedDecks] = useState<Deck[]>(() => {
    try {
      const loaded = loadSavedDecks();
      return loaded.map(d => hydrateDeck(d));
    } catch (e) {
      console.error('Failed to load saved decks', e);
      return [];
    }
  });

  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);

  // Sync activeDeck to localStorage on change
  useEffect(() => {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(ACTIVE_DECK_STORAGE_KEY, JSON.stringify(activeDeck));
      }
    } catch (e) {
      console.error('Failed to save active deck to localStorage', e);
    }
  }, [activeDeck]);

  // Sync savedDecks to localStorage on change
  useEffect(() => {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(SAVED_DECKS_STORAGE_KEY, JSON.stringify(savedDecks));
      }
    } catch (e) {
      console.error('Failed to save saved decks to localStorage', e);
    }
  }, [savedDecks]);

  const addCard = useCallback((card: CardDefinition) => {
    setActiveDeck(prev => {
      const existing = prev.items.find(i => i.card.id === card.id);
      if (existing) {
        if (existing.count >= 4) return prev; // max 4 copies
        return {
          ...prev,
          updatedAt: Date.now(),
          items: prev.items.map(i =>
            i.card.id === card.id ? { ...i, count: i.count + 1 } : i
          )
        };
      } else {
        return {
          ...prev,
          updatedAt: Date.now(),
          items: [...prev.items, { card, count: 1 }].sort(
            (a, b) => a.card.manaCost - b.card.manaCost || a.card.name.localeCompare(b.card.name)
          )
        };
      }
    });
  }, []);

  const removeCard = useCallback((card: CardDefinition) => {
    setActiveDeck(prev => {
      const existing = prev.items.find(i => i.card.id === card.id);
      if (!existing) return prev;
      if (existing.count <= 1) {
        return {
          ...prev,
          updatedAt: Date.now(),
          items: prev.items.filter(i => i.card.id !== card.id)
        };
      } else {
        return {
          ...prev,
          updatedAt: Date.now(),
          items: prev.items.map(i =>
            i.card.id === card.id ? { ...i, count: i.count - 1 } : i
          )
        };
      }
    });
  }, []);

  const removeAllOfCard = useCallback((card: CardDefinition) => {
    setActiveDeck(prev => ({
      ...prev,
      updatedAt: Date.now(),
      items: prev.items.filter(i => i.card.id !== card.id)
    }));
  }, []);

  const clearDeck = useCallback(() => {
    setActiveDeck(prev => ({
      ...prev,
      name: 'Untitled Deck',
      items: [],
      updatedAt: Date.now()
    }));
  }, []);

  const createBlankDeck = useCallback(() => {
    const blank = createEmptyDeck('New Custom Deck');
    setActiveDeck(blank);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(ACTIVE_DECK_STORAGE_KEY, JSON.stringify(blank));
      }
    } catch (e) {
      console.error('Failed to persist blank deck to localStorage', e);
    }
  }, []);

  const totalCards = activeDeck.items.reduce((sum, item) => sum + item.count, 0);

  const saveDeck = useCallback(
    (name: string): boolean => {
      if (!isDeckLegal(totalCards)) {
        return false;
      }
      const { updatedDeck, savedDecks: newSavedDecks } = saveDeckToList(
        activeDeck,
        name,
        savedDecks
      );
      setActiveDeck(updatedDeck);
      setSavedDecks(newSavedDecks);
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(SAVED_DECKS_STORAGE_KEY, JSON.stringify(newSavedDecks));
          localStorage.setItem(ACTIVE_DECK_STORAGE_KEY, JSON.stringify(updatedDeck));
        }
      } catch (e) {
        console.error('Failed to persist deck during saveDeck', e);
      }
      return true;
    },
    [totalCards, activeDeck, savedDecks]
  );

  const loadDeck = useCallback(
    (deckId: string) => {
      // Searches savedDecks first, then PRESET_DECKS
      const foundSaved = savedDecks.find(d => d.id === deckId);
      if (foundSaved) {
        setActiveDeck(foundSaved);
        try {
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem(ACTIVE_DECK_STORAGE_KEY, JSON.stringify(foundSaved));
          }
        } catch (e) {
          console.error('Failed to persist activeDeck on loadDeck', e);
        }
        return;
      }

      const foundPreset = PRESET_DECKS.find(p => p.id === deckId);
      if (foundPreset) {
        setActiveDeck(foundPreset);
        try {
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem(ACTIVE_DECK_STORAGE_KEY, JSON.stringify(foundPreset));
          }
        } catch (e) {
          console.error('Failed to persist activeDeck on loadPreset', e);
        }
      }
    },
    [savedDecks]
  );

  const loadPreset = useCallback(
    (presetId: string) => {
      loadDeck(presetId);
    },
    [loadDeck]
  );

  const deleteDeck = useCallback(
    (deckId: string) => {
      const newSavedDecks = deleteDeckFromList(deckId, savedDecks);
      setSavedDecks(newSavedDecks);
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(SAVED_DECKS_STORAGE_KEY, JSON.stringify(newSavedDecks));
        }
      } catch (e) {
        console.error('Failed to persist saved decks on deletion', e);
      }

      if (activeDeck.id === deckId) {
        const fallbackDeck = PRESET_DECKS[0];
        setActiveDeck(fallbackDeck);
        try {
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem(ACTIVE_DECK_STORAGE_KEY, JSON.stringify(fallbackDeck));
          }
        } catch (e) {
          console.error('Failed to persist fallback deck on deletion', e);
        }
      }
    },
    [savedDecks, activeDeck.id]
  );

  const setDeckName = useCallback((name: string) => {
    setActiveDeck(prev => ({ ...prev, name, updatedAt: Date.now() }));
  }, []);

  const getCardCountInDeck = useCallback(
    (cardId: string) => {
      const item = activeDeck.items.find(i => i.card.id === cardId);
      return item ? item.count : 0;
    },
    [activeDeck.items]
  );

  // Deck status: building (<40), legal (=40), over-limit (>40)
  const deckStatus: 'legal' | 'building' | 'over' =
    totalCards === 40 ? 'legal' : totalCards < 40 ? 'building' : 'over';

  // Export JSON or Text
  const exportAsJson = useCallback(() => {
    const exportData = {
      id: activeDeck.id,
      name: activeDeck.name,
      cards: activeDeck.items.map(i => ({
        id: i.card.id,
        name: i.card.name,
        count: i.count
      }))
    };
    return JSON.stringify(exportData, null, 2);
  }, [activeDeck]);

  const exportAsText = useCallback(() => {
    return activeDeck.items
      .map(i => `${i.count}x ${i.card.name} (${i.card.id})`)
      .join('\n');
  }, [activeDeck]);

  return {
    activeDeck,
    savedDecks,
    totalCards,
    deckStatus,
    isSaveModalOpen,
    setIsSaveModalOpen,
    addCard,
    removeCard,
    removeAllOfCard,
    clearDeck,
    createBlankDeck,
    loadDeck,
    loadPreset,
    saveDeck,
    deleteDeck,
    setDeckName,
    getCardCountInDeck,
    exportAsJson,
    exportAsText
  };
}
