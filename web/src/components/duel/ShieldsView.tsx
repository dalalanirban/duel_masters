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
  owner,
  canTargetShields = false,
  canDirectAttack = false,
  onDirectAttack,
  selectedTarget = null,
  selectedShieldIndices = [],
  requiredSelectionCount = 1,
  onSelectShield,
  className = ''
}) => {
  const isOpponent = owner === 'opponent';
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

  return (
    <div className={`flex items-center justify-center gap-2 sm:gap-2.5 select-none ${className}`}>
      {shields.map((shield, index) => {
        const isBroken = shield.isBroken;
        const isTargeted =
          selectedTarget?.type === 'shield' &&
          (selectedTarget.indices?.includes(index) || selectedTarget.index === index);
        const selectionOrder = selectedShieldIndices.indexOf(index);
        const isSelectedInMulti = selectionOrder >= 0;
        const isClickable = canTargetShields && isOpponent && !isBroken;

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
            {/* Top Energy Filament & Selection Badge */}
            <div className="w-full flex items-center justify-between px-0.5">
              <div
                className={`h-[1.5px] rounded-full transition-all ${
                  isSelectedInMulti
                    ? 'w-1/2 bg-red-400 shadow-[0_0_6px_rgba(239,68,68,0.9)]'
                    : isClickable
                    ? 'w-3/4 bg-red-400/80 shadow-[0_0_6px_rgba(239,68,68,0.9)]'
                    : 'w-3/4 bg-cyan-300 shadow-[0_0_4px_rgba(103,232,249,0.8)]'
                }`}
              />
              {isSelectedInMulti && (
                <span className="flex items-center justify-center w-3.5 h-3.5 rounded-full bg-red-600 text-white font-mono font-black text-[8px] shadow-sm shadow-red-500 ring-1 ring-red-300 animate-pulse">
                  #{selectionOrder + 1}
                </span>
              )}
            </div>

            {/* Glowing Translucent Blue Heraldic Shield Crest */}
            <div className="relative my-auto flex items-center justify-center">
              <svg
                viewBox="0 0 24 28"
                className={`w-5 h-6 sm:w-5.5 sm:h-6.5 transition-transform duration-200 ${
                  isSelectedInMulti
                    ? 'text-red-400 drop-shadow-[0_0_12px_rgba(239,68,68,0.9)] scale-115'
                    : isClickable
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
                    isSelectedInMulti || isClickable
                      ? 'fill-red-950/70 stroke-red-400 stroke-[1.5]'
                      : 'fill-cyan-950/50 stroke-cyan-400/90 stroke-[1.3]'
                  }
                />
                {/* Inner Energy Rune Core */}
                <path
                  d="M12 6 L17 8 L17 13 C17 17 12 21 12 21 C12 21 7 17 7 13 L7 8 Z"
                  className={
                    isSelectedInMulti || isClickable
                      ? 'fill-red-500/40'
                      : 'fill-cyan-400/25'
                  }
                />
                {/* Center Core Crystal */}
                <circle
                  cx="12"
                  cy="13"
                  r="1.8"
                  className={isSelectedInMulti || isClickable ? 'fill-red-200' : 'fill-cyan-200'}
                />
              </svg>

              {isClickable && !isSelectedInMulti && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <Crosshair className="w-3.5 h-3.5 text-red-400 animate-spin-slow" />
                </div>
              )}
            </div>

            {/* Bottom Energy Point */}
            <div
              className={`w-1/2 h-[1px] rounded-full mx-auto mb-0.5 ${
                isSelectedInMulti || isClickable
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
              aria-label={`Target Shield #${index + 1}`}
              title={
                isSelectedInMulti
                  ? `Selected Target #${selectionOrder + 1}`
                  : requiredSelectionCount > 1
                  ? `Select Shield (${selectedShieldIndices.length}/${requiredSelectionCount})`
                  : 'Strike Shield'
              }
              className={`relative ${cardDimensions} rounded-md p-1 transition-transform duration-150 flex flex-col items-center justify-between border cursor-pointer ${
                isSelectedInMulti
                  ? 'border-red-400 ring-2 ring-red-400/90 bg-gradient-to-b from-red-950/90 via-slate-950 to-red-950/90 shadow-xl shadow-red-500/50 scale-108'
                  : 'border-red-500/90 bg-gradient-to-b from-red-950/70 via-slate-950 to-red-950/70 shadow-lg shadow-red-500/30 ring-1 ring-red-400 hover:scale-108 active:scale-95 animate-pulse'
              } focus-visible:ring-2 focus-visible:ring-red-400 outline-none`}
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
