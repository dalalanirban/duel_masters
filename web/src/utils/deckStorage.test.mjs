import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  isDeckLegal,
  LEGAL_DECK_SIZE,
  MAX_COPIES_PER_CANONICAL_NAME,
  getCanonicalCardName,
  validateDeckLegality,
  createEmptyDeck,
  loadSavedDecks,
  saveDeckToList,
  deleteDeckFromList,
  SAVED_DECKS_STORAGE_KEY,
  ACTIVE_DECK_STORAGE_KEY
} from './deckStorage.ts';
import { CARD_LIST } from '../data/cardLoader.ts';

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

  describe('Canonical Card Identity & Cross-Set 4-Copy Legality', () => {
    it('exports expected legality constants and normalizes canonical card names', () => {
      assert.equal(LEGAL_DECK_SIZE, 40);
      assert.equal(MAX_COPIES_PER_CANONICAL_NAME, 4);
      assert.equal(getCanonicalCardName('  Death Smoke '), 'death smoke');
      assert.equal(getCanonicalCardName('SPIRAL GATE'), 'spiral gate');
      assert.equal(getCanonicalCardName(''), '');
    });

    it('rejects 40-card decks that exceed 4 total copies of a reprinted card across multiple sets', () => {
      const deathSmokePrintings = CARD_LIST.filter(
        (c) => getCanonicalCardName(c.name) === 'death smoke'
      );
      assert.ok(deathSmokePrintings.length >= 2, 'Expected multiple set printings of Death Smoke');

      const fillers = CARD_LIST.filter(
        (c) => getCanonicalCardName(c.name) !== 'death smoke'
      ).slice(0, 9);

      // 3 copies from printing A + 2 copies from printing B = 5 Death Smokes + 35 fillers = 40 cards total
      const items = [
        { card: deathSmokePrintings[0], count: 3 },
        { card: deathSmokePrintings[1], count: 2 },
        ...fillers.slice(0, 8).map((c) => ({ card: c, count: 4 })),
        { card: fillers[8], count: 3 }
      ];

      const deck = { id: 'reprint-illegal', name: 'Mixed Printings Over Limit', items, updatedAt: 1 };
      const result = validateDeckLegality(deck);

      assert.equal(result.totalCards, 40);
      assert.equal(result.isLegal, false);
      assert.equal(result.overLimitCards.length, 1);
      assert.deepEqual(result.overLimitCards[0], {
        name: deathSmokePrintings[0].name,
        canonicalName: 'death smoke',
        count: 5,
        limit: 4
      });
    });

    it('permits 40-card decks mixing set printings when canonical copy count stays <= 4', () => {
      const spiralPrintings = CARD_LIST.filter(
        (c) => getCanonicalCardName(c.name) === 'spiral gate'
      );
      assert.ok(spiralPrintings.length >= 2, 'Expected multiple set printings of Spiral Gate');

      const fillers = CARD_LIST.filter(
        (c) => getCanonicalCardName(c.name) !== 'spiral gate'
      ).slice(0, 9);

      // 2 + 2 = 4 Spiral Gates + 9 * 4 = 36 fillers = 40 cards total
      const items = [
        { card: spiralPrintings[0], count: 2 },
        { card: spiralPrintings[1], count: 2 },
        ...fillers.map((c) => ({ card: c, count: 4 }))
      ];

      const deck = { id: 'reprint-legal', name: 'Mixed Printings Legal', items, updatedAt: 1 };
      const result = validateDeckLegality(deck);

      assert.equal(result.totalCards, 40);
      assert.equal(result.isLegal, true);
      assert.deepEqual(result.overLimitCards, []);
    });

    it('supports arena copy-only checks with requiredTotalCards: null while enforcing 4-copy caps', () => {
      const cardA = {
        id: 'DM01-X1',
        name: 'Faerie Life',
        set: 'DM-01',
        civilizations: ['Nature'],
        type: 'Spell',
        manaCost: 2,
        manaNumber: 1,
        races: [],
        rulesText: 'Shield trigger Put top card into mana'
      };
      const cardB = { ...cardA, id: 'DM06-X1', set: 'DM-06', name: '  faerie life ' };

      const legalCasual = {
        id: 'casual-ok',
        name: 'Small Legal',
        items: [
          { card: cardA, count: 2 },
          { card: cardB, count: 2 },
          { card: { ...cardA, id: 'C3', name: 'Card 3' }, count: 4 },
          { card: { ...cardA, id: 'C4', name: 'Card 4' }, count: 3 }
        ],
        updatedAt: 1
      };
      assert.equal(validateDeckLegality(legalCasual, { requiredTotalCards: null }).isLegal, true);

      const illegalCasual = {
        id: 'casual-bad',
        name: 'Small Over Limit',
        items: [
          { card: cardA, count: 3 },
          { card: cardB, count: 2 },
          { card: { ...cardA, id: 'C3', name: 'Card 3' }, count: 4 },
          { card: { ...cardA, id: 'C4', name: 'Card 4' }, count: 2 }
        ],
        updatedAt: 1
      };
      const illegalRes = validateDeckLegality(illegalCasual, { requiredTotalCards: null });
      assert.equal(illegalRes.totalCards, 11);
      assert.equal(illegalRes.isLegal, false);
      assert.equal(illegalRes.overLimitCards.length, 1);
      assert.equal(illegalRes.overLimitCards[0].count, 5);
    });
  });
});
