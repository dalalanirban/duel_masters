#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const ALL_CARDS_PATH = path.join(ROOT_DIR, 'web', 'src', 'data', 'all_cards.json');
const ENGINE_DIR = path.join(ROOT_DIR, 'web', 'src', 'engine');
const ENGINE_TESTS_DIR = path.join(ENGINE_DIR, 'tests');

const GAMEPLAY_FIELDS = [
  'civilizations',
  'type',
  'manaCost',
  'power',
  'races',
  'rulesText',
  'isShieldTrigger',
  'isBlocker',
  'isSlayer',
  'isSpeedAttacker',
  'powerAttackerBonus',
  'breakerCount',
  'isEvolution',
  'isSurvivor',
  'isCharger',
  'isMultiCiv'
];

const FINGERPRINT_TAGS = [
  'VANILLA',
  'KEYWORD_ONLY',
  'SPELL',
  'CIP',
  'ON_ATTACK',
  'ON_BLOCKED',
  'ON_UNBLOCKED',
  'ON_DESTROY_OR_LEAVE',
  'END_OF_TURN',
  'TAP_ABILITY',
  'SILENT_SKILL',
  'WAVE_STRIKER',
  'SURVIVOR',
  'CHARGER',
  'VORTEX_EVO',
  'FORCED_BLOCK',
  'FORCED_ATTACK',
  'SHIELD_BURN',
  'REPLACEMENT',
  'STATIC_CONTINUOUS'
];

const CLASSIFICATIONS = [
  'EXPLICIT_AND_TESTED',
  'EXPLICIT_UNTESTED',
  'REGEX_OR_GENERIC_ONLY',
  'LIKELY_MISSING'
];

const COMMON_STOPWORDS = new Set([
  'creature', 'creatures', 'spell', 'spells', 'player', 'players', 'opponent', 'opponents',
  'shield', 'shields', 'hand', 'deck', 'mana', 'manazone', 'graveyard', 'battlezone', 'battle',
  'zone', 'blocker', 'slayer', 'speed', 'attacker', 'speed attacker', 'double breaker',
  'triple breaker', 'shield trigger', 'evolution', 'evolution creature', 'vortex', 'charger',
  'survivor', 'silent skill', 'wave striker', 'turbo rush', 'light', 'water', 'darkness',
  'fire', 'nature', 'dragon', 'human', 'guardian', 'angel', 'demon', 'angel command',
  'demon command', 'liquid people', 'beast folk', 'cyber virus', 'cyber lord', 'armorloid',
  'armored dragon', 'armored wyvern', 'fire bird', 'giant insect', 'horned beast', 'rock beast',
  'snow faerie', 'ghost', 'brain jacker', 'living dead', 'parasite worm', 'initiate',
  'starlight tree', 'berserker', 'light bringer', 'mecha del sol', 'mecha thunder', 'tree folk',
  'balloon mushroom', 'colony beetle', 'hedrian', 'gel fish', 'fish', 'giant', 'phoenix',
  'pegasus', 'spirit quartz', 'merfolk', 'leviathan', 'sea hacker', 'xenoparts', 'earth dragon',
  'volcano dragon', 'dune gecko', 'rainbow phantom', 'gladiator', 'earth eater', 'devil mask',
  'chimaera', 'chimera', 'death puppet', 'dark lord', 'pandoras box', "pandora's box",
  'mystery totem', 'rock', 'spirit', 'power', 'break', 'attack', 'block', 'tapped', 'untapped',
  'destroy', 'return', 'draw', 'discard', 'search', 'choose', 'card', 'cards', 'turn', 'start',
  'first', 'second', 'dragonoid', 'command', 'wild veggies', 'sol', 'thunder', 'crystal',
  'oracle', 'knight', 'shadow', 'flame', 'blade', 'storm', 'aura', 'ray', 'gate', 'bolt'
]);

function getCanonicalCardName(name) {
  return String(name || '').trim().toLowerCase();
}

function normalizeSetArg(raw) {
  if (!raw) return null;
  const upper = raw.trim().toUpperCase();
  const match = upper.match(/^DM-?(\d{1,2})$/);
  if (match) {
    return `DM-${match[1].padStart(2, '0')}`;
  }
  return upper;
}

/**
 * Strips // and /* * / comments from TS/JS code while preserving string literals,
 * template literals, and regex literals so comments never cause false positives.
 */
function stripComments(source) {
  let out = '';
  let i = 0;
  const len = source.length;
  let state = 'NORMAL';
  let regexCharClass = false;
  let prevSig = '';

  const isRegexAllowedAfter = (ch) =>
    !ch || '=(,[!&|?:;{}\n'.includes(ch);

  while (i < len) {
    const ch = source[i];
    const next = i + 1 < len ? source[i + 1] : '';

    if (state === 'NORMAL') {
      if (ch === '/' && next === '/') {
        state = 'LINE_COMMENT';
        i += 2;
        continue;
      }
      if (ch === '/' && next === '*') {
        state = 'BLOCK_COMMENT';
        i += 2;
        continue;
      }
      if (ch === "'") {
        state = 'SINGLE_QUOTE';
        out += ch;
        i += 1;
        continue;
      }
      if (ch === '"') {
        state = 'DOUBLE_QUOTE';
        out += ch;
        i += 1;
        continue;
      }
      if (ch === '`') {
        state = 'TEMPLATE';
        out += ch;
        i += 1;
        continue;
      }
      if (ch === '/') {
        // Distinguish regex literal from division operator
        let lookBack = out.length - 1;
        while (lookBack >= 0 && (out[lookBack] === ' ' || out[lookBack] === '\t')) {
          lookBack -= 1;
        }
        const tailWordMatch = out.slice(Math.max(0, lookBack - 12), lookBack + 1).match(/([a-zA-Z0-9_$]+)$/);
        const tailWord = tailWordMatch ? tailWordMatch[1] : '';
        if (
          isRegexAllowedAfter(prevSig) ||
          tailWord === 'return' ||
          tailWord === 'case' ||
          tailWord === 'else' ||
          tailWord === 'throw' ||
          tailWord === 'typeof'
        ) {
          state = 'REGEX';
          regexCharClass = false;
          out += ch;
          i += 1;
          continue;
        }
      }

      out += ch;
      if (ch !== ' ' && ch !== '\t' && ch !== '\r') {
        prevSig = ch;
      }
      i += 1;
      continue;
    }

    if (state === 'LINE_COMMENT') {
      if (ch === '\n') {
        out += '\n';
        prevSig = '\n';
        state = 'NORMAL';
      }
      i += 1;
      continue;
    }

    if (state === 'BLOCK_COMMENT') {
      if (ch === '*' && next === '/') {
        out += ' ';
        state = 'NORMAL';
        i += 2;
      } else {
        if (ch === '\n') out += '\n';
        i += 1;
      }
      continue;
    }

    if (state === 'SINGLE_QUOTE' || state === 'DOUBLE_QUOTE' || state === 'TEMPLATE') {
      out += ch;
      if (ch === '\\' && i + 1 < len) {
        out += source[i + 1];
        i += 2;
        continue;
      }
      if (
        (state === 'SINGLE_QUOTE' && ch === "'") ||
        (state === 'DOUBLE_QUOTE' && ch === '"') ||
        (state === 'TEMPLATE' && ch === '`')
      ) {
        prevSig = ch;
        state = 'NORMAL';
      }
      i += 1;
      continue;
    }

    if (state === 'REGEX') {
      out += ch;
      if (ch === '\\' && i + 1 < len) {
        out += source[i + 1];
        i += 2;
        continue;
      }
      if (ch === '[') regexCharClass = true;
      else if (ch === ']') regexCharClass = false;
      else if (ch === '/' && !regexCharClass) {
        prevSig = '/';
        state = 'NORMAL';
      }
      i += 1;
    }
  }

  return out;
}

/**
 * Strips parenthetical reminder text while keeping bracketed/line structure clean.
 */
function stripReminderParens(rulesText) {
  return String(rulesText || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Splits cleaned rules into standalone clauses/sentences, handling leading keywords
 * that lack parentheses (e.g. "Blocker Whenever this creature blocks...").
 */
function splitEffectClauses(rulesText) {
  const clean = stripReminderParens(rulesText);
  if (!clean) return [];
  const raw = clean
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replace(/^\.+|\.+$/g, '').trim())
    .filter(Boolean);

  const clauses = [];
  for (const s of raw) {
    const stripped = s.replace(
      /^(?:blocker|double breaker|triple breaker|crew breaker|shield trigger|slayer|speed attacker)\s+(?=[a-zA-Z"'])/i,
      (kw) => {
        clauses.push(kw.trim());
        return '';
      }
    );
    if (stripped.trim()) {
      clauses.push(stripped.trim());
    }
  }
  return clauses;
}

const KEYWORD_ONLY_SENTENCES = [
  /^blocker$/i,
  /^slayer$/i,
  /^speed attacker$/i,
  /^shield trigger$/i,
  /^double breaker$/i,
  /^triple breaker$/i,
  /^power attacker\s*\+\d+$/i,
  /^this creature can't attack players$/i,
  /^this creature can't attack$/i,
  /^evolution(?:\s*-\s*.*)?$/i,
  /^put on one of your [^.]+\.?$/i
];

function extractClauseFingerprints(card) {
  const tags = new Set();
  const rulesText = String(card.rulesText || '');
  const cleanRules = stripReminderParens(rulesText);
  const nameLower = getCanonicalCardName(card.name);

  if (card.type === 'Spell') {
    tags.add('SPELL');
  }

  const hasKeywordFlags = Boolean(
    card.isShieldTrigger ||
    card.isBlocker ||
    card.isSlayer ||
    card.isSpeedAttacker ||
    (card.powerAttackerBonus || 0) > 0 ||
    (card.breakerCount || 1) > 1 ||
    card.isEvolution ||
    card.isSurvivor ||
    card.isCharger
  );

  if (!rulesText.trim() && !hasKeywordFlags) {
    tags.add('VANILLA');
    return tags;
  }

  // Mechanic / timing tags (including DM-12 printed wording typos)
  if (
    /when you put this (?:creature|card)(?:\s+is put)? into (?:the )?battle zone|whenever you put (?:another|a|any) .* into (?:the )?battle zone|when this creature is put into (?:the )?battle zone/i.test(cleanRules)
  ) {
    tags.add('CIP');
  }

  if (
    /whenever this creature attacks|when this creature attacks|whenever (?:one|any) of your .* attacks|whenever another .* attacks|whenever a creature attacks|whenever any creature attacks/i.test(cleanRules)
  ) {
    tags.add('ON_ATTACK');
  }

  if (
    /whenever this creature becomes blocked|when this creature becomes blocked|when this creature is blocked|whenever one of your .* becomes blocked|whenever another .* becomes blocked|whenever this creature blocks/i.test(cleanRules)
  ) {
    tags.add('ON_BLOCKED');
  }

  if (
    /isn't blocked|not blocked/i.test(cleanRules) &&
    /attack/i.test(cleanRules)
  ) {
    tags.add('ON_UNBLOCKED');
  }

  if (
    /when(?:ever)? this creature (?:is|would be) destroyed|when(?:ever)? (?:another|a|any) creature is destroyed|when(?:ever)? this creature leaves the battle zone|leaves your battle zone|is put into (?:your|its owner's) graveyard from the battle zone|is put into your graveyard from anywhere|when this creature wins a battle/i.test(cleanRules)
  ) {
    tags.add('ON_DESTROY_OR_LEAVE');
  }

  if (/at the end of (?:each of )?(?:your|the|this|that|opponent's) turns?/i.test(cleanRules)) {
    tags.add('END_OF_TURN');
  }

  if (/\$tap\b|tap ability|\btap:\s|instead of having it attack, you may tap/i.test(rulesText)) {
    tags.add('TAP_ABILITY');
  }

  if (/silent skill/i.test(rulesText)) {
    tags.add('SILENT_SKILL');
  }

  if (/wave striker/i.test(rulesText)) {
    tags.add('WAVE_STRIKER');
  }

  if (card.isSurvivor || /\bsurvivor\b/i.test(rulesText)) {
    tags.add('SURVIVOR');
  }

  if (card.isCharger || /\bcharger\b/i.test(rulesText) || /\bcharger\b/i.test(nameLower)) {
    tags.add('CHARGER');
  }

  if (/vortex evolution/i.test(rulesText)) {
    tags.add('VORTEX_EVO');
  }

  if (
    /\bblocks? (?:this creature )?if able\b|\bmust block\b|if able,.*block|all creatures block|blocks each turn if able|if (?:it|that creature) can,? (?:it|that creature) blocks/i.test(cleanRules)
  ) {
    tags.add('FORCED_BLOCK');
  }

  if (
    /\battacks? (?:each turn )?if able\b|\bmust attack\b|creatures attack this turn if able|your opponent chooses .* attacks? this turn/i.test(cleanRules)
  ) {
    tags.add('FORCED_ATTACK');
  }

  if (
    /would break a shield[^.]*graveyard instead|(?:opponent's shields?|of (?:his|their|your) shields?|a shield|that shield|your shields)[^.!?\n]*?(?:and\s+)?puts?\s+(?:it|them|that shield|those shields|all of (?:his|their|your) shields)\s+into\s+(?:his|their|your|its owner's)\s+graveyard/i.test(
      cleanRules
    )
  ) {
    tags.add('SHIELD_BURN');
  }

  if (/\binstead\b/i.test(cleanRules)) {
    tags.add('REPLACEMENT');
  }

  // Static / continuous abilities (beyond simple Blocker/Can't attack players)
  if (
    card.type !== 'Spell' &&
    (/costs? \d+ (?:less|more)|gets? [+-]\d+ power|gains? ["']|has ["'](?:blocker|slayer|double breaker|speed attacker|power attacker)|can't be blocked|can't be attacked|can attack untapped|can't cast|can't summon|stealth\b|while you have|during your opponent's turn|each of your|all your creatures|your opponent's creatures|can't attack creatures|attack only creatures|mana zone.*tapped/i.test(cleanRules))
  ) {
    tags.add('STATIC_CONTINUOUS');
  }

  // Check if Creature has ONLY standard keywords + optional standard Evolution
  if (card.type !== 'Spell' && tags.size === 0) {
    const clauses = splitEffectClauses(rulesText);
    const nonKeywordClauses = clauses.filter(
      (clause) => !KEYWORD_ONLY_SENTENCES.some((re) => re.test(clause))
    );
    if (nonKeywordClauses.length === 0) {
      tags.add('KEYWORD_ONLY');
    } else {
      // Fallback: non-keyword static or custom sentence
      tags.add('STATIC_CONTINUOUS');
    }
  } else if (
    card.type !== 'Spell' &&
    tags.size === 1 &&
    tags.has('STATIC_CONTINUOUS')
  ) {
    // Do not downgrade "can't attack players" alone when paired purely with Blocker
    const clauses = splitEffectClauses(rulesText);
    const nonKeywordClauses = clauses.filter(
      (clause) => !KEYWORD_ONLY_SENTENCES.some((re) => re.test(clause))
    );
    if (nonKeywordClauses.length === 0) {
      tags.clear();
      tags.add('KEYWORD_ONLY');
    }
  }

  return tags;
}

/**
 * Inspects stripped engine TS files and returns:
 * - explicitNameChecks: tokens matched against card name variables or card-name lookup lists
 * - allEngineLiterals: all lowercase string literals >= 4 chars in engine files
 * - effectRegexesByFile: compiled regexes extracted from engine files that match rules text
 * - normalizedEngineCorpus: concatenated stripped TS source for regex/test verification
 */
function scanEngineFiles() {
  const tsFiles = fs
    .readdirSync(ENGINE_DIR)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'))
    .sort();

  const explicitNameTokens = new Set();
  const explicitMethodTokens = new Set();
  const tokenFiles = new Map();
  const effectRegexes = [];
  const fileSources = new Map();

  const addToken = (tok, file, isMethodCheck = false) => {
    const norm = tok.trim().toLowerCase();
    if (norm.length < 3 || COMMON_STOPWORDS.has(norm)) return;
    explicitNameTokens.add(norm);
    if (isMethodCheck) explicitMethodTokens.add(norm);
    if (!tokenFiles.has(norm)) tokenFiles.set(norm, new Set());
    tokenFiles.get(norm).add(file);
  };

  for (const file of tsFiles) {
    const fullPath = path.join(ENGINE_DIR, file);
    const raw = fs.readFileSync(fullPath, 'utf8');
    const stripped = stripComments(raw);
    fileSources.set(file, stripped);

    // 1. Direct name comparisons and .includes / .startsWith on name vars
    const nameMethodRe =
      /(?:cardName|nameLower|attName|blkName|spellName|lowerName|cname|sourceName|cName|card\.name|name)\s*(?:\.\s*(?:includes|startsWith|endsWith)\s*\(\s*(?:'((?:[^'\n\\]|\\.)+)'|"((?:[^"\n\\]|\\.)+)")|===\s*(?:'((?:[^'\n\\]|\\.)+)'|"((?:[^"\n\\]|\\.)+)"))/gi;
    let m;
    while ((m = nameMethodRe.exec(stripped)) !== null) {
      addToken(m[1] || m[2] || m[3] || m[4], file, true);
    }

    // 1b. Hybrid cardEffectRegistry registrations (registerCard / register*('name', ...))
    if (file === 'cardEffectRegistry.ts') {
      const regRe = /\bregister[A-Za-z0-9_]*\s*\(\s*(?:'((?:[^'\n\\]|\\.)+)'|"((?:[^"\n\\]|\\.)+)")/g;
      while ((m = regRe.exec(stripped)) !== null) {
        addToken((m[1] || m[2]).replace(/\\(['"])/g, '$1'), file, true);
      }
    }

    // 2. Switch cases or array tokens checked via .includes(token)
    const switchCaseRe = /case\s+(['"])([^'"]{3,})\1\s*:/g;
    while ((m = switchCaseRe.exec(stripped)) !== null) {
      const lit = m[2].trim().toLowerCase();
      // Ignore action constants / uppercase enums / phase names
      if (m[2] === m[2].toUpperCase() && /[A-Z_]/.test(m[2])) continue;
      addToken(lit, file);
    }

    // 3. Array/object name lists passed to .some((...) => ...includes(...)) or .has(nameLower)
    const arrayListRe = /\[\s*((?:['"][^'"]{3,}['"]\s*,\s*)*['"][^'"]{3,}['"])\s*\]/g;
    while ((m = arrayListRe.exec(stripped)) !== null) {
      const snippetAfter = stripped.slice(m.index, m.index + m[0].length + 140);
      if (/includes|name|card/i.test(snippetAfter)) {
        const innerRe = /'((?:[^'\n\\]|\\.)+)'|"((?:[^"\n\\]|\\.)+)"/g;
        let im;
        while ((im = innerRe.exec(m[1])) !== null) {
          addToken(im[1] || im[2], file);
        }
      }
    }

    // 4. Lowercase string literals inside engine modules (supporting apostrophes inside double-quoted strings)
    const strRe = /'((?:[^'\n\\]|\\.){4,})'|"((?:[^"\n\\]|\\.){4,})"/g;
    while ((m = strRe.exec(stripped)) !== null) {
      const rawLit = (m[1] || m[2]).replace(/\\(['"])/g, '$1');
      if (rawLit.includes('${') || rawLit.startsWith('./') || rawLit.startsWith('../')) continue;
      if (/^[A-Z0-9_]+$/.test(rawLit)) continue; // Action enums / type constants
      // Skip obvious log / prompt sentences unless it's a clean card title / prefix
      if (/:\s|[!?]|\byour\b|\bopponent\b|\bchose\b|\bbattle zone\b|\bmana zone\b/i.test(rawLit)) continue;
      addToken(rawLit, file);
    }

    // 5. Extract regex literals tested against card rules
    const lines = stripped.split('\n');
    for (const line of lines) {
      const reLit = /\/((?:\\.|[^\\/\n])+)\/([gimsuy]*)/g;
      let rm;
      while ((rm = reLit.exec(line)) !== null) {
        const pattern = rm[1];
        const flags = rm[2].replace(/[gy]/g, '');
        if (pattern.length < 10) continue;
        // Skip log/prompt/race/UI regexes
        if (/dragon|dragonoid|blocker|shield trigger|double breaker|triple breaker|speed attacker|charger|survivor|wave striker|turbo rush|silent skill|\$tap/i.test(pattern) && pattern.length < 22) {
          continue;
        }
        try {
          effectRegexes.push({ file, source: pattern, regex: new RegExp(pattern, flags || 'i') });
        } catch {
          // Ignore invalid or dynamic patterns
        }
      }
    }
  }

  return { tsFiles, explicitNameTokens, explicitMethodTokens, tokenFiles, effectRegexes, fileSources };
}

function scanEngineTests() {
  const testFiles = fs
    .readdirSync(ENGINE_TESTS_DIR)
    .filter((f) => f.endsWith('.test.mjs') || f.endsWith('.mjs'))
    .sort();

  const strippedByFile = new Map();
  let combinedLower = '';
  for (const f of testFiles) {
    const raw = fs.readFileSync(path.join(ENGINE_TESTS_DIR, f), 'utf8');
    const stripped = stripComments(raw).toLowerCase();
    strippedByFile.set(f, stripped);
    combinedLower += '\n' + stripped;
  }

  return { testFiles, strippedByFile, combinedLower };
}

/**
 * Resolves candidate canonical matching tokens for a card (full name + comma prefix).
 */
function findExplicitEngineMatches(card, engineInfo) {
  const canonical = getCanonicalCardName(card.name);
  const commaPrefix = canonical.split(',')[0].trim();
  const matchedTokens = new Set();
  const matchedFiles = new Set();

  for (const token of engineInfo.explicitNameTokens) {
    const isMethodToken = engineInfo.explicitMethodTokens.has(token);
    if (token === canonical) {
      matchedTokens.add(token);
    } else if (
      (commaPrefix.length >= 4 || (isMethodToken && commaPrefix.length >= 3)) &&
      token === commaPrefix &&
      !COMMON_STOPWORDS.has(token)
    ) {
      matchedTokens.add(token);
    } else if (
      isMethodToken &&
      token.length >= 3 &&
      !COMMON_STOPWORDS.has(token) &&
      new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(commaPrefix)
    ) {
      matchedTokens.add(token);
    } else if (
      token.length >= 5 &&
      !COMMON_STOPWORDS.has(token) &&
      (canonical.startsWith(`${token},`) || canonical.startsWith(`${token} `))
    ) {
      matchedTokens.add(token);
    } else if (token.length >= 6 && !COMMON_STOPWORDS.has(token)) {
      const wordRe = new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
      if (wordRe.test(commaPrefix)) {
        matchedTokens.add(token);
      }
    }

    if (matchedTokens.has(token)) {
      const files = engineInfo.tokenFiles.get(token);
      if (files) {
        for (const f of files) matchedFiles.add(f);
      }
    }
  }

  return {
    isExplicit: matchedTokens.size > 0,
    matchedTokens: [...matchedTokens],
    matchedFiles: [...matchedFiles]
  };
}

function findTestMatches(card, matchedEngineTokens, testInfo) {
  const canonical = getCanonicalCardName(card.name);
  const commaPrefix = canonical.split(',')[0].trim();
  const candidates = new Set([canonical]);
  if (commaPrefix.length >= 5 && !COMMON_STOPWORDS.has(commaPrefix)) {
    candidates.add(commaPrefix);
  }
  for (const t of matchedEngineTokens) {
    if (t.length >= 5 && !COMMON_STOPWORDS.has(t)) {
      candidates.add(t);
    }
  }

  const hitFiles = [];
  for (const [file, body] of testInfo.strippedByFile.entries()) {
    let hit = false;
    for (const c of candidates) {
      if (body.includes(c)) {
        hit = true;
        break;
      }
    }
    if (hit) hitFiles.push(file);
  }

  return hitFiles;
}

/**
 * Evaluates whether an un-named custom card is plausibly covered by the engine's
 * generic/regex rules vs. likely missing custom logic.
 */
function isCoveredByGenericEngine(card, tags, engineInfo) {
  const rulesText = String(card.rulesText || '');
  const cleanRules = stripReminderParens(rulesText);
  const rulesAndName = `${cleanRules}`;

  // Collect matching non-keyword regexes from engine files
  const matchingRegexFiles = new Set();
  const matchingRegexSources = [];
  for (const entry of engineInfo.effectRegexes) {
    if (entry.regex.test(rulesText) || entry.regex.test(cleanRules)) {
      matchingRegexFiles.add(entry.file);
      matchingRegexSources.push({ file: entry.file, source: entry.source });
    }
  }

  // High-risk mechanics require generic support specifically for that mechanic tag:
  if (tags.has('FORCED_BLOCK')) {
    const hasGenericForcedBlock = matchingRegexSources.some(
      (r) => /block/i.test(r.source) && /(if able|must)/i.test(r.source)
    );
    if (!hasGenericForcedBlock) return false;
  }

  if (tags.has('FORCED_ATTACK')) {
    // Engine cardUtils handles self "this creature attacks each turn if able";
    // opponent/other-creature forced attack is NOT handled generically.
    const isSelfOnly = /this creature attacks each turn if able/i.test(cleanRules) &&
      !/opponent|choose|other|all creatures|your creatures/i.test(cleanRules.replace(/this creature attacks each turn if able\.?/i, ''));
    const hasNonSelfAttackRegex = matchingRegexSources.some(
      (r) => /attacks.*if able/i.test(r.source) && !/this creature/i.test(r.source)
    );
    if (!isSelfOnly && !hasNonSelfAttackRegex) return false;
  }

  if (tags.has('SHIELD_BURN')) {
    const isReplacementBurn = /would break a shield.*puts? (?:that|it) shield into (?:his|its owner's) graveyard instead/i.test(cleanRules);
    const hasGenericShieldBurnRegex = matchingRegexSources.some(
      (r) => /shield/i.test(r.source) && /graveyard/i.test(r.source)
    );
    if (!isReplacementBurn && !hasGenericShieldBurnRegex) return false;
  }

  if (tags.has('ON_ATTACK')) {
    const hasAttackTriggerRegex = matchingRegexSources.some(
      (r) => r.file === 'triggers.ts' && /whenever this creature attacks/i.test(r.source)
    );
    if (!hasAttackTriggerRegex) return false;
  }

  if (tags.has('ON_BLOCKED')) {
    const hasBlockedRegex = matchingRegexSources.some(
      (r) => (r.file === 'triggers.ts' || r.file === 'cardUtils.ts') && /blocks|becomes blocked/i.test(r.source)
    );
    if (!hasBlockedRegex) return false;
  }

  if (tags.has('ON_UNBLOCKED')) {
    const hasUnblockedRegex = matchingRegexSources.some(
      (r) => r.file === 'triggers.ts' && /isn't blocked|not blocked/i.test(r.source)
    );
    if (!hasUnblockedRegex) return false;
  }

  if (tags.has('TAP_ABILITY')) {
    const hasTapRegex = matchingRegexSources.some((r) => r.file === 'tapAbilities.ts');
    if (!hasTapRegex) return false;
  }

  if (tags.has('SILENT_SKILL')) {
    const hasSilentRegex = matchingRegexSources.some((r) => r.file === 'advancedMechanics.ts');
    if (!hasSilentRegex) return false;
  }

  if (tags.has('SURVIVOR')) {
    // Blank-text Survivor creatures (e.g. Promephius Q) inherit granted Survivor skills cleanly via generic Survivor engine
    if (cleanRules === '') return true;
    // Pure keyword-sharing survivors without named handlers must match a generic survivor regex in continuous.ts/triggers.ts
    const hasGenericSurvivorEffect = matchingRegexSources.some(
      (r) => (r.file === 'continuous.ts' || r.file === 'triggers.ts') && /survivor/i.test(r.source)
    );
    if (!hasGenericSurvivorEffect) return false;
  }

  if (tags.has('WAVE_STRIKER')) {
    const hasGenericWaveEffect = matchingRegexSources.some(
      (r) => (r.file === 'continuous.ts' || r.file === 'advancedMechanics.ts') && /wave striker|gets \+\d+|power attacker|blocker|double breaker|can't be blocked/i.test(r.source)
    );
    if (!hasGenericWaveEffect) return false;
  }

  if (tags.has('ON_DESTROY_OR_LEAVE') || tags.has('REPLACEMENT')) {
    const hasDestroyOrLeaveRegex = matchingRegexSources.some(
      (r) =>
        r.file === 'replacements.ts' ||
        r.file === 'boardRemoval.ts' ||
        r.file === 'triggers.ts' ||
        r.file === 'cardUtils.ts'
    );
    if (!hasDestroyOrLeaveRegex) return false;
  }

  if (tags.has('END_OF_TURN')) {
    const hasEotRegex = matchingRegexSources.some(
      (r) => (r.file === 'cardUtils.ts' || r.file === 'turn.ts' || r.file === 'triggers.ts') && /end of/i.test(r.source)
    );
    if (!hasEotRegex) return false;
  }

  if (tags.has('CIP')) {
    const hasCipRegex = matchingRegexSources.some(
      (r) => r.file === 'triggers.ts' || r.file === 'spells.ts'
    );
    if (!hasCipRegex) return false;
  }

  if (tags.has('SPELL')) {
    // Pure Charger with no other spell text OR matched by spells.ts / boardRemoval.ts regex
    const clausesWithoutCharger = splitEffectClauses(rulesText).filter((c) => !/^charger$/i.test(c));
    if (clausesWithoutCharger.length === 0) return true;
    const hasSpellRegex = matchingRegexSources.some(
      (r) => r.file === 'spells.ts' || r.file === 'boardRemoval.ts' || r.file === 'targeting.ts'
    );
    return hasSpellRegex;
  }

  // Static continuous / misc non-keyword sentences
  if (tags.has('STATIC_CONTINUOUS')) {
    const hasGenericStatic = matchingRegexSources.some(
      (r) =>
        r.file === 'cardUtils.ts' ||
        r.file === 'continuous.ts' ||
        r.file === 'mana.ts' ||
        r.file === 'evolution.ts'
    );
    if (hasGenericStatic) return true;
    // Also recognize explicit cardUtils capability strings covered directly
    if (
      /^(?:blocker|slayer|speed attacker|double breaker|triple breaker|shield trigger|power attacker \+\d+|this creature can't attack players|this creature can't attack|this creature can't be blocked|this creature attacks each turn if able|vortex evolution)[\s.]*$/i.test(
        rulesAndName
      )
    ) {
      return true;
    }
    return false;
  }

  return matchingRegexSources.length > 0;
}

function buildReprintGroups(rawCards) {
  const byCanonical = new Map();
  for (const card of rawCards) {
    const key = getCanonicalCardName(card.name);
    if (!byCanonical.has(key)) byCanonical.set(key, []);
    byCanonical.get(key).push(card);
  }

  const parityMismatches = [];
  const multiSetReprints = [];
  const uniqueCards = [];

  for (const [canonicalName, printings] of byCanonical.entries()) {
    const sorted = [...printings].sort((a, b) => a.id.localeCompare(b.id));
    const primary = sorted[0];

    if (sorted.length > 1) {
      const sets = sorted.map((c) => c.set);
      multiSetReprints.push({ name: primary.name, canonicalName, sets, ids: sorted.map((c) => c.id) });

      for (let i = 1; i < sorted.length; i += 1) {
        const cmp = sorted[i];
        const diffs = [];
        for (const field of GAMEPLAY_FIELDS) {
          if (JSON.stringify(primary[field]) !== JSON.stringify(cmp[field])) {
            diffs.push(field);
          }
        }
        if (diffs.length > 0) {
          parityMismatches.push({
            canonicalName,
            a: primary.id,
            b: cmp.id,
            fields: diffs
          });
        }
      }
    }

    uniqueCards.push({
      canonicalName,
      primary,
      printings: sorted
    });
  }

  return { byCanonical, uniqueCards, multiSetReprints, parityMismatches };
}

function formatTable(headers, rows) {
  const headerLine = `| ${headers.join(' | ')} |`;
  const sepLine = `| ${headers.map((_, idx) => (idx === 0 ? ':---' : '---:')).join(' | ')} |`;
  const body = rows.map((r) => `| ${r.join(' | ')} |`).join('\n');
  return [headerLine, sepLine, body].filter(Boolean).join('\n');
}

function printUsage() {
  console.log('Usage: node scripts/audit_card_effects.mjs [--set=DM-XX] [--mechanic=TAG] [--strict]');
  console.log(`Available --mechanic tags: ${FINGERPRINT_TAGS.join(', ')}`);
}

function main() {
  const args = process.argv.slice(2);
  let setFilter = null;
  let mechanicFilter = null;
  let strictMode = false;

  for (const arg of args) {
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else if (arg === '--strict') {
      strictMode = true;
    } else if (arg.startsWith('--set=')) {
      setFilter = normalizeSetArg(arg.slice('--set='.length));
    } else if (arg.startsWith('--mechanic=')) {
      mechanicFilter = arg.slice('--mechanic='.length).trim().toUpperCase();
      if (!FINGERPRINT_TAGS.includes(mechanicFilter)) {
        console.error(`Unknown mechanic tag: ${mechanicFilter}`);
        console.error(`Valid tags: ${FINGERPRINT_TAGS.join(', ')}`);
        process.exit(1);
      }
    } else {
      console.error(`Unknown argument: ${arg}`);
      printUsage();
      process.exit(1);
    }
  }

  const rawCards = JSON.parse(fs.readFileSync(ALL_CARDS_PATH, 'utf8'));
  const { uniqueCards, multiSetReprints, parityMismatches } = buildReprintGroups(rawCards);
  const engineInfo = scanEngineFiles();
  const testInfo = scanEngineTests();

  const audited = uniqueCards.map(({ canonicalName, primary, printings }) => {
    const tags = extractClauseFingerprints(primary);
    const isVanillaOrKeyword = tags.has('VANILLA') || (tags.size === 1 && tags.has('KEYWORD_ONLY'));
    const explicit = findExplicitEngineMatches(primary, engineInfo);
    const testFiles = explicit.isExplicit
      ? findTestMatches(primary, explicit.matchedTokens, testInfo)
      : [];

    let classification;
    if (isVanillaOrKeyword) {
      classification = 'VANILLA_OR_KEYWORD';
    } else if (explicit.isExplicit) {
      classification = testFiles.length > 0 ? 'EXPLICIT_AND_TESTED' : 'EXPLICIT_UNTESTED';
    } else if (isCoveredByGenericEngine(primary, tags, engineInfo)) {
      classification = 'REGEX_OR_GENERIC_ONLY';
    } else {
      classification = 'LIKELY_MISSING';
    }

    return {
      canonicalName,
      card: primary,
      printings,
      sets: printings.map((p) => p.set),
      primarySet: primary.set,
      tags,
      isCustom: !isVanillaOrKeyword,
      classification,
      explicitFiles: explicit.matchedFiles,
      testFiles
    };
  });

  // Apply CLI filters
  let filtered = audited;
  if (setFilter) {
    filtered = filtered.filter((item) => item.sets.includes(setFilter));
  }
  if (mechanicFilter) {
    filtered = filtered.filter((item) => item.tags.has(mechanicFilter));
  }

  console.log('# Duel Masters Card Effect Audit Report');
  console.log(
    `- Total printings in \`all_cards.json\`: **${rawCards.length}** | Unique canonical cards: **${uniqueCards.length}** | Multi-set reprint groups: **${multiSetReprints.length}** | Gameplay parity mismatches: **${parityMismatches.length}**`
  );
  console.log(
    `- Scanned engine files: **${engineInfo.tsFiles.length}** | Scanned engine test files: **${testInfo.testFiles.length}**`
  );
  if (setFilter || mechanicFilter) {
    console.log(
      `- Active filters: set=\`${setFilter || 'ALL'}\`, mechanic=\`${mechanicFilter || 'ALL'}\` -> **${filtered.length}** matching unique cards`
    );
  }
  console.log('');

  // 1. Classification Summary Table
  const counts = {
    VANILLA_OR_KEYWORD: 0,
    EXPLICIT_AND_TESTED: 0,
    EXPLICIT_UNTESTED: 0,
    REGEX_OR_GENERIC_ONLY: 0,
    LIKELY_MISSING: 0
  };
  for (const item of filtered) {
    counts[item.classification] += 1;
  }
  const customTotal =
    counts.EXPLICIT_AND_TESTED +
    counts.EXPLICIT_UNTESTED +
    counts.REGEX_OR_GENERIC_ONLY +
    counts.LIKELY_MISSING;
  const pct = (n, d) => (d === 0 ? '0.0%' : `${((n / d) * 100).toFixed(1)}%`);

  console.log('## Classification Summary');
  console.log(
    formatTable(
      ['Classification', 'Count', '% of Scope', '% of Custom Cards'],
      [
        ['`VANILLA_OR_KEYWORD` (no custom logic needed)', String(counts.VANILLA_OR_KEYWORD), pct(counts.VANILLA_OR_KEYWORD, filtered.length), '—'],
        ['`EXPLICIT_AND_TESTED`', String(counts.EXPLICIT_AND_TESTED), pct(counts.EXPLICIT_AND_TESTED, filtered.length), pct(counts.EXPLICIT_AND_TESTED, customTotal)],
        ['`EXPLICIT_UNTESTED`', String(counts.EXPLICIT_UNTESTED), pct(counts.EXPLICIT_UNTESTED, filtered.length), pct(counts.EXPLICIT_UNTESTED, customTotal)],
        ['`REGEX_OR_GENERIC_ONLY`', String(counts.REGEX_OR_GENERIC_ONLY), pct(counts.REGEX_OR_GENERIC_ONLY, filtered.length), pct(counts.REGEX_OR_GENERIC_ONLY, customTotal)],
        ['`LIKELY_MISSING`', String(counts.LIKELY_MISSING), pct(counts.LIKELY_MISSING, filtered.length), pct(counts.LIKELY_MISSING, customTotal)],
        ['**Custom Effect Subtotal**', `**${customTotal}**`, `**${pct(customTotal, filtered.length)}**`, '**100.0%**'],
        ['**Total Unique Cards**', `**${filtered.length}**`, '**100.0%**', '—']
      ]
    )
  );
  console.log('');

  // 2. Per-Set Summary Table
  const allSets = [...new Set(rawCards.map((c) => c.set))].sort();
  const targetSets = setFilter ? allSets.filter((s) => s === setFilter) : allSets;
  const setRows = [];
  for (const s of targetSets) {
    // If filtered by --set, include all cards present in that set; otherwise attribute to first release set so rows sum cleanly to 890
    const subset = filtered.filter((item) => (setFilter ? item.sets.includes(s) : item.primarySet === s));
    const c = { v: 0, et: 0, eu: 0, rg: 0, lm: 0 };
    for (const item of subset) {
      if (item.classification === 'VANILLA_OR_KEYWORD') c.v += 1;
      else if (item.classification === 'EXPLICIT_AND_TESTED') c.et += 1;
      else if (item.classification === 'EXPLICIT_UNTESTED') c.eu += 1;
      else if (item.classification === 'REGEX_OR_GENERIC_ONLY') c.rg += 1;
      else c.lm += 1;
    }
    const cust = c.et + c.eu + c.rg + c.lm;
    setRows.push([s, String(subset.length), String(c.v), String(cust), String(c.et), String(c.eu), String(c.rg), String(c.lm)]);
  }

  console.log('## Per-Set Summary (Attributed to Primary Release Set When Unfiltered)');
  console.log(
    formatTable(
      ['Set', 'Unique', 'Vanilla/KW', 'Custom', 'Explicit+Test', 'Explicit Untest', 'Regex/Generic', 'Likely Missing'],
      setRows
    )
  );
  console.log('');

  // 3. Clause Fingerprint Breakdown
  if (!mechanicFilter) {
    const tagRows = [];
    for (const tag of FINGERPRINT_TAGS) {
      const matches = filtered.filter((item) => item.tags.has(tag));
      const c = { v: 0, et: 0, eu: 0, rg: 0, lm: 0 };
      for (const item of matches) {
        if (item.classification === 'VANILLA_OR_KEYWORD') c.v += 1;
        else if (item.classification === 'EXPLICIT_AND_TESTED') c.et += 1;
        else if (item.classification === 'EXPLICIT_UNTESTED') c.eu += 1;
        else if (item.classification === 'REGEX_OR_GENERIC_ONLY') c.rg += 1;
        else c.lm += 1;
      }
      tagRows.push([
        `\`${tag}\``,
        String(matches.length),
        String(c.et),
        String(c.eu),
        String(c.rg),
        String(c.lm)
      ]);
    }

    console.log('## Mechanic Fingerprint Breakdown (Cards May Carry Multiple Tags)');
    console.log(
      formatTable(
        ['Tag', 'Total Cards', 'Explicit+Test', 'Explicit Untest', 'Regex/Generic', 'Likely Missing'],
        tagRows
      )
    );
    console.log('');
  }

  // 4. Priority Gap Lists OR Filtered Mechanic Detail
  const gapTagsToShow = mechanicFilter
    ? [mechanicFilter]
    : ['FORCED_BLOCK', 'FORCED_ATTACK', 'SHIELD_BURN', 'ON_ATTACK'];

  for (const tag of gapTagsToShow) {
    const allTagCards = filtered.filter((item) => item.tags.has(tag));
    const missing = allTagCards.filter((item) => item.classification === 'LIKELY_MISSING');
    const regexOnly = allTagCards.filter((item) => item.classification === 'REGEX_OR_GENERIC_ONLY');
    const explicitUntested = allTagCards.filter((item) => item.classification === 'EXPLICIT_UNTESTED');
    const explicitTested = allTagCards.filter((item) => item.classification === 'EXPLICIT_AND_TESTED');

    console.log(
      `## Gap List: ${tag} (${missing.length} LIKELY_MISSING / ${regexOnly.length} REGEX_OR_GENERIC_ONLY / ${explicitUntested.length} EXPLICIT_UNTESTED / ${explicitTested.length} EXPLICIT_AND_TESTED; ${allTagCards.length} total)`
    );

    if (missing.length === 0) {
      console.log('_None (`0` `LIKELY_MISSING` cards for this tag in scope)._');
    } else {
      for (const item of missing) {
        const snippet = stripReminderParens(item.card.rulesText).slice(0, 150);
        console.log(
          `- \`${item.card.id}\` **${item.card.name}** (${item.card.set}, ${item.card.civilizations.join('/')}, Cost ${item.card.manaCost}): "${snippet}"`
        );
      }
    }

    if (mechanicFilter && allTagCards.length > missing.length) {
      console.log('');
      console.log(`### Non-Missing ${tag} Cards in Scope`);
      for (const item of allTagCards.filter((i) => i.classification !== 'LIKELY_MISSING')) {
        console.log(
          `- \`${item.card.id}\` **${item.card.name}** [${item.classification}]`
        );
      }
    }
    console.log('');
  }

  if (parityMismatches.length > 0) {
    console.error('ERROR: Reprint gameplay parity mismatch detected:');
    console.error(JSON.stringify(parityMismatches, null, 2));
    process.exit(1);
  }

  if (strictMode && counts.LIKELY_MISSING > 0) {
    console.error(
      `ERROR (--strict): ${counts.LIKELY_MISSING} LIKELY_MISSING card(s) remain in audited scope.`
    );
    process.exit(1);
  }
}

main();
