import React from 'react';
import { Crosshair } from 'lucide-react';
import type { ShieldInstance, AttackTarget, PlayerId } from '../../engine/types';

export interface ShieldsViewProps {
  shields: ShieldInstance[];
  owner: PlayerId;
  canTargetShields?: boolean;
  selectedTarget?: AttackTarget | null;
  onSelectShield?: (index: number) => void;
  compact?: boolean;
  className?: string;
}

export const ShieldsView: React.FC<ShieldsViewProps> = ({
  shields,
  owner: _owner,
  canTargetShields = false,
  selectedTarget = null,
  onSelectShield,
  className = ''
}) => {
  return (
    <div className={`flex items-center justify-center gap-2 sm:gap-2.5 select-none ${className}`}>
      {shields.map((shield, index) => {
        const isBroken = shield.isBroken;
        const isTargeted =
          selectedTarget?.type === 'shield' && selectedTarget.index === index;
        const isClickable = canTargetShields && !isBroken;
        const cardDimensions = 'w-9 h-13 sm:w-10 sm:h-14 md:w-11 md:h-15.5 aspect-[491/682]';

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
