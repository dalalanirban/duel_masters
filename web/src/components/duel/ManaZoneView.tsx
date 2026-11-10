import React from 'react';
import { Sparkles } from 'lucide-react';
import type { ManaCardInstance, PlayerId } from '../../engine/types';
import type { CardDefinition, Civilization } from '../../types/card';
import { CivilizationIcon } from '../card/CivilizationIcon';

interface ManaZoneViewProps {
  manaZone: ManaCardInstance[];
  owner: PlayerId;
  onInspectCard?: (card: CardDefinition) => void;
}

export const ManaZoneView: React.FC<ManaZoneViewProps> = ({
  manaZone,
  owner,
  onInspectCard
}) => {
  const isOpponent = owner === 'opponent';
  const untappedCount = manaZone.filter((m) => !m.isTapped).length;
  const totalCount = manaZone.length;

  // Collect available civilizations
  const civilizations = Array.from(
    new Set(manaZone.flatMap((m) => m.card.civilizations))
  ) as Civilization[];

  return (
    <div className="flex flex-col gap-1 select-none">
      {/* Header */}
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

      {/* Cards list */}
      <div className="min-h-16 rounded-xl border border-slate-800/80 bg-slate-950/60 p-2 flex items-center gap-2 overflow-x-auto scrollbar-thin">
        {totalCount === 0 ? (
          <div className="w-full text-center py-2 text-xs text-slate-600 font-mono">
            No cards in mana zone
          </div>
        ) : (
          manaZone.map((manaCard) => {
            const card = manaCard.card;
            const isTapped = manaCard.isTapped;
            const primaryCiv = card.civilizations[0];
            const imageSrc = card.imageAssetPath ? `/${card.imageAssetPath}` : card.imageUrl;

            return (
              <div
                key={manaCard.instanceId}
                onClick={() => onInspectCard?.(card)}
                className={`relative shrink-0 w-16 h-22 sm:w-18 sm:h-24 rounded-lg overflow-hidden border transition-all duration-200 cursor-pointer group ${
                  isTapped
                    ? 'opacity-50 border-slate-700 rotate-12 scale-90'
                    : 'border-amber-400/50 hover:border-amber-400 hover:scale-105 shadow-md shadow-amber-500/10'
                }`}
                title={`${card.name} (${primaryCiv}) - ${isTapped ? 'Tapped' : 'Untapped'}`}
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
                <div className="absolute top-1 left-1 p-0.5 rounded bg-slate-950/80 backdrop-blur-xs">
                  <CivilizationIcon civilization={primaryCiv} className="w-3 h-3" />
                </div>

                {/* Tapped Badge */}
                {isTapped && (
                  <div className="absolute inset-0 bg-slate-950/60 flex items-center justify-center">
                    <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-slate-300 px-1 py-0.5 rounded bg-slate-900/90 border border-slate-700">
                      Tapped
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
