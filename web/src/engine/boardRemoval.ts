import type { CardDefinition } from '../types/card.ts';
import type {
  CardInstance,
  CreatureInstance,
  GameState,
  ManaCardInstance,
  PlayerId,
  ShieldInstance
} from './types.ts';
import {
  getCardCapabilities,
  getCardCivilizations,
  getCreatureRaces,
  getOpponentId,
  isSurvivorCard,
  normalizeRace
} from './cardUtils.ts';
import { isMultiCivilization, toManaCard } from './mana.ts';
import { isWaveStrikerConditionMet } from './continuous.ts';
import { buildZoneOptions, enqueueInteraction } from './interactionHelpers.ts';
import {
  findSaverInBattleZone,
  flattenEvolutionStack,
  hasLeaveSubstitution,
  separateEvolutionUnderlyingCreatures
} from './replacements.ts';
import {
  discardRandomHandCards,
  drawCards,
  findCreature,
  makeShieldId,
  salvageFromGraveyard
} from './zoneOps.ts';

function isMultiCiv(c: CardDefinition): boolean {
  return isMultiCivilization(c);
}

/**
 * Triggers "When this creature leaves the battle zone" effects (DM-12 Vortex Phoenixes, etc.),
 * fired uniformly whether the creature was destroyed, bounced, sent to mana, put on deck, or shielded!
 */
export function triggerLeavesBattleZone(
  state: GameState,
  owner: PlayerId,
  creature: CreatureInstance
): GameState {
  if (Boolean(state.winner)) {
    return state;
  }

  const opponent = getOpponentId(owner);
  const rules = creature.card.rulesText || '';
  const cardName = getCardCapabilities(creature.card).nameLower;
  let nextState = state;

  // Death Phoenix, Avatar of Doom: "When this creature leaves the Battle Zone, your opponent discards his hand."
  if (
    cardName.includes('death phoenix') ||
    /leaves the battle zone.*(?:your |you )?opponent discards (?:his|their) hand/i.test(rules)
  ) {
    const opp = nextState.players[opponent];
    if (opp.hand.length > 0) {
      nextState = {
        ...nextState,
        players: {
          ...nextState.players,
          [opponent]: {
            ...opp,
            hand: [],
            graveyard: [...opp.graveyard, ...opp.hand]
          }
        },
        actionLog: [
          ...nextState.actionLog,
          `Death Phoenix triggered: ${opponent} discarded their entire hand to the graveyard!`
        ]
      };
    }
  }

  // Cruel Naga, Avatar of Fate: "When this creature leaves the battle Zone, destroy all creatures in the battle Zone."
  if (
    cardName.includes('cruel naga') ||
    /leaves the battle zone.*destroy all creatures in the battle zone/i.test(rules)
  ) {
    const allIds = [
      ...nextState.players.player.battleZone.map((c) => c.instanceId),
      ...nextState.players.opponent.battleZone.map((c) => c.instanceId)
    ];
    if (allIds.length > 0) {
      nextState = destroyCreaturesBatch(nextState, allIds);
      nextState = {
        ...nextState,
        actionLog: [
          ...nextState.actionLog,
          `Cruel Naga's effect triggered: all creatures in the battle zone were destroyed!`
        ]
      };
    }
  }

  // Wise Starnoid, Avatar of Hope: "Whenever this creature attacks or leaves the battle zone, add the card on top of your deck to your shields face-down."
  if (
    cardName.includes('wise starnoid') ||
    /leaves the battle zone.*add the card on top of your deck to your shields/i.test(rules)
  ) {
    const p = nextState.players[owner];
    if (p.deck.length > 0) {
      const [topCard, ...restDeck] = p.deck;
      const newShield: ShieldInstance = {
        id: topCard.instanceId,
        shieldId: topCard.instanceId,
        card: topCard.card,
        isBroken: false
      };
      nextState = {
        ...nextState,
        players: {
          ...nextState.players,
          [owner]: {
            ...p,
            deck: restDeck,
            shields: [...p.shields, newShield]
          }
        },
        actionLog: [
          ...nextState.actionLog,
          `Wise Starnoid's effect triggered: added top card of deck to shields face-down!`
        ]
      };
    }
  }

  // Aura Pegasus, Avatar of Life: "Whenever this creature attacks or leaves the battle zone, reveal the top card of your deck. If it's a non-evolution creature, put it into battle zone. Otherwise, put it to your hand."
  if (
    cardName.includes('aura pegasus') ||
    /leaves the battle zone.*reveal the top card of your deck/i.test(rules)
  ) {
    nextState = resolveAuraPegasusTopDeckReveal(nextState, owner);
  }

  return nextState;
}

/**
 * Shared helper for Aura Pegasus reveal-top-card (non-evolution creature -> BZ, else -> hand).
 */
export function resolveAuraPegasusTopDeckReveal(state: GameState, player: PlayerId): GameState {
  const p = state.players[player];
  if (p.deck.length === 0) return state;

  const [topCard, ...restDeck] = p.deck;
  const isNonEvoCreature = topCard.card.type === 'Creature' && !topCard.card.isEvolution;

  if (isNonEvoCreature) {
    const newCreature: CreatureInstance = {
      instanceId: topCard.instanceId,
      card: topCard.card,
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
          ...p,
          deck: restDeck,
          battleZone: [...p.battleZone, newCreature]
        }
      },
      actionLog: [
        ...state.actionLog,
        `Aura Pegasus revealed ${topCard.card.name} (non-evolution creature) and put it into the battle zone!`
      ]
    };
  }

  return {
    ...state,
    players: {
      ...state.players,
      [player]: {
        ...p,
        deck: restDeck,
        hand: [...p.hand, topCard]
      }
    },
    actionLog: [
      ...state.actionLog,
      `Aura Pegasus revealed ${topCard.card.name} and put it into ${player}'s hand.`
    ]
  };
}

/**
 * Triggers "When this creature is destroyed" abilities AND board watchers like
 * Mongrel Man ("Whenever another creature is destroyed, you may draw a card"),
 * Simian Warrior Grash, and Slash and Burn.
 */
export function triggerDestroyed(
  state: GameState,
  owner: PlayerId,
  creature: CreatureInstance
): GameState {
  if (Boolean(state.winner)) {
    return state;
  }

  const opponent = getOpponentId(owner);
  const rules = creature.card.rulesText || '';
  const cardName = getCardCapabilities(creature.card).nameLower.trim();

  // First fire leave-battle-zone abilities (e.g. Death Phoenix, Cruel Naga, Wise Starnoid, Aura Pegasus)
  let nextState = triggerLeavesBattleZone(state, owner, creature);

  // 1. Hand Discard on Destruction
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
  } else if (
    /when(?:ever)? this creature is destroyed, each player discards (?:his|their) hand/i.test(rules)
  ) {
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

  // 2. Card Draw on Destruction (Cetibols, Phantasmal Horror Gigazal, Aqua Deformer)
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
    if (owner === 'player' && nextState.interactiveHuman && /you may draw/i.test(rules) && nextState.players[owner].deck.length > 0) {
      nextState = enqueueInteraction(nextState, {
        type: 'OPTIONAL_CHOICE',
        player: 'player',
        sourceCardId: creature.card.id,
        sourceInstanceId: creature.instanceId,
        abilityName: creature.card.name,
        effectType: 'DRAW',
        drawCount: count,
        prompt: `${creature.card.name} was destroyed. Draw ${count} card(s)?`
      });
    } else {
      nextState = drawCards(nextState, owner, count);
    }
  }

  // 3. Chain Destruction on Death (Stallob, Damudo, destroy 1 opponent creature)
  if (
    /when(?:ever)? this creature is destroyed.*destroy all creatures/i.test(rules) ||
    cardName.includes('stallob')
  ) {
    const allIds = [
      ...nextState.players.player.battleZone.map((c) => c.instanceId),
      ...nextState.players.opponent.battleZone.map((c) => c.instanceId)
    ];
    nextState = destroyCreaturesBatch(nextState, allIds);
  } else if (
    /when(?:ever)? this creature is destroyed.*destroy all creatures that have power (\d+) or less/i.test(rules) ||
    cardName.includes('damudo')
  ) {
    const powerMatch = rules.match(/power (\d+) or less/i);
    const maxPower = powerMatch ? parseInt(powerMatch[1], 10) : 3000;
    const targets = [
      ...nextState.players.player.battleZone,
      ...nextState.players.opponent.battleZone
    ]
      .filter((c) => (c.card.power ?? 0) + c.powerModifier <= maxPower)
      .map((c) => c.instanceId);
    nextState = destroyCreaturesBatch(nextState, targets);
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

  // 4. Tap Opponent Creatures on Death (Jil Warka)
  const tapMatch = rules.match(
    /when(?:ever)? this creature is destroyed.*(?:choose up to (\d+) of your opponent's creatures .* and tap them|tap (?:up to (\d+) )?of your opponent's creatures)/i
  );
  if (tapMatch || cardName.includes('jil warka')) {
    const count =
      tapMatch && (tapMatch[1] || tapMatch[2]) ? parseInt(tapMatch[1] || tapMatch[2], 10) : 2;
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
            battleZone: oppBZ.map((c) =>
              tapIds.has(c.instanceId) ? { ...c, isTapped: true } : c
            )
          }
        },
        actionLog: [
          ...nextState.actionLog,
          `${creature.card.name}'s destruction effect tapped ${toTap.map((c) => c.card.name).join(', ')}.`
        ]
      };
    }
  }

  // 5. Mana Destruction on Death (Bombersaur, Engineer Kipo)
  if (
    /when(?:ever)? this creature is destroyed, each player (?:chooses|destroys) (\d+)?.*mana zone.*into (?:his|their) graveyard/i.test(
      rules
    ) ||
    cardName.includes('bombersaur') ||
    cardName.includes('engineer kipo')
  ) {
    const manaCount = cardName.includes('bombersaur') ? 2 : 1;
    for (const pid of ['player', 'opponent'] as const) {
      const pState = nextState.players[pid];
      if (pState.manaZone.length > 0) {
        if (pid === 'player' && nextState.interactiveHuman) {
          const manaOpts = buildZoneOptions(nextState, 'player', ['manaZone']);
          const pickCount = Math.min(manaCount, manaOpts.length);
          nextState = enqueueInteraction(nextState, {
            type: 'ZONE_SELECTION',
            player: 'player',
            sourceCardId: creature.card.id,
            sourceCardName: creature.card.name,
            actionKind: 'PLAYER_MANA_TO_GY',
            prompt: `${creature.card.name}: Choose ${pickCount} card(s) in your mana zone to put into your graveyard.`,
            options: manaOpts,
            minSelections: pickCount,
            maxSelections: pickCount
          });
        } else {
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
  }

  // 6. Graveyard Salvage on Death (Bat Doctor, Pharzi)
  if (
    /when(?:ever)? this creature is destroyed.*return (?:another )?creature from your graveyard to your hand/i.test(
      rules
    ) ||
    cardName.includes('bat doctor')
  ) {
    if (owner === 'player' && nextState.interactiveHuman) {
      const gyOpts = buildZoneOptions(
        nextState,
        'player',
        ['graveyard'],
        (o) =>
          o.instanceId !== creature.instanceId &&
          (o.card.type === 'Creature' || o.card.type === 'Evolution Creature')
      );
      if (gyOpts.length > 0) {
        nextState = enqueueInteraction(nextState, {
          type: 'ZONE_SELECTION',
          player: 'player',
          sourceCardId: creature.card.id,
          sourceCardName: creature.card.name,
          actionKind: 'PLAYER_SALVAGE_GY',
          prompt: `${creature.card.name}: Return a creature from your graveyard to your hand? (Optional)`,
          options: gyOpts,
          minSelections: 0,
          maxSelections: 1
        });
      }
    } else {
      nextState = salvageFromGraveyard(
        nextState,
        owner,
        (c) => (c.type === 'Creature' || c.type === 'Evolution Creature'),
        'hand',
        { pickMostRecent: true }
      );
    }
  } else if (
    /when(?:ever)? this creature is destroyed.*return a spell from your graveyard to your hand/i.test(
      rules
    ) ||
    cardName.includes('pharzi')
  ) {
    if (owner === 'player' && nextState.interactiveHuman) {
      const gyOpts = buildZoneOptions(nextState, 'player', ['graveyard'], (o) => o.card.type === 'Spell');
      if (gyOpts.length > 0) {
        nextState = enqueueInteraction(nextState, {
          type: 'ZONE_SELECTION',
          player: 'player',
          sourceCardId: creature.card.id,
          sourceCardName: creature.card.name,
          actionKind: 'PLAYER_SALVAGE_GY',
          prompt: `${creature.card.name}: Return a spell from your graveyard to your hand? (Optional)`,
          options: gyOpts,
          minSelections: 0,
          maxSelections: 1
        });
      }
    } else {
      nextState = salvageFromGraveyard(
        nextState,
        owner,
        (c) => c.type === 'Spell',
        'hand',
        { pickMostRecent: true }
      );
    }
  } else if (cardName.includes('bone piercer')) {
    const manaCreatureOpts = buildZoneOptions(nextState, owner, ['manaZone'], (o) =>
      o.card.type.includes('Creature')
    );
    if (manaCreatureOpts.length > 0) {
      if (owner === 'player' && nextState.interactiveHuman) {
        nextState = enqueueInteraction(nextState, {
          type: 'ZONE_SELECTION',
          player: 'player',
          sourceCardId: creature.card.id,
          sourceCardName: creature.card.name,
          actionKind: 'PLAYER_MANA_RECOVERY',
          prompt: `${creature.card.name}: Return a creature from your mana zone to your hand? (Optional)`,
          options: manaCreatureOpts,
          minSelections: 0,
          maxSelections: 1
        });
      } else {
        const picked = manaCreatureOpts[0];
        const pS = nextState.players[owner];
        const manaItem = pS.manaZone.find((m) => m.instanceId === picked.instanceId);
        if (manaItem) {
          nextState = {
            ...nextState,
            players: {
              ...nextState.players,
              [owner]: {
                ...pS,
                manaZone: pS.manaZone.filter((m) => m.instanceId !== manaItem.instanceId),
                hand: [...pS.hand, { instanceId: manaItem.instanceId, card: manaItem.card, owner }]
              }
            },
            actionLog: [...nextState.actionLog, `Bone Piercer returned ${manaItem.card.name} from mana zone to hand.`]
          };
        }
      }
    }
  }

  // 7. Shield to Hand on Death (Jewel Spider)
  if (
    /when(?:ever)? this creature is destroyed.*choose one of your shields and put it into your hand/i.test(
      rules
    ) ||
    cardName.includes('jewel spider')
  ) {
    const unbrokenShields = nextState.players[owner].shields.filter((s) => !s.isBroken);
    if (unbrokenShields.length > 0) {
      if (owner === 'player' && nextState.interactiveHuman) {
        const sOpts = buildZoneOptions(nextState, 'player', ['shields'], undefined, { hideCards: true });
        nextState = enqueueInteraction(nextState, {
          type: 'ZONE_SELECTION',
          player: 'player',
          sourceCardId: creature.card.id,
          sourceCardName: creature.card.name,
          actionKind: 'PLAYER_SHIELD_TO_HAND',
          prompt: `${creature.card.name}: Choose 1 of your shields to put into your hand.`,
          options: sOpts,
          minSelections: 1,
          maxSelections: 1
        });
      } else {
        const shieldToTake = unbrokenShields[0];
        const remainingShields = nextState.players[owner].shields.filter(
          (s) => s.id !== shieldToTake.id
        );
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
  }

  // 8. Board-wide watchers on any creature destroyed: Mongrel Man, Simian Warrior Grash, Slash and Burn
  for (const pid of ['player', 'opponent'] as const) {
    const mongrelCount = nextState.players[pid].battleZone.filter((c) =>
      getCardCapabilities(c.card).nameLower.includes('mongrel man')
    ).length;
    if (mongrelCount > 0) {
      if (pid === 'player' && nextState.interactiveHuman && nextState.players[pid].deck.length > 0) {
        nextState = enqueueInteraction(nextState, {
          type: 'OPTIONAL_CHOICE',
          player: 'player',
          sourceCardId: 'mongrel-man',
          abilityName: 'Mongrel Man',
          effectType: 'DRAW',
          drawCount: mongrelCount,
          prompt: `Mongrel Man: Another creature was destroyed. Draw ${mongrelCount} card(s)?`
        });
      } else {
        nextState = drawCards(nextState, pid, mongrelCount);
      }
    }
  }

  // Simian Warrior Grash: whenever one of your Armorloids is destroyed, opponent puts 1 mana into graveyard
  if (getCreatureRaces(creature).some((r) => normalizeRace(r) === 'armorloid')) {
    const grashCount = nextState.players[owner].battleZone.filter((c) =>
      getCardCapabilities(c.card).nameLower.includes('simian warrior grash')
    ).length;
    if (grashCount > 0) {
      const oppState = nextState.players[opponent];
      const countToKill = Math.min(grashCount, oppState.manaZone.length);
      if (countToKill > 0) {
        if (opponent === 'player' && nextState.interactiveHuman) {
          const manaOpts = buildZoneOptions(nextState, 'player', ['manaZone']);
          nextState = enqueueInteraction(nextState, {
            type: 'ZONE_SELECTION',
            player: 'player',
            sourceCardId: 'simian-warrior-grash',
            sourceCardName: 'Simian Warrior Grash',
            actionKind: 'PLAYER_MANA_TO_GY',
            prompt: `Simian Warrior Grash: Choose ${countToKill} card(s) in your mana zone to put into your graveyard.`,
            options: manaOpts,
            minSelections: countToKill,
            maxSelections: countToKill
          });
        } else {
          const lostMana = oppState.manaZone.slice(0, countToKill);
          nextState = {
            ...nextState,
            players: {
              ...nextState.players,
              [opponent]: {
                ...oppState,
                manaZone: oppState.manaZone.slice(countToKill),
                graveyard: [
                  ...oppState.graveyard,
                  ...lostMana.map((m) => ({ instanceId: m.instanceId, card: m.card, owner: opponent }))
                ]
              }
            },
            actionLog: [
              ...nextState.actionLog,
              `Simian Warrior Grash forced ${opponent} to put ${countToKill} mana card(s) into the graveyard.`
            ]
          };
        }
      }
    }
  }

  // Slash and Burn: whenever any opponent creature is destroyed this turn, opponent sacrifices 1 mana and 1 shield
  const oppWatcher = nextState.players[opponent];
  const sbStacks = oppWatcher.tempOppDestroyTriggerPenalties || 0;
  if (sbStacks > 0) {
    if (owner === 'player' && nextState.interactiveHuman) {
      for (let s = 0; s < sbStacks; s++) {
        const manaOpts = buildZoneOptions(nextState, 'player', ['manaZone']);
        const shieldOpts = buildZoneOptions(nextState, 'player', ['shields'], undefined, { hideCards: true });
        if (manaOpts.length > 0) {
          nextState = enqueueInteraction(nextState, {
            type: 'ZONE_SELECTION',
            player: 'player',
            sourceCardId: 'slash-and-burn',
            sourceCardName: 'Slash and Burn',
            actionKind: 'PLAYER_MANA_TO_GY',
            prompt: 'Slash and Burn: Choose 1 card in your mana zone to put into your graveyard.',
            options: manaOpts,
            minSelections: 1,
            maxSelections: 1,
            contextData: { followedByShieldGY: shieldOpts.length > 0 }
          });
        } else if (shieldOpts.length > 0) {
          nextState = enqueueInteraction(nextState, {
            type: 'ZONE_SELECTION',
            player: 'player',
            sourceCardId: 'slash-and-burn',
            sourceCardName: 'Slash and Burn',
            actionKind: 'PLAYER_SHIELD_TO_GY',
            prompt: 'Slash and Burn: Choose 1 of your shields to put into your graveyard.',
            options: shieldOpts,
            minSelections: 1,
            maxSelections: 1
          });
        }
      }
    } else {
      for (let s = 0; s < sbStacks; s++) {
        const targetState = nextState.players[owner];
        let nextMana = targetState.manaZone;
        let nextShields = targetState.shields;
        const newGrave = [...targetState.graveyard];
        if (nextMana.length > 0) {
          const [m0, ...restM] = nextMana;
          nextMana = restM;
          newGrave.push({ instanceId: m0.instanceId, card: m0.card, owner });
        }
        const unbroken = nextShields.filter((sh) => !sh.isBroken);
        if (unbroken.length > 0) {
          const s0 = unbroken[0];
          nextShields = nextShields.filter((sh) => sh.id !== s0.id);
          newGrave.push({ instanceId: s0.id, card: s0.card, owner });
        }
        nextState = {
          ...nextState,
          players: {
            ...nextState.players,
            [owner]: {
              ...targetState,
              manaZone: nextMana,
              shields: nextShields,
              graveyard: newGrave
            }
          },
          actionLog: [
            ...nextState.actionLog,
            `Slash and Burn triggered: ${owner} put 1 mana card and 1 shield into the graveyard.`
          ]
        };
      }
    }
  }

  return nextState;
}

/**
 * Checks whether a creature has a destroy-replacement effect routing it to hand/mana/shields instead of graveyard.
 */
function checkDestroyZoneReplacement(
  state: GameState,
  owner: PlayerId,
  creature: CreatureInstance
): 'hand' | 'manaZone' | 'shields' | null {
  const ownerState = state.players[owner];
  const rules = creature.card.rulesText || '';
  const nameLower = getCardCapabilities(creature.card).nameLower;

  // Mihail, Celestial Elemental: "Whenever another creature would be destroyed, it stays in the battle zone instead."
  // Checked BEFORE call or directly handled in destroyCreature.

  // 1. Return to hand replacement
  const bounceMatch =
    /when(?:ever)? this creature (?:would be|is) destroyed.*(?:return (?:it|this creature) to (?:your|its owner's) hand|put (?:it|this creature) into (?:your|its owner's) hand) instead/i.test(
      rules
    );
  const hasMysticMagicianAura =
    /silent skill/i.test(rules) &&
    ownerState.battleZone.some((c) => getCardCapabilities(c.card).nameLower.includes('mystic magician'));
  const wsMet = isWaveStrikerConditionMet([
    state.players.player.battleZone,
    state.players.opponent.battleZone
  ]);
  const isRevivalSoldierActive = nameLower.includes('revival soldier') && wsMet;
  const isWaveStrikerGated = /wave striker/i.test(rules);
  const hasRaceBounceTemp =
    ownerState.tempRaceBounceOnDestroyThisTurn &&
    getCreatureRaces(creature).some((r) =>
      ownerState.tempRaceBounceOnDestroyThisTurn!.includes(normalizeRace(r))
    );
  const isFriendlyDarkness = getCardCivilizations(creature.card).includes('Darkness');
  const hasJackViperAura =
    isFriendlyDarkness &&
    ownerState.battleZone.some(
      (c) =>
        c.instanceId !== creature.instanceId &&
        getCardCapabilities(c.card).nameLower.includes('jack viper')
    );

  if (
    creature.tempBounceOnDestroy ||
    hasRaceBounceTemp ||
    (bounceMatch && (!isWaveStrikerGated || wsMet)) ||
    hasMysticMagicianAura ||
    hasJackViperAura ||
    isRevivalSoldierActive ||
    nameLower.includes('aqua soldier') ||
    nameLower.includes('chilias') ||
    nameLower.includes('aqua knight') ||
    nameLower.includes('reconnaissance vehicle') ||
    nameLower.includes('aqua agent') ||
    nameLower.includes('aqua ranger') ||
    nameLower.includes('crystal jouster') ||
    nameLower.includes('aqua skydiver') ||
    nameLower.includes('gigastand') ||
    nameLower.includes('dream pirate')
  ) {
    return 'hand';
  }

  // 2. Put into mana zone replacement
  const manaMatch =
    /when(?:ever)? this creature (?:would be|is) destroyed.*put (?:it|this creature) into (?:your|its owner's) mana zone instead/i.test(
      rules
    );
  const isFriendlyNature = getCardCivilizations(creature.card).includes('Nature');
  const hasGigamantisAura =
    isFriendlyNature &&
    ownerState.battleZone.some(
      (c) =>
        c.instanceId !== creature.instanceId &&
        getCardCapabilities(c.card).nameLower.includes('gigamantis')
    );
  const hasBalloonshroomAura =
    isSurvivorCard(creature.card) &&
    ownerState.battleZone.some(
      (c) =>
        getCardCapabilities(c.card).nameLower.includes('balloonshroom') ||
        (isSurvivorCard(c.card) && /put it into your mana zone instead/i.test(c.card.rulesText || ''))
    );

  if (
    ownerState.tempManaOnDestroyThisTurn ||
    creature.tempManaOnDestroy ||
    manaMatch ||
    hasGigamantisAura ||
    hasBalloonshroomAura ||
    nameLower.includes('pochan') ||
    nameLower.includes('stinger worm') ||
    nameLower.includes('aura blast') ||
    nameLower.includes('coiling vines') ||
    nameLower.includes('mighty shouter') ||
    nameLower.includes('red-eye scorpion') ||
    nameLower.includes('balloonshroom') ||
    nameLower.includes('solid horn') ||
    nameLower.includes('shaman broccoli')
  ) {
    return 'manaZone';
  }

  // 3. Add to shields replacement (e.g. Ouks)
  const shieldMatch =
    /when(?:ever)? this creature (?:would be|is) destroyed.*add (?:it|this creature) to (?:your|its owner's) shields.*instead/i.test(
      rules
    );
  if (shieldMatch || nameLower.includes('ouks')) {
    return 'shields';
  }

  return null;
}

/**
 * Destroys a creature in the battle zone honoring all official Duel Masters replacements:
 * 1. Mihail, Celestial Elemental ("stays in battle zone instead")
 * 2. Saver sacrifice replacement (excluding any simultaneous batch-doomed Savers)
 * 3. Phoenix leave-substitution (top card goes to graveyard, underlying creatures separate)
 * 4. Zone-redirection replacements (Hand, Mana Zone, Shields)
 * 5. Standard graveyard destruction + Destroyed / Leave-BZ triggers
 */
export interface DestroyOptions {
  skipInteractiveSaver?: boolean;
  skipInteractiveReplacement?: boolean;
  remainingDestroyIds?: string[];
}

function isOptionalDestroyReplacement(
  state: GameState,
  owner: PlayerId,
  creature: CreatureInstance,
  replacementDest: 'hand' | 'manaZone' | 'shields' | null
): boolean {
  if (replacementDest !== 'hand') return false;
  const rules = creature.card.rulesText || '';
  const nameLower = getCardCapabilities(creature.card).nameLower;
  const ownerState = state.players[owner];
  const isDarkness = getCardCivilizations(creature.card).includes('Darkness');
  const hasJackViper =
    isDarkness &&
    ownerState.battleZone.some(
      (c) => c.instanceId !== creature.instanceId && getCardCapabilities(c.card).nameLower.includes('jack viper')
    );

  return (
    /you may return (?:it|this creature) to (?:your|its owner's) hand instead/i.test(rules) ||
    nameLower.includes('aqua agent') ||
    nameLower.includes('gigastand') ||
    nameLower.includes('dream pirate') ||
    hasJackViper
  );
}

/**
 * Destroys a creature in battle zones using canonical replacement priority:
 * 0a. Mihail protection
 * 0b. Saver sacrifice
 * 0c. Vortex Phoenix / explicit leave-substitution (only top card leaves; base creatures separate back onto BZ)
 * 1.  Hand / Mana / Shield destroy replacements (evolution stacks leave WITH top card!)
 * 2.  Graveyard + Destroyed triggers
 */
export function destroyCreature(
  state: GameState,
  creatureInstanceId: string,
  excludedSaverIds?: Set<string>,
  options?: DestroyOptions
): GameState {
  const found = findCreature(state, creatureInstanceId);
  if (!found) {
    return state;
  }

  const { creature, owner } = found;
  const ownerState = state.players[owner];

  // 0a. Mihail, Celestial Elemental ("Whenever another creature would be destroyed, it stays in the battle zone instead.")
  const allOtherCreatures = [
    ...state.players.player.battleZone,
    ...state.players.opponent.battleZone
  ].filter((c) => c.instanceId !== creatureInstanceId);
  if (allOtherCreatures.some((c) => getCardCapabilities(c.card).nameLower.includes('mihail'))) {
    return {
      ...state,
      actionLog: [
        ...state.actionLog,
        `Mihail prevented ${creature.card.name} from being destroyed (stayed in battle zone)!`
      ]
    };
  }

  // 0b. Saver sacrifice replacement (cannot sacrifice a creature dying in the same simultaneous wave!)
  const saver = !options?.skipInteractiveSaver
    ? findSaverInBattleZone(ownerState.battleZone, creature, excludedSaverIds)
    : null;
  if (saver) {
    if (owner === 'player' && state.interactiveHuman) {
      return enqueueInteraction(state, {
        type: 'OPTIONAL_CHOICE',
        player: 'player',
        sourceCardId: saver.card.id,
        sourceInstanceId: saver.instanceId,
        abilityName: saver.card.name,
        effectType: 'SAVER_REPLACEMENT',
        targetInstanceId: creatureInstanceId,
        saverInstanceId: saver.instanceId,
        remainingDestroyIds: options?.remainingDestroyIds,
        prompt: `${saver.card.name}: ${creature.card.name} would be destroyed. Sacrifice ${saver.card.name} instead?`
      });
    }
    const stateWithSaverSacrificed = destroyCreature(state, saver.instanceId, excludedSaverIds);
    return {
      ...stateWithSaverSacrificed,
      actionLog: [
        ...stateWithSaverSacrificed.actionLog,
        `${saver.card.name} sacrificed itself as a Saver to protect ${creature.card.name}!`
      ]
    };
  }

  // 0c. Phoenix leave-substitution (only top card leaves; underlying baits separate cleanly)
  if (hasLeaveSubstitution(creature) && creature.evolvedOn && creature.evolvedOn.length > 0) {
    const restoredCreatures = separateEvolutionUnderlyingCreatures(creature, state.turn);
    const topCardGraveyard: CardInstance = {
      instanceId: creature.instanceId,
      card: creature.card,
      owner
    };
    const nextState: GameState = {
      ...state,
      players: {
        ...state.players,
        [owner]: {
          ...ownerState,
          battleZone: [
            ...ownerState.battleZone.filter((c) => c.instanceId !== creatureInstanceId),
            ...restoredCreatures
          ],
          graveyard: [...ownerState.graveyard, topCardGraveyard]
        }
      },
      actionLog: [
        ...state.actionLog,
        `${creature.card.name}'s Phoenix effect activated: only the top card went to the graveyard, and the underlying creatures separated back into the battle zone!`
      ]
    };
    return triggerDestroyed(nextState, owner, { ...creature, evolvedOn: [] });
  }

  // 1. Check Hand / Mana / Shield replacement
  const replacementDest = checkDestroyZoneReplacement(state, owner, creature);
  if (
    !options?.skipInteractiveReplacement &&
    owner === 'player' &&
    state.interactiveHuman &&
    isOptionalDestroyReplacement(state, owner, creature, replacementDest)
  ) {
    return enqueueInteraction(state, {
      type: 'OPTIONAL_CHOICE',
      player: 'player',
      sourceCardId: creature.card.id,
      sourceInstanceId: creature.instanceId,
      abilityName: creature.card.name,
      effectType: 'DESTROY_TO_HAND',
      targetInstanceId: creatureInstanceId,
      remainingDestroyIds: options?.remainingDestroyIds,
      prompt: `${creature.card.name} would be destroyed. Return it to your hand instead?`
    });
  }
  if (replacementDest === 'hand') {
    const cardsToHand: CardInstance[] = [
      { instanceId: creature.instanceId, card: creature.card, owner },
      ...flattenEvolutionStack(creature.evolvedOn)
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
        `${creature.card.name} returned to hand instead of being destroyed.`
      ]
    };
  }

  if (replacementDest === 'manaZone') {
    const cardsToMana: ManaCardInstance[] = [
      toManaCard(creature),
      ...flattenEvolutionStack(creature.evolvedOn).map((uc) => toManaCard(uc))
    ];
    return {
      ...state,
      players: {
        ...state.players,
        [owner]: {
          ...ownerState,
          battleZone: ownerState.battleZone.filter((c) => c.instanceId !== creatureInstanceId),
          manaZone: [...ownerState.manaZone, ...cardsToMana]
        }
      },
      actionLog: [
        ...state.actionLog,
        `${creature.card.name} was put into the mana zone instead of being destroyed.`
      ]
    };
  }

  if (replacementDest === 'shields') {
    const stackedShields: ShieldInstance[] = [
      creature,
      ...flattenEvolutionStack(creature.evolvedOn)
    ].map((item, idx) => {
      const sid = makeShieldId(owner, ownerState.shields.length + idx);
      return { id: sid, shieldId: sid, card: item.card, isBroken: false };
    });
    return {
      ...state,
      players: {
        ...state.players,
        [owner]: {
          ...ownerState,
          battleZone: ownerState.battleZone.filter((c) => c.instanceId !== creatureInstanceId),
          shields: [...ownerState.shields, ...stackedShields]
        }
      },
      actionLog: [
        ...state.actionLog,
        `${creature.card.name} was added to shields instead of being destroyed.`
      ]
    };
  }

  // 2. Standard Destruction -> Graveyard + Trigger
  const cardsToGrave: CardInstance[] = [
    ...flattenEvolutionStack(creature.evolvedOn),
    {
      instanceId: creature.instanceId,
      card: creature.card,
      owner
    }
  ];

  const stateAfterDestruction: GameState = {
    ...state,
    players: {
      ...state.players,
      [owner]: {
        ...ownerState,
        battleZone: ownerState.battleZone.filter((c) => c.instanceId !== creatureInstanceId),
        graveyard: [...ownerState.graveyard, ...cardsToGrave]
      }
    },
    actionLog: [
      ...state.actionLog,
      `${creature.card.name} was destroyed and sent to the graveyard.`
    ]
  };

  return triggerDestroyed(stateAfterDestruction, owner, creature);
}

/**
 * Destroys multiple creatures simultaneously (e.g. tied combat battle, Burst Shot,
 * Blizzard of Spears, Apocalypse Day, Cruel Naga):
 * - Excludes doomed creatures from acting as Savers for other doomed creatures.
 * - Sorts aura sources (Balloonshroom/Gigamantis) last so allies still receive their replacement aura.
 */
export function destroyCreaturesBatch(state: GameState, creatureInstanceIds: string[]): GameState {
  if (creatureInstanceIds.length === 0) return state;

  const uniqueIds = Array.from(new Set(creatureInstanceIds));
  const batchSet = new Set(uniqueIds);

  // Order so non-aura/non-Mihail leave cleanly, preserving Balloonshroom/Gigamantis until after allies leave
  const orderedIds = [...uniqueIds].sort((idA, idB) => {
    const a = findCreature(state, idA)?.creature;
    const b = findCreature(state, idB)?.creature;
    const aAura = a ? /balloonshroom|gigamantis|mihail/i.test(a.card.name) : false;
    const bAura = b ? /balloonshroom|gigamantis|mihail/i.test(b.card.name) : false;
    return (aAura ? 1 : 0) - (bAura ? 1 : 0);
  });

  let nextState = state;
  for (let i = 0; i < orderedIds.length; i++) {
    const tid = orderedIds[i];
    const prevPending = nextState.pendingInteraction;
    nextState = destroyCreature(nextState, tid, batchSet, {
      remainingDestroyIds: orderedIds.slice(i + 1)
    });
    if (!prevPending && nextState.pendingInteraction) {
      return nextState;
    }
  }
  return nextState;
}

/**
 * Bounces a creature from the battle zone to its owner's hand:
 * - Honors Soul Phoenix leave-substitution (only top card returns to hand; baits separate on BZ).
 * - Fires leave-battle-zone triggers (Death Phoenix, Cruel Naga, Wise Starnoid, Aura Pegasus).
 */
export function bounceCreature(state: GameState, creatureInstanceId: string): GameState {
  const found = findCreature(state, creatureInstanceId);
  if (!found) return state;

  const { creature, owner } = found;
  const ownerState = state.players[owner];

  if (hasLeaveSubstitution(creature) && creature.evolvedOn && creature.evolvedOn.length > 0) {
    const restoredCreatures = separateEvolutionUnderlyingCreatures(creature, state.turn);
    const topCardHand: CardInstance = {
      instanceId: creature.instanceId,
      card: creature.card,
      owner
    };
    const nextState: GameState = {
      ...state,
      players: {
        ...state.players,
        [owner]: {
          ...ownerState,
          battleZone: [
            ...ownerState.battleZone.filter((c) => c.instanceId !== creatureInstanceId),
            ...restoredCreatures
          ],
          hand: [...ownerState.hand, topCardHand]
        }
      },
      actionLog: [
        ...state.actionLog,
        `${creature.card.name}'s Phoenix effect activated: only the top card returned to hand, and the underlying creatures separated back into the battle zone!`
      ]
    };
    return triggerLeavesBattleZone(nextState, owner, { ...creature, evolvedOn: [] });
  }

  const cardsToHand: CardInstance[] = [
    { instanceId: creature.instanceId, card: creature.card, owner },
    ...flattenEvolutionStack(creature.evolvedOn)
  ];

  const nextState: GameState = {
    ...state,
    players: {
      ...state.players,
      [owner]: {
        ...ownerState,
        battleZone: ownerState.battleZone.filter((c) => c.instanceId !== creatureInstanceId),
        hand: [...ownerState.hand, ...cardsToHand]
      }
    },
    actionLog: [...state.actionLog, `Returned ${creature.card.name} to its owner's hand.`]
  };

  return triggerLeavesBattleZone(nextState, owner, creature);
}

/**
 * Sends a creature from the battle zone to its owner's mana zone (multi-civ enters tapped):
 * - Honors Soul Phoenix leave-substitution.
 * - Fires leave-battle-zone triggers.
 */
export function sendCreatureToManaZone(state: GameState, creatureInstanceId: string): GameState {
  const found = findCreature(state, creatureInstanceId);
  if (!found) return state;

  const { creature, owner } = found;
  const ownerState = state.players[owner];

  if (hasLeaveSubstitution(creature) && creature.evolvedOn && creature.evolvedOn.length > 0) {
    const restoredCreatures = separateEvolutionUnderlyingCreatures(creature, state.turn);
    const topCardMana: ManaCardInstance = {
      instanceId: creature.instanceId,
      card: creature.card,
      isTapped: isMultiCiv(creature.card)
    };
    const nextState: GameState = {
      ...state,
      players: {
        ...state.players,
        [owner]: {
          ...ownerState,
          battleZone: [
            ...ownerState.battleZone.filter((c) => c.instanceId !== creatureInstanceId),
            ...restoredCreatures
          ],
          manaZone: [...ownerState.manaZone, topCardMana]
        }
      },
      actionLog: [
        ...state.actionLog,
        `${creature.card.name}'s Phoenix effect activated: only the top card was put into the mana zone, and the underlying creatures separated back into the battle zone!`
      ]
    };
    return triggerLeavesBattleZone(nextState, owner, { ...creature, evolvedOn: [] });
  }

  const cardsToMana: ManaCardInstance[] = [
    toManaCard(creature),
    ...flattenEvolutionStack(creature.evolvedOn).map((c) => toManaCard(c))
  ];

  const nextState: GameState = {
    ...state,
    players: {
      ...state.players,
      [owner]: {
        ...ownerState,
        battleZone: ownerState.battleZone.filter((c) => c.instanceId !== creatureInstanceId),
        manaZone: [...ownerState.manaZone, ...cardsToMana]
      }
    },
    actionLog: [...state.actionLog, `${creature.card.name} was put into the mana zone.`]
  };

  return triggerLeavesBattleZone(nextState, owner, creature);
}

/**
 * Puts a creature from the battle zone on TOP of its owner's deck (e.g. Corile!).
 * - Honors Soul Phoenix leave-substitution & leave-battle-zone triggers.
 */
export function sendCreatureToTopOfDeck(state: GameState, creatureInstanceId: string): GameState {
  const found = findCreature(state, creatureInstanceId);
  if (!found) return state;

  const { creature, owner } = found;
  const ownerState = state.players[owner];

  if (hasLeaveSubstitution(creature) && creature.evolvedOn && creature.evolvedOn.length > 0) {
    const restoredCreatures = separateEvolutionUnderlyingCreatures(creature, state.turn);
    const topDeckCard: CardInstance = {
      instanceId: creature.instanceId,
      card: creature.card,
      owner
    };
    const nextState: GameState = {
      ...state,
      players: {
        ...state.players,
        [owner]: {
          ...ownerState,
          battleZone: [
            ...ownerState.battleZone.filter((c) => c.instanceId !== creatureInstanceId),
            ...restoredCreatures
          ],
          deck: [topDeckCard, ...ownerState.deck]
        }
      },
      actionLog: [
        ...state.actionLog,
        `${creature.card.name}'s Phoenix effect activated: only the top card was put on top of ${owner}'s deck!`
      ]
    };
    return triggerLeavesBattleZone(nextState, owner, { ...creature, evolvedOn: [] });
  }

  const cardsForDeck: CardInstance[] = [
    { instanceId: creature.instanceId, card: creature.card, owner },
    ...flattenEvolutionStack(creature.evolvedOn)
  ];

  const nextState: GameState = {
    ...state,
    players: {
      ...state.players,
      [owner]: {
        ...ownerState,
        battleZone: ownerState.battleZone.filter((c) => c.instanceId !== creatureInstanceId),
        deck: [...cardsForDeck, ...ownerState.deck]
      }
    },
    actionLog: [
      ...state.actionLog,
      `${creature.card.name} was put on top of ${owner}'s deck.`
    ]
  };

  return triggerLeavesBattleZone(nextState, owner, creature);
}

/**
 * Adds a creature from the battle zone to its owner's shields face-down (e.g. Miraculous Snare, Rondobil).
 */
export function sendCreatureToShields(state: GameState, creatureInstanceId: string): GameState {
  const found = findCreature(state, creatureInstanceId);
  if (!found) return state;

  const { creature, owner } = found;
  const ownerState = state.players[owner];
  const shieldId = makeShieldId(owner, ownerState.shields.length);

  if (hasLeaveSubstitution(creature) && creature.evolvedOn && creature.evolvedOn.length > 0) {
    const restoredCreatures = separateEvolutionUnderlyingCreatures(creature, state.turn);
    const nextState: GameState = {
      ...state,
      players: {
        ...state.players,
        [owner]: {
          ...ownerState,
          battleZone: [
            ...ownerState.battleZone.filter((c) => c.instanceId !== creatureInstanceId),
            ...restoredCreatures
          ],
          shields: [
            ...ownerState.shields,
            { id: shieldId, shieldId, card: creature.card, isBroken: false }
          ]
        }
      },
      actionLog: [
        ...state.actionLog,
        `${creature.card.name}'s Phoenix effect activated: top card was added to shields!`
      ]
    };
    return triggerLeavesBattleZone(nextState, owner, { ...creature, evolvedOn: [] });
  }

  const flatUnder = flattenEvolutionStack(creature.evolvedOn);
  const shieldsToAdd: ShieldInstance[] = [
    { id: shieldId, shieldId, card: creature.card, isBroken: false },
    ...flatUnder.map((under, idx) => {
      const sid = makeShieldId(owner, ownerState.shields.length + 1 + idx);
      return { id: sid, shieldId: sid, card: under.card, isBroken: false };
    })
  ];
  const nextState: GameState = {
    ...state,
    players: {
      ...state.players,
      [owner]: {
        ...ownerState,
        battleZone: ownerState.battleZone.filter((c) => c.instanceId !== creatureInstanceId),
        shields: [...ownerState.shields, ...shieldsToAdd]
      }
    },
    actionLog: [
      ...state.actionLog,
      `${creature.card.name} was added to ${owner}'s shields face-down.`
    ]
  };

  return triggerLeavesBattleZone(nextState, owner, creature);
}
