import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { CARD_LIST } from '../../data/cardLoader.ts';
import { PRESET_DECKS } from '../../data/presets.ts';
import { initializeGame } from '../state.ts';
import { gameReducer } from '../reducer.ts';
import {
  canPayManaCost,
  findManaCardsToTap,
  chargeMana,
  payManaCost
} from '../mana.ts';
import {
  isEvolutionCreature,
  isVortexEvolution,
  getVortexEvolutionRequirements,
  getEvolutionBaitRequirements,
  isValidEvolutionBait,
  isValidVortexEvolutionBaits,
  findValidVortexBaits,
  summonCreature,
  isSummoningSick
} from '../evolution.ts';
import { destroyCreature, bounceCreature, sendCreatureToManaZone } from '../spells.ts';

const findCard = (id) => {
  const card = CARD_LIST.find((c) => c.id === id);
  if (!card) throw new Error(`Card ${id} not found in CARD_LIST`);
  return card;
};

// Key Cards
const SOUL_PHOENIX = findCard('DM12-005'); // Vortex: Fire Bird + Earth Dragon, Cost 4 (Fire/Nature)
const HYDROOZE = findCard('DM12-017'); // Either: Cyber Lord or Hedrian, Cost 4 (Water/Darkness)
const AGIRA = findCard('DM12-016'); // Either: Gladiator or Earth Eater, Cost 4 (Light/Water)
const PHANTOMACH = findCard('DM12-018'); // Either: Chimera or Armorloid, Cost 5 (Darkness/Fire)
const DEATH_PHOENIX = findCard('DM12-S04'); // Vortex: Zombie Dragon + Fire Bird, Cost 4 (Darkness/Fire)
const CRUEL_NAGA = findCard('DM12-S03'); // Vortex: Merfolk + Chimera, Cost 6 (Water/Darkness)

// Multi-civ cards
const MELNIA = findCard('DM10-099'); // Cost 2 (Water/Darkness)
const GONTA = findCard('DM10-105'); // Cost 2 (Fire/Nature)
const TAGTAPP = findCard('DM10-106'); // Cost 3 (Fire/Nature)

// Baits & Single-civ cards
const COCCO_LUPIA = findCard('DM06-077'); // Fire Bird, Cost 3 (Fire)
const PIPPIE_KUPPIE = findCard('DM04-046'); // Fire Bird, Cost 2 (Fire)
const GAMIRATAR = findCard('DM08-054'); // Earth Dragon, Cost 4 (Nature)
const REGARION = findCard('DM08-055'); // Earth Dragon, Cost 5 (Nature)
const EMERAL = findCard('DM03-014'); // Cyber Lord, Cost 2 (Water)
const CORILE = findCard('DM02-014'); // Cyber Lord, Cost 5 (Water)
const PROPELLER_MUTANT = findCard('DM07-031'); // Hedrian, Cost 2 (Darkness)
const BRONZE_ARM = findCard('DM01-105'); // Beast Folk, Cost 3 (Nature)
const BRAWLER_ZYLER = findCard('DM01-073'); // Human, Cost 2 (Fire)

function createBaseState() {
  return initializeGame(PRESET_DECKS[0], PRESET_DECKS[1], 'player', { shuffle: false });
}

describe('Duel Masters Engine: Dual Civilization Mana Rules', () => {
  it('charging a multi-civ card enters the mana zone tapped', () => {
    let state = createBaseState();
    state = {
      ...state,
      turn: 1,
      phase: 'MANA_CHARGE',
      activePlayer: 'player',
      players: {
        ...state.players,
        player: {
          ...state.players.player,
          hand: [{ instanceId: 'gonta-1', card: GONTA, owner: 'player' }],
          manaZone: [],
          manaChargedThisTurn: false
        }
      }
    };

    const nextState = chargeMana(state, 'player', 'gonta-1');
    assert.equal(nextState.players.player.manaZone.length, 1);
    assert.equal(nextState.players.player.manaZone[0].isTapped, true);
    assert.equal(nextState.players.player.hand.length, 0);
  });

  it('multi-civ cards require distinct tapped cards for each required civilization', () => {
    // Gonta costs 2 (Fire/Nature)
    // Scenario 1: Only 1 Gonta (Fire/Nature) + 1 Water card (Emeral)
    // Tapping Gonta can provide Fire OR Nature, but not both!
    const manaWithWater = [
      { instanceId: 'm-gonta', card: GONTA, isTapped: false },
      { instanceId: 'm-emeral', card: EMERAL, isTapped: false }
    ];
    assert.equal(
      canPayManaCost(manaWithWater, GONTA),
      false,
      'Cannot pay for Fire/Nature with only 1 Fire/Nature card and 1 Water card'
    );
    assert.equal(findManaCardsToTap(manaWithWater, GONTA), null);

    // Scenario 2: 1 Gonta (Fire/Nature) + 1 Nature card (Bronze-Arm)
    // Gonta provides Fire, Bronze-Arm provides Nature
    const manaWithNature = [
      { instanceId: 'm-gonta', card: GONTA, isTapped: false },
      { instanceId: 'm-bat', card: BRONZE_ARM, isTapped: false }
    ];
    assert.equal(
      canPayManaCost(manaWithNature, GONTA),
      true,
      'Can pay for Fire/Nature with 1 Fire/Nature card + 1 Nature card'
    );
    const tapped = findManaCardsToTap(manaWithNature, GONTA);
    assert.deepEqual(tapped, [0, 1]);

    // Scenario 3: 2 Gontas in mana
    // Gonta 1 provides Fire, Gonta 2 provides Nature
    const manaWithTwoGontas = [
      { instanceId: 'm-gonta-1', card: GONTA, isTapped: false },
      { instanceId: 'm-gonta-2', card: GONTA, isTapped: false }
    ];
    assert.equal(
      canPayManaCost(manaWithTwoGontas, GONTA),
      true,
      'Can pay for Fire/Nature with 2 Fire/Nature cards'
    );
    assert.deepEqual(findManaCardsToTap(manaWithTwoGontas, GONTA), [0, 1]);

    // Scenario 4: Tagtapp costs 3 (Fire/Nature)
    // With 1 Gonta (Fire/Nature), 1 Bronze-Arm (Nature), and 1 Emeral (Water)
    const manaForTagtapp = [
      { instanceId: 'm-gonta', card: GONTA, isTapped: false },
      { instanceId: 'm-bat', card: BRONZE_ARM, isTapped: false },
      { instanceId: 'm-emeral', card: EMERAL, isTapped: false }
    ];
    assert.equal(canPayManaCost(manaForTagtapp, TAGTAPP), true);
    assert.equal(findManaCardsToTap(manaForTagtapp, TAGTAPP)?.length, 3);
  });

  it('multi-civ cards entering mana zone via sendCreatureToManaZone enter tapped', () => {
    let state = createBaseState();
    state = {
      ...state,
      turn: 2,
      phase: 'MAIN',
      activePlayer: 'player',
      players: {
        ...state.players,
        opponent: {
          ...state.players.opponent,
          battleZone: [{ instanceId: 'melnia-opp', card: MELNIA, owner: 'opponent', isTapped: false, summonedTurn: 1 }],
          manaZone: []
        }
      }
    };

    const nextState = sendCreatureToManaZone(state, 'melnia-opp');
    assert.equal(nextState.players.opponent.manaZone.length, 1);
    assert.equal(nextState.players.opponent.manaZone[0].card.name, 'Melnia, the Aqua Shadow');
    assert.equal(nextState.players.opponent.manaZone[0].isTapped, true, 'Multi-civ creature must enter mana zone tapped');
  });
});

describe('Duel Masters Engine: Dual Civilization Either/Or Evolution Rules', () => {
  it('correctly extracts either-or bait requirements from rules text', () => {
    const hydroozeReqs = getEvolutionBaitRequirements(HYDROOZE);
    assert.ok(hydroozeReqs.some((r) => r.toLowerCase().includes('cyber lord')));
    assert.ok(hydroozeReqs.some((r) => r.toLowerCase().includes('hedrian')));

    const agiraReqs = getEvolutionBaitRequirements(AGIRA);
    assert.ok(agiraReqs.some((r) => r.toLowerCase().includes('gladiator')));
    assert.ok(agiraReqs.some((r) => r.toLowerCase().includes('earth eater')));
  });

  it('Hydrooze evolves on EITHER a Cyber Lord OR a Hedrian', () => {
    const cyberLordBait = { instanceId: 'b-1', card: EMERAL, owner: 'player', isTapped: false, summonedTurn: 1 };
    const hedrianBait = { instanceId: 'b-2', card: PROPELLER_MUTANT, owner: 'player', isTapped: false, summonedTurn: 1 };
    const invalidBait = { instanceId: 'b-3', card: BRONZE_ARM, owner: 'player', isTapped: false, summonedTurn: 1 };

    assert.equal(isValidEvolutionBait(HYDROOZE, cyberLordBait), true, 'Cyber Lord (Emeral) is valid bait');
    assert.equal(isValidEvolutionBait(HYDROOZE, hedrianBait), true, 'Hedrian (Propeller Mutant) is valid bait');
    assert.equal(isValidEvolutionBait(HYDROOZE, invalidBait), false, 'Beast Folk is not valid bait for Hydrooze');
  });

  it('successfully summons Hydrooze on top of a Hedrian bait and inherits tap state', () => {
    let state = createBaseState();
    state = {
      ...state,
      turn: 3,
      phase: 'MAIN',
      activePlayer: 'player',
      players: {
        ...state.players,
        player: {
          ...state.players.player,
          hand: [{ instanceId: 'hydrooze-hand', card: HYDROOZE, owner: 'player' }],
          battleZone: [{ instanceId: 'hedrian-bz', card: PROPELLER_MUTANT, owner: 'player', isTapped: true, summonedTurn: 1 }],
          manaZone: [
            { instanceId: 'm1', card: EMERAL, isTapped: false }, // Water
            { instanceId: 'm2', card: PROPELLER_MUTANT, isTapped: false }, // Darkness
            { instanceId: 'm3', card: BRONZE_ARM, isTapped: false },
            { instanceId: 'm4', card: BRONZE_ARM, isTapped: false }
          ]
        }
      }
    };

    const nextState = summonCreature(state, 'player', 'hydrooze-hand', 'hedrian-bz');
    assert.equal(nextState.players.player.battleZone.length, 1);
    const summoned = nextState.players.player.battleZone[0];
    assert.equal(summoned.card.name, 'Hydrooze, the Mutant Emperor');
    assert.equal(summoned.isTapped, true, 'Should inherit tapped status from bait creature');
    assert.equal(summoned.evolvedOn?.length, 1);
    assert.equal(summoned.evolvedOn[0].card.name, 'Propeller Mutant');
    assert.equal(isSummoningSick(summoned, 3), false, 'Evolution creatures do not have summoning sickness');
  });
});

describe('Duel Masters Engine: Vortex Evolution Rules (DM-12)', () => {
  it('identifies Vortex Evolution creatures and extracts both required races', () => {
    assert.equal(isVortexEvolution(SOUL_PHOENIX), true);
    assert.equal(isVortexEvolution(DEATH_PHOENIX), true);
    assert.equal(isVortexEvolution(CRUEL_NAGA), true);
    assert.equal(isVortexEvolution(HYDROOZE), false);

    const soulPhoenixReq = getVortexEvolutionRequirements(SOUL_PHOENIX);
    assert.ok(soulPhoenixReq);
    assert.equal(soulPhoenixReq.race1, 'Fire Birds');
    assert.equal(soulPhoenixReq.race2, 'Earth Dragons');
  });

  it('validates that Vortex Evolution requires two distinct creatures of matching races', () => {
    const fireBird = { instanceId: 'fb-1', card: COCCO_LUPIA, owner: 'player', isTapped: false, summonedTurn: 1 };
    const earthDragon = { instanceId: 'ed-1', card: GAMIRATAR, owner: 'player', isTapped: false, summonedTurn: 1 };
    const secondFireBird = { instanceId: 'fb-2', card: PIPPIE_KUPPIE, owner: 'player', isTapped: false, summonedTurn: 1 };

    assert.equal(isValidVortexEvolutionBaits(SOUL_PHOENIX, fireBird, earthDragon), true);
    assert.equal(isValidVortexEvolutionBaits(SOUL_PHOENIX, earthDragon, fireBird), true, 'Order of baits does not matter');
    assert.equal(isValidVortexEvolutionBaits(SOUL_PHOENIX, fireBird, secondFireBird), false, 'Two Fire Birds cannot form Vortex Evolution');
    assert.equal(isValidVortexEvolutionBaits(SOUL_PHOENIX, fireBird, fireBird), false, 'Same creature cannot be used twice');
  });

  it('summons Soul Phoenix onto 2 baits: enters untapped if both untapped', () => {
    let state = createBaseState();
    state = {
      ...state,
      turn: 4,
      phase: 'MAIN',
      activePlayer: 'player',
      players: {
        ...state.players,
        player: {
          ...state.players.player,
          hand: [{ instanceId: 'sp-hand', card: SOUL_PHOENIX, owner: 'player' }],
          battleZone: [
            { instanceId: 'fb-1', card: COCCO_LUPIA, owner: 'player', isTapped: false, summonedTurn: 2 },
            { instanceId: 'ed-1', card: GAMIRATAR, owner: 'player', isTapped: false, summonedTurn: 3 }
          ],
          manaZone: [
            { instanceId: 'm1', card: BRAWLER_ZYLER, isTapped: false }, // Fire
            { instanceId: 'm2', card: BRONZE_ARM, isTapped: false }, // Nature
            { instanceId: 'm3', card: BRONZE_ARM, isTapped: false },
            { instanceId: 'm4', card: BRONZE_ARM, isTapped: false }
          ]
        }
      }
    };

    const nextState = summonCreature(state, 'player', 'sp-hand', ['fb-1', 'ed-1']);
    assert.equal(nextState.players.player.battleZone.length, 1);
    const sp = nextState.players.player.battleZone[0];
    assert.equal(sp.card.name, 'Soul Phoenix, Avatar of Unity');
    assert.equal(sp.isTapped, false, 'Enters untapped because both baits were untapped');
    assert.equal(sp.evolvedOn?.length, 2, 'Holds both underlying bait cards');
    assert.equal(isSummoningSick(sp, 4), false, 'Can attack immediately on summon turn');
  });

  it('summons Soul Phoenix onto 2 baits: enters tapped if EITHER bait was tapped', () => {
    let state = createBaseState();
    state = {
      ...state,
      turn: 4,
      phase: 'MAIN',
      activePlayer: 'player',
      players: {
        ...state.players,
        player: {
          ...state.players.player,
          hand: [{ instanceId: 'sp-hand', card: SOUL_PHOENIX, owner: 'player' }],
          battleZone: [
            { instanceId: 'fb-1', card: COCCO_LUPIA, owner: 'player', isTapped: true, summonedTurn: 2 }, // Tapped!
            { instanceId: 'ed-1', card: GAMIRATAR, owner: 'player', isTapped: false, summonedTurn: 3 }
          ],
          manaZone: [
            { instanceId: 'm1', card: BRAWLER_ZYLER, isTapped: false },
            { instanceId: 'm2', card: BRONZE_ARM, isTapped: false },
            { instanceId: 'm3', card: BRONZE_ARM, isTapped: false },
            { instanceId: 'm4', card: BRONZE_ARM, isTapped: false }
          ]
        }
      }
    };

    const nextState = summonCreature(state, 'player', 'sp-hand', ['fb-1', 'ed-1']);
    const sp = nextState.players.player.battleZone[0];
    assert.equal(sp.isTapped, true, 'Enters tapped because one of the baits was tapped');
  });

  it('findValidVortexBaits finds matching pair in friendly battle zone', () => {
    const bz = [
      { instanceId: 'bat', card: BRONZE_ARM, owner: 'player', isTapped: false, summonedTurn: 1 },
      { instanceId: 'fb', card: COCCO_LUPIA, owner: 'player', isTapped: false, summonedTurn: 1 },
      { instanceId: 'ed', card: GAMIRATAR, owner: 'player', isTapped: false, summonedTurn: 1 }
    ];

    const pair = findValidVortexBaits(SOUL_PHOENIX, bz);
    assert.ok(pair);
    const names = [pair[0].card.name, pair[1].card.name];
    assert.ok(names.includes('Cocco Lupia'));
    assert.ok(names.includes('Terradragon Gamiratar'));
  });
});

describe('Duel Masters Engine: Soul Phoenix Leave-Substitution & Death Phoenix Leave Triggers', () => {
  it('when Soul Phoenix is destroyed, only top card goes to graveyard and underlying baits separate into battle zone', () => {
    let state = createBaseState();
    state = {
      ...state,
      turn: 5,
      phase: 'MAIN',
      activePlayer: 'player',
      players: {
        ...state.players,
        player: {
          ...state.players.player,
          battleZone: [
            {
              instanceId: 'soul-phoenix-instance',
              card: SOUL_PHOENIX,
              owner: 'player',
              isTapped: false,
              summonedTurn: 4,
              evolvedOn: [
                { instanceId: 'cocco-under', card: COCCO_LUPIA, owner: 'player' },
                { instanceId: 'gami-under', card: GAMIRATAR, owner: 'player' }
              ]
            }
          ],
          graveyard: []
        }
      }
    };

    const nextState = destroyCreature(state, 'soul-phoenix-instance');
    // Only Soul Phoenix should be in graveyard
    assert.equal(nextState.players.player.graveyard.length, 1);
    assert.equal(nextState.players.player.graveyard[0].card.name, 'Soul Phoenix, Avatar of Unity');

    // Both underlying baits should be separated back into battle zone as individual creatures
    assert.equal(nextState.players.player.battleZone.length, 2);
    const bzNames = nextState.players.player.battleZone.map((c) => c.card.name);
    assert.ok(bzNames.includes('Cocco Lupia'));
    assert.ok(bzNames.includes('Terradragon Gamiratar'));
  });

  it('when Soul Phoenix is bounced, only top card returns to hand and underlying baits stay in battle zone', () => {
    let state = createBaseState();
    state = {
      ...state,
      turn: 5,
      phase: 'MAIN',
      activePlayer: 'player',
      players: {
        ...state.players,
        player: {
          ...state.players.player,
          battleZone: [
            {
              instanceId: 'soul-phoenix-instance',
              card: SOUL_PHOENIX,
              owner: 'player',
              isTapped: false,
              summonedTurn: 4,
              evolvedOn: [
                { instanceId: 'cocco-under', card: COCCO_LUPIA, owner: 'player' },
                { instanceId: 'gami-under', card: GAMIRATAR, owner: 'player' }
              ]
            }
          ],
          hand: []
        }
      }
    };

    const nextState = bounceCreature(state, 'soul-phoenix-instance');
    assert.equal(nextState.players.player.hand.length, 1);
    assert.equal(nextState.players.player.hand[0].card.name, 'Soul Phoenix, Avatar of Unity');
    assert.equal(nextState.players.player.battleZone.length, 2);
  });

  it('when Death Phoenix leaves the battle zone, opponent discards entire hand', () => {
    let state = createBaseState();
    state = {
      ...state,
      turn: 5,
      phase: 'MAIN',
      activePlayer: 'player',
      players: {
        ...state.players,
        player: {
          ...state.players.player,
          battleZone: [
            {
              instanceId: 'dp-instance',
              card: DEATH_PHOENIX,
              owner: 'player',
              isTapped: false,
              summonedTurn: 4
            }
          ]
        },
        opponent: {
          ...state.players.opponent,
          hand: [
            { instanceId: 'opp-c1', card: EMERAL, owner: 'opponent' },
            { instanceId: 'opp-c2', card: BRONZE_ARM, owner: 'opponent' }
          ],
          graveyard: []
        }
      }
    };

    const nextState = destroyCreature(state, 'dp-instance');
    assert.equal(nextState.players.opponent.hand.length, 0, 'Opponent hand discarded to 0');
    assert.equal(nextState.players.opponent.graveyard.length, 2, 'Opponent cards moved to graveyard');
  });
});
