import React, { useReducer, useState, useEffect, useCallback, useMemo } from 'react';
import {
  Swords,
  RotateCcw,
  Bot,
  User,
  History,
  X,
  Sparkles,
  Zap,
  ArrowRight
} from 'lucide-react';
import type { Deck, CardDefinition } from '../../types/card';
import type { PlayerId, GameState, GameAction } from '../../engine/types';
import { initializeGame } from '../../engine/state';
import { step } from '../../engine/reducer';
import { getAiAction } from '../../engine/ai';
import { isValidEvolutionBait, isEvolutionCreature } from '../../engine/evolution';
import { PRESET_DECKS } from '../../data/presets';
import { ShieldsView } from './ShieldsView';
import { ManaZoneView } from './ManaZoneView';
import { BattleZoneView } from './BattleZoneView';
import { HandView } from './HandView';
import { TriggerModal } from './TriggerModal';
import { BlockerModal } from './BlockerModal';
import { GameOverModal } from './GameOverModal';
import { CardModal } from '../card/CardModal';

interface DuelArenaProps {
  activeDeck: Deck;
  onNavigateToBuilder?: () => void;
}

type ArenaAction = GameAction | { type: 'RESET_GAME'; playerDeck: Deck; opponentDeck: Deck };

const arenaReducer = (currentState: GameState, action: ArenaAction): GameState => {
  if (action.type === 'RESET_GAME') {
    return initializeGame(action.playerDeck, action.opponentDeck, 'player');
  }
  return step(currentState, action as GameAction);
};

export const DuelArena: React.FC<DuelArenaProps> = ({
  activeDeck,
  onNavigateToBuilder
}) => {
  // Select which deck player and opponent use
  const defaultPlayerDeck = useMemo(() => {
    // If active deck has at least 10 cards, use it; otherwise fallback to Shobu Beatdown
    const totalCards = activeDeck.items.reduce((sum, item) => sum + item.count, 0);
    return totalCards >= 10 ? activeDeck : PRESET_DECKS[0];
  }, [activeDeck]);

  const [selectedPlayerDeck, setSelectedPlayerDeck] = useState<Deck>(defaultPlayerDeck);
  const [selectedOpponentDeck, setSelectedOpponentDeck] = useState<Deck>(PRESET_DECKS[1]); // Kokujo Control default

  // Game state reducer
  const [state, dispatch] = useReducer(
    arenaReducer,
    undefined,
    () => initializeGame(selectedPlayerDeck, selectedOpponentDeck, 'player')
  );

  // UI state
  const [selectedAttackerId, setSelectedAttackerId] = useState<string | null>(null);
  const [isAutoPlayOpponent, setIsAutoPlayOpponent] = useState<boolean>(true);
  const [isLogDrawerOpen, setIsLogDrawerOpen] = useState<boolean>(false);
  const [inspectedCard, setInspectedCard] = useState<CardDefinition | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Evolution bait mode
  const [evolutionCandidate, setEvolutionCandidate] = useState<{
    cardInstanceId: string;
    card: CardDefinition;
    validBaitIds: string[];
  } | null>(null);

  // Spell targeting mode
  const [spellCandidate, setSpellCandidate] = useState<{
    cardInstanceId: string;
    card: CardDefinition;
    validTargetIds: string[];
  } | null>(null);

  // Multi-shield selection mode
  const [selectedShieldIndices, setSelectedShieldIndices] = useState<number[]>([]);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  }, []);

  // Restart match handler
  const handleRestart = useCallback(() => {
    setSelectedAttackerId(null);
    setSelectedShieldIndices([]);
    setEvolutionCandidate(null);
    setSpellCandidate(null);
    dispatch({ type: 'RESET_GAME', playerDeck: selectedPlayerDeck, opponentDeck: selectedOpponentDeck });
  }, [selectedPlayerDeck, selectedOpponentDeck]);

  // Restart game whenever decks change
  const handleDeckChange = (playerDeck: Deck, opponentDeck: Deck) => {
    setSelectedPlayerDeck(playerDeck);
    setSelectedOpponentDeck(opponentDeck);
    setSelectedAttackerId(null);
    setSelectedShieldIndices([]);
    setEvolutionCandidate(null);
    setSpellCandidate(null);
    dispatch({ type: 'RESET_GAME', playerDeck, opponentDeck });
  };

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

  // Clear selected attacker if turn/phase changes
  useEffect(() => {
    setSelectedAttackerId(null);
    setSelectedShieldIndices([]);
    setEvolutionCandidate(null);
    setSpellCandidate(null);
  }, [state.turn, state.phase, state.activePlayer]);

  // Player action: Charge Mana
  const handleChargeMana = (cardInstanceId: string) => {
    dispatch({ type: 'CHARGE_MANA', player: 'player', cardInstanceId });
  };

  // Player action: Summon Creature
  const handleSummonCreature = (cardInstanceId: string) => {
    const cardInstance = state.players.player.hand.find((c) => c.instanceId === cardInstanceId);
    if (!cardInstance) return;

    // Check if evolution creature
    if (isEvolutionCreature(cardInstance.card)) {
      const validBaits = state.players.player.battleZone.filter((b) =>
        isValidEvolutionBait(cardInstance.card, b)
      );

      if (validBaits.length === 0) {
        showToast(`No valid bait creature found for ${cardInstance.card.name}!`);
        return;
      }

      if (validBaits.length === 1) {
        // Auto-evolve on the only valid bait
        dispatch({
          type: 'SUMMON_CREATURE',
          player: 'player',
          cardInstanceId,
          baitInstanceId: validBaits[0].instanceId
        });
        return;
      }

      // Enter bait selection mode
      setEvolutionCandidate({
        cardInstanceId,
        card: cardInstance.card,
        validBaitIds: validBaits.map((b) => b.instanceId)
      });
      showToast('Select a creature in your battle zone to evolve onto.');
      return;
    }

    // Standard summon
    dispatch({ type: 'SUMMON_CREATURE', player: 'player', cardInstanceId });
  };

  // Player action: Cast Spell
  const handleCastSpell = (cardInstanceId: string) => {
    const cardInstance = state.players.player.hand.find((c) => c.instanceId === cardInstanceId);
    if (!cardInstance) return;

    const card = cardInstance.card;
    const nameLower = card.name.toLowerCase();
    const rulesLower = (card.rulesText || '').toLowerCase();

    // Determine target candidates
    const oppCreatures = state.players.opponent.battleZone;
    const allCreatures = [
      ...state.players.player.battleZone,
      ...state.players.opponent.battleZone
    ];

    let validCandidates: typeof oppCreatures = [];
    let needsTarget = false;

    if (
      nameLower.includes('spiral gate') ||
      nameLower.includes('riptide charger') ||
      nameLower.includes('teleportation') ||
      rulesLower.includes('choose a creature in the battle zone and return it to its owner') ||
      rulesLower.includes('choose up to 2 creatures in the battle zone')
    ) {
      needsTarget = true;
      validCandidates = allCreatures;
    } else if (nameLower.includes('death smoke')) {
      needsTarget = true;
      validCandidates = oppCreatures.filter((c) => !c.isTapped);
    } else if (nameLower.includes('critical blade')) {
      needsTarget = true;
      validCandidates = oppCreatures.filter((c) => c.card.isBlocker);
    } else if (nameLower.includes('volcano charger') || nameLower.includes('crimson hammer')) {
      needsTarget = true;
      validCandidates = oppCreatures.filter(
        (c) => (c.card.power || 0) + c.powerModifier <= 2000
      );
    } else if (nameLower.includes('tornado flame')) {
      needsTarget = true;
      validCandidates = oppCreatures.filter(
        (c) => (c.card.power || 0) + c.powerModifier <= 4000
      );
    } else if (
      nameLower.includes('terror pit') ||
      nameLower.includes('natural snare') ||
      nameLower.includes('solar ray') ||
      rulesLower.includes('destroy 1 of your opponent')
    ) {
      needsTarget = true;
      validCandidates = oppCreatures;
    }

    if (needsTarget) {
      if (validCandidates.length === 0) {
        showToast(`No valid target creatures in the battle zone for ${card.name}!`);
        return;
      }

      if (validCandidates.length === 1) {
        // Auto-cast with single target
        dispatch({
          type: 'CAST_SPELL',
          player: 'player',
          cardInstanceId,
          targets: [validCandidates[0].instanceId]
        });
        return;
      }

      // Enter spell targeting mode
      setSpellCandidate({
        cardInstanceId,
        card,
        validTargetIds: validCandidates.map((c) => c.instanceId)
      });
      showToast(`Select a target creature in the battle zone for ${card.name}.`);
      return;
    }

    // Direct cast for non-targeted spells (Brain Serum, Holy Awe, Faerie Life, Energy Charger, etc.)
    dispatch({ type: 'CAST_SPELL', player: 'player', cardInstanceId });
  };

  // Evolution bait selected
  const handleSelectBait = (baitInstanceId: string) => {
    if (!evolutionCandidate) return;
    dispatch({
      type: 'SUMMON_CREATURE',
      player: 'player',
      cardInstanceId: evolutionCandidate.cardInstanceId,
      baitInstanceId
    });
    setEvolutionCandidate(null);
  };

  // Spell target selected
  const handleSelectSpellTarget = (targetInstanceId: string) => {
    if (!spellCandidate) return;
    dispatch({
      type: 'CAST_SPELL',
      player: 'player',
      cardInstanceId: spellCandidate.cardInstanceId,
      targets: [targetInstanceId]
    });
    setSpellCandidate(null);
  };

  // Attacker selection / toggle
  const handleSelectAttacker = (creatureId: string) => {
    if (selectedAttackerId === creatureId) {
      setSelectedAttackerId(null);
      setSelectedShieldIndices([]);
    } else {
      setSelectedAttackerId(creatureId);
      setSelectedShieldIndices([]);
      const attacker = state.players.player.battleZone.find((c) => c.instanceId === creatureId);
      const breakerCount = attacker?.card.breakerCount || 1;
      const unbrokenCount = state.players.opponent.shields.filter((s) => !s.isBroken).length;
      const req = Math.min(breakerCount, unbrokenCount);
      if (req > 1) {
        showToast(`Select ${req} opponent shields to break.`);
      } else {
        showToast('Select an opponent shield or tapped creature to attack!');
      }
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

  const isPlayerTurn = state.activePlayer === 'player';
  const oppUnbrokenShieldsCount = state.players.opponent.shields.filter((s) => !s.isBroken).length;
  const selectedAttacker = selectedAttackerId
    ? state.players.player.battleZone.find((c) => c.instanceId === selectedAttackerId)
    : null;
  const attackerBreakerCount = selectedAttacker?.card.breakerCount || 1;
  const requiredBreakerCount = Math.min(attackerBreakerCount, oppUnbrokenShieldsCount);
  const canDirectAttack = selectedAttackerId !== null && oppUnbrokenShieldsCount === 0;

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

  return (
    <div className="flex-1 w-full max-w-[1700px] mx-auto p-2 sm:p-4 flex flex-col gap-3">
      {/* Top Deck & Settings Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-md">
        {/* Left: Player vs Opponent Info */}
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-emerald-400" />
            <span className="font-cinzel font-bold text-slate-200">Player:</span>
            <span className="font-mono text-amber-300 font-semibold">{selectedPlayerDeck.name}</span>
          </div>

          <span className="text-slate-600">VS</span>

          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-red-400" />
            <span className="font-cinzel font-bold text-slate-200">Opponent:</span>
            {/* Opponent Deck Selector */}
            <div className="relative inline-block">
              <select
                value={selectedOpponentDeck.id}
                onChange={(e) => {
                  const picked = PRESET_DECKS.find((d) => d.id === e.target.value);
                  if (picked) handleDeckChange(selectedPlayerDeck, picked);
                }}
                className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-slate-200 font-mono text-xs focus:ring-1 focus:ring-amber-500"
              >
                {PRESET_DECKS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Right: Quick Match Actions */}
        <div className="flex items-center gap-2">
          {/* Auto-Play Opponent Toggle */}
          <button
            type="button"
            onClick={() => setIsAutoPlayOpponent(!isAutoPlayOpponent)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
              isAutoPlayOpponent
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 shadow-sm'
                : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}
            title="When active, AI automatically takes its turn and resolves reactions"
          >
            {isAutoPlayOpponent ? (
              <>
                <Bot className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                <span>AI Auto-Play: ON</span>
              </>
            ) : (
              <>
                <Bot className="w-3.5 h-3.5 text-slate-500" />
                <span>AI Auto-Play: OFF</span>
              </>
            )}
          </button>

          {/* Action Log Drawer Toggle */}
          <button
            type="button"
            onClick={() => setIsLogDrawerOpen(!isLogDrawerOpen)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors border border-slate-700"
          >
            <History className="w-3.5 h-3.5 text-amber-400" />
            <span>Duel Log</span>
          </button>

          {/* Restart Match */}
          <button
            type="button"
            onClick={handleRestart}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-red-500/20 hover:text-red-300 hover:border-red-500/40 text-slate-300 border border-slate-700 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Restart</span>
          </button>
        </div>
      </div>

      {/* Main Duel Battlefield Arena Grid */}
      <div className="flex flex-col gap-3">
        {/* ================= OPPONENT FIELD (TOP) ================= */}
        <div className="rounded-2xl border border-red-950/60 bg-gradient-to-b from-slate-950 via-slate-900/60 to-slate-950 p-3 sm:p-4 space-y-3">
          {/* Opponent Hand & Mana */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <HandView
              hand={state.players.opponent.hand}
              owner="opponent"
              manaZone={state.players.opponent.manaZone}
              isPlayerTurn={isPlayerTurn}
              phase={state.phase}
              manaChargedThisTurn={state.players.opponent.manaChargedThisTurn}
            />

            <ManaZoneView
              manaZone={state.players.opponent.manaZone}
              owner="opponent"
              onInspectCard={setInspectedCard}
            />
          </div>

          {/* Opponent Battle Zone & Shields */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
            <div className="lg:col-span-8">
              <BattleZoneView
                battleZone={state.players.opponent.battleZone}
                owner="opponent"
                turn={state.turn}
                phase={state.phase}
                activePlayer={state.activePlayer}
                selectedAttackerId={selectedAttackerId}
                onSelectTargetCreature={handleSelectCreatureTarget}
                onInspectCard={setInspectedCard}
                spellTargetMode={spellCandidate !== null}
                validSpellTargetIds={spellCandidate?.validTargetIds}
                onSelectSpellTarget={handleSelectSpellTarget}
              />
            </div>

            <div className="lg:col-span-4">
              <ShieldsView
                shields={state.players.opponent.shields}
                owner="opponent"
                canTargetShields={selectedAttackerId !== null}
                selectedShieldIndices={selectedShieldIndices}
                requiredSelectionCount={requiredBreakerCount}
                onSelectShield={handleSelectShieldTarget}
              />
            </div>
          </div>
        </div>

        {/* ================= CENTER BATTLEFIELD HUB ================= */}
        <div className="relative rounded-2xl border border-amber-500/30 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 p-3 sm:p-4 shadow-xl flex flex-wrap items-center justify-between gap-4">
          {/* Turn & Player Status */}
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/40 text-amber-400 font-cinzel font-black text-lg shadow-inner">
              T{state.turn}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="font-cinzel font-bold text-sm text-white">
                  {state.activePlayer === 'player' ? "Player's Turn" : "Opponent's Turn"}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider uppercase ${
                    state.phase === 'MANA_CHARGE'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : state.phase === 'MAIN'
                      ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                      : state.phase === 'ATTACK'
                      ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {state.phase}
                </span>
              </div>

              <div className="text-[11px] text-slate-400 font-mono mt-0.5 flex items-center gap-2">
                <span>
                  {state.activePlayer === 'player'
                    ? state.phase === 'MANA_CHARGE'
                      ? 'Charge 1 card to mana, or pass to Main Phase'
                      : state.phase === 'MAIN'
                      ? 'Summon creatures, cast spells, or enter Attack Phase'
                      : 'Declare attacks with ready creatures, or End Turn'
                    : 'Opponent is executing moves...'}
                </span>
              </div>
            </div>
          </div>

          {/* Action Center Buttons */}
          <div className="flex items-center gap-2.5">
            {/* Direct Attack to Win Button */}
            {canDirectAttack && (
              <button
                type="button"
                onClick={handleDirectAttack}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-red-600 via-rose-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white font-cinzel font-black text-xs tracking-wider shadow-lg shadow-red-500/40 animate-bounce transition-all cursor-pointer"
              >
                <Zap className="w-4 h-4 fill-current" />
                <span>DIRECT ATTACK TO WIN!</span>
              </button>
            )}

            {/* If player's turn: Phase Advancement Controls */}
            {isPlayerTurn && (
              <>
                {state.phase === 'MANA_CHARGE' && (
                  <button
                    type="button"
                    onClick={handlePassPhase}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-cinzel font-bold text-xs tracking-wider shadow-md transition-all cursor-pointer"
                  >
                    <span>Pass to Main Phase</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}

                {state.phase === 'MAIN' && (
                  <>
                    <button
                      type="button"
                      onClick={handlePassPhase}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-cinzel font-bold text-xs tracking-wider shadow-md transition-all cursor-pointer"
                    >
                      <Swords className="w-3.5 h-3.5" />
                      <span>Attack Phase</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleEndTurn}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-mono text-xs font-semibold transition-colors"
                    >
                      <span>End Turn</span>
                    </button>
                  </>
                )}

                {state.phase === 'ATTACK' && (
                  <button
                    type="button"
                    onClick={handleEndTurn}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/40 font-cinzel font-bold text-xs tracking-wider transition-colors cursor-pointer"
                  >
                    <span>End Turn</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </>
            )}

            {/* If opponent's turn: Manual AI Step trigger button */}
            {!isPlayerTurn && (
              <button
                type="button"
                onClick={triggerAiStep}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-cinzel font-bold text-xs tracking-wider shadow-md transition-all cursor-pointer animate-pulse"
              >
                <Bot className="w-3.5 h-3.5" />
                <span>Play Opponent Move</span>
              </button>
            )}
          </div>
        </div>

        {/* ================= PLAYER FIELD (BOTTOM) ================= */}
        <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-b from-slate-950 via-slate-900/60 to-slate-950 p-3 sm:p-4 space-y-3">
          {/* Player Shields & Battle Zone */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
            <div className="lg:col-span-4">
              <ShieldsView
                shields={state.players.player.shields}
                owner="player"
              />
            </div>

            <div className="lg:col-span-8">
              <BattleZoneView
                battleZone={state.players.player.battleZone}
                owner="player"
                turn={state.turn}
                phase={state.phase}
                activePlayer={state.activePlayer}
                selectedAttackerId={selectedAttackerId}
                onSelectAttacker={handleSelectAttacker}
                onInspectCard={setInspectedCard}
                evolutionSelectionMode={evolutionCandidate !== null}
                validBaitIds={evolutionCandidate?.validBaitIds}
                onSelectBait={handleSelectBait}
              />
            </div>
          </div>

          {/* Player Mana & Hand */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <ManaZoneView
              manaZone={state.players.player.manaZone}
              owner="player"
              onInspectCard={setInspectedCard}
            />

            <HandView
              hand={state.players.player.hand}
              owner="player"
              manaZone={state.players.player.manaZone}
              isPlayerTurn={isPlayerTurn}
              phase={state.phase}
              manaChargedThisTurn={state.players.player.manaChargedThisTurn}
              onChargeMana={handleChargeMana}
              onSummonCreature={handleSummonCreature}
              onCastSpell={handleCastSpell}
              onInspectCard={setInspectedCard}
            />
          </div>
        </div>
      </div>

      {/* ================= MODALS & DRAWERS ================= */}

      {/* 1. Shield Trigger Modal (For Player) */}
      <TriggerModal
        isOpen={isPlayerTriggerPending}
        interaction={
          state.pendingInteraction?.type === 'SHIELD_TRIGGER_RESOLUTION' ||
          state.pendingInteraction?.type === 'SHIELD_TRIGGER_CHOICE'
            ? state.pendingInteraction
            : null
        }
        state={state}
        onResolve={(shieldId, activate, targets) => {
          dispatch({
            type: 'RESOLVE_SHIELD_TRIGGER',
            player: 'player',
            shieldId,
            activate,
            targets
          });
        }}
      />

      {/* 2. Blocker Modal (For Player) */}
      <BlockerModal
        isOpen={isPlayerBlockerPending}
        interaction={
          state.pendingInteraction?.type === 'BLOCK_DECLARATION' ||
          state.pendingInteraction?.type === 'BLOCKER_CHOICE'
            ? state.pendingInteraction
            : null
        }
        state={state}
        onDeclareBlock={(blockerId) => {
          dispatch({
            type: 'DECLARE_BLOCK',
            player: 'player',
            blockerId
          });
        }}
      />

      {/* 3. Game Over Celebration Modal */}
      <GameOverModal
        isOpen={state.winner !== null}
        winner={state.winner}
        state={state}
        onRestart={handleRestart}
        onChangeDecks={onNavigateToBuilder}
      />

      {/* 4. Inspected Card Detail Modal */}
      <CardModal
        card={inspectedCard}
        deckCount={0}
        onClose={() => setInspectedCard(null)}
        onAdd={() => {}}
        onRemove={() => {}}
      />

      {/* 5. Slide-out Action Log Drawer */}
      {isLogDrawerOpen && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs animate-fade-in"
          onClick={() => setIsLogDrawerOpen(false)}
        >
          <div
            className="w-full max-w-md h-full bg-slate-900 border-l border-slate-800 p-5 shadow-2xl flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-amber-400" />
                <h3 className="font-cinzel font-bold text-white text-base">Duel Event Log</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsLogDrawerOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 font-mono text-xs pr-1">
              {state.actionLog.slice().reverse().map((log, i) => (
                <div
                  key={i}
                  className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800/80 text-slate-300 leading-relaxed"
                >
                  <span className="text-amber-500 font-bold mr-2">#{state.actionLog.length - i}</span>
                  {log}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 6. Notification Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 text-white font-semibold text-xs shadow-2xl animate-fade-in">
          <Sparkles className="w-4 h-4" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};
