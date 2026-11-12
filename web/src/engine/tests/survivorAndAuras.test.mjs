import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isSurvivor,
  getSurvivorSharedAbilities,
  hasCreatureBlocker,
  hasCreatureSlayer,
  hasCreatureSpeedAttacker,
  isCreatureUnblockable,
  getCreatureBreakerCount,
  calculateContinuousAuraPower,
  triggerAttack,
  triggerCIP,
  triggerEndTurn,
  destroyCreature
} from '../effects.ts';
import {
  canDeclareAttack,
  declareAttack,
  declareBlock,
  resolveCombat,
  getCreatureEffectivePower
} from '../combat.ts';
import { isSummoningSick } from '../evolution.ts';
import { initializeGame } from '../state.ts';
import { step } from '../reducer.ts';
import { canPayManaCost, payManaCost } from '../mana.ts';
import { CARD_LIST } from '../../data/cardLoader.ts';

function findCard(name) {
  const card = CARD_LIST.find((c) => c.name.toLowerCase() === name.toLowerCase());
  if (!card) throw new Error(`Card not found in cardLoader: ${name}`);
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

describe('Survivor Mechanics & Continuous Auras Engine', () => {
  // DM-05 & later Survivors
  const galliaZohl = findCard('Gallia Zohl, Iron Guardian Q'); // Light, Blocker, Survivor, 2000
  const gigaling = findCard('Gigaling Q'); // Darkness, Slayer, Survivor, 2000
  const rumblesaur = findCard('Rumblesaur Q'); // Fire, Speed Attacker, Survivor, 2000
  const spikestrike = findCard('Spikestrike Ichthys Q'); // Water, Unblockable, Survivor, 3000
  const bladerush = findCard('Bladerush Skyterror Q'); // Fire, Double Breaker, Survivor, 5000
  const smashHorn = findCard('Smash Horn Q'); // Nature, +1000 power, Survivor, 2000
  const blazosaur = findCard('Blazosaur Q'); // Fire, Power Attacker +1000, Survivor, 1000
  const balloonshroom = findCard('Balloonshroom Q'); // Nature, Mana Zone on destroy, Survivor, 2000
  const ballus = findCard('Ballus, Dogfight Enforcer Q'); // Light, Untap at end of turn, Survivor, 3000
  const splitHead = findCard('Split-Head Hydroturtle Q'); // Water, Draw on attack, Survivor, 2000
  const skullsweeper = findCard('Skullsweeper Q'); // Darkness, Discard on attack, Survivor, 1000
  const rippleLotus = findCard('Ripple Lotus Q'); // Water, Tap opponent creature CIP, Survivor, 2000
  const graveWorm = findCard('Grave Worm Q'); // Darkness, Salvage Survivor CIP, Survivor, 3000
  const forbos = findCard('Forbos, Sanctum Guardian Q'); // Light, Search spell CIP, Survivor, 4000
  const factoryShell = findCard('Factory Shell Q'); // Nature, Search survivor CIP, Survivor, 2000
  const qTronicHypermind = findCard('Q-tronic Hypermind'); // Water, Evolution Survivor, Draw per Survivor CIP, 4000
  const qTronicGargantua = findCard('Q-tronic Gargantua'); // Fire, Evolution Survivor, Crew breaker, 6000

  // Continuous Aura Cards
  const barkwhip = findCard('Barkwhip, the Smasher'); // Nature, 5000, Beast Folk, while tapped +2000 to other Beast Folk
  const valdios = findCard('Armored Blaster Valdios'); // Fire, 6000, Human, +1000 to other Humans
  const jabaha = findCard('Überdragon Jabaha'); // Fire, 11000, Armored Dragon, +2000 power attacker to other Fire creatures
  const reBil = findCard('Re Bil, Seeker of Archery'); // Light, 6000, Mecha Thunder, +2000 to other Light creatures
  const shadowMoon = findCard('Shadow Moon, Cursed Shade'); // Darkness, 3000, Ghost, +2000 to other Darkness creatures
  const blasto = findCard('Blasto, Explosive Soldier'); // Fire, 2000, Dragonoid, +2000 if friendly Darkness
  const cactus = findCard('Exploding Cactus'); // Nature, 2000, Tree Folk, +2000 if friendly Light
  const palaOlesis = findCard('Pala Olesis, Morning Guardian'); // Light, 2500, Guardian, during opponent turn +2000 to other friendly
  const legacyShell = findCard('Legacy Shell'); // Nature, 4000, Colony Beetle, +3000 power attacker to Light & Fire
  const merlee = findCard('Merlee, the Oracle'); // Light, 1500, Light Bringer, Wave Striker +1000 to all friendly
  const agira = findCard('Agira, the Warlord Crawler'); // Light/Water, 5500, +2000 to Gladiators & Earth Eaters
  const hydrooze = findCard('Hydrooze, the Mutant Emperor'); // Water/Darkness, 5000, +2000 to Cyber Lords & Hedrians, unblockable
  const nemonex = findCard("Nemonex, Bajula's Robomantis"); // Fire/Nature, 5000, +2000 to Xeno Parts & Giant Insects
  const cometEye = findCard('Comet Eye, The Spectral Spud'); // Light/Nature, 5500, +2000 to Wild Veggies & Rainbow Phantoms
  const technoTotem = findCard('Techno Totem'); // Light/Nature, 5000, while tapped +1500 power attacker to other friendly

  // Standard non-survivor reference cards
  const vorg = findCard('Immortal Baron, Vorg'); // Fire, Human, 2000
  const bronzeArm = findCard('Bronze-Arm Tribe'); // Nature, Beast Folk, 1000
  const senatine = findCard('Senatine Jade Tree'); // Light, Starlight Tree, 4000, Blocker
  const aquaHulcus = findCard('Aqua Hulcus'); // Water, Liquid People, 2000
  const emeral = findCard('Emeral'); // Water, Cyber Lord, 1000
  const kanesill = findCard('Kanesill, the Explorer'); // Light, Gladiator, 4000
  const forestHornet = findCard('Forest Hornet'); // Nature, Giant Insect, 4000
  const hustleBerry = findCard('Hustle Berry'); // Nature, Wild Veggies, 1000
  const terrorPit = findCard('Terror Pit'); // Darkness, Spell

  function createTestState() {
    const deck1 = createTestDeck('d1', 'Deck 1', vorg);
    const deck2 = createTestDeck('d2', 'Deck 2', vorg);
    const s = initializeGame(deck1, deck2, 'player', { shuffle: false });
    return {
      ...s,
      phase: 'MAIN'
    };
  }

  function setupCreatureInBZ(state, player, card, options = {}) {
    const instanceId = options.instanceId || `test-creature-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const creature = {
      instanceId,
      card,
      owner: player,
      isTapped: options.isTapped ?? false,
      summonedTurn: options.summonedTurn ?? (state.turn - 1),
      powerModifier: options.powerModifier ?? 0
    };
    return {
      nextState: {
        ...state,
        players: {
          ...state.players,
          [player]: {
            ...state.players[player],
            battleZone: [...state.players[player].battleZone, creature]
          }
        }
      },
      creature
    };
  }

  // =========================================================================
  // 1. SURVIVOR ABILITY SHARING
  // =========================================================================
  describe('1. Survivor Ability Sharing', () => {
    it('isSurvivor correctly detects Survivor cards by flag, race, or races', () => {
      assert.strictEqual(isSurvivor(galliaZohl), true);
      assert.strictEqual(isSurvivor(smashHorn), true);
      assert.strictEqual(isSurvivor({ race: 'Survivor', name: 'Custom' }), true);
      assert.strictEqual(isSurvivor({ races: ['Survivor', 'Fish'], name: 'Custom' }), true);
      assert.strictEqual(isSurvivor(vorg), false);
      assert.strictEqual(isSurvivor(null), false);
    });

    it('getSurvivorSharedAbilities collects all flags from friendly battle zone', () => {
      const state = createTestState();
      const { nextState: s1, creature: cGallia } = setupCreatureInBZ(state, 'player', galliaZohl);
      const { nextState: s2, creature: cSmash1 } = setupCreatureInBZ(s1, 'player', smashHorn);
      const { nextState: s3, creature: cSmash2 } = setupCreatureInBZ(s2, 'player', smashHorn);
      const { nextState: s4, creature: cBladerush } = setupCreatureInBZ(s3, 'player', bladerush);

      const abilities = getSurvivorSharedAbilities(s4.players.player.battleZone);
      assert.strictEqual(abilities.hasBlocker, true);
      assert.strictEqual(abilities.powerBonus, 2000); // 2 Smash Horns = +2000
      assert.strictEqual(abilities.minBreakerCount, 2); // Bladerush Skyterror Q gives at least 2
      assert.strictEqual(abilities.hasSlayer, false); // No Gigaling Q
    });

    it('Blocker sharing: Gallia Zohl grants Blocker to friendly Survivors but not non-Survivors', () => {
      const state = createTestState();
      const { nextState: s1, creature: cGallia } = setupCreatureInBZ(state, 'player', galliaZohl);
      const { nextState: s2, creature: cSmash } = setupCreatureInBZ(s1, 'player', smashHorn);
      const { nextState: s3, creature: cVorg } = setupCreatureInBZ(s2, 'player', vorg);

      const bz = s3.players.player.battleZone;
      assert.strictEqual(hasCreatureBlocker(cGallia, bz), true);
      assert.strictEqual(hasCreatureBlocker(cSmash, bz), true); // Smash Horn gets Blocker!
      assert.strictEqual(hasCreatureBlocker(cVorg, bz), false); // Non-survivor Vorg does not get Blocker
    });

    it('Blocker execution: friendly Survivor with shared Blocker can declare block', () => {
      let state = createTestState();
      state = { ...state, activePlayer: 'opponent', phase: 'MAIN' };

      // Opponent has Vorg attacking
      const { nextState: s1, creature: oppAttacker } = setupCreatureInBZ(state, 'opponent', vorg);
      // Player has Gallia Zohl and Smash Horn (both untapped)
      const { nextState: s2, creature: playerGallia } = setupCreatureInBZ(s1, 'player', galliaZohl);
      const { nextState: s3, creature: playerSmash } = setupCreatureInBZ(s2, 'player', smashHorn);

      // Opponent declares attack on player shield
      const stateAttacking = declareAttack(s3, oppAttacker.instanceId, { type: 'shield', index: 0 });
      assert.strictEqual(stateAttacking.combatState?.stage, 'BLOCK');
      assert.ok(stateAttacking.pendingInteraction?.validBlockerIds.includes(playerSmash.instanceId));

      // Smash Horn blocks the attack!
      const stateBlocked = declareBlock(stateAttacking, playerSmash.instanceId);
      assert.strictEqual(stateBlocked.combatState, null); // Battle resolved

      // Smash Horn (base 2000 + 1000 Smash Horn aura = 3000) vs Vorg (2000)
      // Vorg should be destroyed; Smash Horn survives
      assert.ok(!stateBlocked.players.opponent.battleZone.some((c) => c.instanceId === oppAttacker.instanceId));
      assert.ok(stateBlocked.players.player.battleZone.some((c) => c.instanceId === playerSmash.instanceId));
    });

    it('Slayer sharing: Gigaling Q grants Slayer to friendly Survivors, destroying stronger attackers', () => {
      let state = createTestState();
      state = { ...state, activePlayer: 'opponent', phase: 'MAIN' };

      // Opponent has 6000 power attacker (Valdios)
      const { nextState: s1, creature: oppAttacker } = setupCreatureInBZ(state, 'opponent', valdios);
      // Player has Gigaling Q (Darkness Survivor, Slayer) and Gallia Zohl (Light Survivor, Blocker)
      const { nextState: s2 } = setupCreatureInBZ(s1, 'player', gigaling);
      const { nextState: s3, creature: playerGallia } = setupCreatureInBZ(s2, 'player', galliaZohl);

      // Gallia Zohl now has Slayer from Gigaling Q!
      const bz = s3.players.player.battleZone;
      assert.strictEqual(hasCreatureSlayer(playerGallia, bz), true);

      // Opponent attacks shield; Gallia blocks
      const stateAttacking = declareAttack(s3, oppAttacker.instanceId, { type: 'shield', index: 0 });
      const stateBlocked = declareBlock(stateAttacking, playerGallia.instanceId);

      // Gallia (2000) vs Valdios (6000): Gallia is destroyed, but Slayer also destroys Valdios!
      assert.ok(!stateBlocked.players.player.battleZone.some((c) => c.instanceId === playerGallia.instanceId));
      assert.ok(!stateBlocked.players.opponent.battleZone.some((c) => c.instanceId === oppAttacker.instanceId));
    });

    it('Speed Attacker sharing: Rumblesaur Q removes summoning sickness from friendly Survivors', () => {
      const state = createTestState();
      // Friendly battle zone has Rumblesaur Q
      const { nextState: s1, creature: cRumble } = setupCreatureInBZ(state, 'player', rumblesaur);
      // Smash Horn and Vorg summoned on the CURRENT turn (turn 1)
      const { nextState: s2, creature: cSmash } = setupCreatureInBZ(s1, 'player', smashHorn, { summonedTurn: state.turn });
      const { nextState: s3, creature: cVorg } = setupCreatureInBZ(s2, 'player', vorg, { summonedTurn: state.turn });

      const bz = s3.players.player.battleZone;
      assert.strictEqual(isSummoningSick(cSmash, s3.turn, bz), false); // Survivor has Speed Attacker!
      assert.strictEqual(isSummoningSick(cVorg, s3.turn, bz), true); // Non-survivor still has summoning sickness

      // Smash Horn can declare an attack immediately
      const checkSmash = canDeclareAttack(s3, cSmash.instanceId, { type: 'shield', index: 0 });
      assert.strictEqual(checkSmash.valid, true);

      // Vorg cannot attack
      const checkVorg = canDeclareAttack(s3, cVorg.instanceId, { type: 'shield', index: 0 });
      assert.strictEqual(checkVorg.valid, false);
      assert.match(checkVorg.reason, /summoning sickness/i);

      // Reducer integration: passing phase from MAIN transitions to ATTACK because shared Speed Attacker makes cSmash eligible
      const stateInMain = { ...s3, phase: 'MAIN' };
      const statePassed = step(stateInMain, { type: 'PASS_PHASE' });
      assert.strictEqual(statePassed.phase, 'ATTACK');
    });

    it('Unblockable sharing: Spikestrike Ichthys Q makes friendly Survivors unblockable', () => {
      const state = createTestState();
      // Player has Spikestrike Ichthys Q and Smash Horn Q
      const { nextState: s1, creature: cSpike } = setupCreatureInBZ(state, 'player', spikestrike);
      const { nextState: s2, creature: cSmash } = setupCreatureInBZ(s1, 'player', smashHorn);
      const { nextState: s3, creature: cVorg } = setupCreatureInBZ(s2, 'player', vorg);
      // Opponent has untapped Blocker (Senatine Jade Tree)
      const { nextState: s4, creature: oppBlocker } = setupCreatureInBZ(s3, 'opponent', senatine);

      const bz = s4.players.player.battleZone;
      assert.strictEqual(isCreatureUnblockable(cSmash, { type: 'shield', index: 0 }, [], bz), true);
      assert.strictEqual(isCreatureUnblockable(cVorg, { type: 'shield', index: 0 }, [], bz), false);

      // When Smash Horn attacks, blockers cannot intercept (no BLOCK stage)
      const sAttack = declareAttack(s4, cSmash.instanceId, { type: 'shield', index: 0 });
      assert.strictEqual(sAttack.combatState, null); // Immediately resolved shield break!
    });

    it('Breaker Count: Bladerush Skyterror Q grants Double Breaker & Q-tronic Gargantua adds per other Survivor', () => {
      const state = createTestState();
      // Setup Bladerush Skyterror Q, Smash Horn Q, and Q-tronic Gargantua
      const { nextState: s1, creature: cBladerush } = setupCreatureInBZ(state, 'player', bladerush);
      const { nextState: s2, creature: cSmash } = setupCreatureInBZ(s1, 'player', smashHorn);
      const { nextState: s3, creature: cGargantua } = setupCreatureInBZ(s2, 'player', qTronicGargantua);

      const bz = s3.players.player.battleZone;
      // Smash Horn normally breaks 1 shield, but with Bladerush Skyterror Q it breaks 2 shields
      assert.strictEqual(getCreatureBreakerCount(cSmash, bz), 2);

      // Q-tronic Gargantua base is 1, with Bladerush Skyterror min is 2, plus 2 other Survivors (Bladerush + Smash Horn) = 4 shields!
      assert.strictEqual(getCreatureBreakerCount(cGargantua, bz), 4);
    });
  });

  // =========================================================================
  // 2. SURVIVOR CIP TRIGGERS
  // =========================================================================
  describe('2. Survivor Come-Into-Play (CIP) Triggers', () => {
    it('Ripple Lotus Q taps an opponent creature upon entry and when another Survivor enters', () => {
      const state = createTestState();
      // Opponent has untapped Vorg
      const { nextState: s1, creature: oppVorg } = setupCreatureInBZ(state, 'opponent', vorg);
      assert.strictEqual(oppVorg.isTapped, false);

      // Player puts Ripple Lotus Q into battle zone
      const { nextState: s2, creature: cRipple } = setupCreatureInBZ(s1, 'player', rippleLotus);
      const sAfterLotus = triggerCIP(s2, 'player', cRipple);

      // Opponent's Vorg should now be tapped!
      const tappedVorg1 = sAfterLotus.players.opponent.battleZone.find((c) => c.instanceId === oppVorg.instanceId);
      assert.strictEqual(tappedVorg1.isTapped, true);

      // Untap opponent Vorg to test second trigger
      const sUntapped = {
        ...sAfterLotus,
        players: {
          ...sAfterLotus.players,
          opponent: {
            ...sAfterLotus.players.opponent,
            battleZone: [{ ...tappedVorg1, isTapped: false }]
          }
        }
      };

      // Player enters another Survivor (Smash Horn Q) while Ripple Lotus is in friendly battle zone
      const { nextState: s3, creature: cSmash } = setupCreatureInBZ(sUntapped, 'player', smashHorn);
      const sAfterSmash = triggerCIP(s3, 'player', cSmash);

      const tappedVorg2 = sAfterSmash.players.opponent.battleZone.find((c) => c.instanceId === oppVorg.instanceId);
      assert.strictEqual(tappedVorg2.isTapped, true);
    });

    it('Grave Worm Q salvages a Survivor from graveyard to hand upon entry', () => {
      let state = createTestState();
      // Put a Survivor (Smash Horn Q) and a non-Survivor (Vorg) in graveyard
      state = {
        ...state,
        players: {
          ...state.players,
          player: {
            ...state.players.player,
            hand: [],
            graveyard: [
              { instanceId: 'g-vorg', card: vorg, owner: 'player' },
              { instanceId: 'g-smash', card: smashHorn, owner: 'player' }
            ]
          }
        }
      };

      // Summon Grave Worm Q
      const { nextState: s1, creature: cGraveWorm } = setupCreatureInBZ(state, 'player', graveWorm);
      const sAfterCIP = triggerCIP(s1, 'player', cGraveWorm);

      // Smash Horn Q should be salvaged into hand
      assert.strictEqual(sAfterCIP.players.player.hand.length, 1);
      assert.strictEqual(sAfterCIP.players.player.hand[0].card.name, smashHorn.name);
      assert.strictEqual(sAfterCIP.players.player.graveyard.length, 1);
      assert.strictEqual(sAfterCIP.players.player.graveyard[0].card.name, vorg.name);
    });

    it('Q-tronic Hypermind draws 1 card for each Survivor in the battle zone', () => {
      let state = createTestState();
      state = {
        ...state,
        players: {
          ...state.players,
          player: { ...state.players.player, hand: [] }
        }
      };

      // Battle zone contains 3 Survivors total (2 friendly, 1 opponent)
      const { nextState: s1 } = setupCreatureInBZ(state, 'player', smashHorn);
      const { nextState: s2 } = setupCreatureInBZ(s1, 'opponent', galliaZohl);
      const { nextState: s3, creature: cHypermind } = setupCreatureInBZ(s2, 'player', qTronicHypermind);

      const sAfterCIP = triggerCIP(s3, 'player', cHypermind);
      // Total survivors = 3 (smashHorn, galliaZohl, qTronicHypermind) -> draws 3 cards!
      assert.strictEqual(sAfterCIP.players.player.hand.length, 3);
    });

    it('Forbos and Factory Shell search deck for spell and survivor respectively', () => {
      let state = createTestState();
      state = {
        ...state,
        players: {
          ...state.players,
          player: {
            ...state.players.player,
            hand: [],
            deck: [
              { instanceId: 'd-vorg', card: vorg, owner: 'player' },
              { instanceId: 'd-pit', card: terrorPit, owner: 'player' },
              { instanceId: 'd-smash', card: smashHorn, owner: 'player' }
            ]
          }
        }
      };

      // Forbos searches spell
      const { nextState: s1, creature: cForbos } = setupCreatureInBZ(state, 'player', forbos);
      const sAfterForbos = triggerCIP(s1, 'player', cForbos);
      assert.ok(sAfterForbos.players.player.hand.some((c) => c.card.name === terrorPit.name));

      // Factory Shell searches survivor
      const { nextState: s2, creature: cFactory } = setupCreatureInBZ(sAfterForbos, 'player', factoryShell);
      const sAfterFactory = triggerCIP(s2, 'player', cFactory);
      assert.ok(sAfterFactory.players.player.hand.some((c) => c.card.name === smashHorn.name));
    });
  });

  // =========================================================================
  // 3. SURVIVOR ATTACK TRIGGERS
  // =========================================================================
  describe('3. Survivor Attack Triggers', () => {
    it('Split-Head Hydroturtle Q grants card draw on attack to friendly Survivors as optional choice', () => {
      let state = createTestState();
      state = {
        ...state,
        players: {
          ...state.players,
          player: { ...state.players.player, hand: [] }
        }
      };

      // Player has Split-Head Hydroturtle Q and Smash Horn Q
      const { nextState: s1 } = setupCreatureInBZ(state, 'player', splitHead);
      const { nextState: s2, creature: cSmash } = setupCreatureInBZ(s1, 'player', smashHorn);

      // Smash Horn attacks shield
      const sAfterAttack = triggerAttack(s2, 'player', cSmash, { type: 'shield', index: 0 });
      // Split-Head Hydroturtle Survivor ability opens OPTIONAL_CHOICE interaction
      assert.strictEqual(sAfterAttack.pendingInteraction?.type, 'OPTIONAL_CHOICE');
      assert.strictEqual(sAfterAttack.pendingInteraction?.effectType, 'DRAW');

      // If user accepts: draws 1 card
      const sAccepted = step(sAfterAttack, { type: 'RESOLVE_OPTIONAL_CHOICE', accept: true });
      assert.strictEqual(sAccepted.players.player.hand.length, 1);
      assert.strictEqual(sAccepted.pendingInteraction, null);

      // If user declines: draws 0 cards
      const sDeclined = step(sAfterAttack, { type: 'RESOLVE_OPTIONAL_CHOICE', accept: false });
      assert.strictEqual(sDeclined.players.player.hand.length, 0);
      assert.strictEqual(sDeclined.pendingInteraction, null);
    });

    it('Skullsweeper Q forces opponent to discard a card when friendly Survivor attacks', () => {
      let state = createTestState();
      state = {
        ...state,
        players: {
          ...state.players,
          opponent: {
            ...state.players.opponent,
            hand: [{ instanceId: 'opp-h1', card: vorg, owner: 'opponent' }]
          }
        }
      };

      // Player has Skullsweeper Q and Smash Horn Q
      const { nextState: s1 } = setupCreatureInBZ(state, 'player', skullsweeper);
      const { nextState: s2, creature: cSmash } = setupCreatureInBZ(s1, 'player', smashHorn);

      // Smash Horn attacks shield
      const sAfterAttack = triggerAttack(s2, 'player', cSmash, { type: 'shield', index: 0 });
      // Opponent must discard 1 card
      assert.strictEqual(sAfterAttack.players.opponent.hand.length, 0);
      assert.strictEqual(sAfterAttack.players.opponent.graveyard.length, 1);
    });
  });

  // =========================================================================
  // 4. SURVIVOR END-OF-TURN UNTAP
  // =========================================================================
  describe('4. Survivor End-of-Turn Untap', () => {
    it('Ballus, Dogfight Enforcer Q untaps all friendly Survivors at end of turn', () => {
      const state = createTestState();
      // Player has tapped Ballus, tapped Smash Horn (Survivor), and tapped Vorg (Non-Survivor)
      const { nextState: s1, creature: cBallus } = setupCreatureInBZ(state, 'player', ballus, { isTapped: true });
      const { nextState: s2, creature: cSmash } = setupCreatureInBZ(s1, 'player', smashHorn, { isTapped: true });
      const { nextState: s3, creature: cVorg } = setupCreatureInBZ(s2, 'player', vorg, { isTapped: true });

      const sEnd = triggerEndTurn(s3, 'player');
      const bz = sEnd.players.player.battleZone;

      const endBallus = bz.find((c) => c.instanceId === cBallus.instanceId);
      const endSmash = bz.find((c) => c.instanceId === cSmash.instanceId);
      const endVorg = bz.find((c) => c.instanceId === cVorg.instanceId);

      assert.strictEqual(endBallus.isTapped, false); // Ballus untaps
      assert.strictEqual(endSmash.isTapped, false); // Smash Horn untaps because of Ballus!
      assert.strictEqual(endVorg.isTapped, true); // Non-survivor Vorg remains tapped
    });

    it('Ballus, Dogfight Enforcer Q untaps all friendly Survivors through reducer END_TURN action', () => {
      const state = createTestState();
      // Setup active turn = player, phase = MAIN
      const { nextState: s1, creature: cBallus } = setupCreatureInBZ(state, 'player', ballus, { isTapped: true });
      const { nextState: s2, creature: cSmash } = setupCreatureInBZ(s1, 'player', smashHorn, { isTapped: true });
      const { nextState: s3, creature: cVorg } = setupCreatureInBZ(s2, 'player', vorg, { isTapped: true });
      const activeState = { ...s3, activePlayer: 'player', phase: 'MAIN' };

      // Dispatch END_TURN through master reducer
      const nextState = step(activeState, { type: 'END_TURN', player: 'player' });

      // After END_TURN, player's battle zone has transitioned
      const bz = nextState.players.player.battleZone;
      const endBallus = bz.find((c) => c.instanceId === cBallus.instanceId);
      const endSmash = bz.find((c) => c.instanceId === cSmash.instanceId);
      const endVorg = bz.find((c) => c.instanceId === cVorg.instanceId);

      assert.strictEqual(endBallus.isTapped, false, 'Ballus itself untaps');
      assert.strictEqual(endSmash.isTapped, false, 'Smash Horn untaps via Ballus Survivor ability!');
      assert.strictEqual(endVorg.isTapped, true, 'Non-survivor Vorg remains tapped');
      assert.ok(nextState.actionLog.some((log) => log.includes('Smash Horn Q untapped at the end of the turn (Survivor ability: Ballus, Dogfight Enforcer Q)')));
    });
  });

  // =========================================================================
  // 5. SURVIVOR DESTRUCTION REPLACEMENT
  // =========================================================================
  describe('5. Survivor Destruction Replacement', () => {
    it('Balloonshroom Q puts destroyed friendly Survivors into mana zone instead of graveyard', () => {
      const state = createTestState();
      // Friendly battle zone has Balloonshroom Q and Gallia Zohl
      const { nextState: s1, creature: cBalloon } = setupCreatureInBZ(state, 'player', balloonshroom);
      const { nextState: s2, creature: cGallia } = setupCreatureInBZ(s1, 'player', galliaZohl);
      const { nextState: s3, creature: cVorg } = setupCreatureInBZ(s2, 'player', vorg);

      // Destroy Gallia Zohl
      const sDestroyGallia = destroyCreature(s3, cGallia.instanceId);
      // Gallia Zohl is moved to mana zone, not graveyard!
      assert.ok(sDestroyGallia.players.player.manaZone.some((m) => m.card.name === galliaZohl.name));
      assert.ok(!sDestroyGallia.players.player.graveyard.some((g) => g.card.name === galliaZohl.name));

      // Destroy non-survivor Vorg
      const sDestroyVorg = destroyCreature(sDestroyGallia, cVorg.instanceId);
      // Vorg is non-survivor, goes to graveyard as normal
      assert.ok(sDestroyVorg.players.player.graveyard.some((g) => g.card.name === vorg.name));
      assert.ok(!sDestroyVorg.players.player.manaZone.some((m) => m.card.name === vorg.name));
    });
  });

  // =========================================================================
  // 6. CONTINUOUS AURA BONUSES
  // =========================================================================
  describe('6. Continuous Race & Civilization Auras', () => {
    it('Smash Horn Q gives +1000 power to all friendly Survivors per copy', () => {
      const state = createTestState();
      const { nextState: s1, creature: cSmash1 } = setupCreatureInBZ(state, 'player', smashHorn);
      const { nextState: s2, creature: cSmash2 } = setupCreatureInBZ(s1, 'player', smashHorn);
      const { nextState: s3, creature: cGallia } = setupCreatureInBZ(s2, 'player', galliaZohl); // Base 2000
      const { nextState: s4, creature: cVorg } = setupCreatureInBZ(s3, 'player', vorg); // Base 2000

      const pState = s4.players.player;
      // Gallia Zohl gets +2000 (2 Smash Horns) = 4000
      assert.strictEqual(getCreatureEffectivePower(cGallia, false, pState), 4000);
      // Smash Horn gets +2000 (2 Smash Horns) = 4000
      assert.strictEqual(getCreatureEffectivePower(cSmash1, false, pState), 4000);
      // Non-survivor Vorg gets 0 = 2000
      assert.strictEqual(getCreatureEffectivePower(cVorg, false, pState), 2000);
    });

    it('Barkwhip, the Smasher buffs other friendly Beast Folk by +2000 only when tapped', () => {
      const state = createTestState();
      // Setup Barkwhip (untapped) and Bronze-Arm Tribe (Beast Folk, base 1000)
      const { nextState: s1, creature: cBarkwhip } = setupCreatureInBZ(state, 'player', barkwhip, { isTapped: false });
      const { nextState: s2, creature: cBronze } = setupCreatureInBZ(s1, 'player', bronzeArm);

      // Untapped Barkwhip -> Bronze-Arm is 1000
      assert.strictEqual(getCreatureEffectivePower(cBronze, false, s2.players.player), 1000);

      // Tap Barkwhip -> Bronze-Arm gets +2000 = 3000
      const s3 = {
        ...s2,
        players: {
          ...s2.players,
          player: {
            ...s2.players.player,
            battleZone: s2.players.player.battleZone.map((c) =>
              c.instanceId === cBarkwhip.instanceId ? { ...c, isTapped: true } : c
            )
          }
        }
      };
      const tappedBarkwhip = s3.players.player.battleZone.find((c) => c.instanceId === cBarkwhip.instanceId);
      assert.strictEqual(getCreatureEffectivePower(cBronze, false, s3.players.player), 3000);
      // Barkwhip itself does not receive its own buff (remains base 5000)
      assert.strictEqual(getCreatureEffectivePower(tappedBarkwhip, false, s3.players.player), 5000);
    });

    it('Armored Blaster Valdios buffs other friendly Humans by +1000', () => {
      const state = createTestState();
      const { nextState: s1, creature: cValdios } = setupCreatureInBZ(state, 'player', valdios);
      const { nextState: s2, creature: cVorg } = setupCreatureInBZ(s1, 'player', vorg); // Human, base 2000
      const { nextState: s3, creature: cBronze } = setupCreatureInBZ(s2, 'player', bronzeArm); // Beast Folk

      const pState = s3.players.player;
      // Vorg gets +1000 = 3000
      assert.strictEqual(getCreatureEffectivePower(cVorg, false, pState), 3000);
      // Valdios itself is 6000
      assert.strictEqual(getCreatureEffectivePower(cValdios, false, pState), 6000);
      // Non-Human Bronze-Arm Tribe is 1000
      assert.strictEqual(getCreatureEffectivePower(cBronze, false, pState), 1000);
    });

    it('Überdragon Jabaha grants +2000 power attacker to other friendly Fire creatures when attacking', () => {
      const state = createTestState();
      const { nextState: s1, creature: cJabaha } = setupCreatureInBZ(state, 'player', jabaha);
      const { nextState: s2, creature: cVorg } = setupCreatureInBZ(s1, 'player', vorg); // Fire, base 2000
      const { nextState: s3, creature: cBronze } = setupCreatureInBZ(s2, 'player', bronzeArm); // Nature

      const pState = s3.players.player;
      // Vorg not attacking: 2000
      assert.strictEqual(getCreatureEffectivePower(cVorg, false, pState), 2000);
      // Vorg attacking: gets +2000 power attacker = 4000
      assert.strictEqual(getCreatureEffectivePower(cVorg, true, pState), 4000);
      // Bronze-Arm attacking: Nature, does not get Fire buff = 1000
      assert.strictEqual(getCreatureEffectivePower(cBronze, true, pState), 1000);
    });

    it('Shadow Moon and Re Bil buff matching civilizations across both sides of the battlefield', () => {
      const state = createTestState();
      // Friendly side has Shadow Moon (Darkness, 3000) and Gallia Zohl (Light, 2000)
      const { nextState: s1, creature: cShadowMoon } = setupCreatureInBZ(state, 'player', shadowMoon);
      const { nextState: s2, creature: cGallia } = setupCreatureInBZ(s1, 'player', galliaZohl);
      // Opponent side has Re Bil (Light, 6000) and Gigaling Q (Darkness, 2000)
      const { nextState: s3, creature: cReBil } = setupCreatureInBZ(s2, 'opponent', reBil);
      const { nextState: s4, creature: cGigaling } = setupCreatureInBZ(s3, 'opponent', gigaling);

      const pState = s4.players.player;
      const oState = s4.players.opponent;

      // Gallia Zohl (friendly Light) gets +2000 from opponent's Re Bil = 4000
      assert.strictEqual(getCreatureEffectivePower(cGallia, false, pState, oState), 4000);
      // Gigaling Q (opponent Darkness) gets +2000 from friendly Shadow Moon = 4000
      assert.strictEqual(getCreatureEffectivePower(cGigaling, false, oState, pState), 4000);
      // Re Bil itself does not get buffed by Re Bil = 6000
      assert.strictEqual(getCreatureEffectivePower(cReBil, false, oState, pState), 6000);
      // Shadow Moon itself does not get buffed by Shadow Moon = 3000
      assert.strictEqual(getCreatureEffectivePower(cShadowMoon, false, pState, oState), 3000);
    });

    it('Blasto and Exploding Cactus receive civilization conditional buffs', () => {
      const state = createTestState();
      // Setup Blasto (Fire, base 2000) and Cactus (Nature, base 2000) without companions
      const { nextState: s1, creature: cBlasto } = setupCreatureInBZ(state, 'player', blasto);
      const { nextState: s2, creature: cCactus } = setupCreatureInBZ(s1, 'player', cactus);

      assert.strictEqual(getCreatureEffectivePower(cBlasto, false, s2.players.player), 2000);
      assert.strictEqual(getCreatureEffectivePower(cCactus, false, s2.players.player), 2000);

      // Add Darkness creature (Gigaling Q) and Light creature (Gallia Zohl)
      const { nextState: s3 } = setupCreatureInBZ(s2, 'player', gigaling);
      const { nextState: s4 } = setupCreatureInBZ(s3, 'player', galliaZohl);

      // Blasto gets +2000 from Darkness creature = 4000
      assert.strictEqual(getCreatureEffectivePower(cBlasto, false, s4.players.player), 4000);
      // Cactus gets +2000 from Light creature = 4000
      assert.strictEqual(getCreatureEffectivePower(cCactus, false, s4.players.player), 4000);
    });

    it('Pala Olesis, Morning Guardian buffs friendly creatures by +2000 during opponent turn', () => {
      const state = createTestState();
      const { nextState: s1, creature: cPala } = setupCreatureInBZ(state, 'player', palaOlesis);
      const { nextState: s2, creature: cVorg } = setupCreatureInBZ(s1, 'player', vorg); // Base 2000

      const pState = s2.players.player;
      // During player's turn (isOpponentsTurn === false) -> Vorg is 2000
      assert.strictEqual(getCreatureEffectivePower(cVorg, false, pState, undefined, false), 2000);
      // During opponent's turn (isOpponentsTurn === true) -> Vorg gets +2000 = 4000
      assert.strictEqual(getCreatureEffectivePower(cVorg, false, pState, undefined, true), 4000);
      // Pala Olesis itself does not receive its own buff
      assert.strictEqual(getCreatureEffectivePower(cPala, false, pState, undefined, true), 2500);
    });

    it('Wave Striker Merlee buffs friendly creatures by +1000 when 3+ wave strikers are present', () => {
      const state = createTestState();
      // Only 1 Wave Striker (Merlee) -> no bonus
      const { nextState: s1, creature: cMerlee } = setupCreatureInBZ(state, 'player', merlee);
      const { nextState: s2, creature: cVorg } = setupCreatureInBZ(s1, 'player', vorg);
      assert.strictEqual(getCreatureEffectivePower(cVorg, false, s2.players.player), 2000);

      // Add 2 more Wave Strikers across the board (total 3)
      const wsCard = { ...merlee, id: 'WS-test', name: 'Wave Striker Ally' };
      const { nextState: s3 } = setupCreatureInBZ(s2, 'player', wsCard);
      const { nextState: s4 } = setupCreatureInBZ(s3, 'opponent', wsCard);

      // Now 3 Wave Strikers present -> Merlee buffs all friendly creatures by +1000
      assert.strictEqual(getCreatureEffectivePower(cVorg, false, s4.players.player, s4.players.opponent), 3000);
      assert.strictEqual(getCreatureEffectivePower(cMerlee, false, s4.players.player, s4.players.opponent), 2500);
    });

    it('Multi-civ evolution auras (Agira, Hydrooze, Nemonex, Comet Eye) grant +2000 to respective races', () => {
      const state = createTestState();
      // Hydrooze buffs Cyber Lords by +2000 and makes them unblockable
      const { nextState: s1, creature: cHydrooze } = setupCreatureInBZ(state, 'player', hydrooze);
      const { nextState: s2, creature: cEmeral } = setupCreatureInBZ(s1, 'player', emeral); // Cyber Lord, base 1000

      // Agira buffs Gladiators by +2000
      const { nextState: s3 } = setupCreatureInBZ(s2, 'player', agira);
      const { nextState: s4, creature: cKanesill } = setupCreatureInBZ(s3, 'player', kanesill); // Gladiator, base 4000

      // Nemonex buffs Giant Insects by +2000
      const { nextState: s5 } = setupCreatureInBZ(s4, 'player', nemonex);
      const { nextState: s6, creature: cHornet } = setupCreatureInBZ(s5, 'player', forestHornet); // Giant Insect, base 4000

      // Comet Eye buffs Wild Veggies by +2000
      const { nextState: s7 } = setupCreatureInBZ(s6, 'player', cometEye);
      const { nextState: s8, creature: cBerry } = setupCreatureInBZ(s7, 'player', hustleBerry); // Wild Veggies, base 1000

      const pState = s8.players.player;
      assert.strictEqual(getCreatureEffectivePower(cEmeral, false, pState), 3000); // 1000 + 2000 = 3000
      assert.strictEqual(getCreatureEffectivePower(cKanesill, false, pState), 6000); // 4000 + 2000 = 6000
      assert.strictEqual(getCreatureEffectivePower(cHornet, false, pState), 6000); // 4000 + 2000 = 6000
      assert.strictEqual(getCreatureEffectivePower(cBerry, false, pState), 3000); // 1000 + 2000 = 3000

      // Hydrooze also makes Cyber Lords unblockable
      assert.strictEqual(isCreatureUnblockable(cEmeral, { type: 'shield', index: 0 }, [], pState.battleZone), true);
    });

    it('Techno Totem gives +1500 power attacker to other friendly creatures while tapped', () => {
      const state = createTestState();
      const { nextState: s1, creature: cTechno } = setupCreatureInBZ(state, 'player', technoTotem, { isTapped: true });
      const { nextState: s2, creature: cVorg } = setupCreatureInBZ(s1, 'player', vorg);

      const pState = s2.players.player;
      // Not attacking -> 2000
      assert.strictEqual(getCreatureEffectivePower(cVorg, false, pState), 2000);
      // Attacking while Techno Totem is tapped -> +1500 power attacker = 3500
      assert.strictEqual(getCreatureEffectivePower(cVorg, true, pState), 3500);
    });
  });

  // =========================================================================
  // 7. USER FEEDBACK REGRESSIONS AUDIT
  // =========================================================================
  describe('7. User Feedback Regressions: Survivor Sharing, Mana Civ Tapping & Optional Choices', () => {
    it('Mana rule: cannot summon Fire card if Fire mana is tapped, even with surplus other mana', () => {
      const manaZone = [
        { instanceId: 'm-fire', card: vorg, isTapped: true }, // Fire card tapped
        { instanceId: 'm-nat1', card: bronzeArm, isTapped: false },
        { instanceId: 'm-nat2', card: bronzeArm, isTapped: false },
        { instanceId: 'm-nat3', card: bronzeArm, isTapped: false },
        { instanceId: 'm-nat4', card: bronzeArm, isTapped: false },
        { instanceId: 'm-nat5', card: bronzeArm, isTapped: false }
      ];

      // Vorg requires 2 Fire mana. We have 5 untapped Nature, but 0 untapped Fire.
      assert.strictEqual(canPayManaCost(manaZone, vorg), false);

      // Untap the Fire card: now we have 1 untapped Fire and 5 untapped Nature (total 6 untapped, >= 2 cost)
      manaZone[0].isTapped = false;
      assert.strictEqual(canPayManaCost(manaZone, vorg), true);

      // payManaCost MUST tap the Fire card first!
      const payment = payManaCost(manaZone, vorg);
      assert.strictEqual(payment.success, true);
      const paidFire = payment.updatedManaZone.find((m) => m.instanceId === 'm-fire');
      assert.strictEqual(paidFire.isTapped, true, 'Fire card in mana must be tapped to pay for Fire spell/creature');
    });

    it('Survivor sharing: Smash Horn Q + Gallia Zohl + Gigaling + Rumblesaur + Spikestrike share all abilities', () => {
      const state = createTestState();
      const { nextState: s1, creature: cSmash } = setupCreatureInBZ(state, 'player', smashHorn); // +1000 power
      const { nextState: s2, creature: cGallia } = setupCreatureInBZ(s1, 'player', galliaZohl); // Blocker
      const { nextState: s3, creature: cGigaling } = setupCreatureInBZ(s2, 'player', gigaling); // Slayer
      const { nextState: s4, creature: cRumble } = setupCreatureInBZ(s3, 'player', rumblesaur); // Speed Attacker
      const { nextState: s5, creature: cSpike } = setupCreatureInBZ(s4, 'player', spikestrike); // Unblockable

      const bz = s5.players.player.battleZone;
      const pState = s5.players.player;

      // Every Survivor gets +1000 power from Smash Horn Q
      // Gallia base 2000 -> 3000
      assert.strictEqual(getCreatureEffectivePower(cGallia, false, pState), 3000);
      // Gigaling base 2000 -> 3000
      assert.strictEqual(getCreatureEffectivePower(cGigaling, false, pState), 3000);
      // Spikestrike base 3000 -> 4000
      assert.strictEqual(getCreatureEffectivePower(cSpike, false, pState), 4000);
      // Smash Horn itself gets +1000 = 3000
      assert.strictEqual(getCreatureEffectivePower(cSmash, false, pState), 3000);

      // Every Survivor has Blocker from Gallia Zohl
      assert.strictEqual(hasCreatureBlocker(cSmash, bz), true);
      assert.strictEqual(hasCreatureBlocker(cGigaling, bz), true);
      assert.strictEqual(hasCreatureBlocker(cSpike, bz), true);

      // Every Survivor has Slayer from Gigaling Q
      assert.strictEqual(hasCreatureSlayer(cSmash, bz), true);
      assert.strictEqual(hasCreatureSlayer(cGallia, bz), true);
      assert.strictEqual(hasCreatureSlayer(cSpike, bz), true);

      // Every Survivor has Speed Attacker from Rumblesaur Q
      assert.strictEqual(hasCreatureSpeedAttacker(cSmash, bz), true);
      assert.strictEqual(isSummoningSick(cSmash, s5.turn, bz), false);
      assert.strictEqual(isSummoningSick(cGallia, s5.turn, bz), false);

      // Every Survivor is unblockable from Spikestrike Ichthys Q
      assert.strictEqual(isCreatureUnblockable(cSmash, { type: 'player' }, [], bz), true);
      assert.strictEqual(isCreatureUnblockable(cGallia, { type: 'player' }, [], bz), true);
    });

    it('Survivor Ballus, Dogfight Enforcer Q untaps all friendly tapped Survivors at end of turn', () => {
      let state = createTestState();
      // Setup Ballus and Smash Horn both tapped
      const { nextState: s1, creature: cBallus } = setupCreatureInBZ(state, 'player', ballus, { isTapped: true });
      const { nextState: s2, creature: cSmash } = setupCreatureInBZ(s1, 'player', smashHorn, { isTapped: true });
      // Non-survivor Vorg tapped
      const { nextState: s3, creature: cVorg } = setupCreatureInBZ(s2, 'player', vorg, { isTapped: true });

      // Active player ends turn
      const nextState = step(s3, { type: 'END_TURN' });

      const bz = nextState.players.player.battleZone;
      const bBallus = bz.find((c) => c.instanceId === cBallus.instanceId);
      const bSmash = bz.find((c) => c.instanceId === cSmash.instanceId);
      const bVorg = bz.find((c) => c.instanceId === cVorg.instanceId);

      // Both Survivors untap
      assert.strictEqual(bBallus.isTapped, false, 'Ballus should be untapped');
      assert.strictEqual(bSmash.isTapped, false, 'Smash Horn should be untapped by Ballus ability');
      // Non-survivor remains tapped
      assert.strictEqual(bVorg.isTapped, true, 'Non-survivor Vorg should remain tapped');
    });

    it('Survivor Blazosaur Q has Power Attacker +1000 ONLY while attacking and shares with all Survivors', () => {
      const state = createTestState();
      // Setup Blazosaur Q and Gallia Zohl in battle zone
      const { nextState: s1, creature: cBlazo } = setupCreatureInBZ(state, 'player', blazosaur); // base 1000, PA +1000
      const { nextState: s2, creature: cGallia } = setupCreatureInBZ(s1, 'player', galliaZohl); // base 2000

      const pState = s2.players.player;

      // When NOT attacking, Blazosaur Q is 1000 power (Power Attacker does NOT boost power while sitting in BZ!)
      assert.strictEqual(getCreatureEffectivePower(cBlazo, false, pState), 1000, 'Blazosaur Q must have 1000 power when not attacking');
      // While attacking, Blazosaur Q gets +1000 power attacker = 2000
      assert.strictEqual(getCreatureEffectivePower(cBlazo, true, pState), 2000, 'Blazosaur Q gets +1000 PA while attacking');

      // Gallia Zohl receives shared Power Attacker +1000 from Blazosaur Q
      // When not attacking: base 2000
      assert.strictEqual(getCreatureEffectivePower(cGallia, false, pState), 2000, 'Gallia has base 2000 power when not attacking');
      // While attacking: gets +1000 PA from Blazosaur Q = 3000
      assert.strictEqual(getCreatureEffectivePower(cGallia, true, pState), 3000, 'Gallia gets +1000 PA from Blazosaur while attacking');

      // Now add Smash Horn Q (+1000 static power buff)
      const { nextState: s3, creature: cSmash } = setupCreatureInBZ(s2, 'player', smashHorn);
      const pStateWithSmash = s3.players.player;

      // With Smash Horn Q in battle zone:
      // Blazosaur Q static power is now 1000 + 1000 = 2000
      assert.strictEqual(getCreatureEffectivePower(cBlazo, false, pStateWithSmash), 2000, 'Blazosaur has 2000 static power with Smash Horn');
      // Blazosaur Q while attacking is 1000 (base) + 1000 (Smash) + 1000 (PA) = 3000
      assert.strictEqual(getCreatureEffectivePower(cBlazo, true, pStateWithSmash), 3000, 'Blazosaur has 3000 attacking power with Smash Horn + PA');
    });
  });
});
