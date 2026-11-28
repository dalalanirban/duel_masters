import type { CardDefinition, Civilization } from '../types/card.ts';
import type { CreatureInstance, GameState, PlayerId } from './types.ts';

export interface CardCapabilities {
  nameLower: string;
  civilizations: Civilization[];
  isMultiCiv: boolean;
  races: string[];
  normalizedRaces: string[];
  hasDragonRace: boolean;
  isEvolution: boolean;
  isVortexEvolution: boolean;
  isSurvivor: boolean;
  isWaveStriker: boolean;
  isTurboRush: boolean;
  hasSilentSkill: boolean;
  hasTapAbility: boolean;
  isCharger: boolean;
  isShieldTrigger: boolean;
  isBlocker: boolean;
  blocksIfAble: boolean;
  isSlayer: boolean;
  isSpeedAttacker: boolean;
  hasLeaveSubstitution: boolean;
  hasShieldBurn: boolean;
  isMadness: boolean;
  // Attack constraints
  cantAttack: boolean;
  cantAttackPlayers: boolean;
  cantAttackCreatures: boolean;
  onlyAttackBlockers: boolean;
  attacksIfAble: boolean;
  cantAttackWhenNoOppShields: boolean;
  cantAttackWhenOppHasMoreCreatures: boolean;
  cantAttackWhenOtherUntapped: boolean;
  cantAttackWithEmptyHand: boolean;
  // Target-by-attack constraints
  cantBeAttacked: boolean;
  cantBeAttackedByCivs: Civilization[];
  cantBeAttackedByDragon: boolean;
  // Blocking constraints
  cantBeBlockedAlways: boolean;
  cantBeBlockedWhileAttackingCreature: boolean;
  cantBeBlockedByMaxPower: number | null;
  cantBeBlockedByMinPower: number | null;
  cantBeBlockedByCivs: Civilization[];
  cantBeBlockedMinOtherCreatures: number | null;
  stealthCivs: Civilization[];
  // Attack untapped
  canAttackAllUntapped: boolean;
  canAttackUntappedCivs: Civilization[];
  // Post-battle / combat rules
  destroyAfterBattle: boolean;
  destroyOnWinBattle: boolean;
  untapAfterBlock: boolean;
  noBattleOnBlock: boolean;
  noBattleWhenBlocked: boolean;
  // End-of-turn
  untapAtEndTurn: boolean;
  untapAllAtEndTurn: boolean;
  selfDestroyAtEndTurn: boolean;
  selfBounceAtEndTurn: boolean;
}

const CAPABILITIES_CACHE = new WeakMap<CardDefinition, CardCapabilities>();

const RACE_ALIAS_MAP: Record<string, string> = {
  xenopart: 'xenoparts',
  xenoparts: 'xenoparts',
  hornedbeast: 'hornbeast',
  hornedbeasts: 'hornbeast',
  hornbeast: 'hornbeast',
  hornbeasts: 'hornbeast',
  rainbowphantom: 'rainbowphantom',
  rainbowphantoms: 'rainbowphantom',
  wildveggie: 'wildveggie',
  wildveggies: 'wildveggie',
  eartheater: 'eartheater',
  eartheaters: 'eartheater',
  cyberlord: 'cyberlord',
  cyberlords: 'cyberlord',
  cybervirus: 'cybervirus',
  cyberviruses: 'cybervirus',
  cybercluster: 'cybercluster',
  cyberclusters: 'cybercluster',
  cybermoon: 'cybermoon',
  cybermoons: 'cybermoon',
  firebird: 'firebird',
  firebirds: 'firebird',
  earthdragon: 'earthdragon',
  earthdragons: 'earthdragon',
  armoreddragon: 'armoreddragon',
  armoreddragons: 'armoreddragon',
  armoredwyvern: 'armoredwyvern',
  armoredwyverns: 'armoredwyvern',
  volcanodragon: 'volcanodragon',
  volcanodragons: 'volcanodragon',
  zombiedragon: 'zombiedragon',
  zombiedragons: 'zombiedragon',
  lightbringer: 'lightbringer',
  lightbringers: 'lightbringer',
  angelcommand: 'angelcommand',
  angelcommands: 'angelcommand',
  demoncommand: 'demoncommand',
  demoncommands: 'demoncommand',
  parasiteworm: 'parasiteworm',
  parasiteworms: 'parasiteworm',
  rockbeast: 'rockbeast',
  rockbeasts: 'rockbeast',
  giantinsect: 'giantinsect',
  giantinsects: 'giantinsect',
  beastfolk: 'beastfolk',
  beastfolks: 'beastfolk',
  liquidpeople: 'liquidpeople',
  liquidpeoples: 'liquidpeople',
  snowfaerie: 'snowfaerie',
  snowfaeries: 'snowfaerie',
  gelfish: 'gelfish',
  gelfishes: 'gelfish',
  fish: 'fish',
  fishes: 'fish',
  giant: 'giant',
  giants: 'giant',
  phoenix: 'phoenix',
  phoenixes: 'phoenix',
  pegasus: 'pegasus',
  pegasuses: 'pegasus',
  pandorasbox: 'pandorasbox',
  pandorasboxes: 'pandorasbox',
  livingdead: 'livingdead',
  livingdeads: 'livingdead',
  spiritquartz: 'spiritquartz',
  spiritquartzes: 'spiritquartz',
  mechadelsol: 'mechadelsol',
  mechadelsols: 'mechadelsol',
  mechathunder: 'mechathunder',
  mechathunders: 'mechathunder',
};

/**
 * Normalizes a race name canonically so singular/plural/spacing aliases match cleanly
 * without substring false-positives (e.g. Giant vs Giant Insect, Fish vs Gel Fish).
 */
export function normalizeRace(race: string): string {
  const cleaned = race
    .toLowerCase()
    .trim()
    .replace(/^(?:a|an)\s+/i, '')
    .replace(/[^a-z0-9]/g, '');

  if (RACE_ALIAS_MAP[cleaned]) {
    return RACE_ALIAS_MAP[cleaned];
  }
  if (cleaned.endsWith('ies') && cleaned.length > 3) {
    const singular = cleaned.slice(0, -3) + 'ie';
    if (RACE_ALIAS_MAP[singular]) return RACE_ALIAS_MAP[singular];
    return singular;
  }
  if (cleaned.endsWith('es') && !cleaned.endsWith('ss') && cleaned.length > 3) {
    const withoutEs = cleaned.slice(0, -2);
    if (RACE_ALIAS_MAP[withoutEs]) return RACE_ALIAS_MAP[withoutEs];
  }
  if (cleaned.endsWith('s') && cleaned.length > 2) {
    const withoutS = cleaned.slice(0, -1);
    if (RACE_ALIAS_MAP[withoutS]) return RACE_ALIAS_MAP[withoutS];
    return withoutS;
  }
  return cleaned;
}

/**
 * Returns the civilization list for a CardDefinition (supporting legacy single `civilization` field).
 */
export function getCardCivilizations(card?: CardDefinition | null): Civilization[] {
  if (!card) return [];
  if (Array.isArray(card.civilizations) && card.civilizations.length > 0) {
    return card.civilizations;
  }
  const legacyCiv = (card as unknown as { civilization?: Civilization }).civilization;
  return legacyCiv ? [legacyCiv] : [];
}

/**
 * Returns the race list for a card definition (supporting legacy `race` field).
 */
export function getCardRaces(
  card?: CardDefinition | { race?: string; races?: string[] } | null
): string[] {
  if (!card) return [];
  const races: string[] = [];
  if (Array.isArray(card.races)) {
    for (const r of card.races) {
      if (r) races.push(r);
    }
  }
  const legacyRace = (card as unknown as { race?: string }).race;
  if (typeof legacyRace === 'string' && legacyRace.trim() && !races.includes(legacyRace)) {
    races.push(legacyRace);
  }
  return races;
}

/**
 * Returns effective races of a CreatureInstance (base races + any temporary races like Furious Onslaught).
 */
export function getCreatureRaces(creature: CreatureInstance): string[] {
  const base = getCardRaces(creature.card);
  if (creature.tempExtraRaces && creature.tempExtraRaces.length > 0) {
    return [...base, ...creature.tempExtraRaces];
  }
  return base;
}

/**
 * Official Duel Masters check: whether a card is multicolored (2+ civilizations).
 * Always checks both `isMultiCiv` flag and `civilizations.length > 1`.
 */
export function isMultiCivilization(card?: CardDefinition | null): boolean {
  if (!card) return false;
  return Boolean(card.isMultiCiv || getCardCivilizations(card).length > 1);
}

/**
 * Checks whether a race list includes a Dragon race.
 * Per official Duel Masters rules, "Dragonoid" does NOT count as having Dragon in its race!
 */
export function hasDragonRace(races: string[]): boolean {
  return races.some((r) => {
    const low = r.toLowerCase();
    return low.includes('dragon') && !low.includes('dragonoid');
  });
}

/**
 * Checks if a card is a Survivor.
 */
export function isSurvivorCard(
  card?: CardDefinition | { race?: string; races?: string[]; isSurvivor?: boolean } | null
): boolean {
  if (!card) return false;
  if (card.isSurvivor) return true;
  return getCardRaces(card).some((r) => /survivor/i.test(r));
}

function parseCivList(text: string): Civilization[] {
  const civs: Civilization[] = [];
  const all: Civilization[] = ['Light', 'Water', 'Darkness', 'Fire', 'Nature'];
  const lower = text.toLowerCase();
  for (const c of all) {
    if (lower.includes(c.toLowerCase())) {
      civs.push(c);
    }
  }
  return civs;
}

/**
 * Computes and caches structural/rule capabilities for a CardDefinition.
 * Uses sentence-level parsing so conditional/gated/spell sentences never leak into permanent self traits.
 */
export function getCardCapabilities(card: CardDefinition): CardCapabilities {
  const cached = CAPABILITIES_CACHE.get(card);
  if (cached) {
    return cached;
  }

  const nameLower = (card.name || '').trim().toLowerCase();
  const rules = card.rulesText || '';
  const cleanRules = rules.replace(/\([^)]*\)/g, '. ').replace(/\s+/g, ' ').trim();
  const civilizations = getCardCivilizations(card);
  const races = getCardRaces(card);
  const normalizedRaces = races.map(normalizeRace);
  const isSpell = card.type === 'Spell';
  const isEvo = card.type === 'Evolution Creature' || Boolean(card.isEvolution);
  const isWaveStriker = Boolean(
    (card as unknown as { isWaveStriker?: boolean }).isWaveStriker || /wave striker/i.test(rules)
  );
  const isTurboRush = /turbo rush/i.test(rules);
  const hasSilentSkill = /silent skill/i.test(rules);

  // Split into sentences, ignoring gated keyword blocks ($tap abilities, Turbo Rush/Wave Striker conditional clauses)
  const rawSentences = cleanRules
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replace(/^\.+|\.+$/g, '').trim())
    .filter(Boolean);

  // Also strip standalone leading keywords lacking reminder parentheses (e.g. Chekicul: "Blocker Whenever this creature blocks...")
  const sentences: string[] = [];
  for (const s of rawSentences) {
    const stripped = s.replace(/^(?:blocker|double breaker|triple breaker|shield trigger|slayer|speed attacker)\s+(?=[a-z])/i, (kw) => {
      sentences.push(kw.trim());
      return '';
    });
    if (stripped.trim()) sentences.push(stripped.trim());
  }

  // Extract stealth civs anywhere in rules
  const stealthCivs: Civilization[] = [];
  const stealthRegex = /(light|water|darkness|fire|nature)\s+stealth/gi;
  let sMatch: RegExpExecArray | null;
  while ((sMatch = stealthRegex.exec(rules)) !== null) {
    const c = parseCivList(sMatch[1])[0];
    if (c && !stealthCivs.includes(c)) stealthCivs.push(c);
  }

  // Self static trait sentences exclude Spells, $tap grants, Turbo Rush / Wave Striker gated clauses, and team/race/turn grants
  let afterTapAbility = false;
  let cantAttack = false;
  let cantAttackPlayers = false;
  let cantAttackCreatures = false;
  let onlyAttackBlockers = false;
  let attacksIfAble = nameLower === 'deadly fighter braid claw';
  let blocksIfAble =
    nameLower === 'pierr, psycho doll' ||
    nameLower === 'ardent lunatron' ||
    nameLower === 'messa bahna, expanse guardian' ||
    nameLower === 'belmol, the explorer';
  let cantAttackWhenNoOppShields = false;
  let cantAttackWhenOppHasMoreCreatures = false;
  let cantAttackWhenOtherUntapped = false;
  let cantAttackWithEmptyHand = false;

  let cantBeAttacked = false;
  let cantBeAttackedByCivs: Civilization[] = [];
  let cantBeAttackedByDragon = false;

  let cantBeBlockedAlways = false;
  let cantBeBlockedWhileAttackingCreature = false;
  let cantBeBlockedByMaxPower: number | null = null;
  let cantBeBlockedByMinPower: number | null = null;
  let cantBeBlockedByCivs: Civilization[] = [];
  let cantBeBlockedMinOtherCreatures: number | null = null;

  let canAttackAllUntapped = false;
  const canAttackUntappedCivs: Civilization[] = [];
  let blockerFromSentence = false;
  let slayerFromSentence = false;
  let speedAttackerFromSentence = false;

  for (const rawSent of sentences) {
    if (isSpell) continue;
    if (/\$tap\b|tap ability/i.test(rawSent)) {
      afterTapAbility = true;
      continue;
    }
    if (afterTapAbility) continue;
    if (/^(?:turbo rush|wave striker|silent skill)\b/i.test(rawSent)) continue;
    if (/while you have no shields|choose a race|each of your|your creatures|your dragons|that creature|until the end of|until the start of/i.test(rawSent)) continue;

    // Strip Survivor/Evo prefix if sentence starts with "Survivor :"
    const sent = rawSent.replace(/^survivor\s*:\s*/i, '').trim();

    if (/^blocker\b/i.test(sent)) blockerFromSentence = true;
    if (/^slayer\b/i.test(sent)) slayerFromSentence = true;
    if (/^speed attacker\b/i.test(sent)) speedAttackerFromSentence = true;
    if (/^this creature can't attack$/i.test(sent)) cantAttack = true;
    if (/^this creature can't attack players$/i.test(sent)) cantAttackPlayers = true;
    if (/^this creature can't attack creatures$/i.test(sent)) cantAttackCreatures = true;
    if (/this creature can attack only creatures that have "?blocker"?/i.test(sent)) onlyAttackBlockers = true;
    if (/this creature attacks each turn if able/i.test(sent)) attacksIfAble = true;
    if (/whenever an opponent's creature attacks,\s*this creature blocks if able/i.test(sent)) {
      blocksIfAble = true;
    }
    if (/while your opponent has no shields,\s*this creature can't attack/i.test(sent)) cantAttackWhenNoOppShields = true;
    if (/this creature can't attack while your opponent has more creatures/i.test(sent)) cantAttackWhenOppHasMoreCreatures = true;
    if (/while you have any other untapped creatures.*this creature can't attack/i.test(sent)) cantAttackWhenOtherUntapped = true;
    if (/this creature can't attack if you have no cards in your hand/i.test(sent)) cantAttackWithEmptyHand = true;

    if (/^this creature can't be attacked$/i.test(sent)) cantBeAttacked = true;
    const attackedByM = sent.match(/^this creature can't be attacked by ([^.]+)$/i);
    if (attackedByM) {
      for (const civ of parseCivList(attackedByM[1])) {
        if (!cantBeAttackedByCivs.includes(civ)) cantBeAttackedByCivs.push(civ);
      }
      if (/dragon/i.test(attackedByM[1])) cantBeAttackedByDragon = true;
    }

    if (/^(?:this creature|it) can't be blocked$/i.test(sent)) {
      cantBeBlockedAlways = true;
    }
    if (/^while attacking a creature,\s*(?:this creature|it) can't be blocked$/i.test(sent)) {
      cantBeBlockedWhileAttackingCreature = true;
    }
    const maxBM =
      sent.match(/this creature can't be blocked by (?:any )?creatures? that (?:has|have) power (\d+) or less/i);
    if (maxBM) cantBeBlockedByMaxPower = parseInt(maxBM[1], 10);

    const minBM =
      sent.match(/this creature can't be blocked by creatures? that (?:has|have) power (\d+) or more/i);
    if (minBM) cantBeBlockedByMinPower = parseInt(minBM[1], 10);

    const byCivBM = sent.match(/this creature can't be blocked by (light|water|darkness|fire|nature) creatures?$/i);
    if (byCivBM) {
      for (const civ of parseCivList(byCivBM[1])) {
        if (!cantBeBlockedByCivs.includes(civ)) cantBeBlockedByCivs.push(civ);
      }
    }

    const minOtherM = sent.match(/this creature can't be blocked while you have at least (\d+) other creatures/i);
    if (minOtherM) cantBeBlockedMinOtherCreatures = parseInt(minOtherM[1], 10);

    if (/^this creature can attack untapped creatures$/i.test(sent)) {
      canAttackAllUntapped = true;
    }
    const attUntappedCivM = sent.match(/^this creature can attack untapped ([a-z]+) creatures$/i);
    if (attUntappedCivM) {
      for (const civ of parseCivList(attUntappedCivM[1])) {
        if (!canAttackUntappedCivs.includes(civ)) canAttackUntappedCivs.push(civ);
      }
    }
  }

  const hasConditionalBlocker =
    !blockerFromSentence &&
    /\b(?:turbo rush|wave striker|silent skill|while you have no shields|each of your|other creatures)\b/i.test(cleanRules) &&
    /\bblocker\b/i.test(cleanRules);
  const hasConditionalSlayer =
    !slayerFromSentence &&
    /\b(?:turbo rush|wave striker|silent skill|each of your|each creature|one of your)\b/i.test(cleanRules) &&
    /\bslayer\b/i.test(cleanRules);
  const hasConditionalSpeed =
    !speedAttackerFromSentence &&
    /\b(?:turbo rush|wave striker|silent skill|each of your|one of your|until the end of)\b/i.test(cleanRules) &&
    /\bspeed attacker\b/i.test(cleanRules);

  const caps: CardCapabilities = {
    nameLower,
    civilizations,
    isMultiCiv: Boolean(card.isMultiCiv || civilizations.length > 1),
    races,
    normalizedRaces,
    hasDragonRace: hasDragonRace(races),
    isEvolution: isEvo,
    isVortexEvolution: /vortex evolution/i.test(rules),
    isSurvivor: isSurvivorCard(card),
    isWaveStriker,
    isTurboRush,
    hasSilentSkill,
    hasTapAbility: /\$tap\b|tap ability/i.test(rules),
    isCharger: Boolean(card.isCharger || /charger/i.test(nameLower) || /\bcharger\b/i.test(cleanRules)),
    isShieldTrigger: Boolean(card.isShieldTrigger),
    isBlocker: blockerFromSentence || (Boolean(card.isBlocker) && !hasConditionalBlocker),
    blocksIfAble,
    isSlayer: slayerFromSentence || (Boolean(card.isSlayer) && !hasConditionalSlayer),
    isSpeedAttacker: speedAttackerFromSentence || (Boolean(card.isSpeedAttacker) && !hasConditionalSpeed),
    hasLeaveSubstitution:
      /only the top card leaves the battle zone instead/i.test(rules) ||
      nameLower.includes('soul phoenix'),
    hasShieldBurn:
      /would break a shield.*puts that shield into his graveyard instead/i.test(rules) ||
      nameLower.includes('death phoenix') ||
      nameLower.includes('bolmeteus steel dragon'),
    isMadness:
      /would be discarded.*put it into the battle zone instead/i.test(rules) ||
      nameLower.includes('dava torey') ||
      nameLower.includes('sanfist') ||
      nameLower.includes('bingole') ||
      nameLower.includes('arque delacerna'),
    cantAttack,
    cantAttackPlayers,
    cantAttackCreatures,
    onlyAttackBlockers,
    attacksIfAble,
    cantAttackWhenNoOppShields,
    cantAttackWhenOppHasMoreCreatures,
    cantAttackWhenOtherUntapped,
    cantAttackWithEmptyHand,
    cantBeAttacked,
    cantBeAttackedByCivs,
    cantBeAttackedByDragon,
    cantBeBlockedAlways,
    cantBeBlockedWhileAttackingCreature,
    cantBeBlockedByMaxPower,
    cantBeBlockedByMinPower,
    cantBeBlockedByCivs,
    cantBeBlockedMinOtherCreatures,
    stealthCivs,
    canAttackAllUntapped,
    canAttackUntappedCivs,
    destroyAfterBattle: !isSpell && /when(?:ever)? this creature battles,\s*destroy it after the battle/i.test(cleanRules),
    destroyOnWinBattle: !isSpell && /when this creature wins a battle,\s*destroy it/i.test(cleanRules),
    untapAfterBlock: !isSpell && /whenever this creature blocks,\s*untap it after it battles/i.test(cleanRules),
    noBattleOnBlock: !isSpell && /whenever this creature blocks,\s*no battle happens/i.test(cleanRules),
    noBattleWhenBlocked: !isSpell && /whenever this creature becomes blocked,\s*no battle happens/i.test(cleanRules),
    untapAtEndTurn:
      !isSpell &&
      !isSurvivorCard(card) &&
      (/at the end of (?:each of )?your turns?,?\s*(?:you may )?untap this creature/i.test(cleanRules) ||
        nameLower.includes('urth') ||
        nameLower.includes('frei') ||
        nameLower.includes('ruby grass') ||
        nameLower.includes('betrale') ||
        nameLower.includes('lukia lex') ||
        nameLower.includes('nial')),
    untapAllAtEndTurn:
      !isSpell && /at the end of (?:each of )?your turns?,?\s*(?:you may )?untap all your creatures/i.test(cleanRules),
    selfDestroyAtEndTurn:
      !isSpell &&
      (/at the end of (?:each of )?your turns?,\s*destroy this creature/i.test(cleanRules) ||
        /at the end of (?:the|this) turn,\s*destroy this creature/i.test(cleanRules)),
    selfBounceAtEndTurn:
      !isSpell &&
      (/at the end of (?:each of )?your turns?,?\s*return this creature to (?:your|its owner's) hand/i.test(cleanRules) ||
        /at the end of (?:the|this) turn,\s*return this creature to your hand/i.test(cleanRules)),
  };

  CAPABILITIES_CACHE.set(card, caps);
  return caps;
}

export function isGabzagulCard(card: CardDefinition): boolean {
  const n = getCardCapabilities(card).nameLower;
  return (
    n.includes('gabzagul') ||
    /^each creature attacks each turn if able/i.test((card.rulesText || '').trim())
  );
}

export function isTauntingSkyterrorCard(card: CardDefinition): boolean {
  const n = getCardCapabilities(card).nameLower;
  return (
    n.includes('taunting skyterror') ||
    /while this creature is tapped during your opponent's turn,\s*each of his creatures attacks if able/i.test(
      card.rulesText || ''
    )
  );
}

export function isBodaciousGiantCard(card: CardDefinition): boolean {
  const n = getCardCapabilities(card).nameLower;
  return (
    n.includes('bodacious giant') ||
    /while this creature is tapped during your opponent's turn.*must attack it if able/i.test(
      card.rulesText || ''
    )
  );
}

/**
 * Returns defending player's tapped, not-yet-attacked Bodacious Giant(s) forcing opponent's attacks.
 */
export function getActiveForcedLureTargets(
  state: GameState,
  attackingPlayer: PlayerId
): CreatureInstance[] {
  const defendingPlayer = getOpponentId(attackingPlayer);
  return state.players[defendingPlayer].battleZone.filter(
    (c) => c.isTapped && !c.wasAttackedThisTurn && isBodaciousGiantCard(c.card)
  );
}

/**
 * Returns defending player's Mystery Totems when Forbidding Totem is on the defending board:
 * "Your opponent's attacking creatures attack Mystery Totems if able."
 */
export function getActiveForbiddingTotems(
  state: GameState,
  attackingPlayer: PlayerId
): CreatureInstance[] {
  const defendingPlayer = getOpponentId(attackingPlayer);
  const defBZ = state.players[defendingPlayer].battleZone;
  const hasForbidding = defBZ.some(
    (c) =>
      getCardCapabilities(c.card).nameLower.includes('forbidding totem') ||
      /attack mystery totems if able/i.test(c.card.rulesText || '')
  );
  if (!hasForbidding) return [];
  return defBZ.filter((c) =>
    getCreatureRaces(c).some((r) => normalizeRace(r) === 'mysterytotem')
  );
}

/**
 * Returns true if board-wide auras or active turn spells force all legal creatures of `playerId` to attack.
 */
export function hasBoardForcedAttacks(state: GameState, playerId: PlayerId): boolean {
  const playerState = state.players[playerId];
  const oppState = state.players[getOpponentId(playerId)];

  if (
    Boolean(playerState.tempForceAllAttacksUntilNextTurn) ||
    Boolean(playerState.tempForceAllAttacksGrantedBy)
  ) {
    return true;
  }

  // Gabzagul, Warlord of Pain: "Each creature attacks each turn if able."
  if ([...playerState.battleZone, ...oppState.battleZone].some((c) => isGabzagulCard(c.card))) {
    return true;
  }

  // Taunting Skyterror: while tapped during opponent's turn, each of opponent's creatures attacks if able
  if (
    state.activePlayer === playerId &&
    oppState.battleZone.some((c) => c.isTapped && isTauntingSkyterrorCard(c.card))
  ) {
    return true;
  }

  return false;
}

/**
 * Returns true if a blocker must intercept attacks when legally able
 * (native `blocksIfAble` e.g. Pierr / Ardent Lunatron / Messa Bahna / Belmol, or Storm Wrangler target bind).
 */
export function isCreatureForcedBlocker(
  creature: CreatureInstance,
  attackerId?: string
): boolean {
  if (attackerId !== undefined && creature.tempMustBlockTargetId === attackerId) {
    return true;
  }
  return getCardCapabilities(creature.card).blocksIfAble;
}

/**
 * Returns true if a creature must attack this turn when legally able
 * (native `attacksIfAble` capability, temporary forced-attack flag, forced-attack race grant, or board aura).
 */
export function isCreatureMandatoryAttacker(
  creature: CreatureInstance,
  forcedRaces?: string[],
  state?: GameState,
  ownerId?: PlayerId
): boolean {
  if (Boolean(creature.tempAttacksIfAble)) {
    return true;
  }
  const caps = getCardCapabilities(creature.card);
  if (caps.attacksIfAble || /attacks each turn if able/i.test(creature.card.rulesText || '')) {
    return true;
  }
  if (forcedRaces && forcedRaces.length > 0) {
    const normalizedSet = new Set(forcedRaces.map(normalizeRace));
    const creatureRaces = getCreatureRaces(creature).map(normalizeRace);
    if (creatureRaces.some((r) => normalizedSet.has(r))) {
      return true;
    }
  }
  if (state) {
    const pid = ownerId ?? creature.owner;
    if (hasBoardForcedAttacks(state, pid)) {
      return true;
    }
  }
  return false;
}

/**
 * Helper to get other player ID.
 */
export function getOpponentId(player: PlayerId): PlayerId {
  return player === 'player' ? 'opponent' : 'player';
}
