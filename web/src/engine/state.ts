import type { Deck, CardDefinition } from '../types/card';
import type {
  PlayerId,
  GameState,
  PlayerState,
  CardInstance,
  ShieldInstance
} from './types';

let instanceCounter = 0;

/**
 * Creates a unique card instance associated with a specific owner.
 */
export function createCardInstance(
  card: CardDefinition,
  owner: PlayerId,
  customId?: string
): CardInstance {
  const instanceId =
    customId ??
    `${owner}-${card.id}-${Date.now().toString(36)}-${(++instanceCounter).toString(36)}-${Math.random().toString(36).substring(2, 7)}`;
  return {
    instanceId,
    card,
    owner
  };
}

/**
 * Creates a unique shield instance with isBroken set to false.
 */
export function createShieldInstance(
  card: CardDefinition,
  owner: PlayerId,
  index: number
): ShieldInstance {
  const id = `shield-${owner}-${index}-${(++instanceCounter).toString(36)}-${Math.random().toString(36).substring(2, 7)}`;
  return {
    id,
    shieldId: id,
    card,
    isBroken: false
  };
}

/**
 * Expands a Deck definition into a list of individual CardDefinitions based on count.
 */
export function expandDeck(deck: Deck): CardDefinition[] {
  const cards: CardDefinition[] = [];
  for (const item of deck.items) {
    for (let i = 0; i < item.count; i++) {
      cards.push(item.card);
    }
  }
  return cards;
}

/**
 * Fisher-Yates shuffle implementation with customizable RNG.
 */
export function shuffleCards<T>(cards: T[], rng: () => number = Math.random): T[] {
  const result = [...cards];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const temp = result[i];
    result[i] = result[j];
    result[j] = temp;
  }
  return result;
}

export interface InitializeGameOptions {
  rng?: () => number;
  shuffle?: boolean;
}

/**
 * Initializes a new Duel Masters game following official tournament rules:
 * - 5 shields laid out face down for each player
 * - 5 cards dealt to each player's hand
 * - Remaining cards (typically 30) form the deck
 * - Turn 1 starts with the chosen starting player in MANA_CHARGE phase (draw step skipped)
 */
export function initializeGame(
  deck1: Deck,
  deck2: Deck,
  startingPlayer: PlayerId = 'player',
  options: InitializeGameOptions = {}
): GameState {
  const rng = options.rng ?? Math.random;
  const shouldShuffle = options.shuffle ?? true;

  const playerRawCards = expandDeck(deck1);
  const opponentRawCards = expandDeck(deck2);

  if (playerRawCards.length < 10) {
    throw new Error(
      `Deck must contain at least 10 cards (requires 5 shields and 5 hand cards). Total found: ${playerRawCards.length}`
    );
  }
  if (opponentRawCards.length < 10) {
    throw new Error(
      `Deck must contain at least 10 cards (requires 5 shields and 5 hand cards). Total found: ${opponentRawCards.length}`
    );
  }

  const playerShuffled = shouldShuffle
    ? shuffleCards(playerRawCards, rng)
    : [...playerRawCards];
  const opponentShuffled = shouldShuffle
    ? shuffleCards(opponentRawCards, rng)
    : [...opponentRawCards];

  const createPlayerState = (
    cards: CardDefinition[],
    owner: PlayerId
  ): PlayerState => {
    // 5 shields
    const shields: ShieldInstance[] = [];
    for (let i = 0; i < 5; i++) {
      shields.push(createShieldInstance(cards[i], owner, i));
    }

    // 5 hand cards
    const hand: CardInstance[] = [];
    for (let i = 5; i < 10; i++) {
      hand.push(createCardInstance(cards[i], owner));
    }

    // Remaining cards go to deck
    const deck: CardInstance[] = [];
    for (let i = 10; i < cards.length; i++) {
      deck.push(createCardInstance(cards[i], owner));
    }

    return {
      deck,
      hand,
      shields,
      manaZone: [],
      battleZone: [],
      graveyard: [],
      manaChargedThisTurn: false
    };
  };

  const players: Record<PlayerId, PlayerState> = {
    player: createPlayerState(playerShuffled, 'player'),
    opponent: createPlayerState(opponentShuffled, 'opponent')
  };

  return {
    turn: 1,
    activePlayer: startingPlayer,
    phase: 'MANA_CHARGE', // Turn 1 first player skips draw step
    players,
    combatState: null,
    pendingInteraction: null,
    winner: null,
    actionLog: [
      `Duel started. Turn 1: ${startingPlayer} goes first (draw step skipped).`
    ]
  };
}
