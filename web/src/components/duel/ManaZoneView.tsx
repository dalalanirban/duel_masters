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
  className = ''
}) => {
  const isOpponent = owner === 'opponent';
  const untappedMana = manaZone.filter((m) => !m.isTapped);
  const untappedCount = untappedMana.length;
  const totalCount = manaZone.length;

  const allCivilizations = Array.from(
    new Set(manaZone.flatMap((m) => m.card.civilizations))
  ) as Civilization[];

  const untappedCivs = new Set(
    untappedMana.flatMap((m) => m.card.civilizations)
  );

  // Empty State
  if (totalCount === 0) {
    return (
      <div
        title={`${isOpponent ? "Opponent's" : "Your"} Mana: 0/0`}
        className={`h-6 sm:h-7 px-3 rounded-md bg-slate-950/30 border border-slate-800/40 flex items-center justify-between select-none shrink-0 ${className}`}
      >
        <div className="flex items-center gap-1.5 text-[9px] font-cinzel font-bold text-slate-500 tracking-wider">
          <Sparkles className="w-2.5 h-2.5 text-amber-500/50" />
          <span>{isOpponent ? "OPPONENT MANA" : "MANA ZONE"}</span>
        </div>
        <span className="text-[9px] font-mono text-slate-600 font-bold tabular-nums">0/0</span>
      </div>
    );
  }

  // Populated Sleek Mana Strip
  return (
    <div
      title={`${isOpponent ? "Opponent's" : "Your"} Mana: ${untappedCount}/${totalCount} (${untappedCount} ready, ${totalCount - untappedCount} tapped)`}
      className={`relative h-8 sm:h-9 px-2 rounded-md bg-slate-950/40 border border-slate-800/60 flex items-center justify-between gap-2 select-none shrink-0 ${className}`}
    >
      {/* Left: Mana Cards Horizontal Strip */}
      <div className="flex items-center gap-1 overflow-x-auto scrollbar-thin py-0.5 max-w-[70%]">
        {manaZone.map((manaCard) => {
          const card = manaCard.card;
          const isTapped = manaCard.isTapped;
          const imageSrc = card.imageAssetPath
            ? `/${card.imageAssetPath}`
            : card.imageUrl;

          return (
            <div
              key={manaCard.instanceId}
              onMouseEnter={() => {
                onHoverCard?.(card);
                onInspectCard?.(card);
              }}
              onMouseLeave={() => onHoverCard?.(null)}
              onClick={() => onInspectCard?.(card)}
              className={`relative shrink-0 w-6 h-7 sm:w-7 sm:h-8 rounded-xs overflow-hidden border transition-transform duration-150 cursor-pointer ${
                isTapped
                  ? 'opacity-40 border-slate-700 rotate-12 scale-90'
                  : 'border-amber-400/60 hover:scale-110 shadow-xs'
              }`}
              title={`${card.name} (${card.civilizations.join('/')}) - ${
                isTapped ? 'Tapped' : 'Ready'
              }`}
            >
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
              <div className="absolute top-0.5 left-0.5 p-0.2 rounded bg-slate-950/80">
                <CivilizationIcon civilization={card.civilizations[0]} className="w-2 h-2" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Right: Mana Ratio & Civilization Dots */}
      <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-900/90 border border-slate-800/80 text-[9px] font-mono font-bold text-amber-400 shrink-0">
        <div className="flex items-center gap-1">
          <Sparkles className="w-2.5 h-2.5 text-amber-400 shrink-0" />
          <span className="tabular-nums">
            {untappedCount}/{totalCount}
          </span>
        </div>
        {allCivilizations.length > 0 && (
          <div className="flex items-center gap-1 border-l border-slate-800 pl-1.5">
            {allCivilizations.map((civ) => {
              const isReady = untappedCivs.has(civ);
              return (
                <div
                  key={civ}
                  title={`${civ} (${isReady ? 'Ready' : 'Tapped'})`}
                  className={`rounded-full transition-opacity ${
                    isReady ? 'opacity-100 drop-shadow-[0_0_3px_rgba(245,158,11,0.5)]' : 'opacity-30 grayscale'
                  }`}
                >
                  <CivilizationIcon civilization={civ} className="w-2.5 h-2.5" />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
