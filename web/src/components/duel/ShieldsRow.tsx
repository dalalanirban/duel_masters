import React, { useState } from 'react';
import { Skull, Layers, Shield, Crosshair } from 'lucide-react';
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
  const unbrokenShieldsCount = shields.filter((s) => !s.isBroken).length;

  const topGraveyardCard =
    graveyard.length > 0 ? graveyard[graveyard.length - 1].card : null;
  const topGraveyardImg = topGraveyardCard
    ? topGraveyardCard.imageAssetPath
      ? `/${topGraveyardCard.imageAssetPath}`
      : topGraveyardCard.imageUrl
    : null;

  return (
    <div className={`flex flex-col gap-0.5 select-none w-full shrink-0 ${className}`}>
      {/* Cohesive Header: Graveyard Count | Shields Count | Deck Count */}
      <div className="flex items-center justify-between px-1 text-[10px] font-mono leading-none">
        {/* Graveyard Label */}
        <button
          type="button"
          onClick={() => setIsGraveyardOpen(true)}
          className="flex items-center gap-1 text-purple-400 hover:text-purple-300 font-semibold transition-colors cursor-pointer"
          title="Click to view Graveyard"
        >
          <Skull className="w-3 h-3" />
          <span>GY ({graveyard.length})</span>
        </button>

        {/* Shields Label & Strike Alert */}
        <div className="flex items-center gap-1 font-cinzel font-bold text-slate-300">
          <Shield
            className={`w-3 h-3 ${
              isOpponent ? 'text-red-400' : 'text-amber-400'
            }`}
          />
          <span>
            {isOpponent ? "Opponent's" : "Your"} Shields ({unbrokenShieldsCount}/5)
          </span>

          {canTargetShields && isOpponent && (
            <span className="text-[9px] font-mono font-semibold text-red-400 animate-pulse flex items-center gap-1 ml-1">
              <Crosshair className="w-2.5 h-2.5" /> Strike
            </span>
          )}
        </div>

        {/* Deck Count Label */}
        <div
          className="flex items-center gap-1 text-amber-400 font-semibold"
          title={`Remaining deck cards: ${deck.length}`}
        >
          <Layers className="w-3 h-3" />
          <span>Deck ({deck.length})</span>
        </div>
      </div>

      {/* Main Single Cohesive Row: [Graveyard Pile] | [5 Shield Slots] | [Deck Pile] */}
      <div className="flex items-center justify-between gap-1 sm:gap-2 w-full">
        {/* ================= 1. LEFT: GRAVEYARD PILE ================= */}
        <div className="shrink-0">
          {graveyard.length === 0 ? (
            <button
              type="button"
              onClick={() => setIsGraveyardOpen(true)}
              title="Graveyard is empty. Click to view."
              className="w-10 h-10 sm:w-11 sm:h-11 rounded-lg border border-dashed border-slate-800 bg-slate-950/60 hover:border-purple-500/50 hover:bg-slate-900/60 transition-all flex flex-col items-center justify-center text-slate-600 hover:text-purple-400 group cursor-pointer"
            >
              <Skull className="w-3.5 h-3.5 group-hover:scale-110 transition-transform opacity-70 group-hover:opacity-100" />
              <span className="text-[8px] font-mono uppercase tracking-wider text-slate-500 group-hover:text-purple-300 leading-none">
                0 GY
              </span>
            </button>
          ) : (
            <div
              onClick={() => setIsGraveyardOpen(true)}
              onMouseEnter={() => {
                if (topGraveyardCard) onHoverCard?.(topGraveyardCard);
              }}
              onMouseLeave={() => onHoverCard?.(null)}
              title={`Click to view Graveyard (${graveyard.length} cards)\nTop: ${
                topGraveyardCard?.name || 'Card'
              }`}
              className="relative w-10 h-10 sm:w-11 sm:h-11 rounded-lg border border-purple-500/50 hover:border-purple-400 bg-slate-950 overflow-hidden cursor-pointer shadow-sm shadow-purple-950/30 group transition-all duration-150 hover:scale-105 shrink-0"
            >
              {topGraveyardImg && (
                <img
                  src={topGraveyardImg}
                  alt={topGraveyardCard?.name || 'Graveyard Top Card'}
                  className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-110 opacity-80 group-hover:opacity-100"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    if (topGraveyardCard?.imageUrl && target.src !== topGraveyardCard.imageUrl) {
                      target.src = topGraveyardCard.imageUrl;
                    }
                  }}
                />
              )}

              {/* Bottom gradient label */}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950 via-slate-950/85 to-transparent px-1 py-0.2 flex items-center justify-between text-purple-300 font-mono font-bold leading-none">
                <Skull className="w-2.5 h-2.5 text-purple-400" />
                <span className="text-[8px] sm:text-[9px]">{graveyard.length}</span>
              </div>
            </div>
          )}
        </div>

        {/* ================= 2. CENTER: 5 SHIELD SLOTS ================= */}
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

        {/* ================= 3. RIGHT: DECK PILE ================= */}
        <div className="shrink-0">
          <div
            title={`Remaining deck cards: ${deck.length}`}
            className="relative w-10 h-10 sm:w-11 sm:h-11 rounded-lg border border-amber-500/40 hover:border-amber-400/80 bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-950 overflow-hidden shadow-sm shadow-black/40 flex flex-col items-center justify-between p-0.5 select-none transition-all duration-150 hover:scale-105 cursor-help group"
          >
            {/* Inner Border styling */}
            <div className="w-full h-full rounded-md border border-amber-400/20 flex flex-col items-center justify-between p-0.5 bg-radial from-amber-500/5 to-transparent">
              {/* Top DM crest */}
              <div className="w-3.5 h-3.5 rounded-full border border-amber-400/40 bg-amber-500/10 flex items-center justify-center text-amber-300 font-cinzel font-black text-[7px] shadow-xs">
                DM
              </div>

              {/* Deck Count */}
              <div className="flex items-center gap-0.5 text-amber-300 font-mono font-bold text-[8px] sm:text-[9px] leading-none">
                <Layers className="w-2 h-2 text-amber-400" />
                <span>{deck.length}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ================= GRAVEYARD MODAL ================= */}
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
