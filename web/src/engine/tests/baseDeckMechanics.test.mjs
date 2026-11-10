import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getCreatureEffectivePower,
  canDeclareAttack,
  declareAttack,
  declareBlock,
  resolveCombat,
  hasMandatoryAttackers
} from '../combat.ts';
import { initializeGame, createCardInstance, createShieldInstance } from '../state.ts';
import { passToMainPhase, endTurn } from '../turn.ts';
import {
  castSpell,
  resolveSpellEffect,
  resolveCreatureCIPEffect,
  discardRandomHandCards
} from '../spells.ts';
import { step } from '../reducer.ts';
import { getAiAction } from '../ai.ts';
import { CARD_LIST, getCardById } from '../../data/cardLoader.ts';

function findCard(nameOrId) {
  let card = getCardById(nameOrId);
  if (!card) {
    card = CARD_LIST.find(
      (c) =>
        c.name.toLowerCase() === nameOrId.toLowerCase() ||
        c.id.toLowerCase() === nameOrId.toLowerCase()
    );
  }
  if (!card) throw new Error(`Card not found: ${nameOrId}`);
  return card;
}

function createTestDeck(id, name, card) {
  return {
    id,
    name,
    items: [{ card, count: 40 }],
    updatedAt: Date.now()
  };
}

describe('Duel Masters Engine: Base Deck Mechanics Audit & Fixes', () => {
  const vorg = findCard('Immortal Baron, Vorg'); // Fire 2000
  const senatine = findCard('Senatine Jade Tree'); // Light Blocker 4000
  const candyDrop = findCard('DM01-028'); // Candy Drop (unblockable)
  const kingDepthcon = findCard('DM01-S04'); // King Depthcon (unblockable, double breaker)
  const marineFlower = findCard('DM01-035'); // Marine Flower (can't attack)
  const hunterFish = findCard('DM01-031'); // Hunter Fish (can't attack)
  const laUraGiga = findCard('DM01-009'); // La Ura Giga (can't attack players)
  const emeraldGrass = findCard('DM01-003'); // Emerald Grass (can't attack players)
  const diaNork = findCard('DM01-002'); // Dia Nork (can't attack players)
  const bolshack = findCard('Bolshack Dragon'); // Bolshack Dragon
  const ghostTouch = findCard('DM01-054'); // Ghost Touch
  const maskedHorror = findCard('DM01-058'); // Masked Horror
  const tornadoFlame = findCard('DM01-088'); // Tornado Flame
  const burningPower = findCard('DM01-071'); // Burning Power
  const dimensionGate = findCard('DM01-093'); // Dimension Gate
  const urth = findCard('DM01-S02'); // Urth, Purifying Elemental
  const braidClaw = findCard('DM01-074'); // Deadly Fighter Braid Claw

  function setupTestState(options = {}) {
    const defaultDeck = createTestDeck('deck-1', 'Default', vorg);
    let state = initializeGame(defaultDeck, defaultDeck, 'player', { shuffle: false });
    state = passToMainPhase(state);

    if (options.turn) {
      state = { ...state, turn: options.turn };
    }

    if (options.playerBattleZone) {
      state = {
        ...state,
        players: {
          ...state.players,
          player: {
            ...state.players.player,
            battleZone: options.playerBattleZone
          }
        }
      };
    }

    if (options.opponentBattleZone) {
      state = {
        ...state,
        players: {
          ...state.players,
          opponent: {
            ...state.players.opponent,
            battleZone: options.opponentBattleZone
          }
        }
      };
    }

    if (options.playerGraveyard) {
      state = {
        ...state,
        players: {
          ...state.players,
          player: {
            ...state.players.player,
            graveyard: options.playerGraveyard
          }
        }
      };
    }

    if (options.opponentGraveyard) {
      state = {
        ...state,
        players: {
          ...state.players,
          opponent: {
            ...state.players.opponent,
            graveyard: options.opponentGraveyard
          }
        }
      };
    }

    if (options.playerHand) {
      state = {
        ...state,
        players: {
          ...state.players,
          player: {
            ...state.players.player,
            hand: options.playerHand
          }
        }
      };
    }

    if (options.opponentHand) {
      state = {
        ...state,
        players: {
          ...state.players,
          opponent: {
            ...state.players.opponent,
            hand: options.opponentHand
          }
        }
      };
    }

    if (options.playerDeck) {
      state = {
        ...state,
        players: {
          ...state.players,
          player: {
            ...state.players.player,
            deck: options.playerDeck
          }
        }
      };
    }

    if (options.opponentShields) {
      state = {
        ...state,
        players: {
          ...state.players,
          opponent: {
            ...state.players.opponent,
            shields: options.opponentShields
          }
        }
      };
    }

    return state;
  }

  // 1. Unblockable Creatures
  describe('1. Unblockable Creatures', () => {
    it('Candy Drop bypasses blockers when attacking shield', () => {
      const state = setupTestState({
        turn: 3,
        playerBattleZone: [
          {
            instanceId: 'attacker-candy',
            card: candyDrop,
            owner: 'player',
            isTapped: false,
            summonedTurn: 1,
            powerModifier: 0
          }
        ],
        opponentBattleZone: [
          {
            instanceId: 'blocker-senatine',
            card: senatine,
            owner: 'opponent',
            isTapped: false,
            summonedTurn: 1,
            powerModifier: 0
          }
        ]
      });

      const nextState = declareAttack(state, 'attacker-candy', { type: 'shield', index: 0 });
      // Should bypass block declaration prompt completely
      assert.equal(nextState.pendingInteraction, null);
      assert.notEqual(nextState.combatState?.stage, 'BLOCK');
      // 1 shield broken: opponent shields goes from 5 to 4, hand from 5 to 6
      assert.equal(nextState.players.opponent.shields.length, 4);
      assert.equal(nextState.players.opponent.hand.length, 6);
    });

    it('King Depthcon bypasses blockers and breaks 2 shields', () => {
      const state = setupTestState({
        turn: 4,
        playerBattleZone: [
          {
            instanceId: 'attacker-depthcon',
            card: kingDepthcon,
            owner: 'player',
            isTapped: false,
            summonedTurn: 1,
            powerModifier: 0
          }
        ],
        opponentBattleZone: [
          {
            instanceId: 'blocker-senatine',
            card: senatine,
            owner: 'opponent',
            isTapped: false,
            summonedTurn: 1,
            powerModifier: 0
          }
        ]
      });

      const nextState = declareAttack(state, 'attacker-depthcon', { type: 'shield', index: 0 });
      assert.equal(nextState.pendingInteraction, null);
      assert.notEqual(nextState.combatState?.stage, 'BLOCK');
      // 2 shields broken: opponent shields goes from 5 to 3, hand from 5 to 7
      assert.equal(nextState.players.opponent.shields.length, 3);
      assert.equal(nextState.players.opponent.hand.length, 7);
    });

    it('Normal creature attacking prompts for blocker declaration', () => {
      const state = setupTestState({
        turn: 3,
        playerBattleZone: [
          {
            instanceId: 'attacker-vorg',
            card: vorg,
            owner: 'player',
            isTapped: false,
            summonedTurn: 1,
            powerModifier: 0
          }
        ],
        opponentBattleZone: [
          {
            instanceId: 'blocker-senatine',
            card: senatine,
            owner: 'opponent',
            isTapped: false,
            summonedTurn: 1,
            powerModifier: 0
          }
        ]
      });

      const nextState = declareAttack(state, 'attacker-vorg', { type: 'shield', index: 0 });
      assert.notEqual(nextState.pendingInteraction, null);
      assert.equal(nextState.pendingInteraction.type, 'BLOCK_DECLARATION');
      assert.equal(nextState.combatState.stage, 'BLOCK');
    });
  });

  // 2. Attack Restrictions
  describe('2. Attack Restrictions', () => {
    it("Marine Flower and Hunter Fish cannot attack any targets", () => {
      const state = setupTestState({
        turn: 3,
        playerBattleZone: [
          {
            instanceId: 'marine-flower-1',
            card: marineFlower,
            owner: 'player',
            isTapped: false,
            summonedTurn: 1,
            powerModifier: 0
          },
          {
            instanceId: 'hunter-fish-1',
            card: hunterFish,
            owner: 'player',
            isTapped: false,
            summonedTurn: 1,
            powerModifier: 0
          }
        ],
        opponentBattleZone: [
          {
            instanceId: 'tapped-target',
            card: vorg,
            owner: 'opponent',
            isTapped: true,
            summonedTurn: 1,
            powerModifier: 0
          }
        ]
      });

      // Marine Flower check
      const checkMFShield = canDeclareAttack(state, 'marine-flower-1', { type: 'shield', index: 0 });
      assert.equal(checkMFShield.valid, false);
      assert.match(checkMFShield.reason, /cannot attack/i);

      const checkMFCreature = canDeclareAttack(state, 'marine-flower-1', {
        type: 'creature',
        instanceId: 'tapped-target'
      });
      assert.equal(checkMFCreature.valid, false);

      assert.throws(() => {
        declareAttack(state, 'marine-flower-1', { type: 'shield', index: 0 });
      }, /cannot attack/i);

      // Hunter Fish check
      const checkHFShield = canDeclareAttack(state, 'hunter-fish-1', { type: 'shield', index: 0 });
      assert.equal(checkHFShield.valid, false);
      assert.match(checkHFShield.reason, /cannot attack/i);

      assert.throws(() => {
        declareAttack(state, 'hunter-fish-1', { type: 'shield', index: 0 });
      }, /cannot attack/i);
    });

    it("La Ura Giga, Emerald Grass, and Dia Nork cannot attack players/shields, but can attack tapped creatures", () => {
      const state = setupTestState({
        turn: 3,
        playerBattleZone: [
          {
            instanceId: 'la-ura-1',
            card: laUraGiga,
            owner: 'player',
            isTapped: false,
            summonedTurn: 1,
            powerModifier: 0
          },
          {
            instanceId: 'emerald-1',
            card: emeraldGrass,
            owner: 'player',
            isTapped: false,
            summonedTurn: 1,
            powerModifier: 0
          },
          {
            instanceId: 'dia-nork-1',
            card: diaNork,
            owner: 'player',
            isTapped: false,
            summonedTurn: 1,
            powerModifier: 0
          }
        ],
        opponentBattleZone: [
          {
            instanceId: 'tapped-opp',
            card: candyDrop, // 1000 power
            owner: 'opponent',
            isTapped: true,
            summonedTurn: 1,
            powerModifier: 0
          }
        ]
      });

      // Shield target rejected
      const checkShield = canDeclareAttack(state, 'la-ura-1', { type: 'shield', index: 0 });
      assert.equal(checkShield.valid, false);
      assert.match(checkShield.reason, /cannot attack players/i);

      const checkEmerald = canDeclareAttack(state, 'emerald-1', { type: 'shield', index: 0 });
      assert.equal(checkEmerald.valid, false);

      const checkDiaNork = canDeclareAttack(state, 'dia-nork-1', { type: 'shield', index: 0 });
      assert.equal(checkDiaNork.valid, false);

      // Tapped creature target accepted
      const checkCreature = canDeclareAttack(state, 'la-ura-1', {
        type: 'creature',
        instanceId: 'tapped-opp'
      });
      assert.equal(checkCreature.valid, true);

      // Declare attack on tapped creature works
      const attackState = declareAttack(state, 'la-ura-1', {
        type: 'creature',
        instanceId: 'tapped-opp'
      });
      assert.equal(attackState.players.player.battleZone[0].isTapped, true);
    });

    it("reducer skips ATTACK phase if only 'can't attack' creatures are present", () => {
      const state = setupTestState({
        turn: 3,
        playerBattleZone: [
          {
            instanceId: 'marine-flower-1',
            card: marineFlower,
            owner: 'player',
            isTapped: false,
            summonedTurn: 1,
            powerModifier: 0
          }
        ]
      });

      // PASS_PHASE from MAIN should end turn directly since no eligible attackers exist
      const nextState = step(state, { type: 'PASS_PHASE', player: 'player' });
      assert.equal(nextState.activePlayer, 'opponent');
    });
  });

  // 3. Bolshack Dragon Fire Graveyard Scaling
  describe('3. Bolshack Dragon Fire Graveyard Scaling', () => {
    it('Bolshack Dragon power scales with Fire cards in graveyard when attacking', () => {
      const fireCard1 = createCardInstance(vorg, 'player');
      const fireCard2 = createCardInstance(vorg, 'player');
      const fireCard3 = createCardInstance(vorg, 'player');
      const waterCard = createCardInstance(candyDrop, 'player');

      const state = setupTestState({
        turn: 4,
        playerBattleZone: [
          {
            instanceId: 'bolshack-1',
            card: bolshack,
            owner: 'player',
            isTapped: false,
            summonedTurn: 1,
            powerModifier: 0
          }
        ],
        playerGraveyard: [fireCard1, fireCard2, fireCard3, waterCard]
      });

      const bolshackCreature = state.players.player.battleZone[0];
      const playerState = state.players.player;

      // When not attacking: base 6000
      const powerDefense = getCreatureEffectivePower(bolshackCreature, false, playerState);
      assert.equal(powerDefense, 6000);

      // When attacking: 6000 + 3 * 1000 = 9000
      const powerAttack = getCreatureEffectivePower(bolshackCreature, true, playerState);
      assert.equal(powerAttack, 9000);
    });

    it('Bolshack Dragon uses graveyard buff to destroy high-power blocker in combat', () => {
      const fireCard1 = createCardInstance(vorg, 'player');
      const fireCard2 = createCardInstance(vorg, 'player');
      const fireCard3 = createCardInstance(vorg, 'player');

      // Opponent blocker with 8000 power
      const bigBlockerCard = { ...senatine, power: 8000, name: 'Gigantic Blocker' };

      const state = setupTestState({
        turn: 4,
        playerBattleZone: [
          {
            instanceId: 'bolshack-1',
            card: bolshack,
            owner: 'player',
            isTapped: false,
            summonedTurn: 1,
            powerModifier: 0
          }
        ],
        opponentBattleZone: [
          {
            instanceId: 'opp-blocker',
            card: bigBlockerCard,
            owner: 'opponent',
            isTapped: false,
            summonedTurn: 1,
            powerModifier: 0
          }
        ],
        playerGraveyard: [fireCard1, fireCard2, fireCard3]
      });

      // Declare attack on shield
      const declared = declareAttack(state, 'bolshack-1', { type: 'shield', index: 0 });
      // Opponent blocks with 8000 power blocker
      const resolved = declareBlock(declared, 'opp-blocker');

      // Bolshack has 6000 + 3000 = 9000 power attacking, defeating 8000 power blocker!
      assert.equal(resolved.players.player.battleZone.length, 1);
      assert.equal(resolved.players.opponent.battleZone.length, 0);
      assert.equal(resolved.players.opponent.graveyard.length, 1);
    });
  });

  // 4. Random Hand Discard
  describe('4. Random Hand Discard (Ghost Touch & Masked Horror)', () => {
    it('discardRandomHandCards discards specified count from target hand', () => {
      const cardA = createCardInstance(vorg, 'opponent');
      const cardB = createCardInstance(senatine, 'opponent');
      const state = setupTestState({
        opponentHand: [cardA, cardB]
      });

      const nextState = discardRandomHandCards(state, 'opponent', 1);
      assert.equal(nextState.players.opponent.hand.length, 1);
      assert.equal(nextState.players.opponent.graveyard.length, 1);
    });

    it('Ghost Touch spell discards 1 random opponent hand card', () => {
      const cardA = createCardInstance(vorg, 'opponent');
      const cardB = createCardInstance(senatine, 'opponent');
      const state = setupTestState({
        opponentHand: [cardA, cardB]
      });

      const nextState = resolveSpellEffect(state, 'player', ghostTouch);
      assert.equal(nextState.players.opponent.hand.length, 1);
      assert.equal(nextState.players.opponent.graveyard.length, 1);
    });

    it('Masked Horror CIP effect discards 1 random opponent hand card', () => {
      const cardA = createCardInstance(vorg, 'opponent');
      const state = setupTestState({
        opponentHand: [cardA]
      });

      const maskedCreature = {
        instanceId: 'masked-1',
        card: maskedHorror,
        owner: 'player',
        isTapped: false,
        summonedTurn: 1,
        powerModifier: 0
      };

      const nextState = resolveCreatureCIPEffect(state, 'player', maskedCreature);
      assert.equal(nextState.players.opponent.hand.length, 0);
      assert.equal(nextState.players.opponent.graveyard.length, 1);
    });
  });

  // 5. Tornado Flame
  describe('5. Tornado Flame', () => {
    it('destroys targeted opponent creature with power <= 4000', () => {
      const smallTarget = {
        instanceId: 'small-1',
        card: { ...vorg, power: 4000, name: 'Target 4000' },
        owner: 'opponent',
        isTapped: false,
        summonedTurn: 1,
        powerModifier: 0
      };

      const state = setupTestState({
        opponentBattleZone: [smallTarget]
      });

      const nextState = resolveSpellEffect(state, 'player', tornadoFlame, ['small-1']);
      assert.equal(nextState.players.opponent.battleZone.length, 0);
      assert.equal(nextState.players.opponent.graveyard.length, 1);
    });

    it('throws error when targeting creature with power > 4000', () => {
      const bigTarget = {
        instanceId: 'big-1',
        card: { ...vorg, power: 5000, name: 'Target 5000' },
        owner: 'opponent',
        isTapped: false,
        summonedTurn: 1,
        powerModifier: 0
      };

      const state = setupTestState({
        opponentBattleZone: [bigTarget]
      });

      assert.throws(() => {
        resolveSpellEffect(state, 'player', tornadoFlame, ['big-1']);
      }, /power > 4000/i);
    });

    it('auto-targets valid opponent creature when targets is omitted', () => {
      const bigTarget = {
        instanceId: 'big-1',
        card: { ...vorg, power: 6000, name: 'Target 6000' },
        owner: 'opponent',
        isTapped: false,
        summonedTurn: 1,
        powerModifier: 0
      };
      const smallTarget = {
        instanceId: 'small-1',
        card: { ...vorg, power: 3000, name: 'Target 3000' },
        owner: 'opponent',
        isTapped: false,
        summonedTurn: 1,
        powerModifier: 0
      };

      const state = setupTestState({
        opponentBattleZone: [bigTarget, smallTarget]
      });

      const nextState = resolveSpellEffect(state, 'player', tornadoFlame);
      assert.equal(nextState.players.opponent.battleZone.length, 1);
      assert.equal(nextState.players.opponent.battleZone[0].instanceId, 'big-1');
      assert.equal(nextState.players.opponent.graveyard.length, 1);
    });
  });

  // 6. Burning Power
  describe('6. Burning Power', () => {
    it('gives temporary power attacker +2000 to friendly creature, which resets at end of turn', () => {
      const friendlyVorg = {
        instanceId: 'vorg-1',
        card: vorg, // 2000 base
        owner: 'player',
        isTapped: false,
        summonedTurn: 1,
        powerModifier: 0
      };

      const state = setupTestState({
        playerBattleZone: [friendlyVorg]
      });

      const buffedState = resolveSpellEffect(state, 'player', burningPower, ['vorg-1']);
      const buffedCreature = buffedState.players.player.battleZone[0];
      assert.equal(buffedCreature.tempPowerAttackerBonus, 2000);

      // Not attacking = 2000 power
      assert.equal(getCreatureEffectivePower(buffedCreature, false), 2000);
      // Attacking = 4000 power
      assert.equal(getCreatureEffectivePower(buffedCreature, true), 4000);

      // End turn resets temporary power bonus
      const endedState = endTurn(buffedState);
      const resetCreature = endedState.players.player.battleZone[0];
      assert.equal(resetCreature.tempPowerAttackerBonus, 0);
    });
  });

  // 7. Dimension Gate
  describe('7. Dimension Gate', () => {
    it('searches deck for creature and adds it to hand', () => {
      const bolshackCard = createCardInstance(bolshack, 'player');
      const spellCard = createCardInstance(tornadoFlame, 'player');

      const state = setupTestState({
        playerDeck: [spellCard, bolshackCard],
        playerHand: []
      });

      const nextState = resolveSpellEffect(state, 'player', dimensionGate, [bolshackCard.instanceId]);
      assert.equal(nextState.players.player.hand.length, 1);
      assert.equal(nextState.players.player.hand[0].card.name, 'Bolshack Dragon');
      assert.equal(nextState.players.player.deck.length, 1);
    });

    it('auto-picks creature from deck when no targets specified', () => {
      const vorgCard = createCardInstance(vorg, 'player');
      const bolshackCard = createCardInstance(bolshack, 'player');
      const spellCard = createCardInstance(tornadoFlame, 'player');

      const state = setupTestState({
        playerDeck: [vorgCard, spellCard, bolshackCard],
        playerHand: []
      });

      const nextState = resolveSpellEffect(state, 'player', dimensionGate);
      assert.equal(nextState.players.player.hand.length, 1);
      // Auto-picks highest power creature (Bolshack Dragon)
      assert.equal(nextState.players.player.hand[0].card.name, 'Bolshack Dragon');
      assert.equal(nextState.players.player.deck.length, 2);
    });
  });

  // 8. End-of-Turn Untap for Urth
  describe('8. End-of-Turn Untap for Urth', () => {
    it('Urth, Purifying Elemental automatically untaps at the end of active player turn', () => {
      const urthCreature = {
        instanceId: 'urth-1',
        card: urth,
        owner: 'player',
        isTapped: true, // Tapped during turn
        summonedTurn: 1,
        powerModifier: 0
      };

      const regularCreature = {
        instanceId: 'vorg-1',
        card: vorg,
        owner: 'player',
        isTapped: true, // Also tapped
        summonedTurn: 1,
        powerModifier: 0
      };

      const state = setupTestState({
        playerBattleZone: [urthCreature, regularCreature]
      });

      const nextState = endTurn(state);
      // Urth should be untapped
      const updatedUrth = nextState.players.player.battleZone.find((c) => c.instanceId === 'urth-1');
      assert.equal(updatedUrth.isTapped, false);

      // Regular creature should remain tapped
      const updatedVorg = nextState.players.player.battleZone.find((c) => c.instanceId === 'vorg-1');
      assert.equal(updatedVorg.isTapped, true);

      // Verify log entry
      assert(nextState.actionLog.some((log) => log.includes('Urth, Purifying Elemental untapped at the end of the turn.')));
    });
  });

  // 9. Deadly Fighter Braid Claw Mandatory Attack
  describe('9. Deadly Fighter Braid Claw Mandatory Attack', () => {
    it('identifies mandatory attacker with hasMandatoryAttackers', () => {
      const braidClawCreature = {
        instanceId: 'braid-1',
        card: braidClaw,
        owner: 'player',
        isTapped: false,
        summonedTurn: 1,
        powerModifier: 0
      };

      // Turn 1: summoning sick, cannot attack yet
      const turn1State = setupTestState({
        turn: 1,
        playerBattleZone: [braidClawCreature]
      });
      assert.equal(hasMandatoryAttackers(turn1State, 'player'), false);

      // Turn 2: ready to attack
      const turn2State = setupTestState({
        turn: 2,
        playerBattleZone: [braidClawCreature]
      });
      assert.equal(hasMandatoryAttackers(turn2State, 'player'), true);
    });

    it('reducer intercepts END_TURN to force attack with Braid Claw', () => {
      const braidClawCreature = {
        instanceId: 'braid-1',
        card: braidClaw,
        owner: 'player',
        isTapped: false,
        summonedTurn: 1,
        powerModifier: 0
      };

      const state = setupTestState({
        turn: 2,
        playerBattleZone: [braidClawCreature]
      });

      // Player attempts to end turn without attacking
      const nextState = step(state, { type: 'END_TURN', player: 'player' });

      // Attack should have been declared: creature is now tapped!
      const updatedBraid = nextState.players.player.battleZone[0];
      assert.equal(updatedBraid.isTapped, true);

      // Once tapped, hasMandatoryAttackers is false
      assert.equal(hasMandatoryAttackers(nextState, 'player'), false);

      // Ending turn now successfully advances the turn
      const endedState = step(nextState, { type: 'END_TURN', player: 'player' });
      assert.equal(endedState.activePlayer, 'opponent');
    });

    it('AI prioritizes mandatory attacker Braid Claw during ATTACK phase', () => {
      const braidClawCreature = {
        instanceId: 'braid-1',
        card: braidClaw,
        owner: 'opponent',
        isTapped: false,
        summonedTurn: 1,
        powerModifier: 0
      };

      const state = {
        ...setupTestState({
          turn: 2,
          opponentBattleZone: [braidClawCreature]
        }),
        activePlayer: 'opponent',
        phase: 'ATTACK'
      };

      const action = getAiAction(state, 'opponent');
      assert.notEqual(action, null);
      assert.equal(action.type, 'DECLARE_ATTACK');
      assert.equal(action.attackerInstanceId, 'braid-1');
    });
  });

  // 10. Teleportation Auto-Targeting
  describe('10. Teleportation Auto-Targeting', () => {
    it('Teleportation bounces up to 2 opponent creatures automatically when targets omitted', () => {
      const creatureA = {
        instanceId: 'opp-1',
        card: { ...vorg, power: 2000, name: 'Weak Creature' },
        owner: 'opponent',
        isTapped: false,
        summonedTurn: 1,
        powerModifier: 0
      };
      const creatureB = {
        instanceId: 'opp-2',
        card: { ...vorg, power: 4000, name: 'Medium Creature' },
        owner: 'opponent',
        isTapped: false,
        summonedTurn: 1,
        powerModifier: 0
      };
      const creatureC = {
        instanceId: 'opp-3',
        card: { ...vorg, power: 6000, name: 'Strong Creature' },
        owner: 'opponent',
        isTapped: false,
        summonedTurn: 1,
        powerModifier: 0
      };

      const teleportationCard = findCard('Teleportation');

      const state = setupTestState({
        opponentHand: [],
        opponentBattleZone: [creatureA, creatureB, creatureC]
      });

      const nextState = resolveSpellEffect(state, 'player', teleportationCard);
      // Highest 2 power creatures (opp-3: 6000, opp-2: 4000) should be returned to opponent hand
      assert.equal(nextState.players.opponent.battleZone.length, 1);
      assert.equal(nextState.players.opponent.battleZone[0].instanceId, 'opp-1');
      assert.equal(nextState.players.opponent.hand.length, 2);
    });
  });

  // 11. AI Multi-Breaker Shield Targeting
  describe('11. AI Multi-Breaker Shield Targeting', () => {
    it('AI assigns multiple shield indices when attacking with Double Breaker', () => {
      const depthconCreature = {
        instanceId: 'depthcon-1',
        card: kingDepthcon, // breakerCount: 2
        owner: 'opponent',
        isTapped: false,
        summonedTurn: 1,
        powerModifier: 0
      };

      const state = {
        ...setupTestState({
          turn: 2,
          opponentBattleZone: [depthconCreature]
        }),
        activePlayer: 'opponent',
        phase: 'ATTACK'
      };

      const action = getAiAction(state, 'opponent');
      assert.notEqual(action, null);
      assert.equal(action.type, 'DECLARE_ATTACK');
      assert.equal(action.attackerInstanceId, 'depthcon-1');
      assert.equal(action.target.type, 'shield');
      assert.ok(Array.isArray(action.target.indices), 'target.indices should be an array');
      assert.equal(action.target.indices.length, 2);
      assert.equal(new Set(action.target.indices).size, 2);
    });
  });
});
