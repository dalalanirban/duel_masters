import React from 'react';
import { CardDefinition } from '../../types/card';
import { DuelCard } from '../card/DuelCard';
import { SearchX } from 'lucide-react';

interface Props {
  cards: CardDefinition[];
  getDeckCount: (cardId: string) => number;
  onAdd: (card: CardDefinition) => void;
  onInspect: (card: CardDefinition) => void;
  onResetFilters: () => void;
}

export const CardGrid: React.FC<Props> = ({
  cards,
  getDeckCount,
  onAdd,
  onInspect,
  onResetFilters
}) => {
  if (cards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 bg-slate-900/50 border border-slate-800 rounded-2xl text-center">
        <SearchX className="w-12 h-12 text-slate-600 mb-3" />
        <h3 className="text-lg font-cinzel font-bold text-slate-300">No cards matched your filters</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-sm">
          Try clearing some filter criteria, searching for different keywords, or resetting the search.
        </p>
        <button
          onClick={onResetFilters}
          className="mt-4 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-colors shadow-lg shadow-amber-500/20"
        >
          Reset All Filters
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-4 gap-4 sm:gap-5 justify-items-center">
      {cards.map(card => (
        <DuelCard
          key={card.id}
          card={card}
          deckCount={getDeckCount(card.id)}
          onAdd={onAdd}
          onClick={onInspect}
        />
      ))}
    </div>
  );
};
