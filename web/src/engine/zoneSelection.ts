import type {
  CardInstance,
  CreatureInstance,
  GameState,
  OptionalChoiceInteraction,
  PlayerId,
  ShieldInstance,
  ZoneCardOption,
  ZoneSelectionInteraction
} from './types.ts';
import { getCreatureRaces, getOpponentId, normalizeRace } from './cardUtils.ts';
import { toManaCard } from './mana.ts';
import { shuffleCards } from './state.ts';
import { isUntargetableByOpponent } from './targeting.ts';
import { isMadnessDiscardReplacement } from './replacements.ts';
import {
  addShieldFromDeck,
  bounceCreature,
  breakOpponentShields,
  deEvolveCreature,
  destroyCreature,
  destroyCreaturesBatch,
  discardRandomHandCards,
  drawCards,
  findCreature,
  makeShieldId,
  moveOwnShieldsToHand,
  rampTopDeckToManaZone,
  searchDeckForCard,
  sendCreatureToManaZone,
  sendCreatureToShields,
  sendCreatureToTopOfDeck
} from './zones.ts';
import {
  applySoulswapStep2,
  executeMechadragonsBreath,
  executeRouletteOfRuin,
  executeStaticWarpKeep,
  resolveTransmogrifyReveal,
  runRegisteredCipHook,
  runRegisteredSpellHook
} from './cardEffectRegistry.ts';

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

  if (
    interaction.actionKind !== 'TAP_CHOOSE_RACE' &&
    interaction.actionKind !== 'SPELL_CHOOSE_RACE' &&
    interaction.actionKind !== 'CIP_CHOOSE_RACE' &&
    interaction.actionKind !== 'CHOOSE_NUMBER'
  ) {
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
    case 'PLAYER_SACRIFICE_BZ':
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
      if (interaction.contextData?.drawPerSelection && selectedIds.length > 0) {
        nextState = drawCards(nextState, player, selectedIds.length);
      }
      if (interaction.contextData?.thenManaCreatureToHand && selectedIds.length > 0) {
        const manaCreatureOpts = buildZoneOptions(nextState, player, ['manaZone'], (o) =>
          o.card.type.includes('Creature')
        );
        if (manaCreatureOpts.length > 0) {
          nextState = enqueueInteraction(nextState, {
            type: 'ZONE_SELECTION',
            player,
            sourceCardId: interaction.sourceCardId,
            sourceCardName: interaction.sourceCardName,
            actionKind: 'PLAYER_MANA_RECOVERY',
            prompt: `${interaction.sourceCardName}: Choose 1 creature from your mana zone to return to your hand.`,
            options: manaCreatureOpts,
            minSelections: 1,
            maxSelections: 1
          });
        }
      }
      if (interaction.contextData?.thenOppWeakestDestroy) {
        const oppBZ = nextState.players[opp].battleZone;
        if (oppBZ.length > 0) {
          const weakest = [...oppBZ].sort((a, b) => (a.card.power ?? 0) - (b.card.power ?? 0))[0];
          nextState = destroyCreature(nextState, weakest.instanceId);
        }
      }
      if (interaction.contextData?.thenOppRandomDiscard) {
        nextState = discardRandomHandCards(nextState, opp, 1);
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
      if (interaction.contextData?.thenGrantDoubleBreaker && discarded.length > 0) {
        const bzOpts = buildZoneOptions(nextState, targetOwner, ['battleZone']);
        const pickCount = Math.min(discarded.length, bzOpts.length);
        if (pickCount > 0) {
          nextState = enqueueInteraction(nextState, {
            type: 'ZONE_SELECTION',
            player: targetOwner,
            sourceCardId: interaction.sourceCardId,
            sourceCardName: interaction.sourceCardName,
            actionKind: 'GRANT_DOUBLE_BREAKER_BZ',
            prompt: `${interaction.sourceCardName}: Choose ${pickCount} of your creature(s) to gain Double Breaker until end of turn.`,
            options: bzOpts,
            minSelections: pickCount,
            maxSelections: pickCount
          });
        }
      }
      if (interaction.contextData?.thenBounceSameCount && discarded.length > 0) {
        const oppId = getOpponentId(targetOwner);
        const choosableOpp = nextState.players[oppId].battleZone.filter(
          (c) => !isUntargetableByOpponent(c)
        );
        const oppIds = new Set(choosableOpp.map((c) => c.instanceId));
        const bzOpts = [
          ...buildZoneOptions(nextState, oppId, ['battleZone'], (o) => oppIds.has(o.instanceId)),
          ...buildZoneOptions(nextState, targetOwner, ['battleZone'])
        ];
        const count = Math.min(discarded.length, bzOpts.length);
        if (count > 0) {
          nextState = enqueueInteraction(nextState, {
            type: 'ZONE_SELECTION',
            player: targetOwner,
            sourceCardId: interaction.sourceCardId,
            sourceCardName: interaction.sourceCardName,
            actionKind: 'OPPONENT_BOUNCE_BZ',
            prompt: `${interaction.sourceCardName}: Choose ${count} creature(s) in the battle zone to return to hand.`,
            options: bzOpts,
            minSelections: count,
            maxSelections: count
          });
        }
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
      if (interaction.contextData?.drawPerSelection && lostCards.length > 0) {
        nextState = drawCards(nextState, targetOwner, lostCards.length);
      }
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
      if (interaction.contextData?.thenHandToMana && nextState.players[targetOwner].hand.length > 0) {
        nextState = enqueueInteraction(nextState, {
          type: 'ZONE_SELECTION',
          player: targetOwner,
          sourceCardId: interaction.sourceCardId,
          sourceCardName: interaction.sourceCardName,
          actionKind: 'PLAYER_HAND_TO_MANA',
          prompt: `${interaction.sourceCardName}: Choose 1 card from your hand to put into your mana zone.`,
          options: buildZoneOptions(nextState, targetOwner, ['hand']),
          minSelections: 1,
          maxSelections: 1
        });
      }
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
      nextState = moveOwnShieldsToHand(
        nextState,
        targetOwner,
        selectedIds,
        Boolean(interaction.contextData?.allowShieldTrigger),
        interaction.sourceCardName
      );
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
        const revealedNames: string[] = [];
        for (const sid of selectedIds) {
          const s = nextState.players[targetOwner].shields.find((x) => x.id === sid);
          if (s) revealedNames.push(s.card.name);
        }
        if (revealedNames.length > 0) {
          nextState = {
            ...nextState,
            actionLog: [
              ...nextState.actionLog,
              `${player} peeked at ${revealedNames.length} shield(s) of ${targetOwner} (${interaction.sourceCardName}): revealed ${revealedNames.join(', ')}.`
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

    case 'PLAYER_GY_TO_MANA': {
      const pS = nextState.players[player];
      const selSet = new Set(selectedIds);
      const chosen = pS.graveyard.filter((g) => selSet.has(g.instanceId));
      if (chosen.length > 0) {
        nextState = {
          ...nextState,
          players: {
            ...nextState.players,
            [player]: {
              ...pS,
              graveyard: pS.graveyard.filter((g) => !selSet.has(g.instanceId)),
              manaZone: [...pS.manaZone, ...chosen.map((c) => toManaCard(c))]
            }
          },
          actionLog: [
            ...nextState.actionLog,
            `${player} put ${chosen.map((c) => c.card.name).join(', ')} from graveyard into mana zone (${interaction.sourceCardName}).`
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

    case 'GARATYANO_TOP3':
    case 'REORDER_TOP_N': {
      const pS = nextState.players[player];
      const topCount = Math.min(
        (interaction.contextData?.count as number) || 3,
        pS.deck.length
      );
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
        actionLog: [
          ...nextState.actionLog,
          `${player} looked at and reordered the top ${topCount} cards of deck (${interaction.sourceCardName}).`
        ]
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
        for (const s of summoned) {
          nextState = runRegisteredCipHook(nextState, targetOwner, s);
        }
      }
      break;
    }

    case 'PUT_MANA_CREATURE_TO_BZ': {
      const targetOwner = interaction.options[0]?.owner ?? player;
      const pS = nextState.players[targetOwner];
      const selSet = new Set(selectedIds);
      const moved = pS.manaZone.filter((m) => selSet.has(m.instanceId));
      if (moved.length > 0) {
        const summoned: CreatureInstance[] = moved.map((m) => ({
          instanceId: m.instanceId,
          card: m.card,
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
              manaZone: pS.manaZone.filter((m) => !selSet.has(m.instanceId)),
              battleZone: [...pS.battleZone, ...summoned]
            }
          },
          actionLog: [
            ...nextState.actionLog,
            `${targetOwner} put ${moved.map((m) => m.card.name).join(', ')} from mana zone into the battle zone (${interaction.sourceCardName}).`
          ]
        };
        for (const s of summoned) {
          nextState = runRegisteredCipHook(nextState, targetOwner, s);
        }
      }
      break;
    }

    case 'CHARGE_WHIPPER_HAND_TO_SHIELD': {
      if (selectedIds.length > 0) {
        const pS = nextState.players[player];
        const chosen = pS.hand.find((h) => h.instanceId === selectedIds[0]);
        if (chosen) {
          const sid = makeShieldId(player, pS.shields.length);
          nextState = {
            ...nextState,
            players: {
              ...nextState.players,
              [player]: {
                ...pS,
                hand: pS.hand.filter((h) => h.instanceId !== chosen.instanceId),
                shields: [
                  ...pS.shields,
                  { id: sid, shieldId: sid, card: chosen.card, isBroken: false }
                ]
              }
            },
            actionLog: [
              ...nextState.actionLog,
              `${interaction.sourceCardName}: ${player} added a card from hand to shields face down.`
            ]
          };
          const shieldOpts = buildZoneOptions(nextState, player, ['shields'], undefined, {
            hideCards: true
          });
          if (shieldOpts.length > 0) {
            nextState = enqueueInteraction(nextState, {
              type: 'ZONE_SELECTION',
              player,
              sourceCardId: interaction.sourceCardId,
              sourceCardName: interaction.sourceCardName,
              actionKind: 'PLAYER_SHIELD_TO_HAND',
              prompt: `${interaction.sourceCardName}: Choose 1 of your shields to put into your hand (without Shield Trigger).`,
              options: shieldOpts,
              minSelections: 1,
              maxSelections: 1,
              contextData: { allowShieldTrigger: false }
            });
          }
        }
      }
      break;
    }

    case 'IKAZ_MARK_UNTAP_AFTER_BATTLE': {
      if (selectedIds.length > 0) {
        const idSet = new Set(selectedIds);
        const pS = nextState.players[player];
        nextState = {
          ...nextState,
          players: {
            ...nextState.players,
            [player]: {
              ...pS,
              battleZone: pS.battleZone.map((c) =>
                idSet.has(c.instanceId) ? { ...c, tempUntapAfterBattle: true } : c
              )
            }
          },
          actionLog: [
            ...nextState.actionLog,
            `${interaction.sourceCardName}: marked friendly creature to untap after battle.`
          ]
        };
      }
      break;
    }

    case 'LOOK_TOP_N_PICK_HAND_REST_BOTTOM': {
      const pS = nextState.players[player];
      const topCount = Math.min(
        (interaction.contextData?.count as number) || 4,
        pS.deck.length
      );
      if (topCount > 0) {
        const topCards = pS.deck.slice(0, topCount);
        const restDeck = pS.deck.slice(topCount);
        const picked = topCards.find((c) => selectedIds.includes(c.instanceId)) || topCards[0];
        const remainingTop = topCards.filter((c) => c.instanceId !== picked.instanceId);
        nextState = {
          ...nextState,
          players: {
            ...nextState.players,
            [player]: {
              ...pS,
              hand: [...pS.hand, picked],
              deck: [...restDeck, ...remainingTop]
            }
          },
          actionLog: [
            ...nextState.actionLog,
            `${interaction.sourceCardName}: ${player} looked at top ${topCount} card(s) of deck, put 1 into hand, and put the rest on the bottom.`
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

    case 'SPELL_CHOOSE_RACE': {
      const race = selectedRace || selectedIds[0];
      if (!race) break;
      const norm = normalizeRace(race);
      const pS = nextState.players[player];
      const srcLower = interaction.sourceCardName.toLowerCase();
      if (srcLower.includes('relentless blitz')) {
        nextState = {
          ...nextState,
          players: {
            ...nextState.players,
            [player]: {
              ...pS,
              tempAttackUntappedRacesThisTurn: [...(pS.tempAttackUntappedRacesThisTurn || []), norm],
              tempUnblockableVsCreaturesRacesThisTurn: [
                ...(pS.tempUnblockableVsCreaturesRacesThisTurn || []),
                norm
              ]
            }
          },
          actionLog: [
            ...nextState.actionLog,
            `${player} cast ${interaction.sourceCardName} naming "${race}".`
          ]
        };
      } else if (srcLower.includes('dance of the sproutlings')) {
        const handOpts = buildZoneOptions(nextState, player, ['hand'], (o) =>
          o.card.type.includes('Creature') &&
          (o.card.races || []).some((r) => normalizeRace(r) === norm)
        );
        if (handOpts.length > 0 && nextState.interactiveHuman) {
          nextState = enqueueInteraction(nextState, {
            type: 'ZONE_SELECTION',
            player,
            sourceCardId: interaction.sourceCardId,
            sourceCardName: interaction.sourceCardName,
            actionKind: 'PLAYER_HAND_TO_MANA',
            prompt: `${interaction.sourceCardName}: Put any number of ${race} creatures from hand into mana zone.`,
            options: handOpts,
            minSelections: 0,
            maxSelections: handOpts.length
          });
        } else {
          const moved = pS.hand.filter(
            (h) =>
              h.card.type.includes('Creature') &&
              (h.card.races || []).some((r) => normalizeRace(r) === norm)
          );
          if (moved.length > 0) {
            const mSet = new Set(moved.map((m) => m.instanceId));
            nextState = {
              ...nextState,
              players: {
                ...nextState.players,
                [player]: {
                  ...pS,
                  hand: pS.hand.filter((h) => !mSet.has(h.instanceId)),
                  manaZone: [...pS.manaZone, ...moved.map((m) => toManaCard(m))]
                }
              },
              actionLog: [
                ...nextState.actionLog,
                `${player} put ${moved.length} ${race} creature(s) into mana (${interaction.sourceCardName}).`
              ]
            };
          }
        }
      }
      break;
    }

    case 'CIP_CHOOSE_RACE': {
      const race = selectedRace || selectedIds[0];
      const creatureId = interaction.contextData?.creatureInstanceId as string | undefined;
      if (race && creatureId) {
        if (normalizeRace(race) === 'mechadelsol') {
          throw new Error('Petrova cannot choose Mecha del Sol.');
        }
        const pS = nextState.players[player];
        nextState = {
          ...nextState,
          players: {
            ...nextState.players,
            [player]: {
              ...pS,
              battleZone: pS.battleZone.map((c) =>
                c.instanceId === creatureId ? { ...c, chosenRace: race } : c
              )
            }
          },
          actionLog: [
            ...nextState.actionLog,
            `${interaction.sourceCardName}: chose "${race}" (+4000 power aura active).`
          ]
        };
      }
      break;
    }

    case 'CHOOSE_NUMBER': {
      const val = parseInt(selectedRace || selectedIds[0] || '', 10);
      if (Number.isFinite(val)) {
        const srcLower = interaction.sourceCardName.toLowerCase();
        if (srcLower.includes('mechadragon')) {
          nextState = executeMechadragonsBreath(nextState, val, interaction.sourceCardName);
        } else if (srcLower.includes('roulette of ruin')) {
          nextState = executeRouletteOfRuin(nextState, player, val, interaction.sourceCardName);
        }
      }
      break;
    }

    case 'PLAYER_SHIELD_TO_MANA': {
      const targetOwner = interaction.options[0]?.owner ?? player;
      const pS = nextState.players[targetOwner];
      const selSet = new Set(selectedIds);
      const moved = pS.shields.filter((s) => selSet.has(s.id));
      if (moved.length > 0) {
        nextState = {
          ...nextState,
          players: {
            ...nextState.players,
            [targetOwner]: {
              ...pS,
              shields: pS.shields.filter((s) => !selSet.has(s.id)),
              manaZone: [
                ...pS.manaZone,
                ...moved.map((s) => toManaCard({ instanceId: s.id, card: s.card }))
              ]
            }
          },
          actionLog: [
            ...nextState.actionLog,
            `${targetOwner} put ${moved.length} shield(s) into mana zone (${interaction.sourceCardName}).`
          ]
        };
      }
      break;
    }

    case 'TRENCHDIVE_HAND_TO_SHIELD': {
      const pS = nextState.players[player];
      const selSet = new Set(selectedIds);
      const added = pS.hand.filter((h) => selSet.has(h.instanceId));
      if (added.length > 0) {
        const newShields = added.map((h, idx) => {
          const sid = makeShieldId(player, pS.shields.length + idx);
          return { id: sid, shieldId: sid, card: h.card, isBroken: false };
        });
        nextState = {
          ...nextState,
          players: {
            ...nextState.players,
            [player]: {
              ...pS,
              hand: pS.hand.filter((h) => !selSet.has(h.instanceId)),
              shields: [...pS.shields, ...newShields]
            }
          }
        };
        const shieldOpts = buildZoneOptions(nextState, player, ['shields'], undefined, { hideCards: true });
        const pickCount = Math.min(added.length, shieldOpts.length);
        if (pickCount > 0) {
          nextState = enqueueInteraction(nextState, {
            type: 'ZONE_SELECTION',
            player,
            sourceCardId: interaction.sourceCardId,
            sourceCardName: interaction.sourceCardName,
            actionKind: 'PLAYER_SHIELD_TO_HAND',
            prompt: `${interaction.sourceCardName}: Put ${pickCount} shield(s) into your hand (no Shield Trigger).`,
            options: shieldOpts,
            minSelections: pickCount,
            maxSelections: pickCount,
            contextData: { allowShieldTrigger: false }
          });
        }
      }
      break;
    }

    case 'GRANT_DOUBLE_BREAKER_BZ': {
      const selSet = new Set(selectedIds);
      const pS = nextState.players[player];
      nextState = {
        ...nextState,
        players: {
          ...nextState.players,
          [player]: {
            ...pS,
            battleZone: pS.battleZone.map((c) =>
              selSet.has(c.instanceId) ? { ...c, tempDoubleBreaker: true } : c
            )
          }
        },
        actionLog: [
          ...nextState.actionLog,
          `${interaction.sourceCardName}: granted Double Breaker to ${selSet.size} creature(s).`
        ]
      };
      break;
    }

    case 'PLAYER_BOUNCE_OWN_FOR_OPP': {
      for (const id of selectedIds) {
        nextState = bounceCreature(nextState, id);
      }
      if (selectedIds.length > 0) {
        const choosableOpp = nextState.players[opp].battleZone.filter(
          (c) => !isUntargetableByOpponent(c)
        );
        if (choosableOpp.length > 0) {
          const idSet = new Set(choosableOpp.map((c) => c.instanceId));
          nextState = enqueueInteraction(nextState, {
            type: 'ZONE_SELECTION',
            player,
            sourceCardId: interaction.sourceCardId,
            sourceCardName: interaction.sourceCardName,
            actionKind: 'OPPONENT_BOUNCE_BZ',
            prompt: `${interaction.sourceCardName}: Choose up to ${selectedIds.length} opponent creature(s) to return to hand.`,
            options: buildZoneOptions(nextState, opp, ['battleZone'], (o) => idSet.has(o.instanceId)),
            minSelections: 0,
            maxSelections: Math.min(selectedIds.length, choosableOpp.length)
          });
        }
      }
      break;
    }

    case 'PLAYER_DECK_TO_HAND_MULTI': {
      const pS = nextState.players[player];
      const selSet = new Set(selectedIds);
      const taken = pS.deck.filter((d) => selSet.has(d.instanceId));
      nextState = {
        ...nextState,
        players: {
          ...nextState.players,
          [player]: {
            ...pS,
            deck: shuffleCards(pS.deck.filter((d) => !selSet.has(d.instanceId))),
            hand: [...pS.hand, ...taken]
          }
        },
        actionLog: [
          ...nextState.actionLog,
          `${player} took ${taken.length} card(s) from deck to hand (${interaction.sourceCardName}) and shuffled.`
        ]
      };
      break;
    }

    case 'OPPONENT_DECK_TO_GY': {
      const pOpp = nextState.players[opp];
      const selSet = new Set(selectedIds);
      const taken = pOpp.deck.filter((d) => selSet.has(d.instanceId));
      nextState = {
        ...nextState,
        players: {
          ...nextState.players,
          [opp]: {
            ...pOpp,
            deck: shuffleCards(pOpp.deck.filter((d) => !selSet.has(d.instanceId))),
            graveyard: [...pOpp.graveyard, ...taken]
          }
        },
        actionLog: [
          ...nextState.actionLog,
          `${player} put ${taken.length} card(s) from ${opp}'s deck into graveyard (${interaction.sourceCardName}).`
        ]
      };
      break;
    }

    case 'SEARCH_DECK_TO_GY': {
      if (selectedIds.length > 0) {
        const opt = optionById.get(selectedIds[0]);
        if (opt) {
          const deckOwner = opt.owner;
          const pOwner = nextState.players[deckOwner];
          const card = pOwner.deck.find((d) => d.instanceId === selectedIds[0]);
          if (card) {
            nextState = {
              ...nextState,
              players: {
                ...nextState.players,
                [deckOwner]: {
                  ...pOwner,
                  deck: shuffleCards(pOwner.deck.filter((d) => d.instanceId !== card.instanceId)),
                  graveyard: [...pOwner.graveyard, card]
                }
              },
              actionLog: [
                ...nextState.actionLog,
                `${interaction.sourceCardName}: put ${card.card.name} from ${deckOwner}'s deck into graveyard.`
              ]
            };
          }
        }
      }
      break;
    }

    case 'DE_EVOLVE_TO_GY': {
      for (const id of selectedIds) {
        nextState = deEvolveCreature(nextState, id, 'graveyard', interaction.sourceCardName);
      }
      break;
    }

    case 'DE_EVOLVE_TO_MANA': {
      for (const id of selectedIds) {
        nextState = deEvolveCreature(nextState, id, 'manaZone', interaction.sourceCardName);
      }
      break;
    }

    case 'RAPID_REINCARNATION_SACRIFICE': {
      if (selectedIds.length > 0) {
        const sacId = selectedIds[0];
        nextState = destroyCreature(nextState, sacId);
        if (!findCreature(nextState, sacId)) {
          const maxCost = nextState.players[player].manaZone.length;
          const handOpts = buildZoneOptions(
            nextState,
            player,
            ['hand'],
            (o) => o.card.type === 'Creature' && !o.card.isEvolution && o.card.manaCost <= maxCost
          );
          if (handOpts.length > 0) {
            nextState = enqueueInteraction(nextState, {
              type: 'ZONE_SELECTION',
              player,
              sourceCardId: interaction.sourceCardId,
              sourceCardName: interaction.sourceCardName,
              actionKind: 'RAPID_REINCARNATION_HAND_TO_BZ',
              prompt: `${interaction.sourceCardName}: Choose 1 creature in hand costing ${maxCost} or less to put into the battle zone.`,
              options: handOpts,
              minSelections: 1,
              maxSelections: 1
            });
          }
        }
      }
      break;
    }

    case 'RAPID_REINCARNATION_HAND_TO_BZ': {
      if (selectedIds.length > 0) {
        const chosen = nextState.players[player].hand.find((h) => h.instanceId === selectedIds[0]);
        if (chosen) {
          const pS = nextState.players[player];
          const newC = {
            instanceId: chosen.instanceId,
            card: chosen.card,
            owner: player,
            isTapped: false,
            summonedTurn: nextState.turn,
            powerModifier: 0
          };
          nextState = {
            ...nextState,
            players: {
              ...nextState.players,
              [player]: {
                ...pS,
                hand: pS.hand.filter((h) => h.instanceId !== chosen.instanceId),
                battleZone: [...pS.battleZone, newC]
              }
            },
            actionLog: [
              ...nextState.actionLog,
              `${interaction.sourceCardName}: ${player} put ${chosen.card.name} from hand into the battle zone.`
            ]
          };
          nextState = runRegisteredCipHook(nextState, player, newC);
        }
      }
      break;
    }

    case 'STATIC_WARP_KEEP': {
      nextState = executeStaticWarpKeep(nextState, player, selectedIds[0]);
      break;
    }

    case 'TRANSMOGRIFY_DESTROY': {
      if (selectedIds.length > 0) {
        const tid = selectedIds[0];
        const found = findCreature(nextState, tid);
        if (found) {
          const targetOwner = found.owner;
          nextState = destroyCreature(nextState, tid);
          if (!findCreature(nextState, tid)) {
            nextState = resolveTransmogrifyReveal(
              nextState,
              targetOwner,
              interaction.sourceCardName
            );
          }
        }
      }
      break;
    }

    case 'SOULSWAP_BZ_TO_MANA': {
      if (selectedIds.length > 0) {
        const tid = selectedIds[0];
        const found = findCreature(nextState, tid);
        if (found) {
          const targetOwner = found.owner;
          nextState = sendCreatureToManaZone(nextState, tid);
          if (!findCreature(nextState, tid)) {
            const maxCost = nextState.players[targetOwner].manaZone.length;
            const manaOpts = buildZoneOptions(
              nextState,
              targetOwner,
              ['manaZone'],
              (o) => o.card.type === 'Creature' && !o.card.isEvolution && o.card.manaCost <= maxCost
            );
            if (manaOpts.length > 0) {
              nextState = enqueueInteraction(nextState, {
                type: 'ZONE_SELECTION',
                player,
                sourceCardId: interaction.sourceCardId,
                sourceCardName: interaction.sourceCardName,
                actionKind: 'SOULSWAP_MANA_TO_BZ',
                prompt: `${interaction.sourceCardName}: Choose 1 non-evolution creature costing <= ${maxCost} in ${targetOwner}'s mana zone to put into play.`,
                options: manaOpts,
                minSelections: 1,
                maxSelections: 1,
                contextData: { targetOwner }
              });
            }
          }
        }
      }
      break;
    }

    case 'SOULSWAP_MANA_TO_BZ': {
      const targetOwner = (interaction.contextData?.targetOwner as PlayerId) || opp;
      nextState = applySoulswapStep2(
        nextState,
        player,
        targetOwner,
        selectedIds[0],
        interaction.sourceCardName
      );
      break;
    }

    case 'MIRACULOUS_PLAGUE_OPP_CREATURES': {
      if (selectedIds.length === 2) {
        const [idA, idB] = selectedIds;
        // Opponent chooses 1 to put to hand and destroys other (unless opp === 'player' & interactive)
        const cA = findCreature(nextState, idA)?.creature;
        const cB = findCreature(nextState, idB)?.creature;
        const keepId =
          cA && cB && (cB.card.power ?? 0) > (cA.card.power ?? 0) ? idB : idA;
        const killId = keepId === idA ? idB : idA;
        nextState = bounceCreature(nextState, keepId);
        nextState = destroyCreature(nextState, killId);
      } else if (selectedIds.length === 1) {
        nextState = bounceCreature(nextState, selectedIds[0]);
      }
      const oppManaOpts = buildZoneOptions(nextState, opp, ['manaZone']);
      if (oppManaOpts.length >= 2) {
        nextState = enqueueInteraction(nextState, {
          type: 'ZONE_SELECTION',
          player,
          sourceCardId: interaction.sourceCardId,
          sourceCardName: interaction.sourceCardName,
          actionKind: 'MIRACULOUS_PLAGUE_OPP_MANA',
          prompt: `${interaction.sourceCardName}: Choose 2 cards in opponent's mana zone (opponent puts 1 to hand, 1 to graveyard).`,
          options: oppManaOpts,
          minSelections: 2,
          maxSelections: 2
        });
      }
      break;
    }

    case 'MIRACULOUS_PLAGUE_OPP_MANA': {
      if (selectedIds.length >= 2) {
        const [toHandId, toGyId] = selectedIds;
        const pOpp = nextState.players[opp];
        const mHand = pOpp.manaZone.find((m) => m.instanceId === toHandId);
        const mGy = pOpp.manaZone.find((m) => m.instanceId === toGyId);
        if (mHand && mGy) {
          const rem = new Set([toHandId, toGyId]);
          nextState = {
            ...nextState,
            players: {
              ...nextState.players,
              [opp]: {
                ...pOpp,
                manaZone: pOpp.manaZone.filter((m) => !rem.has(m.instanceId)),
                hand: [...pOpp.hand, { instanceId: mHand.instanceId, card: mHand.card, owner: opp }],
                graveyard: [...pOpp.graveyard, { instanceId: mGy.instanceId, card: mGy.card, owner: opp }]
              }
            },
            actionLog: [
              ...nextState.actionLog,
              `${interaction.sourceCardName}: ${opp} returned ${mHand.card.name} to hand and put ${mGy.card.name} into graveyard.`
            ]
          };
        }
      }
      break;
    }

    case 'COSMIC_DARTS_PICK_SHIELD': {
      const caster = (interaction.contextData?.caster as PlayerId) || opp;
      const casterState = nextState.players[caster];
      const sh = casterState.shields.find((s) => s.id === selectedIds[0]);
      if (sh) {
        nextState = {
          ...nextState,
          actionLog: [
            ...nextState.actionLog,
            `Cosmic Darts: ${player} chose shield of ${caster}, revealing ${sh.card.name}.`
          ]
        };
        if (sh.card.type === 'Spell') {
          nextState = {
            ...nextState,
            players: {
              ...nextState.players,
              [caster]: {
                ...casterState,
                shields: casterState.shields.filter((s) => s.id !== sh.id)
              }
            }
          };
          nextState = runRegisteredSpellHook(nextState, caster, sh.card);
          const afterC = nextState.players[caster];
          nextState = {
            ...nextState,
            players: {
              ...nextState.players,
              [caster]: {
                ...afterC,
                graveyard: [...afterC.graveyard, { instanceId: sh.id, card: sh.card, owner: caster }]
              }
            }
          };
        }
      }
      break;
    }

    case 'TURN_SHIELD_FACE_UP': {
      const chosenSet = new Set(selectedIds);
      if (chosenSet.size > 0) {
        nextState = {
          ...nextState,
          players: {
            ...nextState.players,
            player: {
              ...nextState.players.player,
              shields: nextState.players.player.shields.map((s) =>
                chosenSet.has(s.id) ? { ...s, isFaceUp: true } : s
              )
            },
            opponent: {
              ...nextState.players.opponent,
              shields: nextState.players.opponent.shields.map((s) =>
                chosenSet.has(s.id) ? { ...s, isFaceUp: true } : s
              )
            }
          },
          actionLog: [
            ...nextState.actionLog,
            `${interaction.sourceCardName}: turned ${chosenSet.size} shield(s) face up.`
          ]
        };
      }
      break;
    }

    case 'GIGANDURA_HAND_TO_MANA': {
      if (selectedIds.length > 0) {
        const oppS = nextState.players[opp];
        const chosen = oppS.hand.find((h) => h.instanceId === selectedIds[0]);
        if (chosen) {
          nextState = {
            ...nextState,
            players: {
              ...nextState.players,
              [opp]: {
                ...oppS,
                hand: oppS.hand.filter((h) => h.instanceId !== chosen.instanceId),
                manaZone: [...oppS.manaZone, toManaCard(chosen)]
              }
            }
          };
          const manaOpts = buildZoneOptions(nextState, opp, ['manaZone']);
          if (manaOpts.length > 0) {
            nextState = enqueueInteraction(nextState, {
              type: 'ZONE_SELECTION',
              player,
              sourceCardId: interaction.sourceCardId,
              sourceCardName: interaction.sourceCardName,
              actionKind: 'GIGANDURA_OPP_MANA_TO_HAND',
              prompt: `${interaction.sourceCardName}: Choose 1 card in opponent's mana zone to put into opponent's hand.`,
              options: manaOpts,
              minSelections: 1,
              maxSelections: 1
            });
          }
        }
      }
      break;
    }

    case 'GIGANDURA_OPP_MANA_TO_HAND': {
      if (selectedIds.length > 0) {
        const oppS = nextState.players[opp];
        const chosen = oppS.manaZone.find((m) => m.instanceId === selectedIds[0]);
        if (chosen) {
          nextState = {
            ...nextState,
            players: {
              ...nextState.players,
              [opp]: {
                ...oppS,
                manaZone: oppS.manaZone.filter((m) => m.instanceId !== chosen.instanceId),
                hand: [
                  ...oppS.hand,
                  { instanceId: chosen.instanceId, card: chosen.card, owner: opp }
                ]
              }
            },
            actionLog: [
              ...nextState.actionLog,
              `${interaction.sourceCardName}: put ${chosen.card.name} from ${opp}'s mana zone to hand.`
            ]
          };
        }
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
    } else if (interaction.effectType === 'GIGABEROS_SACRIFICE_TWO' && interaction.targetInstanceId) {
      result = destroyCreature(result, interaction.targetInstanceId);
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

    case 'PEEK_OPP_HAND_AND_DECK': {
      const oppId = getOpponentId(player);
      const oppState = result.players[oppId];
      const handList =
        oppState.hand.length > 0
          ? oppState.hand.map((c) => c.card.name).join(', ')
          : 'empty';
      const topDeckName = oppState.deck[0]?.card.name ?? 'empty';
      return {
        ...result,
        actionLog: [
          ...result.actionLog,
          `${player} peeked with ${interaction.abilityName}: ${oppId}'s hand [${handList}]; top of deck [${topDeckName}].`
        ]
      };
    }

    case 'GIGABEROS_SACRIFICE_TWO': {
      const selfId = interaction.targetInstanceId;
      const othersOpts = buildZoneOptions(
        result,
        player,
        ['battleZone'],
        (o) => o.instanceId !== selfId
      );
      if (othersOpts.length < 2 && selfId) {
        return destroyCreature(result, selfId);
      }
      return enqueueInteraction(result, {
        type: 'ZONE_SELECTION',
        player,
        sourceCardId: interaction.sourceCardId,
        sourceCardName: interaction.abilityName,
        actionKind: 'PLAYER_SACRIFICE_BZ',
        prompt: `${interaction.abilityName}: Choose 2 of your other creatures to destroy.`,
        options: othersOpts,
        minSelections: 2,
        maxSelections: 2
      });
    }

    case 'CAST_FREE_SPELL': {
      const spellCard = interaction.freeSpellCard;
      const shieldId = interaction.freeSpellShieldId;
      if (spellCard && shieldId) {
        const pS = result.players[player];
        const removed = pS.shields.find((s) => s.id === shieldId);
        if (removed) {
          result = {
            ...result,
            players: {
              ...result.players,
              [player]: {
                ...pS,
                shields: pS.shields.filter((s) => s.id !== shieldId)
              }
            }
          };
          result = runRegisteredSpellHook(result, player, spellCard);
          const afterP = result.players[player];
          result = {
            ...result,
            players: {
              ...result.players,
              [player]: {
                ...afterP,
                graveyard: [
                  ...afterP.graveyard,
                  { instanceId: removed.id, card: removed.card, owner: player }
                ]
              }
            }
          };
        }
      }
      return result;
    }

    default:
      return result;
  }
}
