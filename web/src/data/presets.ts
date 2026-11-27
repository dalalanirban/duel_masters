import type { Deck } from '../types/card.ts';
import { CARD_MAP } from './cardLoader.ts';
import { buildPresetDecks } from './cardCatalogCore.ts';

export const PRESET_DECKS: Deck[] = buildPresetDecks(CARD_MAP);
