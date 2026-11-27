import type { CardDefinition, SetDefinition } from '../types/card.ts';
import {
  buildCardCatalog,
  getRegisteredCardCatalog,
  registerCardCatalog,
  type CardCatalog
} from './cardCatalogCore.ts';

export type CardDatasetModule = {
  RAW_CARD_LIST: CardDefinition[];
  RAW_SETS: SetDefinition[];
};

const defaultDatasetImporter = (): Promise<CardDatasetModule> => import('./cardDataset.ts');

let inFlightCatalogPromise: Promise<CardCatalog> | null = null;

/**
 * Lazily loads the 12-set card database chunk once, indexes it into maps/presets,
 * caches it in memory for instant reuse across tabs, and deduplicates concurrent callers.
 */
export async function loadCardCatalog(
  datasetImporter: () => Promise<CardDatasetModule> = defaultDatasetImporter
): Promise<CardCatalog> {
  const existing = getRegisteredCardCatalog();
  if (existing) {
    return existing;
  }

  if (!inFlightCatalogPromise) {
    inFlightCatalogPromise = datasetImporter()
      .then(({ RAW_CARD_LIST, RAW_SETS }) => {
        const catalog = buildCardCatalog(RAW_CARD_LIST, RAW_SETS);
        return registerCardCatalog(catalog);
      })
      .catch((error) => {
        inFlightCatalogPromise = null;
        throw error;
      });
  }

  return inFlightCatalogPromise;
}

export function resetCardCatalogLoaderForTest(): void {
  inFlightCatalogPromise = null;
}
