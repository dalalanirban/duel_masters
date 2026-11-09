import React from 'react';
import { CardDefinition } from '../../types/card';
import { Plus, Check } from 'lucide-react';

interface Props {
  card: CardDefinition;
  deckCount?: number;
  onAdd?: (card: CardDefinition) => void;
  onClick?: (card: CardDefinition) => void;
  compact?: boolean;
}

export const DuelCard: React.FC<Props> = ({
  card,
  deckCount = 0,
  onAdd,
  onClick,
  compact = false
}) => {
  const isMaxCopies = deckCount >= 4;
  const imageSrc = card.imageAssetPath ? `/${card.imageAssetPath}` : card.imageUrl;

  return (
    <div
      onClick={() => onClick?.(card)}
      className={`group relative flex flex-col items-center justify-between transition-all duration-200 cursor-pointer select-none ${
        compact ? 'w-36' : 'w-48 sm:w-52'
      }`}
    >
      {/* Authentic Physical Card Image */}
      <div className="relative w-full aspect-[491/682] rounded-xl overflow-hidden shadow-lg shadow-black/70 group-hover:shadow-2xl group-hover:shadow-amber-500/25 group-hover:-translate-y-1.5 transition-all duration-200 border border-slate-800/90 group-hover:border-amber-400/80 bg-slate-900">
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

        {/* In-Deck Count Overlay Badge in Top-Right */}
        {deckCount > 0 && (
          <div className="absolute top-2 right-2 bg-slate-950/90 border border-amber-400 text-amber-300 font-cinzel font-black text-xs px-2 py-0.5 rounded-md shadow-md backdrop-blur-sm">
            x{deckCount}
          </div>
        )}
      </div>

      {/* Quick Add Button Underneath Card */}
      {onAdd && !compact && (
        <div className="w-full mt-2" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => {
              if (!isMaxCopies) onAdd(card);
            }}
            disabled={isMaxCopies}
            className={`w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg font-bold text-xs transition-all shadow-sm ${
              isMaxCopies
                ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30 cursor-not-allowed'
                : deckCount > 0
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20'
                : 'bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-200 border border-slate-700'
            }`}
            title={isMaxCopies ? 'Maximum 4 copies reached' : 'Add to Deck'}
          >
            {isMaxCopies ? (
              <>MAX (4)</>
            ) : deckCount > 0 ? (
              <>
                <Check className="w-3.5 h-3.5" /> Added ({deckCount})
              </>
            ) : (
              <>
                <Plus className="w-3.5 h-3.5" /> Add to Deck
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};
