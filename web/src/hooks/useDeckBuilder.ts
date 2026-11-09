import { useState, useEffect, useCallback } from 'react';
import { CardDefinition, Deck, DeckItem } from '../types/card';
import { CARD_MAP } from '../data/cardLoader';
import { PRESET_DECKS } from '../data/presets';

const STORAGE_KEY = 'dm_active_deck_v1';

export function useDeckBuilder() {
  const [activeDeck, setActiveDeck] = useState<Deck>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Re-hydrate card definitions from CARD_MAP
        const hydratedItems: DeckItem[] = [];
        for (const it of parsed.items || []) {
          const cardId = it.card?.id || it.cardId;
          const card = CARD_MAP.get(cardId);
          if (card && it.count > 0) {
            hydratedItems.push({ card, count: Math.min(it.count, 4) });
          }
        }
        return {
          id: parsed.id || 'custom-deck-1',
          name: parsed.name || 'Custom Deck',
          items: hydratedItems,
          updatedAt: Date.now()
        };
      }
    } catch (e) {
      console.error('Failed to load deck from localStorage', e);
    }
    // Default to Shobu's Beatdown starter
    return PRESET_DECKS[0];
  });

  // Save to localStorage on change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(activeDeck));
    } catch (e) {
      console.error('Failed to save deck to localStorage', e);
    }
  }, [activeDeck]);

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

  const loadPreset = useCallback((presetId: string) => {
    const preset = PRESET_DECKS.find(p => p.id === presetId);
    if (preset) {
      setActiveDeck(preset);
    }
  }, []);

  const setDeckName = useCallback((name: string) => {
    setActiveDeck(prev => ({ ...prev, name, updatedAt: Date.now() }));
  }, []);

  const totalCards = activeDeck.items.reduce((sum, item) => sum + item.count, 0);

  const getCardCountInDeck = useCallback((cardId: string) => {
    const item = activeDeck.items.find(i => i.card.id === cardId);
    return item ? item.count : 0;
  }, [activeDeck.items]);

  // Deck status: building (<40), legal (=40), over-limit (>40)
  const deckStatus: 'legal' | 'building' | 'over' = totalCards === 40 ? 'legal' : totalCards < 40 ? 'building' : 'over';

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
    totalCards,
    deckStatus,
    addCard,
    removeCard,
    removeAllOfCard,
    clearDeck,
    loadPreset,
    setDeckName,
    getCardCountInDeck,
    exportAsJson,
    exportAsText
  };
}
