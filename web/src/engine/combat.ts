import type {
  GameState,
  PlayerId,
  CreatureInstance,
  CardInstance,
  AttackTarget,
  CombatState,
  ShieldInstance,
  BlockerChoiceInteraction,
  ShieldTriggerChoiceInteraction,
  PlayerState
} from './types';
import { isSummoningSick } from './evolution.ts';
import {
  destroyCreature,
  resolveSpellEffect,
  isChargerSpell,
  resolveCreatureCIPEffect
} from './spells.ts';
import {
  triggerAttack,
  canCreatureAttackUntapped,
  hasCreatureBlocker,
  hasCreatureSlayer,
  isCreatureUnblockable,
  getCreatureBreakerCount,
  calculateContinuousAuraPower
} from './effects.ts';

export {
  checkStealth,
  isSurvivor,
  getSurvivorSharedAbilities,
  hasCreatureBlocker,
  hasCreatureSlayer,
  isCreatureUnblockable,
  getCreatureBreakerCount,
  calculateContinuousAuraPower
} from './effects.ts';

/**
 * Calculates the total effective combat power of a creature:
 * - Base power from card definition.
 * - Current creature powerModifier (e.g. buffs, debuffs).
 * - powerAttackerBonus if isAttacking is true.
 * - Continuous auras from calculateContinuousAuraPower.
 * - Power cannot be negative (floored at 0).
 */
export function getCreatureEffectivePower(
  creature: CreatureInstance,
  isAttacking: boolean,
  playerState?: PlayerState,
  opponentState?: PlayerState,
  isOpponentsTurn?: boolean
): number {
  const basePower = creature.card.power ?? 0;
  const powerModifier = creature.powerModifier || 0;
  let powerAttackerBonus = isAttacking ? (creature.card.powerAttackerBonus || 0) : 0;
  powerAttackerBonus += isAttacking ? (creature.tempPowerAttackerBonus || 0) : 0;

  if (isAttacking && playerState) {
    if (
      creature.card.name.toLowerCase().includes('bolshack dragon') ||
      /for each fire card in your graveyard/i.test(creature.card.rulesText || '')
    ) {
      const fireCount = playerState.graveyard.filter((c) =>
        c.card.civilizations?.includes('Fire')
      ).length;
      powerAttackerBonus += fireCount * 1000;
    }
  }

  const friendlyBZ = playerState?.battleZone || [];
  const opponentBZ = opponentState?.battleZone || [];

  const aura = calculateContinuousAuraPower(
    creature,
    isAttacking,
    friendlyBZ,
    opponentBZ,
    playerState,
    opponentState,
    isOpponentsTurn
  );

  const totalPowerAttacker = isAttacking ? (powerAttackerBonus + aura.powerAttackerBonus) : 0;
  return Math.max(0, basePower + powerModifier + aura.powerBonus + totalPowerAttacker);
}

/**
 * Validates whether the active player can declare an attack with the given creature on target:
 * - Game must not have already ended.
 * - No active combat or pending interaction.
 * - Phase must be MAIN or ATTACK.
 * - Attacker must belong to active player and be untapped.
 * - Attacker must not have summoning sickness (unless Speed Attacker or Evolution).
 * - Target must be:
 *   - Opponent's tapped creature in the battle zone.
 *   - Opponent's unbroken shield.
 *   - Opponent directly (valid ONLY if opponent has 0 shields).
 */
export function canDeclareAttack(
  state: GameState,
  attackerId: string,
  target: AttackTarget
): { valid: boolean; reason?: string } {
  if (state.winner !== null) {
    return { valid: false, reason: `Game has already ended. Winner: ${state.winner}` };
  }

  if (state.combatState !== null) {
    return { valid: false, reason: 'Combat is already in progress.' };
  }

  if (state.pendingInteraction !== null) {
    return { valid: false, reason: 'A pending interaction must be resolved first.' };
  }

  if (state.phase !== 'MAIN' && state.phase !== 'ATTACK') {
    return { valid: false, reason: `Cannot declare attack during ${state.phase} phase.` };
  }

  const activeId = state.activePlayer;
  const defendingId: PlayerId = activeId === 'player' ? 'opponent' : 'player';
  const activePlayer = state.players[activeId];
  const defendingPlayer = state.players[defendingId];

  const attacker = activePlayer.battleZone.find((c) => c.instanceId === attackerId);
  if (!attacker) {
    return { valid: false, reason: `Attacker creature ${attackerId} not found in battle zone.` };
  }

  if (attacker.isTapped) {
    return { valid: false, reason: 'Creature is already tapped.' };
  }

  if (isSummoningSick(attacker, state.turn, activePlayer.battleZone)) {
    return { valid: false, reason: 'Creature has summoning sickness.' };
  }

  const rules = attacker.card.rulesText || '';
  if (/this creature can't attack(?!\s+players)/i.test(rules)) {
    return { valid: false, reason: `${attacker.card.name} cannot attack.` };
  }
  if (/this creature can't attack players/i.test(rules)) {
    if (target.type === 'shield' || target.type === 'player') {
      return { valid: false, reason: `${attacker.card.name} cannot attack players.` };
    }
  }

  if (target.type === 'creature') {
    const targetCreature = defendingPlayer.battleZone.find(
      (c) => c.instanceId === target.instanceId
    );
    if (!targetCreature) {
      return {
        valid: false,
        reason: `Target creature ${target.instanceId} not found in opponent's battle zone.`
      };
    }
    if (!targetCreature.isTapped && !canCreatureAttackUntapped(attacker, targetCreature)) {
      return { valid: false, reason: 'Cannot attack an untapped creature.' };
    }
  } else if (target.type === 'shield') {
    const unbrokenShields = defendingPlayer.shields.filter((s) => !s.isBroken);
    if (unbrokenShields.length === 0) {
      return { valid: false, reason: 'Opponent has no shields to attack.' };
    }
    const indices: number[] =
      target.indices && target.indices.length > 0
        ? target.indices
        : target.index !== undefined
        ? [target.index]
        : [];

    if (indices.length === 0) {
      return { valid: false, reason: 'No shield target index provided.' };
    }

    if (new Set(indices).size !== indices.length) {
      return { valid: false, reason: 'Duplicate shield indices in attack target.' };
    }

    for (const idx of indices) {
      if (
        idx < 0 ||
        idx >= defendingPlayer.shields.length ||
        defendingPlayer.shields[idx].isBroken
      ) {
        return { valid: false, reason: `Invalid shield target at index ${idx}.` };
      }
    }
  } else if (target.type === 'player') {
    const unbrokenCount = defendingPlayer.shields.filter((s) => !s.isBroken).length;
    if (unbrokenCount > 0) {
      return {
        valid: false,
        reason: 'Cannot directly attack opponent while they have shields.'
      };
    }
  } else {
    return { valid: false, reason: 'Unknown attack target type.' };
  }

  return { valid: true };
}

/**
 * Declares an attack with the specified creature on the chosen target:
 * 1. Validates attack declaration.
 * 2. Taps the attacking creature and advances phase to ATTACK.
 * 3. Checks if defending player controls any untapped blockers.
 *    - If blockers exist: transitions to BLOCK stage and sets pending BLOCK_DECLARATION interaction.
 *    - If no blockers: immediately proceeds to combat resolution.
 * 4. Pure and immutable.
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
  const defendingId: PlayerId = activeId === 'player' ? 'opponent' : 'player';
  const activePlayer = state.players[activeId];
  const attacker = activePlayer.battleZone.find((c) => c.instanceId === attackerId)!;

  // Tap the attacker creature
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

  // Trigger on-attack effects before blockers are declared
  const stateAfterAttackTrigger = triggerAttack(
    stateWithTappedAttacker,
    activeId,
    attacker,
    target
  );

  const curActivePlayer = stateAfterAttackTrigger.players[activeId];
  const curDefendingPlayer = stateAfterAttackTrigger.players[defendingId];
  const curAttacker = curActivePlayer.battleZone.find((c) => c.instanceId === attackerId);

  // If attacker was destroyed during attack trigger, combat ends
  if (!curAttacker) {
    return {
      ...stateAfterAttackTrigger,
      combatState: null
    };
  }

  // Blocker check: any untapped creatures with isBlocker === true
  // Attacker is unblockable if rulesText matches "can't be blocked" OR stealth is active
  const isUnblockable = isCreatureUnblockable(
    curAttacker,
    target,
    curDefendingPlayer.manaZone,
    curActivePlayer.battleZone
  );
  const validBlockers = isUnblockable
    ? []
    : curDefendingPlayer.battleZone.filter(
        (c) => !c.isTapped && hasCreatureBlocker(c, curDefendingPlayer.battleZone)
      );

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

  // No blockers: proceed directly to combat resolution
  const combatState: CombatState = {
    attackerId,
    target,
    blockerId: null,
    stage:
      target.type === 'creature'
        ? 'BATTLE'
        : target.type === 'shield'
        ? 'SHIELD_BREAK'
        : 'BATTLE'
  };

  return resolveCombat({
    ...stateAfterAttackTrigger,
    combatState
  });
}

/**
 * Handles blocker declaration during the BLOCK stage:
 * - If blockerId is null: opponent passes block; attack proceeds to original target.
 * - If blockerId is provided: validates blocker, taps blocker, redirects attack target to blocker,
 *   and proceeds to creature battle resolution.
 * - Pure and immutable.
 */
export function declareBlock(
  state: GameState,
  blockerId: string | null
): GameState {
  if (!state.combatState || state.combatState.stage !== 'BLOCK') {
    throw new Error('No attack currently in blocking step.');
  }

  const activeId = state.activePlayer;
  const defendingId: PlayerId = activeId === 'player' ? 'opponent' : 'player';
  const defendingPlayer = state.players[defendingId];

  if (blockerId === null) {
    // Pass block: proceed to original target
    const origTarget = state.combatState.target;
    const nextStage =
      origTarget.type === 'creature'
        ? 'BATTLE'
        : origTarget.type === 'shield'
        ? 'SHIELD_BREAK'
        : 'BATTLE';

    const stateAfterPass: GameState = {
      ...state,
      pendingInteraction: null,
      combatState: {
        ...state.combatState,
        stage: nextStage
      },
      actionLog: [...state.actionLog, `${defendingId} chose not to block.`]
    };

    return resolveCombat(stateAfterPass);
  }

  // Blocker selected: validate
  const blocker = defendingPlayer.battleZone.find((c) => c.instanceId === blockerId);
  if (!blocker || blocker.isTapped || !hasCreatureBlocker(blocker, defendingPlayer.battleZone)) {
    throw new Error(`Invalid blocker ${blockerId}.`);
  }

  // Tap blocker creature
  const updatedBZ = defendingPlayer.battleZone.map((c) =>
    c.instanceId === blockerId ? { ...c, isTapped: true } : c
  );

  const stateAfterBlock: GameState = {
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

  return resolveCombat(stateAfterBlock);
}

/**
 * Resolves combat resolution for the current combatState:
 * 1. Direct Attack (target.type === 'player'):
 *    - If opponent has 0 shields and unblocked, active player immediately wins!
 * 2. Creature vs Creature Battle (target.type === 'creature'):
 *    - Power comparison with base power, powerModifier, and powerAttackerBonus.
 *    - Lower power destroyed.
 *    - Power tie: both destroyed.
 *    - Slayer: if creature with Slayer is destroyed in battle, opposing creature is also destroyed.
 * 3. Shield Break (target.type === 'shield'):
 *    - Breaks breakerCount shields (1, 2 for Double Breaker, 3 for Triple Breaker).
 *    - Shields moved to opponent's hand.
 *    - Queues Shield Triggers if any broken shields have isShieldTrigger === true.
 * - Pure and immutable.
 */
export function resolveCombat(state: GameState): GameState {
  if (!state.combatState) {
    return state;
  }

  if (state.combatState.stage === 'BLOCK') {
    return state; // Waiting for blocker declaration
  }

  const activeId = state.activePlayer;
  const defendingId: PlayerId = activeId === 'player' ? 'opponent' : 'player';
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

    const attPower = getCreatureEffectivePower(
      attacker,
      true,
      state.players[activeId],
      state.players[defendingId],
      false
    );
    const defPower = getCreatureEffectivePower(
      defender,
      false,
      state.players[defendingId],
      state.players[activeId],
      true
    );

    let destroyAttacker = false;
    let destroyDefender = false;

    if (attPower > defPower) {
      destroyDefender = true;
      if (hasCreatureSlayer(defender, defendingPlayer.battleZone)) {
        destroyAttacker = true;
      }
    } else if (defPower > attPower) {
      destroyAttacker = true;
      if (hasCreatureSlayer(attacker, state.players[activeId].battleZone)) {
        destroyDefender = true;
      }
    } else {
      // Power tie: both destroyed
      destroyAttacker = true;
      destroyDefender = true;
    }

    let nextState: GameState = {
      ...state,
      combatState: null,
      actionLog: [
        ...state.actionLog,
        `Battle: ${attacker.card.name} (${attPower}) vs ${defender.card.name} (${defPower}).`
      ]
    };

    if (destroyDefender) {
      nextState = destroyCreature(nextState, defender.instanceId);
    }
    if (destroyAttacker) {
      nextState = destroyCreature(nextState, attacker.instanceId);
    }

    return nextState;
  }

  // Case 3: Shield Break
  if (target.type === 'shield') {
    const defendingPlayer = state.players[defendingId];
    const unbrokenShields = defendingPlayer.shields.filter((s) => !s.isBroken);

    if (unbrokenShields.length === 0) {
      return { ...state, combatState: null };
    }

    const breakerCount = getCreatureBreakerCount(attacker, state.players[activeId].battleZone);
    const targetIndices: number[] =
      target.indices && target.indices.length > 0
        ? target.indices
        : target.index !== undefined
        ? [target.index]
        : [];

    const shieldsToBreak: ShieldInstance[] = [];
    for (const idx of targetIndices) {
      const shield = defendingPlayer.shields[idx];
      if (shield && !shield.isBroken && !shieldsToBreak.some((x) => x.id === shield.id)) {
        shieldsToBreak.push(shield);
      }
    }

    for (const s of unbrokenShields) {
      if (shieldsToBreak.length >= breakerCount) break;
      if (!shieldsToBreak.some((x) => x.id === s.id)) {
        shieldsToBreak.push(s);
      }
    }

    const breakIds = new Set(shieldsToBreak.map((s) => s.id));
    const nextShields = defendingPlayer.shields.filter((s) => !breakIds.has(s.id));

    const brokenCards: CardInstance[] = shieldsToBreak.map((s) => ({
      instanceId: s.id,
      card: s.card,
      owner: defendingId
    }));

    const nextHand = [...defendingPlayer.hand, ...brokenCards];

    const stateWithBrokenShields: GameState = {
      ...state,
      combatState: null,
      players: {
        ...state.players,
        [defendingId]: {
          ...defendingPlayer,
          shields: nextShields,
          hand: nextHand
        }
      },
      actionLog: [
        ...state.actionLog,
        `${attacker.card.name} broke ${shieldsToBreak.length} shield(s): ${shieldsToBreak
          .map((s) => s.card.name)
          .join(', ')}.`
      ]
    };

    // Shield Trigger detection
    const triggerShields = shieldsToBreak.filter((s) => s.card.isShieldTrigger);

    if (triggerShields.length > 0) {
      const pendingInteraction: ShieldTriggerChoiceInteraction = {
        type: 'SHIELD_TRIGGER_RESOLUTION',
        player: defendingId,
        shieldCards: brokenCards.filter((c) => c.card.isShieldTrigger),
        triggers: triggerShields.map((s) => ({
          shieldId: s.id,
          card: s.card
        }))
      };

      return {
        ...stateWithBrokenShields,
        pendingInteraction,
        actionLog: [
          ...stateWithBrokenShields.actionLog,
          `Shield Trigger(s) detected: ${triggerShields
            .map((s) => s.card.name)
            .join(', ')}!`
        ]
      };
    }

    return stateWithBrokenShields;
  }

  return { ...state, combatState: null };
}

/**
 * Resolves a queued shield trigger card:
 * - If playTrigger is false: card remains in hand; trigger is removed from queue.
 * - If playTrigger is true: card is played for FREE (0 mana):
 *   - Spell: casts immediately with resolveSpellEffect, moves to graveyard (or mana zone if charger).
 *   - Creature: summoned immediately to battle zone without summoning sickness.
 * - When all triggers are resolved, pendingInteraction is cleared.
 * - Pure and immutable.
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
  let handCardIndex = playerState.hand.findIndex(
    (c) => c.instanceId === trigger.shieldId
  );
  if (handCardIndex === -1) {
    handCardIndex = playerState.hand.findIndex(
      (c) => c.card.id === trigger.card.id
    );
  }

  const nextHand =
    handCardIndex !== -1
      ? playerState.hand.filter((_, idx) => idx !== handCardIndex)
      : playerState.hand;

  const stateWithCardRemovedFromHand: GameState = {
    ...state,
    pendingInteraction: nextPending,
    players: {
      ...state.players,
      [player]: {
        ...playerState,
        hand: nextHand
      }
    }
  };

  // If card is a Spell
  if (trigger.card.type === 'Spell') {
    const stateAfterEffect = resolveSpellEffect(
      stateWithCardRemovedFromHand,
      player,
      trigger.card,
      targets
    );

    const isCharger = isChargerSpell(trigger.card);
    const curPlayerState = stateAfterEffect.players[player];

    let nextPlayerState: PlayerState;
    if (isCharger) {
      nextPlayerState = {
        ...curPlayerState,
        manaZone: [
          ...curPlayerState.manaZone,
          {
            instanceId: trigger.shieldId,
            card: trigger.card,
            isTapped: false
          }
        ]
      };
    } else {
      nextPlayerState = {
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
    }

    return {
      ...stateAfterEffect,
      players: {
        ...stateAfterEffect.players,
        [player]: nextPlayerState
      },
      actionLog: [
        ...stateAfterEffect.actionLog,
        `${player} activated Shield Trigger spell: ${trigger.card.name}!`
      ]
    };
  }

  // If card is a Creature
  const newCreature: CreatureInstance = {
    instanceId: trigger.shieldId,
    card: trigger.card,
    owner: player,
    isTapped: false,
    summonedTurn: state.turn - 1, // Ignores summoning sickness
    powerModifier: 0
  };

  let stateWithCreature: GameState = {
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

  return resolveCreatureCIPEffect(stateWithCreature, player, newCreature, targets);
}

/**
 * Checks whether any creature controlled by playerId is required to attack this turn if able
 * (e.g. Deadly Fighter Braid Claw / "attacks each turn if able").
 */
export function hasMandatoryAttackers(state: GameState, playerId: PlayerId): boolean {
  const player = state.players[playerId];
  const opponentId: PlayerId = playerId === 'player' ? 'opponent' : 'player';
  const opponent = state.players[opponentId];

  return player.battleZone.some((creature) => {
    if (creature.isTapped) return false;
    if (isSummoningSick(creature, state.turn, player.battleZone)) return false;

    const rules = creature.card.rulesText || '';
    const isMandatory =
      creature.card.id === 'DM01-074' ||
      /attacks each turn if able/i.test(rules);

    if (!isMandatory) return false;

    const canAttackShields = opponent.shields.some((s) => !s.isBroken);
    const canAttackPlayer = !canAttackShields;
    const canAttackCreature = opponent.battleZone.some((c) => c.isTapped || canCreatureAttackUntapped(creature, c));

    if (/this creature can't attack players/i.test(rules)) {
      return canAttackCreature;
    }
    if (/this creature can't attack(?!\s+players)/i.test(rules)) {
      return false;
    }

    return canAttackShields || canAttackPlayer || canAttackCreature;
  });
}
