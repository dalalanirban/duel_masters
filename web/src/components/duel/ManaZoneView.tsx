import React, { useRef, useEffect } from 'react';
import { Sparkles, Undo2 } from 'lucide-react';
import type { ManaCardInstance, PlayerId } from '../../engine/types';
import type { CardDefinition, Civilization } from '../../types/card';
import { CivilizationIcon } from '../card/CivilizationIcon';

export interface ManaZoneViewProps {
  manaZone: ManaCardInstance[];
  owner: PlayerId;
  onInspectCard?: (card: CardDefinition) => void;
  onHoverCard?: (card: CardDefinition | null) => void;
  onToggleManaTap?: (cardInstanceId: string, forceTapped?: boolean) => void;
  canUndoMana?: boolean;
  onUndoMana?: () => void;
  compact?: boolean;
  className?: string;
}

export const ManaZoneView: React.FC<ManaZoneViewProps> = ({
  manaZone,
  owner,
  onInspectCard,
  onHoverCard,
  onToggleManaTap,
  canUndoMana = false,
  onUndoMana,
  className = ''
}) => {
  const isOpponent = owner === 'opponent';
  const untappedMana = manaZone.filter((m) => !m.isTapped);
  const untappedCount = untappedMana.length;
  const totalCount = manaZone.length;

  const isDraggingRef = useRef(false);
  const targetTapRef = useRef<boolean>(true);

  // Global mouseup/pointerup listener for drag-to-tap gesture
  useEffect(() => {
    const handleGlobalPointerUp = () => {
      isDraggingRef.current = false;
    };
    window.addEventListener('pointerup', handleGlobalPointerUp);
    window.addEventListener('mouseup', handleGlobalPointerUp);
    return () => {
      window.removeEventListener('pointerup', handleGlobalPointerUp);
      window.removeEventListener('mouseup', handleGlobalPointerUp);
    };
  }, []);

  const allCivilizations = Array.from(
    new Set(manaZone.flatMap((m) => m.card.civilizations))
  ) as Civilization[];

  const untappedCivs = new Set(
    untappedMana.flatMap((m) => m.card.civilizations)
  );

  // Card dimensions matching standard card aspect ratio
  const cardDimensions = 'w-9 h-12.5 sm:w-10 sm:h-14 md:w-11 md:h-15.5 aspect-[491/682]';

  // Empty State
  if (totalCount === 0) {
    return (
      <div
        title={`${isOpponent ? "Opponent's" : "Your"} Mana: 0/0`}
        className={`h-11 sm:h-13 px-3 rounded-md bg-slate-950/30 border border-slate-800/40 flex items-center justify-between select-none shrink-0 ${className}`}
      >
        <div className="flex items-center gap-1.5 text-[9px] font-cinzel font-bold text-slate-500 tracking-wider">
          <Sparkles className="w-2.5 h-2.5 text-amber-500/50" />
          <span>{isOpponent ? "OPPONENT MANA" : "MANA ZONE"}</span>
        </div>
        <span className="text-[9px] font-mono text-slate-600 font-bold tabular-nums">0/0</span>
      </div>
    );
  }

  // Populated Sleek Mana Strip
  return (
    <div
      title={`${isOpponent ? "Opponent's" : "Your"} Mana: ${untappedCount}/${totalCount} (${untappedCount} ready, ${totalCount - untappedCount} tapped)`}
      className={`relative h-14 sm:h-16 md:h-17 px-2 rounded-md bg-slate-950/40 border border-slate-800/60 flex items-center justify-between gap-2 select-none shrink-0 ${className}`}
    >
      {/* Left: Mana Cards Horizontal Strip (Clean hidden scrollbars, no artificial width clamps) */}
      <div className="flex items-center gap-1.5 overflow-x-auto py-1 min-w-0 flex-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {manaZone.map((manaCard) => {
          const card = manaCard.card;
          const isTapped = manaCard.isTapped;
          const isPlayer = owner === 'player';
          const imageSrc = card.imageAssetPath
            ? `/${card.imageAssetPath}`
            : card.imageUrl;

          const rotationStyle = isPlayer
            ? (isTapped ? 'rotate-90 scale-90 opacity-55 border-slate-700' : 'rotate-180 hover:scale-108 border-amber-400/80 shadow-md ring-1 ring-amber-400/20')
            : (isTapped ? 'rotate-90 scale-90 opacity-50 border-slate-700' : 'border-slate-700 hover:scale-108 shadow-xs');

          return (
            <div
              key={manaCard.instanceId}
              onMouseEnter={() => onHoverCard?.(card)}
              onMouseLeave={() => onHoverCard?.(null)}
              onContextMenu={(e) => {
                e.preventDefault();
                onInspectCard?.(card);
              }}
              onPointerDown={() => {
                if (isOpponent || !onToggleManaTap) {
                  onInspectCard?.(card);
                  return;
                }
                isDraggingRef.current = true;
                const nextState = !manaCard.isTapped;
                targetTapRef.current = nextState;
                onToggleManaTap(manaCard.instanceId, nextState);
              }}
              onPointerEnter={() => {
                onHoverCard?.(card);
                if (isOpponent || !onToggleManaTap || !isDraggingRef.current) return;
                onToggleManaTap(manaCard.instanceId, targetTapRef.current);
              }}
              className={`relative shrink-0 ${cardDimensions} rounded-xs sm:rounded-sm overflow-hidden border transition-transform duration-150 cursor-pointer ${rotationStyle}`}
              title={
                isPlayer
                  ? `${card.name} (${card.civilizations.join('/')}) - ${
                      isTapped ? 'Tapped (Click to untap)' : 'Ready (Click or drag to tap)'
                    }`
                  : `${card.name} (${card.civilizations.join('/')}) - ${
                      isTapped ? 'Tapped' : 'Ready'
                    }`
              }
            >
              <img
                src={imageSrc}
                alt={card.name}
                className="w-full h-full object-cover"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  if (card.imageUrl && target.src !== card.imageUrl) {
                    target.src = card.imageUrl;
                  }
                }}
              />
              <div className="absolute top-0.5 left-0.5 p-0.5 rounded bg-slate-950/85 border border-slate-800/70 shadow-xs z-10">
                <CivilizationIcon civilization={card.civilizations[0]} className="w-2.5 h-2.5" />
              </div>

              {/* Tap Indicator Pill for Player Mana */}
              {isPlayer && isTapped && (
                <div className="absolute inset-0 bg-slate-950/40 flex items-center justify-center">
                  <span className="text-[8px] font-mono font-bold text-slate-300 px-1 py-0.2 rounded bg-slate-900/80 border border-slate-700/60">
                    TAP
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Right: Mana Controls & Ratio */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Undo Mana Button (only in MANA_CHARGE phase before advancing) */}
        {canUndoMana && !isOpponent && (
          <button
            type="button"
            onClick={onUndoMana}
            title="Undo mana charge: return the card charged this turn back to hand"
            className="flex items-center gap-1 px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/35 active:scale-95 border border-amber-400/50 text-amber-300 font-mono text-[9px] font-bold transition-all cursor-pointer shadow-xs"
          >
            <Undo2 className="w-3 h-3 text-amber-400" />
            <span>Undo</span>
          </button>
        )}

        {/* Mana Ratio & Civilization Dots */}
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-slate-900/90 border border-slate-800/80 text-[10px] font-mono font-bold text-amber-400 shrink-0 shadow-xs">
          <div className="flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-amber-400 shrink-0" />
            <span className="tabular-nums">
              {untappedCount}/{totalCount}
            </span>
          </div>
          {allCivilizations.length > 0 && (
            <div className="flex items-center gap-1 border-l border-slate-800 pl-1.5">
              {allCivilizations.map((civ) => {
                const isReady = untappedCivs.has(civ);
                return (
                  <div
                    key={civ}
                    title={`${civ} (${isReady ? 'Ready' : 'Tapped'})`}
                    className={`rounded-full transition-opacity ${
                      isReady ? 'opacity-100 drop-shadow-[0_0_3px_rgba(245,158,11,0.5)]' : 'opacity-30 grayscale'
                    }`}
                  >
                    <CivilizationIcon civilization={civ} className="w-2.5 h-2.5" />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
