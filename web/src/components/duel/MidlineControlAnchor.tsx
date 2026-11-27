import React from 'react';
import { ArrowRight, Bot, Swords, Zap } from 'lucide-react';
import type { Phase } from '../../engine/types.ts';

export interface MidlineControlAnchorProps {
  phase: Phase;
  isPlayerTurn: boolean;
  canDirectAttack: boolean;
  isAutoPlayOpponent: boolean;
  isInterruptLocked?: boolean;
  onDirectAttack?: () => void;
  onPassPhase?: () => void;
  onEndTurn?: () => void;
  onPlayOpponentMove?: () => void;
}

const PHASE_STEPS: Array<{ key: Phase; label: string }> = [
  { key: 'MANA_CHARGE', label: 'MANA' },
  { key: 'MAIN', label: 'MAIN' },
  { key: 'ATTACK', label: 'ATK' },
  { key: 'END_OF_TURN', label: 'END' }
];

export const MidlineControlAnchor: React.FC<MidlineControlAnchorProps> = ({
  phase,
  isPlayerTurn,
  canDirectAttack,
  isAutoPlayOpponent,
  isInterruptLocked = false,
  onDirectAttack,
  onPassPhase,
  onEndTurn,
  onPlayOpponentMove
}) => {
  const riftColor = !isPlayerTurn
    ? 'via-rose-500/45'
    : phase === 'ATTACK'
    ? 'via-red-500/55'
    : phase === 'MAIN'
    ? 'via-emerald-400/50'
    : 'via-amber-400/50';

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      data-testid="midline-control-anchor"
      className="relative w-full flex items-center justify-between gap-2 my-0.5 px-1.5 sm:px-2 py-0.5 select-none shrink-0 z-20"
    >
      {/* Left/Center: Civilization-Reactive Horizon Rift Conduit */}
      <div className="flex-1 min-w-0 flex items-center gap-2 pointer-events-none">
        <div className={`flex-1 h-[1.5px] bg-gradient-to-r from-transparent ${riftColor} to-slate-700/40`} />
        <div className="hidden md:flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-950/90 border border-slate-800/80 shadow-inner">
          {PHASE_STEPS.map((step, idx) => {
            const isActive = step.key === phase;
            return (
              <React.Fragment key={step.key}>
                <span
                  className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold tracking-wider transition-colors ${
                    isActive
                      ? isPlayerTurn
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-400/50'
                        : 'bg-rose-500/20 text-rose-300 border border-rose-400/50'
                      : 'text-slate-600'
                  }`}
                >
                  {step.label}
                </span>
                {idx < PHASE_STEPS.length - 1 && (
                  <span className="text-slate-700 text-[8px]" aria-hidden="true">
                    &rsaquo;
                  </span>
                )}
              </React.Fragment>
            );
          })}
        </div>
        <div className={`w-4 sm:w-8 h-[1.5px] bg-gradient-to-r from-slate-700/40 ${riftColor} to-transparent`} />
      </div>

      {/* Right Anchor: Ergonomic Primary Phase CTA & End Turn */}
      <div className={`flex items-center gap-1.5 shrink-0 ${isInterruptLocked ? 'pointer-events-none opacity-45' : ''}`}>
        {isPlayerTurn && canDirectAttack && (
          <button
            type="button"
            onClick={onDirectAttack}
            className="flex items-center gap-1 px-2.5 sm:px-3 py-1 rounded-lg bg-gradient-to-r from-red-600 to-amber-500 hover:from-red-500 hover:to-amber-400 text-white font-cinzel font-black text-[10px] sm:text-[11px] tracking-wider shadow-lg shadow-red-500/30 animate-pulse cursor-pointer active:scale-95"
          >
            <Zap className="w-3 h-3 fill-current" />
            <span>Direct Attack!</span>
          </button>
        )}

        {isPlayerTurn ? (
          <>
            {phase === 'MANA_CHARGE' && (
              <button
                type="button"
                onClick={onPassPhase}
                className="flex items-center gap-1 px-2.5 sm:px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-cinzel font-black text-[10px] sm:text-[11px] tracking-wide shadow-md shadow-amber-500/20 transition-all cursor-pointer active:scale-95"
              >
                <span>Main Phase</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            )}

            {phase === 'MAIN' && (
              <button
                type="button"
                onClick={onPassPhase}
                className="flex items-center gap-1 px-2.5 sm:px-3 py-1 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-cinzel font-black text-[10px] sm:text-[11px] tracking-wide shadow-md shadow-emerald-500/20 transition-all cursor-pointer active:scale-95"
              >
                <Swords className="w-3 h-3" />
                <span>Attack Phase</span>
              </button>
            )}

            {(phase === 'MANA_CHARGE' || phase === 'MAIN' || phase === 'ATTACK') && (
              <button
                type="button"
                onClick={onEndTurn}
                className={`flex items-center gap-1 px-2.5 sm:px-3 py-1 rounded-lg font-cinzel font-bold text-[10px] sm:text-[11px] tracking-wide border transition-colors cursor-pointer active:scale-95 ${
                  phase === 'ATTACK'
                    ? 'bg-slate-800 hover:bg-slate-700 text-amber-300 border-amber-400/50 shadow-sm'
                    : 'bg-slate-900/95 hover:bg-slate-800 text-slate-300 hover:text-white border-slate-700/80'
                }`}
              >
                <span>End Turn</span>
                {phase === 'ATTACK' && <ArrowRight className="w-3 h-3" />}
              </button>
            )}

            {phase !== 'MANA_CHARGE' && phase !== 'MAIN' && phase !== 'ATTACK' && !canDirectAttack && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900/90 border border-slate-800 text-[10px] font-mono text-amber-300">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                <span>{phase.replace(/_/g, ' ')}</span>
              </div>
            )}
          </>
        ) : !isAutoPlayOpponent ? (
          <button
            type="button"
            onClick={onPlayOpponentMove}
            className="flex items-center gap-1 px-2.5 sm:px-3 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white font-cinzel font-bold text-[10px] sm:text-[11px] shadow-md cursor-pointer animate-pulse"
          >
            <Bot className="w-3 h-3" />
            <span>AI Move</span>
          </button>
        ) : (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950/90 border border-rose-500/35 text-[10px] font-mono text-rose-300">
            <Bot className="w-3 h-3 animate-pulse shrink-0" />
            <span>Opponent Turn</span>
          </div>
        )}
      </div>
    </div>
  );
};
