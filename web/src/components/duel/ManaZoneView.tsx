import React from 'react';
import { Sparkles } from 'lucide-react';
import type { ManaCardInstance, PlayerId } from '../../engine/types';
import type { CardDefinition, Civilization } from '../../types/card';
import { CivilizationIcon } from '../card/CivilizationIcon';

export interface ManaZoneViewProps {
  manaZone: ManaCardInstance[];
  owner: PlayerId;
  onInspectCard?: (card: CardDefinition) => void;
  onHoverCard?: (card: CardDefinition | null) => void;
  compact?: boolean;
  className?: string;
}

export const ManaZoneView: React.FC<ManaZoneViewProps> = ({
  manaZone,
  owner,
  onInspectCard,
  onHoverCard,
  compact = true,
  className = ''
}) => {
  const isOpponent = owner === 'opponent';
  const untappedCount = manaZone.filter((m) => !m.isTapped).length;
  const totalCount = manaZone.length;

  // Collect available civilizations
  const civilizations = Array.from(
    new Set(manaZone.flatMap((m) => m.card.civilizations))
  ) as Civilization[];

  if (totalCount === 0) {
    return (
      <div className={`h-6 sm:h-7 px-2 rounded-md border border-dashed border-slate-800/80 bg-slate-950/40 flex items-center justify-between text-[10px] text-slate-500 font-mono select-none shrink-0 ${className}`}>
        <div className="flex items-center gap-1.5 text-slate-400 font-cinzel font-bold">
          <Sparkles className="w-3 h-3 text-amber-500/70" />
          <span>{isOpponent ? "Opponent's" : "Your"} Mana: 0/0</span>
        </div>
        <span className="italic text-slate-600 text-[9px]">No cards in mana zone</span>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-0.5 select-none shrink-0 ${className}`}>
      {/* Header with Civ Icons and Ready/Tapped Ratio */}
      <div className="flex items-center justify-between px-1 text-[10px]">
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1 font-cinzel font-bold text-slate-300">
            <Sparkles className="w-3 h-3 text-amber-400" />
            <span>
              {isOpponent ? "Opponent's" : "Your"} Mana: {untappedCount}/{totalCount}
            </span>
          </div>

          {/* Civ icons */}
          <div className="flex items-center gap-0.5 ml-1">
            {civilizations.map((civ) => (
              <div key={civ} title={civ}>
                <CivilizationIcon civilization={civ} className="w-3 h-3" />
              </div>
            ))}
          </div>
        </div>

        <span className="text-[9px] text-slate-500 font-mono">
          {untappedCount} ready, {totalCount - untappedCount} tapped
        </span>
      </div>

      {/* Cards list - Compact horizontal strip */}
      <div
        className={`${
          compact ? 'h-11 sm:h-12 py-0.5 px-1' : 'min-h-14 p-1.5'
        } rounded-md border border-slate-800/80 bg-slate-950/60 flex items-center gap-1 overflow-x-auto scrollbar-thin`}
      >
        {manaZone.map((manaCard) => {
          const card = manaCard.card;
          const isTapped = manaCard.isTapped;
          const primaryCiv = card.civilizations[0];
          const imageSrc = card.imageAssetPath
            ? `/${card.imageAssetPath}`
            : card.imageUrl;

          return (
            <div
              key={manaCard.instanceId}
              onMouseEnter={() => onHoverCard?.(card)}
              onMouseLeave={() => onHoverCard?.(null)}
              onClick={() => onInspectCard?.(card)}
              className={`relative shrink-0 rounded-sm overflow-hidden border transition-all duration-200 cursor-pointer group ${
                compact ? 'w-8 h-10 sm:w-9 sm:h-11' : 'w-14 h-18 sm:w-16 sm:h-20'
              } ${
                isTapped
                  ? 'opacity-55 border-slate-700 rotate-12 scale-90'
                  : 'border-amber-400/50 hover:border-amber-400 hover:scale-105 shadow-sm shadow-amber-500/10'
              }`}
              title={`${card.name} (${card.civilizations.join('/')}) - ${
                isTapped ? 'Tapped' : 'Untapped'
              }`}
            >
              {/* Image */}
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

              {/* Civ indicator icon on top-left */}
              <div className="absolute top-0.5 left-0.5 p-0.5 rounded bg-slate-950/80 backdrop-blur-xs">
                <CivilizationIcon civilization={primaryCiv} className="w-2.5 h-2.5" />
              </div>

              {/* Mana number indicator bottom-right */}
              <div className="absolute bottom-0.5 right-0.5 px-0.5 rounded bg-slate-950/85 text-[7px] font-mono font-bold text-amber-300 border border-amber-400/30 leading-none">
                {card.manaNumber || 1}
              </div>

              {/* Tapped Badge */}
              {isTapped && (
                <div className="absolute inset-0 bg-slate-950/60 flex items-center justify-center">
                  <span className="text-[7px] font-mono font-bold uppercase tracking-wider text-slate-300 px-0.5 py-0.2 rounded bg-slate-900/95 border border-slate-700 leading-none">
                    Tap
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
