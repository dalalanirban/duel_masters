import React from 'react';
import { Crosshair } from 'lucide-react';
import type { ShieldInstance, AttackTarget, PlayerId } from '../../engine/types';
import type { CardDefinition } from '../../types/card';

export interface ShieldsViewProps {
  shields: ShieldInstance[];
  owner: PlayerId;
  canTargetShields?: boolean;
  selectedTarget?: AttackTarget | null;
  onSelectShield?: (index: number) => void;
  onHoverCard?: (card: CardDefinition | null) => void;
  compact?: boolean;
  showHeader?: boolean;
  className?: string;
}

export const ShieldsView: React.FC<ShieldsViewProps> = ({
  shields,
  owner,
  canTargetShields = false,
  selectedTarget = null,
  onSelectShield,
  onHoverCard,
  compact = true,
  showHeader = false,
  className = ''
}) => {
  const isOpponent = owner === 'opponent';

  return (
    <div className={`flex flex-col gap-1 select-none ${className}`}>
      {/* Optional minimal header */}
      {showHeader && (
        <div className="flex items-center justify-between px-1 text-[10px] font-cinzel text-slate-400">
          <span>{isOpponent ? "Opponent Shields" : "Your Shields"}</span>
          {canTargetShields && isOpponent && (
            <span className="text-red-400 font-semibold animate-pulse flex items-center gap-1">
              <Crosshair className="w-2.5 h-2.5" /> Targetable
            </span>
          )}
        </div>
      )}

      {/* 5 Heraldic Shield Crests */}
      <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
        {shields.map((shield, index) => {
          const isBroken = shield.isBroken;
          const isTargeted =
            selectedTarget?.type === 'shield' && selectedTarget.index === index;
          const isClickable = canTargetShields && isOpponent && !isBroken;
          const heightClasses = compact ? 'h-11 sm:h-12' : 'h-14 sm:h-16';

          if (isBroken) {
            return (
              <div
                key={shield.id || `empty-${index}`}
                className={`${heightClasses} rounded-md border border-dashed border-slate-800/40 bg-slate-950/20 flex flex-col items-center justify-center p-0.5 text-slate-800 transition-opacity opacity-40`}
                title={`Shield #${index + 1} (Shattered)`}
              >
                {/* Dissipated Heraldic Silhouette */}
                <svg
                  viewBox="0 0 24 28"
                  className="w-4 h-5 text-slate-800 stroke-current fill-none stroke-[1.5]"
                >
                  <path d="M12 2 L21 5 L21 13 C21 20 12 26 12 26 C12 26 3 20 3 13 L3 5 Z" strokeDasharray="2 2" />
                </svg>
                <span className="text-[7px] font-mono text-slate-700 mt-0.5">#{index + 1}</span>
              </div>
            );
          }

          const shieldContent = (
            <>
              {/* Top Index Crest Tag */}
              <div className="w-full flex items-center justify-between px-1 text-[8px] font-mono leading-none z-10">
                <span className={isClickable ? 'text-red-300 font-bold' : isOpponent ? 'text-slate-400' : 'text-amber-400/90'}>
                  #{index + 1}
                </span>
                {isClickable && (
                  <Crosshair className="w-2.5 h-2.5 text-red-400 animate-spin-slow" />
                )}
              </div>

              {/* Ornate Heraldic Shield Crest Icon */}
              <div className="relative my-auto flex items-center justify-center">
                <svg
                  viewBox="0 0 24 28"
                  className={`w-5 h-6 sm:w-5.5 sm:h-6.5 transition-transform duration-200 ${
                    isClickable
                      ? 'text-red-400 drop-shadow-[0_0_6px_rgba(239,68,68,0.7)] scale-110'
                      : isTargeted
                      ? 'text-red-300 drop-shadow-[0_0_8px_rgba(248,113,113,0.8)]'
                      : isOpponent
                      ? 'text-slate-400 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]'
                      : 'text-amber-400/90 drop-shadow-[0_0_4px_rgba(245,158,11,0.3)]'
                  }`}
                  fill="currentColor"
                >
                  {/* Outer Shield Frame */}
                  <path
                    d="M12 2 L21 5 L21 13 C21 19.5 12 25.5 12 25.5 C12 25.5 3 19.5 3 13 L3 5 Z"
                    className={
                      isClickable
                        ? 'fill-red-950/80 stroke-red-400 stroke-[1.5]'
                        : isOpponent
                        ? 'fill-slate-900/90 stroke-slate-600/80 stroke-[1.2]'
                        : 'fill-slate-900/90 stroke-amber-500/80 stroke-[1.2]'
                    }
                  />
                  {/* Inner Rune Core */}
                  <path
                    d="M12 6 L17 8 L17 13 C17 17 12 21 12 21 C12 21 7 17 7 13 L7 8 Z"
                    className={
                      isClickable
                        ? 'fill-red-500/30'
                        : isOpponent
                        ? 'fill-slate-800/60'
                        : 'fill-amber-500/25'
                    }
                  />
                  {/* Center Sigil Star */}
                  <circle cx="12" cy="13" r="1.8" className={isClickable ? 'fill-red-200' : isOpponent ? 'fill-slate-400' : 'fill-amber-300'} />
                </svg>
              </div>

              {/* Energy Filament Accent Line */}
              <div
                className={`w-4/5 h-[1.5px] rounded-full z-10 ${
                  isClickable
                    ? 'bg-red-400 shadow-[0_0_6px_rgba(239,68,68,0.8)]'
                    : isOpponent
                    ? 'bg-slate-700/60'
                    : 'bg-amber-400/40'
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
                onMouseEnter={() => shield.card && onHoverCard?.(shield.card)}
                onMouseLeave={() => onHoverCard?.(null)}
                aria-label={`Attack Opponent Shield #${index + 1}`}
                title={`Strike Shield #${index + 1}`}
                className={`relative ${heightClasses} rounded-md p-1 transition-transform duration-150 flex flex-col items-center justify-between border cursor-pointer border-red-500/80 bg-gradient-to-b from-red-950/70 via-slate-950 to-red-950/70 shadow-lg shadow-red-500/20 ring-1 ring-red-400 hover:scale-105 active:scale-95 focus-visible:ring-2 focus-visible:ring-red-400 outline-none animate-pulse`}
              >
                {shieldContent}
              </button>
            );
          }

          return (
            <div
              key={shield.id || `shield-${index}`}
              onMouseEnter={() => shield.card && onHoverCard?.(shield.card)}
              onMouseLeave={() => onHoverCard?.(null)}
              title={`Shield #${index + 1} (Intact)`}
              className={`relative ${heightClasses} rounded-md p-1 transition-transform duration-150 flex flex-col items-center justify-between border ${
                isTargeted
                  ? 'ring-2 ring-red-400 border-red-500 scale-105 bg-slate-900 shadow-md shadow-red-500/30'
                  : isOpponent
                  ? 'border-slate-800/80 bg-gradient-to-b from-slate-900/80 via-slate-950 to-slate-900/80 shadow-xs'
                  : 'border-amber-500/30 bg-gradient-to-b from-amber-950/20 via-slate-950 to-amber-950/20 shadow-xs'
              }`}
            >
              {shieldContent}
            </div>
          );
        })}
      </div>
    </div>
  );
};
