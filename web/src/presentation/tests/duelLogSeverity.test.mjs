import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyLogSeverity } from '../../components/duel/duelLogParser.ts';

describe('Duel Log Severity Classification', () => {
  it('classifies routine turn, draw, shuffle, and phase entries as muted', () => {
    assert.equal(classifyLogSeverity('Turn 1: player skips the draw step.'), 'muted');
    assert.equal(classifyLogSeverity('player entered MAIN phase.'), 'muted');
    assert.equal(classifyLogSeverity('opponent ended their turn.'), 'muted');
    assert.equal(classifyLogSeverity('player drew 1 card(s).'), 'muted');
    assert.equal(classifyLogSeverity(''), 'muted');
  });

  it('classifies mana charging and mana zone ramp as mana', () => {
    assert.equal(classifyLogSeverity('player charged Bronze-Arm Tribe to the mana zone.'), 'mana');
    assert.equal(classifyLogSeverity('player undid mana charge and returned card to hand.'), 'mana');
  });

  it('classifies creature summons, evolutions, and spells as summon', () => {
    assert.equal(classifyLogSeverity('player summoned Bolshack Dragon.'), 'summon');
    assert.equal(classifyLogSeverity('opponent evolved Crystal Paladin.'), 'summon');
    assert.equal(classifyLogSeverity('player cast Crimson Hammer.'), 'summon');
  });

  it('classifies attacks, blocks, shield breaks, destruction, and discards as combat', () => {
    assert.equal(classifyLogSeverity('Deadly Fighter Braid Claw declared an attack.'), 'combat');
    assert.equal(classifyLogSeverity('opponent blocked with La Ura Giga, Sky Guardian.'), 'combat');
    assert.equal(classifyLogSeverity('opponent chose not to block.'), 'combat');
    assert.equal(classifyLogSeverity('player broke 1 shield(s).'), 'combat');
    assert.equal(classifyLogSeverity('Immortal Baron, Vorg was destroyed.'), 'combat');
  });

  it('classifies shield triggers, turbo rush, silent skill, and tap abilities as trigger', () => {
    assert.equal(classifyLogSeverity('opponent activated Shield Trigger: Terror Pit!'), 'trigger');
    assert.equal(classifyLogSeverity('Magmadragon Jagalzor Turbo Rush triggered!'), 'trigger');
    assert.equal(classifyLogSeverity('Kejila, the Hidden Horror activated Silent Skill.'), 'trigger');
    assert.equal(classifyLogSeverity('player activated $tap ability of Rikabu\'s Screwdriver.'), 'trigger');
  });

  it('classifies victory, direct win, deck-out, and errors as critical', () => {
    assert.equal(classifyLogSeverity('player won the duel by direct attack!'), 'critical');
    assert.equal(classifyLogSeverity('opponent decked out and lost the game!'), 'critical');
    assert.equal(classifyLogSeverity('Action error (DECLARE_ATTACK): Summoning sickness.'), 'critical');
  });
});
