import React from 'react';
import { CardDefinition } from '../../types/card';
import { Plus, Minus } from 'lucide-react';

interface Props {
  card: CardDefinition;
  deckCount?: number;
  onAdd?: (card: CardDefinition) => void;
  onRemove?: (card: CardDefinition) => void;
  onClick?: (card: CardDefinition) => void;
  compact?: boolean;
}

export const DuelCard: React.FC<Props> = ({
  card,
  deckCount = 0,
  onAdd,
  onRemove,
  onClick,
  compact = false
}) => {
  const isMaxCopies = deckCount >= 4;
  const imageSrc = card.imageAssetPath ? `/${card.imageAssetPath}` : card.imageUrl;
  const isMultiCiv = Boolean(card.isMultiCiv || card.civilizations.length > 1);
  const isEvolution = Boolean(card.isEvolution || card.type === 'Evolution Creature');

  return (
    <div
      onClick={() => onClick?.(card)}
      className={`group relative flex flex-col items-center justify-between transition-all duration-200 cursor-pointer select-none ${
        compact ? 'w-36' : 'w-48 sm:w-52'
      }`}
    >
      {/* Authentic Physical Card Image */}
      <div
        className={`relative w-full aspect-[491/682] rounded-xl overflow-hidden shadow-lg shadow-black/70 group-hover:shadow-2xl group-hover:shadow-amber-500/25 group-hover:-translate-y-1.5 transition-all duration-200 bg-slate-900 ${
          isMultiCiv
            ? 'p-[2px] bg-gradient-to-br from-amber-500 via-yellow-400 to-sky-500 shadow-amber-500/10'
            : 'border border-slate-800/90 group-hover:border-amber-400/80'
        }`}
      >
        <div className="relative w-full h-full rounded-[10px] overflow-hidden bg-slate-900">
          <img
            src={imageSrc}
            alt={card.name}
            loading="lazy"
            className="w-full h-full object-contain"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              if (card.imageUrl && target.src !== card.imageUrl) {
                target.src = card.imageUrl;
              }
            }}
          />

          {/* Evolution Badge in Top-Left */}
          {isEvolution && (
            <div
              className="absolute top-2 left-2 z-10 bg-gradient-to-r from-amber-500 to-yellow-600 text-slate-950 font-black text-[10px] tracking-wider px-2 py-0.5 rounded shadow-md border border-amber-300 font-cinzel"
              title="Evolution Creature"
            >
              EVO
            </div>
          )}

          {/* In-Deck Count Overlay Badge in Top-Right */}
          {deckCount > 0 && (
            <div className="absolute top-2 right-2 z-10 bg-slate-950/90 border border-amber-400 text-amber-300 font-cinzel font-black text-xs px-2 py-0.5 rounded-md shadow-md backdrop-blur-sm">
              x{deckCount}
            </div>
          )}

          {/* Card Set Badge in Bottom-Right */}
          {card.set && (
            <div className="absolute bottom-2 right-2 z-10 bg-slate-950/85 backdrop-blur-sm border border-slate-700/80 text-slate-300 font-mono text-[10px] px-1.5 py-0.5 rounded shadow">
              {card.set}
            </div>
          )}
        </div>
      </div>

      {/* Deck Controls Underneath Card */}
      {!compact && (
        <div className="w-full mt-2" onClick={(e) => e.stopPropagation()}>
          {deckCount === 0 ? (
            /* 1. Not in deck yet: Show '+ Add to Deck' */
            <button
              type="button"
              onClick={() => onAdd?.(card)}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg font-bold text-xs bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-200 border border-slate-700 transition-all shadow-sm cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Add to Deck
            </button>
          ) : isMaxCopies ? (
            /* 2. Reached MAX permitted copies (4): Show '-' button only */
            <div className="flex items-center justify-between w-full bg-slate-900/90 border border-amber-500/40 rounded-lg p-0.5 shadow-sm">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove?.(card);
                }}
                className="p-1.5 rounded-md bg-slate-800 hover:bg-red-950/80 hover:text-red-300 text-slate-300 transition-colors cursor-pointer"
                title="Remove 1 copy"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="font-mono font-bold text-xs text-amber-400 px-3 flex-1 text-center select-none">
                MAX (4)
              </span>
            </div>
          ) : (
            /* 3. Already added (1 to 3 copies): Entire container is clickable to add, only '-' removes */
            <div
              role="button"
              tabIndex={0}
              onClick={() => onAdd?.(card)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onAdd?.(card);
                }
              }}
              className="group/btn flex items-center justify-between w-full bg-slate-900/90 hover:bg-emerald-950/40 border border-emerald-500/50 hover:border-emerald-400 rounded-lg p-0.5 shadow-sm cursor-pointer transition-all"
              title="Click anywhere to add another copy"
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove?.(card);
                }}
                className="p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                title="Remove 1 copy"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>

              <span className="font-mono font-bold text-xs text-emerald-400 group-hover/btn:text-emerald-300 px-2 flex-1 text-center select-none transition-colors">
                {deckCount} in deck
              </span>

              <div
                className="p-1.5 rounded-md bg-emerald-600 group-hover/btn:bg-emerald-500 text-white transition-colors shadow-sm flex items-center justify-center"
                title="Add another copy"
              >
                <Plus className="w-3.5 h-3.5" />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

