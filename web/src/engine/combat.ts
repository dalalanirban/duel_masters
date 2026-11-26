import type {
  GameState,
  PlayerId,
  CreatureInstance,
  AttackTarget,
  CombatState,
  BlockerChoiceInteraction,
  ShieldTriggerChoiceInteraction,
  PlayerState
} from './types.ts';
import { getCardCapabilities, getOpponentId } from './cardUtils.ts';
import {
  checkStealth,
  isSurvivor,
  getSurvivorSharedAbilities,
  hasCreatureBlocker,
  hasCreatureSlayer,
  hasCreatureSpeedAttacker,
  isCreatureUnblockable,
  getCreatureBreakerCount,
  calculateContinuousAuraPower,
  getCreatureEffectivePower,
  canCreatureAttackUntapped,
  canBeBlockedBy,
  canCreatureBeAttackedBy,
  isCreatureSummoningSick,
  canCreatureAttack
} from './continuous.ts';
import {
  breakOpponentShields,
  destroyCreaturesBatch,
  drawCards
} from './zones.ts';
import { triggerAttack, triggerBlocked, triggerUnblocked } from './triggers.ts';
import { resolveSpellEffect, isChargerSpell, resolveCreatureCIPEffect } from './spells.ts';

export {
  checkStealth,
  isSurvivor,
  getSurvivorSharedAbilities,
  hasCreatureBlocker,
  hasCreatureSlayer,
  hasCreatureSpeedAttacker,
  isCreatureUnblockable,
  getCreatureBreakerCount,
  calculateContinuousAuraPower,
  getCreatureEffectivePower,
  canCreatureAttackUntapped,
  canBeBlockedBy,
  canCreatureBeAttackedBy,
  isCreatureSummoningSick,
  canCreatureAttack
};

/**
 * Validates whether the active player can declare an attack with the given creature on target.
 * Delegates all card-specific summoning-sickness, tap, protection, and restriction rules to `continuous.canCreatureAttack`.
 */
export function canDeclareAttack(
  state: GameState,
  attackerId: string,
  target: AttackTarget
): { valid: boolean; reason?: string } {
  if (Boolean(state.winner)) {
    return { valid: false, reason: `Game has already ended. Winner: ${state.winner}` };
  }

  if (state.combatState !== null && state.combatState !== undefined) {
    return { valid: false, reason: 'Combat is already in progress.' };
  }

  if (state.pendingInteraction !== null && state.pendingInteraction !== undefined) {
    return { valid: false, reason: 'A pending interaction must be resolved first.' };
  }

  if (state.phase !== 'MAIN' && state.phase !== 'ATTACK') {
    return { valid: false, reason: `Cannot declare attack during ${state.phase} phase.` };
  }

  const activeId = state.activePlayer;
  const activePlayer = state.players[activeId];
  const attacker = activePlayer.battleZone.find((c) => c.instanceId === attackerId);
  if (!attacker) {
    return { valid: false, reason: `Attacker creature ${attackerId} not found in battle zone.` };
  }

  return canCreatureAttack(state, attacker, target, activeId);
}

/**
 * Checks whether any untapped blocker available to the defending player has a forced-block rule
 * against this attacker (e.g. Storm Wrangler).
 */
function hasForcedBlocker(
  state: GameState,
  attackerId: string,
  validBlockerIds: string[]
): boolean {
  const defendingId = getOpponentId(state.activePlayer);
  return state.players[defendingId].battleZone.some(
    (b) => validBlockerIds.includes(b.instanceId) && b.tempMustBlockTargetId === attackerId
  );
}

/**
 * Enters either BLOCK stage (if legal blockers exist) or runs on-unblocked triggers and combat resolution.
 */
function continueAfterAttackTriggers(
  stateAfterAttackTrigger: GameState,
  attackerId: string,
  target: AttackTarget
): GameState {
  if (Boolean(stateAfterAttackTrigger.winner)) {
    return { ...stateAfterAttackTrigger, combatState: null };
  }

  const activeId = stateAfterAttackTrigger.activePlayer;
  const defendingId = getOpponentId(activeId);
  const curActivePlayer = stateAfterAttackTrigger.players[activeId];
  const curDefendingPlayer = stateAfterAttackTrigger.players[defendingId];
  const curAttacker = curActivePlayer.battleZone.find((c) => c.instanceId === attackerId);

  // If attacker was destroyed or removed during attack trigger, combat ends cleanly
  if (!curAttacker) {
    return {
      ...stateAfterAttackTrigger,
      combatState: null
    };
  }

  // Compute per-blocker legal blockers via Single Source of Truth (`canBeBlockedBy`)
  const validBlockers = curDefendingPlayer.battleZone.filter((c) =>
    canBeBlockedBy(curAttacker, c, target, stateAfterAttackTrigger)
  );

  // If attack triggers opened a pending interaction (e.g. Aura Pegasus deck play -> CIP target/search),
  // hold combat at ATTACK stage so the reducer resumes blocker checks once that interaction clears.
  if (stateAfterAttackTrigger.pendingInteraction) {
    return {
      ...stateAfterAttackTrigger,
      combatState: {
        attackerId,
        target,
        blockerId: null,
        stage: 'ATTACK'
      }
    };
  }

  if (validBlockers.length > 0) {
    const combatState: CombatState = {
      attackerId,
      target,
      blockerId: null,
      stage: 'BLOCK'
    };

    const pendingInteraction: BlockerChoiceInteraction = {
      type: 'BLOCK_DECLARATION',
      defendingPlayer: defendingId,
      attackerId,
      validBlockerIds: validBlockers.map((b) => b.instanceId)
    };

    return {
      ...stateAfterAttackTrigger,
      combatState,
      pendingInteraction,
      actionLog: [
        ...stateAfterAttackTrigger.actionLog,
        `${defendingId} has ${validBlockers.length} blocker(s) available.`
      ]
    };
  }

  // No legal blockers: fire "is attacking ... and isn't blocked" abilities first
  const stateAfterUnblocked = triggerUnblocked(
    stateAfterAttackTrigger,
    activeId,
    curAttacker,
    target
  );

  const stage: CombatState['stage'] =
    target.type === 'shield' ? 'SHIELD_BREAK' : 'BATTLE';

  return resolveCombat({
    ...stateAfterUnblocked,
    combatState: {
      attackerId,
      target,
      blockerId: null,
      stage
    }
  });
}

/**
 * Declares an attack with the specified creature on the chosen target:
 * 1. Validates attack declaration.
 * 2. Taps the attacker and sets phase to ATTACK.
 * 3. Fires `triggerAttack` abilities.
 * 4. Checks legal blockers with `canBeBlockedBy` (per-blocker rules + Stealth + Ninja Pumpkin + Storm Wrangler).
 * 5. Enters BLOCK_DECLARATION or runs `triggerUnblocked` and `resolveCombat`.
 */
export function declareAttack(
  state: GameState,
  attackerId: string,
  target: AttackTarget
): GameState {
  const check = canDeclareAttack(state, attackerId, target);
  if (!check.valid) {
    throw new Error(check.reason || 'Invalid attack declaration.');
  }

  const activeId = state.activePlayer;
  const activePlayer = state.players[activeId];
  const attacker = activePlayer.battleZone.find((c) => c.instanceId === attackerId)!;

  const updatedBattleZone = activePlayer.battleZone.map((c) =>
    c.instanceId === attackerId ? { ...c, isTapped: true } : c
  );

  const stateWithTappedAttacker: GameState = {
    ...state,
    phase: 'ATTACK',
    players: {
      ...state.players,
      [activeId]: {
        ...activePlayer,
        battleZone: updatedBattleZone
      }
    },
    actionLog: [
      ...state.actionLog,
      `${activeId} declared attack with ${attacker.card.name}.`
    ]
  };

  const stateAfterAttackTrigger = triggerAttack(
    stateWithTappedAttacker,
    activeId,
    attacker,
    target
  );

  return continueAfterAttackTriggers(stateAfterAttackTrigger, attackerId, target);
}

/**
 * Resumes an attack paused during attack triggers once its pending interaction has cleared.
 */
export function resumeCombatAfterInteraction(state: GameState): GameState {
  if (!state.combatState || state.pendingInteraction) {
    return state;
  }
  if (state.combatState.stage === 'ATTACK') {
    return continueAfterAttackTriggers(
      state,
      state.combatState.attackerId,
      state.combatState.target
    );
  }
  if (state.combatState.stage === 'BATTLE' || state.combatState.stage === 'SHIELD_BREAK') {
    return resolveCombat(state);
  }
  return state;
}

/**
 * Handles blocker declaration during the BLOCK stage:
 * - If blockerId is null: fires `triggerUnblocked` and resolves the original target.
 * - If blockerId is provided: validates via `canBeBlockedBy`, taps blocker, fires `triggerBlocked`,
 *   redirects attack to blocker, and resolves battle.
 */
export function declareBlock(
  state: GameState,
  blockerId: string | null
): GameState {
  if (!state.combatState || state.combatState.stage !== 'BLOCK') {
    throw new Error('No attack currently in blocking step.');
  }

  const activeId = state.activePlayer;
  const defendingId = getOpponentId(activeId);
  const attackerId = state.combatState.attackerId;
  const attacker = state.players[activeId].battleZone.find((c) => c.instanceId === attackerId);
  const origTarget = state.combatState.target;

  if (blockerId === null) {
    // Enforce Storm Wrangler forced block if the forced blocker is still legal
    if (
      state.pendingInteraction?.type === 'BLOCK_DECLARATION' &&
      hasForcedBlocker(state, attackerId, state.pendingInteraction.validBlockerIds)
    ) {
      throw new Error('You must block with the forced blocker.');
    }

    const baseAfterPass: GameState = {
      ...state,
      pendingInteraction: null,
      actionLog: [...state.actionLog, `${defendingId} chose not to block.`]
    };

    const stateAfterUnblocked = attacker
      ? triggerUnblocked(baseAfterPass, activeId, attacker, origTarget)
      : baseAfterPass;

    const nextStage: CombatState['stage'] =
      origTarget.type === 'shield' ? 'SHIELD_BREAK' : 'BATTLE';

    return resolveCombat({
      ...stateAfterUnblocked,
      combatState: {
        ...state.combatState,
        stage: nextStage
      }
    });
  }

  const blocker = state.players[defendingId].battleZone.find((c) => c.instanceId === blockerId);
  if (
    !blocker ||
    !attacker ||
    !canBeBlockedBy(attacker, blocker, origTarget, state)
  ) {
    throw new Error(`Invalid blocker ${blockerId}.`);
  }

  const defendingPlayer = state.players[defendingId];
  const updatedBZ = defendingPlayer.battleZone.map((c) =>
    c.instanceId === blockerId ? { ...c, isTapped: true } : c
  );
  const tappedBlocker = updatedBZ.find((c) => c.instanceId === blockerId)!;

  const stateWithTappedBlocker: GameState = {
    ...state,
    pendingInteraction: null,
    combatState: {
      ...state.combatState,
      blockerId,
      target: { type: 'creature', instanceId: blockerId },
      stage: 'BATTLE'
    },
    players: {
      ...state.players,
      [defendingId]: {
        ...defendingPlayer,
        battleZone: updatedBZ
      }
    },
    actionLog: [...state.actionLog, `${defendingId} blocked with ${blocker.card.name}.`]
  };

  // Fire blocked abilities (Emperor Maroll, Avalanche Giant, Splinterclaw Wasp, Storm Wrangler, Coliseum Shell, Carbonite Scarab, Agira)
  const stateAfterBlocked = triggerBlocked(
    stateWithTappedBlocker,
    activeId,
    attacker,
    tappedBlocker
  );

  return resolveCombat(stateAfterBlocked);
}

/**
 * Resolves active combat once blocking is settled:
 * 1. Direct Attack -> immediate win if 0 unbroken shields.
 * 2. Creature vs Creature Battle -> Chekicul/Badlands Lizard/Choya skip-battle check,
 *    power comparison + Slayer, simultaneous destruction, post-battle self-destruct (Bloody Squito,
 *    Dark Clown, Vile Mulder), post-battle untap (Spiral Grass, La Byle, Kuukai, Fists of Forever).
 * 3. Shield Break -> `breakOpponentShields` (Shield Burn, Kyuroro, Cryptic Totem, Fu Reil, Gigabolver,
 *    Turbo Rush tracking, ST queueing) + Miracle Quest draw.
 */
export function resolveCombat(state: GameState): GameState {
  if (!state.combatState) {
    return state;
  }

  if (state.combatState.stage === 'BLOCK' || state.combatState.stage === 'ATTACK') {
    return state;
  }

  const activeId = state.activePlayer;
  const defendingId = getOpponentId(activeId);
  const attacker = state.players[activeId].battleZone.find(
    (c) => c.instanceId === state.combatState!.attackerId
  );

  if (!attacker) {
    return { ...state, combatState: null };
  }

  const target = state.combatState.target;

  // Case 1: Direct Attack on player
  if (target.type === 'player') {
    const defendingPlayer = state.players[defendingId];
    const unbrokenShields = defendingPlayer.shields.filter((s) => !s.isBroken);

    if (unbrokenShields.length === 0) {
      return {
        ...state,
        winner: activeId,
        combatState: null,
        actionLog: [
          ...state.actionLog,
          `${attacker.card.name} attacked ${defendingId} directly! ${activeId} wins the duel!`
        ]
      };
    }

    return { ...state, combatState: null };
  }

  // Case 2: Creature vs Creature Battle
  if (target.type === 'creature') {
    const defendingPlayer = state.players[defendingId];
    const defender = defendingPlayer.battleZone.find(
      (c) => c.instanceId === target.instanceId
    );

    if (!defender) {
      return { ...state, combatState: null };
    }

    const attCaps = getCardCapabilities(attacker.card);
    const defCaps = getCardCapabilities(defender.card);
    const wasBlocked = Boolean(state.combatState.blockerId === defender.instanceId);

    // Badlands Lizard / Choya / Chekicul: "Whenever this creature becomes blocked / blocks, no battle happens."
    if (
      wasBlocked &&
      (attCaps.noBattleWhenBlocked ||
        attCaps.noBattleOnBlock ||
        defCaps.noBattleOnBlock ||
        defCaps.noBattleWhenBlocked)
    ) {
      return {
        ...state,
        combatState: null,
        actionLog: [
          ...state.actionLog,
          `${attacker.card.name} vs ${defender.card.name}: no battle happens.`
        ]
      };
    }

    const attPower = getCreatureEffectivePower(
      attacker,
      true,
      state.players[activeId],
      state.players[defendingId],
      false,
      state
    );
    const defPower = getCreatureEffectivePower(
      defender,
      false,
      state.players[defendingId],
      state.players[activeId],
      true,
      state
    );

    const attackerWon = attPower > defPower;
    const defenderWon = defPower > attPower;
    const isTie = attPower === defPower;

    const attHasSlayer = hasCreatureSlayer(
      attacker,
      state.players[activeId].battleZone,
      state.players[defendingId].battleZone,
      state.players[activeId]
    );
    const defHasSlayer = hasCreatureSlayer(
      defender,
      defendingPlayer.battleZone,
      state.players[activeId].battleZone,
      defendingPlayer
    );

    const destroyDefenderFromBattle = attackerWon || isTie || (defenderWon && attHasSlayer);
    const destroyAttackerFromBattle = defenderWon || isTie || (attackerWon && defHasSlayer);

    let nextState: GameState = {
      ...state,
      combatState: null,
      actionLog: [
        ...state.actionLog,
        `Battle: ${attacker.card.name} (${attPower}) vs ${defender.card.name} (${defPower}).`
      ]
    };

    const simultaneousIds: string[] = [];
    if (destroyDefenderFromBattle) simultaneousIds.push(defender.instanceId);
    if (destroyAttackerFromBattle) simultaneousIds.push(attacker.instanceId);

    if (simultaneousIds.length > 0) {
      nextState = destroyCreaturesBatch(nextState, simultaneousIds);
    }

    // Post-battle self-destruction:
    // - Bloody Squito / Dark Clown: "When this creature wins a battle, destroy it."
    // - Vile Mulder: "When this creature battles, destroy it after the battle."
    const postDestroyIds: string[] = [];
    if (
      attackerWon &&
      /when this creature wins a battle,\s*destroy it/i.test(attacker.card.rulesText || '') &&
      nextState.players[activeId].battleZone.some((c) => c.instanceId === attacker.instanceId)
    ) {
      postDestroyIds.push(attacker.instanceId);
    }
    if (
      defenderWon &&
      /when this creature wins a battle,\s*destroy it/i.test(defender.card.rulesText || '') &&
      nextState.players[defendingId].battleZone.some((c) => c.instanceId === defender.instanceId)
    ) {
      postDestroyIds.push(defender.instanceId);
    }
    if (
      (attacker.tempDestroyAfterBattle ||
        /when this creature battles,\s*destroy it after the battle/i.test(attacker.card.rulesText || '')) &&
      nextState.players[activeId].battleZone.some((c) => c.instanceId === attacker.instanceId) &&
      !postDestroyIds.includes(attacker.instanceId)
    ) {
      postDestroyIds.push(attacker.instanceId);
    }
    if (
      (defender.tempDestroyAfterBattle ||
        /when this creature battles,\s*destroy it after the battle/i.test(defender.card.rulesText || '')) &&
      nextState.players[defendingId].battleZone.some((c) => c.instanceId === defender.instanceId) &&
      !postDestroyIds.includes(defender.instanceId)
    ) {
      postDestroyIds.push(defender.instanceId);
    }

    if (postDestroyIds.length > 0) {
      nextState = destroyCreaturesBatch(nextState, postDestroyIds);
    }

    // Post-battle untap abilities:
    // - Spiral Grass / La Byle / Kuukai: "Whenever this creature blocks, untap it after it battles."
    if (
      wasBlocked &&
      /whenever this creature blocks,\s*untap it after it battles/i.test(defender.card.rulesText || '')
    ) {
      const defStillInBZ = nextState.players[defendingId].battleZone.some(
        (c) => c.instanceId === defender.instanceId && c.isTapped
      );
      if (defStillInBZ) {
        nextState = {
          ...nextState,
          players: {
            ...nextState.players,
            [defendingId]: {
              ...nextState.players[defendingId],
              battleZone: nextState.players[defendingId].battleZone.map((c) =>
                c.instanceId === defender.instanceId ? { ...c, isTapped: false } : c
              )
            }
          },
          actionLog: [...nextState.actionLog, `${defender.card.name} untapped after battling.`]
        };
      }
    }

    // - Fists of Forever: untap winning creature if marked with tempUntapOnWinBattle
    if (attackerWon && attacker.tempUntapOnWinBattle) {
      const attStillTapped = nextState.players[activeId].battleZone.some(
        (c) => c.instanceId === attacker.instanceId && c.isTapped
      );
      if (attStillTapped) {
        nextState = {
          ...nextState,
          players: {
            ...nextState.players,
            [activeId]: {
              ...nextState.players[activeId],
              battleZone: nextState.players[activeId].battleZone.map((c) =>
                c.instanceId === attacker.instanceId ? { ...c, isTapped: false } : c
              )
            }
          },
          actionLog: [...nextState.actionLog, `Fists of Forever untapped ${attacker.card.name}!`]
        };
      }
    }
    if (defenderWon && defender.tempUntapOnWinBattle) {
      const defStillTapped = nextState.players[defendingId].battleZone.some(
        (c) => c.instanceId === defender.instanceId && c.isTapped
      );
      if (defStillTapped) {
        nextState = {
          ...nextState,
          players: {
            ...nextState.players,
            [defendingId]: {
              ...nextState.players[defendingId],
              battleZone: nextState.players[defendingId].battleZone.map((c) =>
                c.instanceId === defender.instanceId ? { ...c, isTapped: false } : c
              )
            }
          },
          actionLog: [...nextState.actionLog, `Fists of Forever untapped ${defender.card.name}!`]
        };
      }
    }

    return nextState;
  }

  // Case 3: Shield Break
  if (target.type === 'shield') {
    const defendingPlayer = state.players[defendingId];
    const shieldsBefore = defendingPlayer.shields.filter((s) => !s.isBroken).length;

    if (shieldsBefore === 0) {
      return { ...state, combatState: null };
    }

    const breakerCount = getCreatureBreakerCount(
      attacker,
      state.players[activeId].battleZone,
      defendingPlayer.battleZone,
      state,
      activeId
    );
    const targetIndices: number[] =
      target.indices && target.indices.length > 0
        ? target.indices
        : target.index !== undefined
        ? [target.index]
        : [];

    let nextState = breakOpponentShields(
      { ...state, combatState: null },
      activeId,
      breakerCount,
      {
        attacker,
        targetIndices,
        trackTurboRushAttackerId: attacker.instanceId
      }
    );

    const shieldsAfter = nextState.players[defendingId].shields.filter((s) => !s.isBroken).length;
    const brokenCount = shieldsBefore - shieldsAfter;

    // Miracle Quest: draw N cards per shield broken when creature finishes attacking
    const drawPerShield = nextState.players[activeId].tempDrawPerShieldBrokenOnAttack || 0;
    if (brokenCount > 0 && drawPerShield > 0) {
      nextState = drawCards(nextState, activeId, brokenCount * drawPerShield);
    }

    return nextState;
  }

  return { ...state, combatState: null };
}

/**
 * Resolves a queued shield trigger card without clobbering follow-up Shield Triggers
 * when the first Shield Trigger opens a TARGET_SELECTION, DECK_SEARCH, or OPTIONAL_CHOICE interaction.
 */
export function resolveShieldTrigger(
  state: GameState,
  shieldCardId: string,
  playTrigger: boolean,
  targets?: string[]
): GameState {
  if (
    !state.pendingInteraction ||
    (state.pendingInteraction.type !== 'SHIELD_TRIGGER_RESOLUTION' &&
      state.pendingInteraction.type !== 'SHIELD_TRIGGER_CHOICE')
  ) {
    throw new Error('No shield trigger currently pending resolution.');
  }

  const trigger = state.pendingInteraction.triggers?.find(
    (t) => t.shieldId === shieldCardId || t.card.id === shieldCardId
  );

  if (!trigger) {
    throw new Error(`Trigger for shield card ${shieldCardId} not found in pending triggers.`);
  }

  const player = state.pendingInteraction.player;
  const playerState = state.players[player];

  const remainingTriggers = (state.pendingInteraction.triggers || []).filter(
    (t) => t.shieldId !== trigger.shieldId
  );

  const nextPending: ShieldTriggerChoiceInteraction | null =
    remainingTriggers.length > 0
      ? {
          type: 'SHIELD_TRIGGER_RESOLUTION',
          player,
          shieldCards: (state.pendingInteraction.shieldCards || []).filter(
            (c) => c.instanceId !== trigger.shieldId
          ),
          triggers: remainingTriggers
        }
      : null;

  // Case A: Player chooses not to use shield trigger
  if (!playTrigger) {
    return {
      ...state,
      pendingInteraction: nextPending,
      actionLog: [
        ...state.actionLog,
        `${player} chose not to use Shield Trigger for ${trigger.card.name}.`
      ]
    };
  }

  // Case B: Player uses shield trigger: play for FREE (0 mana)
  let handCardIndex = playerState.hand.findIndex((c) => c.instanceId === trigger.shieldId);
  if (handCardIndex === -1) {
    handCardIndex = playerState.hand.findIndex((c) => c.card.id === trigger.card.id);
  }

  const nextHand =
    handCardIndex !== -1
      ? playerState.hand.filter((_, idx) => idx !== handCardIndex)
      : playerState.hand;

  const queuedWithRemaining = nextPending
    ? [nextPending, ...(state.pendingTriggerQueue || [])]
    : state.pendingTriggerQueue;

  const stateWithCardRemovedFromHand: GameState = {
    ...state,
    pendingInteraction: null,
    pendingTriggerQueue: queuedWithRemaining,
    players: {
      ...state.players,
      [player]: {
        ...playerState,
        hand: nextHand
      }
    }
  };

  // Spell Shield Trigger
  if (trigger.card.type === 'Spell') {
    const stateBeforeSpellEffect: GameState = {
      ...stateWithCardRemovedFromHand,
      actionLog: [
        ...stateWithCardRemovedFromHand.actionLog,
        `${player} activated Shield Trigger spell: ${trigger.card.name}!`
      ]
    };

    const stateAfterEffect = resolveSpellEffect(
      stateBeforeSpellEffect,
      player,
      trigger.card,
      targets
    );

    const isCharger = isChargerSpell(trigger.card);
    const curPlayerState = stateAfterEffect.players[player];

    const nextPlayerState: PlayerState = isCharger
      ? {
          ...curPlayerState,
          manaZone: [
            ...curPlayerState.manaZone,
            {
              instanceId: trigger.shieldId,
              card: trigger.card,
              isTapped: false
            }
          ]
        }
      : {
          ...curPlayerState,
          graveyard: [
            ...curPlayerState.graveyard,
            {
              instanceId: trigger.shieldId,
              card: trigger.card,
              owner: player
            }
          ]
        };

    // If spell didn't open a new sub-interaction, pop next Shield Trigger batch right back into pendingInteraction
    let finalPending = stateAfterEffect.pendingInteraction;
    let finalQueue = stateAfterEffect.pendingTriggerQueue;
    if (!finalPending && finalQueue && finalQueue.length > 0) {
      const [head, ...rest] = finalQueue;
      finalPending = head;
      finalQueue = rest.length > 0 ? rest : undefined;
    }

    return {
      ...stateAfterEffect,
      pendingInteraction: finalPending,
      pendingTriggerQueue: finalQueue,
      players: {
        ...stateAfterEffect.players,
        [player]: nextPlayerState
      }
    };
  }

  // Creature Shield Trigger: summoned on opponent's turn can attack on this player's next turn
  const summonedTurn = player === state.activePlayer ? state.turn : state.turn - 1;
  const newCreature: CreatureInstance = {
    instanceId: trigger.shieldId,
    card: trigger.card,
    owner: player,
    isTapped: false,
    summonedTurn,
    powerModifier: 0
  };

  const stateWithCreature: GameState = {
    ...stateWithCardRemovedFromHand,
    players: {
      ...stateWithCardRemovedFromHand.players,
      [player]: {
        ...stateWithCardRemovedFromHand.players[player],
        battleZone: [
          ...stateWithCardRemovedFromHand.players[player].battleZone,
          newCreature
        ]
      }
    },
    actionLog: [
      ...stateWithCardRemovedFromHand.actionLog,
      `${player} summoned Shield Trigger creature: ${trigger.card.name}!`
    ]
  };

  const stateAfterCIP = resolveCreatureCIPEffect(stateWithCreature, player, newCreature, targets);

  // If CIP opened no sub-interaction, immediately surface the queued follow-up Shield Trigger
  if (!stateAfterCIP.pendingInteraction && stateAfterCIP.pendingTriggerQueue && stateAfterCIP.pendingTriggerQueue.length > 0) {
    const [head, ...rest] = stateAfterCIP.pendingTriggerQueue;
    return {
      ...stateAfterCIP,
      pendingInteraction: head,
      pendingTriggerQueue: rest.length > 0 ? rest : undefined
    };
  }

  return stateAfterCIP;
}

/**
 * Checks whether any creature controlled by playerId is required to attack this turn if able
 * (e.g. Deadly Fighter Braid Claw / "attacks each turn if able").
 */
export function hasMandatoryAttackers(state: GameState, playerId: PlayerId): boolean {
  const player = state.players[playerId];
  const forcedRaces = player.tempAttacksIfAbleRacesThisTurn || [];

  return player.battleZone.some((creature) => {
    const rules = creature.card.rulesText || '';
    const hasForcedRace =
      forcedRaces.length > 0 &&
      (creature.card.races || []).some((r) => forcedRaces.includes(r.toLowerCase().replace(/[^a-z0-9]/g, '')));

    const isMandatory =
      creature.card.id === 'DM01-074' ||
      Boolean(creature.tempAttacksIfAble) ||
      hasForcedRace ||
      /attacks each turn if able/i.test(rules);
    if (!isMandatory) return false;

    return canCreatureAttack(state, creature, undefined, playerId).valid;
  });
}
