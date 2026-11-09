import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CARD_LIST,
  CARD_MAP,
  SETS,
  getCardById,
  filterCards
} from './cardLoader.ts';

describe('Card Loader & Filtering System', () => {
  describe('Dataset Completeness & Integrity', () => {
    it('loads exactly 900 total cards in CARD_LIST', () => {
      assert.equal(CARD_LIST.length, 900);
    });

    it('populates CARD_MAP with all 900 cards accessible by ID', () => {
      assert.equal(CARD_MAP.size, 900);
      const bolshack = getCardById('DM01-069');
      assert.ok(bolshack, 'Bolshack Dragon should be found in CARD_MAP');
      assert.equal(bolshack.name, 'Bolshack Dragon');
      assert.equal(bolshack.set, 'DM-01');

      const deathPhoenix = getCardById('DM12-S04');
      assert.ok(deathPhoenix, 'Death Phoenix should be found in CARD_MAP');
      assert.equal(deathPhoenix.name, 'Death Phoenix, Avatar of Doom');
      assert.equal(deathPhoenix.set, 'DM-12');
    });

    it('contains all 12 sets in SETS metadata with exact expected counts', () => {
      assert.equal(SETS.length, 12);

      const expectedSetCounts = {
        'DM-01': 120,
        'DM-02': 60,
        'DM-03': 60,
        'DM-04': 60,
        'DM-05': 60,
        'DM-06': 120,
        'DM-07': 60,
        'DM-08': 60,
        'DM-09': 60,
        'DM-10': 120,
        'DM-11': 60,
        'DM-12': 60
      };

      for (const setDef of SETS) {
        assert.equal(
          setDef.cardCount,
          expectedSetCounts[setDef.id],
          `Expected ${setDef.id} in SETS to have count ${expectedSetCounts[setDef.id]}`
        );
      }

      // Verify actual counts in CARD_LIST match expected counts
      const countsBySet = {};
      for (const card of CARD_LIST) {
        countsBySet[card.set] = (countsBySet[card.set] || 0) + 1;
      }
      for (const [setId, expectedCount] of Object.entries(expectedSetCounts)) {
        assert.equal(
          countsBySet[setId],
          expectedCount,
          `Expected ${setId} in CARD_LIST to have count ${expectedCount}`
        );
      }
    });
  });

  describe('Set Filtering', () => {
    it('filters cards by set (DM-02 returns exactly 60 cards)', () => {
      const results = filterCards({ set: 'DM-02' });
      assert.equal(results.length, 60);
      assert.ok(results.every(c => c.set === 'DM-02'));
    });

    it('filters cards by set (DM-06 returns exactly 120 cards)', () => {
      const results = filterCards({ set: 'DM-06' });
      assert.equal(results.length, 120);
      assert.ok(results.every(c => c.set === 'DM-06'));
    });

    it('returns all 900 cards when set is "all" or omitted', () => {
      const allResults = filterCards({ set: 'all' });
      assert.equal(allResults.length, 900);

      const defaultResults = filterCards({});
      assert.equal(defaultResults.length, 900);
    });
  });

  describe('Mechanic Keyword Filtering', () => {
    it('filters by keyword "evolution" returning exactly 66 cards', () => {
      const results = filterCards({ keywords: ['evolution'] });
      assert.equal(results.length, 66);
      assert.ok(
        results.every(c => c.isEvolution || c.type === 'Evolution Creature'),
        'All results must be evolution creatures'
      );
    });

    it('filters by keyword "multi-civ" returning exactly 45 cards', () => {
      const results = filterCards({ keywords: ['multi-civ'] });
      assert.equal(results.length, 45);
      assert.ok(
        results.every(c => c.isMultiCiv || c.civilizations.length > 1),
        'All results must be multi-civilization cards'
      );
    });

    it('filters by keyword "charger" returning exactly 15 cards', () => {
      const results = filterCards({ keywords: ['charger'] });
      assert.equal(results.length, 15);
      assert.ok(
        results.every(c => c.isCharger),
        'All results must be charger cards'
      );
    });

    it('filters by keyword "survivor" returning exactly 18 cards', () => {
      const results = filterCards({ keywords: ['survivor'] });
      assert.equal(results.length, 18);
      assert.ok(
        results.every(c => c.isSurvivor),
        'All results must be survivor cards'
      );
    });

    it('filters by keyword "shield-trigger" or "trigger"', () => {
      const triggerResults = filterCards({ keywords: ['trigger'] });
      assert.ok(triggerResults.length > 0);
      assert.ok(triggerResults.every(c => c.isShieldTrigger));

      const shieldTriggerResults = filterCards({ keywords: ['shield-trigger'] });
      assert.equal(shieldTriggerResults.length, triggerResults.length);
    });

    it('filters by keyword "blocker"', () => {
      const results = filterCards({ keywords: ['blocker'] });
      assert.ok(results.length > 0);
      assert.ok(results.every(c => c.isBlocker));
    });

    it('filters by keyword "slayer"', () => {
      const results = filterCards({ keywords: ['slayer'] });
      assert.ok(results.length > 0);
      assert.ok(results.every(c => c.isSlayer));
    });

    it('filters by keyword "speed-attacker"', () => {
      const results = filterCards({ keywords: ['speed-attacker'] });
      assert.ok(results.length > 0);
      assert.ok(results.every(c => c.isSpeedAttacker));
    });
  });

  describe('Multi-filter Combinations', () => {
    it('combines Set DM-10 and keyword "multi-civ" returning 20 cards', () => {
      const results = filterCards({ set: 'DM-10', keywords: ['multi-civ'] });
      assert.equal(results.length, 20);
      assert.ok(results.every(c => c.set === 'DM-10' && (c.isMultiCiv || c.civilizations.length > 1)));
    });

    it('combines Set DM-05 and keyword "survivor" returning 10 cards', () => {
      const results = filterCards({ set: 'DM-05', keywords: ['survivor'] });
      assert.equal(results.length, 10);
      assert.ok(results.every(c => c.set === 'DM-05' && c.isSurvivor));
    });

    it('combines Set DM-07 and keyword "charger" returning 5 cards', () => {
      const results = filterCards({ set: 'DM-07', keywords: ['charger'] });
      assert.equal(results.length, 5);
      assert.ok(results.every(c => c.set === 'DM-07' && c.isCharger));
    });

    it('combines Set DM-02 and keyword "evolution" returning 10 cards', () => {
      const results = filterCards({ set: 'DM-02', keywords: ['evolution'] });
      assert.equal(results.length, 10);
      assert.ok(results.every(c => c.set === 'DM-02' && (c.isEvolution || c.type === 'Evolution Creature')));
    });

    it('combines civilization filter and search query correctly', () => {
      const dragons = filterCards({
        civilizations: ['Fire'],
        searchQuery: 'Dragon'
      });
      assert.ok(dragons.length > 0);
      assert.ok(dragons.every(c => c.civilizations.includes('Fire')));
      assert.ok(
        dragons.every(
          c =>
            c.name.toLowerCase().includes('dragon') ||
            c.rulesText.toLowerCase().includes('dragon') ||
            c.races.some(r => r.toLowerCase().includes('dragon'))
        )
      );
    });

    it('combines card type filter with mana cost filter', () => {
      const highCostSpells = filterCards({
        types: ['Spell'],
        minCost: 7
      });
      assert.ok(highCostSpells.length > 0);
      assert.ok(highCostSpells.every(c => c.type === 'Spell' && c.manaCost >= 7));
    });
  });

  describe('Sorting Options', () => {
    it('sorts by cost-asc and cost-desc', () => {
      const asc = filterCards({ sortBy: 'cost-asc' });
      for (let i = 0; i < asc.length - 1; i++) {
        assert.ok(asc[i].manaCost <= asc[i + 1].manaCost);
      }

      const desc = filterCards({ sortBy: 'cost-desc' });
      for (let i = 0; i < desc.length - 1; i++) {
        assert.ok(desc[i].manaCost >= desc[i + 1].manaCost);
      }
    });

    it('sorts by power-desc', () => {
      const powerDesc = filterCards({ sortBy: 'power-desc' });
      for (let i = 0; i < powerDesc.length - 1; i++) {
        const p1 = powerDesc[i].power ?? -1;
        const p2 = powerDesc[i + 1].power ?? -1;
        assert.ok(p1 >= p2);
      }
    });

    it('sorts by name-asc', () => {
      const nameAsc = filterCards({ sortBy: 'name-asc' });
      for (let i = 0; i < Math.min(nameAsc.length - 1, 50); i++) {
        assert.ok(nameAsc[i].name.localeCompare(nameAsc[i + 1].name) <= 0);
      }
    });

    it('sorts by id-asc as default', () => {
      const idAsc = filterCards({ sortBy: 'id-asc' });
      for (let i = 0; i < Math.min(idAsc.length - 1, 50); i++) {
        assert.ok(idAsc[i].id.localeCompare(idAsc[i + 1].id) <= 0);
      }
    });
  });
});
