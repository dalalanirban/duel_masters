import React from 'react';
import { Sparkles } from 'lucide-react';
import type { CardDefinition } from '../../types/card';
import type { BattlezoneLogEntry } from './activeVoiceLog';

export interface SpellSpotlightState {
  card: CardDefinition;
  actor: 'player' | 'opponent';
  key: number;
}

interface BattlezoneOverlayProps {
  logs: BattlezoneLogEntry[];
  activePlayer: 'player' | 'opponent';
  spellSpotlight: SpellSpotlightState | null;
}

export const BattlezoneOverlay: React.FC<BattlezoneOverlayProps> = ({
  logs,
  activePlayer: _activePlayer,
  spellSpotlight
}) => {
  const recentLogs = logs.slice(-3);
  const spellImg = spellSpotlight?.card.imageAssetPath
    ? `/${spellSpotlight.card.imageAssetPath}`
    : spellSpotlight?.card.imageUrl;

  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex flex-col justify-between overflow-hidden">
      {/* Active-Voice Battlezone Action Log (AI side) */}
      <div className="flex flex-col gap-1.5 px-3 py-2 max-w-md items-start self-start mt-1">
        {recentLogs.map((entry) => {
          const isPlayer = entry.actor === 'player';
          return (
            <div
              key={entry.id}
              className={`animate-bz-log px-3 py-1.5 rounded-lg border backdrop-blur-md shadow-lg text-xs sm:text-sm font-medium tracking-wide ${
                isPlayer
                  ? 'bg-amber-950/85 border-amber-400/50 text-amber-100 shadow-amber-950/60'
                  : 'bg-rose-950/85 border-rose-400/50 text-rose-100 shadow-rose-950/60'
              }`}
            >
              <span
                className={`inline-block w-1.5 h-1.5 rounded-full mr-2 align-middle ${
                  isPlayer ? 'bg-amber-400' : 'bg-rose-400'
                }`}
              />
              {entry.text}
            </div>
          );
        })}
      </div>

      {/* Spell Spotlight Overlay */}
      {spellSpotlight && (
        <div
          key={spellSpotlight.key}
          className="animate-spell-spotlight absolute inset-0 flex items-center justify-center"
        >
          <div className="relative flex flex-col items-center gap-2 p-3 rounded-2xl bg-slate-950/85 border border-amber-400/60 shadow-2xl shadow-amber-500/30 backdrop-blur-md">
            <div className="flex items-center gap-1.5 text-[11px] font-cinzel font-bold uppercase tracking-widest text-amber-300">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>
                {spellSpotlight.actor === 'player' ? 'I cast' : 'Opponent casts'}
              </span>
            </div>
            {spellImg ? (
              <img
                src={spellImg}
                alt={spellSpotlight.card.name}
                className="w-28 sm:w-36 aspect-[491/682] rounded-lg object-cover border border-amber-300/50 shadow-lg"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  if (
                    spellSpotlight.card.imageUrl &&
                    target.src !== spellSpotlight.card.imageUrl
                  ) {
                    target.src = spellSpotlight.card.imageUrl;
                  }
                }}
              />
            ) : null}
            <div className="text-xs sm:text-sm font-bold text-white text-center max-w-[10rem] truncate">
              {spellSpotlight.card.name}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
