import React from 'react';
import { Layers } from 'lucide-react';
import type { CardInstance, PlayerId } from '../../engine/types';
import { CardBack } from './CardBack.tsx';

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
    <CardBack
      data-vfx-id={`deck-${owner}`}
      title={`${isOpponent ? "Opponent's" : 'Your'} Deck (${deck.length} cards remaining)`}
      className={`w-11 sm:w-15 md:w-[68px] h-14 sm:h-20 md:h-24 p-1 flex-col justify-between transition-all duration-150 hover:scale-105 cursor-help ${className}`}
    >
      <div className="mt-auto w-full bg-slate-950/90 px-1 py-0.5 rounded flex items-center justify-between text-amber-300 font-mono text-[8px] sm:text-[9px] border border-amber-500/35 z-10 backdrop-blur-xs">
        <Layers className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-amber-400 shrink-0" />
        <span className="tabular-nums font-bold">{deck.length}</span>
      </div>
    </CardBack>
  );
};
