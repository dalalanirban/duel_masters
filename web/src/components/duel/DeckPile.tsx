import React from 'react';
import { Layers } from 'lucide-react';
import type { CardInstance, PlayerId } from '../../engine/types';

export interface DeckPileProps {
  deck: CardInstance[];
  owner?: PlayerId;
  className?: string;
}

export const DeckPile: React.FC<DeckPileProps> = ({
  deck,
  owner = 'player',
  className = ''
}) => {
  const isOpponent = owner === 'opponent';

  return (
    <div
      title={`${isOpponent ? "Opponent's" : 'Your'} Deck (${deck.length} cards remaining)`}
      className={`relative w-14 sm:w-16 md:w-18 aspect-[491/682] h-18 sm:h-20 md:h-24 rounded-md border border-amber-500/40 hover:border-amber-400/80 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 overflow-hidden shadow-md flex flex-col items-center justify-between p-1 select-none transition-all duration-150 hover:scale-105 cursor-help ${className}`}
    >
      <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full border border-amber-400/40 bg-amber-500/10 flex items-center justify-center text-amber-400 font-cinzel font-black text-[8px] sm:text-[9px] mt-0.5 shadow-inner">
        DM
      </div>
      <div className="w-full bg-slate-950/95 px-1 py-0.5 rounded flex items-center justify-between text-amber-300 font-mono text-[8px] sm:text-[9px] border border-amber-500/30">
        <Layers className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-amber-400" />
        <span className="tabular-nums font-bold">{deck.length}</span>
      </div>
    </div>
  );
};
