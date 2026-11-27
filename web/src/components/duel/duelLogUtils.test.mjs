import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import allCardsData from '../../data/all_cards.json' with { type: 'json' };
import setsData from '../../data/sets.json' with { type: 'json' };
import {
  buildCardCatalog,
  registerCardCatalog,
  clearRegisteredCardCatalogForTest
} from '../../data/cardCatalogCore.ts';
import {
  classifyLogSeverity,
  parseLogTextWithCards
} from './duelLogUtils.ts';

describe('Pure Duel Log Utilities (Zero Static JSON)', () => {
  beforeEach(() => {
    clearRegisteredCardCatalogForTest();
  });

  afterEach(() => {
    clearRegisteredCardCatalogForTest();
  });

  it('returns plain text tokens cleanly before catalog registration', () => {
    const tokens = parseLogTextWithCards('player summoned Bolshack Dragon.');
    assert.deepEqual(tokens, [{ text: 'player summoned Bolshack Dragon.' }]);
  });

  it('resolves card tokens lazily once runtime catalog is registered', () => {
    registerCardCatalog(buildCardCatalog(allCardsData, setsData));
    const tokens = parseLogTextWithCards('player summoned Bolshack Dragon.');
    assert.equal(tokens.length, 3);
    assert.equal(tokens[1].text, 'Bolshack Dragon');
    assert.equal(tokens[1].card?.id, 'DM01-069');
  });

  it('classifies severity tiers accurately without catalog import', () => {
    assert.equal(classifyLogSeverity('player charged Bronze-Arm Tribe to the mana zone.'), 'mana');
    assert.equal(classifyLogSeverity('opponent activated Shield Trigger: Terror Pit!'), 'trigger');
    assert.equal(classifyLogSeverity('player won the duel by direct attack!'), 'critical');
  });
});
