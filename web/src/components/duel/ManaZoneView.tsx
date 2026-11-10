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

  return (
    <div className={`flex flex-col gap-1 select-none ${className}`}>
      {/* Header with Civ Icons and Ready/Tapped Ratio */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-xs font-cinzel font-bold text-slate-300">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>
              {isOpponent ? "Opponent's" : "Your"} Mana: {untappedCount}/{totalCount}
            </span>
          </div>

          {/* Civ icons */}
          <div className="flex items-center gap-1 ml-1">
            {civilizations.map((civ) => (
              <div key={civ} title={civ}>
                <CivilizationIcon civilization={civ} className="w-3.5 h-3.5" />
              </div>
            ))}
          </div>
        </div>

        <span className="text-[10px] text-slate-500 font-mono">
          {totalCount === 0
            ? '0 cards'
            : `${untappedCount} ready, ${totalCount - untappedCount} tapped`}
        </span>
      </div>

      {/* Cards list - Compact horizontal strip */}
      <div
        className={`${
          compact ? 'min-h-14 sm:min-h-16 py-1 px-1.5' : 'min-h-16 p-2'
        } rounded-xl border border-slate-800/80 bg-slate-950/60 flex items-center gap-1.5 sm:gap-2 overflow-x-auto scrollbar-thin`}
      >
        {totalCount === 0 ? (
          <div className="w-full text-center py-2 text-xs text-slate-600 font-mono italic">
            No cards in mana zone
          </div>
        ) : (
          manaZone.map((manaCard) => {
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
                className={`relative shrink-0 rounded-lg overflow-hidden border transition-all duration-200 cursor-pointer group ${
                  compact ? 'w-11 h-15 sm:w-12 sm:h-16' : 'w-16 h-22 sm:w-18 sm:h-24'
                } ${
                  isTapped
                    ? 'opacity-55 border-slate-700 rotate-12 scale-90'
                    : 'border-amber-400/50 hover:border-amber-400 hover:scale-105 shadow-md shadow-amber-500/10'
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
                  <CivilizationIcon civilization={primaryCiv} className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                </div>

                {/* Mana number indicator bottom-right */}
                <div className="absolute bottom-0.5 right-0.5 px-1 py-0.2 rounded bg-slate-950/85 text-[8px] font-mono font-bold text-amber-300 border border-amber-400/30 leading-none">
                  {card.manaNumber || 1}
                </div>

                {/* Tapped Badge */}
                {isTapped && (
                  <div className="absolute inset-0 bg-slate-950/60 flex items-center justify-center">
                    <span className="text-[8px] font-mono font-bold uppercase tracking-wider text-slate-300 px-1 py-0.5 rounded bg-slate-900/95 border border-slate-700 leading-none">
                      Tap
                    </span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
