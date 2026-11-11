import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseLogTextWithCards,
  buildCardRegex,
  escapeRegExp,
  DEFAULT_CARD_BY_NAME,
  DEFAULT_CARD_REGEX
} from '../../components/duel/duelLogParser.ts';
import { CARD_LIST } from '../../data/cardLoader.ts';

describe('Duel Log Pane & Parser Tests (Task 3)', () => {
  it('escapeRegExp escapes special regex characters', () => {
    assert.equal(escapeRegExp('Bronze-Arm [Tribe] (DM-01).+*?'), 'Bronze-Arm \\[Tribe\\] \\(DM-01\\)\\.\\+\\*\\?');
  });

  it('buildCardRegex creates empty matcher on empty input', () => {
    const emptyRegex = buildCardRegex([]);
    assert.equal(emptyRegex.test('Bronze-Arm Tribe'), false);
  });

  it('initializes default card map and regex from real database', () => {
    assert.ok(DEFAULT_CARD_BY_NAME.size > 800, 'Should load hundreds of cards');
    assert.ok(DEFAULT_CARD_BY_NAME.has('Bronze-Arm Tribe'), 'Should contain Bronze-Arm Tribe');
    assert.ok(DEFAULT_CARD_BY_NAME.has('Aqua Hulcus'), 'Should contain Aqua Hulcus');
    assert.ok(DEFAULT_CARD_BY_NAME.has('Terror Pit'), 'Should contain Terror Pit');
    assert.ok(DEFAULT_CARD_REGEX instanceof RegExp);
  });

  it('parses empty or whitespace-only log text', () => {
    assert.deepEqual(parseLogTextWithCards(''), []);
    assert.deepEqual(parseLogTextWithCards('   '), [{ text: '   ' }]);
  });

  it('parses log messages with no card names', () => {
    const text = 'Turn 1: player skips the draw step.';
    const tokens = parseLogTextWithCards(text);
    assert.equal(tokens.length, 1);
    assert.equal(tokens[0].text, text);
    assert.equal(tokens[0].card, undefined);
  });

  it('detects a single card in a summon message', () => {
    const text = 'player summoned Bronze-Arm Tribe.';
    const tokens = parseLogTextWithCards(text);

    assert.equal(tokens.length, 3);
    assert.equal(tokens[0].text, 'player summoned ');
    assert.equal(tokens[0].card, undefined);

    assert.equal(tokens[1].text, 'Bronze-Arm Tribe');
    assert.ok(tokens[1].card, 'Card definition should be present');
    assert.equal(tokens[1].card.name, 'Bronze-Arm Tribe');

    assert.equal(tokens[2].text, '.');
    assert.equal(tokens[2].card, undefined);
  });

  it('detects card starting at the very beginning of the message', () => {
    const text = 'Bolshack Dragon attacked player.';
    const tokens = parseLogTextWithCards(text);

    assert.equal(tokens.length, 2);
    assert.equal(tokens[0].text, 'Bolshack Dragon');
    assert.equal(tokens[0].card?.name, 'Bolshack Dragon');

    assert.equal(tokens[1].text, ' attacked player.');
    assert.equal(tokens[1].card, undefined);
  });

  it('detects multiple cards in a single action log line', () => {
    const text = 'opponent cast Terror Pit targeting Aqua Hulcus.';
    const tokens = parseLogTextWithCards(text);

    assert.equal(tokens.length, 5);
    assert.equal(tokens[0].text, 'opponent cast ');
    assert.equal(tokens[1].text, 'Terror Pit');
    assert.equal(tokens[1].card?.name, 'Terror Pit');
    assert.equal(tokens[2].text, ' targeting ');
    assert.equal(tokens[3].text, 'Aqua Hulcus');
    assert.equal(tokens[3].card?.name, 'Aqua Hulcus');
    assert.equal(tokens[4].text, '.');
  });

  it('detects cards containing commas and special characters', () => {
    const text = 'player summoned Chilias, the Oracle to the battlefield.';
    const tokens = parseLogTextWithCards(text);

    assert.equal(tokens.length, 3);
    assert.equal(tokens[0].text, 'player summoned ');
    assert.equal(tokens[1].text, 'Chilias, the Oracle');
    assert.equal(tokens[1].card?.name, 'Chilias, the Oracle');
    assert.equal(tokens[2].text, ' to the battlefield.');
  });

  it('detects cards containing Unicode characters like Überdragon', () => {
    const text = 'opponent summoned Überdragon Bajula!';
    const tokens = parseLogTextWithCards(text);

    const bajulaToken = tokens.find((t) => t.text === 'Überdragon Bajula');
    assert.ok(bajulaToken, 'Should match Überdragon Bajula');
    assert.equal(bajulaToken.card?.name, 'Überdragon Bajula');
  });

  it('does not match card names inside larger words due to boundary checking', () => {
    // Fake card map where 'Ray' is a card name
    const mockMap = new Map([
      ['Ray', { id: 'c-ray', name: 'Ray' }]
    ]);

    // 'Array' or 'Xray' contains 'Ray', but boundary check should prevent false positive
    const tokens = parseLogTextWithCards('Array of Xray values', mockMap);
    assert.equal(tokens.length, 1);
    assert.equal(tokens[0].card, undefined);

    // Explicit 'Ray' by itself should match
    const tokens2 = parseLogTextWithCards('player cast Ray.', mockMap);
    assert.equal(tokens2.length, 3);
    assert.equal(tokens2[1].text, 'Ray');
    assert.equal(tokens2[1].card?.name, 'Ray');
  });

  it('prioritizes longer card names over sub-phrase matches', () => {
    const mockMap = new Map([
      ['Dragon', { id: 'c1', name: 'Dragon' }],
      ['Bolshack Dragon', { id: 'c2', name: 'Bolshack Dragon' }]
    ]);

    const tokens = parseLogTextWithCards('player summoned Bolshack Dragon.', mockMap);
    assert.equal(tokens.length, 3);
    assert.equal(tokens[1].text, 'Bolshack Dragon');
    assert.equal(tokens[1].card?.id, 'c2');
  });
});
