import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  isDeckLegal,
  createEmptyDeck,
  loadSavedDecks,
  saveDeckToList,
  deleteDeckFromList,
  SAVED_DECKS_STORAGE_KEY,
  ACTIVE_DECK_STORAGE_KEY
} from './deckStorage.ts';

describe('Deck Storage & Validation Utilities', () => {
  describe('isDeckLegal', () => {
    it('returns true when deck has exactly 40 cards', () => {
      assert.equal(isDeckLegal(40), true);
    });

    it('returns false when deck has 39 cards', () => {
      assert.equal(isDeckLegal(39), false);
    });

    it('returns false when deck has 41 cards', () => {
      assert.equal(isDeckLegal(41), false);
    });

    it('returns false for non-40 counts like 0 or negative', () => {
      assert.equal(isDeckLegal(0), false);
      assert.equal(isDeckLegal(-1), false);
      assert.equal(isDeckLegal(20), false);
    });
  });

  describe('createEmptyDeck', () => {
    it('returns a deck with 0 items, specified name, and timestamp', () => {
      const before = Date.now();
      const deck = createEmptyDeck('My Deck');
      const after = Date.now();

      assert.equal(deck.name, 'My Deck');
      assert.deepEqual(deck.items, []);
      assert.ok(typeof deck.id === 'string' && deck.id.length > 0);
      assert.ok(deck.updatedAt >= before && deck.updatedAt <= after);
    });

    it('uses a default name when name is omitted or whitespace', () => {
      const deck1 = createEmptyDeck();
      assert.equal(deck1.name, 'Untitled Deck');

      const deck2 = createEmptyDeck('   ');
      assert.equal(deck2.name, 'Untitled Deck');
    });
  });

  describe('saveDeckToList', () => {
    const dummyCard = {
      id: 'DM01-001',
      name: 'Holy Awe',
      set: 'DM-01',
      collectorNumber: '1',
      civilizations: ['Light'],
      type: 'Spell',
      manaCost: 3,
      manaNumber: 1,
      power: null,
      races: [],
      isShieldTrigger: true,
      isBlocker: false,
      isSlayer: false,
      isSpeedAttacker: false,
      powerAttackerBonus: 0,
      breakerCount: 0,
      rulesText: 'Shield trigger',
      flavorText: null,
      rarity: 'Rare',
      illustrator: null,
      imageAssetPath: '',
      imageUrl: ''
    };

    it('creates a new entry when deck is not in existingDecks', () => {
      const currentDeck = {
        id: 'deck-custom-1',
        name: 'Draft Deck',
        items: [{ card: dummyCard, count: 4 }],
        updatedAt: 1000
      };

      const result = saveDeckToList(currentDeck, 'My New Deck', []);

      assert.equal(result.updatedDeck.name, 'My New Deck');
      assert.equal(result.updatedDeck.id, 'deck-custom-1');
      assert.deepEqual(result.updatedDeck.items, currentDeck.items);
      assert.ok(result.updatedDeck.updatedAt > 1000);
      assert.equal(result.savedDecks.length, 1);
      assert.deepEqual(result.savedDecks[0], result.updatedDeck);
    });

    it('updates existing deck by ID when already in existingDecks', () => {
      const existingDeck = {
        id: 'deck-existing-1',
        name: 'Old Name',
        items: [{ card: dummyCard, count: 2 }],
        updatedAt: 1000
      };
      const otherDeck = {
        id: 'deck-existing-2',
        name: 'Other Deck',
        items: [],
        updatedAt: 2000
      };

      const currentDeck = {
        id: 'deck-existing-1',
        name: 'Old Name',
        items: [{ card: dummyCard, count: 4 }],
        updatedAt: 1000
      };

      const result = saveDeckToList(currentDeck, 'Renamed Deck', [existingDeck, otherDeck]);

      assert.equal(result.updatedDeck.name, 'Renamed Deck');
      assert.equal(result.updatedDeck.id, 'deck-existing-1');
      assert.equal(result.updatedDeck.items[0].count, 4);
      assert.ok(result.updatedDeck.updatedAt > 1000);
      assert.equal(result.savedDecks.length, 2);
      assert.equal(result.savedDecks[0].name, 'Renamed Deck');
      assert.equal(result.savedDecks[1].name, 'Other Deck');
    });

    it('generates a new custom id if currentDeck was a preset deck', () => {
      const presetDeck = {
        id: 'preset-shobu-beatdown',
        name: "Shobu's Beatdown",
        items: [{ card: dummyCard, count: 4 }],
        updatedAt: 1000
      };

      const result = saveDeckToList(presetDeck, 'Shobu Customized', []);
      assert.notEqual(result.updatedDeck.id, 'preset-shobu-beatdown');
      assert.ok(result.updatedDeck.id.startsWith('deck-'));
      assert.equal(result.updatedDeck.name, 'Shobu Customized');
      assert.equal(result.savedDecks.length, 1);
    });
  });

  describe('deleteDeckFromList', () => {
    it('removes the targeted deck ID from existing decks', () => {
      const deck1 = { id: 'deck-1', name: 'Deck 1', items: [], updatedAt: 1 };
      const deck2 = { id: 'deck-2', name: 'Deck 2', items: [], updatedAt: 2 };
      const deck3 = { id: 'deck-3', name: 'Deck 3', items: [], updatedAt: 3 };

      const updated = deleteDeckFromList('deck-2', [deck1, deck2, deck3]);

      assert.equal(updated.length, 2);
      assert.deepEqual(updated, [deck1, deck3]);
    });

    it('returns an identical array when deck ID is not found', () => {
      const deck1 = { id: 'deck-1', name: 'Deck 1', items: [], updatedAt: 1 };
      const updated = deleteDeckFromList('non-existent', [deck1]);
      assert.equal(updated.length, 1);
      assert.deepEqual(updated, [deck1]);
    });
  });

  describe('loadSavedDecks', () => {
    beforeEach(() => {
      if (typeof globalThis.localStorage !== 'undefined') {
        globalThis.localStorage.clear();
      }
    });

    it('returns empty array when localStorage is unavailable or empty', () => {
      const decks = loadSavedDecks();
      assert.deepEqual(decks, []);
    });

    it('returns parsed decks when valid JSON is stored in localStorage', () => {
      const mockDecks = [
        { id: 'deck-1', name: 'Saved Deck 1', items: [], updatedAt: 100 }
      ];

      // Provide temporary mock localStorage on globalThis if not present
      const origLocalStorage = globalThis.localStorage;
      const store = new Map();
      globalThis.localStorage = {
        getItem: (k) => store.get(k) ?? null,
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k),
        clear: () => store.clear()
      };

      try {
        globalThis.localStorage.setItem(SAVED_DECKS_STORAGE_KEY, JSON.stringify(mockDecks));
        const loaded = loadSavedDecks();
        assert.deepEqual(loaded, mockDecks);
      } finally {
        globalThis.localStorage = origLocalStorage;
      }
    });

    it('returns empty array if localStorage content is corrupt JSON', () => {
      const origLocalStorage = globalThis.localStorage;
      const store = new Map();
      globalThis.localStorage = {
        getItem: (k) => store.get(k) ?? null,
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k),
        clear: () => store.clear()
      };

      try {
        globalThis.localStorage.setItem(SAVED_DECKS_STORAGE_KEY, '{invalid-json');
        const loaded = loadSavedDecks();
        assert.deepEqual(loaded, []);
      } finally {
        globalThis.localStorage = origLocalStorage;
      }
    });
  });

  describe('storage keys', () => {
    it('defines expected storage key constants', () => {
      assert.equal(SAVED_DECKS_STORAGE_KEY, 'dm_saved_decks_v1');
      assert.equal(ACTIVE_DECK_STORAGE_KEY, 'dm_active_deck_v1');
    });
  });
});
