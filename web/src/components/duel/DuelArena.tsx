import React, { useReducer, useState, useEffect, useCallback, useMemo } from 'react';
import { Sparkles, Swords } from 'lucide-react';
import type { Deck, CardDefinition } from '../../types/card';
import type { PlayerId, GameState, GameAction } from '../../engine/types';
import { initializeGame } from '../../engine/state';
import { step } from '../../engine/reducer';
import { getAiAction } from '../../engine/ai';
import { isValidEvolutionBait, isEvolutionCreature } from '../../engine/evolution';
import { PRESET_DECKS } from '../../data/presets';
import { CardInspectorPane } from './CardInspectorPane';
import { DuelLogPane } from './DuelLogPane';
import { ShieldsRow } from './ShieldsRow';
import { BattleZoneView } from './BattleZoneView';
import { HandView } from './HandView';
import { TriggerModal } from './TriggerModal';
import { BlockerModal } from './BlockerModal';
import { GameOverModal } from './GameOverModal';

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

  const [selectedPlayerDeck] = useState<Deck>(defaultPlayerDeck);
  const [selectedOpponentDeck] = useState<Deck>(PRESET_DECKS[1]); // Kokujo Control default

  // Game state reducer
  const [state, dispatch] = useReducer(
    arenaReducer,
    undefined,
    () => initializeGame(selectedPlayerDeck, selectedOpponentDeck, 'player')
  );

  // UI state
  const [selectedAttackerId, setSelectedAttackerId] = useState<string | null>(null);
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
    setEvolutionCandidate(null);
    setSpellCandidate(null);
    dispatch({ type: 'RESET_GAME', playerDeck: selectedPlayerDeck, opponentDeck: selectedOpponentDeck });
  }, [selectedPlayerDeck, selectedOpponentDeck]);

  // AI Step Trigger
  const triggerAiStep = useCallback(() => {
    if (state.winner !== null) return;
    const aiTargetPlayer: PlayerId =
      state.pendingInteraction && 'defendingPlayer' in state.pendingInteraction
        ? state.pendingInteraction.defendingPlayer
        : state.pendingInteraction && 'player' in state.pendingInteraction
        ? state.pendingInteraction.player
        : state.activePlayer;

    const action = getAiAction(state, aiTargetPlayer);
    if (action) {
      dispatch(action);
    }
  }, [state]);

  // Auto-play timer loop for opponent
  useEffect(() => {
    if (!isAutoPlayOpponent || state.winner !== null) return;

    const isOpponentActive = state.activePlayer === 'opponent';
    const isOpponentPendingInteraction =
      (state.pendingInteraction?.type === 'BLOCK_DECLARATION' &&
        state.pendingInteraction.defendingPlayer === 'opponent') ||
      (state.pendingInteraction?.type === 'SHIELD_TRIGGER_RESOLUTION' &&
        state.pendingInteraction.player === 'opponent');

    if (isOpponentActive || isOpponentPendingInteraction) {
      const timer = setTimeout(() => {
        triggerAiStep();
      }, 700);
      return () => clearTimeout(timer);
    }
  }, [isAutoPlayOpponent, state, triggerAiStep]);

  // Clear selected attacker if turn/phase changes
  useEffect(() => {
    setSelectedAttackerId(null);
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
    } else {
      setSelectedAttackerId(creatureId);
      showToast('Select an opponent shield or tapped creature to attack!');
    }
  };

  // Attack declaration: target shield
  const handleSelectShieldTarget = (shieldIndex: number) => {
    if (!selectedAttackerId) return;
    dispatch({
      type: 'DECLARE_ATTACK',
      player: 'player',
      attackerInstanceId: selectedAttackerId,
      target: { type: 'shield', index: shieldIndex }
    });
    setSelectedAttackerId(null);
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
  };

  // Pass phase
  const handlePassPhase = () => {
    setSelectedAttackerId(null);
    setEvolutionCandidate(null);
    setSpellCandidate(null);
    dispatch({ type: 'PASS_PHASE', player: 'player' });
  };

  // End turn
  const handleEndTurn = () => {
    setSelectedAttackerId(null);
    setEvolutionCandidate(null);
    setSpellCandidate(null);
    dispatch({ type: 'END_TURN', player: 'player' });
  };

  // Undo mana charge
  const handleUndoChargeMana = () => {
    dispatch({ type: 'UNDO_CHARGE_MANA', player: 'player' });
  };

  const isPlayerTurn = state.activePlayer === 'player';

  // Calculate attack targeting constraints
  const selectedAttacker = selectedAttackerId
    ? state.players.player.battleZone.find((c) => c.instanceId === selectedAttackerId)
    : null;

  const attackerCannotAttackPlayers = Boolean(
    selectedAttacker &&
    /this creature can't attack players/i.test(selectedAttacker.card.rulesText || '')
  );

  const oppUnbrokenShieldsCount = state.players.opponent.shields.filter((s) => !s.isBroken).length;

  const canTargetShields = Boolean(
    selectedAttacker &&
    !attackerCannotAttackPlayers &&
    oppUnbrokenShieldsCount > 0
  );

  const canDirectAttack = Boolean(
    selectedAttacker &&
    !attackerCannotAttackPlayers &&
    oppUnbrokenShieldsCount === 0
  );

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

  return (
    <div className="w-full h-full flex flex-row overflow-hidden bg-[#07090e] text-slate-100 select-none">
      {/* Left Column: Card Inspector & Match Status (Expanded to fill gap to battle zone) */}
      <CardInspectorPane
        className="w-56 sm:w-64 xl:w-72 shrink-0 h-full"
        inspectedCard={hoveredCard || inspectedCard}
        turn={state.turn}
        activePlayer={state.activePlayer}
        phase={state.phase}
      />

      {/* Center Column: The Unified Battle Arena (Dark Minimalist Playmat) */}
      <div
        onClick={() => setInspectedCard(null)}
        className="relative flex-1 h-full min-w-0 flex flex-col justify-between overflow-y-auto overflow-x-hidden custom-scrollbar p-1 sm:p-0.5 bg-[radial-gradient(ellipse_at_center,_#0f141f_0%,_#07090e_100%)] border-x border-slate-800/60 shadow-2xl"
      >
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
        <div className="shrink-0 flex flex-col gap-1 w-full px-1.5">
          {/* Opponent Hand */}
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

          {/* Opponent Flanked Zone: Graveyard (L) | Mana + Shields | Deck (R) */}
          <ShieldsRow
            owner="opponent"
            shields={state.players.opponent.shields}
            manaZone={state.players.opponent.manaZone}
            graveyard={state.players.opponent.graveyard}
            deck={state.players.opponent.deck}
            canTargetShields={canTargetShields}
            canDirectAttack={canDirectAttack}
            onDirectAttack={handleDirectAttack}
            onSelectShield={handleSelectShieldTarget}
            onHoverCard={handleHoverCard}
            onInspectCard={handleInspectCard}
          />
        </div>

        {/* ================= 2. THE BATTLEFIELD (CENTRAL COMBAT STAGE) ================= */}
        <div className="flex-1 min-h-0 w-full px-1.5 flex flex-col justify-between py-1 sm:py-1.5 relative my-0.5">
          {/* Opponent Field */}
          <div className="w-full flex-1 min-h-0 flex items-center justify-center">
            <BattleZoneView
              battleZone={state.players.opponent.battleZone}
              owner="opponent"
              turn={state.turn}
              phase={state.phase}
              activePlayer={state.activePlayer}
              selectedAttackerId={selectedAttackerId}
              onSelectTargetCreature={handleSelectCreatureTarget}
              onInspectCard={handleInspectCard}
              onHoverCard={handleHoverCard}
              spellTargetMode={spellCandidate !== null}
              validSpellTargetIds={spellCandidate?.validTargetIds}
              onSelectSpellTarget={handleSelectSpellTarget}
            />
          </div>

          {/* Minimalist Center Midline Divider */}
          <div className="w-full flex items-center justify-center my-0.5 pointer-events-none select-none">
            <div className="w-4/5 h-px bg-gradient-to-r from-transparent via-slate-800/80 to-transparent" />
          </div>

          {/* Player Field */}
          <div className="w-full flex-1 min-h-0 flex items-center justify-center">
            <BattleZoneView
              battleZone={state.players.player.battleZone}
              owner="player"
              turn={state.turn}
              phase={state.phase}
              activePlayer={state.activePlayer}
              selectedAttackerId={selectedAttackerId}
              onSelectAttacker={handleSelectAttacker}
              onInspectCard={handleInspectCard}
              onHoverCard={handleHoverCard}
              evolutionSelectionMode={evolutionCandidate !== null}
              validBaitIds={evolutionCandidate?.validBaitIds}
              onSelectBait={handleSelectBait}
            />
          </div>
        </div>

        {/* ================= 3. PLAYER TERRITORY ================= */}
        <div className="shrink-0 flex flex-col gap-1 w-full px-1.5">
          {/* Player Flanked Zone: Graveyard (L) | Shields + Mana | Deck (R) */}
          <ShieldsRow
            owner="player"
            shields={state.players.player.shields}
            manaZone={state.players.player.manaZone}
            graveyard={state.players.player.graveyard}
            deck={state.players.player.deck}
            canUndoMana={canUndoMana}
            onUndoMana={handleUndoChargeMana}
            onHoverCard={handleHoverCard}
            onInspectCard={handleInspectCard}
          />

          {/* Player Hand */}
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
            onHoverCard={handleHoverCard}
            onInspectCard={handleInspectCard}
          />
        </div>
      </div>

      {/* Right Column: Duel Log & Action Controls */}
      <DuelLogPane
        className="w-64 lg:w-72 xl:w-80 shrink-0 h-full"
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
        canUndoMana={canUndoMana}
        onUndoMana={handleUndoChargeMana}
        onPassPhase={handlePassPhase}
        onEndTurn={handleEndTurn}
        onPlayOpponentMove={triggerAiStep}
        onInspectCard={handleInspectCard}
        onHoverCard={handleHoverCard}
      />

      {/* Modals & Overlays */}
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

      <BlockerModal
        isOpen={isPlayerBlockerPending}
        interaction={
          state.pendingInteraction?.type === 'BLOCK_DECLARATION'
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

      <GameOverModal
        isOpen={state.winner !== null}
        winner={state.winner}
        state={state}
        onRestart={handleRestart}
        onChangeDecks={onNavigateToBuilder}
      />

      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 text-white font-semibold text-xs shadow-2xl animate-fade-in pointer-events-none">
          <Sparkles className="w-4 h-4" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};
