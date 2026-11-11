import type { CardDefinition } from '../types/card';
import type {
  GameState,
  PlayerId,
  CreatureInstance,
  CardInstance,
  ManaCardInstance,
  ShieldInstance,
  AttackTarget,
  PlayerState
} from './types.ts';
import { destroyCreature } from './spells.ts';

export { destroyCreature };

/**
 * Checks whether a card definition is a Survivor.
 * Returns true if card.isSurvivor || card.races?.includes('Survivor') || /survivor/i.test(card.race || '').
 */
export function isSurvivor(
  card?: CardDefinition | { race?: string; races?: string[]; isSurvivor?: boolean } | null
): boolean {
  if (!card) return false;
  if (card.isSurvivor) return true;
  if (card.races && card.races.some((r) => /survivor/i.test(r))) return true;
  if ('race' in card && typeof card.race === 'string' && /survivor/i.test(card.race)) return true;
  return false;
}

export interface SurvivorSharedAbilities {
  hasBlocker: boolean;
  hasSlayer: boolean;
  hasSpeedAttacker: boolean;
  isUnblockable: boolean;
  hasUntapAtEndTurn: boolean;
  hasManaZoneOnDestroy: boolean;
  powerBonus: number;
  powerAttackerBonus: number;
  minBreakerCount: number;
  hasAttackDraw: boolean;
  hasAttackDiscard: boolean;
}

/**
 * Aggregates all shared Survivor abilities from a friendly battle zone.
 */
export function getSurvivorSharedAbilities(
  friendlyBattleZone: CreatureInstance[] = []
): SurvivorSharedAbilities {
  const friendlySurvivors = friendlyBattleZone.filter((c) => isSurvivor(c.card));

  const hasBlocker = friendlySurvivors.some(
    (c) =>
      c.card.name.toLowerCase().includes('gallia zohl') ||
      c.card.isBlocker ||
      /blocker/i.test(c.card.rulesText || '')
  );

  const hasSlayer = friendlySurvivors.some(
    (c) =>
      c.card.name.toLowerCase().includes('gigaling') ||
      c.card.isSlayer ||
      /slayer/i.test(c.card.rulesText || '')
  );

  const hasSpeedAttacker = friendlySurvivors.some(
    (c) =>
      c.card.name.toLowerCase().includes('rumblesaur') ||
      c.card.isSpeedAttacker ||
      /speed attacker/i.test(c.card.rulesText || '')
  );

  const isUnblockable = friendlySurvivors.some(
    (c) =>
      c.card.name.toLowerCase().includes('spikestrike ichthys') ||
      /can't be blocked/i.test(c.card.rulesText || '')
  );

  const hasUntapAtEndTurn = friendlySurvivors.some(
    (c) =>
      c.card.name.toLowerCase().includes('ballus') ||
      /untap this creature/i.test(c.card.rulesText || '')
  );

  const hasManaZoneOnDestroy = friendlySurvivors.some(
    (c) =>
      c.card.name.toLowerCase().includes('balloonshroom') ||
      /put it into your mana zone instead/i.test(c.card.rulesText || '')
  );

  const smashHornCopies = friendlySurvivors.filter(
    (c) =>
      c.card.name.toLowerCase().includes('smash horn') ||
      (/gets \+1000 power/i.test(c.card.rulesText || '') && /survivor/i.test(c.card.rulesText || ''))
  ).length;
  const powerBonus = smashHornCopies * 1000;

  const blazosaurCopies = friendlySurvivors.filter(
    (c) =>
      c.card.name.toLowerCase().includes('blazosaur') ||
      (/power attacker \+1000/i.test(c.card.rulesText || '') && /survivor/i.test(c.card.rulesText || ''))
  ).length;
  const powerAttackerBonus = blazosaurCopies * 1000;

  const hasDoubleBreaker = friendlySurvivors.some(
    (c) =>
      c.card.name.toLowerCase().includes('bladerush skyterror') ||
      (c.card.breakerCount && c.card.breakerCount >= 2) ||
      /double breaker/i.test(c.card.rulesText || '')
  );
  const minBreakerCount = hasDoubleBreaker ? 2 : 1;

  const hasAttackDraw = friendlySurvivors.some(
    (c) =>
      c.card.name.toLowerCase().includes('split-head hydroturtle') ||
      (/draw a card/i.test(c.card.rulesText || '') && /attacks/i.test(c.card.rulesText || ''))
  );

  const hasAttackDiscard = friendlySurvivors.some(
    (c) =>
      c.card.name.toLowerCase().includes('skullsweeper') ||
      (/discards a card/i.test(c.card.rulesText || '') && /attacks/i.test(c.card.rulesText || ''))
  );

  return {
    hasBlocker,
    hasSlayer,
    hasSpeedAttacker,
    isUnblockable,
    hasUntapAtEndTurn,
    hasManaZoneOnDestroy,
    powerBonus,
    powerAttackerBonus,
    minBreakerCount,
    hasAttackDraw,
    hasAttackDiscard
  };
}

/**
 * Checks whether a creature has Blocker, taking Survivor shared abilities into account.
 */
export function hasCreatureBlocker(
  creature: CreatureInstance,
  friendlyBattleZone: CreatureInstance[] = []
): boolean {
  if (creature.card.isBlocker) {
    return true;
  }
  if (isSurvivor(creature.card)) {
    const abilities = getSurvivorSharedAbilities(friendlyBattleZone);
    if (abilities.hasBlocker) {
      return true;
    }
  }
  return false;
}

/**
 * Checks whether a creature has Slayer, taking Survivor shared abilities into account.
 */
export function hasCreatureSlayer(
  creature: CreatureInstance,
  friendlyBattleZone: CreatureInstance[] = []
): boolean {
  if (creature.card.isSlayer) {
    return true;
  }
  if (isSurvivor(creature.card)) {
    const abilities = getSurvivorSharedAbilities(friendlyBattleZone);
    if (abilities.hasSlayer) {
      return true;
    }
  }
  return false;
}

/**
 * Calculates breaker count for a creature:
 * - Minimum of card.breakerCount or 1.
 * - If Survivor and Bladerush Skyterror Q in battle zone, at least 2.
 * - If Q-tronic Gargantua, adds 1 for each other friendly Survivor in battle zone.
 */
export function getCreatureBreakerCount(
  creature: CreatureInstance,
  friendlyBattleZone: CreatureInstance[] = []
): number {
  let count = Math.max(1, creature.card.breakerCount || 1);
  if (isSurvivor(creature.card) && friendlyBattleZone.length > 0) {
    const abilities = getSurvivorSharedAbilities(friendlyBattleZone);
    count = Math.max(count, abilities.minBreakerCount);
  }
  if (
    creature.card.name.toLowerCase().includes('q-tronic gargantua') &&
    friendlyBattleZone.length > 0
  ) {
    const otherSurvivors = friendlyBattleZone.filter(
      (c) => c.instanceId !== creature.instanceId && isSurvivor(c.card)
    ).length;
    count += otherSurvivors;
  }
  return count;
}

/**
 * Calculates continuous aura bonuses for a creature:
 * - Smash Horn Q: +1000 to all friendly Survivors per Smash Horn Q.
 * - Barkwhip, the Smasher: If tapped, each other friendly Beast Folk gets +2000.
 * - Armored Blaster Valdios: Each other friendly Human gets +1000.
 * - Überdragon Jabaha: If attacking, each other friendly Fire creature gets +2000 power attacker.
 * - Re Bil, Seeker of Archery: Each other Light creature in the battle zone (both sides) gets +2000.
 * - Shadow Moon, Cursed Shade: Each other Darkness creature in the battle zone (both sides) gets +2000.
 * - Blasto, Explosive Soldier: Gets +2000 if friendly battle zone has a Darkness creature.
 * - Exploding Cactus: Gets +2000 if friendly battle zone has a Light creature.
 * - Pala Olesis, Morning Guardian: During opponent's turn (isOpponentsTurn === true), each other friendly creature gets +2000.
 * - Legacy Shell: If attacking, each friendly Light and Fire creature gets +3000 power attacker.
 * - Wave Striker power aura: Merlee, the Oracle (+1000 to all friendly if 3+ wave strikers in battle zone).
 * - Multi-civ evolution auras (+2000 to respective races: Agira, Hydrooze, Nemonex, Comet Eye).
 * - Techno Totem: If tapped and attacking, each other friendly creature gets +1500 power attacker.
 */
export function calculateContinuousAuraPower(
  creature: CreatureInstance,
  isAttacking: boolean,
  friendlyBattleZone: CreatureInstance[] = [],
  opponentBattleZone: CreatureInstance[] = [],
  playerState?: PlayerState,
  opponentState?: PlayerState,
  isOpponentsTurn?: boolean
): { powerBonus: number; powerAttackerBonus: number } {
  let powerBonus = 0;
  let powerAttackerBonus = 0;

  const card = creature.card;
  const nameLower = card.name.toLowerCase();
  const civs = card.civilizations || [];
  const races = card.races || ((card as any).race ? [(card as any).race] : []);

  const fZone = friendlyBattleZone.length > 0 ? friendlyBattleZone : (playerState?.battleZone || []);
  const oZone = opponentBattleZone.length > 0 ? opponentBattleZone : (opponentState?.battleZone || []);
  const allCreatures = [...fZone, ...oZone];

  // 1. Smash Horn Q & Blazosaur Q (Survivor power bonuses)
  if (isSurvivor(card) && fZone.length > 0) {
    const survivorAbilities = getSurvivorSharedAbilities(fZone);
    powerBonus += survivorAbilities.powerBonus;
    if (isAttacking) {
      powerAttackerBonus += survivorAbilities.powerAttackerBonus;
    }
  }

  // 2. Barkwhip, the Smasher: If tapped, each other friendly Beast Folk gets +2000
  const isBeastFolk = races.some((r: string) => /beast folk/i.test(r));
  if (isBeastFolk) {
    const barkwhipCount = fZone.filter(
      (c) =>
        c.instanceId !== creature.instanceId &&
        c.isTapped &&
        c.card.name.toLowerCase().includes('barkwhip')
    ).length;
    powerBonus += barkwhipCount * 2000;
  }

  // 3. Armored Blaster Valdios: Each other friendly Human gets +1000
  const isHuman = races.some((r: string) => /human/i.test(r));
  if (isHuman) {
    const valdiosCount = fZone.filter(
      (c) =>
        c.instanceId !== creature.instanceId &&
        c.card.name.toLowerCase().includes('valdios')
    ).length;
    powerBonus += valdiosCount * 1000;
  }

  // 4. Überdragon Jabaha: If attacking, each other friendly Fire creature gets +2000 power attacker
  const isFire = civs.includes('Fire');
  if (isFire && isAttacking) {
    const jabahaCount = fZone.filter(
      (c) =>
        c.instanceId !== creature.instanceId &&
        c.card.name.toLowerCase().includes('jabaha')
    ).length;
    powerAttackerBonus += jabahaCount * 2000;
  }

  // 5. Re Bil, Seeker of Archery: Each other Light creature in the battle zone (both sides) gets +2000
  const isLight = civs.includes('Light');
  if (isLight) {
    const reBilCount = allCreatures.filter(
      (c) =>
        c.instanceId !== creature.instanceId &&
        c.card.name.toLowerCase().includes('re bil')
    ).length;
    powerBonus += reBilCount * 2000;
  }

  // 6. Shadow Moon, Cursed Shade: Each other Darkness creature in the battle zone (both sides) gets +2000
  const isDarkness = civs.includes('Darkness');
  if (isDarkness) {
    const shadowMoonCount = allCreatures.filter(
      (c) =>
        c.instanceId !== creature.instanceId &&
        c.card.name.toLowerCase().includes('shadow moon')
    ).length;
    powerBonus += shadowMoonCount * 2000;
  }

  // 7. Blasto, Explosive Soldier: Gets +2000 if friendly battle zone has a Darkness creature
  if (
    nameLower.includes('blasto') ||
    /while you have a darkness creature in the battle zone, this creature gets \+2000 power/i.test(
      card.rulesText || ''
    )
  ) {
    const hasDarkness = fZone.some(
      (c) => c.instanceId !== creature.instanceId && (c.card.civilizations || []).includes('Darkness')
    );
    if (hasDarkness) {
      powerBonus += 2000;
    }
  }

  // 8. Exploding Cactus: Gets +2000 if friendly battle zone has a Light creature
  if (
    nameLower.includes('exploding cactus') ||
    /while you have a light creature in the battle zone, this creature gets \+2000 power/i.test(
      card.rulesText || ''
    )
  ) {
    const hasLight = fZone.some(
      (c) => c.instanceId !== creature.instanceId && (c.card.civilizations || []).includes('Light')
    );
    if (hasLight) {
      powerBonus += 2000;
    }
  }

  // 9. Pala Olesis, Morning Guardian: During opponent's turn, each other friendly creature gets +2000
  if (isOpponentsTurn) {
    const palaCount = fZone.filter(
      (c) =>
        c.instanceId !== creature.instanceId &&
        c.card.name.toLowerCase().includes('pala olesis')
    ).length;
    powerBonus += palaCount * 2000;
  }

  // 10. Legacy Shell: If attacking, each friendly Light and Fire creature gets +3000 power attacker
  const isLightOrFire = civs.some((c) => c === 'Light' || c === 'Fire');
  if (isLightOrFire && isAttacking) {
    const legacyShellCount = fZone.filter((c) =>
      c.card.name.toLowerCase().includes('legacy shell')
    ).length;
    powerAttackerBonus += legacyShellCount * 3000;
  }

  // 11. Wave Striker power aura: Merlee, the Oracle (+1000 to all friendly if 3+ wave strikers in battle zone)
  const isWaveStrikerCreature = (c: CreatureInstance) =>
    Boolean(
      (c.card as any).isWaveStriker ||
      /wave striker/i.test(c.card.rulesText || '') ||
      (c.card.races && c.card.races.some((r: string) => /wave striker/i.test(r)))
    );
  const totalWaveStrikers = allCreatures.filter(isWaveStrikerCreature).length;
  if (totalWaveStrikers >= 3) {
    const merleeCount = fZone.filter((c) =>
      c.card.name.toLowerCase().includes('merlee')
    ).length;
    powerBonus += merleeCount * 1000;
  }

  // 12. Multi-civ evolution auras (+2000 to respective races)
  // Agira, the Warlord Crawler: +2000 to other Gladiators & Earth Eaters
  if (races.some((r: string) => /gladiator|earth eater/i.test(r))) {
    const agiraCount = fZone.filter(
      (c) =>
        c.instanceId !== creature.instanceId &&
        c.card.name.toLowerCase().includes('agira')
    ).length;
    powerBonus += agiraCount * 2000;
  }

  // Hydrooze, the Mutant Emperor: +2000 to other Cyber Lords & Hedrians
  if (races.some((r: string) => /cyber lord|hedrian/i.test(r))) {
    const hydroozeCount = fZone.filter(
      (c) =>
        c.instanceId !== creature.instanceId &&
        c.card.name.toLowerCase().includes('hydrooze')
    ).length;
    powerBonus += hydroozeCount * 2000;
  }

  // Nemonex, Bajula's Robomantis: +2000 to other Xeno Parts & Giant Insects
  if (races.some((r: string) => /xeno\s*parts?|giant insect/i.test(r))) {
    const nemonexCount = fZone.filter(
      (c) =>
        c.instanceId !== creature.instanceId &&
        c.card.name.toLowerCase().includes('nemonex')
    ).length;
    powerBonus += nemonexCount * 2000;
  }

  // Comet Eye, The Spectral Spud: +2000 to other Wild Veggies & Rainbow Phantoms
  if (races.some((r: string) => /wild veggies?|rainbow phantom/i.test(r))) {
    const cometEyeCount = fZone.filter(
      (c) =>
        c.instanceId !== creature.instanceId &&
        c.card.name.toLowerCase().includes('comet eye')
    ).length;
    powerBonus += cometEyeCount * 2000;
  }

  // 13. Techno Totem: If tapped and attacking, each other friendly creature gets +1500 power attacker
  if (isAttacking) {
    const technoTotemCount = fZone.filter(
      (c) =>
        c.instanceId !== creature.instanceId &&
        c.isTapped &&
        c.card.name.toLowerCase().includes('techno totem')
    ).length;
    powerAttackerBonus += technoTotemCount * 1500;
  }

  return { powerBonus, powerAttackerBonus };
}

/**
 * Helper to locate a creature across all players' battle zones.
 */
export function findCreature(
  state: GameState,
  creatureId: string
): { creature: CreatureInstance; owner: PlayerId } | null {
  for (const pid of ['player', 'opponent'] as const) {
    const c = state.players[pid].battleZone.find((x) => x.instanceId === creatureId);
    if (c) {
      return { creature: c, owner: pid };
    }
  }
  return null;
}

/**
 * Bounces a creature from the battle zone to its owner's hand:
 * - Returns the creature and any cards stacked under it (evolvedOn) to owner's hand.
 * - Pure and immutable.
 */
export function bounceCreature(state: GameState, creatureInstanceId: string): GameState {
  const found = findCreature(state, creatureInstanceId);
  if (!found) {
    return state;
  }

  const { creature, owner } = found;
  const ownerState = state.players[owner];

  const cardsToHand: CardInstance[] = [
    {
      instanceId: creature.instanceId,
      card: creature.card,
      owner
    },
    ...(creature.evolvedOn || [])
  ];

  return {
    ...state,
    players: {
      ...state.players,
      [owner]: {
        ...ownerState,
        battleZone: ownerState.battleZone.filter((c) => c.instanceId !== creatureInstanceId),
        hand: [...ownerState.hand, ...cardsToHand]
      }
    },
    actionLog: [
      ...state.actionLog,
      `Returned ${creature.card.name} to its owner's hand.`
    ]
  };
}

/**
 * Evaluates and triggers on-destruction / leaves-play abilities when a creature is destroyed:
 * - Opponent Discard (e.g. Bone Assassin, Propeller Mutant, Gigamantis)
 * - Card Draw (e.g. Phantasmal Horror Gigazal, Aqua Deformer, Cetibols)
 * - Opponent Creature Destruction (e.g. Stallob, Damudo, or single creature destruction)
 * - Tapping Opponent Creatures (e.g. Jil Warka)
 * - Mana Zone Discard / Destruction (e.g. Bombersaur, Engineer Kipo)
 * - Graveyard Salvage (e.g. Bat Doctor, Pharzi)
 * - Shield to Hand (e.g. Jewel Spider)
 *
 * @param state State after creature has been removed from battle zone and placed in graveyard.
 * @param owner The PlayerId of the creature's controller/owner.
 * @param creature The CreatureInstance that was destroyed.
 */
export function triggerDestroyed(
  state: GameState,
  owner: PlayerId,
  creature: CreatureInstance
): GameState {
  if (state.winner !== null) {
    return state;
  }

  const opponent: PlayerId = owner === 'player' ? 'opponent' : 'player';
  const card = creature.card;
  const rules = card.rulesText || '';
  const cardName = card.name.toLowerCase().trim();
  let nextState = state;

  // 1. Hand Discard on Destruction
  // e.g. "When this creature is destroyed, your opponent discards a card at random"
  // e.g. Bone Assassin, Propeller Mutant, Gigamantis (if discard variant)
  const discardMatch = rules.match(
    /when(?:ever)? this creature is destroyed.*(?:opponent discards|discards a card at random)/i
  );
  if (
    discardMatch ||
    cardName.includes('propeller mutant') ||
    (cardName.includes('bone assassin') && (/discard/i.test(rules) || /opponent discards/i.test(rules))) ||
    (cardName.includes('gigamantis') && /discard/i.test(rules))
  ) {
    const numMatch = rules.match(/discards? (?:a|(\d+)) cards?/i);
    const count = numMatch && numMatch[1] ? parseInt(numMatch[1], 10) : 1;
    nextState = discardRandomHandCards(nextState, opponent, count);
  } else if (/when(?:ever)? this creature is destroyed, each player discards (?:his|their) hand/i.test(rules)) {
    // Schuka, Duke of Amnesia
    for (const pid of ['player', 'opponent'] as const) {
      const p = nextState.players[pid];
      if (p.hand.length > 0) {
        nextState = {
          ...nextState,
          players: {
            ...nextState.players,
            [pid]: {
              ...p,
              hand: [],
              graveyard: [...p.graveyard, ...p.hand]
            }
          },
          actionLog: [
            ...nextState.actionLog,
            `${pid} discarded their entire hand to the graveyard.`
          ]
        };
      }
    }
  }

  // 2. Card Draw on Destruction
  // e.g. "When this creature is destroyed, you may draw a card"
  // e.g. Cetibols, Phantasmal Horror Gigazal, Aqua Deformer
  const drawMatch = rules.match(
    /when(?:ever)? this creature is destroyed.*(?:you may )?draw (?:a|(\d+)) cards?/i
  );
  if (
    drawMatch ||
    cardName.includes('cetibols') ||
    cardName.includes('gigazal') ||
    cardName.includes('aqua deformer')
  ) {
    const count = drawMatch && drawMatch[1] ? parseInt(drawMatch[1], 10) : 1;
    nextState = drawCards(nextState, owner, count);
  }

  // 3. Opponent Creature Destruction on Death
  // e.g. "When this creature is destroyed, destroy one of your opponent's creatures"
  // e.g. Stallob ("destroy all creatures"), Damudo ("destroy all creatures power 3000 or less")
  if (/when(?:ever)? this creature is destroyed.*destroy all creatures/i.test(rules) || cardName.includes('stallob')) {
    const allCreatures = [
      ...nextState.players.player.battleZone,
      ...nextState.players.opponent.battleZone
    ];
    for (const c of allCreatures) {
      nextState = destroyCreature(nextState, c.instanceId);
    }
  } else if (/when(?:ever)? this creature is destroyed.*destroy all creatures that have power (\d+) or less/i.test(rules) || cardName.includes('damudo')) {
    const powerMatch = rules.match(/power (\d+) or less/i);
    const maxPower = powerMatch ? parseInt(powerMatch[1], 10) : 3000;
    const targets = [
      ...nextState.players.player.battleZone,
      ...nextState.players.opponent.battleZone
    ].filter((c) => (c.card.power ?? 0) + c.powerModifier <= maxPower);
    for (const c of targets) {
      nextState = destroyCreature(nextState, c.instanceId);
    }
  } else if (
    /when(?:ever)? this creature is destroyed.*destroy (?:one|1|a) of your opponent's creatures/i.test(rules)
  ) {
    const oppBZ = nextState.players[opponent].battleZone;
    if (oppBZ.length > 0) {
      const sorted = [...oppBZ].sort(
        (a, b) => (b.card.power ?? 0) + b.powerModifier - ((a.card.power ?? 0) + a.powerModifier)
      );
      nextState = destroyCreature(nextState, sorted[0].instanceId);
    }
  }

  // 4. Tapping Opponent Creatures on Death
  // e.g. Jil Warka, Time Guardian: choose up to 2 opponent creatures and tap them
  const tapMatch = rules.match(
    /when(?:ever)? this creature is destroyed.*(?:choose up to (\d+) of your opponent's creatures .* and tap them|tap (?:up to (\d+) )?of your opponent's creatures)/i
  );
  if (tapMatch || cardName.includes('jil warka')) {
    const count = tapMatch && (tapMatch[1] || tapMatch[2]) ? parseInt(tapMatch[1] || tapMatch[2], 10) : 2;
    const oppBZ = nextState.players[opponent].battleZone;
    const untapped = oppBZ.filter((c) => !c.isTapped);
    if (untapped.length > 0) {
      const toTap = untapped.slice(0, count);
      const tapIds = new Set(toTap.map((c) => c.instanceId));
      nextState = {
        ...nextState,
        players: {
          ...nextState.players,
          [opponent]: {
            ...nextState.players[opponent],
            battleZone: oppBZ.map((c) => tapIds.has(c.instanceId) ? { ...c, isTapped: true } : c)
          }
        },
        actionLog: [
          ...nextState.actionLog,
          `${creature.card.name}'s destruction effect tapped ${toTap.map((c) => c.card.name).join(', ')}.`
        ]
      };
    }
  }

  // 5. Mana Destruction on Death
  // e.g. Bombersaur (2 mana each), Engineer Kipo (1 mana each)
  if (
    /when(?:ever)? this creature is destroyed, each player (?:chooses|destroys) (\d+)?.*mana zone.*into (?:his|their) graveyard/i.test(rules) ||
    cardName.includes('bombersaur') ||
    cardName.includes('engineer kipo')
  ) {
    const manaCount = cardName.includes('bombersaur') ? 2 : 1;
    for (const pid of ['player', 'opponent'] as const) {
      const pState = nextState.players[pid];
      if (pState.manaZone.length > 0) {
        const removed = pState.manaZone.slice(0, manaCount);
        const remaining = pState.manaZone.slice(manaCount);
        const toGrave: CardInstance[] = removed.map((m) => ({
          instanceId: m.instanceId,
          card: m.card,
          owner: pid
        }));
        nextState = {
          ...nextState,
          players: {
            ...nextState.players,
            [pid]: {
              ...pState,
              manaZone: remaining,
              graveyard: [...pState.graveyard, ...toGrave]
            }
          },
          actionLog: [
            ...nextState.actionLog,
            `${creature.card.name}'s destruction put ${removed.length} mana card(s) of ${pid} into the graveyard.`
          ]
        };
      }
    }
  }

  // 6. Graveyard Salvage on Death
  // Bat Doctor, Shadow of Undeath / Pharzi, the Oracle
  if (
    /when(?:ever)? this creature is destroyed.*return (?:another )?creature from your graveyard to your hand/i.test(rules) ||
    cardName.includes('bat doctor')
  ) {
    const ownerGrave = nextState.players[owner].graveyard;
    const validCreatures = ownerGrave.filter(
      (c) =>
        (c.card.type === 'Creature' || c.card.type === 'Evolution Creature') &&
        c.instanceId !== creature.instanceId
    );
    if (validCreatures.length > 0) {
      const target = validCreatures[validCreatures.length - 1]; // most recent
      nextState = {
        ...nextState,
        players: {
          ...nextState.players,
          [owner]: {
            ...nextState.players[owner],
            graveyard: ownerGrave.filter((c) => c.instanceId !== target.instanceId),
            hand: [...nextState.players[owner].hand, target]
          }
        },
        actionLog: [
          ...nextState.actionLog,
          `${creature.card.name}'s destruction effect returned ${target.card.name} from graveyard to hand.`
        ]
      };
    }
  } else if (
    /when(?:ever)? this creature is destroyed.*return a spell from your graveyard to your hand/i.test(rules) ||
    cardName.includes('pharzi')
  ) {
    const ownerGrave = nextState.players[owner].graveyard;
    const validSpells = ownerGrave.filter((c) => c.card.type === 'Spell');
    if (validSpells.length > 0) {
      const target = validSpells[validSpells.length - 1];
      nextState = {
        ...nextState,
        players: {
          ...nextState.players,
          [owner]: {
            ...nextState.players[owner],
            graveyard: ownerGrave.filter((c) => c.instanceId !== target.instanceId),
            hand: [...nextState.players[owner].hand, target]
          }
        },
        actionLog: [
          ...nextState.actionLog,
          `${creature.card.name}'s destruction effect returned ${target.card.name} from graveyard to hand.`
        ]
      };
    }
  }

  // 7. Shield to Hand on Death (e.g. Jewel Spider)
  if (
    /when(?:ever)? this creature is destroyed.*choose one of your shields and put it into your hand/i.test(rules) ||
    cardName.includes('jewel spider')
  ) {
    const unbrokenShields = nextState.players[owner].shields.filter((s) => !s.isBroken);
    if (unbrokenShields.length > 0) {
      const shieldToTake = unbrokenShields[0];
      const remainingShields = nextState.players[owner].shields.filter((s) => s.id !== shieldToTake.id);
      const cardToHand: CardInstance = {
        instanceId: shieldToTake.id,
        card: shieldToTake.card,
        owner
      };
      nextState = {
        ...nextState,
        players: {
          ...nextState.players,
          [owner]: {
            ...nextState.players[owner],
            shields: remainingShields,
            hand: [...nextState.players[owner].hand, cardToHand]
          }
        },
        actionLog: [
          ...nextState.actionLog,
          `${creature.card.name}'s destruction effect added a shield to hand.`
        ]
      };
    }
  }

  return nextState;
}

/**
 * Adds the top card(s) of the player's deck to their shields:
 * - Appends to player.shields with isBroken: false.
 * - Pure and immutable.
 */
export function addShieldFromDeck(
  state: GameState,
  player: PlayerId,
  count: number = 1
): GameState {
  const playerState = state.players[player];
  if (playerState.deck.length === 0) {
    return {
      ...state,
      actionLog: [
        ...state.actionLog,
        `${player}'s deck is empty; no shield could be added.`
      ]
    };
  }

  let nextDeck = [...playerState.deck];
  const newShields = [...playerState.shields];
  let addedCount = 0;

  for (let i = 0; i < count; i++) {
    if (nextDeck.length === 0) {
      break;
    }
    const [topCard, ...rest] = nextDeck;
    nextDeck = rest;
    const shieldId = `shield-${player}-${newShields.length}-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;
    const newShield: ShieldInstance = {
      id: shieldId,
      shieldId,
      card: topCard.card,
      isBroken: false
    };
    newShields.push(newShield);
    addedCount++;
  }

  return {
    ...state,
    players: {
      ...state.players,
      [player]: {
        ...playerState,
        deck: nextDeck,
        shields: newShields
      }
    },
    actionLog: [
      ...state.actionLog,
      `${player} added ${addedCount} card(s) from the top of the deck to shields.`
    ]
  };
}

/**
 * Destroys opponent's shields directly to their graveyard without triggering Shield Triggers:
 * - If targetShieldIds are provided, destroys those specific shields (up to count).
 * - Otherwise destroys the first count unbroken shields.
 * - Pure and immutable.
 */
export function destroyOpponentShields(
  state: GameState,
  player: PlayerId,
  count: number = 1,
  targetShieldIds?: string[]
): GameState {
  const opponent: PlayerId = player === 'player' ? 'opponent' : 'player';
  const opponentState = state.players[opponent];
  const unbrokenShields = opponentState.shields.filter((s) => !s.isBroken);

  if (unbrokenShields.length === 0 || count <= 0) {
    return state;
  }

  let shieldsToDestroy: ShieldInstance[] = [];
  if (targetShieldIds && targetShieldIds.length > 0) {
    shieldsToDestroy = unbrokenShields
      .filter(
        (s) =>
          targetShieldIds.includes(s.id) ||
          (s.shieldId && targetShieldIds.includes(s.shieldId))
      )
      .slice(0, count);
  }

  if (shieldsToDestroy.length === 0) {
    shieldsToDestroy = unbrokenShields.slice(0, count);
  }

  const destroyIds = new Set(shieldsToDestroy.map((s) => s.id));
  const nextShields = opponentState.shields.filter((s) => !destroyIds.has(s.id));
  const graveCards: CardInstance[] = shieldsToDestroy.map((s) => ({
    instanceId: s.id,
    card: s.card,
    owner: opponent
  }));

  return {
    ...state,
    players: {
      ...state.players,
      [opponent]: {
        ...opponentState,
        shields: nextShields,
        graveyard: [...opponentState.graveyard, ...graveCards]
      }
    },
    actionLog: [
      ...state.actionLog,
      `${player} put ${shieldsToDestroy.length} of ${opponent}'s shield(s) into the graveyard.`
    ]
  };
}

/**
 * Draws cards for the specified player:
 * - Checks for deck-out (immediate loss if drawing from empty deck).
 * - Pure and immutable.
 */
export function drawCards(
  state: GameState,
  player: PlayerId,
  count: number
): GameState {
  if (state.winner !== null || count <= 0) {
    return state;
  }

  const opponent: PlayerId = player === 'player' ? 'opponent' : 'player';
  let playerState = state.players[player];
  const actionLogs = [...state.actionLog];

  let drawnCount = 0;
  for (let i = 0; i < count; i++) {
    if (playerState.deck.length === 0) {
      actionLogs.push(
        `${player} cannot draw from an empty deck! ${opponent} wins the duel by deck-out.`
      );
      return {
        ...state,
        winner: opponent,
        players: {
          ...state.players,
          [player]: playerState
        },
        actionLog: actionLogs
      };
    }

    const [card, ...remainingDeck] = playerState.deck;
    playerState = {
      ...playerState,
      deck: remainingDeck,
      hand: [...playerState.hand, card]
    };
    drawnCount++;
  }

  actionLogs.push(`${player} drew ${drawnCount} card(s).`);

  return {
    ...state,
    players: {
      ...state.players,
      [player]: playerState
    },
    actionLog: actionLogs
  };
}

/**
 * Ramps the top card(s) of the player's deck directly into their mana zone:
 * - Multi-civ cards enter tapped; mono-civ enter untapped.
 * - Pure and immutable.
 */
export function rampTopDeckToManaZone(
  state: GameState,
  player: PlayerId,
  count: number = 1
): GameState {
  if (state.winner !== null || count <= 0) {
    return state;
  }

  let playerState = state.players[player];
  const actionLogs = [...state.actionLog];

  for (let i = 0; i < count; i++) {
    if (playerState.deck.length === 0) {
      actionLogs.push(
        `${player}'s deck is empty; no card could be placed in the mana zone.`
      );
      break;
    }

    const [topCard, ...remainingDeck] = playerState.deck;
    const isMultiCiv = Boolean(
      topCard.card.isMultiCiv || topCard.card.civilizations.length > 1
    );

    const manaCard: ManaCardInstance = {
      instanceId: topCard.instanceId,
      card: topCard.card,
      isTapped: isMultiCiv
    };

    playerState = {
      ...playerState,
      deck: remainingDeck,
      manaZone: [...playerState.manaZone, manaCard]
    };

    actionLogs.push(
      `${player} put ${topCard.card.name} from the top of the deck into the mana zone.`
    );
  }

  return {
    ...state,
    players: {
      ...state.players,
      [player]: playerState
    },
    actionLog: actionLogs
  };
}

/**
 * Randomly removes count card(s) from targetPlayer's hand and moves them to graveyard.
 * - Pure and immutable.
 */
export function discardRandomHandCards(
  state: GameState,
  targetPlayer: PlayerId,
  count: number = 1
): GameState {
  if (state.winner !== null || count <= 0) {
    return state;
  }

  const pState = state.players[targetPlayer];
  if (pState.hand.length === 0) {
    return state;
  }

  const handCopy = [...pState.hand];
  const discarded: CardInstance[] = [];
  const actualCount = Math.min(count, handCopy.length);

  for (let i = 0; i < actualCount; i++) {
    const randomIndex = Math.floor(Math.random() * handCopy.length);
    const [card] = handCopy.splice(randomIndex, 1);
    discarded.push(card);
  }

  const discardedNames = discarded.map((c) => c.card.name).join(', ');
  return {
    ...state,
    players: {
      ...state.players,
      [targetPlayer]: {
        ...pState,
        hand: handCopy,
        graveyard: [...pState.graveyard, ...discarded]
      }
    },
    actionLog: [
      ...state.actionLog,
      `${targetPlayer} discarded ${discardedNames} at random from hand.`
    ]
  };
}

/**
 * Searches the player's deck for the first card matching filterFn and moves it to the destination.
 * Destination options:
 * - 'hand': moves card into player's hand.
 * - 'manaZone': moves card into player's mana zone (tapped if multi-civ).
 * - 'shields': moves card into player's shields as an unbroken shield.
 * - Pure and immutable.
 */
export function searchDeckForCard(
  state: GameState,
  player: PlayerId,
  filterFn: (c: CardDefinition) => boolean,
  destination: 'hand' | 'manaZone' | 'shields'
): GameState {
  if (state.winner !== null) {
    return state;
  }

  const playerState = state.players[player];
  const cardIndex = playerState.deck.findIndex((ci) => filterFn(ci.card));

  if (cardIndex === -1) {
    return {
      ...state,
      actionLog: [
        ...state.actionLog,
        `${player} searched deck but found no matching card.`
      ]
    };
  }

  const targetCard = playerState.deck[cardIndex];
  const nextDeck = playerState.deck.filter((_, idx) => idx !== cardIndex);

  if (destination === 'hand') {
    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...playerState,
          deck: nextDeck,
          hand: [...playerState.hand, targetCard]
        }
      },
      actionLog: [
        ...state.actionLog,
        `${player} searched deck and put ${targetCard.card.name} into hand.`
      ]
    };
  }

  if (destination === 'manaZone') {
    const isMultiCiv = Boolean(
      targetCard.card.isMultiCiv || targetCard.card.civilizations.length > 1
    );
    const manaCard: ManaCardInstance = {
      instanceId: targetCard.instanceId,
      card: targetCard.card,
      isTapped: isMultiCiv
    };

    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...playerState,
          deck: nextDeck,
          manaZone: [...playerState.manaZone, manaCard]
        }
      },
      actionLog: [
        ...state.actionLog,
        `${player} searched deck and put ${targetCard.card.name} into mana zone.`
      ]
    };
  }

  if (destination === 'shields') {
    const shieldId = `shield-${player}-${playerState.shields.length}-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;
    const shield: ShieldInstance = {
      id: shieldId,
      shieldId,
      card: targetCard.card,
      isBroken: false
    };

    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...playerState,
          deck: nextDeck,
          shields: [...playerState.shields, shield]
        }
      },
      actionLog: [
        ...state.actionLog,
        `${player} searched deck and added ${targetCard.card.name} to shields.`
      ]
    };
  }

  return state;
}

/**
 * Searches the player's graveyard for the first card matching filterFn and salvages it.
 * Destination options:
 * - 'hand': moves card from graveyard to player's hand.
 * - 'battleZone': summons/reanimates creature from graveyard directly into battle zone.
 * - Pure and immutable.
 */
export function salvageFromGraveyard(
  state: GameState,
  player: PlayerId,
  filterFn: (c: CardDefinition) => boolean,
  destination: 'hand' | 'battleZone'
): GameState {
  if (state.winner !== null) {
    return state;
  }

  const playerState = state.players[player];
  const cardIndex = playerState.graveyard.findIndex((ci) => filterFn(ci.card));

  if (cardIndex === -1) {
    return {
      ...state,
      actionLog: [
        ...state.actionLog,
        `${player} searched graveyard but found no matching card.`
      ]
    };
  }

  const targetCard = playerState.graveyard[cardIndex];
  const nextGraveyard = playerState.graveyard.filter((_, idx) => idx !== cardIndex);

  if (destination === 'hand') {
    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...playerState,
          graveyard: nextGraveyard,
          hand: [...playerState.hand, targetCard]
        }
      },
      actionLog: [
        ...state.actionLog,
        `${player} salvaged ${targetCard.card.name} from graveyard to hand.`
      ]
    };
  }

  if (destination === 'battleZone') {
    const creature: CreatureInstance = {
      instanceId: targetCard.instanceId,
      card: targetCard.card,
      owner: player,
      isTapped: false,
      summonedTurn: state.turn,
      powerModifier: 0
    };

    return {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...playerState,
          graveyard: nextGraveyard,
          battleZone: [...playerState.battleZone, creature]
        }
      },
      actionLog: [
        ...state.actionLog,
        `${player} salvaged ${targetCard.card.name} from graveyard to battle zone.`
      ]
    };
  }

  return state;
}

/**
 * Dispatches Come-Into-Play (CIP) creature effects when a creature enters the battle zone:
 * - Card Draw: Aqua Hulcus, Magris, Illusionary Merfolk, King Ripped-Hide, or draw regex.
 * - Mana Ramp: Bronze-Arm Tribe, Torcon, or mana ramp regex.
 * - Discard: Masked Horror or discard regex.
 * - Shield Actions: Sven, Fortress Shell, Aqua Patrol.
 * - Tapping Opponent Creature: Miele, Kolon, or tap regex.
 * - Bouncing Creature: Aqua Surfer, Aqua Sniper, Corile, Unicorn Fish, or bounce regex.
 * - Deck Search: Rayla or spell search regex.
 * - Graveyard Salvage: Gigargon or graveyard salvage regex.
 * - Pure and immutable.
 */
export function triggerCIP(
  state: GameState,
  player: PlayerId,
  creature: CreatureInstance,
  targets?: string[]
): GameState {
  const card = creature.card;
  const cardName = card.name.toLowerCase().trim();
  const rules = card.rulesText || '';
  const opponent: PlayerId = player === 'player' ? 'opponent' : 'player';

  // 0. Survivor Come-Into-Play Abilities
  if (isSurvivor(card)) {
    let survivorState = state;
    const friendlyBZ = state.players[player].battleZone;

    // Q-tronic Hypermind: draw 1 card for each Survivor in battle zone
    if (cardName.includes('q-tronic hypermind')) {
      const allSurvivors = [
        ...survivorState.players.player.battleZone,
        ...survivorState.players.opponent.battleZone
      ].filter((c) => isSurvivor(c.card));
      const drawCount = allSurvivors.length;
      if (drawCount > 0) {
        survivorState = drawCards(survivorState, player, drawCount);
      }
    }

    // Ripple Lotus Q: tap an opponent creature
    const hasRippleLotus = friendlyBZ.some(
      (c) =>
        c.card.name.toLowerCase().includes('ripple lotus') ||
        (isSurvivor(c.card) && /tap it/i.test(c.card.rulesText || ''))
    );
    if (hasRippleLotus) {
      const oppBZ = survivorState.players[opponent].battleZone;
      if (oppBZ.length > 0) {
        let targetId: string | undefined;
        if (targets && targets.length > 0) {
          const exists = oppBZ.some((c) => c.instanceId === targets[0]);
          if (exists) {
            targetId = targets[0];
          }
        }
        if (!targetId) {
          const untapped = oppBZ.find((c) => !c.isTapped);
          targetId = untapped?.instanceId || oppBZ[0].instanceId;
        }

        const updatedOppBZ = oppBZ.map((c) =>
          c.instanceId === targetId ? { ...c, isTapped: true } : c
        );
        const targetCreature = oppBZ.find((c) => c.instanceId === targetId);

        survivorState = {
          ...survivorState,
          players: {
            ...survivorState.players,
            [opponent]: {
              ...survivorState.players[opponent],
              battleZone: updatedOppBZ
            }
          },
          actionLog: [
            ...survivorState.actionLog,
            `${player} tapped ${targetCreature?.card.name ?? 'opponent creature'} with Survivor ability.`
          ]
        };
      }
    }

    // Forbos, Sanctum Guardian Q: search deck for a spell to hand
    const hasForbos = friendlyBZ.some(
      (c) =>
        c.card.name.toLowerCase().includes('forbos') ||
        (isSurvivor(c.card) && /take a spell from your deck/i.test(c.card.rulesText || ''))
    );
    if (hasForbos) {
      survivorState = searchDeckForCard(survivorState, player, (c) => c.type === 'Spell', 'hand');
    }

    // Grave Worm Q: salvage a Survivor from graveyard to hand
    const hasGraveWorm = friendlyBZ.some(
      (c) =>
        c.card.name.toLowerCase().includes('grave worm') ||
        (isSurvivor(c.card) && /return a survivor from your graveyard/i.test(c.card.rulesText || ''))
    );
    if (hasGraveWorm) {
      survivorState = salvageFromGraveyard(survivorState, player, (c) => isSurvivor(c), 'hand');
    }

    // Factory Shell Q: search deck for a Survivor to hand
    const hasFactoryShell = friendlyBZ.some(
      (c) =>
        c.card.name.toLowerCase().includes('factory shell') ||
        (isSurvivor(c.card) && /take a survivor from your deck/i.test(c.card.rulesText || ''))
    );
    if (hasFactoryShell) {
      survivorState = searchDeckForCard(survivorState, player, (c) => isSurvivor(c), 'hand');
    }

    if (
      cardName.includes('q-tronic hypermind') ||
      hasRippleLotus ||
      hasForbos ||
      hasGraveWorm ||
      hasFactoryShell
    ) {
      return survivorState;
    }
  }

  // 1. Bouncing Creature CIP Effect
  // Aqua Surfer, Aqua Sniper, Corile, Unicorn Fish, or matching rules text
  const bounceMatch = rules.match(
    /when you put this creature into the battle zone.*return (?:a|one|up to (\d+)|(\d+)) creatures? .* to (?:its|their) owner's hand/i
  );
  if (
    cardName.includes('aqua surfer') ||
    cardName.includes('aqua sniper') ||
    cardName.includes('corile') ||
    cardName.includes('unicorn fish') ||
    Boolean(bounceMatch)
  ) {
    let bounceCount = 1;
    if (cardName.includes('aqua sniper') || (bounceMatch && (bounceMatch[1] === '2' || bounceMatch[2] === '2'))) {
      bounceCount = 2;
    }

    let targetsToBounce: string[] = [];
    if (targets && targets.length > 0) {
      targetsToBounce = targets.slice(0, bounceCount);
    } else {
      // Opponent's highest power creature if no target specified
      const opponentBZ = state.players[opponent].battleZone;
      if (opponentBZ.length > 0) {
        const sorted = [...opponentBZ].sort(
          (a, b) =>
            (b.card.power ?? 0) + b.powerModifier - ((a.card.power ?? 0) + a.powerModifier)
        );
        targetsToBounce = sorted.slice(0, bounceCount).map((c) => c.instanceId);
      }
    }

    let nextState = state;
    for (const tid of targetsToBounce) {
      nextState = bounceCreature(nextState, tid);
    }
    return nextState;
  }

  // 2. Tapping Opponent Creature CIP Effect
  // Miele, Vizier of Lightning, Kolon, the Oracle, or matching rules text
  const tapMatch = rules.match(
    /when you put this creature into the battle zone.*tap (?:1|one) of your opponent's creatures/i
  ) || rules.match(
    /when you put this creature into the battle zone.*choose (?:1|one) of your opponent's creatures .* and tap it/i
  );
  if (
    cardName.includes('miele') ||
    cardName.includes('kolon') ||
    Boolean(tapMatch)
  ) {
    const opponentBZ = state.players[opponent].battleZone;
    if (opponentBZ.length === 0) {
      return state;
    }

    let targetId: string | undefined;
    if (targets && targets.length > 0) {
      const exists = opponentBZ.some((c) => c.instanceId === targets[0]);
      if (exists) {
        targetId = targets[0];
      }
    }

    if (!targetId) {
      const untapped = opponentBZ.find((c) => !c.isTapped);
      targetId = untapped?.instanceId || opponentBZ[0].instanceId;
    }

    const updatedBZ = opponentBZ.map((c) =>
      c.instanceId === targetId ? { ...c, isTapped: true } : c
    );
    const targetCreature = opponentBZ.find((c) => c.instanceId === targetId);

    return {
      ...state,
      players: {
        ...state.players,
        [opponent]: {
          ...state.players[opponent],
          battleZone: updatedBZ
        }
      },
      actionLog: [
        ...state.actionLog,
        `${player} tapped ${targetCreature?.card.name ?? 'opponent creature'} with ${card.name}.`
      ]
    };
  }

  // 3. Shield Action CIP Effects
  // 3a. Fortress Shell: burns opponent shields directly to graveyard without triggering Shield Triggers
  const burnShieldMatch = rules.match(
    /choose up to (\d+) of your opponent's shields and put them into (?:his|their) graveyard/i
  );
  if (cardName.includes('fortress shell') || Boolean(burnShieldMatch)) {
    const count = burnShieldMatch ? parseInt(burnShieldMatch[1], 10) : 2;
    return destroyOpponentShields(state, player, count, targets);
  }

  // 3b. Aqua Patrol: returns an opponent shield to their deck and shuffles
  if (
    cardName.includes('aqua patrol') ||
    /choose (?:1|one) of your opponent's shields and put it into (?:his|their) deck/i.test(rules)
  ) {
    const oppShields = state.players[opponent].shields.filter((s) => !s.isBroken);
    if (oppShields.length === 0) {
      return state;
    }
    const targetShield =
      targets && targets.length > 0
        ? oppShields.find((s) => s.id === targets[0] || s.shieldId === targets[0]) || oppShields[0]
        : oppShields[0];

    const nextShields = state.players[opponent].shields.filter((s) => s.id !== targetShield.id);
    const deckCard: CardInstance = {
      instanceId: targetShield.id,
      card: targetShield.card,
      owner: opponent
    };

    return {
      ...state,
      players: {
        ...state.players,
        [opponent]: {
          ...state.players[opponent],
          shields: nextShields,
          deck: [...state.players[opponent].deck, deckCard]
        }
      },
      actionLog: [
        ...state.actionLog,
        `${player} returned an opponent shield to their deck with ${card.name}.`
      ]
    };
  }

  // 3c. Sven, the Explorer or add top card of deck to shields
  if (
    cardName.includes('sven') ||
    /when you put this creature into the battle zone.*add the top card of your deck to your shields/i.test(
      rules
    )
  ) {
    return addShieldFromDeck(state, player, 1);
  }

  // 4. Mana Ramp CIP Effect
  // Bronze-Arm Tribe, Torcon, or matching rules text
  if (
    cardName.includes('bronze-arm tribe') ||
    cardName.includes('torcon') ||
    /when you put this creature into the battle zone.*put the top card of your deck into your mana zone/i.test(
      rules
    )
  ) {
    return rampTopDeckToManaZone(state, player, 1);
  }

  // 5. Card Draw CIP Effect
  // 5a. Illusionary Merfolk: if player controls another Cyber Lord draw 3, else draw 1
  if (cardName.includes('illusionary merfolk')) {
    const friendlyBZ = state.players[player].battleZone;
    const hasOtherCyberLord = friendlyBZ.some(
      (c) =>
        c.instanceId !== creature.instanceId &&
        c.card.races?.some((r) => r.toLowerCase().includes('cyber lord'))
    );
    const count = hasOtherCyberLord ? 3 : 1;
    return drawCards(state, player, count);
  }

  // 5b. Aqua Hulcus, Magris, King Ripped-Hide, or generic draw CIP
  const drawCIPMatch = rules.match(
    /when you put this creature into the battle zone.*draw (?:up to )?(?:a|1|(\d+)) cards?/i
  );
  if (
    cardName.includes('aqua hulcus') ||
    cardName.includes('magris') ||
    cardName.includes('king ripped-hide') ||
    Boolean(drawCIPMatch)
  ) {
    let count = 1;
    if (cardName.includes('king ripped-hide')) {
      count = 2;
    } else if (drawCIPMatch?.[1]) {
      count = parseInt(drawCIPMatch[1], 10);
    }
    return drawCards(state, player, count);
  }

  // 6. Masked Horror or generic CIP Discard Effect
  if (
    cardName.includes('masked horror') ||
    (/when you put this creature into the battle zone/i.test(rules) &&
      /opponent discards (?:a|1|(\d+)) cards? at random/i.test(rules)) ||
    (/when you put this creature into the battle zone/i.test(rules) &&
      /opponent discards a card at random/i.test(rules))
  ) {
    const discardMatch = rules.match(/opponent discards (?:a|1|(\d+)) cards? at random/i);
    const count = discardMatch?.[1] ? parseInt(discardMatch[1], 10) : 1;
    return discardRandomHandCards(state, opponent, count);
  }

  // 7. Rayla, Truth Enforcer (Search Deck for Spell)
  if (
    cardName.includes('rayla') ||
    (/when you put this creature into the battle zone.*search your deck/i.test(rules) &&
      /take a spell from your deck/i.test(rules))
  ) {
    return searchDeckForCard(state, player, (c) => c.type === 'Spell', 'hand');
  }

  // 8. Gigargon (Graveyard Salvage for Creatures)
  if (
    cardName.includes('gigargon') ||
    /when you put this creature into the battle zone.*return up to (\d+) creatures from your graveyard to your hand/i.test(
      rules
    )
  ) {
    const salvageMatch = rules.match(/return up to (\d+) creatures from your graveyard to your hand/i);
    const salvageCount = salvageMatch ? parseInt(salvageMatch[1], 10) : 2;
    let nextState = state;
    for (let i = 0; i < salvageCount; i++) {
      const graveCreatures = nextState.players[player].graveyard.filter(
        (ci) => ci.card.type === 'Creature' || ci.card.type === 'Evolution Creature'
      );
      if (graveCreatures.length === 0) break;
      nextState = salvageFromGraveyard(
        nextState,
        player,
        (c) => c.type === 'Creature' || c.type === 'Evolution Creature',
        'hand'
      );
    }
    return nextState;
  }

  return state;
}

/**
 * Dispatches end-of-turn abilities for creatures in the active player's battle zone:
 * 1. Untap vigilance: Frei, Vizier of Air, Urth, Ruby Grass, Ballus, Betrale, Lukia Lex, Nial, Toel, etc.
 * 2. Self-sacrifice / destruction: creatures destroyed at the end of the turn.
 * 3. Self-bounce: creatures returned to hand at the end of the turn.
 * 4. Resets temporary power attacker bonuses and power modifiers.
 * - Pure and immutable.
 */
export function triggerEndTurn(state: GameState, activePlayer: PlayerId): GameState {
  if (state.winner !== null) {
    return state;
  }

  const activeState = state.players[activePlayer];
  const untapLogs: string[] = [];
  const destroyLogs: string[] = [];
  const bounceLogs: string[] = [];

  // Check for whole-board untap effect (e.g. Toel, Vizier of Hope)
  const hasMassUntap = activeState.battleZone.some((c) => {
    const rules = c.card.rulesText || '';
    return /at the end of (?:each of )?your turns?, (?:you may )?untap all your creatures/i.test(rules);
  });

  const remainingBattleZone: CreatureInstance[] = [];
  const destroyedCards: CardInstance[] = [];
  const bouncedCards: CardInstance[] = [];

  for (const creature of activeState.battleZone) {
    const rules = creature.card.rulesText || '';
    const nameLower = creature.card.name.toLowerCase();

    // Check self-sacrifice at end of turn
    const isSelfSacrifice =
      /at the end of (?:each of )?your turns?, destroy this creature/i.test(rules) ||
      /at the end of (?:the|this) turn, destroy this creature/i.test(rules);

    if (isSelfSacrifice) {
      destroyLogs.push(`${creature.card.name} was destroyed at the end of the turn.`);
      destroyedCards.push(
        {
          instanceId: creature.instanceId,
          card: creature.card,
          owner: activePlayer
        },
        ...(creature.evolvedOn || [])
      );
      continue;
    }

    // Check self-bounce at end of turn
    const isSelfBounce =
      /at the end of (?:each of )?your turns?.*return this creature to (?:your|its owner's) hand/i.test(rules) ||
      /at the end of (?:the|this) turn, return this creature to your hand/i.test(rules);

    if (isSelfBounce) {
      bounceLogs.push(`${creature.card.name} returned to hand at the end of the turn.`);
      bouncedCards.push(
        {
          instanceId: creature.instanceId,
          card: creature.card,
          owner: activePlayer
        },
        ...(creature.evolvedOn || [])
      );
      continue;
    }

    // Check untap vigilance
    let isTapped = creature.isTapped;
    if (isTapped) {
      const survivorAbilities = getSurvivorSharedAbilities(activeState.battleZone);
      const hasSurvivorUntap = isSurvivor(creature.card) && survivorAbilities.hasUntapAtEndTurn;

      const hasUntapVigilance =
        hasMassUntap ||
        hasSurvivorUntap ||
        nameLower.includes('urth') ||
        nameLower.includes('frei') ||
        nameLower.includes('ruby grass') ||
        nameLower.includes('ballus') ||
        nameLower.includes('betrale') ||
        nameLower.includes('lukia lex') ||
        nameLower.includes('nial') ||
        /at the end of (?:each of )?your turns?, (?:you may )?untap this creature/i.test(rules);

      if (hasUntapVigilance) {
        untapLogs.push(`${creature.card.name} untapped at the end of the turn.`);
        isTapped = false;
      }
    }

    remainingBattleZone.push({
      ...creature,
      isTapped,
      tempPowerAttackerBonus: 0,
      powerModifier: 0
    });
  }

  // Reset temporary bonuses on opponent's creatures as well
  const opponentId: PlayerId = activePlayer === 'player' ? 'opponent' : 'player';
  const opponentState = state.players[opponentId];
  const resetOpponentBZ = opponentState.battleZone.map((c) => ({
    ...c,
    tempPowerAttackerBonus: 0,
    powerModifier: 0
  }));

  const updatedActivePlayerState = {
    ...activeState,
    battleZone: remainingBattleZone,
    hand: [...activeState.hand, ...bouncedCards],
    graveyard: [...activeState.graveyard, ...destroyedCards]
  };

  return {
    ...state,
    players: {
      ...state.players,
      [activePlayer]: updatedActivePlayerState,
      [opponentId]: {
        ...opponentState,
        battleZone: resetOpponentBZ
      }
    },
    actionLog: [
      ...state.actionLog,
      ...untapLogs,
      ...destroyLogs,
      ...bounceLogs
    ]
  };
}

/**
 * Checks whether an attacker has Stealth (Light, Water, Darkness, Fire, Nature)
 * that is currently active against the opponent's mana zone:
 * - If the attacker has "<Civ> stealth" and opponent has at least one card of <Civ>
 *   in their mana zone, the attacker cannot be blocked.
 * - Pure helper.
 */
export function checkStealth(
  attacker: CreatureInstance,
  defenderManaZone: ManaCardInstance[]
): boolean {
  const rules = attacker?.card?.rulesText || '';
  if (!rules || !defenderManaZone || defenderManaZone.length === 0) {
    return false;
  }

  const stealthRegex = /([A-Za-z]+)\s+stealth/gi;
  let match: RegExpExecArray | null;

  while ((match = stealthRegex.exec(rules)) !== null) {
    const civ = match[1].toLowerCase();
    const hasCivInMana = defenderManaZone.some((manaCard) =>
      (manaCard.card.civilizations || []).some(
        (c) => c.toLowerCase() === civ
      )
    );
    if (hasCivInMana) {
      return true;
    }
  }

  return false;
}

/**
 * Checks whether an attacking creature cannot be blocked:
 * - Card rules text ("can't be blocked", "while attacking a creature...").
 * - Civilization stealth against defending player's mana zone.
 * - Survivor shared ability: Spikestrike Ichthys Q.
 * - Multi-civ aura: Hydrooze, the Mutant Emperor ("Your Cyber Lords or Hedrians can't be blocked").
 */
export function isCreatureUnblockable(
  attacker: CreatureInstance,
  target: AttackTarget,
  defendingManaZone: ManaCardInstance[] = [],
  friendlyBattleZone: CreatureInstance[] = []
): boolean {
  const cleanRules = (attacker?.card?.rulesText || '').replace(/\([^)]*\)/g, '');
  const isUnconditionallyUnblockable = /(?:this creature|it)\s+can't be blocked(?!\s+by|\s+while)/i.test(cleanRules);
  const isAttackingCreatureUnblockable =
    target.type === 'creature' &&
    /while attacking a creature, this creature can't be blocked/i.test(cleanRules);
  const isStealthActive = checkStealth(attacker, defendingManaZone);

  if (isUnconditionallyUnblockable || isAttackingCreatureUnblockable || isStealthActive) {
    return true;
  }

  // Survivor ability: Spikestrike Ichthys Q
  if (isSurvivor(attacker.card)) {
    const abilities = getSurvivorSharedAbilities(friendlyBattleZone);
    if (abilities.isUnblockable) {
      return true;
    }
  }

  // Hydrooze, the Mutant Emperor: "Your Cyber Lords or Hedrians can't be blocked."
  const races = attacker.card.races || ((attacker.card as any).race ? [(attacker.card as any).race] : []);
  const isCyberLordOrHedrian = races.some((r: string) => /cyber lord|hedrian/i.test(r));
  if (isCyberLordOrHedrian) {
    const hasHydrooze = friendlyBattleZone.some((c) =>
      c.card.name.toLowerCase().includes('hydrooze')
    );
    if (hasHydrooze) {
      return true;
    }
  }

  return false;
}

/**
 * Checks whether an attacker can attack untapped opponent creatures:
 * - Matches civilization-specific ability: "This creature can attack untapped <civ> creatures"
 * - Pure helper.
 */
export function canCreatureAttackUntapped(
  attacker: CreatureInstance,
  targetCreature?: CreatureInstance
): boolean {
  const rules = attacker?.card?.rulesText || '';
  if (!rules) return false;

  // General untapped attack ability
  if (/can attack untapped creatures/i.test(rules)) {
    return true;
  }

  // Civ-specific untapped attack ability
  const civMatch = rules.match(/can attack untapped ([a-z]+) creatures/i);
  if (civMatch) {
    if (!targetCreature) {
      return true;
    }
    const reqCiv = civMatch[1].toLowerCase();
    return (targetCreature.card.civilizations || []).some(
      (c) => c.toLowerCase() === reqCiv
    );
  }

  // General fallback
  if (/can attack untapped/i.test(rules)) {
    return true;
  }

  return false;
}

/**
 * Dispatches on-attack abilities ("Whenever this creature attacks..."):
 * 1. Card draw: Snarling Net, Armored Transport Galiac, Hypersquid Walter, or draw regex.
 * 2. Opponent discard: Gregoria, Gigamantis, or discard regex.
 * 3. Add to shields: Cosmic Wing or shield add regex.
 * 4. Creature destruction: blocker destruction or power-based destruction (Muramasa, Valdios, Skyterror).
 * 5. Tapping opponent creature: Le Quist or tap regex.
 * 6. Power buffs: on-attack power buffs (powerModifier).
 * 7. Mana ramp / mana return: ramp or return mana to hand (Bloodwing Mantis).
 * - Pure and immutable.
 */
export function triggerAttack(
  state: GameState,
  player: PlayerId,
  attacker: CreatureInstance,
  target: AttackTarget
): GameState {
  if (state.winner !== null) {
    return state;
  }

  const rules = attacker.card.rulesText || '';
  const nameLower = attacker.card.name.toLowerCase();
  const opponent: PlayerId = player === 'player' ? 'opponent' : 'player';

  let nextState = state;

  // 1. On-Attack Card Draw
  // e.g. "Whenever this creature attacks, you may draw a card"
  // e.g. Snarling Net, Armored Transport Galiac, Hypersquid Walter
  const drawMatch = rules.match(
    /whenever this creature attacks.*(?:you may )?draw (?:up to )?(?:a|1|(\d+)) cards?/i
  );
  if (
    nameLower.includes('snarling net') ||
    (nameLower.includes('galiac') && /draw/i.test(rules)) ||
    nameLower.includes('hypersquid walter') ||
    Boolean(drawMatch)
  ) {
    let drawCount = 1;
    if (drawMatch?.[1]) {
      drawCount = parseInt(drawMatch[1], 10);
    }
    nextState = drawCards(nextState, player, drawCount);
  }

  // 2. On-Attack Opponent Discard
  // e.g. "Whenever this creature attacks, your opponent discards a card at random from his hand"
  // e.g. Gregoria, Gigamantis
  const discardMatch =
    rules.match(
      /whenever this creature attacks.*(?:your )?opponent discards (?:a|1|(\d+)) cards?(?: at random)?/i
    ) || rules.match(/whenever this creature attacks.*opponent discards a card/i);
  if (
    nameLower.includes('gregoria') ||
    nameLower.includes('gigamantis') ||
    Boolean(discardMatch)
  ) {
    let discardCount = 1;
    if (discardMatch?.[1]) {
      discardCount = parseInt(discardMatch[1], 10);
    }
    nextState = discardRandomHandCards(nextState, opponent, discardCount);
  }

  // 2b. Survivor Attack Triggers (Split-Head Hydroturtle Q & Skullsweeper Q)
  if (isSurvivor(attacker.card)) {
    const friendlyBZ = state.players[player].battleZone;
    const survivorAbilities = getSurvivorSharedAbilities(friendlyBZ);

    if (survivorAbilities.hasAttackDraw) {
      const alreadyDrawn =
        Boolean(drawMatch) ||
        nameLower.includes('snarling net') ||
        nameLower.includes('hypersquid walter') ||
        (nameLower.includes('galiac') && /draw/i.test(rules));
      if (!alreadyDrawn) {
        nextState = drawCards(nextState, player, 1);
      }
    }

    if (survivorAbilities.hasAttackDiscard) {
      const alreadyDiscarded =
        Boolean(discardMatch) ||
        nameLower.includes('gregoria') ||
        nameLower.includes('gigamantis');
      if (!alreadyDiscarded) {
        nextState = discardRandomHandCards(nextState, opponent, 1);
      }
    }
  }

  // 3. On-Attack Shield Add
  // e.g. "Whenever this creature attacks, you may add the top card of your deck to your shields"
  // e.g. Cosmic Wing
  if (
    nameLower.includes('cosmic wing') ||
    /whenever this creature attacks.*add the top card of your deck to your shields/i.test(rules)
  ) {
    nextState = addShieldFromDeck(nextState, player, 1);
  }

  // 4. On-Attack Destruction
  // 4a. Blocker destruction:
  // e.g. "Whenever this creature attacks, you may destroy one of your opponent's creatures that has 'blocker'."
  const destroyBlockerMatch = rules.match(
    /whenever this creature attacks.*destroy (?:one|1) of your opponent's creatures that has ["']?blocker["']?/i
  );
  if (destroyBlockerMatch) {
    const oppBlockers = nextState.players[opponent].battleZone.filter(
      (c) => c.card.isBlocker
    );
    if (oppBlockers.length > 0) {
      const sorted = [...oppBlockers].sort(
        (a, b) =>
          (b.card.power ?? 0) + b.powerModifier - ((a.card.power ?? 0) + a.powerModifier)
      );
      nextState = destroyCreature(nextState, sorted[0].instanceId);
    }
  }

  // 4b. Power-based destruction:
  // e.g. "Whenever this creature attacks, you may destroy one of your opponent's creatures with power 2000 or less"
  // e.g. "Whenever this creature attacks, you may destroy one of your opponent's creatures that has power 2000 or less"
  // e.g. Armored Blaster Valdios, Gatling Skyterror (if rules contain destruction)
  const destroyPowerMatch = rules.match(
    /whenever this creature attacks.*destroy (?:one|1) of your opponent's creatures (?:that has|with) power (\d+) or less/i
  );
  if (
    destroyPowerMatch ||
    (nameLower.includes('valdios') && /destroy/i.test(rules)) ||
    (nameLower.includes('gatling skyterror') && /destroy/i.test(rules))
  ) {
    const maxPower = destroyPowerMatch ? parseInt(destroyPowerMatch[1], 10) : 2000;
    const validOpponents = nextState.players[opponent].battleZone.filter(
      (c) => (c.card.power ?? 0) + c.powerModifier <= maxPower
    );
    if (validOpponents.length > 0) {
      const sorted = [...validOpponents].sort(
        (a, b) =>
          (b.card.power ?? 0) + b.powerModifier - ((a.card.power ?? 0) + a.powerModifier)
      );
      nextState = destroyCreature(nextState, sorted[0].instanceId);
    }
  }

  // 5. On-Attack Tapping Opponent Creature
  // e.g. "Whenever this creature attacks, tap one of your opponent's creatures"
  // e.g. "Whenever this creature attacks, you may choose a darkness or fire creature in the battle zone and tap it"
  const tapOnAttackMatch = rules.match(
    /whenever this creature attacks.*(?:tap (?:one|1) of your opponent's creatures|choose (?:a|an|one|1) .*creature .* and tap it)/i
  );
  if (tapOnAttackMatch) {
    const oppBZ = nextState.players[opponent].battleZone;
    const untapped = oppBZ.filter((c) => !c.isTapped);
    if (untapped.length > 0) {
      let candidates = untapped;
      if (/darkness or fire/i.test(rules)) {
        candidates = untapped.filter((c) =>
          (c.card.civilizations || []).some(
            (civ) => civ === 'Darkness' || civ === 'Fire'
          )
        );
      }
      if (candidates.length > 0) {
        const targetToTap = candidates[0];
        const updatedBZ = oppBZ.map((c) =>
          c.instanceId === targetToTap.instanceId ? { ...c, isTapped: true } : c
        );
        nextState = {
          ...nextState,
          players: {
            ...nextState.players,
            [opponent]: {
              ...nextState.players[opponent],
              battleZone: updatedBZ
            }
          },
          actionLog: [
            ...nextState.actionLog,
            `${attacker.card.name} tapped ${targetToTap.card.name} on attack.`
          ]
        };
      }
    }
  }

  // 6. On-Attack Power Buff
  // e.g. "Whenever this creature attacks, this creature gets +2000 power until the end of the turn"
  // e.g. "Whenever this creature attacks a creature, this creature gets +3000 power until the end of the turn"
  // e.g. "Whenever this creature attacks, it gets 'power attacker +3000' until the end of the turn"
  const powerMatch =
    rules.match(
      /whenever this creature attacks(?: a creature)?.*(?:this creature|it) gets \+(\d+) power/i
    ) ||
    rules.match(
      /whenever this creature attacks(?: a creature)?.*(?:this creature|it) gets ["']?power attacker \+(\d+)["']?/i
    );
  if (powerMatch) {
    const isAttackingCreatureOnly = /attacks a creature/i.test(powerMatch[0]);
    if (!isAttackingCreatureOnly || target.type === 'creature') {
      const buff = parseInt(powerMatch[1], 10);
      const curBZ = nextState.players[player].battleZone;
      const updatedBZ = curBZ.map((c) =>
        c.instanceId === attacker.instanceId
          ? {
              ...c,
              powerModifier: (c.powerModifier || 0) + buff
            }
          : c
      );
      nextState = {
        ...nextState,
        players: {
          ...nextState.players,
          [player]: {
            ...nextState.players[player],
            battleZone: updatedBZ
          }
        },
        actionLog: [
          ...nextState.actionLog,
          `${attacker.card.name} gained +${buff} power on attack.`
        ]
      };
    }
  }

  // 7. On-Attack Mana Ramp
  // e.g. "Whenever this creature attacks, you may put the top card of your deck into your mana zone."
  if (/whenever this creature attacks.*put the top card of your deck into your mana zone/i.test(rules)) {
    nextState = rampTopDeckToManaZone(nextState, player, 1);
  }

  // 8. On-Attack Return Mana to Hand (e.g. Bloodwing Mantis)
  // e.g. "Whenever this creature attacks, return 2 creatures from your mana zone to your hand."
  const manaToHandMatch = rules.match(
    /whenever this creature attacks.*return (\d+) creatures? from your mana zone to your hand/i
  );
  if (manaToHandMatch) {
    const count = parseInt(manaToHandMatch[1], 10);
    const playerMana = nextState.players[player].manaZone;
    const creatureCardsInMana = playerMana.filter(
      (m) => m.card.type === 'Creature' || m.card.type === 'Evolution Creature'
    );
    const toReturn = creatureCardsInMana.slice(0, count);
    if (toReturn.length > 0) {
      const returnIds = new Set(toReturn.map((m) => m.instanceId));
      const nextMana = playerMana.filter((m) => !returnIds.has(m.instanceId));
      const handAdditions: CardInstance[] = toReturn.map((m) => ({
        instanceId: m.instanceId,
        card: m.card,
        owner: player
      }));
      nextState = {
        ...nextState,
        players: {
          ...nextState.players,
          [player]: {
            ...nextState.players[player],
            manaZone: nextMana,
            hand: [...nextState.players[player].hand, ...handAdditions]
          }
        },
        actionLog: [
          ...nextState.actionLog,
          `${attacker.card.name} returned ${toReturn.map((m) => m.card.name).join(', ')} from mana zone to hand.`
        ]
      };
    }
  }

  return nextState;
}
