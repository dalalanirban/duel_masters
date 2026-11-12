import React, { useState } from 'react';
import { Skull, Layers, Crosshair } from 'lucide-react';
import type { ShieldInstance, CardInstance, ManaCardInstance, AttackTarget, PlayerId } from '../../engine/types';
import type { CardDefinition } from '../../types/card';
import { ShieldsView } from './ShieldsView';
import { ManaZoneView } from './ManaZoneView';
import { GraveyardModal } from './GraveyardModal';

export interface ShieldsRowProps {
  owner: PlayerId;
  shields: ShieldInstance[];
  manaZone?: ManaCardInstance[];
  graveyard: CardInstance[];
  deck?: CardInstance[];
  showDeck?: boolean;
  canTargetShields?: boolean;
  canDirectAttack?: boolean;
  onDirectAttack?: () => void;
  canUndoMana?: boolean;
  onUndoMana?: () => void;
  onToggleManaTap?: (cardInstanceId: string, forceTapped?: boolean) => void;
  selectedTarget?: AttackTarget | null;
  selectedShieldIndices?: number[];
  requiredSelectionCount?: number;
  onSelectShield?: (index: number) => void;
  onHoverCard?: (card: CardDefinition | null) => void;
  onInspectCard?: (card: CardDefinition) => void;
  onSelectGraveyardCard?: (card: CardInstance) => void;
  className?: string;
}

export const ShieldsRow: React.FC<ShieldsRowProps> = ({
  owner,
  shields,
  manaZone,
  graveyard,
  deck,
  showDeck = true,
  canTargetShields = false,
  canDirectAttack = false,
  onDirectAttack,
  canUndoMana = false,
  onUndoMana,
  onToggleManaTap,
  selectedTarget = null,
  selectedShieldIndices = [],
  requiredSelectionCount = 1,
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
    <div className={`relative flex items-stretch justify-between gap-1.5 sm:gap-2 w-full select-none shrink-0 ${className}`}>
      {/* Strike alert overlay */}
      {canTargetShields && isOpponent && (
        <div className="absolute -top-2 right-14 z-20 px-2 py-0.5 rounded-full bg-red-950/90 border border-red-500/60 text-[9px] font-mono font-semibold text-red-300 animate-pulse pointer-events-none flex items-center gap-1 shadow-md shadow-red-950/50">
          <Crosshair className="w-2.5 h-2.5" />
          <span>STRIKE TARGET</span>
        </div>
      )}

      {/* 1. LEFT FLANK: GRAVEYARD PILE (Spanning vertically both Shields and Mana Zone) */}
      <div className="shrink-0 flex items-stretch">
        <button
          type="button"
          onClick={() => setIsGraveyardOpen(true)}
          onMouseEnter={() => {
            if (topGraveyardCard) onHoverCard?.(topGraveyardCard);
          }}
          onMouseLeave={() => onHoverCard?.(null)}
          title={`Graveyard (${graveyard.length} cards) - Click to view`}
          className="relative w-14 sm:w-16 md:w-18 aspect-[491/682] h-full min-h-[6.5rem] sm:min-h-[7.5rem] rounded-md border border-slate-800 hover:border-purple-500/60 bg-slate-950/90 overflow-hidden cursor-pointer shadow-sm transition-all duration-150 hover:scale-105 shrink-0 flex flex-col items-center justify-between p-1 group"
        >
          {topGraveyardImg ? (
            <>
              <img
                src={topGraveyardImg}
                alt={topGraveyardCard?.name || 'Graveyard Top Card'}
                className="w-full flex-1 min-h-0 object-cover rounded-xs opacity-75 group-hover:opacity-100 transition-opacity"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  if (topGraveyardCard?.imageUrl && target.src !== topGraveyardCard.imageUrl) {
                    target.src = topGraveyardCard.imageUrl;
                  }
                }}
              />
              <div className="w-full mt-0.5 bg-slate-950/95 px-1 py-0.5 rounded flex items-center justify-between text-purple-300 font-mono text-[8px] sm:text-[9px] border border-purple-500/30">
                <Skull className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-purple-400" />
                <span className="tabular-nums font-bold">{graveyard.length}</span>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-600 group-hover:text-purple-400">
              <Skull className="w-5 h-5 sm:w-6 sm:h-6 opacity-60" />
              <span className="text-[9px] font-mono mt-1 font-semibold">0 GY</span>
              <span className="text-[7.5px] font-cinzel text-slate-600 uppercase tracking-widest mt-0.5">GRAVE</span>
            </div>
          )}
        </button>
      </div>

      {/* 2. CENTER: SHIELDS + MANA ROWS */}
      <div className="flex-1 min-w-0 flex flex-col gap-1 justify-center">
        {isOpponent ? (
          <>
            {manaZone && (
              <ManaZoneView
                manaZone={manaZone}
                owner="opponent"
                onHoverCard={onHoverCard}
                onInspectCard={onInspectCard}
              />
            )}
            <ShieldsView
              shields={shields}
              owner={owner}
              canTargetShields={canTargetShields}
              canDirectAttack={canDirectAttack}
              onDirectAttack={onDirectAttack}
              selectedTarget={selectedTarget}
              selectedShieldIndices={selectedShieldIndices}
              requiredSelectionCount={requiredSelectionCount}
              onSelectShield={onSelectShield}
              compact={true}
            />
          </>
        ) : (
          <>
            <ShieldsView
              shields={shields}
              owner={owner}
              canTargetShields={canTargetShields}
              canDirectAttack={canDirectAttack}
              onDirectAttack={onDirectAttack}
              selectedTarget={selectedTarget}
              selectedShieldIndices={selectedShieldIndices}
              requiredSelectionCount={requiredSelectionCount}
              onSelectShield={onSelectShield}
              compact={true}
            />
            {manaZone && (
              <ManaZoneView
                manaZone={manaZone}
                owner="player"
                canUndoMana={canUndoMana}
                onUndoMana={onUndoMana}
                onToggleManaTap={onToggleManaTap}
                onHoverCard={onHoverCard}
                onInspectCard={onInspectCard}
              />
            )}
          </>
        )}
      </div>

      {/* 3. RIGHT FLANK: DECK PILE (Parallel to Graveyard, same size, occupying shield & mana block) */}
      {showDeck && deck ? (
        <div className="shrink-0 flex items-stretch">
          <div
            title={`${isOpponent ? "Opponent's" : 'Your'} Deck (${deck.length} cards)`}
            className="relative w-14 sm:w-16 md:w-18 aspect-[491/682] h-full min-h-[6.5rem] sm:min-h-[7.5rem] rounded-md border border-amber-500/30 hover:border-amber-400/60 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 overflow-hidden shadow-sm flex flex-col items-center justify-between p-1 select-none transition-all duration-150 hover:scale-105 cursor-help"
          >
            <div className="flex-1 flex flex-col items-center justify-center text-amber-500/60">
              <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full border border-amber-400/40 bg-amber-500/10 flex items-center justify-center text-amber-400 font-cinzel font-black text-[9px] sm:text-[10px] shadow-inner">
                DM
              </div>
              <span className="text-[7.5px] font-cinzel text-amber-500/70 uppercase tracking-widest mt-1">DECK</span>
            </div>
            <div className="w-full bg-slate-950/95 px-1 py-0.5 rounded flex items-center justify-between text-amber-300 font-mono text-[8px] sm:text-[9px] border border-amber-500/30">
              <Layers className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-amber-400" />
              <span className="tabular-nums font-bold">{deck.length}</span>
            </div>
          </div>
        </div>
      ) : (
        <div
          aria-hidden="true"
          className="relative w-14 sm:w-16 md:w-18 aspect-[491/682] h-full shrink-0 opacity-0 pointer-events-none select-none"
        />
      )}

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
