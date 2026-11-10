import type { CardDefinition } from '../types/card';
import type {
  GameState,
  PlayerId,
  CreatureInstance,
  CardInstance,
  ManaCardInstance,
  PlayerState,
  ShieldInstance
} from './types';
import { canPayManaCost, payManaCost } from './mana.ts';
import { getCreatureEffectivePower } from './combat.ts';
import { triggerDestroyed, isSurvivor, triggerCIP } from './effects.ts';

/**
 * Randomly removes count card(s) from targetPlayer's hand and moves them to graveyard.
 */
export function discardRandomHandCards(
  state: GameState,
  targetPlayer: PlayerId,
  count: number = 1
): GameState {
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
 * Checks whether a card definition represents a Charger spell:
 * - card.isCharger === true
 * - Name contains "Charger"
 * - Rules text contains the "Charger (" keyword
 */
export function isChargerSpell(card: CardDefinition): boolean {
  if (card.isCharger) {
    return true;
  }
  if (/charger/i.test(card.name)) {
    return true;
  }
  if (/charger\b/i.test(card.rulesText || '')) {
    return true;
  }
  return false;
}

/**
 * Helper to locate a creature across all players' battle zones.
 */
function findCreature(
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
 * Destroys a creature in the battle zone:
 * - Removes the creature from the battle zone.
 * - Moves the creature and all cards under it (evolvedOn stack) into its owner's graveyard.
 * - Pure and immutable.
 */
export function destroyCreature(state: GameState, creatureInstanceId: string): GameState {
  const found = findCreature(state, creatureInstanceId);
  if (!found) {
    return state;
  }

  const { creature, owner } = found;
  const ownerState = state.players[owner];
  const rules = creature.card.rulesText || '';
  const nameLower = creature.card.name.toLowerCase();

  // 1. Return to hand replacement effect
  const bounceMatch =
    /when(?:ever)? this creature (?:would be|is) destroyed.*(?:return (?:it|this creature) to (?:your|its owner's) hand|put (?:it|this creature) into (?:your|its owner's) hand) instead/i.test(rules);
  const isBounceReplacement =
    bounceMatch ||
    nameLower.includes('aqua soldier') ||
    nameLower.includes('chilias') ||
    nameLower.includes('aqua knight') ||
    nameLower.includes('reconnaissance vehicle') ||
    nameLower.includes('aqua agent') ||
    nameLower.includes('aqua ranger') ||
    nameLower.includes('crystal jouster') ||
    nameLower.includes('aqua skydiver') ||
    nameLower.includes('revival soldier');

  if (isBounceReplacement) {
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
        `${creature.card.name} returned to hand instead of being destroyed.`
      ]
    };
  }

  // 2. Put into mana zone replacement effect
  const manaMatch =
    /when(?:ever)? this creature (?:would be|is) destroyed.*put (?:it|this creature) into (?:your|its owner's) mana zone instead/i.test(rules);
  const isFriendlyNature = creature.card.civilizations?.includes('Nature');
  const hasGigamantisAura =
    isFriendlyNature &&
    ownerState.battleZone.some(
      (c) => c.instanceId !== creatureInstanceId && c.card.name.toLowerCase().includes('gigamantis')
    );
  const hasBalloonshroomAura =
    isSurvivor(creature.card) &&
    ownerState.battleZone.some(
      (c) =>
        c.card.name.toLowerCase().includes('balloonshroom') ||
        (isSurvivor(c.card) && /put it into your mana zone instead/i.test(c.card.rulesText || ''))
    );
  const isManaReplacement =
    manaMatch ||
    hasGigamantisAura ||
    hasBalloonshroomAura ||
    nameLower.includes('pochan') ||
    nameLower.includes('stinger worm') ||
    nameLower.includes('aura blast') ||
    nameLower.includes('coiling vines') ||
    nameLower.includes('mighty shouter') ||
    nameLower.includes('red-eye scorpion') ||
    nameLower.includes('balloonshroom') ||
    nameLower.includes('solid horn') ||
    nameLower.includes('shaman broccoli');

  if (isManaReplacement) {
    const isMultiCiv = (c: CardDefinition) =>
      Boolean(c.isMultiCiv || (c.civilizations && c.civilizations.length > 1));

    const cardsToMana: ManaCardInstance[] = [
      {
        instanceId: creature.instanceId,
        card: creature.card,
        isTapped: isMultiCiv(creature.card)
      },
      ...(creature.evolvedOn || []).map((underCard) => ({
        instanceId: underCard.instanceId,
        card: underCard.card,
        isTapped: isMultiCiv(underCard.card)
      }))
    ];

    return {
      ...state,
      players: {
        ...state.players,
        [owner]: {
          ...ownerState,
          battleZone: ownerState.battleZone.filter((c) => c.instanceId !== creatureInstanceId),
          manaZone: [...ownerState.manaZone, ...cardsToMana]
        }
      },
      actionLog: [
        ...state.actionLog,
        `${creature.card.name} was put into the mana zone instead of being destroyed.`
      ]
    };
  }

  // 3. Add to shields replacement effect (e.g. Ouks)
  const shieldMatch =
    /when(?:ever)? this creature (?:would be|is) destroyed.*add (?:it|this creature) to (?:your|its owner's) shields.*instead/i.test(rules);
  if (shieldMatch || nameLower.includes('ouks')) {
    const shieldId = `shield-${owner}-${ownerState.shields.length}-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;
    const newShield: ShieldInstance = {
      id: shieldId,
      shieldId,
      card: creature.card,
      isBroken: false
    };
    return {
      ...state,
      players: {
        ...state.players,
        [owner]: {
          ...ownerState,
          battleZone: ownerState.battleZone.filter((c) => c.instanceId !== creatureInstanceId),
          shields: [...ownerState.shields, newShield]
        }
      },
      actionLog: [
        ...state.actionLog,
        `${creature.card.name} was added to shields instead of being destroyed.`
      ]
    };
  }

  // 4. Standard destruction
  const cardsToGrave: CardInstance[] = [
    ...(creature.evolvedOn || []),
    {
      instanceId: creature.instanceId,
      card: creature.card,
      owner
    }
  ];

  const stateAfterDestruction: GameState = {
    ...state,
    players: {
      ...state.players,
      [owner]: {
        ...ownerState,
        battleZone: ownerState.battleZone.filter((c) => c.instanceId !== creatureInstanceId),
        graveyard: [...ownerState.graveyard, ...cardsToGrave]
      }
    },
    actionLog: [...state.actionLog, `${creature.card.name} was destroyed and sent to the graveyard.`]
  };

  return triggerDestroyed(stateAfterDestruction, owner, creature);
}

/**
 * Returns a creature in the battle zone to its owner's hand:
 * - Moves the top card and all evolvedOn cards back into the owner's hand.
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
    actionLog: [...state.actionLog, `${creature.card.name} was returned to hand.`]
  };
}

/**
 * Moves a creature from the battle zone to its owner's mana zone:
 * - Places top card and any evolvedOn cards into the mana zone untapped.
 * - Pure and immutable.
 */
export function sendCreatureToManaZone(
  state: GameState,
  creatureInstanceId: string
): GameState {
  const found = findCreature(state, creatureInstanceId);
  if (!found) {
    return state;
  }

  const { creature, owner } = found;
  const ownerState = state.players[owner];

  const cardsToMana: ManaCardInstance[] = [
    {
      instanceId: creature.instanceId,
      card: creature.card,
      isTapped: false
    },
    ...(creature.evolvedOn || []).map((c) => ({
      instanceId: c.instanceId,
      card: c.card,
      isTapped: false
    }))
  ];

  return {
    ...state,
    players: {
      ...state.players,
      [owner]: {
        ...ownerState,
        battleZone: ownerState.battleZone.filter((c) => c.instanceId !== creatureInstanceId),
        manaZone: [...ownerState.manaZone, ...cardsToMana]
      }
    },
    actionLog: [...state.actionLog, `${creature.card.name} was put into the mana zone.`]
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
 * Ramps the top card of the player's deck directly into their mana zone:
 * - Untapped for mono-civ, tapped for multi-civ.
 * - Pure and immutable.
 */
export function rampTopDeckToManaZone(state: GameState, player: PlayerId): GameState {
  const playerState = state.players[player];
  if (playerState.deck.length === 0) {
    return {
      ...state,
      actionLog: [
        ...state.actionLog,
        `${player}'s deck is empty; no card could be placed in the mana zone.`
      ]
    };
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

  return {
    ...state,
    players: {
      ...state.players,
      [player]: {
        ...playerState,
        deck: remainingDeck,
        manaZone: [...playerState.manaZone, manaCard]
      }
    },
    actionLog: [
      ...state.actionLog,
      `${player} put ${topCard.card.name} from the top of the deck into the mana zone.`
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
 * - Cards are placed into opponent's graveyard.
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
 * Breaks opponent's shields, moving them to opponent's hand and triggering Shield Triggers if any:
 * - If targetShieldIds are provided, breaks those specific shields (up to count).
 * - Otherwise breaks the first count unbroken shields.
 * - Queues SHIELD_TRIGGER_RESOLUTION if broken cards have isShieldTrigger.
 * - Pure and immutable.
 */
export function breakOpponentShields(
  state: GameState,
  player: PlayerId,
  count: number,
  targetShieldIds?: string[]
): GameState {
  const opponent: PlayerId = player === 'player' ? 'opponent' : 'player';
  const opponentState = state.players[opponent];
  const unbrokenShields = opponentState.shields.filter((s) => !s.isBroken);

  if (unbrokenShields.length === 0 || count <= 0) {
    return state;
  }

  let shieldsToBreak: ShieldInstance[] = [];
  if (targetShieldIds && targetShieldIds.length > 0) {
    shieldsToBreak = unbrokenShields
      .filter(
        (s) =>
          targetShieldIds.includes(s.id) ||
          (s.shieldId && targetShieldIds.includes(s.shieldId))
      )
      .slice(0, count);
  }

  if (shieldsToBreak.length === 0) {
    shieldsToBreak = unbrokenShields.slice(0, count);
  }

  const breakIds = new Set(shieldsToBreak.map((s) => s.id));
  const nextShields = opponentState.shields.filter((s) => !breakIds.has(s.id));

  const brokenCards: CardInstance[] = shieldsToBreak.map((s) => ({
    instanceId: s.id,
    card: s.card,
    owner: opponent
  }));

  const stateWithBrokenShields: GameState = {
    ...state,
    players: {
      ...state.players,
      [opponent]: {
        ...opponentState,
        shields: nextShields,
        hand: [...opponentState.hand, ...brokenCards]
      }
    },
    actionLog: [
      ...state.actionLog,
      `${player} broke ${shieldsToBreak.length} shield(s) of ${opponent}.`
    ]
  };

  const triggerShields = shieldsToBreak.filter((s) => s.card.isShieldTrigger);
  if (triggerShields.length > 0) {
    const pendingInteraction = {
      type: 'SHIELD_TRIGGER_RESOLUTION' as const,
      player: opponent,
      shieldCards: brokenCards.filter((c) => c.card.isShieldTrigger),
      triggers: triggerShields.map((s) => ({
        shieldId: s.id,
        card: s.card
      }))
    };

    return {
      ...stateWithBrokenShields,
      pendingInteraction,
      actionLog: [
        ...stateWithBrokenShields.actionLog,
        `Shield Trigger(s) detected: ${triggerShields.map((s) => s.card.name).join(', ')}!`
      ]
    };
  }

  return stateWithBrokenShields;
}

/**
 * Resolves Come-Into-Play (CIP) creature effects when a creature enters the battle zone:
 * - Card Draw: Aqua Hulcus, Magris, Illusionary Merfolk, or rules text matching draw
 * - Mana Ramp: Bronze-Arm Tribe, Torcon, or rules text matching mana ramp
 * - Shield Actions: Sven, Fortress Shell, Aqua Patrol
 * - Tapping Opponent Creature: Miele, Kolon, or rules text matching tap opponent creature
 * - Bouncing Creature: Aqua Surfer, Aqua Sniper, Corile, or rules text matching bounce
 * - Pure and immutable.
 */
export function resolveCreatureCIPEffect(
  state: GameState,
  player: PlayerId,
  creature: CreatureInstance,
  targets?: string[]
): GameState {
  return triggerCIP(state, player, creature, targets);
}

/**
 * Resolves the rules text effects of a cast spell:
 * - Terror Pit, Death Smoke, Critical Blade, Volcano Charger (destruction)
 * - Holy Awe, Solar Ray, Lightning Charger (tapping)
 * - Spiral Gate, Teleportation, Riptide Charger (bouncing)
 * - Natural Snare, Mulch Charger, Faerie Life (mana zone)
 * - Brain Serum, Cyber Brain, Energy Stream, Eureka Charger (draw)
 * - Energy Charger (power buff)
 */
export function resolveSpellEffect(
  state: GameState,
  player: PlayerId,
  card: CardDefinition,
  targets?: string[]
): GameState {
  const opponent: PlayerId = player === 'player' ? 'opponent' : 'player';
  const opponentState = state.players[opponent];
  const cardName = card.name.toLowerCase().trim();
  const rules = card.rulesText || '';

  // 1. Holy Awe: Tap all opponent creatures
  if (cardName === 'holy awe' || /tap all (?:your )?opponent's creatures/i.test(rules)) {
    const tappedBattleZone = opponentState.battleZone.map((c) => ({
      ...c,
      isTapped: true
    }));
    return {
      ...state,
      players: {
        ...state.players,
        [opponent]: {
          ...opponentState,
          battleZone: tappedBattleZone
        }
      },
      actionLog: [
        ...state.actionLog,
        `${player} tapped all opponent creatures with ${card.name}.`
      ]
    };
  }

  // 2. Solar Ray / Lightning Charger: Tap 1 opponent creature
  if (
    cardName === 'solar ray' ||
    cardName === 'lightning charger' ||
    /choose (?:1|one) of your opponent's creatures.*and tap it/i.test(rules)
  ) {
    if (opponentState.battleZone.length === 0) {
      return state;
    }
    const targetId = targets?.[0];
    if (!targetId) {
      throw new Error(`Spell ${card.name} requires a target creature.`);
    }
    const targetCreature = opponentState.battleZone.find((c) => c.instanceId === targetId);
    if (!targetCreature) {
      throw new Error(`Target creature ${targetId} not found in opponent's battle zone.`);
    }

    const updatedBattleZone = opponentState.battleZone.map((c) =>
      c.instanceId === targetId ? { ...c, isTapped: true } : c
    );
    return {
      ...state,
      players: {
        ...state.players,
        [opponent]: {
          ...opponentState,
          battleZone: updatedBattleZone
        }
      },
      actionLog: [...state.actionLog, `${player} tapped ${targetCreature.card.name}.`]
    };
  }

  // 3. Death Smoke: Destroy 1 untapped opponent creature
  if (
    cardName === 'death smoke' ||
    /destroy (?:1|one) of your opponent's untapped creatures/i.test(rules)
  ) {
    if (opponentState.battleZone.length === 0) {
      return state;
    }
    const targetId = targets?.[0];
    if (!targetId) {
      throw new Error(`Spell Death Smoke requires a target creature.`);
    }
    const targetCreature = opponentState.battleZone.find((c) => c.instanceId === targetId);
    if (!targetCreature) {
      throw new Error(`Target creature ${targetId} not found in opponent's battle zone.`);
    }
    if (targetCreature.isTapped) {
      throw new Error(`Death Smoke can only target an untapped creature.`);
    }
    return destroyCreature(state, targetId);
  }

  // 4. Critical Blade: Destroy 1 opponent blocker
  if (
    cardName === 'critical blade' ||
    /destroy (?:1|one) of your opponent's creatures that has "blocker"/i.test(rules)
  ) {
    if (opponentState.battleZone.length === 0) {
      return state;
    }
    const targetId = targets?.[0];
    if (!targetId) {
      throw new Error(`Spell Critical Blade requires a target creature.`);
    }
    const targetCreature = opponentState.battleZone.find((c) => c.instanceId === targetId);
    if (!targetCreature) {
      throw new Error(`Target creature ${targetId} not found in opponent's battle zone.`);
    }
    if (!targetCreature.card.isBlocker) {
      throw new Error(`Critical Blade can only target a creature with Blocker.`);
    }
    return destroyCreature(state, targetId);
  }

  // Ghost Touch: opponent discards a card at random
  if (
    cardName === 'ghost touch' ||
    /opponent discards a card at random/i.test(rules)
  ) {
    return discardRandomHandCards(state, opponent, 1);
  }

  // Tornado Flame: destroy 1 opponent creature with power 4000 or less
  if (
    cardName === 'tornado flame' ||
    /destroy (?:1|one) of your opponent's creatures that has power 4000 or less/i.test(rules)
  ) {
    if (opponentState.battleZone.length === 0) return state;
    const targetId =
      targets?.[0] ||
      opponentState.battleZone.find((c) => getCreatureEffectivePower(c, false) <= 4000)
        ?.instanceId;
    if (!targetId) return state;
    const targetCreature = opponentState.battleZone.find((c) => c.instanceId === targetId);
    if (!targetCreature) return state;
    if (getCreatureEffectivePower(targetCreature, false) > 4000) {
      throw new Error(`Target creature has power > 4000.`);
    }
    return destroyCreature(state, targetId);
  }

  // 5. Volcano Charger / Crimson Hammer: Destroy opponent creature power 2000 or less
  if (
    cardName === 'volcano charger' ||
    cardName === 'crimson hammer' ||
    /destroy (?:1|one) of your opponent's creatures that has power 2000 or less/i.test(rules)
  ) {
    if (opponentState.battleZone.length === 0) {
      return state;
    }
    const targetId =
      targets?.[0] ||
      opponentState.battleZone.find((c) => getCreatureEffectivePower(c, false) <= 2000)
        ?.instanceId;
    if (!targetId) {
      return state;
    }
    const targetCreature = opponentState.battleZone.find((c) => c.instanceId === targetId);
    if (!targetCreature) {
      throw new Error(`Target creature ${targetId} not found in opponent's battle zone.`);
    }
    const power = getCreatureEffectivePower(targetCreature, false);
    if (power > 2000) {
      throw new Error(`Target creature has power ${power}, which is greater than 2000.`);
    }
    return destroyCreature(state, targetId);
  }

  // Burst Shot: Destroy all creatures that have power 2000 or less
  if (
    cardName === 'burst shot' ||
    /destroy all creatures that have power 2000 or less/i.test(rules)
  ) {
    const toDestroy: CreatureInstance[] = [];
    for (const pid of ['player', 'opponent'] as const) {
      for (const c of state.players[pid].battleZone) {
        if (getCreatureEffectivePower(c, false) <= 2000) {
          toDestroy.push(c);
        }
      }
    }

    toDestroy.sort((a, b) => {
      const aAura = /balloonshroom|gigamantis/i.test(a.card.name);
      const bAura = /balloonshroom|gigamantis/i.test(b.card.name);
      return (aAura ? 1 : 0) - (bAura ? 1 : 0);
    });

    let nextState = state;
    for (const c of toDestroy) {
      nextState = destroyCreature(nextState, c.instanceId);
    }

    return {
      ...nextState,
      actionLog: [
        ...nextState.actionLog,
        `${player} destroyed ${toDestroy.length} creature(s) with power 2000 or less with ${card.name}.`
      ]
    };
  }

  // Blizzard of Spears: Destroy all creatures that have power 4000 or less
  if (
    cardName === 'blizzard of spears' ||
    /destroy all creatures that have power 4000 or less/i.test(rules)
  ) {
    const toDestroy: CreatureInstance[] = [];
    for (const pid of ['player', 'opponent'] as const) {
      for (const c of state.players[pid].battleZone) {
        if (getCreatureEffectivePower(c, false) <= 4000) {
          toDestroy.push(c);
        }
      }
    }

    toDestroy.sort((a, b) => {
      const aAura = /balloonshroom|gigamantis/i.test(a.card.name);
      const bAura = /balloonshroom|gigamantis/i.test(b.card.name);
      return (aAura ? 1 : 0) - (bAura ? 1 : 0);
    });

    let nextState = state;
    for (const c of toDestroy) {
      nextState = destroyCreature(nextState, c.instanceId);
    }

    return {
      ...nextState,
      actionLog: [
        ...nextState.actionLog,
        `${player} destroyed ${toDestroy.length} creature(s) with power 4000 or less with ${card.name}.`
      ]
    };
  }

  // Searing Wave: Destroy all opponent creatures that have power 3000 or less, move 1 friendly shield to graveyard
  if (
    cardName === 'searing wave' ||
    /destroy all (?:your )?opponent's creatures that have power 3000 or less/i.test(rules)
  ) {
    const toDestroy: CreatureInstance[] = [];
    for (const c of opponentState.battleZone) {
      if (getCreatureEffectivePower(c, false) <= 3000) {
        toDestroy.push(c);
      }
    }

    toDestroy.sort((a, b) => {
      const aAura = /balloonshroom|gigamantis/i.test(a.card.name);
      const bAura = /balloonshroom|gigamantis/i.test(b.card.name);
      return (aAura ? 1 : 0) - (bAura ? 1 : 0);
    });

    let nextState = state;
    for (const c of toDestroy) {
      nextState = destroyCreature(nextState, c.instanceId);
    }

    // Move 1 friendly unbroken shield into graveyard without triggering shield triggers
    const casterState = nextState.players[player];
    const unbrokenShields = casterState.shields.filter((s) => !s.isBroken);
    if (unbrokenShields.length > 0) {
      let chosenShield = unbrokenShields[0];
      if (targets && targets.length > 0) {
        const targetShield = unbrokenShields.find(
          (s) => targets.includes(s.id) || (s.shieldId && targets.includes(s.shieldId))
        );
        if (targetShield) {
          chosenShield = targetShield;
        }
      }

      const nextShields = casterState.shields.filter((s) => s.id !== chosenShield.id);
      const graveCard: CardInstance = {
        instanceId: chosenShield.id,
        card: chosenShield.card,
        owner: player
      };

      nextState = {
        ...nextState,
        players: {
          ...nextState.players,
          [player]: {
            ...casterState,
            shields: nextShields,
            graveyard: [...casterState.graveyard, graveCard]
          }
        },
        actionLog: [
          ...nextState.actionLog,
          `${player} put a shield (${chosenShield.card.name}) into the graveyard with ${card.name}.`
        ]
      };
    }

    return {
      ...nextState,
      actionLog: [
        ...nextState.actionLog,
        `${player} destroyed ${toDestroy.length} opponent creature(s) with power 3000 or less with ${card.name}.`
      ]
    };
  }

  // Invincible Abyss: Destroy all your opponent's creatures
  if (
    cardName === 'invincible abyss' ||
    (/destroy all (?:your )?opponent's creatures\b/i.test(rules) && !/power/i.test(rules))
  ) {
    const toDestroy = [...opponentState.battleZone];
    toDestroy.sort((a, b) => {
      const aAura = /balloonshroom|gigamantis/i.test(a.card.name);
      const bAura = /balloonshroom|gigamantis/i.test(b.card.name);
      return (aAura ? 1 : 0) - (bAura ? 1 : 0);
    });

    let nextState = state;
    for (const c of toDestroy) {
      nextState = destroyCreature(nextState, c.instanceId);
    }

    return {
      ...nextState,
      actionLog: [
        ...nextState.actionLog,
        `${player} destroyed all ${toDestroy.length} opponent creature(s) with ${card.name}.`
      ]
    };
  }

  // Apocalypse Day: If there are 6 or more creatures in the battle zone, destroy all creatures
  if (
    cardName === 'apocalypse day' ||
    (/destroy all creatures/i.test(rules) && /6 or more/i.test(rules))
  ) {
    const totalCreatures =
      state.players.player.battleZone.length + state.players.opponent.battleZone.length;

    if (totalCreatures < 6) {
      return {
        ...state,
        actionLog: [
          ...state.actionLog,
          `${player} cast ${card.name}, but there are only ${totalCreatures} creature(s) in the battle zone (requires 6 or more).`
        ]
      };
    }

    const toDestroy: CreatureInstance[] = [
      ...state.players.player.battleZone,
      ...state.players.opponent.battleZone
    ];

    toDestroy.sort((a, b) => {
      const aAura = /balloonshroom|gigamantis/i.test(a.card.name);
      const bAura = /balloonshroom|gigamantis/i.test(b.card.name);
      return (aAura ? 1 : 0) - (bAura ? 1 : 0);
    });

    let nextState = state;
    for (const c of toDestroy) {
      nextState = destroyCreature(nextState, c.instanceId);
    }

    return {
      ...nextState,
      actionLog: [
        ...nextState.actionLog,
        `${player} destroyed all ${toDestroy.length} creatures in the battle zone with ${card.name}.`
      ]
    };
  }

  // Apocalypse Vise: Destroy any number of your opponent's creatures that have total power 8000 or less
  if (
    cardName === 'apocalypse vise' ||
    /destroy any number of (?:your )?opponent's creatures that have total power 8000 or less/i.test(
      rules
    )
  ) {
    const opponentBZ = opponentState.battleZone;
    if (opponentBZ.length === 0) {
      return state;
    }

    let targetsToDestroy: string[] = [];

    if (targets && targets.length > 0) {
      const targetCreatures: CreatureInstance[] = [];
      for (const tid of targets) {
        const found = opponentBZ.find((c) => c.instanceId === tid);
        if (!found) {
          throw new Error(`Target creature ${tid} not found in opponent's battle zone.`);
        }
        targetCreatures.push(found);
      }

      const totalPower = targetCreatures.reduce(
        (sum, c) => sum + getCreatureEffectivePower(c, false),
        0
      );
      if (totalPower > 8000) {
        throw new Error(
          `Target creatures have total power ${totalPower}, exceeding the 8000 limit for ${card.name}.`
        );
      }
      targetsToDestroy = targetCreatures.map((c) => c.instanceId);
    } else {
      // Greedily select opponent creatures up to 8000 total power
      const sorted = [...opponentBZ].sort(
        (a, b) => getCreatureEffectivePower(b, false) - getCreatureEffectivePower(a, false)
      );
      let remainingPower = 8000;
      for (const c of sorted) {
        const p = getCreatureEffectivePower(c, false);
        if (p <= remainingPower) {
          targetsToDestroy.push(c.instanceId);
          remainingPower -= p;
        }
      }
    }

    let nextState = state;
    for (const tid of targetsToDestroy) {
      nextState = destroyCreature(nextState, tid);
    }

    return {
      ...nextState,
      actionLog: [
        ...nextState.actionLog,
        `${player} destroyed ${targetsToDestroy.length} opponent creature(s) with ${card.name}.`
      ]
    };
  }

  // 6. Terror Pit / Generic destroy 1 opponent creature
  if (
    cardName === 'terror pit' ||
    /destroy (?:1|one) of your opponent's creatures/i.test(rules)
  ) {
    if (opponentState.battleZone.length === 0) {
      return state;
    }
    const targetId = targets?.[0];
    if (!targetId) {
      throw new Error(`Spell Terror Pit requires a target creature.`);
    }
    const targetCreature = opponentState.battleZone.find((c) => c.instanceId === targetId);
    if (!targetCreature) {
      throw new Error(`Target creature ${targetId} not found in opponent's battle zone.`);
    }
    return destroyCreature(state, targetId);
  }

  // 7. Spiral Gate / Riptide Charger: Return 1 creature to owner hand
  if (
    cardName === 'spiral gate' ||
    cardName === 'riptide charger' ||
    /choose a creature in the battle zone and return it to its owner's hand/i.test(rules)
  ) {
    const totalCreatures =
      state.players.player.battleZone.length + state.players.opponent.battleZone.length;
    if (totalCreatures === 0) {
      return state;
    }
    const targetId = targets?.[0];
    if (!targetId) {
      throw new Error(`Spell ${card.name} requires a target creature.`);
    }
    const found = findCreature(state, targetId);
    if (!found) {
      throw new Error(`Target creature ${targetId} not found in battle zone.`);
    }
    return bounceCreature(state, targetId);
  }

  // 8. Teleportation: Return up to 2 creatures to owners' hands
  if (
    cardName === 'teleportation' ||
    cardName === 'abduction charger' ||
    /choose up to 2 creatures in the battle zone and return them to their owners?'? hands/i.test(
      rules
    )
  ) {
    let targetsToBounce: string[] = [];
    if (targets && targets.length > 0) {
      targetsToBounce = targets.slice(0, 2);
    } else {
      const opponentBZ = opponentState.battleZone;
      if (opponentBZ.length > 0) {
        const sorted = [...opponentBZ].sort(
          (a, b) =>
            getCreatureEffectivePower(b, false) - getCreatureEffectivePower(a, false)
        );
        targetsToBounce = sorted.slice(0, 2).map((c) => c.instanceId);
      }
    }

    if (targetsToBounce.length === 0) {
      return state;
    }

    let nextState = state;
    for (const tid of targetsToBounce) {
      nextState = bounceCreature(nextState, tid);
    }
    return nextState;
  }

  // 9. Natural Snare: Put 1 opponent creature into their mana zone
  if (
    cardName === 'natural snare' ||
    /choose 1 of your opponent's creatures in the battle zone and put it into (?:his|their) mana zone/i.test(
      rules
    )
  ) {
    if (opponentState.battleZone.length === 0) {
      return state;
    }
    const targetId = targets?.[0];
    if (!targetId) {
      throw new Error(`Spell Natural Snare requires a target creature.`);
    }
    const targetCreature = opponentState.battleZone.find((c) => c.instanceId === targetId);
    if (!targetCreature) {
      throw new Error(`Target creature ${targetId} not found in opponent's battle zone.`);
    }
    return sendCreatureToManaZone(state, targetId);
  }

  // 10. Mulch Charger: Put 1 friendly creature into caster's mana zone
  if (
    cardName === 'mulch charger' ||
    /put one of your creatures from the battle zone into your mana zone/i.test(rules)
  ) {
    const friendlyBZ = state.players[player].battleZone;
    if (friendlyBZ.length === 0) {
      return state;
    }
    const targetId = targets?.[0];
    if (!targetId) {
      throw new Error(`Spell Mulch Charger requires a target creature.`);
    }
    const targetCreature = friendlyBZ.find((c) => c.instanceId === targetId);
    if (!targetCreature) {
      throw new Error(`Target creature ${targetId} not found in ${player}'s battle zone.`);
    }
    return sendCreatureToManaZone(state, targetId);
  }

  // 11. Faerie Life: Put top card of deck into mana zone
  if (
    cardName === 'faerie life' ||
    (/put the top card of (?:your )?deck into (?:your )?mana zone/i.test(rules) &&
      !/opponent/i.test(rules) &&
      !/graveyard/i.test(rules))
  ) {
    return rampTopDeckToManaZone(state, player);
  }

  // 11a. Ultimate Force: Put the top 2 cards of your deck into your mana zone
  if (
    cardName === 'ultimate force' ||
    /put the top 2 cards of (?:your )?deck into (?:your )?mana zone/i.test(rules)
  ) {
    let nextState = rampTopDeckToManaZone(state, player);
    return rampTopDeckToManaZone(nextState, player);
  }

  // 11b. Miraculous Meltdown: If opponent has more shields than you do, choose up to that many of your opponent's shields and break them
  if (
    cardName === 'miraculous meltdown' ||
    /opponent has more shields than you.*break them/i.test(rules) ||
    /opponent chooses one of his shields for each shield you have/i.test(rules)
  ) {
    const playerShields = state.players[player].shields.filter((s) => !s.isBroken).length;
    const opponentShields = state.players[opponent].shields.filter((s) => !s.isBroken).length;
    const diff = opponentShields - playerShields;
    if (diff > 0) {
      return breakOpponentShields(state, player, diff, targets);
    }
    return {
      ...state,
      actionLog: [
        ...state.actionLog,
        `${player} cast Miraculous Meltdown, but opponent does not have more shields.`
      ]
    };
  }

  // 11c. Reverse Armor: Untap friendly creature
  if (
    cardName === 'reverse armor' ||
    /untap (?:a|one|that|the) creature/i.test(rules)
  ) {
    const friendlyBZ = state.players[player].battleZone;
    if (friendlyBZ.length === 0) {
      return state;
    }
    let targetId = targets?.[0];
    if (!targetId) {
      const tapped = friendlyBZ.find((c) => c.isTapped);
      targetId = tapped?.instanceId || friendlyBZ[0].instanceId;
    }
    const targetCreature = friendlyBZ.find((c) => c.instanceId === targetId);
    if (!targetCreature) {
      return state;
    }
    const updatedBZ = friendlyBZ.map((c) =>
      c.instanceId === targetId ? { ...c, isTapped: false } : c
    );
    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...state.players[player],
          battleZone: updatedBZ
        }
      },
      actionLog: [
        ...state.actionLog,
        `${player} untapped ${targetCreature.card.name} with ${card.name}.`
      ]
    };
  }

  // 11d. Sundrop Armor: Add a card from hand to shields
  if (
    cardName === 'sundrop armor' ||
    /add a card from your hand to your shields/i.test(rules)
  ) {
    const curHand = state.players[player].hand;
    if (curHand.length === 0) {
      return state;
    }
    let chosenIndex = 0;
    if (targets && targets.length > 0) {
      const idx = curHand.findIndex((c) => c.instanceId === targets[0]);
      if (idx !== -1) chosenIndex = idx;
    }
    const chosenCard = curHand[chosenIndex];
    const nextHand = curHand.filter((_, idx) => idx !== chosenIndex);
    const shieldId = `shield-${player}-${state.players[player].shields.length}-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;
    const newShield: ShieldInstance = {
      id: shieldId,
      shieldId,
      card: chosenCard.card,
      isBroken: false
    };
    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...state.players[player],
          hand: nextHand,
          shields: [...state.players[player].shields, newShield]
        }
      },
      actionLog: [
        ...state.actionLog,
        `${player} added a card from hand to shields with ${card.name}.`
      ]
    };
  }

  // Dark Reversal / Corpse Charger: Return a creature from your graveyard to your hand
  if (
    cardName === 'dark reversal' ||
    cardName === 'corpse charger' ||
    /return a creature from your graveyard to your hand/i.test(rules) ||
    /put a creature from your graveyard into your hand/i.test(rules)
  ) {
    const pState = state.players[player];
    const creatureIndices = pState.graveyard
      .map((c, idx) => ({ c, idx }))
      .filter(
        (x) => x.c.card.type === 'Creature' || x.c.card.type === 'Evolution Creature'
      );

    if (creatureIndices.length === 0) {
      return {
        ...state,
        actionLog: [
          ...state.actionLog,
          `${player} cast ${card.name}, but there are no creatures in the graveyard.`
        ]
      };
    }

    let chosenIndex = -1;
    if (targets && targets.length > 0) {
      const match = creatureIndices.find(
        (x) => x.c.instanceId === targets[0] || x.c.card.id === targets[0]
      );
      if (match) {
        chosenIndex = match.idx;
      }
    }

    if (chosenIndex === -1) {
      const sorted = [...creatureIndices].sort(
        (a, b) => (b.c.card.power ?? 0) - (a.c.card.power ?? 0)
      );
      chosenIndex = sorted[0].idx;
    }

    const chosenCard = pState.graveyard[chosenIndex];
    const nextGraveyard = pState.graveyard.filter((_, idx) => idx !== chosenIndex);

    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...pState,
          graveyard: nextGraveyard,
          hand: [...pState.hand, chosenCard]
        }
      },
      actionLog: [
        ...state.actionLog,
        `${player} returned ${chosenCard.card.name} from graveyard to hand with ${card.name}.`
      ]
    };
  }

  // Morbid Medicine: Return up to 2 creatures from your graveyard to your hand
  if (
    cardName === 'morbid medicine' ||
    /return up to 2 creatures from your graveyard to your hand/i.test(rules)
  ) {
    const pState = state.players[player];
    const creatureIndices = pState.graveyard
      .map((c, idx) => ({ c, idx }))
      .filter(
        (x) => x.c.card.type === 'Creature' || x.c.card.type === 'Evolution Creature'
      );

    if (creatureIndices.length === 0) {
      return {
        ...state,
        actionLog: [
          ...state.actionLog,
          `${player} cast ${card.name}, but there are no creatures in the graveyard.`
        ]
      };
    }

    const chosenIndices: number[] = [];

    if (targets && targets.length > 0) {
      for (const tid of targets.slice(0, 2)) {
        const match = creatureIndices.find(
          (x) =>
            !chosenIndices.includes(x.idx) &&
            (x.c.instanceId === tid || x.c.card.id === tid)
        );
        if (match) {
          chosenIndices.push(match.idx);
        }
      }
    }

    if (chosenIndices.length === 0) {
      const sorted = [...creatureIndices].sort(
        (a, b) => (b.c.card.power ?? 0) - (a.c.card.power ?? 0)
      );
      for (const item of sorted.slice(0, 2)) {
        chosenIndices.push(item.idx);
      }
    }

    const chosenCards = chosenIndices.map((idx) => pState.graveyard[idx]);
    const chosenSet = new Set(chosenIndices);
    const nextGraveyard = pState.graveyard.filter((_, idx) => !chosenSet.has(idx));

    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...pState,
          graveyard: nextGraveyard,
          hand: [...pState.hand, ...chosenCards]
        }
      },
      actionLog: [
        ...state.actionLog,
        `${player} returned ${chosenCards.map((c) => c.card.name).join(', ')} from graveyard to hand with ${card.name}.`
      ]
    };
  }

  // Zombie Carnival: Choose a race. Return up to 3 creatures of that race from your graveyard to your hand
  if (
    cardName === 'zombie carnival' ||
    (/choose a race/i.test(rules) && /from your graveyard to your hand/i.test(rules))
  ) {
    const pState = state.players[player];
    const creatureIndices = pState.graveyard
      .map((c, idx) => ({ c, idx }))
      .filter(
        (x) => x.c.card.type === 'Creature' || x.c.card.type === 'Evolution Creature'
      );

    if (creatureIndices.length === 0) {
      return {
        ...state,
        actionLog: [
          ...state.actionLog,
          `${player} cast ${card.name}, but there are no creatures in the graveyard.`
        ]
      };
    }

    const getRaces = (cardDef: CardDefinition): string[] => {
      const list: string[] = [];
      if (cardDef.races && Array.isArray(cardDef.races)) {
        list.push(...cardDef.races);
      }
      const anyCard = cardDef as unknown as { race?: string };
      if (anyCard.race && typeof anyCard.race === 'string') {
        list.push(anyCard.race);
      }
      return list;
    };

    let chosenCards: CardInstance[] = [];
    let chosenRace = '';

    if (targets && targets.length > 0) {
      const targetCreatures: { c: CardInstance; idx: number }[] = [];
      for (const tid of targets.slice(0, 3)) {
        const match = creatureIndices.find(
          (x) =>
            !targetCreatures.some((tc) => tc.idx === x.idx) &&
            (x.c.instanceId === tid || x.c.card.id === tid)
        );
        if (match) {
          targetCreatures.push(match);
        }
      }

      if (targetCreatures.length > 0) {
        let commonRaces = getRaces(targetCreatures[0].c.card);
        for (let i = 1; i < targetCreatures.length; i++) {
          const rList = getRaces(targetCreatures[i].c.card);
          commonRaces = commonRaces.filter((r) => rList.includes(r));
        }

        if (commonRaces.length === 0) {
          throw new Error(
            `Target creatures do not share a common race for ${card.name}.`
          );
        }
        chosenRace = commonRaces[0];
        chosenCards = targetCreatures.map((x) => x.c);
      }
    }

    if (chosenCards.length === 0) {
      const raceCounts = new Map<string, number>();
      for (const item of creatureIndices) {
        const races = getRaces(item.c.card);
        for (const r of races) {
          raceCounts.set(r, (raceCounts.get(r) || 0) + 1);
        }
      }

      if (raceCounts.size === 0) {
        return {
          ...state,
          actionLog: [
            ...state.actionLog,
            `${player} cast ${card.name}, but no creatures with races were found in graveyard.`
          ]
        };
      }

      let maxCount = 0;
      for (const [r, count] of raceCounts.entries()) {
        if (count > maxCount) {
          maxCount = count;
          chosenRace = r;
        }
      }

      const matching = creatureIndices.filter((x) =>
        getRaces(x.c.card).includes(chosenRace)
      );
      matching.sort((a, b) => (b.c.card.power ?? 0) - (a.c.card.power ?? 0));
      chosenCards = matching.slice(0, 3).map((x) => x.c);
    }

    const chosenIds = new Set(chosenCards.map((c) => c.instanceId));
    const nextGraveyard = pState.graveyard.filter((c) => !chosenIds.has(c.instanceId));

    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...pState,
          graveyard: nextGraveyard,
          hand: [...pState.hand, ...chosenCards]
        }
      },
      actionLog: [
        ...state.actionLog,
        `${player} returned ${chosenCards.length} ${chosenRace} creature(s) (${chosenCards.map((c) => c.card.name).join(', ')}) from graveyard to hand with ${card.name}.`
      ]
    };
  }

  // Lost Soul: Opponent discards all cards from hand
  if (
    cardName === 'lost soul' ||
    /opponent discards all cards/i.test(rules)
  ) {
    const opponentHand = opponentState.hand;
    if (opponentHand.length === 0) {
      return {
        ...state,
        actionLog: [
          ...state.actionLog,
          `${player} cast ${card.name}, but ${opponent}'s hand is empty.`
        ]
      };
    }

    return {
      ...state,
      players: {
        ...state.players,
        [opponent]: {
          ...opponentState,
          hand: [],
          graveyard: [...opponentState.graveyard, ...opponentHand]
        }
      },
      actionLog: [
        ...state.actionLog,
        `${opponent} discarded all ${opponentHand.length} card(s) from hand with ${card.name}.`
      ]
    };
  }

  // Reap and Sow: Put 1 card from opponent's mana zone into graveyard, ramp top card of deck to mana zone
  if (
    cardName === 'reap and sow' ||
    (/opponent's mana zone and put it into (?:his|their) graveyard/i.test(rules) &&
      /top card of (?:your )?deck into (?:your )?mana zone/i.test(rules))
  ) {
    let stateAfterManaDestroy = state;
    const oppMana = state.players[opponent].manaZone;

    if (oppMana.length > 0) {
      let targetIndex = 0;
      if (targets && targets.length > 0) {
        const idx = oppMana.findIndex(
          (m) => m.instanceId === targets[0] || m.card.id === targets[0]
        );
        if (idx !== -1) {
          targetIndex = idx;
        }
      }

      const destroyedMana = oppMana[targetIndex];
      const nextOppMana = oppMana.filter((_, idx) => idx !== targetIndex);
      const graveCard: CardInstance = {
        instanceId: destroyedMana.instanceId,
        card: destroyedMana.card,
        owner: opponent
      };

      stateAfterManaDestroy = {
        ...state,
        players: {
          ...state.players,
          [opponent]: {
            ...state.players[opponent],
            manaZone: nextOppMana,
            graveyard: [...state.players[opponent].graveyard, graveCard]
          }
        },
        actionLog: [
          ...state.actionLog,
          `${player} put ${destroyedMana.card.name} from ${opponent}'s mana zone into the graveyard with ${card.name}.`
        ]
      };
    } else {
      stateAfterManaDestroy = {
        ...state,
        actionLog: [
          ...state.actionLog,
          `${player} cast ${card.name}, but ${opponent} has no cards in the mana zone.`
        ]
      };
    }

    return rampTopDeckToManaZone(stateAfterManaDestroy, player);
  }

  // Mana Crisis: Put 1 card from opponent's mana zone into graveyard
  if (
    cardName === 'mana crisis' ||
    /choose a card in your opponent's mana zone and put it into (?:his|their) graveyard/i.test(
      rules
    )
  ) {
    const oppMana = opponentState.manaZone;
    if (oppMana.length === 0) {
      return {
        ...state,
        actionLog: [
          ...state.actionLog,
          `${player} cast ${card.name}, but ${opponent} has no cards in the mana zone.`
        ]
      };
    }

    let targetIndex = 0;
    if (targets && targets.length > 0) {
      const idx = oppMana.findIndex(
        (m) => m.instanceId === targets[0] || m.card.id === targets[0]
      );
      if (idx !== -1) {
        targetIndex = idx;
      }
    }

    const destroyedMana = oppMana[targetIndex];
    const nextOppMana = oppMana.filter((_, idx) => idx !== targetIndex);
    const graveCard: CardInstance = {
      instanceId: destroyedMana.instanceId,
      card: destroyedMana.card,
      owner: opponent
    };

    return {
      ...state,
      players: {
        ...state.players,
        [opponent]: {
          ...opponentState,
          manaZone: nextOppMana,
          graveyard: [...opponentState.graveyard, graveCard]
        }
      },
      actionLog: [
        ...state.actionLog,
        `${player} put ${destroyedMana.card.name} from ${opponent}'s mana zone into the graveyard with ${card.name}.`
      ]
    };
  }

  // 12. Draw spells: Brain Serum (2), Cyber Brain (3), Energy Stream (2), Eureka Charger (1)
  if (cardName === 'brain serum' || cardName === 'energy stream') {
    return drawCards(state, player, 2);
  }
  if (cardName === 'cyber brain') {
    return drawCards(state, player, 3);
  }
  if (cardName === 'eureka charger') {
    return drawCards(state, player, 1);
  }
  const drawMatch = rules.match(/draw (?:up to )?(\d+) cards?/i);
  if (drawMatch) {
    const count = parseInt(drawMatch[1], 10);
    return drawCards(state, player, count);
  }

  // 13. Energy Charger: +2000 power to friendly creature
  if (
    cardName === 'energy charger' ||
    /gets \+2000 power until the end of the turn/i.test(rules)
  ) {
    const friendlyBZ = state.players[player].battleZone;
    if (friendlyBZ.length === 0) {
      return state;
    }
    const targetId = targets?.[0];
    if (!targetId) {
      throw new Error(`Spell Energy Charger requires a target creature.`);
    }
    const targetCreature = friendlyBZ.find((c) => c.instanceId === targetId);
    if (!targetCreature) {
      throw new Error(`Target creature ${targetId} not found in ${player}'s battle zone.`);
    }
    const updatedBZ = friendlyBZ.map((c) =>
      c.instanceId === targetId ? { ...c, powerModifier: c.powerModifier + 2000 } : c
    );
    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...state.players[player],
          battleZone: updatedBZ
        }
      },
      actionLog: [...state.actionLog, `${player} gave +2000 power to ${targetCreature.card.name}.`]
    };
  }

  // 14. Burning Power: One of your creatures gets "power attacker +2000" until the end of the turn
  if (
    cardName === 'burning power' ||
    /gets (?:“|")?power attacker \+2000(?:”|")?/i.test(rules) ||
    /gets (?:“|")?power attacker \+(\d+)(?:”|")?/i.test(rules)
  ) {
    const friendlyBZ = state.players[player].battleZone;
    if (friendlyBZ.length === 0) {
      return state;
    }
    const targetId = targets?.[0] || friendlyBZ[0].instanceId;
    const targetCreature = friendlyBZ.find((c) => c.instanceId === targetId);
    if (!targetCreature) {
      return state;
    }
    const updatedBZ = friendlyBZ.map((c) =>
      c.instanceId === targetId
        ? {
            ...c,
            tempPowerAttackerBonus: (c.tempPowerAttackerBonus || 0) + 2000
          }
        : c
    );
    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...state.players[player],
          battleZone: updatedBZ
        }
      },
      actionLog: [
        ...state.actionLog,
        `${player} gave power attacker +2000 to ${targetCreature.card.name} with ${card.name}.`
      ]
    };
  }

  // 15. Dimension Gate: Search deck for creature and put into hand
  if (
    cardName === 'dimension gate' ||
    /search your deck.*take a creature from your deck.*put it into your hand/i.test(rules)
  ) {
    const pState = state.players[player];
    if (pState.deck.length === 0) {
      return {
        ...state,
        actionLog: [
          ...state.actionLog,
          `${player} searched deck with Dimension Gate, but deck was empty.`
        ]
      };
    }

    let targetCardIndex = -1;
    if (targets && targets.length > 0) {
      targetCardIndex = pState.deck.findIndex(
        (c) =>
          c.instanceId === targets[0] &&
          (c.card.type === 'Creature' || c.card.type === 'Evolution Creature')
      );
    }

    if (targetCardIndex === -1) {
      const creatureIndices = pState.deck
        .map((c, idx) => ({ c, idx }))
        .filter(
          (x) =>
            x.c.card.type === 'Creature' || x.c.card.type === 'Evolution Creature'
        );

      if (creatureIndices.length > 0) {
        creatureIndices.sort(
          (a, b) => (b.c.card.power ?? 0) - (a.c.card.power ?? 0)
        );
        targetCardIndex = creatureIndices[0].idx;
      }
    }

    if (targetCardIndex === -1) {
      return {
        ...state,
        actionLog: [
          ...state.actionLog,
          `${player} searched deck with Dimension Gate, but found no creatures.`
        ]
      };
    }

    const chosenCard = pState.deck[targetCardIndex];
    const remainingDeck = pState.deck.filter((_, idx) => idx !== targetCardIndex);

    const shuffledDeck = [...remainingDeck];
    for (let i = shuffledDeck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledDeck[i], shuffledDeck[j]] = [shuffledDeck[j], shuffledDeck[i]];
    }

    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...pState,
          deck: shuffledDeck,
          hand: [...pState.hand, chosenCard]
        }
      },
      actionLog: [
        ...state.actionLog,
        `${player} searched deck and added ${chosenCard.card.name} to hand with ${card.name}.`
      ]
    };
  }

  // Generic fallback: return state with action logged
  return {
    ...state,
    actionLog: [...state.actionLog, `${player} resolved ${card.name}.`]
  };
}

/**
 * Casts a spell card from the active player's hand:
 * 1. Validates game state, active turn, phase (auto-transitions MANA_CHARGE to MAIN).
 * 2. Validates card in hand, card type (Spell), and mana payment capability.
 * 3. Taps required mana in player's mana zone.
 * 4. Removes card from player's hand.
 * 5. Resolves spell effect on the game state.
 * 6. If Charger spell, places the card into the player's mana zone UNTAPPED.
 *    Otherwise, places the card into the player's graveyard.
 * 7. Logs the action and returns the new immutable GameState.
 */
export function castSpell(
  state: GameState,
  player: PlayerId,
  cardInstanceId: string,
  targets?: string[]
): GameState {
  if (state.winner !== null) {
    throw new Error(`Game has already ended. Winner: ${state.winner}`);
  }

  if (state.activePlayer !== player) {
    throw new Error(`Cannot cast spell when it is not ${player}'s turn.`);
  }

  if (state.phase !== 'MAIN' && state.phase !== 'MANA_CHARGE') {
    throw new Error(`Cannot cast spell during ${state.phase} phase.`);
  }

  const playerState = state.players[player];
  const cardIndex = playerState.hand.findIndex((c) => c.instanceId === cardInstanceId);
  if (cardIndex === -1) {
    throw new Error(`Card ${cardInstanceId} not found in ${player}'s hand.`);
  }

  const spellCard = playerState.hand[cardIndex];
  if (spellCard.card.type !== 'Spell') {
    throw new Error(`Card ${spellCard.card.name} is not a spell.`);
  }

  if (!canPayManaCost(playerState.manaZone, spellCard.card)) {
    throw new Error(`Cannot afford mana cost for ${spellCard.card.name}.`);
  }

  const { success, updatedManaZone } = payManaCost(playerState.manaZone, spellCard.card);
  if (!success) {
    throw new Error(`Failed to pay mana cost for ${spellCard.card.name}.`);
  }

  const nextHand = playerState.hand.filter((_, idx) => idx !== cardIndex);

  const stateAfterPayment: GameState = {
    ...state,
    phase: 'MAIN',
    players: {
      ...state.players,
      [player]: {
        ...playerState,
        hand: nextHand,
        manaZone: updatedManaZone
      }
    }
  };

  const stateAfterEffect = resolveSpellEffect(
    stateAfterPayment,
    player,
    spellCard.card,
    targets
  );

  const isCharger = isChargerSpell(spellCard.card);
  const casterState = stateAfterEffect.players[player];

  let nextCasterState: PlayerState;
  if (isCharger) {
    const manaCard: ManaCardInstance = {
      instanceId: spellCard.instanceId,
      card: spellCard.card,
      isTapped: false
    };
    nextCasterState = {
      ...casterState,
      manaZone: [...casterState.manaZone, manaCard]
    };
  } else {
    const graveCard: CardInstance = {
      instanceId: spellCard.instanceId,
      card: spellCard.card,
      owner: player
    };
    nextCasterState = {
      ...casterState,
      graveyard: [...casterState.graveyard, graveCard]
    };
  }

  const spellActionLog = `${player} cast ${spellCard.card.name}${
    isCharger ? ' (Charger -> Mana Zone)' : ''
  }.`;

  return {
    ...stateAfterEffect,
    players: {
      ...stateAfterEffect.players,
      [player]: nextCasterState
    },
    actionLog: [...stateAfterEffect.actionLog, spellActionLog]
  };
}
