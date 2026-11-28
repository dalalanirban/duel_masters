import React, { useState, useEffect, useRef } from 'react';
import { Zap, ShieldAlert, ArrowRight, Clock, X, Eye, Maximize2 } from 'lucide-react';
import type { GameState, ShieldTriggerChoiceInteraction, CreatureInstance, PlayerId } from '../../engine/types';
import type { CardDefinition } from '../../types/card';
import { CivilizationIcon } from '../card/CivilizationIcon';
import { getSpellTargetRequirement } from '../../engine/targeting';

interface TriggerModalProps {
  isOpen: boolean;
  interaction: ShieldTriggerChoiceInteraction | null;
  state: GameState;
  onResolve: (shieldId: string, activate: boolean, targets?: string[]) => void;
  onStartArenaTargetSelect: (shieldId: string, card: CardDefinition, validTargetIds: string[]) => void;
}

/**
 * Helper to determine valid target creatures on the battlefield for a Shield Trigger card.
 * Delegates to the engine's canonical `getSpellTargetRequirement` (respecting Petrova, effective power, blockers, etc.).
 */
export function getTriggerTargetCandidates(
  card: CardDefinition,
  state: GameState,
  defendingPlayer: PlayerId
): CreatureInstance[] {
  const req = getSpellTargetRequirement(card, state, defendingPlayer);
  if (!req.requiresTarget || req.validTargetIds.length === 0) {
    return [];
  }
  const idSet = new Set(req.validTargetIds);
  return [
    ...state.players.player.battleZone,
    ...state.players.opponent.battleZone
  ].filter((c) => idSet.has(c.instanceId));
}

export const TriggerModal: React.FC<TriggerModalProps> = ({
  isOpen,
  interaction,
  state,
  onResolve,
  onStartArenaTargetSelect
}) => {
  const [timeLeft, setTimeLeft] = useState<number>(20);
  const [isPeeking, setIsPeeking] = useState<boolean>(false);
  const onResolveRef = useRef(onResolve);
  onResolveRef.current = onResolve;

  const triggers = interaction?.triggers || [];
  const currentTrigger = triggers[0];
  const currentShieldId = currentTrigger?.shieldId;

  // Auto-restore whenever a chained or new Shield Trigger begins
  useEffect(() => {
    setIsPeeking(false);
  }, [isOpen, currentShieldId]);

  // Escape key toggles Peek Board while interrupt is active
  useEffect(() => {
    if (!isOpen || !interaction || !currentShieldId) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (document.querySelector('[data-modal="graveyard"]')) return;
      e.preventDefault();
      e.stopPropagation();
      setIsPeeking((prev) => !prev);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, interaction, currentShieldId]);

  // 20-Second Countdown Timer (preserved continuously while peeking)
  useEffect(() => {
    if (!isOpen || !interaction || !currentShieldId) return;

    setTimeLeft(20);
    const interval = setInterval(() => {
      setTimeLeft((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen, currentShieldId]);

  // Handle timeout expiration purely in effect
  useEffect(() => {
    if (timeLeft === 0 && isOpen && interaction && currentShieldId) {
      onResolveRef.current(currentShieldId, false);
    }
  }, [timeLeft, isOpen, interaction, currentShieldId]);

  if (!isOpen || !interaction || !currentTrigger) return null;

  if (isPeeking) {
    return (
      <div className="fixed top-12 lg:top-14 left-1/2 -translate-x-1/2 z-50 max-w-[calc(100vw-16px)]">
        <button
          type="button"
          data-testid="peek-restore-pill"
          onClick={() => setIsPeeking(false)}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-950/95 hover:bg-slate-900 border-2 border-amber-400/80 text-amber-100 shadow-2xl shadow-amber-950/60 backdrop-blur-md text-xs font-cinzel font-bold whitespace-nowrap cursor-pointer transition-transform active:scale-95"
        >
          <Zap className="w-3.5 h-3.5 text-amber-400 fill-current shrink-0" />
          <span className="tabular-nums">Shield Trigger ({timeLeft}s) &mdash; Restore</span>
          <Maximize2 className="w-3 h-3 text-sky-300 shrink-0" />
        </button>
      </div>
    );
  }

  const card = currentTrigger.card;
  const isCreature = card.type.includes('Creature');
  const imageSrc = card.imageAssetPath ? `/${card.imageAssetPath}` : card.imageUrl;
  const defendingPlayer = interaction.player;

  const candidateTargets = getTriggerTargetCandidates(card, state, defendingPlayer);
  const needsTargetOnArena = candidateTargets.length > 0;

  const handleUseTrigger = () => {
    if (needsTargetOnArena) {
      // Transition to Battle Arena target selection so user can see all tapped/untapped cards and battlefield
      onStartArenaTargetSelect(currentTrigger.shieldId, card, candidateTargets.map((c) => c.instanceId));
    } else {
      // Resolves immediately for non-targeted triggers
      onResolve(currentTrigger.shieldId, true);
    }
  };

  const handleSkip = () => {
    onResolve(currentTrigger.shieldId, false);
  };

  const progressPercent = Math.max(0, Math.min(100, (timeLeft / 20) * 100));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-[2px] animate-fade-in"
      role="dialog"
      aria-modal="true"
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="relative max-w-lg w-full bg-slate-900/95 border-2 border-amber-500/80 rounded-2xl p-5 shadow-2xl shadow-amber-500/20 flex flex-col gap-3.5 overflow-hidden backdrop-blur-md"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Glow corner element */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

        {/* 20-Second Countdown Progress Bar + Peek Board */}
        <div className="w-full space-y-1">
          <div className="flex items-center justify-between gap-2 text-xs font-mono font-bold">
            <span className="flex items-center gap-1.5 text-amber-400">
              <Clock className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: '3s' }} />
              Shield Trigger Window:
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              <span
                className={`px-2 py-0.5 rounded text-[11px] font-bold tabular-nums whitespace-nowrap ${
                  timeLeft <= 5 ? 'bg-red-500/30 text-red-300 animate-pulse' : 'bg-slate-800 text-slate-300'
                }`}
              >
                {timeLeft}s remaining
              </span>
              <button
                type="button"
                data-testid="peek-board-button"
                onClick={() => setIsPeeking(true)}
                title="Minimize modal to inspect the battlefield (Esc)"
                className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-600/80 text-sky-300 hover:text-white text-[10.5px] font-cinzel font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Eye className="w-3 h-3 shrink-0" />
                <span>Peek Board</span>
              </button>
            </div>
          </div>
          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-1000 ease-linear rounded-full ${
                timeLeft <= 5 ? 'bg-red-500' : timeLeft <= 10 ? 'bg-amber-400' : 'bg-emerald-400'
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Header Alert Banner */}
        <div className="flex items-center gap-3 border-b border-amber-500/30 pb-2.5">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400 flex items-center justify-center text-amber-400 shadow-md shrink-0">
            <ShieldAlert className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-cinzel font-extrabold text-base sm:text-lg text-amber-300 tracking-wider">
                SHIELD TRIGGER ACTIVATED!
              </h3>
              <span className="px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 font-black text-[9.5px] tracking-wider uppercase font-mono">
                Free Cast (0 Mana)
              </span>
            </div>
            <p className="text-[11.5px] text-slate-300 mt-0.5">
              A broken shield revealed a Shield Trigger! You can cast or summon it immediately for no cost.
            </p>
          </div>
        </div>

        {/* Trigger Card Display */}
        <div className="flex gap-3.5 items-center bg-slate-950/80 rounded-xl p-3 border border-slate-800">
          <div className="w-20 sm:w-24 aspect-[491/682] rounded-lg overflow-hidden shrink-0 border border-amber-400/80 shadow-lg">
            <img
              src={imageSrc}
              alt={card.name}
              className="w-full h-full object-cover"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                if (card.imageUrl && target.src !== card.imageUrl) {
                  target.src = card.imageUrl;
                }
              }}
            />
          </div>

          <div className="flex-1 space-y-1.5 text-left min-w-0">
            <div className="flex items-center gap-1.5">
              <CivilizationIcon civilization={card.civilizations[0]} className="w-3.5 h-3.5 shrink-0" />
              <h4 className="font-cinzel font-bold text-sm text-white truncate">{card.name}</h4>
            </div>

            <div className="flex flex-wrap gap-1.5 text-[10px] text-slate-400 font-mono">
              <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-200">
                {card.type}
              </span>
              <span className="px-1.5 py-0.2 rounded bg-slate-800 text-amber-300 font-bold">
                Cost: 0 (Normal: {card.manaCost})
              </span>
              {card.power && (
                <span className="px-1.5 py-0.2 rounded bg-slate-800 text-red-400 font-bold">
                  Power: {card.power}
                </span>
              )}
            </div>

            <p className="text-[11px] text-slate-300 bg-slate-900/90 p-2 rounded-lg border border-slate-800/80 line-clamp-3">
              {card.rulesText || 'No effect text.'}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 border-t border-slate-800 pt-2.5">
          <span className="text-[10.5px] text-slate-400">
            Skipping will put this card into your hand.
          </span>

          <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
            <button
              type="button"
              onClick={handleSkip}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <X className="w-3.5 h-3.5 shrink-0" />
              <span>Skip (Keep in Hand)</span>
            </button>

            <button
              type="button"
              onClick={handleUseTrigger}
              className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black font-cinzel tracking-wider bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 shadow-lg shadow-amber-500/30 transition-all cursor-pointer whitespace-nowrap shrink-0"
            >
              <Zap className="w-3.5 h-3.5 fill-current" />
              <span>
                {needsTargetOnArena
                  ? 'Yes, Choose Target on Arena'
                  : isCreature
                  ? 'Yes, Summon Creature'
                  : 'Yes, Cast Spell'}
              </span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
