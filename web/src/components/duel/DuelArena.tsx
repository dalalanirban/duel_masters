import React, { useReducer, useState, useEffect, useCallback, useMemo } from 'react';
import { Sparkles, Swords, Shield, Zap, X, Eye, ScrollText, ArrowRight, Bot, CheckCircle2 } from 'lucide-react';
import type { Deck, CardDefinition } from '../../types/card';
import type { PlayerId, GameState, GameAction } from '../../engine/types';
import { initializeGame } from '../../engine/state';
import { step } from '../../engine/reducer';
import { getAiAction } from '../../engine/ai';
import {
  canPayManaCost,
  getEffectiveManaCost,
  validateManualManaSelection
} from '../../engine/mana';
import { getCardCivilizations } from '../../engine/cardUtils';
import {
  isValidEvolutionBait,
  isEvolutionCreature,
  isVortexEvolution,
  findAllValidVortexBaitPairs
} from '../../engine/evolution';
import { getCreatureBreakerCount, canCreatureAttack } from '../../engine/combat';
import { getSpellTargetRequirement } from '../../engine/targeting';
import { canCastSpell } from '../../engine/spells';
import { canActivateTapAbility, hasTapAbility } from '../../engine/tapAbilities';
import { PRESET_DECKS } from '../../data/presets';
import { CARD_MAP } from '../../data/cardLoader';
import { CardInspectorPane } from './CardInspectorPane';
import { DuelLogPane } from './DuelLogPane';
import { ShieldsRow } from './ShieldsRow';
import { BattleZoneView } from './BattleZoneView';
import { HandView } from './HandView';
import { TriggerModal } from './TriggerModal';
import { BlockerModal } from './BlockerModal';
import { GameOverModal } from './GameOverModal';
import { OptionalChoiceModal } from './OptionalChoiceModal';
import { DeckSearchModal } from './DeckSearchModal';
import { ZoneSelectionModal } from './ZoneSelectionModal';
import { SilentSkillModal } from './SilentSkillModal';

interface DuelArenaProps {
  activeDeck: Deck;
  savedDecks?: Deck[];
  onNavigateToBuilder?: () => void;
}

type ArenaAction = GameAction | { type: 'RESET_GAME'; playerDeck: Deck; opponentDeck: Deck };

const arenaReducer = (currentState: GameState, action: ArenaAction): GameState => {
  if (action.type === 'RESET_GAME') {
    return initializeGame(action.playerDeck, action.opponentDeck, 'player', { interactiveHuman: true });
  }
  return step(currentState, action as GameAction);
};

export const DuelArena: React.FC<DuelArenaProps> = ({
  activeDeck,
  savedDecks,
  onNavigateToBuilder
}) => {
  // Available opponent decks (presets + custom saved decks)
  const availableOpponentDecks = useMemo(() => {
    const list: Deck[] = [...PRESET_DECKS];
    if (savedDecks) {
      for (const deck of savedDecks) {
        if (!list.some((d) => d.id === deck.id)) {
          const totalCards = deck.items.reduce((sum, item) => sum + item.count, 0);
          if (totalCards >= 10) {
            list.push(deck);
          }
        }
      }
    }
    return list;
  }, [savedDecks]);

  // Select which deck player and opponent use
  const defaultPlayerDeck = useMemo(() => {
    // If active deck has at least 10 cards, use it; otherwise fallback to Shobu Beatdown
    const totalCards = activeDeck.items.reduce((sum, item) => sum + item.count, 0);
    return totalCards >= 10 ? activeDeck : PRESET_DECKS[0];
  }, [activeDeck]);

  const [selectedPlayerDeck] = useState<Deck>(defaultPlayerDeck);
  const [selectedOpponentDeck, setSelectedOpponentDeck] = useState<Deck>(PRESET_DECKS[1]); // Kokujo Control default

  // Game state reducer
  const [state, dispatch] = useReducer(
    arenaReducer,
    undefined,
    () => initializeGame(selectedPlayerDeck, selectedOpponentDeck, 'player', { interactiveHuman: true })
  );

  // UI state
  const [selectedAttackerId, setSelectedAttackerId] = useState<string | null>(null);
  const [tapChoiceCreatureId, setTapChoiceCreatureId] = useState<string | null>(null);
  const [activeDrawer, setActiveDrawer] = useState<'none' | 'inspector' | 'controls'>('none');
  const [isAutoPlayOpponent, setIsAutoPlayOpponent] = useState<boolean>(true);
  const [inspectedCard, setInspectedCard] = useState<CardDefinition | null>(null);
  const [hoveredCard, setHoveredCard] = useState<CardDefinition | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [turnBanner, setTurnBanner] = useState<{ turn: number; player: PlayerId } | null>(null);

  // Turn change impact banner
  useEffect(() => {
    setTurnBanner({ turn: state.turn, player: state.activePlayer });
    const timer = setTimeout(() => {
      setTurnBanner(null);
    }, 1400);
    return () => clearTimeout(timer);
  }, [state.turn, state.activePlayer]);

  // Evolution bait mode (supports both standard 1-bait and Vortex 2-bait evolutions)
  const [evolutionCandidate, setEvolutionCandidate] = useState<{
    cardInstanceId: string;
    card: CardDefinition;
    isVortex: boolean;
    selectedBaitIds: string[];
    validBaitIds: string[];
  } | null>(null);

  // Spell targeting mode
  const [spellCandidate, setSpellCandidate] = useState<{
    cardInstanceId: string;
    card: CardDefinition;
    validTargetIds: string[];
  } | null>(null);

  // Blocker Arena Selection mode (when user chooses to select a blocker on the battlefield)
  const [blockerArenaSelection, setBlockerArenaSelection] = useState<boolean>(false);

  // Shield Trigger Arena Target Selection mode (when user activates a targeted Shield Trigger)
  const [triggerTargetSelection, setTriggerTargetSelection] = useState<{
    shieldId: string;
    card: CardDefinition;
    validTargetIds: string[];
  } | null>(null);

  // Manual Mana Payment selection mode (user taps exact eligible mana cards after choosing to Summon/Cast)
  const [manaPaymentCandidate, setManaPaymentCandidate] = useState<{
    kind: 'creature' | 'spell';
    cardInstanceId: string;
    card: CardDefinition;
    baitInstanceId?: string;
    baitInstanceIds?: string[];
    targets?: string[];
    selectedManaIds: string[];
  } | null>(null);

  const manaPaymentValidation = useMemo(() => {
    if (!manaPaymentCandidate) return null;
    return validateManualManaSelection(
      state.players.player.manaZone,
      manaPaymentCandidate.card,
      manaPaymentCandidate.selectedManaIds,
      state.players.player.battleZone,
      state.players.opponent.battleZone
    );
  }, [
    manaPaymentCandidate,
    state.players.player.manaZone,
    state.players.player.battleZone,
    state.players.opponent.battleZone
  ]);

  // Multi-shield selection mode
  const [selectedShieldIndices, setSelectedShieldIndices] = useState<number[]>([]);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  }, []);

  // Card Inspection: Hover is transient (clears on mouse leave), click toggles sticky pin
  const handleHoverCard = useCallback((card: CardDefinition | null) => {
    setHoveredCard(card);
  }, []);

  const handleInspectCard = useCallback((card: CardDefinition) => {
    setInspectedCard((prev) => (prev?.id === card.id ? null : card));
  }, []);

  // Restart match handler
  const handleRestart = useCallback(() => {
    setSelectedAttackerId(null);
    setSelectedShieldIndices([]);
    setEvolutionCandidate(null);
    setSpellCandidate(null);
    setBlockerArenaSelection(false);
    setTriggerTargetSelection(null);
    setManaPaymentCandidate(null);
    dispatch({ type: 'RESET_GAME', playerDeck: selectedPlayerDeck, opponentDeck: selectedOpponentDeck });
  }, [selectedPlayerDeck, selectedOpponentDeck]);

  // AI Battle Deck selection handler
  const handleSelectOpponentDeck = useCallback(
    (deckId: string) => {
      const chosen = availableOpponentDecks.find((d) => d.id === deckId);
      if (!chosen) return;
      setSelectedOpponentDeck(chosen);
      setSelectedAttackerId(null);
      setSelectedShieldIndices([]);
      setEvolutionCandidate(null);
      setSpellCandidate(null);
      setBlockerArenaSelection(false);
      setTriggerTargetSelection(null);
      setManaPaymentCandidate(null);
      dispatch({
        type: 'RESET_GAME',
        playerDeck: selectedPlayerDeck,
        opponentDeck: chosen
      });
      showToast(`AI Battle Deck set to: ${chosen.name}. Match restarted.`);
    },
    [availableOpponentDecks, selectedPlayerDeck]
  );


  // AI Step Trigger
  const triggerAiStep = useCallback(() => {
    if (state.winner !== null) return;
    const aiTargetPlayer: PlayerId =
      state.pendingInteraction && 'defendingPlayer' in state.pendingInteraction
        ? state.pendingInteraction.defendingPlayer
        : state.pendingInteraction && 'player' in state.pendingInteraction
        ? state.pendingInteraction.player
        : state.activePlayer;

    // Double-lock guard: AI must never take actions on behalf of the human player
    if (aiTargetPlayer !== 'opponent') {
      return;
    }

    const action = getAiAction(state, 'opponent');
    if (action) {
      dispatch(action);
    }
  }, [state]);

  // Auto-play timer loop for opponent
  useEffect(() => {
    if (!isAutoPlayOpponent || state.winner !== null) return;

    const isPlayerPendingInteraction = Boolean(
      state.pendingInteraction &&
        (('defendingPlayer' in state.pendingInteraction && state.pendingInteraction.defendingPlayer === 'player') ||
         ('player' in state.pendingInteraction && state.pendingInteraction.player === 'player'))
    );

    const isOpponentTurnActive = state.activePlayer === 'opponent' && !isPlayerPendingInteraction;
    const isOpponentPendingInteraction = Boolean(
      state.pendingInteraction &&
        (('defendingPlayer' in state.pendingInteraction && state.pendingInteraction.defendingPlayer === 'opponent') ||
         ('player' in state.pendingInteraction && state.pendingInteraction.player === 'opponent'))
    );

    if (isOpponentTurnActive || isOpponentPendingInteraction) {
      const timer = setTimeout(() => {
        triggerAiStep();
      }, 700);
      return () => clearTimeout(timer);
    }
  }, [isAutoPlayOpponent, state, triggerAiStep]);

  // Clear selected attacker & interactive candidates if turn/phase changes
  useEffect(() => {
    setSelectedAttackerId(null);
    setTapChoiceCreatureId(null);
    setSelectedShieldIndices([]);
    setEvolutionCandidate(null);
    setSpellCandidate(null);
    setManaPaymentCandidate(null);
  }, [state.turn, state.phase, state.activePlayer]);

  // Surface latest engine action error or mana lock warning in toast cleanly
  useEffect(() => {
    const lastLog = state.actionLog[state.actionLog.length - 1];
    if (lastLog && lastLog.startsWith('Action error (')) {
      showToast(lastLog.replace(/^Action error \([^)]+\):\s*/, ''));
    }
  }, [state.actionLog]);

  // Player action: Charge Mana
  const handleChargeMana = (cardInstanceId: string) => {
    setManaPaymentCandidate(null);
    dispatch({ type: 'CHARGE_MANA', player: 'player', cardInstanceId });
  };

  // Enters manual mana tapping flow instead of auto-tapping mana when summoning/casting
  const beginPlayWithManualMana = useCallback(
    (payload: {
      kind: 'creature' | 'spell';
      cardInstanceId: string;
      card: CardDefinition;
      baitInstanceId?: string;
      baitInstanceIds?: string[];
      targets?: string[];
    }) => {
      const playerState = state.players.player;
      const oppState = state.players.opponent;
      const stagedIds = playerState.manaZone
        .filter((m) => m.isTapped && m.isStaged && !m.isSpent)
        .map((m) => m.instanceId);

      const requiredCost = Math.max(
        getEffectiveManaCost(payload.card, playerState.battleZone, oppState.battleZone),
        new Set(getCardCivilizations(payload.card)).size
      );

      if (requiredCost === 0) {
        if (payload.kind === 'creature') {
          dispatch({
            type: 'SUMMON_CREATURE',
            player: 'player',
            cardInstanceId: payload.cardInstanceId,
            baitInstanceId: payload.baitInstanceId,
            baitInstanceIds: payload.baitInstanceIds,
            targets: payload.targets
          });
        } else {
          dispatch({
            type: 'CAST_SPELL',
            player: 'player',
            cardInstanceId: payload.cardInstanceId,
            targets: payload.targets
          });
        }
        return;
      }

      // Honor already-manually-staged exact mana selection if complete and valid; otherwise prompt user to tap mana.
      if (
        stagedIds.length === requiredCost &&
        canPayManaCost(
          playerState.manaZone,
          payload.card,
          playerState.battleZone,
          oppState.battleZone,
          stagedIds
        )
      ) {
        if (payload.kind === 'creature') {
          dispatch({
            type: 'SUMMON_CREATURE',
            player: 'player',
            cardInstanceId: payload.cardInstanceId,
            baitInstanceId: payload.baitInstanceId,
            baitInstanceIds: payload.baitInstanceIds,
            targets: payload.targets,
            manaInstanceIds: stagedIds
          });
        } else {
          dispatch({
            type: 'CAST_SPELL',
            player: 'player',
            cardInstanceId: payload.cardInstanceId,
            targets: payload.targets,
            manaInstanceIds: stagedIds
          });
        }
        return;
      }

      setManaPaymentCandidate({
        ...payload,
        selectedManaIds: stagedIds
      });
    },
    [state.players.player, state.players.opponent]
  );

  const handleTogglePaymentMana = useCallback(
    (cardInstanceId: string, forceSelected?: boolean) => {
      const targetMana = state.players.player.manaZone.find((m) => m.instanceId === cardInstanceId);
      if (!targetMana) return;

      if (targetMana.isSpent) {
        showToast(`${targetMana.card.name} was already spent this turn and cannot be used or untapped.`);
        return;
      }

      if (targetMana.isStaged && forceSelected === false) {
        dispatch({ type: 'TOGGLE_MANA_TAP', player: 'player', cardInstanceId, forceTapped: false });
      }

      setManaPaymentCandidate((prev) => {
        if (!prev) return null;
        const baseCost = getEffectiveManaCost(
          prev.card,
          state.players.player.battleZone,
          state.players.opponent.battleZone
        );
        const requiredCost =
          baseCost === 0 ? 0 : Math.max(baseCost, new Set(getCardCivilizations(prev.card)).size);

        const alreadySelected = prev.selectedManaIds.includes(cardInstanceId);
        const nextSelected = forceSelected !== undefined ? forceSelected : !alreadySelected;

        if (nextSelected === alreadySelected) return prev;

        if (nextSelected) {
          if (prev.selectedManaIds.length >= requiredCost) {
            return prev;
          }
          return {
            ...prev,
            selectedManaIds: [...prev.selectedManaIds, cardInstanceId]
          };
        }

        return {
          ...prev,
          selectedManaIds: prev.selectedManaIds.filter((id) => id !== cardInstanceId)
        };
      });
    },
    [
      state.players.player.manaZone,
      state.players.player.battleZone,
      state.players.opponent.battleZone,
      showToast
    ]
  );

  const handleConfirmManaPayment = useCallback(() => {
    if (!manaPaymentCandidate || !manaPaymentValidation?.valid) return;
    if (manaPaymentCandidate.kind === 'creature') {
      dispatch({
        type: 'SUMMON_CREATURE',
        player: 'player',
        cardInstanceId: manaPaymentCandidate.cardInstanceId,
        baitInstanceId: manaPaymentCandidate.baitInstanceId,
        baitInstanceIds: manaPaymentCandidate.baitInstanceIds,
        targets: manaPaymentCandidate.targets,
        manaInstanceIds: manaPaymentCandidate.selectedManaIds
      });
    } else {
      dispatch({
        type: 'CAST_SPELL',
        player: 'player',
        cardInstanceId: manaPaymentCandidate.cardInstanceId,
        targets: manaPaymentCandidate.targets,
        manaInstanceIds: manaPaymentCandidate.selectedManaIds
      });
    }
    setManaPaymentCandidate(null);
  }, [manaPaymentCandidate, manaPaymentValidation]);

  // Player action: Summon Creature (supports single-bait Evolution & 2-bait Vortex Evolution)
  const handleSummonCreature = (cardInstanceId: string) => {
    const cardInstance = state.players.player.hand.find((c) => c.instanceId === cardInstanceId);
    if (!cardInstance) return;
    setManaPaymentCandidate(null);

    if (isEvolutionCreature(cardInstance.card)) {
      if (isVortexEvolution(cardInstance.card)) {
        const pairs = findAllValidVortexBaitPairs(
          cardInstance.card,
          state.players.player.battleZone
        );
        if (pairs.length === 0) {
          showToast(`No valid bait pair found for Vortex Evolution ${cardInstance.card.name}!`);
          return;
        }
        if (pairs.length === 1) {
          beginPlayWithManualMana({
            kind: 'creature',
            cardInstanceId,
            card: cardInstance.card,
            baitInstanceIds: [pairs[0][0].instanceId, pairs[0][1].instanceId]
          });
          return;
        }
        const validBaitIds = Array.from(
          new Set(pairs.flatMap(([a, b]) => [a.instanceId, b.instanceId]))
        );
        setEvolutionCandidate({
          cardInstanceId,
          card: cardInstance.card,
          isVortex: true,
          selectedBaitIds: [],
          validBaitIds
        });
        showToast(`Select 1st Vortex bait creature for ${cardInstance.card.name}.`);
        return;
      }

      const validBaits = state.players.player.battleZone.filter((b) =>
        isValidEvolutionBait(cardInstance.card, b)
      );

      if (validBaits.length === 0) {
        showToast(`No valid bait creature found for ${cardInstance.card.name}!`);
        return;
      }

      if (validBaits.length === 1) {
        beginPlayWithManualMana({
          kind: 'creature',
          cardInstanceId,
          card: cardInstance.card,
          baitInstanceId: validBaits[0].instanceId
        });
        return;
      }

      setEvolutionCandidate({
        cardInstanceId,
        card: cardInstance.card,
        isVortex: false,
        selectedBaitIds: [],
        validBaitIds: validBaits.map((b) => b.instanceId)
      });
      showToast('Select a creature in your battle zone to evolve onto.');
      return;
    }

    beginPlayWithManualMana({
      kind: 'creature',
      cardInstanceId,
      card: cardInstance.card
    });
  };

  // Player action: Cast Spell (delegates precondition & target resolution to engine)
  const handleCastSpell = (cardInstanceId: string) => {
    const cardInstance = state.players.player.hand.find((c) => c.instanceId === cardInstanceId);
    if (!cardInstance) return;
    setManaPaymentCandidate(null);

    const precondition = canCastSpell(state, 'player', cardInstance.card);
    if (!precondition.allowed) {
      showToast(precondition.reason || `Cannot cast ${cardInstance.card.name} right now!`);
      return;
    }

    const card = cardInstance.card;
    const req = getSpellTargetRequirement(card, state.players.player, state.players.opponent);

    if (req.minTargets > req.validTargetIds.length) {
      showToast(`No valid target creatures in the battle zone for ${card.name}!`);
      return;
    }

    if (req.requiresTarget && req.validTargetIds.length > 0) {
      if (req.validTargetIds.length === 1 && req.minTargets <= 1 && req.maxTargets === 1) {
        beginPlayWithManualMana({
          kind: 'spell',
          cardInstanceId,
          card,
          targets: [req.validTargetIds[0]]
        });
        return;
      }

      setSpellCandidate({
        cardInstanceId,
        card,
        validTargetIds: req.validTargetIds
      });
      showToast(req.prompt || `Select a target creature in the battle zone for ${card.name}.`);
      return;
    }

    beginPlayWithManualMana({
      kind: 'spell',
      cardInstanceId,
      card
    });
  };

  // Evolution bait selected (single bait or 2-step Vortex pair)
  const handleSelectBait = (baitInstanceId: string) => {
    if (!evolutionCandidate) return;

    if (!evolutionCandidate.isVortex) {
      beginPlayWithManualMana({
        kind: 'creature',
        cardInstanceId: evolutionCandidate.cardInstanceId,
        card: evolutionCandidate.card,
        baitInstanceId
      });
      setEvolutionCandidate(null);
      return;
    }

    if (evolutionCandidate.selectedBaitIds.length === 0) {
      const pairs = findAllValidVortexBaitPairs(
        evolutionCandidate.card,
        state.players.player.battleZone
      );
      const partnerIds = Array.from(
        new Set(
          pairs
            .filter(([a, b]) => a.instanceId === baitInstanceId || b.instanceId === baitInstanceId)
            .map(([a, b]) => (a.instanceId === baitInstanceId ? b.instanceId : a.instanceId))
        )
      );

      if (partnerIds.length === 1) {
        beginPlayWithManualMana({
          kind: 'creature',
          cardInstanceId: evolutionCandidate.cardInstanceId,
          card: evolutionCandidate.card,
          baitInstanceIds: [baitInstanceId, partnerIds[0]]
        });
        setEvolutionCandidate(null);
        return;
      }

      setEvolutionCandidate({
        ...evolutionCandidate,
        selectedBaitIds: [baitInstanceId],
        validBaitIds: partnerIds
      });
      showToast(`Select 2nd Vortex bait creature for ${evolutionCandidate.card.name}.`);
      return;
    }

    beginPlayWithManualMana({
      kind: 'creature',
      cardInstanceId: evolutionCandidate.cardInstanceId,
      card: evolutionCandidate.card,
      baitInstanceIds: [evolutionCandidate.selectedBaitIds[0], baitInstanceId]
    });
    setEvolutionCandidate(null);
  };

  // Spell target selected
  const handleSelectSpellTarget = (targetInstanceId: string) => {
    if (!spellCandidate) return;
    beginPlayWithManualMana({
      kind: 'spell',
      cardInstanceId: spellCandidate.cardInstanceId,
      card: spellCandidate.card,
      targets: [targetInstanceId]
    });
    setSpellCandidate(null);
  };

  // Attacker selection / Attack-vs-$tap Ability prompt
  const handleSelectAttacker = (creatureId: string) => {
    if (selectedAttackerId === creatureId) {
      setSelectedAttackerId(null);
      setTapChoiceCreatureId(null);
      setSelectedShieldIndices([]);
      return;
    }

    const attacker = state.players.player.battleZone.find((c) => c.instanceId === creatureId);
    if (
      state.phase === 'ATTACK' &&
      attacker &&
      hasTapAbility(attacker.card) &&
      canActivateTapAbility(state, attacker, 'player').valid
    ) {
      setSelectedAttackerId(null);
      setSelectedShieldIndices([]);
      setTapChoiceCreatureId(creatureId);
      return;
    }

    setTapChoiceCreatureId(null);
    setSelectedAttackerId(creatureId);
    setSelectedShieldIndices([]);
    const breakerCount = attacker
      ? getCreatureBreakerCount(
          attacker,
          state.players.player.battleZone,
          state.players.opponent.battleZone,
          state,
          'player'
        )
      : 1;
    const unbrokenCount = state.players.opponent.shields.filter((s) => !s.isBroken).length;
    const req = Math.min(breakerCount, unbrokenCount);
    if (req > 1) {
      showToast(`Select ${req} opponent shields to break.`);
    } else {
      showToast('Select an opponent shield or creature target to attack!');
    }
  };

  // Attack declaration: target shield
  const handleSelectShieldTarget = (shieldIndex: number) => {
    if (!selectedAttackerId) return;

    if (requiredBreakerCount <= 1) {
      dispatch({
        type: 'DECLARE_ATTACK',
        player: 'player',
        attackerInstanceId: selectedAttackerId,
        target: { type: 'shield', index: shieldIndex, indices: [shieldIndex] }
      });
      setSelectedAttackerId(null);
      setSelectedShieldIndices([]);
      return;
    }

    let nextIndices: number[];
    if (selectedShieldIndices.includes(shieldIndex)) {
      nextIndices = selectedShieldIndices.filter((idx) => idx !== shieldIndex);
      setSelectedShieldIndices(nextIndices);
      showToast(`Unselected shield #${shieldIndex + 1} (${nextIndices.length}/${requiredBreakerCount} selected).`);
      return;
    } else {
      nextIndices = [...selectedShieldIndices, shieldIndex];
    }

    if (nextIndices.length >= requiredBreakerCount) {
      dispatch({
        type: 'DECLARE_ATTACK',
        player: 'player',
        attackerInstanceId: selectedAttackerId,
        target: { type: 'shield', index: nextIndices[0], indices: nextIndices }
      });
      setSelectedAttackerId(null);
      setSelectedShieldIndices([]);
    } else {
      setSelectedShieldIndices(nextIndices);
      showToast(`Selected ${nextIndices.length} of ${requiredBreakerCount} shields.`);
    }
  };

  // Attack declaration: target creature
  const handleSelectCreatureTarget = (targetCreatureId: string) => {
    if (!selectedAttackerId) return;
    dispatch({
      type: 'DECLARE_ATTACK',
      player: 'player',
      attackerInstanceId: selectedAttackerId,
      target: { type: 'creature', instanceId: targetCreatureId }
    });
    setSelectedAttackerId(null);
    setSelectedShieldIndices([]);
  };

  // Attack declaration: direct attack on player (when 0 shields)
  const handleDirectAttack = () => {
    if (!selectedAttackerId) return;
    dispatch({
      type: 'DECLARE_ATTACK',
      player: 'player',
      attackerInstanceId: selectedAttackerId,
      target: { type: 'player' }
    });
    setSelectedAttackerId(null);
    setSelectedShieldIndices([]);
  };

  // Pass phase
  const handlePassPhase = () => {
    setSelectedAttackerId(null);
    setSelectedShieldIndices([]);
    setEvolutionCandidate(null);
    setSpellCandidate(null);
    dispatch({ type: 'PASS_PHASE', player: 'player' });
  };

  // End turn
  const handleEndTurn = () => {
    setSelectedAttackerId(null);
    setSelectedShieldIndices([]);
    setEvolutionCandidate(null);
    setSpellCandidate(null);
    dispatch({ type: 'END_TURN', player: 'player' });
  };

  // Undo mana charge
  const handleUndoChargeMana = () => {
    dispatch({ type: 'UNDO_CHARGE_MANA', player: 'player' });
  };

  const isPlayerTurn = state.activePlayer === 'player';

  // Calculate attack targeting constraints via engine rules
  const selectedAttacker = selectedAttackerId
    ? state.players.player.battleZone.find((c) => c.instanceId === selectedAttackerId)
    : null;

  const firstUnbrokenShieldIndex = state.players.opponent.shields.findIndex((s) => !s.isBroken);
  const oppUnbrokenShieldsCount = state.players.opponent.shields.filter((s) => !s.isBroken).length;
  const attackerBreakerCount = selectedAttacker
    ? getCreatureBreakerCount(
        selectedAttacker,
        state.players.player.battleZone,
        state.players.opponent.battleZone,
        state,
        'player'
      )
    : 1;
  const requiredBreakerCount = Math.min(attackerBreakerCount, oppUnbrokenShieldsCount);

  const canTargetShields = Boolean(
    selectedAttacker &&
    firstUnbrokenShieldIndex !== -1 &&
    canCreatureAttack(
      state,
      selectedAttacker,
      { type: 'shield', index: firstUnbrokenShieldIndex },
      'player'
    ).valid
  );

  const canDirectAttack = Boolean(
    selectedAttacker &&
    oppUnbrokenShieldsCount === 0 &&
    canCreatureAttack(state, selectedAttacker, { type: 'player' }, 'player').valid
  );

  const pendingTargetSelection =
    state.pendingInteraction?.type === 'TARGET_SELECTION' &&
    state.pendingInteraction.player === 'player'
      ? state.pendingInteraction
      : null;

  const canUndoMana = Boolean(
    isPlayerTurn &&
    state.phase === 'MANA_CHARGE' &&
    state.players.player.manaChargedThisTurn
  );

  // Active interaction states for player modals
  const isPlayerTriggerPending =
    Boolean(state.pendingInteraction &&
    (state.pendingInteraction.type === 'SHIELD_TRIGGER_RESOLUTION' ||
      state.pendingInteraction.type === 'SHIELD_TRIGGER_CHOICE') &&
    state.pendingInteraction.player === 'player');

  const isPlayerBlockerPending =
    Boolean(state.pendingInteraction &&
    (state.pendingInteraction.type === 'BLOCK_DECLARATION' ||
      state.pendingInteraction.type === 'BLOCKER_CHOICE') &&
    state.pendingInteraction.defendingPlayer === 'player');

  // Reset arena selection modes when interactions clear
  useEffect(() => {
    if (!isPlayerBlockerPending) {
      setBlockerArenaSelection(false);
    }
  }, [isPlayerBlockerPending]);

  useEffect(() => {
    if (!isPlayerTriggerPending) {
      setTriggerTargetSelection(null);
    }
  }, [isPlayerTriggerPending]);

  const handleDeclareBlock = (blockerId: string | null) => {
    dispatch({
      type: 'DECLARE_BLOCK',
      player: 'player',
      blockerId
    });
    setBlockerArenaSelection(false);
  };

  const handleResolveShieldTrigger = (shieldId: string, activate: boolean, targets?: string[]) => {
    dispatch({
      type: 'RESOLVE_SHIELD_TRIGGER',
      player: 'player',
      shieldId,
      activate,
      targets
    });
    setTriggerTargetSelection(null);
  };

  const isOptionalChoicePending = Boolean(
    state.pendingInteraction &&
    state.pendingInteraction.type === 'OPTIONAL_CHOICE' &&
    state.pendingInteraction.player === 'player'
  );

  const optionalChoiceData = isOptionalChoicePending
    ? (state.pendingInteraction as any)
    : null;

  const optionalSourceCard = optionalChoiceData?.sourceCardId
    ? CARD_MAP.get(optionalChoiceData.sourceCardId)
    : null;

  const handleAcceptOptionalChoice = () => {
    dispatch({
      type: 'RESOLVE_OPTIONAL_CHOICE',
      player: 'player',
      accept: true
    });
  };

  const handleDeclineOptionalChoice = () => {
    dispatch({
      type: 'RESOLVE_OPTIONAL_CHOICE',
      player: 'player',
      accept: false
    });
  };

  return (
    <div className="relative w-full h-full flex flex-row overflow-hidden bg-[#07090e] text-slate-100 select-none">
      {/* Left Column: Card Inspector & Match Status (Fixed 18rem on lg+ desktop, slide-over drawer on narrow viewports) */}
      <CardInspectorPane
        className="hidden lg:flex w-72 2xl:w-72 shrink-0 h-full"
        inspectedCard={hoveredCard || inspectedCard}
        friendlyBattleZone={state.players.player.battleZone}
        turn={state.turn}
        activePlayer={state.activePlayer}
        phase={state.phase}
        opponentDeck={selectedOpponentDeck}
        availableOpponentDecks={availableOpponentDecks}
        onSelectOpponentDeck={handleSelectOpponentDeck}
      />

      {/* Center Column: The Unified Battle Arena (Dark Minimalist Playmat) */}
      <div
        onClick={() => setInspectedCard(null)}
        className="relative flex-1 h-full min-w-0 flex flex-col justify-between overflow-y-auto overflow-x-hidden custom-scrollbar px-1 sm:px-1.5 pb-1 sm:pb-0.5 bg-[radial-gradient(ellipse_at_center,_#0f141f_0%,_#07090e_100%)] border-x border-slate-800/60 shadow-2xl"
      >
        {/* Compact Responsive HUD & Drawer Controls (< 1024px) */}
        <div
          onClick={(e) => e.stopPropagation()}
          className="lg:hidden sticky top-0 z-30 -mx-1 px-2 py-1.5 bg-slate-950/95 backdrop-blur-md border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-1.5 shrink-0"
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <button
              type="button"
              onClick={() => setActiveDrawer((d) => (d === 'inspector' ? 'none' : 'inspector'))}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-[11px] font-semibold text-slate-200 cursor-pointer shrink-0"
              aria-label="Open Card Inspector"
            >
              <Eye className="w-3.5 h-3.5 text-sky-400" />
              <span className="truncate max-w-[90px]">
                {(hoveredCard || inspectedCard)?.name || 'Inspector'}
              </span>
            </button>
            <span className="px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 font-cinzel font-bold text-[10px] shrink-0">
              T{state.turn}
            </span>
            <span
              className={`px-1.5 py-0.5 rounded font-mono font-bold text-[10px] border shrink-0 ${
                isPlayerTurn
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
              }`}
            >
              {isPlayerTurn ? 'YOUR TURN' : 'OPP'} &bull; {state.phase === 'MANA_CHARGE' ? 'MANA' : state.phase}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 ml-auto">
            {isPlayerTurn && canDirectAttack ? (
              <button
                type="button"
                onClick={handleDirectAttack}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white font-cinzel font-bold text-[10px] cursor-pointer"
              >
                <Zap className="w-3 h-3" />
                <span>Direct Atk</span>
              </button>
            ) : isPlayerTurn && state.phase === 'MANA_CHARGE' ? (
              <button
                type="button"
                onClick={handlePassPhase}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-cinzel font-bold text-[10px] cursor-pointer"
              >
                <span>Main Phase</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            ) : isPlayerTurn && state.phase === 'MAIN' ? (
              <button
                type="button"
                onClick={handlePassPhase}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-cinzel font-bold text-[10px] cursor-pointer"
              >
                <Swords className="w-3 h-3" />
                <span>Attack</span>
              </button>
            ) : isPlayerTurn && state.phase === 'ATTACK' ? (
              <button
                type="button"
                onClick={handleEndTurn}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/40 font-cinzel font-bold text-[10px] cursor-pointer"
              >
                <span>End Turn</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            ) : !isPlayerTurn && !isAutoPlayOpponent ? (
              <button
                type="button"
                onClick={triggerAiStep}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white font-cinzel font-bold text-[10px] cursor-pointer"
              >
                <Bot className="w-3 h-3" />
                <span>AI Move</span>
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => setActiveDrawer((d) => (d === 'controls' ? 'none' : 'controls'))}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-[11px] font-semibold text-amber-300 cursor-pointer shrink-0"
              aria-label="Open Controls and Duel Log"
            >
              <ScrollText className="w-3.5 h-3.5" />
              <span className="font-mono text-[10px]">Log #{state.actionLog.length}</span>
            </button>
          </div>
        </div>
        {/* Ephemeral Turn Switch Banner */}
        {turnBanner && (
          <div className="absolute inset-0 flex items-center justify-center z-40 pointer-events-none transition-opacity duration-300">
            <div
              className={`px-6 py-2.5 rounded-full border backdrop-blur-md shadow-2xl flex items-center gap-2.5 ${
                turnBanner.player === 'player'
                  ? 'bg-amber-950/90 border-amber-400/80 text-amber-200 shadow-amber-500/30 ring-1 ring-amber-400/40 animate-pulse'
                  : 'bg-indigo-950/90 border-indigo-400/80 text-indigo-200 shadow-indigo-500/30 ring-1 ring-indigo-400/40 animate-pulse'
              }`}
            >
              <Swords className={`w-4 h-4 ${turnBanner.player === 'player' ? 'text-amber-400' : 'text-indigo-400'}`} />
              <span className="font-cinzel font-bold text-xs sm:text-sm tracking-widest uppercase">
                TURN {turnBanner.turn} &bull; {turnBanner.player === 'player' ? 'YOUR TURN' : "OPPONENT'S TURN"}
              </span>
            </div>
          </div>
        )}

        {/* ================= 1. OPPONENT TERRITORY ================= */}
        <div className="shrink-0 flex flex-col gap-1 w-full">
          {/* Opponent Hand Tray (Compact, Centered) */}
          <div className="w-full flex items-center justify-center">
            <HandView
              hand={state.players.opponent.hand}
              owner="opponent"
              manaZone={state.players.opponent.manaZone}
              isPlayerTurn={isPlayerTurn}
              phase={state.phase}
              manaChargedThisTurn={state.players.opponent.manaChargedThisTurn}
              onHoverCard={handleHoverCard}
              onInspectCard={handleInspectCard}
            />
          </div>

          {/* Opponent Flanked Zone: Graveyard (L) | Mana + Shields (Center) | Deck (R) */}
          <ShieldsRow
            owner="opponent"
            shields={state.players.opponent.shields}
            manaZone={state.players.opponent.manaZone}
            graveyard={state.players.opponent.graveyard}
            deck={state.players.opponent.deck}
            showDeck={true}
            canTargetShields={canTargetShields}
            canDirectAttack={canDirectAttack}
            onDirectAttack={handleDirectAttack}
            selectedTarget={state.combatState?.target}
            selectedShieldIndices={selectedShieldIndices}
            requiredSelectionCount={requiredBreakerCount}
            onSelectShield={handleSelectShieldTarget}
            onHoverCard={handleHoverCard}
            onInspectCard={handleInspectCard}
          />
        </div>

        {/* ================= 2. THE BATTLEFIELD (CENTRAL COMBAT STAGE) ================= */}
        <div className="flex-1 min-h-0 w-full flex flex-col justify-between py-1 relative my-0.5 px-0.5 sm:px-1">
          {/* Action Banner: Blocker Arena Selection */}
          {blockerArenaSelection && (
            <div className="w-full flex items-center justify-between px-3 py-1.5 mb-1 rounded-lg bg-sky-950/90 border border-sky-500/60 shadow-lg text-xs animate-fade-in z-30">
              <div className="flex items-center gap-2 min-w-0">
                <Shield className="w-4 h-4 text-sky-400 animate-pulse shrink-0" />
                <span className="font-cinzel font-bold text-sky-200 truncate">
                  Click any highlighted Blocker in your Battle Zone to intercept!
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleDeclareBlock(null)}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-semibold transition-colors flex items-center gap-1 cursor-pointer shrink-0 ml-2"
              >
                <X className="w-3.5 h-3.5" />
                <span>Pass / Do Not Block</span>
              </button>
            </div>
          )}

          {/* Action Banner: Shield Trigger Target Selection */}
          {triggerTargetSelection && (
            <div className="w-full flex items-center justify-between px-3 py-1.5 mb-1 rounded-lg bg-amber-950/90 border border-amber-500/60 shadow-lg text-xs animate-fade-in z-30">
              <div className="flex items-center gap-2 min-w-0">
                <Zap className="w-4 h-4 text-amber-400 animate-pulse shrink-0" />
                <span className="font-cinzel font-bold text-amber-200 truncate">
                  Shield Trigger: Click a target creature on the battlefield for <strong className="text-white">{triggerTargetSelection.card.name}</strong>
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  const id = triggerTargetSelection.shieldId;
                  handleResolveShieldTrigger(id, false);
                }}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-semibold transition-colors flex items-center gap-1 cursor-pointer shrink-0 ml-2"
              >
                <X className="w-3.5 h-3.5" />
                <span>Cancel (Keep in Hand)</span>
              </button>
            </div>
          )}

          {/* Action Banner: Evolution / Vortex Bait Selection */}
          {evolutionCandidate && (
            <div className="w-full flex items-center justify-between px-3 py-1.5 mb-1 rounded-lg bg-cyan-950/90 border border-cyan-500/60 shadow-lg text-xs animate-fade-in z-30">
              <div className="flex items-center gap-2 min-w-0">
                <Sparkles className="w-4 h-4 text-cyan-400 animate-pulse shrink-0" />
                <span className="font-cinzel font-bold text-cyan-200 truncate">
                  {evolutionCandidate.isVortex
                    ? evolutionCandidate.selectedBaitIds.length === 0
                      ? `Vortex Evolution (${evolutionCandidate.card.name}): Click 1st bait creature`
                      : `Vortex Evolution (${evolutionCandidate.card.name}): Click 2nd bait creature`
                    : `Evolution (${evolutionCandidate.card.name}): Click bait creature to evolve onto`}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setEvolutionCandidate(null)}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-semibold transition-colors flex items-center gap-1 cursor-pointer shrink-0 ml-2"
              >
                <X className="w-3.5 h-3.5" />
                <span>Cancel</span>
              </button>
            </div>
          )}

          {/* Opponent Field */}
          <div className="w-full flex-1 min-h-0 flex items-center justify-center rounded-lg border border-slate-800/40 bg-slate-950/20 backdrop-blur-xs px-1.5 py-1">
            <BattleZoneView
              battleZone={state.players.opponent.battleZone}
              opponentBattleZone={state.players.player.battleZone}
              playerState={state.players.opponent}
              opponentState={state.players.player}
              owner="opponent"
              turn={state.turn}
              phase={state.phase}
              activePlayer={state.activePlayer}
              selectedAttackerId={selectedAttackerId}
              combatAttackerId={state.combatState?.attackerId}
              onSelectTargetCreature={handleSelectCreatureTarget}
              onInspectCard={handleInspectCard}
              onHoverCard={handleHoverCard}
              spellTargetMode={
                spellCandidate !== null ||
                triggerTargetSelection !== null ||
                pendingTargetSelection !== null
              }
              validSpellTargetIds={
                pendingTargetSelection
                  ? pendingTargetSelection.validTargetIds
                  : triggerTargetSelection
                  ? triggerTargetSelection.validTargetIds
                  : spellCandidate?.validTargetIds
              }
              onSelectSpellTarget={(targetId) => {
                if (pendingTargetSelection) {
                  dispatch({ type: 'SELECT_TARGETS', player: 'player', selectedIds: [targetId] });
                } else if (triggerTargetSelection) {
                  handleResolveShieldTrigger(triggerTargetSelection.shieldId, true, [targetId]);
                } else {
                  handleSelectSpellTarget(targetId);
                }
              }}
            />
          </div>

          {/* Minimalist Center Midline Divider */}
          <div className="w-full flex items-center justify-center my-0.5 pointer-events-none select-none px-2">
            <div className="w-full h-px bg-gradient-to-r from-transparent via-slate-700/50 to-transparent" />
          </div>

          {/* Player Field */}
          <div className="w-full flex-1 min-h-0 flex items-center justify-center rounded-lg border border-slate-800/40 bg-slate-950/20 backdrop-blur-xs px-1.5 py-1">
            <BattleZoneView
              battleZone={state.players.player.battleZone}
              opponentBattleZone={state.players.opponent.battleZone}
              playerState={state.players.player}
              opponentState={state.players.opponent}
              owner="player"
              turn={state.turn}
              phase={state.phase}
              activePlayer={state.activePlayer}
              selectedAttackerId={selectedAttackerId}
              combatAttackerId={state.combatState?.attackerId}
              onSelectAttacker={handleSelectAttacker}
              onInspectCard={handleInspectCard}
              onHoverCard={handleHoverCard}
              evolutionSelectionMode={evolutionCandidate !== null}
              validBaitIds={evolutionCandidate?.validBaitIds}
              onSelectBait={handleSelectBait}
              spellTargetMode={
                (spellCandidate !== null && spellCandidate.validTargetIds.some((id) => state.players.player.battleZone.some((c) => c.instanceId === id))) ||
                (triggerTargetSelection !== null && triggerTargetSelection.validTargetIds.some((id) => state.players.player.battleZone.some((c) => c.instanceId === id))) ||
                (pendingTargetSelection !== null && pendingTargetSelection.validTargetIds.some((id) => state.players.player.battleZone.some((c) => c.instanceId === id)))
              }
              validSpellTargetIds={
                pendingTargetSelection
                  ? pendingTargetSelection.validTargetIds
                  : triggerTargetSelection
                  ? triggerTargetSelection.validTargetIds
                  : spellCandidate?.validTargetIds
              }
              onSelectSpellTarget={(targetId) => {
                if (pendingTargetSelection) {
                  dispatch({ type: 'SELECT_TARGETS', player: 'player', selectedIds: [targetId] });
                } else if (triggerTargetSelection) {
                  handleResolveShieldTrigger(triggerTargetSelection.shieldId, true, [targetId]);
                } else {
                  handleSelectSpellTarget(targetId);
                }
              }}
              blockerSelectionMode={blockerArenaSelection}
              validBlockerIds={
                state.pendingInteraction?.type === 'BLOCK_DECLARATION' ||
                state.pendingInteraction?.type === 'BLOCKER_CHOICE'
                  ? state.pendingInteraction.validBlockerIds
                  : []
              }
              onSelectBlocker={(blockerId) => handleDeclareBlock(blockerId)}
            />
          </div>
        </div>

        {/* ================= 3. PLAYER TERRITORY ================= */}
        <div className="shrink-0 flex flex-col gap-1 w-full">
          {/* Manual Mana Payment Selection Prompt */}
          {manaPaymentCandidate && manaPaymentValidation && (
            <div className="w-fit max-w-full mx-auto flex flex-wrap items-center justify-center gap-2 sm:gap-3 px-3 py-1.5 rounded-xl bg-amber-950/90 border border-amber-400/75 shadow-lg text-xs z-30">
              <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 min-w-0">
                <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse shrink-0" />
                <span className="font-cinzel font-bold text-amber-100">
                  Tap {manaPaymentValidation.requiredCost} Mana to{' '}
                  {manaPaymentCandidate.kind === 'creature' ? 'Summon' : 'Cast'}{' '}
                  <strong className="text-white">{manaPaymentCandidate.card.name}</strong>
                </span>
                <span className="px-1.5 py-0.5 rounded font-mono text-[10px] font-bold bg-slate-900/90 border border-amber-500/40 text-amber-300 tabular-nums">
                  {manaPaymentValidation.selectedCount}/{manaPaymentValidation.requiredCost}
                </span>
                <div className="flex items-center gap-1">
                  {manaPaymentValidation.requiredCivs.map((civ) => {
                    const met = manaPaymentValidation.satisfiedCivs.includes(civ);
                    return (
                      <span
                        key={civ}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border ${
                          met
                            ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-300'
                            : 'bg-rose-500/20 border-rose-400/60 text-rose-300'
                        }`}
                      >
                        {civ} {met ? '✓' : '✗'}
                      </span>
                    );
                  })}
                </div>
                {!manaPaymentValidation.valid &&
                  manaPaymentValidation.selectedCount >= manaPaymentValidation.requiredCost &&
                  manaPaymentValidation.reason && (
                    <span className="text-[11px] text-amber-200/90 font-sans">
                      {manaPaymentValidation.reason}
                    </span>
                  )}
              </div>
              <div className="flex items-center justify-center gap-1.5 shrink-0">
                <button
                  type="button"
                  disabled={!manaPaymentValidation.valid}
                  onClick={handleConfirmManaPayment}
                  className={`px-3 py-1 rounded-md font-cinzel font-black text-[11px] flex items-center gap-1 transition-all ${
                    manaPaymentValidation.valid
                      ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 cursor-pointer shadow-md shadow-emerald-500/30 active:scale-95'
                      : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{manaPaymentCandidate.kind === 'creature' ? 'Confirm Summon' : 'Confirm Cast'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setManaPaymentCandidate(null)}
                  className="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Cancel</span>
                </button>
              </div>
            </div>
          )}

          {/* Player Flanked Zone: Graveyard (L) | Shields + Mana (Center) | Deck (R) */}
          <ShieldsRow
            owner="player"
            shields={state.players.player.shields}
            manaZone={state.players.player.manaZone}
            graveyard={state.players.player.graveyard}
            deck={state.players.player.deck}
            showDeck={true}
            canUndoMana={canUndoMana}
            onUndoMana={handleUndoChargeMana}
            manaPaymentMode={manaPaymentCandidate !== null}
            selectedPaymentManaIds={manaPaymentCandidate?.selectedManaIds}
            onTogglePaymentMana={handleTogglePaymentMana}
            onToggleManaTap={(cardInstanceId, forceTapped) => {
              const targetMana = state.players.player.manaZone.find((m) => m.instanceId === cardInstanceId);
              if (targetMana?.isSpent && forceTapped === false) {
                showToast(`${targetMana.card.name} was already spent this turn and cannot untap until start of turn.`);
                return;
              }
              dispatch({ type: 'TOGGLE_MANA_TAP', player: 'player', cardInstanceId, forceTapped });
            }}
            onHoverCard={handleHoverCard}
            onInspectCard={handleInspectCard}
          />

          {/* Player Hand Tray (Expanded, Prominent, Centered) */}
          <div className="w-full flex items-center justify-center">
            <HandView
              hand={state.players.player.hand}
              owner="player"
              manaZone={state.players.player.manaZone}
              battleZone={state.players.player.battleZone}
              opponentBattleZone={state.players.opponent.battleZone}
              isPlayerTurn={isPlayerTurn}
              phase={state.phase}
              manaChargedThisTurn={state.players.player.manaChargedThisTurn}
              pendingManaCardInstanceId={manaPaymentCandidate?.cardInstanceId ?? null}
              onChargeMana={handleChargeMana}
              onSummonCreature={handleSummonCreature}
              onCastSpell={handleCastSpell}
              onHoverCard={handleHoverCard}
              onInspectCard={handleInspectCard}
            />
          </div>
        </div>
      </div>

      {/* Right Column: Duel Log & Action Controls (Desktop lg+ persistent, hidden drawer on < lg) */}
      <DuelLogPane
        className="hidden lg:flex lg:w-72 xl:w-80 shrink-0 h-full"
        actionLog={state.actionLog}
        activePlayer={state.activePlayer}
        phase={state.phase}
        isAutoPlayOpponent={isAutoPlayOpponent}
        onToggleAutoPlay={() => setIsAutoPlayOpponent(!isAutoPlayOpponent)}
        onRestart={handleRestart}
        onExit={onNavigateToBuilder}
        isPlayerTurn={isPlayerTurn}
        canDirectAttack={canDirectAttack}
        onDirectAttack={handleDirectAttack}
        onPassPhase={handlePassPhase}
        onEndTurn={handleEndTurn}
        onPlayOpponentMove={triggerAiStep}
        onInspectCard={handleInspectCard}
        onHoverCard={handleHoverCard}
      />

      {/* Slide-over Drawers for Narrow Viewports (< 1024px) */}
      {activeDrawer !== 'none' && (
        <div
          className="lg:hidden fixed inset-0 z-50 flex bg-slate-950/75 backdrop-blur-xs"
          onClick={() => setActiveDrawer('none')}
        >
          {activeDrawer === 'inspector' && (
            <div className="h-full flex" onClick={(e) => e.stopPropagation()}>
              <CardInspectorPane
                className="w-72 max-w-[85vw] shrink-0 h-full shadow-2xl"
                inspectedCard={hoveredCard || inspectedCard}
                friendlyBattleZone={state.players.player.battleZone}
                turn={state.turn}
                activePlayer={state.activePlayer}
                phase={state.phase}
                opponentDeck={selectedOpponentDeck}
                availableOpponentDecks={availableOpponentDecks}
                onSelectOpponentDeck={handleSelectOpponentDeck}
                onClose={() => setActiveDrawer('none')}
              />
            </div>
          )}

          {activeDrawer === 'controls' && (
            <div className="h-full flex ml-auto" onClick={(e) => e.stopPropagation()}>
              <DuelLogPane
                className="w-80 max-w-[90vw] shrink-0 h-full shadow-2xl"
                actionLog={state.actionLog}
                activePlayer={state.activePlayer}
                phase={state.phase}
                isAutoPlayOpponent={isAutoPlayOpponent}
                onToggleAutoPlay={() => setIsAutoPlayOpponent(!isAutoPlayOpponent)}
                onRestart={() => {
                  handleRestart();
                  setActiveDrawer('none');
                }}
                onExit={onNavigateToBuilder}
                isPlayerTurn={isPlayerTurn}
                canDirectAttack={canDirectAttack}
                onDirectAttack={() => {
                  setActiveDrawer('none');
                  handleDirectAttack();
                }}
                onPassPhase={() => {
                  setActiveDrawer('none');
                  handlePassPhase();
                }}
                onEndTurn={() => {
                  setActiveDrawer('none');
                  handleEndTurn();
                }}
                onPlayOpponentMove={triggerAiStep}
                onInspectCard={(c) => {
                  handleInspectCard(c);
                  setActiveDrawer('inspector');
                }}
                onHoverCard={handleHoverCard}
                onClose={() => setActiveDrawer('none')}
              />
            </div>
          )}
        </div>
      )}

      {/* Modals & Overlays */}
      <TriggerModal
        isOpen={isPlayerTriggerPending && triggerTargetSelection === null}
        interaction={
          state.pendingInteraction?.type === 'SHIELD_TRIGGER_RESOLUTION' ||
          state.pendingInteraction?.type === 'SHIELD_TRIGGER_CHOICE'
            ? state.pendingInteraction
            : null
        }
        state={state}
        onResolve={handleResolveShieldTrigger}
        onStartArenaTargetSelect={(shieldId, card, validTargetIds) => {
          setTriggerTargetSelection({ shieldId, card, validTargetIds });
        }}
      />

      <BlockerModal
        isOpen={isPlayerBlockerPending && !blockerArenaSelection}
        interaction={
          state.pendingInteraction?.type === 'BLOCK_DECLARATION' ||
          state.pendingInteraction?.type === 'BLOCKER_CHOICE'
            ? state.pendingInteraction
            : null
        }
        state={state}
        onStartArenaSelect={() => setBlockerArenaSelection(true)}
        onPassBlock={() => handleDeclareBlock(null)}
      />

      <GameOverModal
        isOpen={state.winner !== null}
        winner={state.winner}
        state={state}
        onRestart={handleRestart}
        onChangeDecks={onNavigateToBuilder}
      />

      <OptionalChoiceModal
        isOpen={isOptionalChoicePending}
        abilityName={optionalChoiceData?.abilityName || 'Optional Ability'}
        prompt={optionalChoiceData?.prompt || 'Would you like to activate this ability?'}
        sourceCard={optionalSourceCard}
        onAccept={handleAcceptOptionalChoice}
        onDecline={handleDeclineOptionalChoice}
      />

      {/* Floating Attack vs $tap Choice Bar */}
      {tapChoiceCreatureId && (() => {
        const tapChoiceCreature = state.players.player.battleZone.find((c) => c.instanceId === tapChoiceCreatureId);
        if (!tapChoiceCreature) return null;
        return (
          <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-40 px-4 py-3 rounded-2xl bg-slate-900/95 border border-violet-400/60 shadow-2xl flex flex-wrap items-center gap-3 backdrop-blur-md">
            <span className="text-xs font-cinzel font-bold text-slate-100">
              {tapChoiceCreature.card.name}:
            </span>
            <button
              type="button"
              onClick={() => {
                setTapChoiceCreatureId(null);
                setSelectedAttackerId(tapChoiceCreature.instanceId);
                setSelectedShieldIndices([]);
                showToast('Select an opponent shield or creature target to attack!');
              }}
              className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950"
            >
              Attack
            </button>
            <button
              type="button"
              onClick={() => {
                setTapChoiceCreatureId(null);
                dispatch({ type: 'ACTIVATE_TAP_ABILITY', player: 'player', creatureInstanceId: tapChoiceCreature.instanceId });
              }}
              className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-violet-600 hover:bg-violet-500 text-white"
            >
              Use $tap Ability
            </button>
            <button
              type="button"
              onClick={() => setTapChoiceCreatureId(null)}
              className="px-2.5 py-1.5 rounded-lg text-xs text-slate-300 bg-slate-800 hover:bg-slate-700"
            >
              Cancel
            </button>
          </div>
        );
      })()}

      <DeckSearchModal
        isOpen={state.pendingInteraction?.type === 'DECK_SEARCH' && state.pendingInteraction.player === 'player'}
        interaction={state.pendingInteraction?.type === 'DECK_SEARCH' ? state.pendingInteraction : null}
        deck={state.players.player.deck}
        onSelectCard={(id) => dispatch({ type: 'RESOLVE_DECK_SEARCH', player: 'player', selectedCardInstanceId: id })}
        onSkip={() => dispatch({ type: 'RESOLVE_DECK_SEARCH', player: 'player', selectedCardInstanceId: null })}
        onHoverCard={handleHoverCard}
        onInspectCard={handleInspectCard}
      />

      <ZoneSelectionModal
        isOpen={state.pendingInteraction?.type === 'ZONE_SELECTION' && state.pendingInteraction.player === 'player'}
        interaction={state.pendingInteraction?.type === 'ZONE_SELECTION' ? state.pendingInteraction : null}
        onConfirm={(selectedIds, selectedRace) =>
          dispatch({
            type: 'RESOLVE_ZONE_SELECTION',
            player: 'player',
            selectedIds,
            selectedRace
          })
        }
        onInspectCard={handleInspectCard}
      />

      <SilentSkillModal
        isOpen={state.pendingInteraction?.type === 'SILENT_SKILL_CHOICE' && state.pendingInteraction.player === 'player'}
        interaction={state.pendingInteraction?.type === 'SILENT_SKILL_CHOICE' ? state.pendingInteraction : null}
        onResolve={(activate) =>
          dispatch({
            type: 'RESOLVE_SILENT_SKILL_CHOICE',
            player: 'player',
            activate
          })
        }
        onInspectCard={handleInspectCard}
      />

      {state.pendingInteraction?.type === 'TARGET_SELECTION' &&
        state.pendingInteraction.player === 'player' &&
        state.pendingInteraction.minTargets === 0 && (
          <div className="fixed bottom-16 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2.5 bg-slate-900/95 border border-amber-500/60 rounded-xl px-4 py-2 shadow-2xl backdrop-blur-md">
            <span className="text-xs text-amber-200 font-medium font-sans">
              {state.pendingInteraction.prompt}
            </span>
            <button
              type="button"
              onClick={() => dispatch({ type: 'SELECT_TARGETS', player: 'player', selectedIds: [] })}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-cinzel font-bold border border-slate-600 transition-colors cursor-pointer"
            >
              Skip Ability
            </button>
          </div>
      )}

      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 text-white font-semibold text-xs shadow-2xl animate-fade-in pointer-events-none">
          <Sparkles className="w-4 h-4" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};
