import type {
  AttackTarget,
  CardInstance,
  CreatureInstance,
  GameState,
  PlayerId
} from './types.ts';
import {
  getCardCapabilities,
  getCardCivilizations,
  getCreatureRaces,
  getOpponentId,
  isSurvivorCard,
  normalizeRace
} from './cardUtils.ts';
import {
  getCreatureEffectivePower,
  getSurvivorSharedAbilities,
  hasCreatureBlocker,
  isWaveStriker
} from './continuous.ts';
import {
  addShieldFromDeck,
  bounceCreature,
  breakOpponentShields,
  destroyCreature,
  destroyCreaturesBatch,
  destroyOpponentShields,
  discardRandomHandCards,
  drawCards,
  rampTopDeckToManaZone,
  salvageFromGraveyard,
  searchDeckForCard,
  sendCreatureToManaZone,
  sendCreatureToTopOfDeck
} from './zones.ts';
import { toManaCard } from './mana.ts';
import {
  resolveWaveStrikerCIP,
  resolveTurboRushOnAttack,
  resolveTurboRushOnUnblocked,
  resolveTurboRushOnBlocked
} from './advancedMechanics.ts';
import {
  resolveAuraPegasusTopDeckReveal
} from './boardRemoval.ts';
import { buildZoneOptions, enqueueInteraction } from './interactionHelpers.ts';

/**
 * Helper: puts a chosen opponent creature on top of its owner's deck or resolves Emeral/Wind Axe/etc.
 */
function pickTargetByIdOrFallback(
  candidates: CreatureInstance[],
  targets?: string[]
): CreatureInstance | undefined {
  if (candidates.length === 0) return undefined;
  if (targets && targets.length > 0) {
    const exact = candidates.find((c) => c.instanceId === targets[0]);
    if (exact) return exact;
  }
  const sorted = [...candidates].sort(
    (a, b) => (b.card.power ?? 0) + b.powerModifier - ((a.card.power ?? 0) + a.powerModifier)
  );
  return sorted[0];
}

// ============================================================================
// 1. COME-INTO-PLAY (CIP) TRIGGERS
// ============================================================================

/**
 * Dispatches Come-Into-Play (CIP) creature effects when a creature enters the battle zone.
 */
export function triggerCIP(
  state: GameState,
  player: PlayerId,
  creature: CreatureInstance,
  targets?: string[]
): GameState {
  if (Boolean(state.winner)) return state;

  const card = creature.card;
  const cardName = getCardCapabilities(card).nameLower.trim();
  const rules = card.rulesText || '';
  const opponent = getOpponentId(player);
  let nextState = state;

  // Global watcher: Emperor Maroll ("Whenever you put another creature into the battle zone, return this creature to your hand.")
  for (const pid of ['player', 'opponent'] as const) {
    const marolls = nextState.players[pid].battleZone.filter(
      (c) =>
        c.instanceId !== creature.instanceId &&
        pid === player &&
        getCardCapabilities(c.card).nameLower.includes('emperor maroll')
    );
    for (const m of marolls) {
      nextState = bounceCreature(nextState, m.instanceId);
    }
  }

  // Global watcher: Vreemah, Freaky Mojo Totem ("Whenever you put another creature into the battle zone, each Beast Folk in the battle zone gets +2000 power and double breaker until end of turn")
  const vreemahCount = nextState.players[player].battleZone.filter(
    (c) =>
      c.instanceId !== creature.instanceId &&
      getCardCapabilities(c.card).nameLower.includes('vreemah')
  ).length;
  if (vreemahCount > 0) {
    for (const pid of ['player', 'opponent'] as const) {
      const bz = nextState.players[pid].battleZone;
      const updatedBZ = bz.map((c) =>
        getCreatureRaces(c).some((r) => normalizeRace(r) === 'beastfolk')
          ? { ...c, powerModifier: c.powerModifier + vreemahCount * 2000, tempDoubleBreaker: true }
          : c
      );
      nextState = {
        ...nextState,
        players: {
          ...nextState.players,
          [pid]: { ...nextState.players[pid], battleZone: updatedBZ }
        }
      };
    }
  }

  // 0. Survivor Come-Into-Play Abilities
  if (isSurvivorCard(card)) {
    let survivorState = nextState;
    const friendlyBZ = survivorState.players[player].battleZone;

    // Q-tronic Hypermind: draw 1 card for each Survivor in battle zone
    if (cardName.includes('q-tronic hypermind')) {
      const allSurvivors = [
        ...survivorState.players.player.battleZone,
        ...survivorState.players.opponent.battleZone
      ].filter((c) => isSurvivorCard(c.card));
      if (allSurvivors.length > 0) {
        survivorState = drawCards(survivorState, player, allSurvivors.length);
      }
    }

    // Ripple Lotus Q: tap an opponent creature
    const hasRippleLotus = friendlyBZ.some(
      (c) =>
        getCardCapabilities(c.card).nameLower.includes('ripple lotus') ||
        (isSurvivorCard(c.card) && /tap it/i.test(c.card.rulesText || ''))
    );
    if (hasRippleLotus) {
      const oppBZ = survivorState.players[opponent].battleZone;
      if (oppBZ.length > 0) {
        if (player === 'player' && survivorState.interactiveHuman && !targets?.length) {
          const opts = buildZoneOptions(survivorState, opponent, ['battleZone']);
          survivorState = enqueueInteraction(survivorState, {
            type: 'ZONE_SELECTION',
            player: 'player',
            sourceCardId: card.id,
            sourceCardName: 'Ripple Lotus Q',
            actionKind: 'PLAYER_TAP_OPP_BZ',
            prompt: 'Ripple Lotus Q: Choose an opponent creature to tap (or Skip).',
            options: opts,
            minSelections: 0,
            maxSelections: 1
          });
        } else {
          let targetId = targets?.find((tid) => oppBZ.some((c) => c.instanceId === tid));
          if (!targetId) {
            targetId = oppBZ.find((c) => !c.isTapped)?.instanceId || oppBZ[0].instanceId;
          }
          const targetCreature = oppBZ.find((c) => c.instanceId === targetId);
          survivorState = {
            ...survivorState,
            players: {
              ...survivorState.players,
              [opponent]: {
                ...survivorState.players[opponent],
                battleZone: oppBZ.map((c) => (c.instanceId === targetId ? { ...c, isTapped: true } : c))
              }
            },
            actionLog: [
              ...survivorState.actionLog,
              `${player} tapped ${targetCreature?.card.name ?? 'opponent creature'} with Survivor ability.`
            ]
          };
        }
      }
    }

    // Forbos, Sanctum Guardian Q: search deck for a spell to hand
    const hasForbos = friendlyBZ.some(
      (c) =>
        getCardCapabilities(c.card).nameLower.includes('forbos') ||
        (isSurvivorCard(c.card) && /take a spell from your deck/i.test(c.card.rulesText || ''))
    );
    if (hasForbos) {
      if (player === 'player' && !survivorState.pendingInteraction) {
        const matchingIds = survivorState.players.player.deck
          .filter((ci) => ci.card.type === 'Spell')
          .map((ci) => ci.instanceId);
        if (matchingIds.length > 0) {
          survivorState = {
            ...survivorState,
            pendingInteraction: {
              type: 'DECK_SEARCH',
              player: 'player',
              sourceCardName: 'Forbos, Sanctum Guardian Q',
              filterDescription: 'Spell',
              validCardInstanceIds: matchingIds,
              destination: 'hand'
            }
          };
        }
      } else if (player !== 'player') {
        survivorState = searchDeckForCard(survivorState, player, (c) => c.type === 'Spell', 'hand', { shuffleAfter: true });
      }
    }

    // Grave Worm Q: salvage a Survivor from graveyard to hand
    const hasGraveWorm = friendlyBZ.some(
      (c) =>
        getCardCapabilities(c.card).nameLower.includes('grave worm') ||
        (isSurvivorCard(c.card) && /return a survivor from your graveyard/i.test(c.card.rulesText || ''))
    );
    if (hasGraveWorm) {
      if (player === 'player' && survivorState.interactiveHuman) {
        const gyOpts = buildZoneOptions(survivorState, 'player', ['graveyard'], (o) => isSurvivorCard(o.card));
        if (gyOpts.length > 0) {
          survivorState = enqueueInteraction(survivorState, {
            type: 'ZONE_SELECTION',
            player: 'player',
            sourceCardId: card.id,
            sourceCardName: 'Grave Worm Q',
            actionKind: 'PLAYER_SALVAGE_GY',
            prompt: 'Grave Worm Q: Return a Survivor from your graveyard to your hand? (Optional)',
            options: gyOpts,
            minSelections: 0,
            maxSelections: 1
          });
        }
      } else {
        survivorState = salvageFromGraveyard(survivorState, player, (c) => isSurvivorCard(c), 'hand');
      }
    }

    // Factory Shell Q: search deck for a Survivor to hand
    const hasFactoryShell = friendlyBZ.some(
      (c) =>
        getCardCapabilities(c.card).nameLower.includes('factory shell') ||
        (isSurvivorCard(c.card) && /take a survivor from your deck/i.test(c.card.rulesText || ''))
    );
    if (hasFactoryShell) {
      if (player === 'player' && !survivorState.pendingInteraction) {
        const matchingIds = survivorState.players.player.deck
          .filter((ci) => isSurvivorCard(ci.card))
          .map((ci) => ci.instanceId);
        if (matchingIds.length > 0) {
          survivorState = {
            ...survivorState,
            pendingInteraction: {
              type: 'DECK_SEARCH',
              player: 'player',
              sourceCardName: 'Factory Shell Q',
              filterDescription: 'Survivor',
              validCardInstanceIds: matchingIds,
              destination: 'hand'
            }
          };
        }
      } else if (player !== 'player') {
        survivorState = searchDeckForCard(survivorState, player, (c) => isSurvivorCard(c), 'hand', { shuffleAfter: true });
      }
    }

    if (
      cardName.includes('q-tronic hypermind') ||
      hasRippleLotus ||
      hasForbos ||
      hasGraveWorm ||
      hasFactoryShell
    ) {
      return survivorState;
    }
  }

  // 0b. Wave Striker CIP Abilities
  if (isWaveStriker(card)) {
    const wsCIPState = resolveWaveStrikerCIP(nextState, player, creature, targets);
    if (wsCIPState) {
      return wsCIPState;
    }
  }

  // 0c. Wind Axe, the Warrior Savage: Destroy 1 opponent blocker + ramp top deck to mana
  if (cardName.includes('wind axe')) {
    const oppBZ = nextState.players[opponent].battleZone;
    const oppBlockers = oppBZ.filter((c) =>
      hasCreatureBlocker(c, oppBZ, nextState.players[player].battleZone, nextState.players[opponent])
    );
    if (player === 'player' && nextState.interactiveHuman && !targets?.length && oppBlockers.length > 0) {
      const opts = buildZoneOptions(nextState, opponent, ['battleZone'], (o) =>
        oppBlockers.some((b) => b.instanceId === o.instanceId)
      );
      nextState = rampTopDeckToManaZone(nextState, player, 1);
      return enqueueInteraction(nextState, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: card.id,
        sourceCardName: card.name,
        actionKind: 'OPPONENT_SACRIFICE_BZ',
        prompt: `${card.name}: Choose 1 opponent blocker to destroy.`,
        options: opts,
        minSelections: 1,
        maxSelections: 1
      });
    }
    const chosen = pickTargetByIdOrFallback(oppBlockers, targets);
    if (chosen) {
      nextState = destroyCreature(nextState, chosen.instanceId);
    }
    return rampTopDeckToManaZone(nextState, player, 1);
  }

  // 0d. Corile (DM-02): Choose one opponent creature and put it ON TOP OF HIS DECK (NOT hand!)
  if (cardName.includes('corile') || /put it on top of his deck/i.test(rules)) {
    const oppBZ = nextState.players[opponent].battleZone;
    if (player === 'player' && nextState.interactiveHuman && !targets?.length && oppBZ.length > 0) {
      const opts = buildZoneOptions(nextState, opponent, ['battleZone']);
      return enqueueInteraction(nextState, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: card.id,
        sourceCardName: card.name,
        actionKind: 'PLAYER_SEND_TOP_DECK',
        prompt: `${card.name}: Choose 1 opponent creature to put on top of their deck.`,
        options: opts,
        minSelections: 1,
        maxSelections: 1
      });
    }
    const chosen = pickTargetByIdOrFallback(oppBZ, targets);
    if (chosen) {
      return sendCreatureToTopOfDeck(nextState, chosen.instanceId);
    }
    return nextState;
  }

  // 0e. Emeral (DM-03): Add a card from hand to shields, then put a shield into hand (cannot trigger ST)
  if (cardName.includes('emeral')) {
    const pState = nextState.players[player];
    if (player === 'player' && nextState.interactiveHuman && !targets?.length && pState.hand.length > 0) {
      const handOpts = buildZoneOptions(nextState, 'player', ['hand']);
      return enqueueInteraction(nextState, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: card.id,
        sourceCardName: 'Emeral',
        actionKind: 'EMERAL_HAND_TO_SHIELD',
        prompt: 'Emeral: Choose 1 card from your hand to add to your shields (or Skip).',
        options: handOpts,
        minSelections: 0,
        maxSelections: 1
      });
    }
    if (pState.hand.length > 0 && pState.shields.length > 0) {
      // Pick non-multi-civ / high-cost shield filler from hand
      const sortedHand = [...pState.hand].sort(
        (a, b) => (b.card.isShieldTrigger ? 1 : 0) - (a.card.isShieldTrigger ? 1 : 0)
      );
      const cardToAdd = targets?.[0]
        ? pState.hand.find((c) => c.instanceId === targets[0]) || sortedHand[0]
        : sortedHand[0];
      const shieldToPick = pState.shields[0];
      const nextHand = [
        ...pState.hand.filter((c) => c.instanceId !== cardToAdd.instanceId),
        { instanceId: shieldToPick.id, card: shieldToPick.card, owner: player }
      ];
      const nextShields = [
        ...pState.shields.filter((s) => s.id !== shieldToPick.id),
        { id: cardToAdd.instanceId, shieldId: cardToAdd.instanceId, card: cardToAdd.card, isBroken: false }
      ];
      return {
        ...nextState,
        players: {
          ...nextState.players,
          [player]: {
            ...pState,
            hand: nextHand,
            shields: nextShields
          }
        },
        actionLog: [
          ...nextState.actionLog,
          `${player} swapped a card from hand with a shield using Emeral.`
        ]
      };
    }
    return nextState;
  }

  // 0f. Terradragon Gamiratar: When you put this into BZ, opponent may choose a creature in hand and put into BZ
  if (cardName.includes('terradragon gamiratar')) {
    const oppState = nextState.players[opponent];
    const handCreatures = oppState.hand.filter(
      (c) => c.card.type === 'Creature' && !c.card.isEvolution
    );
    if (opponent === 'player' && nextState.interactiveHuman && handCreatures.length > 0) {
      const opts = buildZoneOptions(
        nextState,
        'player',
        ['hand'],
        (o) => o.card.type === 'Creature' && !o.card.isEvolution
      );
      return enqueueInteraction(nextState, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: card.id,
        sourceCardName: card.name,
        actionKind: 'OPPONENT_PUT_CREATURES_HAND_TO_BZ',
        prompt: `${card.name}: You may choose 1 non-evolution creature from your hand to put into the battle zone.`,
        options: opts,
        minSelections: 0,
        maxSelections: 1
      });
    }
    if (handCreatures.length > 0) {
      const sorted = [...handCreatures].sort(
        (a, b) => (b.card.power ?? 0) - (a.card.power ?? 0)
      );
      const chosen = sorted[0];
      const nextCreature: CreatureInstance = {
        instanceId: chosen.instanceId,
        card: chosen.card,
        owner: opponent,
        isTapped: false,
        summonedTurn: nextState.turn - 1,
        powerModifier: 0
      };
      nextState = {
        ...nextState,
        players: {
          ...nextState.players,
          [opponent]: {
            ...oppState,
            hand: oppState.hand.filter((c) => c.instanceId !== chosen.instanceId),
            battleZone: [...oppState.battleZone, nextCreature]
          }
        },
        actionLog: [
          ...nextState.actionLog,
          `Terradragon Gamiratar allowed ${opponent} to put ${chosen.card.name} from hand into the battle zone!`
        ]
      };
      return triggerCIP(nextState, opponent, nextCreature);
    }
    return nextState;
  }

  // 0g. Fighter Dual Fang: Put top 2 cards of deck into mana zone
  if (cardName.includes('fighter dual fang')) {
    return rampTopDeckToManaZone(nextState, player, 2);
  }

  // 0h. Magmarex: Destroy all creatures that have power 1000
  if (cardName.includes('magmarex')) {
    const exact1000 = [...nextState.players.player.battleZone, ...nextState.players.opponent.battleZone]
      .filter((c) => getCreatureEffectivePower(c, false, nextState.players[c.owner], nextState.players[getOpponentId(c.owner)], false, nextState) === 1000)
      .map((c) => c.instanceId);
    return destroyCreaturesBatch(nextState, exact1000);
  }

  // 1. Bouncing Creature CIP Effect (Aqua Surfer, Aqua Sniper, Unicorn Fish, etc.)
  const bounceMatch = rules.match(
    /when you put this creature into the battle zone.*return (?:a|one|up to (\d+)|(\d+)) creatures? .* to (?:its|their) owner's hand/i
  );
  if (
    cardName.includes('aqua surfer') ||
    cardName.includes('aqua sniper') ||
    cardName.includes('unicorn fish') ||
    Boolean(bounceMatch)
  ) {
    let bounceCount = 1;
    if (
      cardName.includes('aqua sniper') ||
      (bounceMatch && (bounceMatch[1] === '2' || bounceMatch[2] === '2'))
    ) {
      bounceCount = 2;
    }

    let targetsToBounce: string[] = [];
    if (targets && targets.length > 0) {
      targetsToBounce = targets.slice(0, bounceCount);
    } else if (player === 'player' && nextState.interactiveHuman) {
      const bzOpts = [
        ...buildZoneOptions(nextState, opponent, ['battleZone']),
        ...buildZoneOptions(nextState, player, ['battleZone'])
      ];
      if (bzOpts.length > 0) {
        return enqueueInteraction(nextState, {
          type: 'ZONE_SELECTION',
          player: 'player',
          sourceCardId: card.id,
          sourceCardName: card.name,
          actionKind: 'OPPONENT_BOUNCE_BZ',
          prompt: `${card.name}: Choose up to ${bounceCount} creature(s) in the battle zone to return to hand (or Skip).`,
          options: bzOpts,
          minSelections: 0,
          maxSelections: Math.min(bounceCount, bzOpts.length)
        });
      }
      return nextState;
    } else {
      const opponentBZ = nextState.players[opponent].battleZone;
      if (opponentBZ.length > 0) {
        const sorted = [...opponentBZ].sort(
          (a, b) => (b.card.power ?? 0) + b.powerModifier - ((a.card.power ?? 0) + a.powerModifier)
        );
        targetsToBounce = sorted.slice(0, bounceCount).map((c) => c.instanceId);
      }
    }

    for (const tid of targetsToBounce) {
      nextState = bounceCreature(nextState, tid);
    }
    return nextState;
  }

  // 2. Tapping Opponent Creature CIP Effect (Miele, Kolon)
  const tapMatch =
    rules.match(
      /when you put this creature into the battle zone.*tap (?:1|one) of your opponent's creatures/i
    ) ||
    rules.match(
      /when you put this creature into the battle zone.*choose (?:1|one) of your opponent's creatures .* and tap it/i
    );
  if (cardName.includes('miele') || cardName.includes('kolon') || Boolean(tapMatch)) {
    const opponentBZ = nextState.players[opponent].battleZone;
    if (opponentBZ.length === 0) return nextState;

    if (player === 'player' && nextState.interactiveHuman && !targets?.length) {
      const opts = buildZoneOptions(nextState, opponent, ['battleZone']);
      return enqueueInteraction(nextState, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: card.id,
        sourceCardName: card.name,
        actionKind: 'PLAYER_TAP_OPP_BZ',
        prompt: `${card.name}: Choose 1 opponent creature to tap (or Skip).`,
        options: opts,
        minSelections: 0,
        maxSelections: 1
      });
    }

    let targetId = targets?.find((tid) => opponentBZ.some((c) => c.instanceId === tid));
    if (!targetId) {
      targetId = opponentBZ.find((c) => !c.isTapped)?.instanceId || opponentBZ[0].instanceId;
    }
    const targetCreature = opponentBZ.find((c) => c.instanceId === targetId);
    return {
      ...nextState,
      players: {
        ...nextState.players,
        [opponent]: {
          ...nextState.players[opponent],
          battleZone: opponentBZ.map((c) =>
            c.instanceId === targetId ? { ...c, isTapped: true } : c
          )
        }
      },
      actionLog: [
        ...nextState.actionLog,
        `${player} tapped ${targetCreature?.card.name ?? 'opponent creature'} with ${card.name}.`
      ]
    };
  }

  // 3. Shield Action CIP Effects (Fortress Shell, Aqua Patrol, Sven)
  const burnShieldMatch = rules.match(
    /choose up to (\d+) of your opponent's shields and put them into (?:his|their) graveyard/i
  );
  if (cardName.includes('fortress shell') || Boolean(burnShieldMatch)) {
    const count = burnShieldMatch ? parseInt(burnShieldMatch[1], 10) : 2;
    const oppShieldOpts = buildZoneOptions(nextState, opponent, ['shields'], undefined, { hideCards: true });
    const oppHasMeloppe = nextState.players[opponent].battleZone.some((c) =>
      getCardCapabilities(c.card).nameLower.includes('meloppe')
    );
    if (player === 'player' && nextState.interactiveHuman && !targets?.length && !oppHasMeloppe && oppShieldOpts.length > 0) {
      return enqueueInteraction(nextState, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: card.id,
        sourceCardName: card.name,
        actionKind: 'PLAYER_BURN_OPP_SHIELD',
        prompt: `${card.name}: Choose up to ${count} opponent shield(s) to put into graveyard.`,
        options: oppShieldOpts,
        minSelections: 0,
        maxSelections: Math.min(count, oppShieldOpts.length)
      });
    }
    return destroyOpponentShields(nextState, player, count, targets);
  }

  if (
    cardName.includes('aqua patrol') ||
    /choose (?:1|one) of your opponent's shields and put it into (?:his|their) deck/i.test(rules)
  ) {
    const oppShields = nextState.players[opponent].shields.filter((s) => !s.isBroken);
    if (oppShields.length === 0) return nextState;
    if (player === 'player' && nextState.interactiveHuman && !targets?.length) {
      const opts = buildZoneOptions(nextState, opponent, ['shields'], undefined, { hideCards: true });
      return enqueueInteraction(nextState, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: card.id,
        sourceCardName: card.name,
        actionKind: 'PLAYER_SHIELD_TO_DECK',
        prompt: `${card.name}: Choose 1 opponent shield to put into their deck.`,
        options: opts,
        minSelections: 0,
        maxSelections: 1
      });
    }
    const targetShield =
      targets && targets.length > 0
        ? oppShields.find((s) => s.id === targets[0] || s.shieldId === targets[0]) || oppShields[0]
        : oppShields[0];
    const nextShields = nextState.players[opponent].shields.filter((s) => s.id !== targetShield.id);
    const deckCard: CardInstance = {
      instanceId: targetShield.id,
      card: targetShield.card,
      owner: opponent
    };
    return {
      ...nextState,
      players: {
        ...nextState.players,
        [opponent]: {
          ...nextState.players[opponent],
          shields: nextShields,
          deck: [...nextState.players[opponent].deck, deckCard]
        }
      },
      actionLog: [
        ...nextState.actionLog,
        `${player} returned an opponent shield to their deck with ${card.name}.`
      ]
    };
  }

  if (
    cardName.includes('sven') ||
    /when you put this creature into the battle zone.*add the top card of your deck to your shields/i.test(
      rules
    )
  ) {
    return addShieldFromDeck(nextState, player, 1);
  }

  // 4. Mana Ramp CIP Effect (Bronze-Arm Tribe, Torcon)
  const rampCountMatch = rules.match(
    /when you put this creature into the battle zone.*put the top (?:(\d+) cards?|card) of your deck into your mana zone/i
  );
  if (
    cardName.includes('bronze-arm tribe') ||
    cardName.includes('torcon') ||
    Boolean(rampCountMatch)
  ) {
    const count = rampCountMatch?.[1] ? parseInt(rampCountMatch[1], 10) : 1;
    return rampTopDeckToManaZone(nextState, player, count);
  }

  // 5. Card Draw CIP Effects
  if (cardName.includes('illusionary merfolk')) {
    const friendlyBZ = nextState.players[player].battleZone;
    const hasOtherCyberLord = friendlyBZ.some(
      (c) =>
        c.instanceId !== creature.instanceId &&
        getCreatureRaces(c).some((r) => normalizeRace(r) === 'cyberlord')
    );
    return drawCards(nextState, player, hasOtherCyberLord ? 3 : 1);
  }

  const drawCIPMatch = rules.match(
    /when you put this creature into the battle zone.*draw (?:up to )?(?:a|1|(\d+)) cards?/i
  );
  if (
    cardName.includes('aqua hulcus') ||
    cardName.includes('magris') ||
    cardName.includes('king ripped-hide') ||
    Boolean(drawCIPMatch)
  ) {
    let count = 1;
    if (cardName.includes('king ripped-hide')) count = 2;
    else if (drawCIPMatch?.[1]) count = parseInt(drawCIPMatch[1], 10);
    if (
      player === 'player' &&
      nextState.interactiveHuman &&
      (/you may/i.test(rules) || cardName.includes('aqua hulcus') || cardName.includes('magris')) &&
      nextState.players[player].deck.length > 0
    ) {
      return enqueueInteraction(nextState, {
        type: 'OPTIONAL_CHOICE',
        player: 'player',
        sourceCardId: card.id,
        sourceInstanceId: creature.instanceId,
        abilityName: card.name,
        effectType: 'DRAW',
        drawCount: count,
        prompt: `${card.name}: Draw ${count} card(s)?`
      });
    }
    return drawCards(nextState, player, count);
  }

  // 6. Masked Horror or generic CIP Discard Effect
  if (
    cardName.includes('masked horror') ||
    (/when you put this creature into the battle zone/i.test(rules) &&
      /opponent discards (?:a|1|(\d+)) cards? at random/i.test(rules))
  ) {
    const discardMatch = rules.match(/opponent discards (?:a|1|(\d+)) cards? at random/i);
    const count = discardMatch?.[1] ? parseInt(discardMatch[1], 10) : 1;
    return discardRandomHandCards(nextState, opponent, count);
  }

  // 7. Rayla, Truth Enforcer (Search Deck for Spell)
  if (
    cardName.includes('rayla') ||
    (/when you put this creature into the battle zone.*search your deck/i.test(rules) &&
      /take a spell from your deck/i.test(rules))
  ) {
    return searchDeckForCard(nextState, player, (c) => c.type === 'Spell', 'hand', { shuffleAfter: true });
  }

  // 8. Gigargon (Graveyard Salvage for Creatures)
  if (
    cardName.includes('gigargon') ||
    /when you put this creature into the battle zone.*return up to (\d+) creatures from your graveyard to your hand/i.test(
      rules
    )
  ) {
    const salvageMatch = rules.match(/return up to (\d+) creatures from your graveyard to your hand/i);
    const salvageCount = salvageMatch ? parseInt(salvageMatch[1], 10) : 2;
    if (player === 'player' && nextState.interactiveHuman && !targets?.length) {
      const gyOpts = buildZoneOptions(nextState, 'player', ['graveyard'], (o) => o.card.type.includes('Creature'));
      if (gyOpts.length > 0) {
        return enqueueInteraction(nextState, {
          type: 'ZONE_SELECTION',
          player: 'player',
          sourceCardId: card.id,
          sourceCardName: card.name,
          actionKind: 'PLAYER_SALVAGE_GY',
          prompt: `${card.name}: Return up to ${salvageCount} creature(s) from your graveyard to your hand.`,
          options: gyOpts,
          minSelections: 0,
          maxSelections: Math.min(salvageCount, gyOpts.length)
        });
      }
      return nextState;
    }
    for (let i = 0; i < salvageCount; i++) {
      const hasCreature = nextState.players[player].graveyard.some((ci) =>
        ci.card.type.includes('Creature')
      );
      if (!hasCreature) break;
      nextState = salvageFromGraveyard(
        nextState,
        player,
        (c) => c.type.includes('Creature'),
        'hand'
      );
    }
    return nextState;
  }

  // 9. Swamp Worm / Storm Shell / Rothus / Dolmarks ("opponent chooses") & Zone CIP triggers
  if (cardName.includes('swamp worm')) {
    const oppBZ = nextState.players[opponent].battleZone;
    if (oppBZ.length === 0) return nextState;
    if (opponent === 'player' && nextState.interactiveHuman && !targets?.length) {
      return enqueueInteraction(nextState, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: card.id,
        sourceCardName: card.name,
        actionKind: 'OPPONENT_SACRIFICE_BZ',
        prompt: `${card.name}: Choose 1 of your creatures in the battle zone to destroy.`,
        options: buildZoneOptions(nextState, 'player', ['battleZone']),
        minSelections: 1,
        maxSelections: 1
      });
    }
    const lowest = [...oppBZ].sort((a, b) => (a.card.power ?? 0) - (b.card.power ?? 0))[0];
    return destroyCreature(nextState, lowest.instanceId);
  }

  if (cardName.includes('storm shell')) {
    const oppBZ = nextState.players[opponent].battleZone;
    if (oppBZ.length === 0) return nextState;
    if (opponent === 'player' && nextState.interactiveHuman && !targets?.length) {
      return enqueueInteraction(nextState, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: card.id,
        sourceCardName: card.name,
        actionKind: 'OPPONENT_MANA_SEND_BZ',
        prompt: `${card.name}: Choose 1 of your creatures in the battle zone to put into your mana zone.`,
        options: buildZoneOptions(nextState, 'player', ['battleZone']),
        minSelections: 1,
        maxSelections: 1
      });
    }
    const lowest = [...oppBZ].sort((a, b) => (a.card.power ?? 0) - (b.card.power ?? 0))[0];
    return sendCreatureToManaZone(nextState, lowest.instanceId);
  }

  if (cardName.includes('rothus, the traveler')) {
    const ownBZ = nextState.players[player].battleZone;
    if (player === 'player' && nextState.interactiveHuman && ownBZ.length > 0 && !targets?.length) {
      return enqueueInteraction(nextState, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: card.id,
        sourceCardName: card.name,
        actionKind: 'OPPONENT_SACRIFICE_BZ',
        prompt: `${card.name}: First choose 1 of your own creatures to destroy.`,
        options: buildZoneOptions(nextState, 'player', ['battleZone']),
        minSelections: 1,
        maxSelections: 1,
        contextData: { thenOppWeakestDestroy: true }
      });
    }
    if (ownBZ.length > 0) {
      const ownLowest = [...ownBZ].sort((a, b) => (a.card.power ?? 0) - (b.card.power ?? 0))[0];
      nextState = destroyCreature(nextState, ownLowest.instanceId);
    }
    const oppBZ = nextState.players[opponent].battleZone;
    if (oppBZ.length > 0) {
      if (opponent === 'player' && nextState.interactiveHuman) {
        return enqueueInteraction(nextState, {
          type: 'ZONE_SELECTION',
          player: 'player',
          sourceCardId: card.id,
          sourceCardName: card.name,
          actionKind: 'OPPONENT_SACRIFICE_BZ',
          prompt: `${card.name}: Choose 1 of your creatures in the battle zone to destroy.`,
          options: buildZoneOptions(nextState, 'player', ['battleZone']),
          minSelections: 1,
          maxSelections: 1
        });
      }
      const oppLowest = [...oppBZ].sort((a, b) => (a.card.power ?? 0) - (b.card.power ?? 0))[0];
      nextState = destroyCreature(nextState, oppLowest.instanceId);
    }
    return nextState;
  }

  if (cardName.includes('aqua deformer') || cardName === 'shtra') {
    const count = cardName.includes('aqua deformer') ? 2 : 1;
    for (const pid of [player, opponent]) {
      const pS = nextState.players[pid];
      if (pS.manaZone.length === 0) continue;
      const pickCount = Math.min(count, pS.manaZone.length);
      if (pid === 'player' && nextState.interactiveHuman && !targets?.length) {
        nextState = enqueueInteraction(nextState, {
          type: 'ZONE_SELECTION',
          player: 'player',
          sourceCardId: card.id,
          sourceCardName: card.name,
          actionKind: 'PLAYER_MANA_RECOVERY',
          prompt: `${card.name}: Choose ${pickCount} card(s) in your mana zone to return to your hand.`,
          options: buildZoneOptions(nextState, 'player', ['manaZone']),
          minSelections: pickCount,
          maxSelections: pickCount
        });
      } else {
        const ret = pS.manaZone.slice(0, pickCount);
        nextState = {
          ...nextState,
          players: {
            ...nextState.players,
            [pid]: {
              ...pS,
              manaZone: pS.manaZone.slice(pickCount),
              hand: [...pS.hand, ...ret.map((m) => ({ instanceId: m.instanceId, card: m.card, owner: pid }))]
            }
          },
          actionLog: [...nextState.actionLog, `${card.name}: ${pid} returned ${ret.length} card(s) from mana zone to hand.`]
        };
      }
    }
    return nextState;
  }

  if (cardName.includes('poisonous mushroom')) {
    const handOpts = buildZoneOptions(nextState, player, ['hand']);
    if (handOpts.length > 0 && player === 'player' && nextState.interactiveHuman) {
      return enqueueInteraction(nextState, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: card.id,
        sourceCardName: card.name,
        actionKind: 'PLAYER_HAND_TO_MANA',
        prompt: `${card.name}: Put 1 card from your hand into your mana zone? (Optional)`,
        options: handOpts,
        minSelections: 0,
        maxSelections: 1
      });
    }
    return nextState;
  }

  if (cardName.includes('thorny mandra')) {
    const gyOpts = buildZoneOptions(nextState, player, ['graveyard'], (o) => o.card.type.includes('Creature'));
    if (gyOpts.length > 0 && player === 'player' && nextState.interactiveHuman) {
      return enqueueInteraction(nextState, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: card.id,
        sourceCardName: card.name,
        actionKind: 'PLAYER_GRAVEYARD_TO_MANA',
        prompt: `${card.name}: Put 1 creature from your graveyard into your mana zone? (Optional)`,
        options: gyOpts,
        minSelections: 0,
        maxSelections: 1
      });
    }
    if (gyOpts.length > 0) {
      const picked = gyOpts[0];
      const pS = nextState.players[player];
      const gyCard = pS.graveyard.find((g) => g.instanceId === picked.instanceId);
      if (gyCard) {
        return {
          ...nextState,
          players: {
            ...nextState.players,
            [player]: {
              ...pS,
              graveyard: pS.graveyard.filter((g) => g.instanceId !== gyCard.instanceId),
              manaZone: [...pS.manaZone, toManaCard(gyCard)]
            }
          }
        };
      }
    }
    return nextState;
  }

  if (cardName.includes('wily carpenter')) {
    nextState = drawCards(nextState, player, 2);
    if (nextState.players[player].hand.length > 0) {
      const dCount = Math.min(2, nextState.players[player].hand.length);
      if (player === 'player' && nextState.interactiveHuman) {
        return enqueueInteraction(nextState, {
          type: 'ZONE_SELECTION',
          player: 'player',
          sourceCardId: card.id,
          sourceCardName: card.name,
          actionKind: 'PLAYER_DISCARD_FROM_HAND',
          prompt: `${card.name}: Choose ${dCount} card(s) from your hand to discard.`,
          options: buildZoneOptions(nextState, 'player', ['hand']),
          minSelections: dCount,
          maxSelections: dCount
        });
      }
      nextState = discardRandomHandCards(nextState, player, dCount);
    }
    return nextState;
  }

  if (cardName.includes('skeleton thief')) {
    const gyOpts = buildZoneOptions(nextState, player, ['graveyard'], (o) =>
      (o.card.races || []).some((r) => normalizeRace(r) === 'livingdead')
    );
    if (gyOpts.length > 0 && player === 'player' && nextState.interactiveHuman) {
      return enqueueInteraction(nextState, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: card.id,
        sourceCardName: card.name,
        actionKind: 'PLAYER_SALVAGE_GY',
        prompt: `${card.name}: Return a Living Dead from your graveyard to your hand? (Optional)`,
        options: gyOpts,
        minSelections: 0,
        maxSelections: 1
      });
    }
    return salvageFromGraveyard(
      nextState,
      player,
      (c) => (c.races || []).some((r) => normalizeRace(r) === 'livingdead'),
      'hand'
    );
  }

  if (cardName.includes('dimension splitter')) {
    const isDragon = (c: typeof card) =>
      (c.races || []).some((r) => {
        const nr = normalizeRace(r);
        return nr.includes('dragon') && !nr.includes('dragonoid');
      });
    const gyOpts = buildZoneOptions(nextState, player, ['graveyard'], (o) => isDragon(o.card));
    if (gyOpts.length > 0 && player === 'player' && nextState.interactiveHuman) {
      return enqueueInteraction(nextState, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: card.id,
        sourceCardName: card.name,
        actionKind: 'PLAYER_SALVAGE_GY',
        prompt: `${card.name}: Return Dragon creatures from your graveyard to your hand?`,
        options: gyOpts,
        minSelections: 0,
        maxSelections: gyOpts.length
      });
    }
    return nextState;
  }

  if (cardName.includes('stratosphere giant')) {
    const oppHandOpts = buildZoneOptions(
      nextState,
      opponent,
      ['hand'],
      (o) => o.card.type === 'Creature' && !o.card.isEvolution
    );
    if (oppHandOpts.length > 0) {
      if (opponent === 'player' && nextState.interactiveHuman) {
        return enqueueInteraction(nextState, {
          type: 'ZONE_SELECTION',
          player: 'player',
          sourceCardId: card.id,
          sourceCardName: card.name,
          actionKind: 'OPPONENT_PUT_CREATURES_HAND_TO_BZ',
          prompt: `${card.name}: You may choose up to 2 non-evolution creatures in your hand to put into the battle zone.`,
          options: oppHandOpts,
          minSelections: 0,
          maxSelections: Math.min(2, oppHandOpts.length)
        });
      }
      const pOpp = nextState.players[opponent];
      const sorted = oppHandOpts
        .sort((a, b) => (b.card.power ?? 0) - (a.card.power ?? 0))
        .slice(0, 2);
      const putSet = new Set(sorted.map((s) => s.instanceId));
      const summoned = sorted.map((s) => ({
        instanceId: s.instanceId,
        card: s.card,
        owner: opponent,
        isTapped: false,
        summonedTurn: nextState.turn,
        powerModifier: 0
      }));
      nextState = {
        ...nextState,
        players: {
          ...nextState.players,
          [opponent]: {
            ...pOpp,
            hand: pOpp.hand.filter((h) => !putSet.has(h.instanceId)),
            battleZone: [...pOpp.battleZone, ...summoned]
          }
        }
      };
    }
    return nextState;
  }

  if (cardName.includes('dolmarks')) {
    const pSelf = nextState.players[player];
    if (pSelf.battleZone.length > 0) {
      const ownLowest = [...pSelf.battleZone].sort((a, b) => (a.card.power ?? 0) - (b.card.power ?? 0))[0];
      nextState = destroyCreature(nextState, ownLowest.instanceId);
    }
    const pSelfAfter = nextState.players[player];
    if (pSelfAfter.manaZone.length > 0) {
      const m0 = pSelfAfter.manaZone[0];
      nextState = {
        ...nextState,
        players: {
          ...nextState.players,
          [player]: {
            ...pSelfAfter,
            manaZone: pSelfAfter.manaZone.slice(1),
            graveyard: [...pSelfAfter.graveyard, { instanceId: m0.instanceId, card: m0.card, owner: player }]
          }
        }
      };
    }
    const pOpp = nextState.players[opponent];
    if (pOpp.battleZone.length > 0) {
      if (opponent === 'player' && nextState.interactiveHuman) {
        nextState = enqueueInteraction(nextState, {
          type: 'ZONE_SELECTION',
          player: 'player',
          sourceCardId: card.id,
          sourceCardName: card.name,
          actionKind: 'OPPONENT_SACRIFICE_BZ',
          prompt: `${card.name}: Choose 1 of your creatures to destroy.`,
          options: buildZoneOptions(nextState, 'player', ['battleZone']),
          minSelections: 1,
          maxSelections: 1
        });
      } else {
        const oppLowest = [...pOpp.battleZone].sort((a, b) => (a.card.power ?? 0) - (b.card.power ?? 0))[0];
        nextState = destroyCreature(nextState, oppLowest.instanceId);
      }
    }
    const pOppAfter = nextState.players[opponent];
    if (pOppAfter.manaZone.length > 0) {
      if (opponent === 'player' && nextState.interactiveHuman) {
        nextState = enqueueInteraction(nextState, {
          type: 'ZONE_SELECTION',
          player: 'player',
          sourceCardId: card.id,
          sourceCardName: card.name,
          actionKind: 'PLAYER_MANA_TO_GY',
          prompt: `${card.name}: Choose 1 card in your mana zone to put into your graveyard.`,
          options: buildZoneOptions(nextState, 'player', ['manaZone']),
          minSelections: 1,
          maxSelections: 1
        });
      } else {
        const m0 = pOppAfter.manaZone[0];
        nextState = {
          ...nextState,
          players: {
            ...nextState.players,
            [opponent]: {
              ...pOppAfter,
              manaZone: pOppAfter.manaZone.slice(1),
              graveyard: [...pOppAfter.graveyard, { instanceId: m0.instanceId, card: m0.card, owner: opponent }]
            }
          }
        };
      }
    }
    return nextState;
  }

  return nextState;
}

// ============================================================================
// 2. ON-ATTACK TRIGGERS
// ============================================================================

/**
 * Dispatches on-attack abilities ("Whenever this creature attacks...").
 */
export function triggerAttack(
  state: GameState,
  player: PlayerId,
  attacker: CreatureInstance,
  target: AttackTarget
): GameState {
  if (Boolean(state.winner)) {
    return state;
  }

  const rules = attacker.card.rulesText || '';
  const nameLower = getCardCapabilities(attacker.card).nameLower;
  const opponent = getOpponentId(player);
  let nextState = state;

  // Headlong Giant: "Whenever this creature attacks, discard a card from your hand."
  if (nameLower.includes('headlong giant') && nextState.players[player].hand.length > 0) {
    nextState = discardRandomHandCards(nextState, player, 1);
  }

  // Überdragon Bajula: "Whenever this creature attacks, choose up to 2 cards in your opponent's mana zone. Your opponent puts those cards into his graveyard."
  if (nameLower.includes('bajula')) {
    const oppState = nextState.players[opponent];
    const burnCount = Math.min(2, oppState.manaZone.length);
    if (burnCount > 0) {
      const lostMana = oppState.manaZone.slice(0, burnCount);
      nextState = {
        ...nextState,
        players: {
          ...nextState.players,
          [opponent]: {
            ...oppState,
            manaZone: oppState.manaZone.slice(burnCount),
            graveyard: [
              ...oppState.graveyard,
              ...lostMana.map((m) => ({ instanceId: m.instanceId, card: m.card, owner: opponent }))
            ]
          }
        },
        actionLog: [
          ...nextState.actionLog,
          `Überdragon Bajula destroyed ${burnCount} card(s) in ${opponent}'s mana zone!`
        ]
      };
    }
  }

  // Wise Starnoid: "Whenever this creature attacks or leaves the battle zone, add the card on top of your deck to your shields face-down."
  if (nameLower.includes('wise starnoid')) {
    nextState = addShieldFromDeck(nextState, player, 1);
  }

  // Aura Pegasus: "Whenever this creature attacks or leaves the battle zone, reveal the top card of your deck..."
  if (nameLower.includes('aura pegasus')) {
    nextState = resolveAuraPegasusTopDeckReveal(nextState, player);
  }

  // Armored Warrior Quelos: each puts a non-fire mana card to graveyard
  if (nameLower.includes('quelos')) {
    for (const pid of [player, opponent]) {
      const ps = nextState.players[pid];
      const nonFireOpts = buildZoneOptions(
        nextState,
        pid,
        ['manaZone'],
        (o) => !getCardCivilizations(o.card).includes('Fire')
      );
      if (nonFireOpts.length > 0) {
        if (pid === 'player' && nextState.interactiveHuman) {
          nextState = enqueueInteraction(nextState, {
            type: 'ZONE_SELECTION',
            player: 'player',
            sourceCardId: attacker.card.id,
            sourceCardName: attacker.card.name,
            actionKind: 'PLAYER_MANA_TO_GY',
            prompt: 'Armored Warrior Quelos: Choose 1 non-Fire card in your mana zone to put into your graveyard.',
            options: nonFireOpts,
            minSelections: 1,
            maxSelections: 1
          });
        } else {
          const idx = ps.manaZone.findIndex((m) => !getCardCivilizations(m.card).includes('Fire'));
          if (idx !== -1) {
            const lost = ps.manaZone[idx];
            nextState = {
              ...nextState,
              players: {
                ...nextState.players,
                [pid]: {
                  ...ps,
                  manaZone: ps.manaZone.filter((_, i) => i !== idx),
                  graveyard: [...ps.graveyard, { instanceId: lost.instanceId, card: lost.card, owner: pid }]
                }
              },
              actionLog: [...nextState.actionLog, `Quelos sent ${lost.card.name} from ${pid}'s mana zone to graveyard.`]
            };
          }
        }
      }
    }
  }

  // 1. On-Attack Card Draw
  const drawMatch = rules.match(
    /whenever this creature attacks.*(?:you may )?draw (?:up to )?(?:a|1|(\d+)) cards?/i
  );
  if (
    nameLower.includes('snarling net') ||
    (nameLower.includes('galiac') && /draw/i.test(rules)) ||
    nameLower.includes('hypersquid walter') ||
    Boolean(drawMatch)
  ) {
    const drawCount = drawMatch?.[1] ? parseInt(drawMatch[1], 10) : 1;
    if (player === 'player' && nextState.interactiveHuman && /you may/i.test(rules) && nextState.players[player].deck.length > 0) {
      nextState = enqueueInteraction(nextState, {
        type: 'OPTIONAL_CHOICE',
        player: 'player',
        sourceCardId: attacker.card.id,
        sourceInstanceId: attacker.instanceId,
        abilityName: attacker.card.name,
        effectType: 'DRAW',
        drawCount,
        prompt: `${attacker.card.name}: Attack trigger — draw ${drawCount} card(s)?`
      });
    } else {
      nextState = drawCards(nextState, player, drawCount);
    }
  }

  // 2. On-Attack Opponent Discard
  const discardMatch =
    rules.match(
      /whenever this creature attacks.*(?:your )?opponent discards (?:a|1|(\d+)) cards?(?: at random)?/i
    ) || rules.match(/whenever this creature attacks.*opponent discards a card/i);
  if (nameLower.includes('gregoria') || nameLower.includes('gigamantis') || Boolean(discardMatch)) {
    const discardCount = discardMatch?.[1] ? parseInt(discardMatch[1], 10) : 1;
    nextState = discardRandomHandCards(nextState, opponent, discardCount);
  }

  // 2b. Survivor Attack Triggers (Split-Head Hydroturtle Q & Skullsweeper Q)
  if (isSurvivorCard(attacker.card)) {
    const friendlyBZ = state.players[player].battleZone;
    const survivorAbilities = getSurvivorSharedAbilities(friendlyBZ);

    if (survivorAbilities.hasAttackDraw) {
      const alreadyDrawn =
        Boolean(drawMatch) ||
        nameLower.includes('snarling net') ||
        nameLower.includes('hypersquid walter') ||
        (nameLower.includes('galiac') && /draw/i.test(rules));
      if (!alreadyDrawn) {
        if (player === 'player' && nextState.players[player].deck.length > 0 && !nextState.pendingInteraction) {
          nextState = {
            ...nextState,
            pendingInteraction: {
              type: 'OPTIONAL_CHOICE',
              player: 'player',
              sourceCardId: attacker.card.id,
              abilityName: 'Split-Head Hydroturtle Q',
              prompt:
                'Whenever this creature attacks, you may draw a card. Do you want to draw a card?',
              effectType: 'DRAW',
              drawCount: 1
            }
          };
        } else {
          nextState = drawCards(nextState, player, 1);
        }
      }
    }

    if (survivorAbilities.hasAttackDiscard) {
      const alreadyDiscarded =
        Boolean(discardMatch) ||
        nameLower.includes('gregoria') ||
        nameLower.includes('gigamantis');
      if (!alreadyDiscarded) {
        if (opponent === 'player' && nextState.interactiveHuman && nextState.players['player'].hand.length > 0) {
          const handOpts = buildZoneOptions(nextState, 'player', ['hand']);
          nextState = enqueueInteraction(nextState, {
            type: 'ZONE_SELECTION',
            player: 'player',
            sourceCardId: attacker.card.id,
            sourceCardName: 'Skullsweeper Q',
            actionKind: 'OPPONENT_DISCARD_HAND',
            prompt: 'Skullsweeper Q: Choose 1 card from your hand to discard.',
            options: handOpts,
            minSelections: 1,
            maxSelections: 1
          });
        } else {
          nextState = discardRandomHandCards(nextState, opponent, 1);
        }
      }
    }
  }

  // 3. On-Attack Shield Add
  if (
    nameLower.includes('cosmic wing') ||
    /whenever this creature attacks[^.]*add the top card of your deck to your shields/i.test(rules)
  ) {
    nextState = addShieldFromDeck(nextState, player, 1);
  }

  // 4. On-Attack Destruction
  const destroyBlockerMatch = rules.match(
    /whenever this creature attacks.*destroy (?:one|1) of your opponent's creatures that has ["']?blocker["']?/i
  );
  if (destroyBlockerMatch) {
    const oppBZ = nextState.players[opponent].battleZone;
    const oppBlockers = oppBZ.filter((c) =>
      hasCreatureBlocker(c, oppBZ, nextState.players[player].battleZone, nextState.players[opponent])
    );
    const chosen = pickTargetByIdOrFallback(oppBlockers);
    if (chosen) nextState = destroyCreature(nextState, chosen.instanceId);
  }

  const destroyPowerMatch = rules.match(
    /whenever this creature attacks.*destroy (?:one|1) of your opponent's creatures (?:that has|with) power (\d+) or less/i
  );
  if (
    destroyPowerMatch ||
    (nameLower.includes('valdios') && /destroy/i.test(rules)) ||
    (nameLower.includes('gatling skyterror') && /destroy/i.test(rules))
  ) {
    const maxPower = destroyPowerMatch ? parseInt(destroyPowerMatch[1], 10) : 2000;
    const validOpponents = nextState.players[opponent].battleZone.filter(
      (c) => (c.card.power ?? 0) + c.powerModifier <= maxPower
    );
    const chosen = pickTargetByIdOrFallback(validOpponents);
    if (chosen) nextState = destroyCreature(nextState, chosen.instanceId);
  }

  // 5. On-Attack Tapping Opponent Creature
  const tapOnAttackMatch = rules.match(
    /whenever this creature attacks.*(?:tap (?:one|1) of your opponent's creatures|choose (?:a|an|one|1) .*creature .* and tap it)/i
  );
  if (tapOnAttackMatch) {
    const oppBZ = nextState.players[opponent].battleZone;
    const untapped = oppBZ.filter((c) => !c.isTapped);
    if (untapped.length > 0) {
      let candidates = untapped;
      if (/darkness or fire/i.test(rules)) {
        candidates = untapped.filter((c) =>
          getCardCivilizations(c.card).some((civ) => civ === 'Darkness' || civ === 'Fire')
        );
      }
      if (candidates.length > 0) {
        const targetToTap = candidates[0];
        nextState = {
          ...nextState,
          players: {
            ...nextState.players,
            [opponent]: {
              ...nextState.players[opponent],
              battleZone: oppBZ.map((c) =>
                c.instanceId === targetToTap.instanceId ? { ...c, isTapped: true } : c
              )
            }
          },
          actionLog: [
            ...nextState.actionLog,
            `${attacker.card.name} tapped ${targetToTap.card.name} on attack.`
          ]
        };
      }
    }
  }

  // 6. On-Attack Power Buff
  const powerMatch =
    rules.match(
      /whenever this creature attacks(?: a creature)?.*(?:this creature|it) gets \+(\d+) power/i
    ) ||
    rules.match(
      /whenever this creature attacks(?: a creature)?.*(?:this creature|it) gets ["']?power attacker \+(\d+)["']?/i
    );
  if (powerMatch) {
    const isAttackingCreatureOnly = /attacks a creature/i.test(powerMatch[0]);
    if (!isAttackingCreatureOnly || target.type === 'creature') {
      const buff = parseInt(powerMatch[1], 10);
      nextState = {
        ...nextState,
        players: {
          ...nextState.players,
          [player]: {
            ...nextState.players[player],
            battleZone: nextState.players[player].battleZone.map((c) =>
              c.instanceId === attacker.instanceId
                ? { ...c, powerModifier: (c.powerModifier || 0) + buff }
                : c
            )
          }
        },
        actionLog: [...nextState.actionLog, `${attacker.card.name} gained +${buff} power on attack.`]
      };
    }
  }

  // 7. On-Attack Mana Ramp
  if (/whenever this creature attacks[^.]*put the top card of your deck into your mana zone/i.test(rules)) {
    nextState = rampTopDeckToManaZone(nextState, player, 1);
  }

  // 8. On-Attack Return Mana to Hand (Bloodwing Mantis)
  const manaToHandMatch = rules.match(
    /whenever this creature attacks.*return (\d+) creatures? from your mana zone to your hand/i
  );
  if (manaToHandMatch) {
    const count = parseInt(manaToHandMatch[1], 10);
    const playerMana = nextState.players[player].manaZone;
    const manaCreatureOpts = buildZoneOptions(nextState, player, ['manaZone'], (o) => o.card.type.includes('Creature'));
    if (player === 'player' && nextState.interactiveHuman && manaCreatureOpts.length > 0) {
      const pickCount = Math.min(count, manaCreatureOpts.length);
      nextState = enqueueInteraction(nextState, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: attacker.card.id,
        sourceCardName: attacker.card.name,
        actionKind: 'PLAYER_MANA_RECOVERY',
        prompt: `${attacker.card.name}: Return ${pickCount} creature(s) from your mana zone to your hand.`,
        options: manaCreatureOpts,
        minSelections: pickCount,
        maxSelections: pickCount
      });
    } else {
      const toReturn = playerMana.filter((m) => m.card.type.includes('Creature')).slice(0, count);
      if (toReturn.length > 0) {
        const returnIds = new Set(toReturn.map((m) => m.instanceId));
        nextState = {
          ...nextState,
          players: {
            ...nextState.players,
            [player]: {
              ...nextState.players[player],
              manaZone: playerMana.filter((m) => !returnIds.has(m.instanceId)),
              hand: [
                ...nextState.players[player].hand,
                ...toReturn.map((m) => ({ instanceId: m.instanceId, card: m.card, owner: player }))
              ]
            }
          },
          actionLog: [
            ...nextState.actionLog,
            `${attacker.card.name} returned ${toReturn.map((m) => m.card.name).join(', ')} from mana zone to hand.`
          ]
        };
      }
    }
  }

  // 8b. Storm Wrangler: "Whenever this creature attacks, you may choose one of your opponent's untapped creatures that has 'blocker.' This turn, that creature blocks this creature if able and this creature can't be blocked by other creatures."
  if (nameLower.includes('storm wrangler')) {
    const oppBZ = nextState.players[opponent].battleZone;
    const oppUntappedBlockers = oppBZ.filter(
      (c) => !c.isTapped && hasCreatureBlocker(c, oppBZ, nextState.players[player].battleZone, nextState.players[opponent])
    );
    if (oppUntappedBlockers.length > 0) {
      if (player === 'player' && nextState.interactiveHuman) {
        const blockerOpts = buildZoneOptions(nextState, opponent, ['battleZone'], (o) =>
          oppUntappedBlockers.some((b) => b.instanceId === o.instanceId)
        );
        nextState = enqueueInteraction(nextState, {
          type: 'ZONE_SELECTION',
          player: 'player',
          sourceCardId: attacker.card.id,
          sourceCardName: attacker.card.name,
          actionKind: 'PLAYER_STORM_WRANGLER_BLOCKER',
          prompt: `${attacker.card.name}: Choose 1 opponent untapped blocker to force-block (or Skip).`,
          options: blockerOpts,
          minSelections: 0,
          maxSelections: 1,
          contextData: { attackerId: attacker.instanceId }
        });
      } else {
        // Pick strongest blocker or first blocker (or explicit target if passed)
        const chosenBlocker = pickTargetByIdOrFallback(
          [...oppUntappedBlockers].sort((a, b) => (b.card.power ?? 0) - (a.card.power ?? 0))
        );
        if (chosenBlocker) {
          nextState = {
            ...nextState,
            players: {
              ...nextState.players,
              [opponent]: {
                ...nextState.players[opponent],
                battleZone: oppBZ.map((c) =>
                  c.instanceId === chosenBlocker.instanceId
                    ? { ...c, tempMustBlockTargetId: attacker.instanceId }
                    : c
                )
              }
            },
            actionLog: [
              ...nextState.actionLog,
              `Storm Wrangler forced ${chosenBlocker.card.name} to block if able!`
            ]
          };
        }
      }
    }
  }

  // 9. Amber Piercer & Wyn / Stinger Ball on-attack triggers
  if (nameLower.includes('amber piercer') && player === 'player' && nextState.interactiveHuman) {
    const gyOpts = buildZoneOptions(nextState, 'player', ['graveyard'], (o) => o.card.type.includes('Creature'));
    if (gyOpts.length > 0) {
      nextState = enqueueInteraction(nextState, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: attacker.card.id,
        sourceCardName: attacker.card.name,
        actionKind: 'PLAYER_SALVAGE_GY',
        prompt: `${attacker.card.name}: Return a creature from your graveyard to your hand? (Optional)`,
        options: gyOpts,
        minSelections: 0,
        maxSelections: 1
      });
    }
  }
  if ((nameLower.includes('wyn') || nameLower.includes('stinger ball')) && player === 'player' && nextState.interactiveHuman) {
    const oppShieldOpts = buildZoneOptions(nextState, opponent, ['shields'], undefined, { hideCards: true });
    if (oppShieldOpts.length > 0) {
      nextState = enqueueInteraction(nextState, {
        type: 'ZONE_SELECTION',
        player: 'player',
        sourceCardId: attacker.card.id,
        sourceCardName: attacker.card.name,
        actionKind: 'PLAYER_SHIELD_PEEK',
        prompt: `${attacker.card.name}: Look at 1 of your opponent's shields? (Optional)`,
        options: oppShieldOpts,
        minSelections: 0,
        maxSelections: 1
      });
    }
  }

  // 10. Turbo Rush On-Attack Triggers
  nextState = resolveTurboRushOnAttack(nextState, player, attacker);

  return nextState;
}

// ============================================================================
// 3. ON-BLOCKED & ON-UNBLOCKED TRIGGERS
// ============================================================================

/**
 * Triggers when an attack becomes blocked by `blocker`:
 * - Emperor Maroll: returns blocking creature to hand
 * - Avalanche Giant / Splinterclaw Wasp / Spinning Totem (Nature): breaks 1 opponent shield
 * - Carbonite Scarab (Turbo Rush): breaks 1 opponent shield
 * - Coliseum Shell: puts top card of deck into mana zone
 * - Creeping Plague: grants Slayer to attacker until EOT
 * - Agira: if blocker is Gladiator or Earth Eater, owner may draw 1 card
 */
export function triggerBlocked(
  state: GameState,
  attackingPlayer: PlayerId,
  attacker: CreatureInstance,
  blocker: CreatureInstance
): GameState {
  if (Boolean(state.winner)) return state;
  let nextState = state;
  const defendingPlayer = getOpponentId(attackingPlayer);
  const attName = getCardCapabilities(attacker.card).nameLower;

  // Creeping Plague: blocked attacker gets Slayer until EOT
  if (nextState.players[attackingPlayer].tempSlayerOnBlockedThisTurn) {
    nextState = {
      ...nextState,
      players: {
        ...nextState.players,
        [attackingPlayer]: {
          ...nextState.players[attackingPlayer],
          battleZone: nextState.players[attackingPlayer].battleZone.map((c) =>
            c.instanceId === attacker.instanceId ? { ...c, tempSlayer: true } : c
          )
        }
      },
      actionLog: [...nextState.actionLog, `Creeping Plague granted Slayer to ${attacker.card.name}!`]
    };
  }

  // Emperor Maroll: "Whenever this creature becomes blocked, return the blocking creature to its owner's hand."
  if (attName.includes('emperor maroll')) {
    nextState = bounceCreature(nextState, blocker.instanceId);
  }

  // Avalanche Giant / Splinterclaw Wasp: break 1 opponent shield when blocked
  if (attName.includes('avalanche giant') || attName.includes('splinterclaw wasp')) {
    nextState = breakOpponentShields(nextState, attackingPlayer, 1, { attacker });
  }

  // Spinning Totem ($tap aura): whenever any Nature creature attacking player becomes blocked, break 1 shield
  if (
    nextState.players[attackingPlayer].tempNatureShieldBreakOnBlockedThisTurn &&
    getCardCivilizations(attacker.card).includes('Nature')
  ) {
    nextState = breakOpponentShields(nextState, attackingPlayer, 1, { attacker });
  }

  // Storm Wrangler: +3000 power when blocked
  if (attName.includes('storm wrangler')) {
    nextState = {
      ...nextState,
      players: {
        ...nextState.players,
        [attackingPlayer]: {
          ...nextState.players[attackingPlayer],
          battleZone: nextState.players[attackingPlayer].battleZone.map((c) =>
            c.instanceId === attacker.instanceId ? { ...c, powerModifier: c.powerModifier + 3000 } : c
          )
        }
      }
    };
  }

  // Coliseum Shell: ramp 1 mana when blocked ("you may")
  if (attName.includes('coliseum shell')) {
    if (attackingPlayer === 'player' && nextState.interactiveHuman && nextState.players['player'].deck.length > 0) {
      nextState = enqueueInteraction(nextState, {
        type: 'OPTIONAL_CHOICE',
        player: 'player',
        sourceCardId: attacker.card.id,
        sourceInstanceId: attacker.instanceId,
        abilityName: attacker.card.name,
        effectType: 'MANA_RAMP',
        prompt: `${attacker.card.name}: Became blocked — put top card of deck into mana zone?`
      });
    } else {
      nextState = rampTopDeckToManaZone(nextState, attackingPlayer, 1);
    }
  }

  // Carbonite Scarab (Turbo Rush): break 1 shield when blocked
  nextState = resolveTurboRushOnBlocked(nextState, attackingPlayer, attacker);

  // Agira, the Warlord Crawler: Whenever one of your Gladiators or Earth Eaters blocks, draw 1 card
  const hasAgira = nextState.players[defendingPlayer].battleZone.some((c) =>
    getCardCapabilities(c.card).nameLower.includes('agira')
  );
  if (
    hasAgira &&
    getCreatureRaces(blocker).some((r) => {
      const nr = normalizeRace(r);
      return nr === 'gladiator' || nr === 'eartheater';
    })
  ) {
    if (defendingPlayer === 'player' && nextState.interactiveHuman && nextState.players['player'].deck.length > 0) {
      nextState = enqueueInteraction(nextState, {
        type: 'OPTIONAL_CHOICE',
        player: 'player',
        sourceCardId: 'agira',
        abilityName: 'Agira, the Warlord Crawler',
        effectType: 'DRAW',
        drawCount: 1,
        prompt: 'Agira, the Warlord Crawler: Draw 1 card?'
      });
    } else {
      nextState = drawCards(nextState, defendingPlayer, 1);
    }
  }

  const blkName = getCardCapabilities(blocker.card).nameLower;
  if (blkName.includes('tropic crawler')) {
    const attBZ = nextState.players[attackingPlayer].battleZone;
    if (attBZ.length > 0) {
      if (attackingPlayer === 'player' && nextState.interactiveHuman) {
        nextState = enqueueInteraction(nextState, {
          type: 'ZONE_SELECTION',
          player: 'player',
          sourceCardId: blocker.card.id,
          sourceCardName: blocker.card.name,
          actionKind: 'OPPONENT_BOUNCE_BZ',
          prompt: `${blocker.card.name}: Choose 1 of your creatures in the battle zone to return to your hand.`,
          options: buildZoneOptions(nextState, 'player', ['battleZone']),
          minSelections: 1,
          maxSelections: 1
        });
      } else {
        const weakest = [...attBZ].sort((a, b) => (a.card.power ?? 0) - (b.card.power ?? 0))[0];
        nextState = bounceCreature(nextState, weakest.instanceId);
      }
    }
  }

  return nextState;
}

/**
 * Triggers when an attack is unblocked:
 * - Nemonex, Bajula's Robomantis: Whenever Xeno Parts or Giant Insects attacks unblocked, opp puts 1 mana into graveyard
 * - Solar Grass / Gachack (Turbo Rush)
 * - Tentacle Cluster / Trixo / Quakesaur / Shock Trooper Mykee / Cavern Raider / Cyclolink
 */
export function triggerUnblocked(
  state: GameState,
  attackingPlayer: PlayerId,
  attacker: CreatureInstance,
  target: AttackTarget
): GameState {
  if (Boolean(state.winner)) return state;
  let nextState = state;
  const defendingPlayer = getOpponentId(attackingPlayer);
  const attName = getCardCapabilities(attacker.card).nameLower;

  // Nemonex, Bajula's Robomantis aura (only when attacking opponent, per DM card text "is attacking and isn't blocked")
  if (target.type === 'shield' || target.type === 'player') {
    const hasNemonex = nextState.players[attackingPlayer].battleZone.some((c) =>
      getCardCapabilities(c.card).nameLower.includes('nemonex')
    );
    const isXenoOrInsect = getCreatureRaces(attacker).some((r) => {
      const nr = normalizeRace(r);
      return nr === 'xenoparts' || nr === 'giantinsect';
    });
    if (hasNemonex && isXenoOrInsect) {
      const defState = nextState.players[defendingPlayer];
      if (defState.manaZone.length > 0) {
        if (defendingPlayer === 'player' && nextState.interactiveHuman) {
          const manaOpts = buildZoneOptions(nextState, 'player', ['manaZone']);
          nextState = enqueueInteraction(nextState, {
            type: 'ZONE_SELECTION',
            player: 'player',
            sourceCardId: attacker.card.id,
            sourceCardName: 'Nemonex, Bajula\'s Robomantis',
            actionKind: 'PLAYER_MANA_TO_GY',
            prompt: 'Nemonex: Choose 1 card in your mana zone to put into your graveyard.',
            options: manaOpts,
            minSelections: 1,
            maxSelections: 1
          });
        } else {
          const lostMana = defState.manaZone[0];
          nextState = {
            ...nextState,
            players: {
              ...nextState.players,
              [defendingPlayer]: {
                ...defState,
                manaZone: defState.manaZone.slice(1),
                graveyard: [
                  ...defState.graveyard,
                  { instanceId: lostMana.instanceId, card: lostMana.card, owner: defendingPlayer }
                ]
              }
            },
            actionLog: [
              ...nextState.actionLog,
              `Nemonex triggered: ${defendingPlayer} put ${lostMana.card.name} from mana zone into graveyard.`
            ]
          };
        }
      }
    }
  }

  if (target.type !== 'creature') {
    if (attName.includes('tentacle cluster') && nextState.players[defendingPlayer].battleZone.length > 0) {
      nextState = bounceCreature(nextState, nextState.players[defendingPlayer].battleZone[0].instanceId);
    }
    if (attName.includes('trixo') && nextState.players[defendingPlayer].battleZone.length > 0) {
      if (defendingPlayer === 'player' && nextState.interactiveHuman) {
        const bzOpts = buildZoneOptions(nextState, 'player', ['battleZone']);
        nextState = enqueueInteraction(nextState, {
          type: 'ZONE_SELECTION',
          player: 'player',
          sourceCardId: attacker.card.id,
          sourceCardName: attacker.card.name,
          actionKind: 'OPPONENT_SACRIFICE_BZ',
          prompt: `${attacker.card.name}: Choose 1 of your creatures to destroy.`,
          options: bzOpts,
          minSelections: 1,
          maxSelections: 1
        });
      } else {
        nextState = destroyCreature(nextState, nextState.players[defendingPlayer].battleZone[0].instanceId);
      }
    }
    if (attName.includes('quakesaur') && nextState.players[defendingPlayer].manaZone.length > 0) {
      if (defendingPlayer === 'player' && nextState.interactiveHuman) {
        const manaOpts = buildZoneOptions(nextState, 'player', ['manaZone']);
        nextState = enqueueInteraction(nextState, {
          type: 'ZONE_SELECTION',
          player: 'player',
          sourceCardId: attacker.card.id,
          sourceCardName: attacker.card.name,
          actionKind: 'PLAYER_MANA_TO_GY',
          prompt: `${attacker.card.name}: Choose 1 card in your mana zone to put into your graveyard.`,
          options: manaOpts,
          minSelections: 1,
          maxSelections: 1
        });
      } else {
        const defS = nextState.players[defendingPlayer];
        const m0 = defS.manaZone[0];
        nextState = {
          ...nextState,
          players: {
            ...nextState.players,
            [defendingPlayer]: {
              ...defS,
              manaZone: defS.manaZone.slice(1),
              graveyard: [...defS.graveyard, { instanceId: m0.instanceId, card: m0.card, owner: defendingPlayer }]
            }
          }
        };
      }
    }
    if (attName.includes('shock trooper mykee')) {
      const small = nextState.players[defendingPlayer].battleZone.find(
        (c) => (c.card.power ?? 0) + c.powerModifier <= 3000
      );
      if (small) nextState = destroyCreature(nextState, small.instanceId);
    }
    if (attName.includes('cavern raider')) {
      if (attackingPlayer === 'player' && nextState.interactiveHuman) {
        const validIds = nextState.players['player'].deck
          .filter((ci) => ci.card.type.includes('Creature'))
          .map((ci) => ci.instanceId);
        if (validIds.length > 0) {
          nextState = enqueueInteraction(nextState, {
            type: 'DECK_SEARCH',
            player: 'player',
            sourceCardName: attacker.card.name,
            filterDescription: 'Creature',
            validCardInstanceIds: validIds,
            destination: 'hand'
          });
        }
      } else {
        nextState = searchDeckForCard(nextState, attackingPlayer, (c) => c.type.includes('Creature'), 'hand', { shuffleAfter: true });
      }
    }
    if (attName.includes('cyclolink')) {
      if (attackingPlayer === 'player' && nextState.interactiveHuman) {
        const validIds = nextState.players['player'].deck
          .filter((ci) => ci.card.type === 'Spell')
          .map((ci) => ci.instanceId);
        if (validIds.length > 0) {
          nextState = enqueueInteraction(nextState, {
            type: 'DECK_SEARCH',
            player: 'player',
            sourceCardName: attacker.card.name,
            filterDescription: 'Spell',
            validCardInstanceIds: validIds,
            destination: 'hand'
          });
        }
      } else {
        nextState = searchDeckForCard(nextState, attackingPlayer, (c) => c.type === 'Spell', 'hand', { shuffleAfter: true });
      }
    }
  }

  return resolveTurboRushOnUnblocked(nextState, attackingPlayer, attacker);
}

// ============================================================================
// 4. END-OF-TURN TRIGGERS & TEMPORARY STATE RESET
// ============================================================================

function clearTurnCreatureFields(c: CreatureInstance): CreatureInstance {
  return {
    ...c,
    powerModifier: 0,
    tempPowerAttackerBonus: 0,
    tempDoubleBreaker: undefined,
    tempTripleBreaker: undefined,
    tempSlayer: undefined,
    tempSpeedAttacker: undefined,
    tempUnblockable: undefined,
    tempCanAttackUntapped: undefined,
    tempCantAttack: undefined,
    tempCantAttackPlayers: undefined,
    tempDestroyAfterBattle: undefined,
    tempUntapOnWinBattle: undefined,
    tempUntapAtEndTurn: undefined,
    tempBreakShieldOnBlocked: undefined,
    tempMustBlockTargetId: undefined,
    tempExtraRaces: undefined
  };
}

/**
 * Dispatches ALL end-of-turn abilities for `activePlayer` and resets end-of-turn temporary modifiers:
 * 1. Self-sacrifice & self-bounce (Cutthroat Skyterror, Balesk Baj, Kachua dragons) using unified zone removal!
 * 2. Untap vigilance: Toel ("untap all"), Comet Eye (Wild Veggies/Rainbow Phantoms), Ballus (Survivors),
 *    Urth / Frei / Ruby Grass / Betrale / Lukia Lex / Nial / Laveil / Siri (0 shields) / Whisking Whirlwind / Lunar Charger!
 * 3. Cleans up temporary end-of-turn creature & player flags.
 */
export function triggerEndTurn(state: GameState, activePlayer: PlayerId): GameState {
  if (Boolean(state.winner)) {
    return state;
  }

  let nextState = state;
  const activeState = nextState.players[activePlayer];
  const initialBZ = [...activeState.battleZone];

  // 1. End-of-turn self-sacrifice & self-bounce
  const toDestroy: CreatureInstance[] = [];
  const toBounce: CreatureInstance[] = [];
  for (const c of initialBZ) {
    const caps = getCardCapabilities(c.card);
    if (caps.selfDestroyAtEndTurn || c.tempDestroyAtEndTurn) {
      toDestroy.push(c);
    } else if (caps.selfBounceAtEndTurn) {
      toBounce.push(c);
    }
  }

  if (toDestroy.length > 0) {
    nextState = destroyCreaturesBatch(
      nextState,
      toDestroy.map((c) => c.instanceId)
    );
    nextState = {
      ...nextState,
      actionLog: [
        ...nextState.actionLog,
        ...toDestroy.map((c) => `${c.card.name} was destroyed at the end of the turn.`)
      ]
    };
  }
  for (const b of toBounce) {
    nextState = bounceCreature(nextState, b.instanceId);
    nextState = {
      ...nextState,
      actionLog: [...nextState.actionLog, `${b.card.name} returned to hand.`]
    };
  }

  // 2. End-of-turn untap checks
  const curActiveState = nextState.players[activePlayer];
  const curBZ = curActiveState.battleZone;
  const untapLogs: string[] = [];

  const hasMassUntap =
    Boolean(curActiveState.tempUntapAllAtEndTurn) ||
    curBZ.some((c) => getCardCapabilities(c.card).untapAllAtEndTurn);
  const hasCometEye = curBZ.some((c) =>
    getCardCapabilities(c.card).nameLower.includes('comet eye')
  );
  const survivorAbilities = getSurvivorSharedAbilities(curBZ);
  const zeroShields = (curActiveState.shields || []).filter((s) => !s.isBroken).length === 0;

  const vigilanceTappedIds: string[] = [];
  const updatedActiveBZ = curBZ.map((creature) => {
    const caps = getCardCapabilities(creature.card);
    let isTapped = creature.isTapped;

    if (isTapped) {
      const hasSurvivorUntap =
        isSurvivorCard(creature.card) && survivorAbilities.hasUntapAtEndTurn;
      const hasCometEyeUntap =
        hasCometEye &&
        getCreatureRaces(creature).some((r) => {
          const nr = normalizeRace(r);
          return nr === 'wildveggie' || nr === 'rainbowphantom';
        });
      const hasSiriUntap = caps.nameLower.includes('siri') && zeroShields;
      const hasLightUntap =
        Boolean(curActiveState.tempUntapLightAtEndTurn) &&
        getCardCivilizations(creature.card).includes('Light');
      const hasRaceUntap =
        curActiveState.tempEndTurnUntapRaces &&
        getCreatureRaces(creature).some((r) =>
          curActiveState.tempEndTurnUntapRaces!.includes(normalizeRace(r))
        );

      const hasUntapVigilance =
        hasMassUntap ||
        hasSurvivorUntap ||
        hasCometEyeUntap ||
        hasSiriUntap ||
        hasLightUntap ||
        Boolean(hasRaceUntap) ||
        Boolean(creature.tempUntapAtEndTurn) ||
        caps.untapAtEndTurn;

      if (hasUntapVigilance) {
        if (activePlayer === 'player' && nextState.interactiveHuman) {
          vigilanceTappedIds.push(creature.instanceId);
        } else {
          const source =
            hasSurvivorUntap && !caps.nameLower.includes('ballus')
              ? ' (Survivor ability: Ballus, Dogfight Enforcer Q)'
              : '';
          untapLogs.push(`${creature.card.name} untapped at the end of the turn${source}.`);
          isTapped = false;
        }
      }
    }

    return clearTurnCreatureFields({ ...creature, isTapped });
  });

  if (vigilanceTappedIds.length > 0 && activePlayer === 'player' && nextState.interactiveHuman) {
    nextState = enqueueInteraction(nextState, {
      type: 'OPTIONAL_CHOICE',
      player: 'player',
      sourceCardId: 'eot-untap',
      abilityName: 'End-of-Turn Untap',
      effectType: 'UNTAP_ALL_EOT',
      validTargetIds: vigilanceTappedIds,
      prompt: `End of turn: Untap ${vigilanceTappedIds.length} creature(s) with untap vigilance?`
    });
  }

  const opponentId = getOpponentId(activePlayer);
  const oppState = nextState.players[opponentId];
  const resetOppBZ = oppState.battleZone.map(clearTurnCreatureFields);

  return {
    ...nextState,
    players: {
      ...nextState.players,
      [activePlayer]: {
        ...curActiveState,
        battleZone: updatedActiveBZ,
        shieldsBrokenThisTurn: [],
        tempIgnoreAttackPrevention: undefined,
        tempAllUnblockableThisTurn: undefined,
        tempUnblockableRacesThisTurn: undefined,
        tempAttackUntappedAllThisTurn: undefined,
        tempAttackUntappedRacesThisTurn: undefined,
        tempUnblockableVsCreaturesRacesThisTurn: undefined,
        tempAttackableUntappedIds: undefined,
        tempSlayerOnBlockedThisTurn: undefined,
        tempNatureShieldBreakOnBlockedThisTurn: undefined,
        tempManaOnDestroyThisTurn: undefined,
        tempRaceBounceOnDestroyThisTurn: undefined,
        tempSlayerRacesThisTurn: undefined,
        tempAttacksIfAbleRacesThisTurn: undefined,
        tempUnblockableMaxPowerByRace: undefined,
        tempUntapAllAtEndTurn: undefined,
        tempEndTurnUntapRaces: undefined,
        tempDrawPerShieldBrokenOnAttack: undefined,
        tempOppDestroyTriggerPenalties: undefined
      },
      [opponentId]: {
        ...oppState,
        battleZone: resetOppBZ,
        shieldsBrokenThisTurn: [],
        tempAttackableUntappedIds: undefined
      }
    },
    actionLog: [...nextState.actionLog, ...untapLogs]
  };
}
