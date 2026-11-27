import type { CardDefinition } from '../../types/card.ts';
import { getRegisteredCardCatalog } from '../../data/cardCatalogCore.ts';

export type LogSeverity =
  | 'muted'
  | 'mana'
  | 'summon'
  | 'combat'
  | 'trigger'
  | 'critical';

export interface LogToken {
  text: string;
  card?: CardDefinition;
}

const regexCache = new WeakMap<Map<string, CardDefinition>, RegExp>();

/**
 * Classifies a raw duel log entry into a semantic severity tier for scannable
 * styling and collapsed-rail high-priority notifications.
 */
export function classifyLogSeverity(entry: string): LogSeverity {
  const text = (entry || '').trim();
  if (!text) return 'muted';

  if (
    /won the duel|wins the game|decked out|direct attack on|Action error|lost the game|defeated \w+ directly/i.test(
      text
    )
  ) {
    return 'critical';
  }

  if (
    /shield trigger|triggered|silent skill|turbo rush|wave striker|activated .* ability|\$tap ability/i.test(
      text
    )
  ) {
    return 'trigger';
  }

  if (
    /declared an attack|attacking|blocked with|chose not to block|broke .*shield|shield.*broken|destroyed|discarded|returned .* to .* hand|put .* into the graveyard|\bbattle\b/i.test(
      text
    )
  ) {
    return 'combat';
  }

  if (/summoned|evolved|cast |casts |put .* into the battle zone/i.test(text)) {
    return 'summon';
  }

  if (/charged .* mana|mana zone|undid mana|added .* to mana/i.test(text)) {
    return 'mana';
  }

  return 'muted';
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

function getCachedRegexForMap(cardMap: Map<string, CardDefinition>): RegExp {
  let cached = regexCache.get(cardMap);
  if (!cached) {
    cached = buildCardRegex(Array.from(cardMap.keys()));
    regexCache.set(cardMap, cached);
  }
  return cached;
}

/**
 * Parses log message text and segments it into plain text tokens and interactive card tokens.
 * Uses the provided customMap or lazily resolves the registered runtime card catalog without
 * statically bundling card JSON into UI or engine chunks.
 */
export function parseLogTextWithCards(
  logText: string,
  customMap?: Map<string, CardDefinition>
): LogToken[] {
  if (!logText || logText.trim() === '') {
    return logText ? [{ text: logText }] : [];
  }

  const map = customMap ?? getRegisteredCardCatalog()?.cardByNameMap;
  if (!map || map.size === 0) {
    return [{ text: logText }];
  }

  const regex = getCachedRegexForMap(map);
  regex.lastIndex = 0;

  const tokens: LogToken[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(logText)) !== null) {
    const matchIndex = match.index;
    const matchedText = match[0];

    if (matchIndex > lastIndex) {
      tokens.push({ text: logText.substring(lastIndex, matchIndex) });
    }

    const card = map.get(matchedText);
    if (card) {
      tokens.push({ text: matchedText, card });
    } else {
      tokens.push({ text: matchedText });
    }

    lastIndex = matchIndex + matchedText.length;
  }

  if (lastIndex < logText.length) {
    tokens.push({ text: logText.substring(lastIndex) });
  }

  return tokens;
}
