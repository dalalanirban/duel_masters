import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  isWaveStriker,
  isWaveStrikerConditionMet,
  getWaveStrikerPowerBonus,
  getWaveStrikerPowerAttackerBonus,
  hasWaveStrikerBlocker,
  getWaveStrikerBreakerCount,
  hasWaveStrikerUntappedAttack,
  isWaveStrikerUnblockable,
  resolveWaveStrikerCIP,
  isTurboRushCard,
  isTurboRushActive,
  getTurboRushPowerBonus,
  getTurboRushPowerAttackerBonus,
  getTurboRushBreakerCount,
  isTurboRushSpeedAttacker,
  hasTurboRushUntappedAttack,
  isTurboRushUnblockable,
  resolveTurboRushOnAttack,
  resolveTurboRushOnUnblocked,
  resolveTurboRushOnBlocked,
  hasSilentSkill,
  canActivateSilentSkill,
  resolveSilentSkill
} from '../advancedMechanics.ts';

import {
  calculateContinuousAuraPower,
  hasCreatureBlocker,
  getCreatureBreakerCount,
  canCreatureAttackUntapped,
  destroyCreature,
  triggerCIP
} from '../effects.ts';

import { isSummoningSick } from '../evolution.ts';
import { CARD_MAP } from '../../data/cardLoader.ts';

function createDummyCreature(id, name, overrides = {}) {
  const baseCard = CARD_MAP.get(id) || {
    id,
    name,
    civilization: 'Fire',
    civilizations: ['Fire'],
    type: 'Creature',
    cost: 3,
    power: 2000,
    rulesText: ''
  };
  const cardDef = {
    ...baseCard,
    ...(overrides.card || {})
  };

  return {
    instanceId: overrides.instanceId || `inst-${id}-${Math.random()}`,
    card: cardDef,
    owner: overrides.owner || 'player',
    isTapped: overrides.isTapped ?? false,
    summonedTurn: overrides.summonedTurn ?? 1,
    powerModifier: overrides.powerModifier ?? 0
  };
}

describe('Duel Masters Engine: Advanced Mechanics (Step 3)', () => {
  describe('1. Wave Striker Engine (DM-10 / DM-11 / DM-12)', () => {
    it('isWaveStrikerConditionMet requires at least 3 Wave Strikers across battlefield', () => {
      const asra = createDummyCreature('DM11-006', 'Asra, Vizier of Safety', {
        card: { rulesText: 'Wave striker (While 2 or more other creatures in the battle zone have "wave striker"...' }
      });
      const merlee = createDummyCreature('DM11-011', 'Merlee, the Oracle', {
        card: { rulesText: 'Wave striker (While 2 or more other creatures in the battle zone have "wave striker"...' }
      });
      const trickster = createDummyCreature('DM11-015', 'Aqua Trickster', {
        card: { rulesText: 'Wave striker (While 2 or more other creatures in the battle zone have "wave striker"...' }
      });
      const vanilla = createDummyCreature('DM01-001', 'Bronze-Arm Tribe', {
        card: { rulesText: '' }
      });

      // 2 Wave Strikers: condition false
      assert.equal(isWaveStrikerConditionMet([[asra, merlee], [vanilla]]), false);

      // 3 Wave Strikers (2 player, 1 opponent): condition true!
      assert.equal(isWaveStrikerConditionMet([[asra, merlee], [trickster]]), true);
    });

    it('Asra gets +4000 power and Blocker when 3+ Wave Strikers are present', () => {
      const asra = createDummyCreature('DM11-006', 'Asra, Vizier of Safety', {
        card: { power: 2500, rulesText: 'Wave striker (While 2 or more other creatures in the battle zone have "wave striker"...' }
      });
      const ws2 = createDummyCreature('DM11-011', 'Merlee, the Oracle', {
        card: { rulesText: 'Wave striker (While 2 or more other creatures in the battle zone have "wave striker"...' }
      });
      const ws3 = createDummyCreature('DM11-015', 'Aqua Trickster', {
        card: { rulesText: 'Wave striker (While 2 or more other creatures in the battle zone have "wave striker"...' }
      });

      const friendlyZone = [asra, ws2, ws3];

      // Blocker check
      assert.equal(hasCreatureBlocker(asra, friendlyZone), true);

      // Power bonus check: +4000 self + 1000 from Merlee = 5000 bonus
      const powerBonus = getWaveStrikerPowerBonus(asra, friendlyZone, []);
      assert.equal(powerBonus, 5000);
    });

    it('Kilstine grants +5000 power, Blocker and Double Breaker to other friendly creatures', () => {
      const kilstine = createDummyCreature('DM12-001', 'Kilstine, Nebula Elemental', {
        card: { rulesText: 'Wave striker (...): Each of your other creatures in battle zone gets +5000 power and has "blocker" and "double breaker".' }
      });
      const ws2 = createDummyCreature('DM11-011', 'Merlee, the Oracle', {
        card: { rulesText: 'Wave striker (...)' }
      });
      const ally = createDummyCreature('DM01-002', 'Immortal Baron, Vorg', {
        card: { power: 2000, rulesText: '' }
      });

      const friendlyZone = [kilstine, ws2, ally];
      const oppZone = [createDummyCreature('DM11-015', 'Aqua Trickster', { card: { rulesText: 'Wave striker' } })];

      // Kilstine grants Blocker and Double Breaker to ally
      assert.equal(hasCreatureBlocker(ally, friendlyZone), true);
      assert.equal(getCreatureBreakerCount(ally, friendlyZone, oppZone), 2);

      // Ally power bonus from Kilstine (+5000) and Merlee (+1000) = 6000
      const powerBonus = getWaveStrikerPowerBonus(ally, friendlyZone, oppZone);
      assert.equal(powerBonus, 6000);
    });

    it('Sapian Tark can attack untapped creatures and Ninja Pumpkin is unblockable by <= 5000', () => {
      const sapian = createDummyCreature('DM11-040', 'Sapian Tark, Flame Dervish', {
        card: { rulesText: 'Wave striker (...): This creature gets +4000 power and can attack untapped creatures.' }
      });
      const pumpkin = createDummyCreature('DM11-045', 'Ninja Pumpkin', {
        card: { rulesText: 'Wave striker (...): This creature gets +4000 power and can\'t be blocked by any creature that has power 5000 or less.' }
      });
      const ws3 = createDummyCreature('DM11-015', 'Aqua Trickster', { card: { rulesText: 'Wave striker' } });

      const friendlyZone = [sapian, pumpkin, ws3];

      assert.equal(hasWaveStrikerUntappedAttack(sapian, friendlyZone, []), true);

      // Ninja pumpkin vs 4000 blocker: unblockable!
      const smallBlocker = createDummyCreature('DM01-003', 'Senatine Jade Tree', { card: { power: 4000 } });
      assert.equal(isWaveStrikerUnblockable(pumpkin, smallBlocker, friendlyZone, []), true);

      // Ninja pumpkin vs 6000 blocker: can be blocked!
      const bigBlocker = createDummyCreature('DM01-004', 'Urth', { card: { power: 6000 } });
      assert.equal(isWaveStrikerUnblockable(pumpkin, bigBlocker, friendlyZone, []), false);
    });

    it('Wave Striker CIP triggers: Aqua Trickster taps opponent creature', () => {
      const trickster = createDummyCreature('DM11-015', 'Aqua Trickster', {
        card: { rulesText: 'Wave striker (...): When you put this creature into the battle zone, choose one of your opponent\'s creatures in the battle zone and tap it.' }
      });
      const ws2 = createDummyCreature('DM11-011', 'Merlee', { card: { rulesText: 'Wave striker' } });
      const ws3 = createDummyCreature('DM11-006', 'Asra', { card: { rulesText: 'Wave striker' } });
      const oppCreature = createDummyCreature('DM01-001', 'Bolshack Dragon', { isTapped: false, owner: 'opponent' });

      const state = {
        turn: 3,
        activePlayer: 'player',
        phase: 'MAIN',
        players: {
          player: {
            deck: [],
            hand: [],
            shields: [],
            manaZone: [],
            battleZone: [trickster, ws2, ws3],
            graveyard: [],
            manaChargedThisTurn: false
          },
          opponent: {
            deck: [],
            hand: [],
            shields: [],
            manaZone: [],
            battleZone: [oppCreature],
            graveyard: [],
            manaChargedThisTurn: false
          }
        },
        combatState: null,
        pendingInteraction: null,
        winner: null,
        actionLog: []
      };

      const nextState = resolveWaveStrikerCIP(state, 'player', trickster, [oppCreature.instanceId]);
      assert.ok(nextState);
      assert.equal(nextState.players.opponent.battleZone[0].isTapped, true);
    });

    it('Revival Soldier returns to hand when destroyed IF Wave Striker active, graveyard otherwise', () => {
      const soldier = createDummyCreature('DM11-020', 'Revival Soldier', {
        card: { rulesText: 'Wave striker (...): When this creature would be destroyed, return it to your hand instead.' }
      });
      const ws2 = createDummyCreature('DM11-011', 'Merlee', { card: { rulesText: 'Wave striker' } });
      const ws3 = createDummyCreature('DM11-006', 'Asra', { card: { rulesText: 'Wave striker' } });

      const activeState = {
        turn: 3,
        activePlayer: 'player',
        phase: 'MAIN',
        players: {
          player: {
            deck: [],
            hand: [],
            shields: [],
            manaZone: [],
            battleZone: [soldier, ws2, ws3],
            graveyard: [],
            manaChargedThisTurn: false
          },
          opponent: {
            deck: [],
            hand: [],
            shields: [],
            manaZone: [],
            battleZone: [],
            graveyard: [],
            manaChargedThisTurn: false
          }
        },
        combatState: null,
        pendingInteraction: null,
        winner: null,
        actionLog: []
      };

      // When destroyed with 3 Wave Strikers: returns to hand!
      const stateAfterDestroy = destroyCreature(activeState, soldier.instanceId);
      assert.equal(stateAfterDestroy.players.player.battleZone.length, 2);
      assert.equal(stateAfterDestroy.players.player.hand.length, 1);
      assert.equal(stateAfterDestroy.players.player.hand[0].card.name, 'Revival Soldier');
      assert.equal(stateAfterDestroy.players.player.graveyard.length, 0);

      // When destroyed with only 1 Wave Striker: goes to graveyard!
      const inactiveState = {
        ...activeState,
        players: {
          ...activeState.players,
          player: {
            ...activeState.players.player,
            battleZone: [soldier]
          }
        }
      };
      const stateAfterInactiveDestroy = destroyCreature(inactiveState, soldier.instanceId);
      assert.equal(stateAfterInactiveDestroy.players.player.hand.length, 0);
      assert.equal(stateAfterInactiveDestroy.players.player.graveyard.length, 1);
    });
  });

  describe('2. Turbo Rush Engine (DM-08)', () => {
    it('isTurboRushActive requires another friendly creature to have broken a shield this turn', () => {
      const senia = createDummyCreature('DM08-053', 'Senia, Orchard Avenger', {
        instanceId: 'senia-1',
        card: { rulesText: 'Turbo rush (If any of your other creatures broke any shields this turn...)' }
      });
      const vorg = createDummyCreature('DM01-002', 'Vorg', { instanceId: 'vorg-1' });

      const stateNoBreaks = {
        players: {
          player: {
            battleZone: [senia, vorg],
            shieldsBrokenThisTurn: []
          }
        }
      };
      assert.equal(isTurboRushActive(stateNoBreaks, 'player', senia), false);

      // Senia itself broke a shield: Turbo Rush NOT active for Senia
      const stateSeniaBroke = {
        players: {
          player: {
            battleZone: [senia, vorg],
            shieldsBrokenThisTurn: ['senia-1']
          }
        }
      };
      assert.equal(isTurboRushActive(stateSeniaBroke, 'player', senia), false);

      // Vorg broke a shield: Turbo Rush ACTIVE for Senia!
      const stateVorgBroke = {
        players: {
          player: {
            battleZone: [senia, vorg],
            shieldsBrokenThisTurn: ['vorg-1']
          }
        }
      };
      assert.equal(isTurboRushActive(stateVorgBroke, 'player', senia), true);
    });

    it('Senia gets +5000 power and Double Breaker when Turbo Rush is active', () => {
      const senia = createDummyCreature('DM08-053', 'Senia, Orchard Avenger', {
        instanceId: 'senia-1',
        card: { power: 4000, rulesText: 'Turbo rush (If any of your other creatures broke any shields this turn...) : This creature gets +5000 power and has "double breaker"' }
      });

      const stateActive = {
        players: {
          player: {
            battleZone: [senia],
            shieldsBrokenThisTurn: ['other-creature-id']
          }
        }
      };

      assert.equal(getTurboRushPowerBonus(stateActive, 'player', senia), 5000);
      assert.equal(getTurboRushBreakerCount(stateActive, 'player', senia), 2);
    });

    it('Magmadragon Jagalzor Turbo Rush grants Speed Attacker to friendly creatures', () => {
      const jagalzor = createDummyCreature('DM08-004', 'Magmadragon Jagalzor', {
        instanceId: 'jag-1',
        card: { rulesText: 'Turbo rush (...) : Each of your creatures in the battle zone has "speed attacker."' }
      });
      const newlySummoned = createDummyCreature('DM01-001', 'Bronze-Arm Tribe', {
        instanceId: 'bat-1',
        summonedTurn: 3
      });

      const stateActive = {
        turn: 3,
        players: {
          player: {
            battleZone: [jagalzor, newlySummoned],
            shieldsBrokenThisTurn: ['other-id']
          }
        }
      };

      assert.equal(isTurboRushSpeedAttacker(stateActive, 'player', newlySummoned), true);
    });

    it('Gigaclaws forces opponent to discard entire hand on attack when Turbo Rush is active', () => {
      const gigaclaws = createDummyCreature('DM08-030', 'Gigaclaws', {
        instanceId: 'giga-1',
        card: { rulesText: 'Turbo rush (...) : Whenever this creature attacks, your opponent discards his hand.' }
      });

      const state = {
        turn: 4,
        activePlayer: 'player',
        phase: 'ATTACK',
        players: {
          player: {
            deck: [],
            hand: [],
            shields: [],
            manaZone: [],
            battleZone: [gigaclaws],
            graveyard: [],
            shieldsBrokenThisTurn: ['ally-id']
          },
          opponent: {
            deck: [],
            hand: [
              { instanceId: 'h1', card: { name: 'Card 1' }, owner: 'opponent' },
              { instanceId: 'h2', card: { name: 'Card 2' }, owner: 'opponent' }
            ],
            shields: [],
            manaZone: [],
            battleZone: [],
            graveyard: []
          }
        },
        actionLog: []
      };

      const nextState = resolveTurboRushOnAttack(state, 'player', gigaclaws);
      assert.equal(nextState.players.opponent.hand.length, 0);
      assert.equal(nextState.players.opponent.graveyard.length, 2);
    });

    it('Carbonite Scarab breaks an opponent shield when blocked', () => {
      const scarab = createDummyCreature('DM08-047', 'Carbonite Scarab', {
        instanceId: 'scarab-1',
        card: { rulesText: 'Turbo rush (...) : Whenever this creature is attacking your opponent and becomes blocked, it breaks one of your opponent\'s shields.' }
      });

      const state = {
        turn: 4,
        activePlayer: 'player',
        phase: 'ATTACK',
        players: {
          player: {
            battleZone: [scarab],
            shieldsBrokenThisTurn: ['ally-id']
          },
          opponent: {
            hand: [],
            shields: [
              { id: 's1', card: { name: 'Shield 1' }, isBroken: false }
            ]
          }
        },
        actionLog: []
      };

      const nextState = resolveTurboRushOnBlocked(state, 'player', scarab);
      assert.equal(nextState.players.opponent.shields.length, 0);
      assert.equal(nextState.players.opponent.hand.length, 1);
    });
  });

  describe('3. Silent Skill Engine (DM-10 / DM-11)', () => {
    it('canActivateSilentSkill requires creature to be tapped with silent skill', () => {
      const milporo = createDummyCreature('DM10-035', 'Milporo', {
        isTapped: false,
        card: { rulesText: 'Silent skill (At the start of each of your turns, if this creature is tapped...): Draw a card.' }
      });

      // Untapped: cannot activate
      assert.equal(canActivateSilentSkill(milporo), false);

      // Tapped: can activate!
      milporo.isTapped = true;
      assert.equal(canActivateSilentSkill(milporo), true);
    });

    it('Milporo draws a card and stays tapped when Silent Skill resolves', () => {
      const milporo = createDummyCreature('DM10-035', 'Milporo', {
        instanceId: 'milp-1',
        isTapped: true,
        card: { rulesText: 'Silent skill (...): Draw a card.' }
      });

      const state = {
        turn: 3,
        activePlayer: 'player',
        phase: 'START_OF_TURN',
        players: {
          player: {
            deck: [{ instanceId: 'd1', card: { name: 'Top Deck' }, owner: 'player' }],
            hand: [],
            shields: [],
            manaZone: [],
            battleZone: [milporo],
            graveyard: []
          },
          opponent: {
            deck: [],
            hand: [],
            shields: [],
            manaZone: [],
            battleZone: [],
            graveyard: []
          }
        },
        winner: null,
        actionLog: []
      };

      const nextState = resolveSilentSkill(state, 'milp-1');
      assert.equal(nextState.players.player.hand.length, 1);
      assert.equal(nextState.players.player.deck.length, 0);
      assert.equal(nextState.players.player.battleZone[0].isTapped, true);
    });

    it('Kejila, the Hidden Horror breaks 2 opponent shields via Silent Skill', () => {
      const kejila = createDummyCreature('DM10-005', 'Kejila, the Hidden Horror', {
        instanceId: 'kejila-1',
        isTapped: true,
        card: { rulesText: 'Silent skill (...): This creature breaks 2 of your opponent\'s shields.' }
      });

      const state = {
        turn: 5,
        activePlayer: 'player',
        phase: 'START_OF_TURN',
        players: {
          player: {
            deck: [],
            hand: [],
            shields: [],
            manaZone: [],
            battleZone: [kejila],
            graveyard: []
          },
          opponent: {
            deck: [],
            hand: [],
            shields: [
              { id: 's1', card: { name: 'S1' }, isBroken: false },
              { id: 's2', card: { name: 'S2' }, isBroken: false },
              { id: 's3', card: { name: 'S3' }, isBroken: false }
            ],
            manaZone: [],
            battleZone: [],
            graveyard: []
          }
        },
        actionLog: []
      };

      const nextState = resolveSilentSkill(state, 'kejila-1');
      assert.equal(nextState.players.opponent.shields.length, 1);
      assert.equal(nextState.players.opponent.hand.length, 2);
    });

    it('Mystic Magician: friendly Silent Skill creatures return to hand when destroyed', () => {
      const mystic = createDummyCreature('DM10-036', 'Mystic Magician', {
        card: { rulesText: 'Your creatures that have "silent skill" are put into the battle zone tapped. Whenever one of your creatures that has "silent skill" would be destroyed, put it into your hand instead.' }
      });
      const milporo = createDummyCreature('DM10-035', 'Milporo', {
        card: { rulesText: 'Silent skill (...): Draw a card.' }
      });

      const state = {
        turn: 4,
        activePlayer: 'player',
        phase: 'MAIN',
        players: {
          player: {
            deck: [],
            hand: [],
            shields: [],
            manaZone: [],
            battleZone: [mystic, milporo],
            graveyard: []
          },
          opponent: {
            deck: [],
            hand: [],
            shields: [],
            manaZone: [],
            battleZone: [],
            graveyard: []
          }
        },
        winner: null,
        actionLog: []
      };

      const nextState = destroyCreature(state, milporo.instanceId);
      assert.equal(nextState.players.player.battleZone.length, 1);
      assert.equal(nextState.players.player.hand.length, 1);
      assert.equal(nextState.players.player.hand[0].card.name, 'Milporo');
      assert.equal(nextState.players.player.graveyard.length, 0);
    });

    it('Burnwisp Lizard grants Speed Attacker to friendly Silent Skill creatures', () => {
      const lizard = createDummyCreature('DM10-064', 'Burnwisp Lizard', {
        card: { rulesText: 'Each of your creatures in the battle zone that has "silent skill" has "speed attacker."' }
      });
      const milporo = createDummyCreature('DM10-035', 'Milporo', {
        summonedTurn: 3,
        card: { rulesText: 'Silent skill (...): Draw a card.' }
      });

      const friendlyZone = [lizard, milporo];
      assert.equal(isSummoningSick(milporo, 3, friendlyZone), false);
    });
  });
});
