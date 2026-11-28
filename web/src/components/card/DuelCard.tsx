import React from 'react';
import { CardDefinition } from '../../types/card';
import { Plus, Minus } from 'lucide-react';

interface Props {
  card: CardDefinition;
  deckCount?: number;
  canonicalCount?: number;
  onAdd?: (card: CardDefinition) => void;
  onRemove?: (card: CardDefinition) => void;
  onClick?: (card: CardDefinition) => void;
  compact?: boolean;
}

export const DuelCard: React.FC<Props> = ({
  card,
  deckCount = 0,
  canonicalCount,
  onAdd,
  onRemove,
  onClick,
  compact = false
}) => {
  const effectiveCanonicalCount = canonicalCount ?? deckCount;
  const isMaxCopies = effectiveCanonicalCount >= 4;
  const hasMixedPrintings = effectiveCanonicalCount > deckCount;
  const imageSrc = card.imageAssetPath ? `/${card.imageAssetPath}` : card.imageUrl;
  const isMultiCiv = Boolean(card.isMultiCiv || card.civilizations.length > 1);
  const isEvolution = Boolean(card.isEvolution || card.type === 'Evolution Creature');

  return (
    <div
      onClick={() => onClick?.(card)}
      className={`group relative flex flex-col items-center justify-between transition-all duration-200 cursor-pointer select-none ${
        compact ? 'w-36' : 'w-full max-w-[192px] sm:w-52 sm:max-w-none'
      }`}
    >
      {/* Authentic Physical Card Image */}
      <div
        className={`relative w-full aspect-[491/682] rounded-xl overflow-hidden shadow-lg shadow-black/80 group-hover:shadow-2xl group-hover:shadow-amber-500/20 group-hover:-translate-y-1 transition-all duration-200 bg-slate-950 ${
          deckCount > 0
            ? 'ring-1 ring-amber-400/60 shadow-amber-500/10'
            : isMultiCiv
              ? 'p-[2px] bg-gradient-to-br from-amber-500 via-yellow-400 to-sky-500 shadow-amber-500/10'
              : 'border border-slate-800/80 group-hover:border-amber-400/70'
        }`}
      >
        <div className="relative w-full h-full rounded-[10px] overflow-hidden bg-slate-950">
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
              className="absolute top-2 left-2 z-10 bg-gradient-to-r from-amber-500 to-yellow-600 text-slate-950 font-black text-[10px] tracking-wider px-1.5 py-0.5 rounded shadow-md border border-amber-300 font-cinzel"
              title="Evolution Creature"
            >
              EVO
            </div>
          )}

          {/* In-Deck Count Overlay Badge in Top-Right */}
          {(deckCount > 0 || hasMixedPrintings) && (
            <div
              className={`absolute top-2 right-2 z-10 font-cinzel font-black text-xs px-2 py-0.5 rounded shadow-lg backdrop-blur-md ${
                effectiveCanonicalCount > 4
                  ? 'bg-red-950/90 text-red-300 border border-red-400 shadow-red-500/20'
                  : isMaxCopies
                  ? 'bg-amber-950/90 text-amber-300 border border-amber-400 shadow-amber-500/20'
                  : 'bg-slate-950/90 text-emerald-300 border border-emerald-400/80 shadow-emerald-500/20'
              }`}
              title={
                hasMixedPrintings
                  ? `${deckCount} of this printing (${effectiveCanonicalCount}/4 total across printings)`
                  : `${deckCount} in deck`
              }
            >
              {hasMixedPrintings ? `x${deckCount} · ${effectiveCanonicalCount}/4` : `x${deckCount}`}
            </div>
          )}

          {/* Card Set Badge in Bottom-Right */}
          {card.set && (
            <div className="absolute bottom-2 right-2 z-10 bg-slate-950/90 backdrop-blur-xs border border-slate-800 text-slate-400 font-mono text-[9px] px-1.5 py-0.5 rounded shadow-xs">
              {card.set}
            </div>
          )}
        </div>
      </div>

      {/* Sleek Deck Controls Underneath Card */}
      {!compact && (
        <div className="w-full mt-2" onClick={(e) => e.stopPropagation()}>
          {deckCount === 0 && isMaxCopies ? (
            /* Cap reached via other set printing(s) */
            <button
              type="button"
              disabled
              aria-label={`Max 4 copies of ${card.name} already in deck`}
              className={`w-full flex items-center justify-center py-1 px-3 rounded-lg font-mono font-bold text-xs border shadow-xs select-none cursor-not-allowed opacity-85 ${
                effectiveCanonicalCount > 4
                  ? 'bg-red-950/80 border-red-500/50 text-red-300'
                  : 'bg-slate-900/90 border-amber-500/40 text-amber-300'
              }`}
              title={`0 of this printing, ${effectiveCanonicalCount}/4 copies of ${card.name} in deck`}
            >
              MAX ({effectiveCanonicalCount}/4 Name)
            </button>
          ) : deckCount === 0 ? (
            /* 1. Not in deck yet (or partial copies in other printings): '+ Add to Deck' */
            <button
              type="button"
              onClick={() => onAdd?.(card)}
              className="w-full flex items-center justify-center gap-1.5 py-1 px-3 rounded-lg font-semibold text-xs bg-slate-900/70 hover:bg-amber-500 hover:text-slate-950 text-slate-300 border border-slate-800 hover:border-amber-400/80 transition-all shadow-xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              {hasMixedPrintings ? `Add (${effectiveCanonicalCount}/4)` : 'Add to Deck'}
            </button>
          ) : isMaxCopies ? (
            /* 2. Reached MAX permitted copies (4 across printings): Sleek amber/red controller */
            <div
              className={`flex items-center justify-between w-full bg-slate-900/90 border rounded-lg p-0.5 shadow-xs ${
                effectiveCanonicalCount > 4 ? 'border-red-500/60' : 'border-amber-500/40'
              }`}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove?.(card);
                }}
                className="p-1 rounded bg-slate-800 hover:bg-red-950/80 hover:text-red-300 text-slate-300 transition-colors cursor-pointer"
                title="Remove 1 copy"
              >
                <Minus className="w-3 h-3" />
              </button>
              <span
                className={`font-mono font-bold text-xs px-2 flex-1 text-center select-none ${
                  effectiveCanonicalCount > 4 ? 'text-red-300' : 'text-amber-300'
                }`}
                title={
                  hasMixedPrintings
                    ? `${deckCount} of this printing (${effectiveCanonicalCount}/4 total across printings)`
                    : 'Max 4 copies reached'
                }
              >
                {hasMixedPrintings
                  ? `${deckCount} (${effectiveCanonicalCount}/4)`
                  : `MAX (${effectiveCanonicalCount})`}
              </span>
            </div>
          ) : (
            /* 3. Already added (1 to 3 canonical copies): Sleek segmented glass controller */
            <div className="flex items-center justify-between w-full bg-slate-900/90 border border-emerald-500/40 rounded-lg p-0.5 shadow-xs">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove?.(card);
                }}
                className="p-1 rounded bg-slate-800 hover:bg-red-950/80 hover:text-red-300 text-slate-300 transition-colors cursor-pointer"
                title="Remove 1 copy"
              >
                <Minus className="w-3 h-3" />
              </button>

              <span
                onClick={() => onAdd?.(card)}
                className="font-mono font-bold text-xs text-emerald-400 hover:text-emerald-300 px-2 flex-1 text-center select-none cursor-pointer transition-colors"
                title="Click to add copy"
              >
                {hasMixedPrintings ? `${deckCount} (${effectiveCanonicalCount}/4)` : `${deckCount} in deck`}
              </span>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAdd?.(card);
                }}
                className="p-1 rounded bg-emerald-600/90 hover:bg-emerald-500 text-white transition-colors cursor-pointer"
                title="Add another copy"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

