import React, { useState } from 'react';
import { Skull, Crosshair } from 'lucide-react';
import type { ShieldInstance, CardInstance, ManaCardInstance, AttackTarget, PlayerId, Phase } from '../../engine/types';
import type { CardDefinition } from '../../types/card';
import { ShieldsView } from './ShieldsView.tsx';
import { ManaZoneView } from './ManaZoneView.tsx';
import { GraveyardModal } from './GraveyardModal.tsx';
import { DeckPile } from './DeckPile.tsx';

export interface ShieldsRowProps {
  owner: PlayerId;
  shields: ShieldInstance[];
  manaZone?: ManaCardInstance[];
  graveyard: CardInstance[];
  deck?: CardInstance[];
  phase?: Phase;
  isPlayerTurn?: boolean;
  manaChargedThisTurn?: boolean;
  showDeck?: boolean;
  canTargetShields?: boolean;
  canDirectAttack?: boolean;
  onDirectAttack?: () => void;
  canUndoMana?: boolean;
  onUndoMana?: () => void;
  onToggleManaTap?: (cardInstanceId: string, forceTapped?: boolean) => void;
  manaPaymentMode?: boolean;
  selectedPaymentManaIds?: string[];
  onTogglePaymentMana?: (cardInstanceId: string, forceSelected?: boolean) => void;
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
  phase = 'MANA_CHARGE',
  isPlayerTurn = true,
  manaChargedThisTurn = false,
  showDeck = true,
  canTargetShields = false,
  canDirectAttack = false,
  onDirectAttack,
  canUndoMana = false,
  onUndoMana,
  onToggleManaTap,
  manaPaymentMode = false,
  selectedPaymentManaIds = [],
  onTogglePaymentMana,
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
    <div className={`relative flex items-stretch justify-between gap-1 sm:gap-2 w-full select-none shrink-0 ${className}`}>
      {/* Strike alert overlay */}
      {canTargetShields && isOpponent && (
        <div className="absolute -top-2 right-14 z-20 px-2 py-0.5 rounded-full bg-red-950/90 border border-red-500/60 text-[9px] font-mono font-semibold text-red-300 animate-pulse pointer-events-none flex items-center gap-1 shadow-md shadow-red-950/50">
          <Crosshair className="w-2.5 h-2.5" />
          <span>STRIKE TARGET</span>
        </div>
      )}

      {/* 1. LEFT FLANK: GRAVEYARD PILE (Parallel flank occupying shield + mana block) */}
      <div className="shrink-0 flex items-stretch">
        <button
          type="button"
          data-vfx-id={`gy-${owner}`}
          onClick={() => setIsGraveyardOpen(true)}
          onMouseEnter={() => {
            if (topGraveyardCard) onHoverCard?.(topGraveyardCard);
          }}
          onMouseLeave={() => onHoverCard?.(null)}
          title={`Graveyard (${graveyard.length} cards) - Click to view`}
          className="relative w-11 sm:w-15 md:w-[68px] aspect-[491/682] h-full min-h-[3.5rem] sm:min-h-[6.5rem] rounded-md border border-slate-800 hover:border-purple-500/60 bg-slate-950/90 overflow-hidden cursor-pointer shadow-sm transition-all duration-150 hover:scale-105 shrink-0 flex flex-col items-center justify-between p-1 group"
        >
          {topGraveyardImg ? (
            <>
              <img
                src={topGraveyardImg}
                alt={topGraveyardCard?.name || 'Graveyard Top Card'}
                className="w-full flex-1 min-h-0 object-cover rounded-xs opacity-80 group-hover:opacity-100 transition-opacity"
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
              <Skull className="w-4 h-4 sm:w-5 sm:h-5 opacity-60" />
              <span className="text-[8px] sm:text-[9px] font-mono mt-0.5 font-semibold tabular-nums">0</span>
              <span className="hidden sm:inline text-[7.5px] font-cinzel text-slate-600 uppercase tracking-widest mt-0.5">GRAVE</span>
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
                phase={phase}
                isPlayerTurn={isPlayerTurn}
                manaChargedThisTurn={manaChargedThisTurn}
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
                phase={phase}
                isPlayerTurn={isPlayerTurn}
                manaChargedThisTurn={manaChargedThisTurn}
                canUndoMana={canUndoMana}
                onUndoMana={onUndoMana}
                onToggleManaTap={onToggleManaTap}
                manaPaymentMode={manaPaymentMode}
                selectedPaymentManaIds={selectedPaymentManaIds}
                onTogglePaymentMana={onTogglePaymentMana}
                onHoverCard={onHoverCard}
                onInspectCard={onInspectCard}
              />
            )}
          </>
        )}
      </div>

      {/* 3. RIGHT FLANK: DECK PILE (Ornate CardBack + Count) */}
      {showDeck && deck ? (
        <div className="shrink-0 flex items-stretch">
          <DeckPile
            deck={deck}
            owner={owner}
            className="!h-full min-h-[3.5rem] sm:min-h-[6.5rem]"
          />
        </div>
      ) : (
        <div
          aria-hidden="true"
          className="relative w-11 sm:w-15 md:w-[68px] aspect-[491/682] h-full shrink-0 opacity-0 pointer-events-none select-none"
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
