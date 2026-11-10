import React from 'react';
import { Shield, Crosshair, AlertCircle } from 'lucide-react';
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
  showHeader = true,
  className = ''
}) => {
  const isOpponent = owner === 'opponent';
  const unbrokenShieldsCount = shields.filter((s) => !s.isBroken).length;

  return (
    <div className={`flex flex-col gap-1.5 select-none ${className}`}>
      {/* Header Info */}
      {showHeader && (
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-1.5 text-xs font-cinzel font-bold text-slate-300">
            <Shield className={`w-3.5 h-3.5 ${isOpponent ? 'text-red-400' : 'text-amber-400'}`} />
            <span>
              {isOpponent ? "Opponent's" : "Your"} Shields ({unbrokenShieldsCount}/5)
            </span>
          </div>
          {canTargetShields && isOpponent && (
            <span className="text-[11px] font-semibold text-red-400 animate-pulse flex items-center gap-1">
              <Crosshair className="w-3 h-3" /> Click shield to attack
            </span>
          )}
        </div>
      )}

      {/* 5 Shield Slots */}
      <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
        {shields.map((shield, index) => {
          const isBroken = shield.isBroken;
          const isTargeted =
            selectedTarget?.type === 'shield' && selectedTarget.index === index;
          const isClickable = canTargetShields && isOpponent && !isBroken;
          const heightClasses = compact ? 'h-14 sm:h-16' : 'h-20 sm:h-24 md:h-28';

          if (isBroken) {
            return (
              <div
                key={shield.id || `empty-${index}`}
                className={`${heightClasses} rounded-xl border border-dashed border-slate-800 bg-slate-950/40 flex flex-col items-center justify-center p-1 text-slate-700 transition-all opacity-60`}
                title={`Shield #${index + 1} (Broken)`}
              >
                <AlertCircle className="w-3.5 h-3.5 mb-0.5 text-slate-700" />
                <span className="text-[9px] font-mono uppercase tracking-wider text-slate-600">
                  Broken
                </span>
              </div>
            );
          }

          return (
            <div
              key={shield.id || `shield-${index}`}
              onMouseEnter={() => {
                if (!isBroken && shield.card) {
                  onHoverCard?.(shield.card);
                }
              }}
              onMouseLeave={() => onHoverCard?.(null)}
              onClick={() => {
                if (isClickable && onSelectShield) {
                  onSelectShield(index);
                }
              }}
              title={
                isClickable
                  ? `Click to Attack Shield #${index + 1}`
                  : `Shield #${index + 1} (Intact)`
              }
              className={`relative ${heightClasses} rounded-xl p-1.5 transition-all duration-200 flex flex-col items-center justify-between border ${
                isClickable
                  ? 'cursor-pointer hover:scale-105 border-red-500/90 bg-gradient-to-b from-red-950/60 via-slate-900 to-red-950/70 shadow-lg shadow-red-500/25 ring-1 ring-red-400 animate-pulse'
                  : isTargeted
                  ? 'ring-2 ring-red-400 border-red-500 scale-105 bg-slate-900 shadow-md shadow-red-500/30'
                  : isOpponent
                  ? 'border-slate-800 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 shadow-md'
                  : 'border-amber-500/40 bg-gradient-to-b from-amber-950/30 via-slate-900 to-slate-950 shadow-md'
              }`}
            >
              {/* Shield Number Badge */}
              <div className="w-full flex justify-between items-center text-[9px] font-mono text-slate-400 leading-none">
                <span>#{index + 1}</span>
                {isClickable && (
                  <Crosshair className="w-3 h-3 text-red-400 animate-spin-slow" />
                )}
              </div>

              {/* Shield Emblem Icon */}
              <div
                className={`${compact ? 'w-6 h-6' : 'w-8 h-8'} rounded-full border flex items-center justify-center transition-all ${
                  isClickable
                    ? 'border-red-400 bg-red-500/30 text-red-300 shadow-[0_0_8px_rgba(239,68,68,0.6)]'
                    : isOpponent
                    ? 'border-slate-700 bg-slate-800/80 text-slate-400'
                    : 'border-amber-400/50 bg-amber-500/15 text-amber-300 shadow-[0_0_6px_rgba(245,158,11,0.2)]'
                }`}
              >
                <Shield className={`${compact ? 'w-3 h-3' : 'w-4 h-4'} fill-current/20`} />
              </div>

              {/* Status footer */}
              <span
                className={`text-[8px] sm:text-[9px] font-cinzel font-bold tracking-wider leading-none ${
                  isClickable ? 'text-red-300' : 'text-slate-400'
                }`}
              >
                {isClickable ? 'STRIKE' : 'SHIELD'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
