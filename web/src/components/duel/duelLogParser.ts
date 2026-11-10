import type { CardDefinition } from '../../types/card';
import { CARD_LIST } from '../../data/cardLoader.ts';

export interface LogToken {
  text: string;
  card?: CardDefinition;
}

/**
 * Escapes regex special characters in a string.
 */
export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Builds a Unicode-aware regular expression matching any of the given card names as whole tokens,
 * prioritizing longer card names first to prevent partial substring collisions.
 */
export function buildCardRegex(names: string[]): RegExp {
  if (names.length === 0) {
    return /(?!)/gu;
  }
  const sorted = [...new Set(names)].sort((a, b) => b.length - a.length);
  const pattern = sorted.map(escapeRegExp).join('|');
  return new RegExp(`(?<![\\p{L}\\p{N}])(${pattern})(?![\\p{L}\\p{N}])`, 'gu');
}

// Pre-indexed map of card name -> CardDefinition
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
 *
 * @param logText The raw log message string.
 * @param customMap Optional custom card map for testing or scoped card lookups.
 * @returns Array of LogToken objects.
 */
export function parseLogTextWithCards(
  logText: string,
  customMap?: Map<string, CardDefinition>
): LogToken[] {
  if (!logText || logText.trim() === '') {
    return logText ? [{ text: logText }] : [];
  }

  const map = customMap ?? DEFAULT_CARD_BY_NAME;
  const regex = customMap ? buildCardRegex(Array.from(customMap.keys())) : DEFAULT_CARD_REGEX;

  // Reset RegExp state
  regex.lastIndex = 0;

  const tokens: LogToken[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(logText)) !== null) {
    const matchIndex = match.index;
    const matchedText = match[0];

    // Push preceding non-card text
    if (matchIndex > lastIndex) {
      tokens.push({ text: logText.substring(lastIndex, matchIndex) });
    }

    // Lookup card definition
    const card = map.get(matchedText);
    if (card) {
      tokens.push({ text: matchedText, card });
    } else {
      tokens.push({ text: matchedText });
    }

    lastIndex = matchIndex + matchedText.length;
  }

  // Push trailing non-card text
  if (lastIndex < logText.length) {
    tokens.push({ text: logText.substring(lastIndex) });
  }

  return tokens;
}
