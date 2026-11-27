import type { CardDefinition } from '../types/card.ts';
import type {
  CardInstance,
  CreatureInstance,
  GameAction,
  GameState,
  PlayerId,
  ShieldInstance
} from '../engine/types.ts';
import { getCardCivilizations, getOpponentId } from '../engine/cardUtils.ts';
import {
  BEAT_TIMING_PRESETS,
  type CutInSpec,
  type PresentationAnchorRef,
  type PresentationBeat,
  type PresentationEvent,
  type PresentationEventType
} from './types.ts';

let beatSeq = 0;

function makeBeatId(type: PresentationEventType): string {
  beatSeq += 1;
  return `beat-${type}-${beatSeq}`;
}

function suppressOverlays(state: GameState): GameState {
  return {
    ...state,
    pendingInteraction: null,
    winner: null
  };
}

function findRemovedBattleZoneIds(
  prevState: GameState,
  nextState: GameState,
  excludedIds: Set<string> = new Set()
): { destroyed: Array<{ instance: CreatureInstance; owner: PlayerId }> } {
  const destroyed: Array<{ instance: CreatureInstance; owner: PlayerId }> = [];

  for (const pid of ['player', 'opponent'] as const) {
    const prevBZ = prevState.players[pid].battleZone;
    const nextBZIds = new Set(nextState.players[pid].battleZone.map((c) => c.instanceId));
    const nextGYIds = new Set(nextState.players[pid].graveyard.map((c) => c.instanceId));

    for (const creature of prevBZ) {
      if (excludedIds.has(creature.instanceId)) continue;
      if (!nextBZIds.has(creature.instanceId) && nextGYIds.has(creature.instanceId)) {
        destroyed.push({ instance: creature, owner: pid });
      }
    }
  }

  return { destroyed };
}

function collectEvolvedBaitIds(nextState: GameState): Set<string> {
  const ids = new Set<string>();
  const walk = (items?: CardInstance[]) => {
    if (!items) return;
    for (const item of items) {
      ids.add(item.instanceId);
      walk(item.evolvedOn);
    }
  };
  for (const pid of ['player', 'opponent'] as const) {
    for (const creature of nextState.players[pid].battleZone) {
      walk(creature.evolvedOn);
    }
  }
  return ids;
}

function findNewlyBrokenShields(
  prevState: GameState,
  nextState: GameState
): Array<{ shield: ShieldInstance; owner: PlayerId; index: number }> {
  const broken: Array<{ shield: ShieldInstance; owner: PlayerId; index: number }> = [];
  for (const pid of ['player', 'opponent'] as const) {
    const prevShields = prevState.players[pid].shields;
    const nextIntactIds = new Set(
      nextState.players[pid].shields.filter((s) => !s.isBroken).map((s) => s.id)
    );
    prevShields.forEach((shield, index) => {
      if (!shield.isBroken && !nextIntactIds.has(shield.id)) {
        broken.push({ shield, owner: pid, index });
      }
    });
  }
  return broken;
}

function findNewlyDrawnCards(
  prevState: GameState,
  nextState: GameState
): Array<{ card: CardInstance; owner: PlayerId }> {
  const drawn: Array<{ card: CardInstance; owner: PlayerId }> = [];
  for (const pid of ['player', 'opponent'] as const) {
    const prevDeckIds = new Set(prevState.players[pid].deck.map((d) => d.instanceId));
    const prevHandIds = new Set(prevState.players[pid].hand.map((h) => h.instanceId));
    for (const h of nextState.players[pid].hand) {
      if (!prevHandIds.has(h.instanceId) && prevDeckIds.has(h.instanceId)) {
        drawn.push({ card: h, owner: pid });
      }
    }
  }
  return drawn;
}

function buildBeat(
  event: PresentationEvent,
  displayState: GameState,
  opts?: {
    cutIn?: CutInSpec;
    liteDurationOverride?: number;
    dramaDurationOverride?: number;
    hitStopOverride?: number;
    traumaOverride?: number;
  }
): PresentationBeat {
  const preset = BEAT_TIMING_PRESETS[event.type];
  return {
    id: makeBeatId(event.type),
    event,
    displayState: suppressOverlays(displayState),
    durationMs: {
      lite: opts?.liteDurationOverride ?? preset.lite,
      drama: opts?.dramaDurationOverride ?? preset.drama
    },
    hitStopMs: opts?.hitStopOverride ?? preset.hitStopMs,
    trauma: opts?.traumaOverride ?? preset.trauma,
    ...(opts?.cutIn ? { cutIn: opts.cutIn } : {})
  };
}

function hasNewShieldTrigger(prevState: GameState, nextState: GameState): {
  active: boolean;
  card?: CardDefinition;
  player?: PlayerId;
} {
  const nextPending = nextState.pendingInteraction;
  if (
    !nextPending ||
    (nextPending.type !== 'SHIELD_TRIGGER_RESOLUTION' &&
      nextPending.type !== 'SHIELD_TRIGGER_CHOICE')
  ) {
    return { active: false };
  }

  const prevPending = prevState.pendingInteraction;
  const firstNext = nextPending.triggers?.[0];
  const prevIds = new Set(
    prevPending &&
    (prevPending.type === 'SHIELD_TRIGGER_RESOLUTION' ||
      prevPending.type === 'SHIELD_TRIGGER_CHOICE')
      ? (prevPending.triggers || []).map((t) => t.shieldId)
      : []
  );

  if (firstNext && !prevIds.has(firstNext.shieldId)) {
    return { active: true, card: firstNext.card, player: nextPending.player };
  }
  return { active: false };
}

function appendRemovalAndWinBeats(
  beats: PresentationBeat[],
  prevState: GameState,
  nextState: GameState,
  boardVisibleState: GameState,
  attackerRef?: PresentationAnchorRef,
  excludedDestructionIds: Set<string> = new Set()
): void {
  const brokenShields = findNewlyBrokenShields(prevState, nextState);
  if (brokenShields.length > 0) {
    const shieldTargets: PresentationAnchorRef[] = brokenShields.map((b) => ({
      player: b.owner,
      zone: 'shields',
      instanceId: b.shield.id,
      shieldIndex: b.index
    }));
    const shieldBreakSnapshot: GameState = {
      ...nextState,
      players: {
        player: {
          ...nextState.players.player,
          shields: boardVisibleState.players.player.shields
        },
        opponent: {
          ...nextState.players.opponent,
          shields: boardVisibleState.players.opponent.shields
        }
      }
    };
    beats.push(
      buildBeat(
        {
          type: 'SHIELD_BROKEN',
          actor: getOpponentId(brokenShields[0].owner),
          source: attackerRef,
          targets: shieldTargets,
          meta: { breakerCount: brokenShields.length }
        },
        shieldBreakSnapshot
      )
    );
  }

  const stCheck = hasNewShieldTrigger(prevState, nextState);
  if (stCheck.active && stCheck.card && stCheck.player) {
    beats.push(
      buildBeat(
        {
          type: 'SHIELD_TRIGGER',
          actor: stCheck.player,
          card: stCheck.card,
          civilizations: getCardCivilizations(stCheck.card)
        },
        nextState,
        {
          cutIn: {
            kind: 'SHIELD_TRIGGER',
            title: 'SHIELD TRIGGER!',
            subtitle: stCheck.card.name,
            card: stCheck.card,
            civilizations: getCardCivilizations(stCheck.card)
          }
        }
      )
    );
  }

  const { destroyed } = findRemovedBattleZoneIds(
    boardVisibleState,
    nextState,
    excludedDestructionIds
  );
  if (destroyed.length > 0) {
    const destroySnapshot: GameState = {
      ...nextState,
      players: {
        player: {
          ...nextState.players.player,
          battleZone: boardVisibleState.players.player.battleZone
        },
        opponent: {
          ...nextState.players.opponent,
          battleZone: boardVisibleState.players.opponent.battleZone
        }
      }
    };
    const targets: PresentationAnchorRef[] = destroyed.map((d) => ({
      player: d.owner,
      zone: 'battleZone',
      instanceId: d.instance.instanceId
    }));
    beats.push(
      buildBeat(
        {
          type: 'CREATURE_DESTROYED',
          actor: nextState.activePlayer,
          card: destroyed[0].instance.card,
          civilizations: getCardCivilizations(destroyed[0].instance.card),
          targets
        },
        destroySnapshot
      )
    );
  }

  if (nextState.winner && !prevState.winner) {
    const winActor = nextState.winner;
    const winCard = nextState.players[winActor].battleZone[0]?.card;
    beats.push(
      buildBeat(
        {
          type: 'GAME_OVER',
          actor: winActor,
          card: winCard,
          civilizations: winCard ? getCardCivilizations(winCard) : ['Light']
        },
        nextState,
        winCard
          ? {
              cutIn: {
                kind: 'FINAL_BLOW',
                title: winActor === 'player' ? 'DUEL VICTORY!' : 'FINAL BLOW!',
                subtitle: winCard.name,
                card: winCard,
                civilizations: getCardCivilizations(winCard)
              }
            }
          : undefined
      )
    );
  }
}

/**
 * Pure presentation compiler mapping canonical engine transitions `(prev, action, next)`
 * into ordered intermediate `PresentationBeat[]` snapshots so combat & destruction animations
 * play smoothly before units vanish or interrupt modals appear.
 */
export function compilePresentationBeats(
  prevState: GameState,
  action: GameAction | { type: string },
  nextState: GameState
): PresentationBeat[] {
  if (
    action.type === 'RESET_GAME' ||
    action.type === 'TOGGLE_MANA_TAP' ||
    action.type === 'UNDO_CHARGE_MANA'
  ) {
    return [];
  }

  const beats: PresentationBeat[] = [];
  const evolvedBaitIds = collectEvolvedBaitIds(nextState);

  if (action.type === 'CHARGE_MANA') {
    const actor = (action as { player?: PlayerId }).player || prevState.activePlayer;
    const prevIds = new Set(prevState.players[actor].manaZone.map((m) => m.instanceId));
    const added = nextState.players[actor].manaZone.find((m) => !prevIds.has(m.instanceId));
    if (added) {
      beats.push(
        buildBeat(
          {
            type: 'CHARGE_MANA',
            actor,
            card: added.card,
            civilizations: getCardCivilizations(added.card),
            source: { player: actor, zone: 'hand', instanceId: added.instanceId },
            targets: [{ player: actor, zone: 'manaZone', instanceId: added.instanceId }]
          },
          nextState
        )
      );
    }
    return beats;
  }

  if (action.type === 'SUMMON_CREATURE') {
    const actor = (action as { player?: PlayerId }).player || prevState.activePlayer;
    const prevBZIds = new Set(prevState.players[actor].battleZone.map((c) => c.instanceId));
    const arrived = nextState.players[actor].battleZone.find((c) => !prevBZIds.has(c.instanceId));

    if (arrived) {
      const civs = getCardCivilizations(arrived.card);
      const isEvo = Boolean(arrived.evolvedOn && arrived.evolvedOn.length > 0);
      const isVortex = Boolean(isEvo && (arrived.evolvedOn?.length ?? 0) >= 2);

      if (isEvo) {
        // Hold bait creatures visible in BattleZone while Evo portal/cut-in plays
        const preEvolveState: GameState = {
          ...prevState,
          phase: nextState.phase,
          players: {
            ...prevState.players,
            [actor]: {
              ...prevState.players[actor],
              hand: nextState.players[actor].hand,
              manaZone: nextState.players[actor].manaZone
            }
          }
        };
        beats.push(
          buildBeat(
            {
              type: 'EVOLVE',
              actor,
              card: arrived.card,
              civilizations: civs,
              source: { player: actor, zone: 'hand', instanceId: arrived.instanceId },
              targets: arrived.evolvedOn!.map((b) => ({
                player: actor,
                zone: 'battleZone',
                instanceId: b.instanceId
              })),
              meta: { isVortex }
            },
            preEvolveState,
            {
              cutIn: {
                kind: isVortex ? 'VORTEX_EVOLUTION' : 'EVOLUTION',
                title: isVortex ? 'VORTEX FUSION!' : 'EVOLUTION UNLEASHED!',
                subtitle: arrived.card.name,
                card: arrived.card,
                civilizations: civs
              }
            }
          )
        );
      } else {
        const isBoss = (arrived.card.power ?? 0) >= 6000;
        // Hold pre-CIP battle zones intact so Scarlet Skyterror et al. show enemy blockers before wipe
        const summonSnapshot: GameState = {
          ...nextState,
          players: {
            player: {
              ...nextState.players.player,
              battleZone:
                actor === 'player'
                  ? [...prevState.players.player.battleZone, arrived]
                  : prevState.players.player.battleZone,
              shields: prevState.players.player.shields
            },
            opponent: {
              ...nextState.players.opponent,
              battleZone:
                actor === 'opponent'
                  ? [...prevState.players.opponent.battleZone, arrived]
                  : prevState.players.opponent.battleZone,
              shields: prevState.players.opponent.shields
            }
          }
        };
        beats.push(
          buildBeat(
            {
              type: 'SUMMON_CREATURE',
              actor,
              card: arrived.card,
              civilizations: civs,
              source: { player: actor, zone: 'hand', instanceId: arrived.instanceId },
              targets: [{ player: actor, zone: 'battleZone', instanceId: arrived.instanceId }]
            },
            summonSnapshot,
            isBoss
              ? {
                  dramaDurationOverride: 780,
                  hitStopOverride: 70,
                  traumaOverride: 0.45,
                  cutIn: {
                    kind: 'BOSS_SUMMON',
                    title: 'CREATURE SUMMONED!',
                    subtitle: arrived.card.name,
                    card: arrived.card,
                    civilizations: civs
                  }
                }
              : undefined
          )
        );
        appendRemovalAndWinBeats(
          beats,
          prevState,
          nextState,
          summonSnapshot,
          { player: actor, zone: 'battleZone', instanceId: arrived.instanceId },
          evolvedBaitIds
        );
        return beats;
      }

      appendRemovalAndWinBeats(
        beats,
        prevState,
        nextState,
        prevState,
        { player: actor, zone: 'battleZone', instanceId: arrived.instanceId },
        evolvedBaitIds
      );
      return beats;
    }
  }

  if (action.type === 'CAST_SPELL') {
    const actor = (action as { player?: PlayerId; cardInstanceId: string }).player || prevState.activePlayer;
    const castAction = action as { cardInstanceId: string; targets?: string[] };
    const castCard = prevState.players[actor].hand.find((c) => c.instanceId === castAction.cardInstanceId);
    const spellDef = castCard?.card;
    const preEffectBoardState: GameState = {
      ...nextState,
      players: {
        player: {
          ...nextState.players.player,
          battleZone: prevState.players.player.battleZone,
          shields: prevState.players.player.shields
        },
        opponent: {
          ...nextState.players.opponent,
          battleZone: prevState.players.opponent.battleZone,
          shields: prevState.players.opponent.shields
        }
      }
    };

    const targets: PresentationAnchorRef[] = (castAction.targets || []).map((tid) => {
      const inOpp = prevState.players[getOpponentId(actor)].battleZone.some((c) => c.instanceId === tid);
      return {
        player: inOpp ? getOpponentId(actor) : actor,
        zone: 'battleZone',
        instanceId: tid
      };
    });

    beats.push(
      buildBeat(
        {
          type: 'CAST_SPELL',
          actor,
          card: spellDef,
          civilizations: spellDef ? getCardCivilizations(spellDef) : undefined,
          source: { player: actor, zone: 'hand', instanceId: castAction.cardInstanceId },
          targets
        },
        preEffectBoardState
      )
    );

    appendRemovalAndWinBeats(
      beats,
      prevState,
      nextState,
      preEffectBoardState,
      undefined,
      evolvedBaitIds
    );
    return beats;
  }

  if (action.type === 'RESOLVE_SHIELD_TRIGGER' || action.type === 'RESOLVE_TRIGGER') {
    const trigAction = action as { activate?: boolean; playTrigger?: boolean; shieldId: string };
    const activated = trigAction.activate ?? trigAction.playTrigger ?? true;
    if (activated && prevState.pendingInteraction &&
        (prevState.pendingInteraction.type === 'SHIELD_TRIGGER_RESOLUTION' ||
         prevState.pendingInteraction.type === 'SHIELD_TRIGGER_CHOICE')) {
      const trigOwner = prevState.pendingInteraction.player;
      const matched = prevState.pendingInteraction.triggers?.find(
        (t) => t.shieldId === trigAction.shieldId || t.card.id === trigAction.shieldId
      );
      if (matched) {
        const preEffectState: GameState = {
          ...nextState,
          players: {
            player: {
              ...nextState.players.player,
              battleZone: prevState.players.player.battleZone,
              shields: prevState.players.player.shields
            },
            opponent: {
              ...nextState.players.opponent,
              battleZone: prevState.players.opponent.battleZone,
              shields: prevState.players.opponent.shields
            }
          }
        };
        const isSpell = matched.card.type === 'Spell';
        beats.push(
          buildBeat(
            {
              type: isSpell ? 'CAST_SPELL' : 'SUMMON_CREATURE',
              actor: trigOwner,
              card: matched.card,
              civilizations: getCardCivilizations(matched.card)
            },
            isSpell ? preEffectState : nextState
          )
        );
        appendRemovalAndWinBeats(
          beats,
          prevState,
          nextState,
          isSpell ? preEffectState : nextState,
          undefined,
          evolvedBaitIds
        );
        return beats;
      }
    }
  }

  if (action.type === 'DECLARE_ATTACK') {
    const atkAction = action as { attackerInstanceId?: string; attackerId?: string; target: { type: string; index?: number; indices?: number[]; instanceId?: string } };
    const actor = prevState.activePlayer;
    const defId = getOpponentId(actor);
    const attackerId = atkAction.attackerInstanceId || atkAction.attackerId;
    const attackerPrev = prevState.players[actor].battleZone.find((c) => c.instanceId === attackerId);

    const targets: PresentationAnchorRef[] = [];
    if (atkAction.target.type === 'creature' && atkAction.target.instanceId) {
      targets.push({ player: defId, zone: 'battleZone', instanceId: atkAction.target.instanceId });
    } else if (atkAction.target.type === 'shield') {
      const idxList = atkAction.target.indices?.length
        ? atkAction.target.indices
        : atkAction.target.index !== undefined
        ? [atkAction.target.index]
        : [0];
      for (const idx of idxList) {
        const s = prevState.players[defId].shields[idx];
        targets.push({ player: defId, zone: 'shields', instanceId: s?.id, shieldIndex: idx });
      }
    } else if (atkAction.target.type === 'player') {
      targets.push({ player: defId, zone: 'shields' });
    }

    const attackDisplayState: GameState = {
      ...prevState,
      phase: 'ATTACK',
      combatState: nextState.combatState,
      players: {
        ...prevState.players,
        [actor]: {
          ...prevState.players[actor],
          battleZone: prevState.players[actor].battleZone.map((c) =>
            c.instanceId === attackerId ? { ...c, isTapped: true } : c
          )
        }
      }
    };

    beats.push(
      buildBeat(
        {
          type: 'DECLARE_ATTACK',
          actor,
          card: attackerPrev?.card,
          civilizations: attackerPrev ? getCardCivilizations(attackerPrev.card) : undefined,
          source: attackerId ? { player: actor, zone: 'battleZone', instanceId: attackerId } : undefined,
          targets
        },
        attackDisplayState
      )
    );

    // 2-step attack split: if paused in BLOCK_DECLARATION, stop cleanly before any shield break!
    if (nextState.combatState?.stage === 'BLOCK') {
      return beats;
    }

    appendRemovalAndWinBeats(
      beats,
      prevState,
      nextState,
      attackDisplayState,
      attackerId ? { player: actor, zone: 'battleZone', instanceId: attackerId } : undefined,
      evolvedBaitIds
    );
    return beats;
  }

  if (action.type === 'DECLARE_BLOCK') {
    const blkAction = action as { blockerId?: string | null; blockerInstanceId?: string | null };
    const blockerId =
      blkAction.blockerInstanceId !== undefined ? blkAction.blockerInstanceId : blkAction.blockerId ?? null;
    const defId = getOpponentId(prevState.activePlayer);
    const attackerId = prevState.combatState?.attackerId;

    // Never repeat DECLARE_ATTACK on block/pass-block!
    if (blockerId !== null) {
      const blockerPrev = prevState.players[defId].battleZone.find((c) => c.instanceId === blockerId);
      const blockSnapshot: GameState = {
        ...prevState,
        players: {
          ...prevState.players,
          [defId]: {
            ...prevState.players[defId],
            battleZone: prevState.players[defId].battleZone.map((c) =>
              c.instanceId === blockerId ? { ...c, isTapped: true } : c
            )
          }
        }
      };
      beats.push(
        buildBeat(
          {
            type: 'BLOCK',
            actor: defId,
            card: blockerPrev?.card,
            civilizations: blockerPrev ? getCardCivilizations(blockerPrev.card) : undefined,
            source: { player: defId, zone: 'battleZone', instanceId: blockerId },
            targets: attackerId
              ? [{ player: prevState.activePlayer, zone: 'battleZone', instanceId: attackerId }]
              : undefined
          },
          blockSnapshot
        )
      );
      appendRemovalAndWinBeats(beats, prevState, nextState, blockSnapshot, undefined, evolvedBaitIds);
      return beats;
    }

    appendRemovalAndWinBeats(
      beats,
      prevState,
      nextState,
      prevState,
      attackerId ? { player: prevState.activePlayer, zone: 'battleZone', instanceId: attackerId } : undefined,
      evolvedBaitIds
    );
    return beats;
  }

  // General outcomes (Draw, End-of-Turn triggers, Tap ability removal, Target selection removal)
  const drawn = findNewlyDrawnCards(prevState, nextState);
  if (drawn.length > 0) {
    beats.push(
      buildBeat(
        {
          type: 'DRAW',
          actor: drawn[0].owner,
          card: drawn[0].card.card,
          civilizations: getCardCivilizations(drawn[0].card.card),
          source: { player: drawn[0].owner, zone: 'deck' },
          targets: [{ player: drawn[0].owner, zone: 'hand', instanceId: drawn[0].card.instanceId }]
        },
        nextState
      )
    );
  }

  appendRemovalAndWinBeats(beats, prevState, nextState, prevState, undefined, evolvedBaitIds);
  return beats;
}
