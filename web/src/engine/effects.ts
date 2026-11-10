import type { CardDefinition } from '../types/card';
import type {
  GameState,
  PlayerId,
  CreatureInstance,
  CardInstance,
  ManaCardInstance,
  ShieldInstance,
  AttackTarget
} from './types.ts';

/**
 * Helper to locate a creature across all players' battle zones.
 */
export function findCreature(
  state: GameState,
  creatureId: string
): { creature: CreatureInstance; owner: PlayerId } | null {
  for (const pid of ['player', 'opponent'] as const) {
    const c = state.players[pid].battleZone.find((x) => x.instanceId === creatureId);
    if (c) {
      return { creature: c, owner: pid };
    }
  }
  return null;
}

/**
 * Bounces a creature from the battle zone to its owner's hand:
 * - Returns the creature and any cards stacked under it (evolvedOn) to owner's hand.
 * - Pure and immutable.
 */
export function bounceCreature(state: GameState, creatureInstanceId: string): GameState {
  const found = findCreature(state, creatureInstanceId);
  if (!found) {
    return state;
  }

  const { creature, owner } = found;
  const ownerState = state.players[owner];

  const cardsToHand: CardInstance[] = [
    {
      instanceId: creature.instanceId,
      card: creature.card,
      owner
    },
    ...(creature.evolvedOn || [])
  ];

  return {
    ...state,
    players: {
      ...state.players,
      [owner]: {
        ...ownerState,
        battleZone: ownerState.battleZone.filter((c) => c.instanceId !== creatureInstanceId),
        hand: [...ownerState.hand, ...cardsToHand]
      }
    },
    actionLog: [
      ...state.actionLog,
      `Returned ${creature.card.name} to its owner's hand.`
    ]
  };
}

/**
 * Destroys a creature in the battle zone:
 * - Removes creature and all cards under it (evolvedOn stack) into owner's graveyard.
 * - Pure and immutable.
 */
export function destroyCreature(state: GameState, creatureInstanceId: string): GameState {
  const found = findCreature(state, creatureInstanceId);
  if (!found) {
    return state;
  }

  const { creature, owner } = found;
  const ownerState = state.players[owner];

  const cardsToGrave: CardInstance[] = [
    {
      instanceId: creature.instanceId,
      card: creature.card,
      owner
    },
    ...(creature.evolvedOn || [])
  ];

  return {
    ...state,
    players: {
      ...state.players,
      [owner]: {
        ...ownerState,
        battleZone: ownerState.battleZone.filter((c) => c.instanceId !== creatureInstanceId),
        graveyard: [...ownerState.graveyard, ...cardsToGrave]
      }
    },
    actionLog: [
      ...state.actionLog,
      `${creature.card.name} was destroyed and sent to the graveyard.`
    ]
  };
}

/**
 * Adds the top card(s) of the player's deck to their shields:
 * - Appends to player.shields with isBroken: false.
 * - Pure and immutable.
 */
export function addShieldFromDeck(
  state: GameState,
  player: PlayerId,
  count: number = 1
): GameState {
  const playerState = state.players[player];
  if (playerState.deck.length === 0) {
    return {
      ...state,
      actionLog: [
        ...state.actionLog,
        `${player}'s deck is empty; no shield could be added.`
      ]
    };
  }

  let nextDeck = [...playerState.deck];
  const newShields = [...playerState.shields];
  let addedCount = 0;

  for (let i = 0; i < count; i++) {
    if (nextDeck.length === 0) {
      break;
    }
    const [topCard, ...rest] = nextDeck;
    nextDeck = rest;
    const shieldId = `shield-${player}-${newShields.length}-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;
    const newShield: ShieldInstance = {
      id: shieldId,
      shieldId,
      card: topCard.card,
      isBroken: false
    };
    newShields.push(newShield);
    addedCount++;
  }

  return {
    ...state,
    players: {
      ...state.players,
      [player]: {
        ...playerState,
        deck: nextDeck,
        shields: newShields
      }
    },
    actionLog: [
      ...state.actionLog,
      `${player} added ${addedCount} card(s) from the top of the deck to shields.`
    ]
  };
}

/**
 * Destroys opponent's shields directly to their graveyard without triggering Shield Triggers:
 * - If targetShieldIds are provided, destroys those specific shields (up to count).
 * - Otherwise destroys the first count unbroken shields.
 * - Pure and immutable.
 */
export function destroyOpponentShields(
  state: GameState,
  player: PlayerId,
  count: number = 1,
  targetShieldIds?: string[]
): GameState {
  const opponent: PlayerId = player === 'player' ? 'opponent' : 'player';
  const opponentState = state.players[opponent];
  const unbrokenShields = opponentState.shields.filter((s) => !s.isBroken);

  if (unbrokenShields.length === 0 || count <= 0) {
    return state;
  }

  let shieldsToDestroy: ShieldInstance[] = [];
  if (targetShieldIds && targetShieldIds.length > 0) {
    shieldsToDestroy = unbrokenShields
      .filter(
        (s) =>
          targetShieldIds.includes(s.id) ||
          (s.shieldId && targetShieldIds.includes(s.shieldId))
      )
      .slice(0, count);
  }

  if (shieldsToDestroy.length === 0) {
    shieldsToDestroy = unbrokenShields.slice(0, count);
  }

  const destroyIds = new Set(shieldsToDestroy.map((s) => s.id));
  const nextShields = opponentState.shields.filter((s) => !destroyIds.has(s.id));
  const graveCards: CardInstance[] = shieldsToDestroy.map((s) => ({
    instanceId: s.id,
    card: s.card,
    owner: opponent
  }));

  return {
    ...state,
    players: {
      ...state.players,
      [opponent]: {
        ...opponentState,
        shields: nextShields,
        graveyard: [...opponentState.graveyard, ...graveCards]
      }
    },
    actionLog: [
      ...state.actionLog,
      `${player} put ${shieldsToDestroy.length} of ${opponent}'s shield(s) into the graveyard.`
    ]
  };
}

/**
 * Draws cards for the specified player:
 * - Checks for deck-out (immediate loss if drawing from empty deck).
 * - Pure and immutable.
 */
export function drawCards(
  state: GameState,
  player: PlayerId,
  count: number
): GameState {
  if (state.winner !== null || count <= 0) {
    return state;
  }

  const opponent: PlayerId = player === 'player' ? 'opponent' : 'player';
  let playerState = state.players[player];
  const actionLogs = [...state.actionLog];

  let drawnCount = 0;
  for (let i = 0; i < count; i++) {
    if (playerState.deck.length === 0) {
      actionLogs.push(
        `${player} cannot draw from an empty deck! ${opponent} wins the duel by deck-out.`
      );
      return {
        ...state,
        winner: opponent,
        players: {
          ...state.players,
          [player]: playerState
        },
        actionLog: actionLogs
      };
    }

    const [card, ...remainingDeck] = playerState.deck;
    playerState = {
      ...playerState,
      deck: remainingDeck,
      hand: [...playerState.hand, card]
    };
    drawnCount++;
  }

  actionLogs.push(`${player} drew ${drawnCount} card(s).`);

  return {
    ...state,
    players: {
      ...state.players,
      [player]: playerState
    },
    actionLog: actionLogs
  };
}

/**
 * Ramps the top card(s) of the player's deck directly into their mana zone:
 * - Multi-civ cards enter tapped; mono-civ enter untapped.
 * - Pure and immutable.
 */
export function rampTopDeckToManaZone(
  state: GameState,
  player: PlayerId,
  count: number = 1
): GameState {
  if (state.winner !== null || count <= 0) {
    return state;
  }

  let playerState = state.players[player];
  const actionLogs = [...state.actionLog];

  for (let i = 0; i < count; i++) {
    if (playerState.deck.length === 0) {
      actionLogs.push(
        `${player}'s deck is empty; no card could be placed in the mana zone.`
      );
      break;
    }

    const [topCard, ...remainingDeck] = playerState.deck;
    const isMultiCiv = Boolean(
      topCard.card.isMultiCiv || topCard.card.civilizations.length > 1
    );

    const manaCard: ManaCardInstance = {
      instanceId: topCard.instanceId,
      card: topCard.card,
      isTapped: isMultiCiv
    };

    playerState = {
      ...playerState,
      deck: remainingDeck,
      manaZone: [...playerState.manaZone, manaCard]
    };

    actionLogs.push(
      `${player} put ${topCard.card.name} from the top of the deck into the mana zone.`
    );
  }

  return {
    ...state,
    players: {
      ...state.players,
      [player]: playerState
    },
    actionLog: actionLogs
  };
}

/**
 * Randomly removes count card(s) from targetPlayer's hand and moves them to graveyard.
 * - Pure and immutable.
 */
export function discardRandomHandCards(
  state: GameState,
  targetPlayer: PlayerId,
  count: number = 1
): GameState {
  if (state.winner !== null || count <= 0) {
    return state;
  }

  const pState = state.players[targetPlayer];
  if (pState.hand.length === 0) {
    return state;
  }

  const handCopy = [...pState.hand];
  const discarded: CardInstance[] = [];
  const actualCount = Math.min(count, handCopy.length);

  for (let i = 0; i < actualCount; i++) {
    const randomIndex = Math.floor(Math.random() * handCopy.length);
    const [card] = handCopy.splice(randomIndex, 1);
    discarded.push(card);
  }

  const discardedNames = discarded.map((c) => c.card.name).join(', ');
  return {
    ...state,
    players: {
      ...state.players,
      [targetPlayer]: {
        ...pState,
        hand: handCopy,
        graveyard: [...pState.graveyard, ...discarded]
      }
    },
    actionLog: [
      ...state.actionLog,
      `${targetPlayer} discarded ${discardedNames} at random from hand.`
    ]
  };
}

/**
 * Searches the player's deck for the first card matching filterFn and moves it to the destination.
 * Destination options:
 * - 'hand': moves card into player's hand.
 * - 'manaZone': moves card into player's mana zone (tapped if multi-civ).
 * - 'shields': moves card into player's shields as an unbroken shield.
 * - Pure and immutable.
 */
export function searchDeckForCard(
  state: GameState,
  player: PlayerId,
  filterFn: (c: CardDefinition) => boolean,
  destination: 'hand' | 'manaZone' | 'shields'
): GameState {
  if (state.winner !== null) {
    return state;
  }

  const playerState = state.players[player];
  const cardIndex = playerState.deck.findIndex((ci) => filterFn(ci.card));

  if (cardIndex === -1) {
    return {
      ...state,
      actionLog: [
        ...state.actionLog,
        `${player} searched deck but found no matching card.`
      ]
    };
  }

  const targetCard = playerState.deck[cardIndex];
  const nextDeck = playerState.deck.filter((_, idx) => idx !== cardIndex);

  if (destination === 'hand') {
    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...playerState,
          deck: nextDeck,
          hand: [...playerState.hand, targetCard]
        }
      },
      actionLog: [
        ...state.actionLog,
        `${player} searched deck and put ${targetCard.card.name} into hand.`
      ]
    };
  }

  if (destination === 'manaZone') {
    const isMultiCiv = Boolean(
      targetCard.card.isMultiCiv || targetCard.card.civilizations.length > 1
    );
    const manaCard: ManaCardInstance = {
      instanceId: targetCard.instanceId,
      card: targetCard.card,
      isTapped: isMultiCiv
    };

    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...playerState,
          deck: nextDeck,
          manaZone: [...playerState.manaZone, manaCard]
        }
      },
      actionLog: [
        ...state.actionLog,
        `${player} searched deck and put ${targetCard.card.name} into mana zone.`
      ]
    };
  }

  if (destination === 'shields') {
    const shieldId = `shield-${player}-${playerState.shields.length}-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;
    const shield: ShieldInstance = {
      id: shieldId,
      shieldId,
      card: targetCard.card,
      isBroken: false
    };

    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...playerState,
          deck: nextDeck,
          shields: [...playerState.shields, shield]
        }
      },
      actionLog: [
        ...state.actionLog,
        `${player} searched deck and added ${targetCard.card.name} to shields.`
      ]
    };
  }

  return state;
}

/**
 * Searches the player's graveyard for the first card matching filterFn and salvages it.
 * Destination options:
 * - 'hand': moves card from graveyard to player's hand.
 * - 'battleZone': summons/reanimates creature from graveyard directly into battle zone.
 * - Pure and immutable.
 */
export function salvageFromGraveyard(
  state: GameState,
  player: PlayerId,
  filterFn: (c: CardDefinition) => boolean,
  destination: 'hand' | 'battleZone'
): GameState {
  if (state.winner !== null) {
    return state;
  }

  const playerState = state.players[player];
  const cardIndex = playerState.graveyard.findIndex((ci) => filterFn(ci.card));

  if (cardIndex === -1) {
    return {
      ...state,
      actionLog: [
        ...state.actionLog,
        `${player} searched graveyard but found no matching card.`
      ]
    };
  }

  const targetCard = playerState.graveyard[cardIndex];
  const nextGraveyard = playerState.graveyard.filter((_, idx) => idx !== cardIndex);

  if (destination === 'hand') {
    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...playerState,
          graveyard: nextGraveyard,
          hand: [...playerState.hand, targetCard]
        }
      },
      actionLog: [
        ...state.actionLog,
        `${player} salvaged ${targetCard.card.name} from graveyard to hand.`
      ]
    };
  }

  if (destination === 'battleZone') {
    const creature: CreatureInstance = {
      instanceId: targetCard.instanceId,
      card: targetCard.card,
      owner: player,
      isTapped: false,
      summonedTurn: state.turn,
      powerModifier: 0
    };

    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...playerState,
          graveyard: nextGraveyard,
          battleZone: [...playerState.battleZone, creature]
        }
      },
      actionLog: [
        ...state.actionLog,
        `${player} salvaged ${targetCard.card.name} from graveyard to battle zone.`
      ]
    };
  }

  return state;
}

/**
 * Dispatches Come-Into-Play (CIP) creature effects when a creature enters the battle zone:
 * - Card Draw: Aqua Hulcus, Magris, Illusionary Merfolk, King Ripped-Hide, or draw regex.
 * - Mana Ramp: Bronze-Arm Tribe, Torcon, or mana ramp regex.
 * - Discard: Masked Horror or discard regex.
 * - Shield Actions: Sven, Fortress Shell, Aqua Patrol.
 * - Tapping Opponent Creature: Miele, Kolon, or tap regex.
 * - Bouncing Creature: Aqua Surfer, Aqua Sniper, Corile, Unicorn Fish, or bounce regex.
 * - Deck Search: Rayla or spell search regex.
 * - Graveyard Salvage: Gigargon or graveyard salvage regex.
 * - Pure and immutable.
 */
export function triggerCIP(
  state: GameState,
  player: PlayerId,
  creature: CreatureInstance,
  targets?: string[]
): GameState {
  const card = creature.card;
  const cardName = card.name.toLowerCase().trim();
  const rules = card.rulesText || '';
  const opponent: PlayerId = player === 'player' ? 'opponent' : 'player';

  // 1. Bouncing Creature CIP Effect
  // Aqua Surfer, Aqua Sniper, Corile, Unicorn Fish, or matching rules text
  const bounceMatch = rules.match(
    /when you put this creature into the battle zone.*return (?:a|one|up to (\d+)|(\d+)) creatures? .* to (?:its|their) owner's hand/i
  );
  if (
    cardName.includes('aqua surfer') ||
    cardName.includes('aqua sniper') ||
    cardName.includes('corile') ||
    cardName.includes('unicorn fish') ||
    Boolean(bounceMatch)
  ) {
    let bounceCount = 1;
    if (cardName.includes('aqua sniper') || (bounceMatch && (bounceMatch[1] === '2' || bounceMatch[2] === '2'))) {
      bounceCount = 2;
    }

    let targetsToBounce: string[] = [];
    if (targets && targets.length > 0) {
      targetsToBounce = targets.slice(0, bounceCount);
    } else {
      // Opponent's highest power creature if no target specified
      const opponentBZ = state.players[opponent].battleZone;
      if (opponentBZ.length > 0) {
        const sorted = [...opponentBZ].sort(
          (a, b) =>
            (b.card.power ?? 0) + b.powerModifier - ((a.card.power ?? 0) + a.powerModifier)
        );
        targetsToBounce = sorted.slice(0, bounceCount).map((c) => c.instanceId);
      }
    }

    let nextState = state;
    for (const tid of targetsToBounce) {
      nextState = bounceCreature(nextState, tid);
    }
    return nextState;
  }

  // 2. Tapping Opponent Creature CIP Effect
  // Miele, Vizier of Lightning, Kolon, the Oracle, or matching rules text
  const tapMatch = rules.match(
    /when you put this creature into the battle zone.*tap (?:1|one) of your opponent's creatures/i
  ) || rules.match(
    /when you put this creature into the battle zone.*choose (?:1|one) of your opponent's creatures .* and tap it/i
  );
  if (
    cardName.includes('miele') ||
    cardName.includes('kolon') ||
    Boolean(tapMatch)
  ) {
    const opponentBZ = state.players[opponent].battleZone;
    if (opponentBZ.length === 0) {
      return state;
    }

    let targetId: string | undefined;
    if (targets && targets.length > 0) {
      const exists = opponentBZ.some((c) => c.instanceId === targets[0]);
      if (exists) {
        targetId = targets[0];
      }
    }

    if (!targetId) {
      const untapped = opponentBZ.find((c) => !c.isTapped);
      targetId = untapped?.instanceId || opponentBZ[0].instanceId;
    }

    const updatedBZ = opponentBZ.map((c) =>
      c.instanceId === targetId ? { ...c, isTapped: true } : c
    );
    const targetCreature = opponentBZ.find((c) => c.instanceId === targetId);

    return {
      ...state,
      players: {
        ...state.players,
        [opponent]: {
          ...state.players[opponent],
          battleZone: updatedBZ
        }
      },
      actionLog: [
        ...state.actionLog,
        `${player} tapped ${targetCreature?.card.name ?? 'opponent creature'} with ${card.name}.`
      ]
    };
  }

  // 3. Shield Action CIP Effects
  // 3a. Fortress Shell: burns opponent shields directly to graveyard without triggering Shield Triggers
  const burnShieldMatch = rules.match(
    /choose up to (\d+) of your opponent's shields and put them into (?:his|their) graveyard/i
  );
  if (cardName.includes('fortress shell') || Boolean(burnShieldMatch)) {
    const count = burnShieldMatch ? parseInt(burnShieldMatch[1], 10) : 2;
    return destroyOpponentShields(state, player, count, targets);
  }

  // 3b. Aqua Patrol: returns an opponent shield to their deck and shuffles
  if (
    cardName.includes('aqua patrol') ||
    /choose (?:1|one) of your opponent's shields and put it into (?:his|their) deck/i.test(rules)
  ) {
    const oppShields = state.players[opponent].shields.filter((s) => !s.isBroken);
    if (oppShields.length === 0) {
      return state;
    }
    const targetShield =
      targets && targets.length > 0
        ? oppShields.find((s) => s.id === targets[0] || s.shieldId === targets[0]) || oppShields[0]
        : oppShields[0];

    const nextShields = state.players[opponent].shields.filter((s) => s.id !== targetShield.id);
    const deckCard: CardInstance = {
      instanceId: targetShield.id,
      card: targetShield.card,
      owner: opponent
    };

    return {
      ...state,
      players: {
        ...state.players,
        [opponent]: {
          ...state.players[opponent],
          shields: nextShields,
          deck: [...state.players[opponent].deck, deckCard]
        }
      },
      actionLog: [
        ...state.actionLog,
        `${player} returned an opponent shield to their deck with ${card.name}.`
      ]
    };
  }

  // 3c. Sven, the Explorer or add top card of deck to shields
  if (
    cardName.includes('sven') ||
    /when you put this creature into the battle zone.*add the top card of your deck to your shields/i.test(
      rules
    )
  ) {
    return addShieldFromDeck(state, player, 1);
  }

  // 4. Mana Ramp CIP Effect
  // Bronze-Arm Tribe, Torcon, or matching rules text
  if (
    cardName.includes('bronze-arm tribe') ||
    cardName.includes('torcon') ||
    /when you put this creature into the battle zone.*put the top card of your deck into your mana zone/i.test(
      rules
    )
  ) {
    return rampTopDeckToManaZone(state, player, 1);
  }

  // 5. Card Draw CIP Effect
  // 5a. Illusionary Merfolk: if player controls another Cyber Lord draw 3, else draw 1
  if (cardName.includes('illusionary merfolk')) {
    const friendlyBZ = state.players[player].battleZone;
    const hasOtherCyberLord = friendlyBZ.some(
      (c) =>
        c.instanceId !== creature.instanceId &&
        c.card.races?.some((r) => r.toLowerCase().includes('cyber lord'))
    );
    const count = hasOtherCyberLord ? 3 : 1;
    return drawCards(state, player, count);
  }

  // 5b. Aqua Hulcus, Magris, King Ripped-Hide, or generic draw CIP
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
    if (cardName.includes('king ripped-hide')) {
      count = 2;
    } else if (drawCIPMatch?.[1]) {
      count = parseInt(drawCIPMatch[1], 10);
    }
    return drawCards(state, player, count);
  }

  // 6. Masked Horror or generic CIP Discard Effect
  if (
    cardName.includes('masked horror') ||
    (/when you put this creature into the battle zone/i.test(rules) &&
      /opponent discards (?:a|1|(\d+)) cards? at random/i.test(rules)) ||
    (/when you put this creature into the battle zone/i.test(rules) &&
      /opponent discards a card at random/i.test(rules))
  ) {
    const discardMatch = rules.match(/opponent discards (?:a|1|(\d+)) cards? at random/i);
    const count = discardMatch?.[1] ? parseInt(discardMatch[1], 10) : 1;
    return discardRandomHandCards(state, opponent, count);
  }

  // 7. Rayla, Truth Enforcer (Search Deck for Spell)
  if (
    cardName.includes('rayla') ||
    (/when you put this creature into the battle zone.*search your deck/i.test(rules) &&
      /take a spell from your deck/i.test(rules))
  ) {
    return searchDeckForCard(state, player, (c) => c.type === 'Spell', 'hand');
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
    let nextState = state;
    for (let i = 0; i < salvageCount; i++) {
      const graveCreatures = nextState.players[player].graveyard.filter(
        (ci) => ci.card.type === 'Creature' || ci.card.type === 'Evolution Creature'
      );
      if (graveCreatures.length === 0) break;
      nextState = salvageFromGraveyard(
        nextState,
        player,
        (c) => c.type === 'Creature' || c.type === 'Evolution Creature',
        'hand'
      );
    }
    return nextState;
  }

  return state;
}

/**
 * Dispatches end-of-turn abilities for creatures in the active player's battle zone:
 * 1. Untap vigilance: Frei, Vizier of Air, Urth, Ruby Grass, Ballus, Betrale, Lukia Lex, Nial, Toel, etc.
 * 2. Self-sacrifice / destruction: creatures destroyed at the end of the turn.
 * 3. Self-bounce: creatures returned to hand at the end of the turn.
 * 4. Resets temporary power attacker bonuses and power modifiers.
 * - Pure and immutable.
 */
export function triggerEndTurn(state: GameState, activePlayer: PlayerId): GameState {
  if (state.winner !== null) {
    return state;
  }

  const activeState = state.players[activePlayer];
  const untapLogs: string[] = [];
  const destroyLogs: string[] = [];
  const bounceLogs: string[] = [];

  // Check for whole-board untap effect (e.g. Toel, Vizier of Hope)
  const hasMassUntap = activeState.battleZone.some((c) => {
    const rules = c.card.rulesText || '';
    return /at the end of (?:each of )?your turns?, (?:you may )?untap all your creatures/i.test(rules);
  });

  const remainingBattleZone: CreatureInstance[] = [];
  const destroyedCards: CardInstance[] = [];
  const bouncedCards: CardInstance[] = [];

  for (const creature of activeState.battleZone) {
    const rules = creature.card.rulesText || '';
    const nameLower = creature.card.name.toLowerCase();

    // Check self-sacrifice at end of turn
    const isSelfSacrifice =
      /at the end of (?:each of )?your turns?, destroy this creature/i.test(rules) ||
      /at the end of (?:the|this) turn, destroy this creature/i.test(rules);

    if (isSelfSacrifice) {
      destroyLogs.push(`${creature.card.name} was destroyed at the end of the turn.`);
      destroyedCards.push(
        {
          instanceId: creature.instanceId,
          card: creature.card,
          owner: activePlayer
        },
        ...(creature.evolvedOn || [])
      );
      continue;
    }

    // Check self-bounce at end of turn
    const isSelfBounce =
      /at the end of (?:each of )?your turns?.*return this creature to (?:your|its owner's) hand/i.test(rules) ||
      /at the end of (?:the|this) turn, return this creature to your hand/i.test(rules);

    if (isSelfBounce) {
      bounceLogs.push(`${creature.card.name} returned to hand at the end of the turn.`);
      bouncedCards.push(
        {
          instanceId: creature.instanceId,
          card: creature.card,
          owner: activePlayer
        },
        ...(creature.evolvedOn || [])
      );
      continue;
    }

    // Check untap vigilance
    let isTapped = creature.isTapped;
    if (isTapped) {
      const hasUntapVigilance =
        hasMassUntap ||
        nameLower.includes('urth') ||
        nameLower.includes('frei') ||
        nameLower.includes('ruby grass') ||
        nameLower.includes('ballus') ||
        nameLower.includes('betrale') ||
        nameLower.includes('lukia lex') ||
        nameLower.includes('nial') ||
        /at the end of (?:each of )?your turns?, (?:you may )?untap this creature/i.test(rules);

      if (hasUntapVigilance) {
        untapLogs.push(`${creature.card.name} untapped at the end of the turn.`);
        isTapped = false;
      }
    }

    remainingBattleZone.push({
      ...creature,
      isTapped,
      tempPowerAttackerBonus: 0,
      powerModifier: 0
    });
  }

  // Reset temporary bonuses on opponent's creatures as well
  const opponentId: PlayerId = activePlayer === 'player' ? 'opponent' : 'player';
  const opponentState = state.players[opponentId];
  const resetOpponentBZ = opponentState.battleZone.map((c) => ({
    ...c,
    tempPowerAttackerBonus: 0,
    powerModifier: 0
  }));

  const updatedActivePlayerState = {
    ...activeState,
    battleZone: remainingBattleZone,
    hand: [...activeState.hand, ...bouncedCards],
    graveyard: [...activeState.graveyard, ...destroyedCards]
  };

  return {
    ...state,
    players: {
      ...state.players,
      [activePlayer]: updatedActivePlayerState,
      [opponentId]: {
        ...opponentState,
        battleZone: resetOpponentBZ
      }
    },
    actionLog: [
      ...state.actionLog,
      ...untapLogs,
      ...destroyLogs,
      ...bounceLogs
    ]
  };
}

/**
 * Checks whether an attacker has Stealth (Light, Water, Darkness, Fire, Nature)
 * that is currently active against the opponent's mana zone:
 * - If the attacker has "<Civ> stealth" and opponent has at least one card of <Civ>
 *   in their mana zone, the attacker cannot be blocked.
 * - Pure helper.
 */
export function checkStealth(
  attacker: CreatureInstance,
  defenderManaZone: ManaCardInstance[]
): boolean {
  const rules = attacker?.card?.rulesText || '';
  if (!rules || !defenderManaZone || defenderManaZone.length === 0) {
    return false;
  }

  const stealthRegex = /([A-Za-z]+)\s+stealth/gi;
  let match: RegExpExecArray | null;

  while ((match = stealthRegex.exec(rules)) !== null) {
    const civ = match[1].toLowerCase();
    const hasCivInMana = defenderManaZone.some((manaCard) =>
      (manaCard.card.civilizations || []).some(
        (c) => c.toLowerCase() === civ
      )
    );
    if (hasCivInMana) {
      return true;
    }
  }

  return false;
}

/**
 * Checks whether an attacker can attack untapped opponent creatures:
 * - Matches general ability: "This creature can attack untapped creatures"
 * - Matches civilization-specific ability: "This creature can attack untapped <civ> creatures"
 * - Pure helper.
 */
export function canCreatureAttackUntapped(
  attacker: CreatureInstance,
  targetCreature?: CreatureInstance
): boolean {
  const rules = attacker?.card?.rulesText || '';
  if (!rules) return false;

  // General untapped attack ability
  if (/can attack untapped creatures/i.test(rules)) {
    return true;
  }

  // Civ-specific untapped attack ability
  const civMatch = rules.match(/can attack untapped ([a-z]+) creatures/i);
  if (civMatch) {
    if (!targetCreature) {
      return true;
    }
    const reqCiv = civMatch[1].toLowerCase();
    return (targetCreature.card.civilizations || []).some(
      (c) => c.toLowerCase() === reqCiv
    );
  }

  // General fallback
  if (/can attack untapped/i.test(rules)) {
    return true;
  }

  return false;
}

/**
 * Dispatches on-attack abilities ("Whenever this creature attacks..."):
 * 1. Card draw: Snarling Net, Armored Transport Galiac, Hypersquid Walter, or draw regex.
 * 2. Opponent discard: Gregoria, Gigamantis, or discard regex.
 * 3. Add to shields: Cosmic Wing or shield add regex.
 * 4. Creature destruction: blocker destruction or power-based destruction (Muramasa, Valdios, Skyterror).
 * 5. Tapping opponent creature: Le Quist or tap regex.
 * 6. Power buffs: on-attack power buffs (powerModifier).
 * 7. Mana ramp / mana return: ramp or return mana to hand (Bloodwing Mantis).
 * - Pure and immutable.
 */
export function triggerAttack(
  state: GameState,
  player: PlayerId,
  attacker: CreatureInstance,
  target: AttackTarget
): GameState {
  if (state.winner !== null) {
    return state;
  }

  const rules = attacker.card.rulesText || '';
  const nameLower = attacker.card.name.toLowerCase();
  const opponent: PlayerId = player === 'player' ? 'opponent' : 'player';

  let nextState = state;

  // 1. On-Attack Card Draw
  // e.g. "Whenever this creature attacks, you may draw a card"
  // e.g. Snarling Net, Armored Transport Galiac, Hypersquid Walter
  const drawMatch = rules.match(
    /whenever this creature attacks.*(?:you may )?draw (?:up to )?(?:a|1|(\d+)) cards?/i
  );
  if (
    nameLower.includes('snarling net') ||
    (nameLower.includes('galiac') && /draw/i.test(rules)) ||
    nameLower.includes('hypersquid walter') ||
    Boolean(drawMatch)
  ) {
    let drawCount = 1;
    if (drawMatch?.[1]) {
      drawCount = parseInt(drawMatch[1], 10);
    }
    nextState = drawCards(nextState, player, drawCount);
  }

  // 2. On-Attack Opponent Discard
  // e.g. "Whenever this creature attacks, your opponent discards a card at random from his hand"
  // e.g. Gregoria, Gigamantis
  const discardMatch =
    rules.match(
      /whenever this creature attacks.*(?:your )?opponent discards (?:a|1|(\d+)) cards?(?: at random)?/i
    ) || rules.match(/whenever this creature attacks.*opponent discards a card/i);
  if (
    nameLower.includes('gregoria') ||
    nameLower.includes('gigamantis') ||
    Boolean(discardMatch)
  ) {
    let discardCount = 1;
    if (discardMatch?.[1]) {
      discardCount = parseInt(discardMatch[1], 10);
    }
    nextState = discardRandomHandCards(nextState, opponent, discardCount);
  }

  // 3. On-Attack Shield Add
  // e.g. "Whenever this creature attacks, you may add the top card of your deck to your shields"
  // e.g. Cosmic Wing
  if (
    nameLower.includes('cosmic wing') ||
    /whenever this creature attacks.*add the top card of your deck to your shields/i.test(rules)
  ) {
    nextState = addShieldFromDeck(nextState, player, 1);
  }

  // 4. On-Attack Destruction
  // 4a. Blocker destruction:
  // e.g. "Whenever this creature attacks, you may destroy one of your opponent's creatures that has 'blocker'."
  const destroyBlockerMatch = rules.match(
    /whenever this creature attacks.*destroy (?:one|1) of your opponent's creatures that has ["']?blocker["']?/i
  );
  if (destroyBlockerMatch) {
    const oppBlockers = nextState.players[opponent].battleZone.filter(
      (c) => c.card.isBlocker
    );
    if (oppBlockers.length > 0) {
      const sorted = [...oppBlockers].sort(
        (a, b) =>
          (b.card.power ?? 0) + b.powerModifier - ((a.card.power ?? 0) + a.powerModifier)
      );
      nextState = destroyCreature(nextState, sorted[0].instanceId);
    }
  }

  // 4b. Power-based destruction:
  // e.g. "Whenever this creature attacks, you may destroy one of your opponent's creatures with power 2000 or less"
  // e.g. "Whenever this creature attacks, you may destroy one of your opponent's creatures that has power 2000 or less"
  // e.g. Armored Blaster Valdios, Gatling Skyterror (if rules contain destruction)
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
    if (validOpponents.length > 0) {
      const sorted = [...validOpponents].sort(
        (a, b) =>
          (b.card.power ?? 0) + b.powerModifier - ((a.card.power ?? 0) + a.powerModifier)
      );
      nextState = destroyCreature(nextState, sorted[0].instanceId);
    }
  }

  // 5. On-Attack Tapping Opponent Creature
  // e.g. "Whenever this creature attacks, tap one of your opponent's creatures"
  // e.g. "Whenever this creature attacks, you may choose a darkness or fire creature in the battle zone and tap it"
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
          (c.card.civilizations || []).some(
            (civ) => civ === 'Darkness' || civ === 'Fire'
          )
        );
      }
      if (candidates.length > 0) {
        const targetToTap = candidates[0];
        const updatedBZ = oppBZ.map((c) =>
          c.instanceId === targetToTap.instanceId ? { ...c, isTapped: true } : c
        );
        nextState = {
          ...nextState,
          players: {
            ...nextState.players,
            [opponent]: {
              ...nextState.players[opponent],
              battleZone: updatedBZ
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
  // e.g. "Whenever this creature attacks, this creature gets +2000 power until the end of the turn"
  // e.g. "Whenever this creature attacks a creature, this creature gets +3000 power until the end of the turn"
  // e.g. "Whenever this creature attacks, it gets 'power attacker +3000' until the end of the turn"
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
      const curBZ = nextState.players[player].battleZone;
      const updatedBZ = curBZ.map((c) =>
        c.instanceId === attacker.instanceId
          ? {
              ...c,
              powerModifier: (c.powerModifier || 0) + buff
            }
          : c
      );
      nextState = {
        ...nextState,
        players: {
          ...nextState.players,
          [player]: {
            ...nextState.players[player],
            battleZone: updatedBZ
          }
        },
        actionLog: [
          ...nextState.actionLog,
          `${attacker.card.name} gained +${buff} power on attack.`
        ]
      };
    }
  }

  // 7. On-Attack Mana Ramp
  // e.g. "Whenever this creature attacks, you may put the top card of your deck into your mana zone."
  if (/whenever this creature attacks.*put the top card of your deck into your mana zone/i.test(rules)) {
    nextState = rampTopDeckToManaZone(nextState, player, 1);
  }

  // 8. On-Attack Return Mana to Hand (e.g. Bloodwing Mantis)
  // e.g. "Whenever this creature attacks, return 2 creatures from your mana zone to your hand."
  const manaToHandMatch = rules.match(
    /whenever this creature attacks.*return (\d+) creatures? from your mana zone to your hand/i
  );
  if (manaToHandMatch) {
    const count = parseInt(manaToHandMatch[1], 10);
    const playerMana = nextState.players[player].manaZone;
    const creatureCardsInMana = playerMana.filter(
      (m) => m.card.type === 'Creature' || m.card.type === 'Evolution Creature'
    );
    const toReturn = creatureCardsInMana.slice(0, count);
    if (toReturn.length > 0) {
      const returnIds = new Set(toReturn.map((m) => m.instanceId));
      const nextMana = playerMana.filter((m) => !returnIds.has(m.instanceId));
      const handAdditions: CardInstance[] = toReturn.map((m) => ({
        instanceId: m.instanceId,
        card: m.card,
        owner: player
      }));
      nextState = {
        ...nextState,
        players: {
          ...nextState.players,
          [player]: {
            ...nextState.players[player],
            manaZone: nextMana,
            hand: [...nextState.players[player].hand, ...handAdditions]
          }
        },
        actionLog: [
          ...nextState.actionLog,
          `${attacker.card.name} returned ${toReturn.map((m) => m.card.name).join(', ')} from mana zone to hand.`
        ]
      };
    }
  }

  return nextState;
}
