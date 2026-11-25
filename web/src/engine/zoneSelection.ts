import type {
  CardInstance,
  GameState,
  OptionalChoiceInteraction,
  PlayerId,
  ShieldInstance,
  ZoneCardOption,
  ZoneSelectionInteraction
} from './types.ts';
import { getCreatureRaces, getOpponentId, normalizeRace } from './cardUtils.ts';
import { toManaCard } from './mana.ts';
import { isMadnessDiscardReplacement } from './replacements.ts';
import {
  addShieldFromDeck,
  bounceCreature,
  breakOpponentShields,
  destroyCreature,
  destroyCreaturesBatch,
  drawCards,
  findCreature,
  makeShieldId,
  rampTopDeckToManaZone,
  searchDeckForCard,
  sendCreatureToManaZone,
  sendCreatureToShields,
  sendCreatureToTopOfDeck
} from './zones.ts';

import { buildZoneOptions, enqueueInteraction } from './interactionHelpers.ts';

export { buildZoneOptions, enqueueInteraction };

/**
 * Resolves a completed ZONE_SELECTION interaction using canonical zone movement primitives.
 */
export function resolveZoneSelectionAction(
  state: GameState,
  interaction: ZoneSelectionInteraction,
  player: PlayerId,
  selectedIds: string[],
  selectedRace?: string
): GameState {
  if (player !== interaction.player) {
    throw new Error(`Zone selection is pending for ${interaction.player}, not ${player}.`);
  }

  const validSet = new Set(interaction.options.map((o) => o.instanceId));
  for (const sid of selectedIds) {
    if (!validSet.has(sid)) {
      throw new Error(`Invalid zone card selection: ${sid}`);
    }
  }

  if (interaction.actionKind !== 'TAP_CHOOSE_RACE') {
    if (selectedIds.length < interaction.minSelections || selectedIds.length > interaction.maxSelections) {
      throw new Error(
        `Expected between ${interaction.minSelections} and ${interaction.maxSelections} selections, got ${selectedIds.length}.`
      );
    }
  }

  const optionById = new Map<string, ZoneCardOption>();
  for (const o of interaction.options) {
    optionById.set(o.instanceId, o);
  }

  let nextState: GameState = {
    ...state,
    pendingInteraction: null
  };
  const opp = getOpponentId(player);

  switch (interaction.actionKind) {
    case 'OPPONENT_SACRIFICE_BZ': {
      const maxTotalPower = interaction.contextData?.maxTotalPower as number | undefined;
      if (maxTotalPower !== undefined && selectedIds.length > 0) {
        const sumPower = selectedIds.reduce((sum, id) => {
          const opt = optionById.get(id);
          return sum + (opt?.card.power ?? 0);
        }, 0);
        if (sumPower > maxTotalPower) {
          throw new Error(`Total power (${sumPower}) exceeds allowed maximum (${maxTotalPower}).`);
        }
      }
      if (selectedIds.length > 0) {
        nextState = destroyCreaturesBatch(nextState, selectedIds);
      }
      if (interaction.contextData?.thenOppWeakestDestroy) {
        const oppBZ = nextState.players[opp].battleZone;
        if (oppBZ.length > 0) {
          const weakest = [...oppBZ].sort((a, b) => (a.card.power ?? 0) - (b.card.power ?? 0))[0];
          nextState = destroyCreature(nextState, weakest.instanceId);
        }
      }
      break;
    }

    case 'OPPONENT_BOUNCE_BZ': {
      for (const id of selectedIds) {
        nextState = bounceCreature(nextState, id);
      }
      break;
    }

    case 'OPPONENT_MANA_SEND_BZ': {
      for (const id of selectedIds) {
        nextState = sendCreatureToManaZone(nextState, id);
      }
      break;
    }

    case 'PLAYER_SEND_TOP_DECK': {
      for (const id of selectedIds) {
        nextState = sendCreatureToTopOfDeck(nextState, id);
      }
      break;
    }

    case 'OPPONENT_DISCARD_HAND':
    case 'PLAYER_DISCARD_FROM_HAND': {
      const targetOwner =
        interaction.options[0]?.owner ?? player;
      const pState = nextState.players[targetOwner];
      const discardSet = new Set(selectedIds);
      const discarded = pState.hand.filter((h) => discardSet.has(h.instanceId));
      const remainingHand = pState.hand.filter((h) => !discardSet.has(h.instanceId));

      const isOpponentTurn = targetOwner !== nextState.activePlayer;
      const enteredBZ = [];
      const toGraveyard = [];

      for (const d of discarded) {
        if (
          interaction.actionKind === 'OPPONENT_DISCARD_HAND' &&
          isMadnessDiscardReplacement(d.card, isOpponentTurn)
        ) {
          enteredBZ.push({
            instanceId: d.instanceId,
            card: d.card,
            owner: targetOwner,
            isTapped: false,
            summonedTurn: nextState.turn,
            powerModifier: 0
          });
        } else {
          toGraveyard.push(d);
        }
      }

      nextState = {
        ...nextState,
        players: {
          ...nextState.players,
          [targetOwner]: {
            ...pState,
            hand: remainingHand,
            battleZone: [...pState.battleZone, ...enteredBZ],
            graveyard: [...pState.graveyard, ...toGraveyard]
          }
        },
        actionLog: [
          ...nextState.actionLog,
          `${targetOwner} discarded ${discarded.map((c) => c.card.name).join(', ') || '0 cards'} (${interaction.sourceCardName}).`
        ]
      };
      if (interaction.contextData?.drawPerDiscard && discarded.length > 0) {
        nextState = drawCards(nextState, targetOwner, discarded.length);
      }
      break;
    }

    case 'OPPONENT_MANA_TO_GY':
    case 'PLAYER_MANA_TO_GY': {
      const targetOwner = interaction.options[0]?.owner ?? player;
      const pState = nextState.players[targetOwner];
      const lostSet = new Set(selectedIds);
      const lostCards = pState.manaZone.filter((m) => lostSet.has(m.instanceId));
      nextState = {
        ...nextState,
        players: {
          ...nextState.players,
          [targetOwner]: {
            ...pState,
            manaZone: pState.manaZone.filter((m) => !lostSet.has(m.instanceId)),
            graveyard: [
              ...pState.graveyard,
              ...lostCards.map((m) => ({ instanceId: m.instanceId, card: m.card, owner: targetOwner }))
            ]
          }
        },
        actionLog: [
          ...nextState.actionLog,
          `${targetOwner} put ${lostCards.map((m) => m.card.name).join(', ')} from mana zone into graveyard (${interaction.sourceCardName}).`
        ]
      };
      if (interaction.contextData?.rampCaster) {
        const caster = interaction.contextData.rampCaster as PlayerId;
        nextState = rampTopDeckToManaZone(nextState, caster, 1);
      }
      if (interaction.contextData?.followedByShieldGY) {
        const pNow = nextState.players[targetOwner];
        const shieldsOpts = buildZoneOptions(nextState, targetOwner, ['shields'], undefined, { hideCards: true });
        if (shieldsOpts.length > 0) {
          if (targetOwner === 'player' && nextState.interactiveHuman) {
            nextState = enqueueInteraction(nextState, {
              type: 'ZONE_SELECTION',
              player: 'player',
              sourceCardId: interaction.sourceCardId,
              sourceCardName: interaction.sourceCardName,
              actionKind: 'PLAYER_SHIELD_TO_GY',
              prompt: `${interaction.sourceCardName}: Choose 1 of your shields to put into your graveyard.`,
              options: shieldsOpts,
              minSelections: 1,
              maxSelections: 1
            });
          } else {
            const lostShield = pNow.shields[0];
            nextState = {
              ...nextState,
              players: {
                ...nextState.players,
                [targetOwner]: {
                  ...pNow,
                  shields: pNow.shields.slice(1),
                  graveyard: [...pNow.graveyard, { instanceId: lostShield.id, card: lostShield.card, owner: targetOwner }]
                }
              }
            };
          }
        }
      }
      break;
    }

    case 'OPPONENT_MANA_TO_HAND':
    case 'PLAYER_MANA_RECOVERY': {
      const targetOwner = interaction.options[0]?.owner ?? player;
      const pState = nextState.players[targetOwner];
      const recSet = new Set(selectedIds);
      const recovered = pState.manaZone.filter((m) => recSet.has(m.instanceId));
      nextState = {
        ...nextState,
        players: {
          ...nextState.players,
          [targetOwner]: {
            ...pState,
            manaZone: pState.manaZone.filter((m) => !recSet.has(m.instanceId)),
            hand: [
              ...pState.hand,
              ...recovered.map((m) => ({ instanceId: m.instanceId, card: m.card, owner: targetOwner }))
            ]
          }
        },
        actionLog: [
          ...nextState.actionLog,
          `${targetOwner} returned ${recovered.map((m) => m.card.name).join(', ')} from mana zone to hand (${interaction.sourceCardName}).`
        ]
      };
      break;
    }

    case 'OPPONENT_CRISIS_BOULDER':
    case 'OPPONENT_GRINNING_HUNGER': {
      for (const sid of selectedIds) {
        const opt = optionById.get(sid);
        if (!opt) continue;
        if (opt.zone === 'battleZone') {
          nextState = destroyCreature(nextState, sid);
        } else if (opt.zone === 'manaZone') {
          const pS = nextState.players[opt.owner];
          const lost = pS.manaZone.find((m) => m.instanceId === sid);
          if (lost) {
            nextState = {
              ...nextState,
              players: {
                ...nextState.players,
                [opt.owner]: {
                  ...pS,
                  manaZone: pS.manaZone.filter((m) => m.instanceId !== sid),
                  graveyard: [...pS.graveyard, { instanceId: lost.instanceId, card: lost.card, owner: opt.owner }]
                }
              },
              actionLog: [...nextState.actionLog, `${opt.owner} put ${lost.card.name} from mana into graveyard.`]
            };
          }
        } else if (opt.zone === 'shields') {
          const pS = nextState.players[opt.owner];
          const lostShield = pS.shields.find((s) => s.id === sid);
          if (lostShield) {
            nextState = {
              ...nextState,
              players: {
                ...nextState.players,
                [opt.owner]: {
                  ...pS,
                  shields: pS.shields.filter((s) => s.id !== sid),
                  graveyard: [...pS.graveyard, { instanceId: lostShield.id, card: lostShield.card, owner: opt.owner }]
                }
              },
              actionLog: [...nextState.actionLog, `${opt.owner} put a shield (${lostShield.card.name}) into graveyard.`]
            };
          }
        }
      }
      break;
    }

    case 'OPPONENT_CHOOSE_SHIELD': {
      // Used by Kyuroro / Meloppe when defender chooses WHICH shield breaks!
      const attackerPlayer = (interaction.contextData?.attackerPlayer as PlayerId) || opp;
      const attackerId = interaction.contextData?.attackerId as string | undefined;
      const attacker = attackerId ? findCreature(nextState, attackerId)?.creature : undefined;
      nextState = breakOpponentShields(nextState, attackerPlayer, selectedIds.length, {
        attacker,
        targetShieldIds: selectedIds,
        bypassKyuroroPrompt: true,
        bypassShieldSacrificePrompt: true
      });
      break;
    }

    case 'PLAYER_SHIELD_TO_GY':
    case 'SEARING_WAVE_SHIELD': {
      const targetOwner = interaction.options[0]?.owner ?? player;
      for (const sid of selectedIds) {
        const pS = nextState.players[targetOwner];
        const s = pS.shields.find((x) => x.id === sid);
        if (s) {
          nextState = {
            ...nextState,
            players: {
              ...nextState.players,
              [targetOwner]: {
                ...pS,
                shields: pS.shields.filter((x) => x.id !== sid),
                graveyard: [...pS.graveyard, { instanceId: s.id, card: s.card, owner: targetOwner }]
              }
            },
            actionLog: [...nextState.actionLog, `${targetOwner} put shield into graveyard (${interaction.sourceCardName}).`]
          };
        }
      }
      break;
    }

    case 'PLAYER_SHIELD_TO_HAND': {
      const targetOwner = interaction.options[0]?.owner ?? player;
      for (const sid of selectedIds) {
        const pS = nextState.players[targetOwner];
        const s = pS.shields.find((x) => x.id === sid);
        if (s) {
          nextState = {
            ...nextState,
            players: {
              ...nextState.players,
              [targetOwner]: {
                ...pS,
                shields: pS.shields.filter((x) => x.id !== sid),
                hand: [...pS.hand, { instanceId: s.id, card: s.card, owner: targetOwner }]
              }
            },
            actionLog: [...nextState.actionLog, `${targetOwner} returned a shield to hand (${interaction.sourceCardName}).`]
          };
        }
      }
      break;
    }

    case 'PLAYER_SHIELD_TO_DECK': {
      const targetOwner = interaction.options[0]?.owner ?? opp;
      for (const sid of selectedIds) {
        const pS = nextState.players[targetOwner];
        const s = pS.shields.find((x) => x.id === sid);
        if (s) {
          nextState = {
            ...nextState,
            players: {
              ...nextState.players,
              [targetOwner]: {
                ...pS,
                shields: pS.shields.filter((x) => x.id !== sid),
                deck: [...pS.deck, { instanceId: s.id, card: s.card, owner: targetOwner }]
              }
            },
            actionLog: [...nextState.actionLog, `${player} put a shield into ${targetOwner}'s deck (${interaction.sourceCardName}).`]
          };
        }
      }
      break;
    }

    case 'PLAYER_TAP_OPP_BZ': {
      for (const tid of selectedIds) {
        const found = findCreature(nextState, tid);
        if (found) {
          const tOwner = found.owner;
          nextState = {
            ...nextState,
            players: {
              ...nextState.players,
              [tOwner]: {
                ...nextState.players[tOwner],
                battleZone: nextState.players[tOwner].battleZone.map((c) =>
                  c.instanceId === tid ? { ...c, isTapped: true } : c
                )
              }
            },
            actionLog: [...nextState.actionLog, `${player} tapped ${found.creature.card.name} (${interaction.sourceCardName}).`]
          };
        }
      }
      break;
    }

    case 'PLAYER_STORM_WRANGLER_BLOCKER': {
      const attackerId = interaction.contextData?.attackerId as string | undefined;
      if (selectedIds.length > 0 && attackerId) {
        const tid = selectedIds[0];
        const found = findCreature(nextState, tid);
        if (found) {
          nextState = {
            ...nextState,
            players: {
              ...nextState.players,
              [found.owner]: {
                ...nextState.players[found.owner],
                battleZone: nextState.players[found.owner].battleZone.map((c) =>
                  c.instanceId === tid ? { ...c, tempMustBlockTargetId: attackerId } : c
                )
              }
            },
            actionLog: [...nextState.actionLog, `${interaction.sourceCardName} forced ${found.creature.card.name} to block if able!`]
          };
        }
      }
      break;
    }

    case 'PLAYER_BURN_OPP_SHIELD': {
      if (selectedIds.length > 0) {
        const oppS = nextState.players[opp];
        const burnSet = new Set(selectedIds);
        const burned = oppS.shields.filter((s) => burnSet.has(s.id));
        nextState = {
          ...nextState,
          players: {
            ...nextState.players,
            [opp]: {
              ...oppS,
              shields: oppS.shields.filter((s) => !burnSet.has(s.id)),
              graveyard: [
                ...oppS.graveyard,
                ...burned.map((s) => ({ instanceId: s.id, card: s.card, owner: opp }))
              ]
            }
          },
          actionLog: [
            ...nextState.actionLog,
            `${player} burned ${burned.length} shield(s) into ${opp}'s graveyard (${interaction.sourceCardName}).`
          ]
        };
      }
      break;
    }

    case 'PLAYER_SHIELD_PEEK': {
      if (selectedIds.length > 0) {
        const targetOwner = interaction.options[0]?.owner ?? opp;
        const s = nextState.players[targetOwner].shields.find((x) => x.id === selectedIds[0]);
        if (s) {
          nextState = {
            ...nextState,
            actionLog: [
              ...nextState.actionLog,
              `${player} peeked at ${targetOwner}'s shield (${interaction.sourceCardName}): revealed ${s.card.name}.`
            ]
          };
        }
      }
      break;
    }

    case 'EMERAL_HAND_TO_SHIELD': {
      if (selectedIds.length > 0) {
        const handId = selectedIds[0];
        const shieldOpts = buildZoneOptions(nextState, player, ['shields'], undefined, { hideCards: true });
        if (shieldOpts.length > 0) {
          nextState = enqueueInteraction(nextState, {
            type: 'ZONE_SELECTION',
            player,
            sourceCardId: interaction.sourceCardId,
            sourceCardName: 'Emeral',
            actionKind: 'EMERAL_SHIELD_TO_HAND',
            prompt: 'Emeral: Choose 1 of your shields to swap into your hand (without activating Shield Trigger).',
            options: shieldOpts,
            minSelections: 1,
            maxSelections: 1,
            contextData: { swapHandCardId: handId }
          });
        } else {
          // 0 shields left -> just add hand card to shields
          const pS = nextState.players[player];
          const chosen = pS.hand.find((h) => h.instanceId === handId);
          if (chosen) {
            const sid = makeShieldId(player, pS.shields.length);
            nextState = {
              ...nextState,
              players: {
                ...nextState.players,
                [player]: {
                  ...pS,
                  hand: pS.hand.filter((h) => h.instanceId !== handId),
                  shields: [...pS.shields, { id: sid, shieldId: sid, card: chosen.card, isBroken: false }]
                }
              }
            };
          }
        }
      }
      break;
    }

    case 'EMERAL_SHIELD_TO_HAND': {
      const handId = interaction.contextData?.swapHandCardId as string | undefined;
      const pS = nextState.players[player];
      const handCard = handId ? pS.hand.find((h) => h.instanceId === handId) : undefined;
      const shieldId = selectedIds[0];
      const shield = shieldId ? pS.shields.find((s) => s.id === shieldId) : undefined;
      if (handCard && shield) {
        const remainingShields: ShieldInstance[] = pS.shields
          .filter((s) => s.id !== shield.id)
          .concat({ id: handCard.instanceId, shieldId: handCard.instanceId, card: handCard.card, isBroken: false });
        const nextHand: CardInstance[] = pS.hand
          .filter((h) => h.instanceId !== handCard.instanceId)
          .concat({ instanceId: shield.id, card: shield.card, owner: player });
        nextState = {
          ...nextState,
          players: {
            ...nextState.players,
            [player]: {
              ...pS,
              hand: nextHand,
              shields: remainingShields
            }
          },
          actionLog: [...nextState.actionLog, `${player} swapped a card from hand with a shield using Emeral.`]
        };
      }
      break;
    }

    case 'MIRACULOUS_MELTDOWN_KEEP': {
      const targetOwner = interaction.options[0]?.owner ?? player;
      const keepSet = new Set(selectedIds);
      const breakIds = interaction.options
        .filter((o) => !keepSet.has(o.instanceId))
        .map((o) => o.instanceId);
      if (breakIds.length > 0) {
        nextState = breakOpponentShields(nextState, getOpponentId(targetOwner), breakIds.length, {
          targetShieldIds: breakIds,
          bypassKyuroroPrompt: true
        });
      }
      break;
    }

    case 'PLAYER_SALVAGE_GY': {
      const pS = nextState.players[player];
      if (interaction.sourceCardName.toLowerCase().includes('zombie carnival') && selectedIds.length > 1) {
        const chosenItems = selectedIds.map((id) => optionById.get(id)!).filter(Boolean);
        const firstRaces = chosenItems[0].card.races || [];
        const hasCommon = firstRaces.some((r) => chosenItems.every((ci) => (ci.card.races || []).includes(r)));
        if (!hasCommon) {
          throw new Error('Zombie Carnival requires selected creatures to share a common race.');
        }
      }
      const selSet = new Set(selectedIds);
      const salvaged = pS.graveyard.filter((g) => selSet.has(g.instanceId));
      if (salvaged.length > 0) {
        nextState = {
          ...nextState,
          players: {
            ...nextState.players,
            [player]: {
              ...pS,
              graveyard: pS.graveyard.filter((g) => !selSet.has(g.instanceId)),
              hand: [...pS.hand, ...salvaged]
            }
          },
          actionLog: [
            ...nextState.actionLog,
            `${player} salvaged ${salvaged.map((s) => s.card.name).join(', ')} from graveyard to hand.`
          ]
        };
      }
      break;
    }

    case 'PLAYER_SALVAGE_ALL_BY_NAME': {
      if (selectedIds.length > 0) {
        const picked = optionById.get(selectedIds[0]);
        if (picked) {
          const pS = nextState.players[player];
          const ret = pS.graveyard.filter((g) => g.card.name === picked.card.name);
          const retIds = new Set(ret.map((r) => r.instanceId));
          nextState = {
            ...nextState,
            players: {
              ...nextState.players,
              [player]: {
                ...pS,
                graveyard: pS.graveyard.filter((g) => !retIds.has(g.instanceId)),
                hand: [...pS.hand, ...ret]
              }
            },
            actionLog: [
              ...nextState.actionLog,
              `${player} returned ${ret.length} copy/copies of ${picked.card.name} from graveyard to hand.`
            ]
          };
        }
      }
      break;
    }

    case 'GARATYANO_TOP3': {
      const pS = nextState.players[player];
      const topCount = Math.min(3, pS.deck.length);
      const topCards = pS.deck.slice(0, topCount);
      const restDeck = pS.deck.slice(topCount);
      const reordered: CardInstance[] = [];
      for (const sid of selectedIds) {
        const match = topCards.find((c) => c.instanceId === sid);
        if (match && !reordered.some((r) => r.instanceId === sid)) {
          reordered.push(match);
        }
      }
      for (const c of topCards) {
        if (!reordered.some((r) => r.instanceId === c.instanceId)) {
          reordered.push(c);
        }
      }
      nextState = {
        ...nextState,
        players: {
          ...nextState.players,
          [player]: {
            ...pS,
            deck: [...reordered, ...restDeck]
          }
        },
        actionLog: [...nextState.actionLog, `${player} reordered the top ${topCount} cards of deck with Garatyano.`]
      };
      break;
    }

    case 'TAP_BUFF_FRIENDLY_BZ': {
      const src = ((interaction.contextData?.tapBuffSource as string) || '').toLowerCase();
      if (selectedIds.length > 0) {
        const chosenId = selectedIds[0];
        const pS = nextState.players[player];
        nextState = {
          ...nextState,
          players: {
            ...nextState.players,
            [player]: {
              ...pS,
              battleZone: pS.battleZone.map((c) => {
                if (c.instanceId !== chosenId) return c;
                if (src.includes('sopian') || src.includes('biancus')) return { ...c, tempUnblockable: true };
                if (src.includes('lupa')) return { ...c, tempSlayer: true };
                if (src.includes('legionnaire lizard')) return { ...c, tempSpeedAttacker: true };
                if (src.includes('migasa')) return { ...c, tempDoubleBreaker: true };
                return { ...c, powerModifier: c.powerModifier + 5000 };
              })
            }
          },
          actionLog: [...nextState.actionLog, `${player} buffed creature using ${interaction.sourceCardName}.`]
        };
      }
      break;
    }

    case 'PLAYER_GRAVEYARD_TO_MANA': {
      const pS = nextState.players[player];
      const selSet = new Set(selectedIds);
      const moved = pS.graveyard.filter((g) => selSet.has(g.instanceId));
      if (moved.length > 0) {
        nextState = {
          ...nextState,
          players: {
            ...nextState.players,
            [player]: {
              ...pS,
              graveyard: pS.graveyard.filter((g) => !selSet.has(g.instanceId)),
              manaZone: [...pS.manaZone, ...moved.map((g) => toManaCard(g))]
            }
          },
          actionLog: [
            ...nextState.actionLog,
            `${player} put ${moved.map((g) => g.card.name).join(', ')} from graveyard into mana zone.`
          ]
        };
      }
      break;
    }

    case 'PLAYER_HAND_TO_MANA': {
      const pS = nextState.players[player];
      const selSet = new Set(selectedIds);
      const moved = pS.hand.filter((h) => selSet.has(h.instanceId));
      if (moved.length > 0) {
        nextState = {
          ...nextState,
          players: {
            ...nextState.players,
            [player]: {
              ...pS,
              hand: pS.hand.filter((h) => !selSet.has(h.instanceId)),
              manaZone: [...pS.manaZone, ...moved.map((h) => toManaCard(h))]
            }
          },
          actionLog: [
            ...nextState.actionLog,
            `${player} put ${moved.map((h) => h.card.name).join(', ')} from hand into mana zone.`
          ]
        };
      }
      break;
    }

    case 'PLAYER_PUT_CREATURES_HAND_TO_BZ':
    case 'OPPONENT_PUT_CREATURES_HAND_TO_BZ': {
      const targetOwner = interaction.options[0]?.owner ?? player;
      const pS = nextState.players[targetOwner];
      const selSet = new Set(selectedIds);
      const moved = pS.hand.filter((h) => selSet.has(h.instanceId));
      if (moved.length > 0) {
        const summoned = moved.map((h) => ({
          instanceId: h.instanceId,
          card: h.card,
          owner: targetOwner,
          isTapped: false,
          summonedTurn: nextState.turn,
          powerModifier: 0
        }));
        nextState = {
          ...nextState,
          players: {
            ...nextState.players,
            [targetOwner]: {
              ...pS,
              hand: pS.hand.filter((h) => !selSet.has(h.instanceId)),
              battleZone: [...pS.battleZone, ...summoned]
            }
          },
          actionLog: [
            ...nextState.actionLog,
            `${targetOwner} put ${moved.map((m) => m.card.name).join(', ')} from hand into battle zone (${interaction.sourceCardName}).`
          ]
        };
      }
      break;
    }

    case 'RONDOBIL_CREATURE_TO_SHIELD': {
      if (selectedIds.length > 0) {
        nextState = sendCreatureToShields(nextState, selectedIds[0]);
      }
      break;
    }

    case 'TAP_CHOOSE_RACE': {
      const race = selectedRace || selectedIds[0];
      if (race) {
        const norm = normalizeRace(race);
        const nameLower = interaction.sourceCardName.toLowerCase();
        const pS = nextState.players[player];
        if (nameLower.includes('tra rion')) {
          nextState = {
            ...nextState,
            players: {
              ...nextState.players,
              [player]: {
                ...pS,
                tempEndTurnUntapRaces: [...(pS.tempEndTurnUntapRaces || []), norm]
              }
            }
          };
        } else if (nameLower.includes('hokira')) {
          nextState = {
            ...nextState,
            players: {
              ...nextState.players,
              [player]: {
                ...pS,
                tempRaceBounceOnDestroyThisTurn: [...(pS.tempRaceBounceOnDestroyThisTurn || []), norm]
              }
            }
          };
        } else if (nameLower.includes('venom worm')) {
          nextState = {
            ...nextState,
            players: {
              ...nextState.players,
              [player]: {
                ...pS,
                tempSlayerRacesThisTurn: [...(pS.tempSlayerRacesThisTurn || []), norm]
              }
            }
          };
        } else if (nameLower.includes("gigio's hammer")) {
          const updatedBZ = pS.battleZone.map((c) =>
            getCreatureRaces(c).some((r) => normalizeRace(r) === norm)
              ? { ...c, tempAttacksIfAble: true, tempPowerAttackerBonus: (c.tempPowerAttackerBonus || 0) + 4000 }
              : c
          );
          nextState = {
            ...nextState,
            players: {
              ...nextState.players,
              [player]: {
                ...pS,
                battleZone: updatedBZ,
                tempAttacksIfAbleRacesThisTurn: [...(pS.tempAttacksIfAbleRacesThisTurn || []), norm]
              }
            }
          };
        } else if (nameLower.includes('silvermoon trailblazer')) {
          nextState = {
            ...nextState,
            players: {
              ...nextState.players,
              [player]: {
                ...pS,
                tempUnblockableMaxPowerByRace: [
                  ...(pS.tempUnblockableMaxPowerByRace || []),
                  { race: norm, maxPower: 3000 }
                ]
              }
            }
          };
        }
        nextState = {
          ...nextState,
          actionLog: [...nextState.actionLog, `${player} chose race "${race}" for ${interaction.sourceCardName}.`]
        };
      }
      break;
    }

    default:
      break;
  }

  return nextState;
}

/**
 * Resolves interactive OPTIONAL_CHOICE decisions ("you may"):
 * covers Draw, Deck Search, Untap, Mana Ramp, Saver replacement, Destroy zone replacements, and Shield replacements.
 */
export function resolveOptionalChoiceAction(
  state: GameState,
  interaction: OptionalChoiceInteraction,
  player: PlayerId,
  accept: boolean,
  selectedTargetId?: string
): GameState {
  let result: GameState = {
    ...state,
    pendingInteraction: null
  };

  if (!accept) {
    result = {
      ...result,
      actionLog: [
        ...result.actionLog,
        `${player} declined optional ability (${interaction.abilityName}).`
      ]
    };

    if (interaction.effectType === 'SAVER_REPLACEMENT' && interaction.targetInstanceId) {
      // User chose NOT to sacrifice the Saver -> destroy victim bypassing interactive Saver re-prompt
      const excluded = interaction.saverInstanceId ? new Set([interaction.saverInstanceId]) : undefined;
      result = destroyCreature(result, interaction.targetInstanceId, excluded, { skipInteractiveSaver: true });
      if (interaction.remainingDestroyIds && interaction.remainingDestroyIds.length > 0) {
        result = destroyCreaturesBatch(result, interaction.remainingDestroyIds);
      }
    } else if (
      (interaction.effectType === 'DESTROY_TO_HAND' ||
        interaction.effectType === 'DESTROY_TO_MANA' ||
        interaction.effectType === 'DESTROY_TO_SHIELD') &&
      interaction.targetInstanceId
    ) {
      result = destroyCreature(result, interaction.targetInstanceId, undefined, { skipInteractiveReplacement: true });
      if (interaction.remainingDestroyIds && interaction.remainingDestroyIds.length > 0) {
        result = destroyCreaturesBatch(result, interaction.remainingDestroyIds);
      }
    } else if (interaction.effectType === 'SHIELD_SACRIFICE_REPLACEMENT') {
      const attackerPlayer = getOpponentId(player);
      const attacker = interaction.attackerId ? findCreature(result, interaction.attackerId)?.creature : undefined;
      result = breakOpponentShields(result, attackerPlayer, interaction.shieldIndicesToBreak?.length || 1, {
        attacker,
        bypassShieldSacrificePrompt: true
      });
    }

    return result;
  }

  // Accepted ("Yes")
  switch (interaction.effectType) {
    case 'DRAW':
      return drawCards(result, player, interaction.drawCount || 1);

    case 'MANA_RAMP':
      return rampTopDeckToManaZone(result, player, 1);

    case 'SEARCH_DECK': {
      const nameLower = interaction.abilityName.toLowerCase();
      if (nameLower.includes('forbos') || nameLower.includes('rayla') || nameLower.includes('cyclolink') || nameLower.includes('laguna')) {
        return searchDeckForCard(result, player, (c) => c.type === 'Spell', 'hand');
      }
      if (nameLower.includes('charmilia') || nameLower.includes('terahorn') || nameLower.includes('brutal charge')) {
        return searchDeckForCard(result, player, (c) => c.type.includes('Creature'), 'hand');
      }
      return searchDeckForCard(result, player, () => true, 'hand');
    }

    case 'UNTAP_CREATURE': {
      const targetId = selectedTargetId || interaction.sourceInstanceId || interaction.validTargetIds?.[0];
      if (targetId) {
        result = {
          ...result,
          players: {
            ...result.players,
            [player]: {
              ...result.players[player],
              battleZone: result.players[player].battleZone.map((c) =>
                c.instanceId === targetId ? { ...c, isTapped: false } : c
              )
            }
          },
          actionLog: [...result.actionLog, `${player} untapped creature (${interaction.abilityName}).`]
        };
      }
      return result;
    }

    case 'UNTAP_ALL_EOT': {
      const targetIds = new Set(interaction.validTargetIds || []);
      result = {
        ...result,
        players: {
          ...result.players,
          [player]: {
            ...result.players[player],
            battleZone: result.players[player].battleZone.map((c) =>
              targetIds.size === 0 || targetIds.has(c.instanceId) ? { ...c, isTapped: false } : c
            )
          }
        },
        actionLog: [...result.actionLog, `${player} untapped creatures (${interaction.abilityName}).`]
      };
      return result;
    }

    case 'SAVER_REPLACEMENT': {
      if (interaction.saverInstanceId) {
        result = destroyCreature(result, interaction.saverInstanceId, undefined, {
          skipInteractiveSaver: true
        });
        result = {
          ...result,
          actionLog: [
            ...result.actionLog,
            `${interaction.abilityName} sacrificed itself to protect friendly creature!`
          ]
        };
      }
      if (interaction.remainingDestroyIds && interaction.remainingDestroyIds.length > 0) {
        result = destroyCreaturesBatch(result, interaction.remainingDestroyIds);
      }
      return result;
    }

    case 'DESTROY_TO_HAND': {
      if (interaction.targetInstanceId) {
        result = bounceCreature(result, interaction.targetInstanceId);
        // Handle Gigastand / Dream Pirate self-discard
        if (/gigastand|dream pirate/i.test(interaction.abilityName)) {
          const pNow = result.players[player];
          if (pNow.hand.length > 0 && result.interactiveHuman) {
            const handOpts = buildZoneOptions(result, player, ['hand']);
            result = enqueueInteraction(result, {
              type: 'ZONE_SELECTION',
              player,
              sourceCardId: interaction.sourceCardId,
              sourceCardName: interaction.abilityName,
              actionKind: 'PLAYER_DISCARD_FROM_HAND',
              prompt: `${interaction.abilityName}: Choose 1 card from your hand to discard.`,
              options: handOpts,
              minSelections: 1,
              maxSelections: 1
            });
          }
        }
      }
      if (interaction.remainingDestroyIds && interaction.remainingDestroyIds.length > 0) {
        result = destroyCreaturesBatch(result, interaction.remainingDestroyIds);
      }
      return result;
    }

    case 'DESTROY_TO_MANA': {
      if (interaction.targetInstanceId) {
        result = sendCreatureToManaZone(result, interaction.targetInstanceId);
      }
      if (interaction.remainingDestroyIds && interaction.remainingDestroyIds.length > 0) {
        result = destroyCreaturesBatch(result, interaction.remainingDestroyIds);
      }
      return result;
    }

    case 'DESTROY_TO_SHIELD': {
      if (interaction.targetInstanceId) {
        result = sendCreatureToShields(result, interaction.targetInstanceId);
      }
      if (interaction.remainingDestroyIds && interaction.remainingDestroyIds.length > 0) {
        result = destroyCreaturesBatch(result, interaction.remainingDestroyIds);
      }
      return result;
    }

    case 'SHIELD_SACRIFICE_REPLACEMENT': {
      if (interaction.saverInstanceId) {
        result = destroyCreature(result, interaction.saverInstanceId, undefined, {
          skipInteractiveSaver: true
        });
        result = {
          ...result,
          actionLog: [
            ...result.actionLog,
            `${interaction.abilityName} sacrificed itself to protect a shield!`
          ]
        };
        const remainingBreaks = Math.max(0, (interaction.shieldIndicesToBreak?.length || 1) - 1);
        if (remainingBreaks > 0) {
          const attackerPlayer = getOpponentId(player);
          const attacker = interaction.attackerId ? findCreature(result, interaction.attackerId)?.creature : undefined;
          result = breakOpponentShields(result, attackerPlayer, remainingBreaks, {
            attacker,
            bypassShieldSacrificePrompt: true
          });
        }
      }
      return result;
    }

    case 'MANA_ADD_SHIELD_DECK': {
      return addShieldFromDeck(result, player, 1);
    }

    default:
      return result;
  }
}
