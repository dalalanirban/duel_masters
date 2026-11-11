import React from 'react';
import { Crosshair, Skull } from 'lucide-react';
import type { ShieldInstance, AttackTarget, PlayerId } from '../../engine/types';

export interface ShieldsViewProps {
  shields: ShieldInstance[];
  owner: PlayerId;
  canTargetShields?: boolean;
  canDirectAttack?: boolean;
  onDirectAttack?: () => void;
  selectedTarget?: AttackTarget | null;
  selectedShieldIndices?: number[];
  requiredSelectionCount?: number;
  onSelectShield?: (index: number) => void;
  compact?: boolean;
  className?: string;
}

export const ShieldsView: React.FC<ShieldsViewProps> = ({
  shields,
  owner: _owner,
  canTargetShields = false,
  canDirectAttack = false,
  onDirectAttack,
  selectedTarget = null,
  selectedShieldIndices = [],
  requiredSelectionCount = 1,
  onSelectShield
}) => {
  const isOpponent = owner === 'opponent';
  const unbrokenShieldsCount = shields.filter((s) => !s.isBroken).length;
  const isMultiSelecting = canTargetShields && isOpponent && requiredSelectionCount > 1;

  return (
    <div className="flex flex-col gap-1.5 select-none">
      {/* Header Info */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5 text-xs font-cinzel font-bold text-slate-300">
          <Shield className={`w-3.5 h-3.5 ${isOpponent ? 'text-red-400' : 'text-amber-400'}`} />
          <span>
            {isOpponent ? "Opponent's" : "Your"} Shields ({unbrokenShieldsCount}/5)
          </span>
        </div>
        {canTargetShields && isOpponent && (
          <span className="text-[11px] font-semibold text-red-400 animate-pulse flex items-center gap-1">
            <Crosshair className="w-3 h-3" />
            {isMultiSelecting
              ? `Select ${requiredSelectionCount} shields (${selectedShieldIndices.length}/${requiredSelectionCount})`
              : 'Click shield to attack'}
          </span>
        )}
  onSelectShield,
  className = ''
}) => {
  const cardDimensions = 'w-9 h-13 sm:w-10 sm:h-14 md:w-11 md:h-15.5 aspect-[491/682]';

  // If opponent has 0 unbroken shields and canDirectAttack is active:
  // Render the entire shield zone as a clickable Final Blow Direct Attack target!
  if (canDirectAttack) {
    return (
      <div className={`flex items-center justify-center w-full select-none ${className}`}>
        <button
          type="button"
          onClick={onDirectAttack}
          aria-label="Direct Attack Opponent"
          title="Direct Attack! Click here to land the final blow and win the duel!"
          className="relative w-full max-w-md h-13 sm:h-14 md:h-15.5 rounded-lg border-2 border-red-500/90 bg-gradient-to-r from-red-950/90 via-slate-950/95 to-red-950/90 shadow-[0_0_20px_rgba(239,68,68,0.5)] ring-2 ring-red-400/80 flex items-center justify-center gap-2.5 px-4 cursor-pointer hover:scale-103 active:scale-97 transition-all animate-pulse"
        >
          <Crosshair className="w-5 h-5 text-red-400 animate-spin-slow" />
          <div className="flex flex-col items-center">
            <span className="font-cinzel font-black text-xs sm:text-sm text-red-100 tracking-widest uppercase">
              FINAL BLOW &bull; DIRECT ATTACK
            </span>
            <span className="text-[9px] font-mono text-red-400 font-semibold">
              Click to strike player directly
            </span>
          </div>
          <Skull className="w-5 h-5 text-red-400" />
        </button>
      </div>
    );
  }

      {/* 5 Shield Slots */}
      <div className="grid grid-cols-5 gap-2 md:gap-3">
        {shields.map((shield, index) => {
          const isBroken = shield.isBroken;
          const isTargeted =
            selectedTarget?.type === 'shield' &&
            (selectedTarget.indices?.includes(index) || selectedTarget.index === index);
          const selectionOrder = selectedShieldIndices.indexOf(index);
          const isSelectedInMulti = selectionOrder >= 0;
          const isClickable = canTargetShields && isOpponent && !isBroken;
  return (
    <div className={`flex items-center justify-center gap-2 sm:gap-2.5 select-none ${className}`}>
      {shields.map((shield, index) => {
        const isBroken = shield.isBroken;
        const isTargeted =
          selectedTarget?.type === 'shield' && selectedTarget.index === index;
        const isClickable = canTargetShields && !isBroken;

        if (isBroken) {
          return (
            <div
              key={shield.id || `empty-${index}`}
              className={`${cardDimensions} rounded-md border border-dashed border-cyan-900/30 bg-cyan-950/10 flex items-center justify-center p-0.5 transition-opacity opacity-25`}
              title="Shattered Shield"
            >
              {/* Dissipated Shield Silhouette */}
              <svg
                viewBox="0 0 24 28"
                className="w-4 h-5 text-cyan-900/50 stroke-current fill-none stroke-[1.2]"
              >
                <path d="M12 2 L21 5 L21 13 C21 20 12 26 12 26 C12 26 3 20 3 13 L3 5 Z" strokeDasharray="2 2" />
              </svg>
            </div>
          );
        }

        const shieldVisual = (
          <>
            {/* Top Energy Filament */}
            <div
              key={shield.id}
              onClick={() => {
                if (isClickable && onSelectShield) {
                  onSelectShield(index);
                }
              }}
              className={`relative h-20 sm:h-24 md:h-28 rounded-lg p-2 transition-all duration-200 flex flex-col items-center justify-between border ${
                isSelectedInMulti
                  ? 'cursor-pointer scale-105 ring-2 ring-red-400 border-red-400 bg-gradient-to-b from-red-950/80 via-slate-900 to-red-950/90 shadow-lg shadow-red-500/50'
                  : isClickable
                  ? 'cursor-pointer hover:scale-105 border-red-500/80 bg-gradient-to-b from-red-950/40 via-slate-900 to-red-950/60 shadow-lg shadow-red-500/20 animate-pulse'
                  : isTargeted
                  ? 'ring-2 ring-red-400 border-red-500 scale-105 bg-slate-900'
                  : isOpponent
                  ? 'border-slate-800 bg-gradient-to-b from-slate-900 to-slate-950 shadow-md'
                  : 'border-amber-500/40 bg-gradient-to-b from-amber-950/30 via-slate-900 to-slate-950 shadow-md'
              }`}
            >
              {/* Shield Number Badge */}
              <div className="w-full flex justify-between items-center text-[10px] font-mono text-slate-400">
                <span>#{index + 1}</span>
                {isSelectedInMulti ? (
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white font-bold text-[10px] shadow-sm shadow-red-500">
                    #{selectionOrder + 1}
                  </span>
                ) : isClickable ? (
                  <Crosshair className="w-3.5 h-3.5 text-red-400 animate-spin-slow" />
                ) : null}
              </div>

              {/* Shield Emblem Icon */}
              <div
                className={`w-8 h-8 rounded-full border flex items-center justify-center ${
                  isSelectedInMulti
                    ? 'border-red-400 bg-red-500/40 text-red-200 shadow-[0_0_12px_rgba(239,68,68,0.7)]'
                    : isClickable
                    ? 'border-red-400 bg-red-500/20 text-red-300 shadow-[0_0_8px_rgba(239,68,68,0.5)]'
                    : isOpponent
                    ? 'border-slate-700 bg-slate-800/80 text-slate-400'
                    : 'border-amber-400/50 bg-amber-500/10 text-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.2)]'
              className={`w-3/4 h-[1.5px] rounded-full mx-auto mt-0.5 ${
                isClickable
                  ? 'bg-red-400 shadow-[0_0_6px_rgba(239,68,68,0.9)]'
                  : 'bg-cyan-300 shadow-[0_0_4px_rgba(103,232,249,0.8)]'
              }`}
            />

            {/* Glowing Translucent Blue Heraldic Shield Crest */}
            <div className="relative my-auto flex items-center justify-center">
              <svg
                viewBox="0 0 24 28"
                className={`w-5 h-6 sm:w-5.5 sm:h-6.5 transition-transform duration-200 ${
                  isClickable
                    ? 'text-red-400 drop-shadow-[0_0_8px_rgba(239,68,68,0.8)] scale-110'
                    : isTargeted
                    ? 'text-red-300 drop-shadow-[0_0_10px_rgba(248,113,113,0.9)]'
                    : 'text-cyan-300 drop-shadow-[0_0_8px_rgba(6,182,212,0.6)]'
                }`}
                fill="currentColor"
              >
                {/* Outer Shield Frame */}
                <path
                  d="M12 2 L21 5 L21 13 C21 19.5 12 25.5 12 25.5 C12 25.5 3 19.5 3 13 L3 5 Z"
                  className={
                    isClickable
                      ? 'fill-red-950/70 stroke-red-400 stroke-[1.5]'
                      : 'fill-cyan-950/50 stroke-cyan-400/90 stroke-[1.3]'
                  }
                />
                {/* Inner Energy Rune Core */}
                <path
                  d="M12 6 L17 8 L17 13 C17 17 12 21 12 21 C12 21 7 17 7 13 L7 8 Z"
                  className={
                    isClickable
                      ? 'fill-red-500/40'
                      : 'fill-cyan-400/25'
                  }
                />
                {/* Center Core Crystal */}
                <circle
                  cx="12"
                  cy="13"
                  r="1.8"
                  className={isClickable ? 'fill-red-200' : 'fill-cyan-200'}
                />
              </svg>

              {/* Status footer */}
              <span className="text-[10px] font-cinzel font-semibold tracking-wider text-slate-400">
                {isSelectedInMulti ? `TARGET #${selectionOrder + 1}` : isClickable ? 'STRIKE' : 'SHIELD'}
              </span>
              {isClickable && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Crosshair className="w-4 h-4 text-red-400 animate-spin-slow" />
                </div>
              )}
            </div>

            {/* Bottom Energy Point */}
            <div
              className={`w-1/2 h-[1px] rounded-full mx-auto mb-0.5 ${
                isClickable
                  ? 'bg-red-400/80 shadow-[0_0_4px_rgba(239,68,68,0.8)]'
                  : 'bg-cyan-400/60 shadow-[0_0_3px_rgba(103,232,249,0.7)]'
              }`}
            />
          </>
        );

        if (isClickable) {
          return (
            <button
              key={shield.id || `shield-${index}`}
              type="button"
              onClick={() => onSelectShield?.(index)}
              aria-label="Attack Opponent Shield"
              title="Strike Shield"
              className={`relative ${cardDimensions} rounded-md p-1 transition-transform duration-150 flex flex-col items-center justify-between border cursor-pointer border-red-500/90 bg-gradient-to-b from-red-950/70 via-slate-950 to-red-950/70 shadow-lg shadow-red-500/30 ring-1 ring-red-400 hover:scale-108 active:scale-95 focus-visible:ring-2 focus-visible:ring-red-400 outline-none animate-pulse`}
            >
              {shieldVisual}
            </button>
          );
        }

        return (
          <div
            key={shield.id || `shield-${index}`}
            title="Intact Shield"
            className={`relative ${cardDimensions} rounded-md p-1 transition-transform duration-150 flex flex-col items-center justify-between border ${
              isTargeted
                ? 'ring-2 ring-red-400 border-red-500 scale-108 bg-slate-900 shadow-md shadow-red-500/40'
                : 'border-cyan-400/50 bg-gradient-to-b from-cyan-950/40 via-slate-950/90 to-cyan-950/40 shadow-[0_0_10px_rgba(6,182,212,0.25)] backdrop-blur-xs'
            }`}
          >
            {shieldVisual}
          </div>
        );
      })}
    </div>
  );
};
