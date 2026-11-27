import type { CardDefinition } from '../../types/card.ts';
import { CARD_LIST } from '../../data/cardLoader.ts';
import {
  classifyLogSeverity,
  escapeRegExp,
  buildCardRegex,
  parseLogTextWithCards as parseWithMap,
  type LogToken,
  type LogSeverity
} from './duelLogUtils.ts';

export {
  classifyLogSeverity,
  escapeRegExp,
  buildCardRegex,
  type LogToken,
  type LogSeverity
};

// Pre-indexed map of card name -> CardDefinition for Node tests & synchronous callers
export const DEFAULT_CARD_BY_NAME = new Map<string, CardDefinition>();
for (const card of CARD_LIST) {
  if (!DEFAULT_CARD_BY_NAME.has(card.name)) {
    DEFAULT_CARD_BY_NAME.set(card.name, card);
  }
}

// Pre-compiled regex containing all card names in the database
export const DEFAULT_CARD_REGEX = buildCardRegex(Array.from(DEFAULT_CARD_BY_NAME.keys()));

/**
 * Parses log message text and segments it into plain text tokens and interactive card tokens.
 */
export function parseLogTextWithCards(
  logText: string,
  customMap?: Map<string, CardDefinition>
): LogToken[] {
  return parseWithMap(logText, customMap ?? DEFAULT_CARD_BY_NAME);
}
