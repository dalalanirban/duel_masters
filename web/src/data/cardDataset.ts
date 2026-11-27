import type { CardDefinition, SetDefinition } from '../types/card.ts';
import allCardsData from './all_cards.json' with { type: 'json' };
import setsData from './sets.json' with { type: 'json' };

export const RAW_CARD_LIST: CardDefinition[] = allCardsData as unknown as CardDefinition[];

export const RAW_SETS: SetDefinition[] = setsData as unknown as SetDefinition[];
