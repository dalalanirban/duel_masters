import React from 'react';
import { Clock } from 'lucide-react';

export interface PlayerClockBadgeProps {
  label?: string;
  className?: string;
}

/**
 * Reserved fixed-width UI slot for the future per-player total chess clock.
 * Pure visual placeholder (timer logic deferred to a later milestone).
 */
export const PlayerClockBadge: React.FC<PlayerClockBadgeProps> = ({
  label = '--:--',
  className = ''
}) => {
  return (
    <div
      data-testid="player-clock-slot"
      title="Player total time clock (reserved for future release)"
      className={`inline-flex items-center justify-center gap-1 min-w-[54px] px-1.5 py-0.5 rounded bg-slate-900/80 border border-slate-800/90 text-slate-500 font-mono text-[10px] font-semibold tabular-nums shrink-0 ${className}`}
    >
      <Clock className="w-2.5 h-2.5 text-slate-600 shrink-0" />
      <span>{label}</span>
    </div>
  );
};
