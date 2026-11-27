import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import allCardsData from './all_cards.json' with { type: 'json' };
import setsData from './sets.json' with { type: 'json' };
import {
  buildCardCatalog,
  filterCardList,
  registerCardCatalog,
  getRegisteredCardCatalog,
  getRegisteredCardById,
  clearRegisteredCardCatalogForTest
} from './cardCatalogCore.ts';
import {
  loadCardCatalog,
  resetCardCatalogLoaderForTest
} from './cardCatalogBrowser.ts';

describe('Card Catalog Core & Async Browser Loader', () => {
  beforeEach(() => {
    clearRegisteredCardCatalogForTest();
    resetCardCatalogLoaderForTest();
  });

  afterEach(() => {
    clearRegisteredCardCatalogForTest();
    resetCardCatalogLoaderForTest();
  });

  it('builds indexed catalog and 5 legal 40-card preset decks from raw arrays', () => {
    const catalog = buildCardCatalog(allCardsData, setsData);
    assert.equal(catalog.cardList.length, 900);
    assert.equal(catalog.cardMap.size, 900);
    assert.equal(catalog.cardByNameMap.size > 800, true);
    assert.equal(catalog.sets.length, 12);
    assert.equal(catalog.dm01Cards.length, 120);
    assert.equal(catalog.presetDecks.length, 5);
    for (const deck of catalog.presetDecks) {
      const total = deck.items.reduce((sum, item) => sum + item.count, 0);
      assert.equal(total, 40, `Preset ${deck.name} must total 40 cards`);
    }
  });

  it('registers runtime catalog cleanly and resolves card by ID', () => {
    assert.equal(getRegisteredCardCatalog(), null);
    assert.equal(getRegisteredCardById('DM01-069'), undefined);

    const catalog = registerCardCatalog(buildCardCatalog(allCardsData, setsData));
    assert.equal(getRegisteredCardCatalog(), catalog);
    assert.equal(getRegisteredCardById('DM01-069')?.name, 'Bolshack Dragon');
  });

  it('filters cards identically through pure filterCardList helper', () => {
    const dragons = filterCardList(allCardsData, {
      civilizations: ['Fire'],
      race: 'Armored Dragon'
    });
    assert.ok(dragons.length > 0);
    assert.ok(
      dragons.every(
        (c) => c.civilizations.includes('Fire') && c.races.includes('Armored Dragon')
      )
    );
  });

  it('deduplicates concurrent loadCardCatalog calls and caches resolved catalog in RAM', async () => {
    let importCalls = 0;
    const mockImporter = async () => {
      importCalls += 1;
      return { RAW_CARD_LIST: allCardsData, RAW_SETS: setsData };
    };

    const [first, second] = await Promise.all([
      loadCardCatalog(mockImporter),
      loadCardCatalog(mockImporter)
    ]);

    assert.equal(importCalls, 1);
    assert.equal(first, second);
    assert.equal(first.cardList.length, 900);

    // Subsequent call returns cached instance without invoking importer
    const third = await loadCardCatalog(mockImporter);
    assert.equal(third, first);
    assert.equal(importCalls, 1);
  });

  it('resets in-flight loader on rejection so retries succeed cleanly', async () => {
    let attempt = 0;
    const flakyImporter = async () => {
      attempt += 1;
      if (attempt === 1) {
        throw new Error('Simulated offline chunk failure');
      }
      return { RAW_CARD_LIST: allCardsData, RAW_SETS: setsData };
    };

    await assert.rejects(() => loadCardCatalog(flakyImporter), /Simulated offline chunk failure/);
    assert.equal(getRegisteredCardCatalog(), null);

    const recovered = await loadCardCatalog(flakyImporter);
    assert.equal(attempt, 2);
    assert.equal(recovered.cardList.length, 900);
  });
});
