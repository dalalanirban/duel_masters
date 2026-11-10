import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getCreatureEffectivePower,
  canDeclareAttack,
  declareAttack,
  declareBlock,
  resolveCombat,
  resolveShieldTrigger
} from '../combat.ts';
import { initializeGame, createCardInstance, createShieldInstance } from '../state.ts';
import { passToMainPhase } from '../turn.ts';
import { CARD_LIST } from '../../data/cardLoader.ts';

// Helper to find real cards from the database
function findCard(name) {
  const card = CARD_LIST.find((c) => c.name.toLowerCase() === name.toLowerCase());
  if (!card) throw new Error(`Card not found in cardLoader: ${name}`);
  return card;
}

// Minimal deck builder
function createTestDeck(id, name, card) {
  return {
    id,
    name,
    items: [{ card, count: 40 }],
    updatedAt: Date.now()
  };
}

describe('Duel Masters Engine: Combat & Attack Phase (Task 4)', () => {
  const vorg = findCard('Immortal Baron, Vorg'); // Fire creature, cost 2, power 2000
  const aquaHulcus = findCard('Aqua Hulcus'); // Water creature, cost 3, power 2000
  const valdios = findCard('Armored Blaster Valdios'); // Fire evo, cost 4, power 6000, Double Breaker
  const bombat = findCard('Bombat, General of Speed'); // Fire creature, cost 5, power 3000, Speed Attacker
  const senatine = findCard('Senatine Jade Tree'); // Light creature, cost 3, power 4000, Blocker
  const boneAssassin = findCard('Bone Assassin, the Ripper'); // Darkness creature, cost 4, power 2000, Slayer
  const terrorPit = findCard('Terror Pit'); // Darkness spell, Shield Trigger
  const holyAwe = findCard('Holy Awe'); // Light spell, Shield Trigger
  const faerieLife = findCard('Faerie Life'); // Nature spell, Shield Trigger
  const bolgash = findCard('Bolgash Dragon'); // Fire creature, cost 8, power 4000, Triple Breaker
  const amberGrass = findCard('Amber Grass'); // Light creature, Shield Trigger
  const brawlerZyler = findCard('Brawler Zyler'); // Fire creature, power 1000, Power Attacker +2000

  function setupCombatState(options = {}) {
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

    if (options.opponentShields !== undefined) {
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

  describe('Effective Power Calculation', () => {
    it('computes base power with modifiers and power attacker bonus', () => {
      const zylerInstance = {
        instanceId: 'zyler-1',
        card: brawlerZyler, // base 1000, powerAttackerBonus +2000
        owner: 'player',
        isTapped: false,
        summonedTurn: 1,
        powerModifier: 500
      };

      // When attacking: base (1000) + modifier (500) + bonus (2000) = 3500
      const attackingPower = getCreatureEffectivePower(zylerInstance, true);
      assert.strictEqual(attackingPower, 3500);

      // When defending/not attacking: base (1000) + modifier (500) = 1500
      const defendingPower = getCreatureEffectivePower(zylerInstance, false);
      assert.strictEqual(defendingPower, 1500);
    });
  });

  describe('Attack Eligibility & Declaration', () => {
    it('taps the attacking creature and transitions phase to ATTACK', () => {
      const attacker = {
        instanceId: 'att-1',
        card: vorg,
        owner: 'player',
        isTapped: false,
        summonedTurn: 1,
        powerModifier: 0
      };

      const state = setupCombatState({
        turn: 2, // no summoning sickness
        playerBattleZone: [attacker]
      });

      const nextState = declareAttack(state, 'att-1', { type: 'shield', index: 0 });

      assert.strictEqual(nextState.phase, 'ATTACK');
      const updatedAttacker = nextState.players.player.battleZone.find((c) => c.instanceId === 'att-1');
      assert.strictEqual(updatedAttacker.isTapped, true);
    });

    it('rejects attack if creature has summoning sickness', () => {
      const sickCreature = {
        instanceId: 'sick-1',
        card: vorg,
        owner: 'player',
        isTapped: false,
        summonedTurn: 2, // current turn is 2
        powerModifier: 0
      };

      const state = setupCombatState({
        turn: 2,
        playerBattleZone: [sickCreature]
      });

      const check = canDeclareAttack(state, 'sick-1', { type: 'shield', index: 0 });
      assert.strictEqual(check.valid, false);
      assert.match(check.reason, /sickness/i);

      assert.throws(
        () => declareAttack(state, 'sick-1', { type: 'shield', index: 0 }),
        /sickness/i
      );
    });

    it('allows Speed Attacker to attack on turn summoned', () => {
      const speedCreature = {
        instanceId: 'speed-1',
        card: bombat, // Speed Attacker
        owner: 'player',
        isTapped: false,
        summonedTurn: 2,
        powerModifier: 0
      };

      const state = setupCombatState({
        turn: 2,
        playerBattleZone: [speedCreature]
      });

      const check = canDeclareAttack(state, 'speed-1', { type: 'shield', index: 0 });
      assert.strictEqual(check.valid, true);
    });

    it('allows Evolution creature to attack on turn summoned', () => {
      const evoCreature = {
        instanceId: 'evo-1',
        card: valdios, // Evolution creature
        owner: 'player',
        isTapped: false,
        summonedTurn: 2,
        powerModifier: 0
      };

      const state = setupCombatState({
        turn: 2,
        playerBattleZone: [evoCreature]
      });

      const check = canDeclareAttack(state, 'evo-1', { type: 'shield', index: 0 });
      assert.strictEqual(check.valid, true);
    });

    it('rejects attack if creature is already tapped', () => {
      const tappedCreature = {
        instanceId: 'tapped-1',
        card: vorg,
        owner: 'player',
        isTapped: true,
        summonedTurn: 1,
        powerModifier: 0
      };

      const state = setupCombatState({
        turn: 2,
        playerBattleZone: [tappedCreature]
      });

      const check = canDeclareAttack(state, 'tapped-1', { type: 'shield', index: 0 });
      assert.strictEqual(check.valid, false);
      assert.match(check.reason, /tapped/i);
    });

    it('rejects attacking an untapped opponent creature', () => {
      const attacker = {
        instanceId: 'att-1',
        card: vorg,
        owner: 'player',
        isTapped: false,
        summonedTurn: 1,
        powerModifier: 0
      };
      const defUntapped = {
        instanceId: 'def-1',
        card: aquaHulcus,
        owner: 'opponent',
        isTapped: false, // untapped!
        summonedTurn: 1,
        powerModifier: 0
      };

      const state = setupCombatState({
        turn: 2,
        playerBattleZone: [attacker],
        opponentBattleZone: [defUntapped]
      });

      const check = canDeclareAttack(state, 'att-1', { type: 'creature', instanceId: 'def-1' });
      assert.strictEqual(check.valid, false);
      assert.match(check.reason, /untapped/i);
    });

    it('allows attacking a tapped opponent creature', () => {
      const attacker = {
        instanceId: 'att-1',
        card: vorg,
        owner: 'player',
        isTapped: false,
        summonedTurn: 1,
        powerModifier: 0
      };
      const defTapped = {
        instanceId: 'def-1',
        card: aquaHulcus,
        owner: 'opponent',
        isTapped: true, // tapped!
        summonedTurn: 1,
        powerModifier: 0
      };

      const state = setupCombatState({
        turn: 2,
        playerBattleZone: [attacker],
        opponentBattleZone: [defTapped]
      });

      const check = canDeclareAttack(state, 'att-1', { type: 'creature', instanceId: 'def-1' });
      assert.strictEqual(check.valid, true);
    });

    it('rejects direct attack on player when opponent has shields', () => {
      const attacker = {
        instanceId: 'att-1',
        card: vorg,
        owner: 'player',
        isTapped: false,
        summonedTurn: 1,
        powerModifier: 0
      };

      const state = setupCombatState({
        turn: 2,
        playerBattleZone: [attacker] // opponent has 5 shields by default
      });

      const check = canDeclareAttack(state, 'att-1', { type: 'player' });
      assert.strictEqual(check.valid, false);
      assert.match(check.reason, /shields/i);
    });

    it('allows direct attack on player when opponent has 0 shields', () => {
      const attacker = {
        instanceId: 'att-1',
        card: vorg,
        owner: 'player',
        isTapped: false,
        summonedTurn: 1,
        powerModifier: 0
      };

      const state = setupCombatState({
        turn: 2,
        playerBattleZone: [attacker],
        opponentShields: [] // 0 shields
      });

      const check = canDeclareAttack(state, 'att-1', { type: 'player' });
      assert.strictEqual(check.valid, true);
    });
  });

  describe('Creature vs Creature Battle Resolution', () => {
    it('attacker with higher power destroys defender', () => {
      const attacker = {
        instanceId: 'att-1',
        card: valdios, // 6000 power
        owner: 'player',
        isTapped: false,
        summonedTurn: 1,
        powerModifier: 0
      };
      const defender = {
        instanceId: 'def-1',
        card: vorg, // 2000 power
        owner: 'opponent',
        isTapped: true,
        summonedTurn: 1,
        powerModifier: 0
      };

      const state = setupCombatState({
        turn: 2,
        playerBattleZone: [attacker],
        opponentBattleZone: [defender]
      });

      const nextState = declareAttack(state, 'att-1', { type: 'creature', instanceId: 'def-1' });

      // Defender destroyed to graveyard
      assert.strictEqual(nextState.players.opponent.battleZone.length, 0);
      assert.strictEqual(nextState.players.opponent.graveyard.length, 1);
      assert.strictEqual(nextState.players.opponent.graveyard[0].card.name, vorg.name);

      // Attacker survives in battle zone (tapped)
      assert.strictEqual(nextState.players.player.battleZone.length, 1);
      assert.strictEqual(nextState.players.player.battleZone[0].isTapped, true);
      assert.strictEqual(nextState.players.player.graveyard.length, 0);
    });

    it('defender with higher power destroys attacker', () => {
      const attacker = {
        instanceId: 'att-1',
        card: vorg, // 2000 power
        owner: 'player',
        isTapped: false,
        summonedTurn: 1,
        powerModifier: 0
      };
      const defender = {
        instanceId: 'def-1',
        card: senatine, // 4000 power
        owner: 'opponent',
        isTapped: true,
        summonedTurn: 1,
        powerModifier: 0
      };

      const state = setupCombatState({
        turn: 2,
        playerBattleZone: [attacker],
        opponentBattleZone: [defender]
      });

      const nextState = declareAttack(state, 'att-1', { type: 'creature', instanceId: 'def-1' });

      // Attacker destroyed to graveyard
      assert.strictEqual(nextState.players.player.battleZone.length, 0);
      assert.strictEqual(nextState.players.player.graveyard.length, 1);
      assert.strictEqual(nextState.players.player.graveyard[0].card.name, vorg.name);

      // Defender survives
      assert.strictEqual(nextState.players.opponent.battleZone.length, 1);
    });

    it('equal power tie destroys BOTH creatures', () => {
      const attacker = {
        instanceId: 'att-1',
        card: vorg, // 2000 power
        owner: 'player',
        isTapped: false,
        summonedTurn: 1,
        powerModifier: 0
      };
      const defender = {
        instanceId: 'def-1',
        card: aquaHulcus, // 2000 power
        owner: 'opponent',
        isTapped: true,
        summonedTurn: 1,
        powerModifier: 0
      };

      const state = setupCombatState({
        turn: 2,
        playerBattleZone: [attacker],
        opponentBattleZone: [defender]
      });

      const nextState = declareAttack(state, 'att-1', { type: 'creature', instanceId: 'def-1' });

      // Both destroyed
      assert.strictEqual(nextState.players.player.battleZone.length, 0);
      assert.strictEqual(nextState.players.player.graveyard.length, 1);
      assert.strictEqual(nextState.players.opponent.battleZone.length, 0);
      assert.strictEqual(nextState.players.opponent.graveyard.length, 1);
    });

    it('Slayer destroys opposing higher-power creature when Slayer is destroyed in battle', () => {
      const attacker = {
        instanceId: 'att-1',
        card: valdios, // 6000 power, not slayer
        owner: 'player',
        isTapped: false,
        summonedTurn: 1,
        powerModifier: 0
      };
      const defender = {
        instanceId: 'def-1',
        card: boneAssassin, // 2000 power, Slayer
        owner: 'opponent',
        isTapped: true,
        summonedTurn: 1,
        powerModifier: 0
      };

      const state = setupCombatState({
        turn: 2,
        playerBattleZone: [attacker],
        opponentBattleZone: [defender]
      });

      const nextState = declareAttack(state, 'att-1', { type: 'creature', instanceId: 'def-1' });

      // Bone Assassin destroyed by battle, but its Slayer ALSO destroys Valdios!
      assert.strictEqual(nextState.players.opponent.battleZone.length, 0);
      assert.strictEqual(nextState.players.opponent.graveyard.length, 1);
      assert.strictEqual(nextState.players.player.battleZone.length, 0);
      assert.strictEqual(nextState.players.player.graveyard.length, 1);
      assert.strictEqual(nextState.players.player.graveyard[0].card.name, valdios.name);
    });

    it('Evolution creature destroyed in battle moves all underlying cards to graveyard', () => {
      const evoAttacker = {
        instanceId: 'evo-1',
        card: valdios,
        owner: 'player',
        isTapped: false,
        summonedTurn: 1,
        powerModifier: 0,
        evolvedOn: [
          createCardInstance(vorg, 'player', 'bait-1')
        ]
      };
      const bigDefender = {
        instanceId: 'def-1',
        card: bolgash, // 4000 power + powerModifier 3000 = 7000 power
        owner: 'opponent',
        isTapped: true,
        summonedTurn: 1,
        powerModifier: 3000
      };

      const state = setupCombatState({
        turn: 2,
        playerBattleZone: [evoAttacker],
        opponentBattleZone: [bigDefender]
      });

      const nextState = declareAttack(state, 'evo-1', { type: 'creature', instanceId: 'def-1' });

      // Player's evolution creature destroyed: both Valdios and bait Vorg go to graveyard
      assert.strictEqual(nextState.players.player.battleZone.length, 0);
      assert.strictEqual(nextState.players.player.graveyard.length, 2);
    });
  });

  describe('Blocker Interception & Declaration', () => {
    it('prompts BLOCK_DECLARATION when opponent controls an untapped blocker', () => {
      const attacker = {
        instanceId: 'att-1',
        card: vorg,
        owner: 'player',
        isTapped: false,
        summonedTurn: 1,
        powerModifier: 0
      };
      const blocker = {
        instanceId: 'blocker-1',
        card: senatine, // Blocker, 4000 power
        owner: 'opponent',
        isTapped: false, // untapped!
        summonedTurn: 1,
        powerModifier: 0
      };

      const state = setupCombatState({
        turn: 2,
        playerBattleZone: [attacker],
        opponentBattleZone: [blocker]
      });

      const nextState = declareAttack(state, 'att-1', { type: 'shield', index: 0 });

      assert.strictEqual(nextState.combatState?.stage, 'BLOCK');
      assert.ok(nextState.pendingInteraction);
      assert.strictEqual(nextState.pendingInteraction.validBlockerIds.length, 1);
      assert.strictEqual(nextState.pendingInteraction.validBlockerIds[0], 'blocker-1');
    });

    it('opponent chooses to block: taps blocker, redirects battle to blocker', () => {
      const attacker = {
        instanceId: 'att-1',
        card: vorg, // 2000 power
        owner: 'player',
        isTapped: false,
        summonedTurn: 1,
        powerModifier: 0
      };
      const blocker = {
        instanceId: 'blocker-1',
        card: senatine, // Blocker, 4000 power
        owner: 'opponent',
        isTapped: false,
        summonedTurn: 1,
        powerModifier: 0
      };

      let state = setupCombatState({
        turn: 2,
        playerBattleZone: [attacker],
        opponentBattleZone: [blocker]
      });

      state = declareAttack(state, 'att-1', { type: 'shield', index: 0 });

      // Opponent declares block
      const blockedState = declareBlock(state, 'blocker-1');

      // Battle resolved against blocker: Vorg (2000) vs Senatine (4000) -> Vorg destroyed
      assert.strictEqual(blockedState.players.player.battleZone.length, 0);
      assert.strictEqual(blockedState.players.player.graveyard.length, 1);
      // Senatine survived, but is now tapped!
      assert.strictEqual(blockedState.players.opponent.battleZone.length, 1);
      assert.strictEqual(blockedState.players.opponent.battleZone[0].isTapped, true);
      // Shield was NOT broken!
      assert.strictEqual(blockedState.players.opponent.shields.length, 5);
      // Combat resolved
      assert.strictEqual(blockedState.combatState, null);
      assert.strictEqual(blockedState.pendingInteraction, null);
    });

    it('opponent passes block: attack continues to original target shield', () => {
      const attacker = {
        instanceId: 'att-1',
        card: vorg,
        owner: 'player',
        isTapped: false,
        summonedTurn: 1,
        powerModifier: 0
      };
      const blocker = {
        instanceId: 'blocker-1',
        card: senatine,
        owner: 'opponent',
        isTapped: false,
        summonedTurn: 1,
        powerModifier: 0
      };

      let state = setupCombatState({
        turn: 2,
        playerBattleZone: [attacker],
        opponentBattleZone: [blocker]
      });

      state = declareAttack(state, 'att-1', { type: 'shield', index: 0 });

      // Pass block
      const passedState = declareBlock(state, null);

      // Blocker remains untapped
      assert.strictEqual(passedState.players.opponent.battleZone[0].isTapped, false);
      // Shield 0 was broken and moved to hand
      assert.strictEqual(passedState.players.opponent.shields.length, 4);
      assert.strictEqual(passedState.players.opponent.hand.length, 6);
    });

    it('rejects invalid blocker declaration', () => {
      const attacker = {
        instanceId: 'att-1',
        card: vorg,
        owner: 'player',
        isTapped: false,
        summonedTurn: 1,
        powerModifier: 0
      };
      const blocker = {
        instanceId: 'blocker-1',
        card: senatine,
        owner: 'opponent',
        isTapped: false,
        summonedTurn: 1,
        powerModifier: 0
      };

      let state = setupCombatState({
        turn: 2,
        playerBattleZone: [attacker],
        opponentBattleZone: [blocker]
      });

      state = declareAttack(state, 'att-1', { type: 'shield', index: 0 });

      assert.throws(() => declareBlock(state, 'non-existent-id'), /invalid blocker/i);
    });
  });

  describe('Shield Breaking & Breaker Counts', () => {
    it('single breaker breaks 1 shield and adds to opponent hand', () => {
      const attacker = {
        instanceId: 'att-1',
        card: vorg, // single breaker
        owner: 'player',
        isTapped: false,
        summonedTurn: 1,
        powerModifier: 0
      };

      const state = setupCombatState({
        turn: 2,
        playerBattleZone: [attacker]
      });

      const nextState = declareAttack(state, 'att-1', { type: 'shield', index: 0 });

      assert.strictEqual(nextState.players.opponent.shields.length, 4);
      assert.strictEqual(nextState.players.opponent.hand.length, 6);
    });

    it('Double Breaker breaks 2 shields', () => {
      const attacker = {
        instanceId: 'att-1',
        card: valdios, // Double Breaker (breakerCount: 2)
        owner: 'player',
        isTapped: false,
        summonedTurn: 1,
        powerModifier: 0
      };

      const state = setupCombatState({
        turn: 2,
        playerBattleZone: [attacker]
      });

      const nextState = declareAttack(state, 'att-1', { type: 'shield', index: 0 });

      assert.strictEqual(nextState.players.opponent.shields.length, 3);
      assert.strictEqual(nextState.players.opponent.hand.length, 7);
    });

    it('Triple Breaker breaks 3 shields', () => {
      const attacker = {
        instanceId: 'att-1',
        card: bolgash, // Triple Breaker (breakerCount: 3)
        owner: 'player',
        isTapped: false,
        summonedTurn: 1,
        powerModifier: 0
      };

      const state = setupCombatState({
        turn: 2,
        playerBattleZone: [attacker]
      });

      const nextState = declareAttack(state, 'att-1', { type: 'shield', index: 0 });

      assert.strictEqual(nextState.players.opponent.shields.length, 2);
      assert.strictEqual(nextState.players.opponent.hand.length, 8);
    });

    it('breaking the last shield leaves opponent with 0 shields without awarding victory', () => {
      const attacker = {
        instanceId: 'att-1',
        card: valdios, // Double Breaker
        owner: 'player',
        isTapped: false,
        summonedTurn: 1,
        powerModifier: 0
      };

      const shield0 = createShieldInstance(vorg, 'opponent', 0);
      const state = setupCombatState({
        turn: 2,
        playerBattleZone: [attacker],
        opponentShields: [shield0] // only 1 shield left
      });

      const nextState = declareAttack(state, 'att-1', { type: 'shield', index: 0 });

      assert.strictEqual(nextState.players.opponent.shields.length, 0);
      assert.strictEqual(nextState.winner, null); // NOT won yet! Needs subsequent direct attack.
    });
  });

  describe('Shield Trigger Resolution', () => {
    it('detects Shield Trigger spell and enters SHIELD_TRIGGER_RESOLUTION', () => {
      const attacker = {
        instanceId: 'att-1',
        card: vorg,
        owner: 'player',
        isTapped: false,
        summonedTurn: 1,
        powerModifier: 0
      };

      const triggerShield = createShieldInstance(terrorPit, 'opponent', 0);
      const state = setupCombatState({
        turn: 2,
        playerBattleZone: [attacker],
        opponentShields: [triggerShield]
      });

      const nextState = declareAttack(state, 'att-1', { type: 'shield', index: 0 });

      assert.ok(nextState.pendingInteraction);
      assert.match(nextState.pendingInteraction.type, /SHIELD_TRIGGER/);
      assert.strictEqual(nextState.pendingInteraction.triggers.length, 1);
      assert.strictEqual(nextState.pendingInteraction.triggers[0].card.name, terrorPit.name);
    });

    it('resolves Shield Trigger spell: casts for free (0 mana) and destroys target attacker', () => {
      const attacker = {
        instanceId: 'att-1',
        card: valdios,
        owner: 'player',
        isTapped: false,
        summonedTurn: 1,
        powerModifier: 0
      };

      const triggerShield = createShieldInstance(terrorPit, 'opponent', 0);
      let state = setupCombatState({
        turn: 2,
        playerBattleZone: [attacker],
        opponentShields: [triggerShield]
      });

      state = declareAttack(state, 'att-1', { type: 'shield', index: 0 });

      const triggerId = state.pendingInteraction.triggers[0].shieldId;
      // Play Terror Pit targeting attacker 'att-1'
      const resolvedState = resolveShieldTrigger(state, triggerId, true, ['att-1']);

      // Valdios was destroyed by Terror Pit!
      assert.strictEqual(resolvedState.players.player.battleZone.length, 0);
      assert.strictEqual(resolvedState.players.player.graveyard.length, 1);
      assert.strictEqual(resolvedState.players.player.graveyard[0].card.name, valdios.name);

      // Terror Pit went to opponent graveyard, not hand
      assert.strictEqual(resolvedState.players.opponent.graveyard.length, 1);
      assert.strictEqual(resolvedState.players.opponent.graveyard[0].card.name, terrorPit.name);
      assert.strictEqual(resolvedState.pendingInteraction, null);
    });

    it('resolves Shield Trigger creature: summons for free with no summoning sickness', () => {
      const attacker = {
        instanceId: 'att-1',
        card: vorg,
        owner: 'player',
        isTapped: false,
        summonedTurn: 1,
        powerModifier: 0
      };

      const triggerShield = createShieldInstance(amberGrass, 'opponent', 0);
      let state = setupCombatState({
        turn: 2,
        playerBattleZone: [attacker],
        opponentShields: [triggerShield]
      });

      state = declareAttack(state, 'att-1', { type: 'shield', index: 0 });

      const triggerId = state.pendingInteraction.triggers[0].shieldId;
      const resolvedState = resolveShieldTrigger(state, triggerId, true);

      // Amber Grass summoned to opponent battle zone!
      assert.strictEqual(resolvedState.players.opponent.battleZone.length, 1);
      const summonedCreature = resolvedState.players.opponent.battleZone[0];
      assert.strictEqual(summonedCreature.card.name, amberGrass.name);
      assert.strictEqual(summonedCreature.isTapped, false);
      assert.strictEqual(resolvedState.pendingInteraction, null);
    });

    it('declines Shield Trigger: leaves card in hand and clears pending interaction', () => {
      const attacker = {
        instanceId: 'att-1',
        card: vorg,
        owner: 'player',
        isTapped: false,
        summonedTurn: 1,
        powerModifier: 0
      };

      const triggerShield = createShieldInstance(terrorPit, 'opponent', 0);
      let state = setupCombatState({
        turn: 2,
        playerBattleZone: [attacker],
        opponentShields: [triggerShield]
      });

      state = declareAttack(state, 'att-1', { type: 'shield', index: 0 });

      const triggerId = state.pendingInteraction.triggers[0].shieldId;
      // Decline trigger
      const resolvedState = resolveShieldTrigger(state, triggerId, false);

      // Card remains in hand
      assert.strictEqual(resolvedState.players.opponent.hand.length, 6);
      const inHand = resolvedState.players.opponent.hand.find((c) => c.card.name === terrorPit.name);
      assert.ok(inHand);
      // Graveyard is empty
      assert.strictEqual(resolvedState.players.opponent.graveyard.length, 0);
      assert.strictEqual(resolvedState.pendingInteraction, null);
    });

    it('handles multiple triggers from Double Breaker sequentially', () => {
      const attacker = {
        instanceId: 'att-1',
        card: valdios, // Double Breaker
        owner: 'player',
        isTapped: false,
        summonedTurn: 1,
        powerModifier: 0
      };

      const trigger1 = createShieldInstance(holyAwe, 'opponent', 0);
      const trigger2 = createShieldInstance(faerieLife, 'opponent', 1);
      let state = setupCombatState({
        turn: 2,
        playerBattleZone: [attacker],
        opponentShields: [trigger1, trigger2]
      });

      state = declareAttack(state, 'att-1', { type: 'shield', index: 0 });

      assert.strictEqual(state.pendingInteraction.triggers.length, 2);

      // Resolve first trigger (Holy Awe)
      const t1Id = state.pendingInteraction.triggers[0].shieldId;
      state = resolveShieldTrigger(state, t1Id, true);

      // Holy Awe tapped all player creatures
      assert.strictEqual(state.players.player.battleZone[0].isTapped, true);
      // 1 trigger still pending!
      assert.ok(state.pendingInteraction);
      assert.strictEqual(state.pendingInteraction.triggers.length, 1);

      // Resolve second trigger (Faerie Life)
      const t2Id = state.pendingInteraction.triggers[0].shieldId;
      state = resolveShieldTrigger(state, t2Id, true);

      // All triggers resolved
      assert.strictEqual(state.pendingInteraction, null);
    });

    it('handles multiple identical triggers from Double Breaker without dropping duplicates', () => {
      const attacker = {
        instanceId: 'att-1',
        card: valdios, // Double Breaker
        owner: 'player',
        isTapped: false,
        summonedTurn: 1,
        powerModifier: 0
      };
      const extraCreature = {
        instanceId: 'extra-1',
        card: vorg,
        owner: 'player',
        isTapped: false,
        summonedTurn: 1,
        powerModifier: 0
      };

      const trigger1 = createShieldInstance(terrorPit, 'opponent', 0);
      const trigger2 = createShieldInstance(terrorPit, 'opponent', 1);
      let state = setupCombatState({
        turn: 2,
        playerBattleZone: [attacker, extraCreature],
        opponentShields: [trigger1, trigger2]
      });

      state = declareAttack(state, 'att-1', { type: 'shield', index: 0 });

      // Both Terror Pits detected
      assert.strictEqual(state.pendingInteraction.triggers.length, 2);
      assert.strictEqual(state.pendingInteraction.triggers[0].card.id, terrorPit.id);
      assert.strictEqual(state.pendingInteraction.triggers[1].card.id, terrorPit.id);

      // Resolve first Terror Pit on Valdios ('att-1')
      const t1Id = state.pendingInteraction.triggers[0].shieldId;
      state = resolveShieldTrigger(state, t1Id, true, ['att-1']);

      // Valdios destroyed
      assert.strictEqual(state.players.player.battleZone.length, 1);
      assert.strictEqual(state.players.player.battleZone[0].instanceId, 'extra-1');

      // The second identical trigger must still be pending!
      assert.ok(state.pendingInteraction);
      assert.strictEqual(state.pendingInteraction.triggers.length, 1);
      assert.strictEqual(state.pendingInteraction.triggers[0].shieldId, trigger2.id);

      // Resolve second Terror Pit on extraCreature ('extra-1')
      const t2Id = state.pendingInteraction.triggers[0].shieldId;
      state = resolveShieldTrigger(state, t2Id, true, ['extra-1']);

      // Both creatures destroyed, both Terror Pits in opponent graveyard
      assert.strictEqual(state.players.player.battleZone.length, 0);
      assert.strictEqual(state.players.opponent.graveyard.length, 2);
      assert.strictEqual(state.pendingInteraction, null);
    });
  });

  describe('Direct Attack & Victory Condition', () => {
    it('unblocked direct attack on player with 0 shields wins the game immediately', () => {
      const attacker = {
        instanceId: 'att-1',
        card: vorg,
        owner: 'player',
        isTapped: false,
        summonedTurn: 1,
        powerModifier: 0
      };

      const state = setupCombatState({
        turn: 2,
        playerBattleZone: [attacker],
        opponentShields: [] // 0 shields
      });

      const nextState = declareAttack(state, 'att-1', { type: 'player' });

      assert.strictEqual(nextState.winner, 'player');
      assert.match(nextState.actionLog[nextState.actionLog.length - 1], /wins/i);
    });

    it('direct attack blocked by opponent blocker does NOT award victory', () => {
      const attacker = {
        instanceId: 'att-1',
        card: valdios, // 6000 power
        owner: 'player',
        isTapped: false,
        summonedTurn: 1,
        powerModifier: 0
      };
      const blocker = {
        instanceId: 'blocker-1',
        card: senatine, // 4000 power Blocker
        owner: 'opponent',
        isTapped: false,
        summonedTurn: 1,
        powerModifier: 0
      };

      let state = setupCombatState({
        turn: 2,
        playerBattleZone: [attacker],
        opponentBattleZone: [blocker],
        opponentShields: [] // 0 shields
      });

      state = declareAttack(state, 'att-1', { type: 'player' });

      // Opponent blocks!
      const blockedState = declareBlock(state, 'blocker-1');

      // Valdios destroys Senatine in battle, but does NOT win the game because it was blocked
      assert.strictEqual(blockedState.winner, null);
      assert.strictEqual(blockedState.players.opponent.battleZone.length, 0);
      assert.strictEqual(blockedState.players.opponent.graveyard.length, 1);
    });
  });
});
