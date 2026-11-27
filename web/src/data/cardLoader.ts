import type { CardDefinition, SetDefinition, CardFilterOptions } from '../types/card.ts';
import { RAW_CARD_LIST, RAW_SETS } from './cardDataset.ts';
import {
  buildCardCatalog,
  filterCardList,
  registerCardCatalog
} from './cardCatalogCore.ts';

export type { CardDefinition, SetDefinition, CardFilterOptions };

const SYNC_CATALOG = registerCardCatalog(buildCardCatalog(RAW_CARD_LIST, RAW_SETS));

export const CARD_LIST: CardDefinition[] = SYNC_CATALOG.cardList;

export const SETS: SetDefinition[] = SYNC_CATALOG.sets;

export const ALL_RACES: string[] = SYNC_CATALOG.allRaces;

export const CARD_MAP: Map<string, CardDefinition> = SYNC_CATALOG.cardMap;

export const DM01_CARDS: CardDefinition[] = SYNC_CATALOG.dm01Cards;

export function getCardById(id: string): CardDefinition | undefined {
  return CARD_MAP.get(id);
}

export function filterCards(options: CardFilterOptions = {}): CardDefinition[] {
  return filterCardList(CARD_LIST, options);
}
