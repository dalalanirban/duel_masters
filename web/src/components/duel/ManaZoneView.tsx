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
  const untappedMana = manaZone.filter((m) => !m.isTapped);
  const untappedCount = untappedMana.length;
  const totalCount = manaZone.length;

  // Collect all available civilizations and available untapped civilizations
  const allCivilizations = Array.from(
    new Set(manaZone.flatMap((m) => m.card.civilizations))
  ) as Civilization[];

  const untappedCivs = new Set(
    untappedMana.flatMap((m) => m.card.civilizations)
  );

  // 1. Empty State (0 Cards in Mana Zone)
  if (totalCount === 0) {
    return (
      <div
        title={`${isOpponent ? "Opponent's" : "Your"} Mana: 0/0`}
        className={`h-6 sm:h-7 px-2 rounded-md border border-dashed border-slate-800/60 bg-slate-950/30 relative flex items-center justify-center select-none shrink-0 ${className}`}
      >
        <div className="text-[10px] font-cinzel font-bold text-slate-600/60 tracking-wider flex items-center gap-1.5 pointer-events-none">
          <Sparkles className="w-2.5 h-2.5 text-amber-500/50" />
          <span>{isOpponent ? "OPPONENT MANA" : "MANA ZONE"} (0/0)</span>
        </div>
      </div>
    );
  }

  // 2. Populated State - Direct card strip with watermark & floating stats chip
  return (
    <div
      title={`${isOpponent ? "Opponent's" : "Your"} Mana: ${untappedCount}/${totalCount} (${untappedCount} ready, ${totalCount - untappedCount} tapped)`}
      className={`relative select-none shrink-0 ${className}`}
    >
      {/* Floating Overlay Pill: Untapped/Total Mana Count + Civ Icons */}
      <div className="absolute top-0.5 right-1 z-20 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-900/90 border border-slate-800 text-[9px] font-mono font-bold text-amber-400 pointer-events-none backdrop-blur-md shadow-md">
        <div className="flex items-center gap-1">
          <Sparkles className="w-2.5 h-2.5 text-amber-400 shrink-0" />
          <span>
            {untappedCount}/{totalCount}
          </span>
        </div>
        {allCivilizations.length > 0 && (
          <div className="flex items-center gap-1 border-l border-slate-800/80 pl-1">
            {allCivilizations.map((civ) => {
              const isReady = untappedCivs.has(civ);
              return (
                <div
                  key={civ}
                  title={`${civ} (${isReady ? 'Ready' : 'All tapped'})`}
                  className={`rounded-full p-0.5 transition-all ${
                    isReady
                      ? 'ring-1 ring-amber-400/80 shadow-xs shadow-amber-400/30'
                      : 'opacity-35 grayscale'
                  }`}
                >
                  <CivilizationIcon civilization={civ} className="w-2.5 h-2.5" />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Cards Strip */}
      <div
        className={`${
          compact ? 'h-11 sm:h-12 py-0.5 px-1' : 'min-h-14 p-1.5'
        } relative rounded-md border border-slate-800/80 bg-slate-950/60 flex items-center gap-1 overflow-x-auto scrollbar-thin`}
      >
        {/* Background Watermark */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none text-[9px] font-cinzel font-bold text-slate-700/30 uppercase tracking-[0.25em]">
          {isOpponent ? 'OPPONENT MANA' : 'MANA ZONE'}
        </div>

        {/* Cards */}
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
              className={`relative shrink-0 rounded-sm overflow-hidden border transition-all duration-200 cursor-pointer group z-10 ${
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
