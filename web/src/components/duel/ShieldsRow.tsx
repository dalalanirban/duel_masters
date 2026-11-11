import React, { useState } from 'react';
import { Skull, Layers, Crosshair } from 'lucide-react';
import type { ShieldInstance, CardInstance, AttackTarget, PlayerId } from '../../engine/types';
import type { CardDefinition } from '../../types/card';
import { ShieldsView } from './ShieldsView';
import { GraveyardModal } from './GraveyardModal';

export interface ShieldsRowProps {
  owner: PlayerId;
  shields: ShieldInstance[];
  graveyard: CardInstance[];
  deck: CardInstance[];
  canTargetShields?: boolean;
  selectedTarget?: AttackTarget | null;
  onSelectShield?: (index: number) => void;
  onHoverCard?: (card: CardDefinition | null) => void;
  onInspectCard?: (card: CardDefinition) => void;
  onSelectGraveyardCard?: (card: CardInstance) => void;
  className?: string;
}

export const ShieldsRow: React.FC<ShieldsRowProps> = ({
  owner,
  shields,
  graveyard,
  deck,
  canTargetShields = false,
  selectedTarget = null,
  onSelectShield,
  onHoverCard,
  onInspectCard,
  onSelectGraveyardCard,
  className = ''
}) => {
  const [isGraveyardOpen, setIsGraveyardOpen] = useState(false);
  const isOpponent = owner === 'opponent';

  const topGraveyardCard =
    graveyard.length > 0 ? graveyard[graveyard.length - 1].card : null;
  const topGraveyardImg = topGraveyardCard
    ? topGraveyardCard.imageAssetPath
      ? `/${topGraveyardCard.imageAssetPath}`
      : topGraveyardCard.imageUrl
    : null;

  return (
    <div className={`relative flex items-center justify-between gap-2 w-full select-none shrink-0 ${className}`}>
      {/* Strike alert overlay */}
      {canTargetShields && isOpponent && (
        <div className="absolute -top-2 right-12 z-20 px-2 py-0.5 rounded-full bg-red-950/90 border border-red-500/60 text-[9px] font-mono font-semibold text-red-300 animate-pulse pointer-events-none flex items-center gap-1 shadow-md shadow-red-950/50">
          <Crosshair className="w-2.5 h-2.5" />
          <span>STRIKE TARGET</span>
        </div>
      )}

      {/* 1. LEFT: GRAVEYARD PILE */}
      <div className="shrink-0">
        <button
          type="button"
          onClick={() => setIsGraveyardOpen(true)}
          onMouseEnter={() => {
            if (topGraveyardCard) onHoverCard?.(topGraveyardCard);
          }}
          onMouseLeave={() => onHoverCard?.(null)}
          title={`Graveyard (${graveyard.length} cards) - Click to view`}
          className="relative w-10 h-11 sm:w-11 sm:h-12 rounded-md border border-slate-800 hover:border-purple-500/60 bg-slate-950/80 overflow-hidden cursor-pointer shadow-sm transition-transform duration-150 hover:scale-105 shrink-0 flex flex-col items-center justify-center p-0.5"
        >
          {topGraveyardImg ? (
            <>
              <img
                src={topGraveyardImg}
                alt={topGraveyardCard?.name || 'Graveyard Top Card'}
                className="w-full h-full object-cover opacity-75 hover:opacity-100 transition-opacity"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  if (topGraveyardCard?.imageUrl && target.src !== topGraveyardCard.imageUrl) {
                    target.src = topGraveyardCard.imageUrl;
                  }
                }}
              />
              <div className="absolute inset-x-0 bottom-0 bg-slate-950/90 px-1 py-0.2 flex items-center justify-between text-purple-300 font-mono text-[8px]">
                <Skull className="w-2.5 h-2.5 text-purple-400" />
                <span className="tabular-nums">{graveyard.length}</span>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center text-slate-600 hover:text-purple-400">
              <Skull className="w-3.5 h-3.5 opacity-60" />
              <span className="text-[8px] font-mono mt-0.5">0 GY</span>
            </div>
          )}
        </button>
      </div>

      {/* 2. CENTER: 5 HERALDIC SHIELD CRESTS */}
      <div className="flex-1 min-w-0">
        <ShieldsView
          shields={shields}
          owner={owner}
          canTargetShields={canTargetShields}
          selectedTarget={selectedTarget}
          onSelectShield={onSelectShield}
          onHoverCard={onHoverCard}
          compact={true}
          showHeader={false}
        />
      </div>

      {/* 3. RIGHT: DECK PILE */}
      <div className="shrink-0">
        <div
          title={`Deck (${deck.length} cards)`}
          className="relative w-10 h-11 sm:w-11 sm:h-12 rounded-md border border-amber-500/30 hover:border-amber-400/60 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 overflow-hidden shadow-sm flex flex-col items-center justify-between p-1 select-none transition-transform duration-150 hover:scale-105 cursor-help"
        >
          <div className="w-3.5 h-3.5 rounded-full border border-amber-400/40 bg-amber-500/10 flex items-center justify-center text-amber-400 font-cinzel font-black text-[7px]">
            DM
          </div>
          <div className="flex items-center gap-0.5 text-amber-300 font-mono font-bold text-[8px] sm:text-[9px]">
            <Layers className="w-2 h-2 text-amber-400" />
            <span className="tabular-nums">{deck.length}</span>
          </div>
        </div>
      </div>

      {/* GRAVEYARD MODAL */}
      <GraveyardModal
        isOpen={isGraveyardOpen}
        onClose={() => setIsGraveyardOpen(false)}
        cards={graveyard}
        owner={owner}
        onHoverCard={onHoverCard}
        onInspectCard={onInspectCard}
        onSelectCard={onSelectGraveyardCard}
      />
    </div>
  );
};
