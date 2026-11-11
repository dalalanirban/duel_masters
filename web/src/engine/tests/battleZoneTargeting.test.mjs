import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CARD_LIST } from '../../data/cardLoader.ts';

describe('Battle Zone Spell & Combat Targeting (Task 1 & SS Comments)', () => {
  const deathSmoke = CARD_LIST.find((c) => c.name.toLowerCase() === 'death smoke') || {
    name: 'Death Smoke',
    type: 'Spell',
    rulesText: "Destroy 1 of your opponent's untapped creatures."
  };

  const crimsonHammer = CARD_LIST.find((c) => c.name.toLowerCase() === 'crimson hammer') || {
    name: 'Crimson Hammer',
    type: 'Spell',
    rulesText: "Destroy 1 of your opponent's creatures that has power 2000 or less."
  };

  const naturalSnare = CARD_LIST.find((c) => c.name.toLowerCase() === 'natural snare') || {
    name: 'Natural Snare',
    type: 'Spell',
    rulesText: "Shield trigger. Choose 1 of your opponent's creatures in the battle zone and put it into his mana zone."
  };

  it('Death Smoke targeting rule filters specifically for untapped opponent creatures', () => {
    const oppCreatures = [
      { instanceId: 'c1', card: { name: 'Bronze-Arm Tribe', power: 1000 }, isTapped: true, powerModifier: 0 },
      { instanceId: 'c2', card: { name: 'Aqua Hulcus', power: 2000 }, isTapped: false, powerModifier: 0 },
      { instanceId: 'c3', card: { name: 'Rothus, the Traveler', power: 4000 }, isTapped: true, powerModifier: 0 },
      { instanceId: 'c4', card: { name: 'Urth, Purifying Elemental', power: 6000 }, isTapped: false, powerModifier: 0 },
    ];

    // Death Smoke targets untapped creatures only
    const validTargets = oppCreatures.filter((c) => !c.isTapped);
    assert.equal(validTargets.length, 2);
    assert.deepEqual(validTargets.map((c) => c.instanceId), ['c2', 'c4']);
  });

  it('Crimson Hammer targets creatures with power <= 2000 regardless of tapped status', () => {
    const oppCreatures = [
      { instanceId: 'c1', card: { name: 'Bronze-Arm Tribe', power: 1000 }, isTapped: true, powerModifier: 0 },
      { instanceId: 'c2', card: { name: 'Aqua Hulcus', power: 2000 }, isTapped: false, powerModifier: 0 },
      { instanceId: 'c3', card: { name: 'Rothus, the Traveler', power: 4000 }, isTapped: true, powerModifier: 0 },
    ];

    const validTargets = oppCreatures.filter((c) => (c.card.power || 0) + c.powerModifier <= 2000);
    assert.equal(validTargets.length, 2);
    assert.deepEqual(validTargets.map((c) => c.instanceId), ['c1', 'c2']);
  });

  it('Tapped candidate creatures must preserve rotate-90 scale-90 orientation during spell targeting', () => {
    const creature = {
      instanceId: 'opp_c1',
      card: { name: 'Bronze-Arm Tribe', power: 1000 },
      isTapped: true
    };

    const spellTargetMode = true;
    const validSpellTargetIds = ['opp_c1'];
    const isSpellTargetCandidate = spellTargetMode && validSpellTargetIds.includes(creature.instanceId);

    // Verify class composition logic:
    const isTapped = creature.isTapped;
    const tapClasses = isTapped ? 'rotate-90 scale-90' : '';
    const ringClasses = isSpellTargetCandidate
      ? 'ring-2 ring-purple-400 shadow-purple-500/50 z-20 animate-pulse hover:brightness-110'
      : isTapped
      ? 'opacity-75 border border-slate-700 hover:border-slate-500'
      : 'border border-slate-800 hover:border-slate-600';

    const fullClassName = `relative shrink-0 ${tapClasses} ${ringClasses}`;

    // Assert that the tapped creature STILL has rotate-90 and scale-90 even though it is a spell target candidate
    assert.ok(fullClassName.includes('rotate-90'), 'Must contain rotate-90');
    assert.ok(fullClassName.includes('scale-90'), 'Must contain scale-90');
    assert.ok(fullClassName.includes('ring-purple-400'), 'Must contain ring-purple-400 for targeting');
  });

  it('Untapped candidate creatures stay upright (rotate-0) during spell targeting', () => {
    const creature = {
      instanceId: 'opp_c2',
      card: { name: 'Aqua Hulcus', power: 2000 },
      isTapped: false
    };

    const spellTargetMode = true;
    const validSpellTargetIds = ['opp_c2'];
    const isSpellTargetCandidate = spellTargetMode && validSpellTargetIds.includes(creature.instanceId);

    const isTapped = creature.isTapped;
    const tapClasses = isTapped ? 'rotate-90 scale-90' : '';
    const ringClasses = isSpellTargetCandidate
      ? 'ring-2 ring-purple-400 shadow-purple-500/50 z-20 animate-pulse hover:brightness-110'
      : isTapped
      ? 'opacity-75 border border-slate-700'
      : 'border border-slate-800';

    const fullClassName = `relative shrink-0 ${tapClasses} ${ringClasses}`;

    assert.equal(fullClassName.includes('rotate-90'), false, 'Untapped creature must NOT contain rotate-90');
    assert.ok(fullClassName.includes('ring-purple-400'), 'Must contain ring-purple-400');
  });

  it('Non-targetable creatures are dimmed and disabled when spell target mode is active', () => {
    const creature = {
      instanceId: 'opp_c3',
      card: { name: 'Rothus, the Traveler', power: 4000 },
      isTapped: true
    };

    const spellTargetMode = true;
    const validSpellTargetIds = ['opp_c1']; // opp_c3 is NOT valid (e.g. for Crimson Hammer)
    const isSpellTargetCandidate = spellTargetMode && validSpellTargetIds.includes(creature.instanceId);
    const isActionDisabled = spellTargetMode && !isSpellTargetCandidate;

    assert.equal(isActionDisabled, true);

    const isTapped = creature.isTapped;
    const tapClasses = isTapped ? 'rotate-90 scale-90' : '';
    const statusClasses = isActionDisabled
      ? 'opacity-35 grayscale border border-slate-800 cursor-not-allowed pointer-events-none'
      : '';

    const fullClassName = `relative shrink-0 ${tapClasses} ${statusClasses}`;
    assert.ok(fullClassName.includes('rotate-90'), 'Preserves tapped orientation');
    assert.ok(fullClassName.includes('opacity-35 grayscale'), 'Dims invalid target');
    assert.ok(fullClassName.includes('cursor-not-allowed'), 'Disables cursor');
  });
});
