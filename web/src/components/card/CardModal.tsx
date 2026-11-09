import React from 'react';
import { CardDefinition } from '../../types/card';
import { DuelCard } from './DuelCard';
import { X, Plus, Minus, Info, Sparkles } from 'lucide-react';

interface Props {
  card: CardDefinition | null;
  deckCount: number;
  onClose: () => void;
  onAdd: (card: CardDefinition) => void;
  onRemove: (card: CardDefinition) => void;
}

export const CardModal: React.FC<Props> = ({
  card,
  deckCount,
  onClose,
  onAdd,
  onRemove
}) => {
  const [viewScan, setViewScan] = React.useState(true);
  if (!card) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative flex flex-col md:flex-row gap-6 max-w-2xl w-full bg-slate-900 border border-slate-700/80 rounded-2xl p-6 shadow-2xl shadow-black/80"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Card Frame / Physical Scan Preview */}
        <div className="flex flex-col items-center gap-2">
          {viewScan ? (
            <img
              src={card.imageAssetPath ? `/${card.imageAssetPath}` : card.imageUrl}
              alt={card.name}
              className="w-60 h-[340px] object-contain rounded-xl shadow-2xl border-2 border-slate-700 bg-slate-950"
            />
          ) : (
            <DuelCard card={card} deckCount={deckCount} compact={false} />
          )}

          <button
            onClick={() => setViewScan(!viewScan)}
            className="text-[11px] text-amber-400 hover:text-amber-300 font-semibold px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 hover:bg-slate-700 transition-colors"
          >
            {viewScan ? "Switch to Game Frame" : "Switch to Card Scan"}
          </button>
        </div>

        {/* Extended Details & Lore Panel */}
        <div className="flex-1 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-amber-400 border border-slate-700">
                {card.id}
              </span>
              <span className="text-xs text-slate-400 font-medium">
                {card.set} · #{card.collectorNumber}
              </span>
            </div>

            <h2 className="text-2xl font-cinzel font-bold text-white tracking-wide">
              {card.name}
            </h2>

            <div className="flex flex-wrap gap-2 mt-2 text-xs">
              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                Type: <strong className="text-white">{card.type}</strong>
              </span>
              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                Civilization: <strong className="text-amber-300">{card.civilizations.join(', ')}</strong>
              </span>
              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                Cost: <strong className="text-white">{card.manaCost}</strong>
              </span>
              {card.power !== null && (
                <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  Power: <strong className="text-amber-400">{card.power}</strong>
                </span>
              )}
            </div>
          </div>

          {/* Rules & Effects */}
          <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800 text-sm leading-relaxed text-slate-200">
            <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
              <Info className="w-3.5 h-3.5 text-amber-400" /> Card Abilities & Rules
            </h4>
            <p className="whitespace-pre-line">{card.rulesText || 'None.'}</p>
          </div>

          {/* Flavor Text / Lore */}
          {card.flavorText && (
            <div className="p-3 rounded-lg bg-slate-950/40 border border-white/5 text-xs italic text-slate-400 leading-relaxed">
              <span className="flex items-center gap-1 not-italic font-bold text-[10px] uppercase text-slate-500 mb-0.5">
                <Sparkles className="w-3 h-3 text-amber-400/80" /> Lore Quote
              </span>
              "{card.flavorText}"
            </div>
          )}

          {/* Illustrator */}
          {card.illustrator && (
            <p className="text-[11px] text-slate-500">
              Illustrator: <span className="text-slate-400">{card.illustrator}</span>
            </p>
          )}

          {/* Deck Builder Controls in Modal */}
          <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Copies in Deck:</span>
              <span className="text-sm font-bold text-amber-400">{deckCount} / 4</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => onRemove(card)}
                disabled={deckCount <= 0}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold text-slate-200 transition-colors"
              >
                <Minus className="w-3.5 h-3.5" /> Remove
              </button>

              <button
                onClick={() => onAdd(card)}
                disabled={deckCount >= 4}
                className="flex items-center gap-1 px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold text-slate-950 transition-colors shadow-md shadow-amber-500/20"
              >
                <Plus className="w-3.5 h-3.5" /> Add to Deck
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
