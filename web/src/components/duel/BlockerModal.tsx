import React, { useState, useEffect, useRef } from 'react';
import { Shield, Swords, ShieldCheck, X, Clock, Eye, Maximize2 } from 'lucide-react';
import type { GameState, BlockerChoiceInteraction } from '../../engine/types';
import { getCreatureEffectivePower } from '../../engine/combat';

interface BlockerModalProps {
  isOpen: boolean;
  interaction: BlockerChoiceInteraction | null;
  state: GameState;
  onStartArenaSelect: () => void;
  onPassBlock: () => void;
}

export const BlockerModal: React.FC<BlockerModalProps> = ({
  isOpen,
  interaction,
  state,
  onStartArenaSelect,
  onPassBlock
}) => {
  const [timeLeft, setTimeLeft] = useState<number>(20);
  const [isPeeking, setIsPeeking] = useState<boolean>(false);
  const onPassBlockRef = useRef(onPassBlock);
  onPassBlockRef.current = onPassBlock;

  // Auto-restore whenever a new blocker interrupt begins
  useEffect(() => {
    setIsPeeking(false);
  }, [isOpen, interaction?.attackerId]);

  // Escape key toggles Peek Board while interrupt is active
  useEffect(() => {
    if (!isOpen || !interaction) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (document.querySelector('[data-modal="graveyard"]')) return;
      e.preventDefault();
      e.stopPropagation();
      setIsPeeking((prev) => !prev);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, interaction]);

  // 20-Second Countdown timer (preserved continuously while peeking)
  useEffect(() => {
    if (!isOpen || !interaction) return;

    setTimeLeft(20);
    const interval = setInterval(() => {
      setTimeLeft((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen, interaction?.attackerId]);

  // Handle timeout expiration purely in effect
  useEffect(() => {
    if (timeLeft === 0 && isOpen && interaction) {
      onPassBlockRef.current();
    }
  }, [timeLeft, isOpen, interaction]);

  if (!isOpen || !interaction) return null;

  if (isPeeking) {
    return (
      <div className="fixed top-12 lg:top-14 left-1/2 -translate-x-1/2 z-50 max-w-[calc(100vw-16px)]">
        <button
          type="button"
          data-testid="peek-restore-pill"
          onClick={() => setIsPeeking(false)}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-950/95 hover:bg-slate-900 border-2 border-red-400/80 text-red-100 shadow-2xl shadow-red-950/60 backdrop-blur-md text-xs font-cinzel font-bold whitespace-nowrap cursor-pointer transition-transform active:scale-95"
        >
          <Shield className="w-3.5 h-3.5 text-red-400 shrink-0" />
          <span className="tabular-nums">Blocker Window ({timeLeft}s) &mdash; Restore</span>
          <Maximize2 className="w-3 h-3 text-amber-300 shrink-0" />
        </button>
      </div>
    );
  }

  const defendingPlayer = interaction.defendingPlayer;
  const attackingPlayer = defendingPlayer === 'player' ? 'opponent' : 'player';

  const attacker = state.players[attackingPlayer].battleZone.find(
    (c) => c.instanceId === interaction.attackerId
  );
  const attackerPower = attacker ? getCreatureEffectivePower(attacker, true) : 0;
  const attackerImage = attacker
    ? attacker.card.imageAssetPath
      ? `/${attacker.card.imageAssetPath}`
      : attacker.card.imageUrl
    : '';

  const validBlockers = state.players[defendingPlayer].battleZone.filter((c) =>
    interaction.validBlockerIds.includes(c.instanceId)
  );

  const progressPercent = Math.max(0, Math.min(100, (timeLeft / 20) * 100));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-[2px] animate-fade-in"
      role="dialog"
      aria-modal="true"
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="relative max-w-lg w-full bg-slate-900/95 border-2 border-red-500/80 rounded-2xl p-5 shadow-2xl shadow-red-500/20 flex flex-col gap-3.5 overflow-hidden backdrop-blur-md"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Glow corner */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/10 rounded-full blur-2xl pointer-events-none" />

        {/* 20-Second Countdown Progress Bar + Peek Board */}
        <div className="w-full space-y-1">
          <div className="flex items-center justify-between gap-2 text-xs font-mono font-bold">
            <span className="flex items-center gap-1.5 text-amber-400">
              <Clock className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: '3s' }} />
              Action Window:
            </span>
            <div className="flex items-center gap-1.5">
              <span
                className={`px-2 py-0.5 rounded text-[11px] font-bold tabular-nums ${
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
                className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-600/80 text-sky-300 hover:text-white text-[10.5px] font-cinzel font-bold transition-colors cursor-pointer"
              >
                <Eye className="w-3 h-3" />
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

        {/* Header Alert */}
        <div className="flex items-center gap-3 border-b border-red-500/30 pb-2.5">
          <div className="w-10 h-10 rounded-xl bg-red-500/20 border border-red-400 flex items-center justify-center text-red-400 shadow-md shrink-0">
            <Swords className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-cinzel font-extrabold text-base sm:text-lg text-red-300 tracking-wider">
                INCOMING ATTACK!
              </h3>
              <span className="px-2 py-0.5 rounded-full bg-red-500 text-white font-black text-[9.5px] tracking-wider uppercase font-mono">
                Block Step
              </span>
            </div>
            <p className="text-[11.5px] text-slate-300 mt-0.5">
              Opponent declared an attack. Choose whether to intercept with one of your Blockers.
            </p>
          </div>
        </div>

        {/* Incoming Attacker Banner */}
        {attacker && (
          <div className="flex items-center gap-3 bg-slate-950/80 rounded-xl p-2.5 border border-slate-800">
            <div className="w-12 aspect-[491/682] rounded overflow-hidden shrink-0 border border-slate-700">
              <img
                src={attackerImage}
                alt={attacker.card.name}
                className="w-full h-full object-cover"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  if (attacker.card.imageUrl && target.src !== attacker.card.imageUrl) {
                    target.src = attacker.card.imageUrl;
                  }
                }}
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-cinzel font-bold text-white truncate">
                {attacker.card.name}
              </div>
              <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                Effective Attacking Power:{' '}
                <span className="text-red-400 font-bold">{attackerPower}</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                Target:{' '}
                <span className="text-slate-300 capitalize font-medium">
                  {state.combatState?.target.type === 'shield'
                    ? 'Shield Zone'
                    : state.combatState?.target.type === 'player'
                    ? 'Direct Attack (Player)'
                    : 'Tapped Creature'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Prompt message */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-sky-500/20 border border-sky-500/40 flex items-center justify-center text-sky-400 shrink-0">
            <Shield className="w-4 h-4" />
          </div>
          <div className="text-xs text-slate-200">
            You have <strong className="text-amber-300">{validBlockers.length} Blocker(s)</strong> ready on the battlefield.
            <div className="text-[11px] text-slate-400 mt-0.5">
              Do you want to intercept this attack with a blocker?
            </div>
          </div>
        </div>

        {/* Two Clear Choices */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <button
            type="button"
            onClick={onStartArenaSelect}
            className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl font-cinzel font-bold text-xs sm:text-sm bg-gradient-to-r from-sky-600 to-teal-600 hover:from-sky-500 hover:to-teal-500 text-white shadow-lg shadow-sky-950/50 transition-all border border-sky-400/50 cursor-pointer"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Yes, Choose Blocker</span>
          </button>

          <button
            type="button"
            onClick={onPassBlock}
            className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl font-cinzel font-bold text-xs sm:text-sm bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all border border-slate-700 cursor-pointer"
          >
            <X className="w-4 h-4" />
            <span>Pass / Do Not Block</span>
          </button>
        </div>
      </div>
    </div>
  );
};
