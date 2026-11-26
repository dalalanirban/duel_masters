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
  manaPaymentMode?: boolean;
  selectedPaymentManaIds?: string[];
  onTogglePaymentMana?: (cardInstanceId: string, forceSelected?: boolean) => void;
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
  manaPaymentMode = false,
  selectedPaymentManaIds = [],
  onTogglePaymentMana,
  canUndoMana = false,
  onUndoMana,
  className = ''
}) => {
  const isOpponent = owner === 'opponent';
  const selectedPaymentSet = new Set(selectedPaymentManaIds);
  const untappedMana = manaZone.filter((m) =>
    manaPaymentMode && !isOpponent ? !m.isSpent && !selectedPaymentSet.has(m.instanceId) : !m.isTapped
  );
  const untappedCount = untappedMana.length;
  const totalCount = manaZone.length;

  const isDraggingRef = useRef(false);
  const targetTapRef = useRef<boolean>(true);
  const dragVisitedRef = useRef<Set<string>>(new Set());

  // Global mouseup/pointerup listener for drag-to-tap gesture
  useEffect(() => {
    const handleGlobalPointerUp = () => {
      isDraggingRef.current = false;
      dragVisitedRef.current.clear();
    };
    window.addEventListener('pointerup', handleGlobalPointerUp);
    window.addEventListener('pointercancel', handleGlobalPointerUp);
    window.addEventListener('mouseup', handleGlobalPointerUp);
    return () => {
      window.removeEventListener('pointerup', handleGlobalPointerUp);
      window.removeEventListener('pointercancel', handleGlobalPointerUp);
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

  const isPlayerPaymentMode = manaPaymentMode && !isOpponent;
  const activeToggleHandler = isPlayerPaymentMode ? onTogglePaymentMana : onToggleManaTap;

  const applyDragToggleIfUnvisited = (instanceId: string) => {
    if (isOpponent || !activeToggleHandler || !isDraggingRef.current) return;
    if (dragVisitedRef.current.has(instanceId)) return;
    const targetCard = manaZone.find((m) => m.instanceId === instanceId);
    if (!targetCard || Boolean(targetCard.isSpent)) return;
    dragVisitedRef.current.add(instanceId);
    activeToggleHandler(instanceId, targetTapRef.current);
  };

  // Populated Sleek Mana Strip
  return (
    <div
      title={`${isOpponent ? "Opponent's" : "Your"} Mana: ${untappedCount}/${totalCount} (${untappedCount} ready, ${totalCount - untappedCount} tapped)`}
      onDragStart={(e) => e.preventDefault()}
      className={`relative h-14 sm:h-16 md:h-17 px-2 rounded-md border flex items-center justify-between gap-2 select-none shrink-0 transition-all ${
        isPlayerPaymentMode
          ? 'bg-amber-950/35 border-amber-400/90 ring-2 ring-amber-400/50 shadow-lg shadow-amber-500/20'
          : 'bg-slate-950/40 border-slate-800/60'
      } ${className}`}
    >
      {/* Left: Mana Cards Horizontal Strip (Supports smooth click-and-drag to tap across cards) */}
      <div
        onPointerMove={(e) => {
          if (isOpponent || !isDraggingRef.current || !activeToggleHandler) return;
          const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
          const cardEl = el?.closest<HTMLElement>('[data-mana-id]');
          const hoveredId = cardEl?.dataset.manaId;
          if (hoveredId) {
            applyDragToggleIfUnvisited(hoveredId);
          }
        }}
        className="flex items-center gap-1.5 overflow-x-auto py-1 min-w-0 flex-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {manaZone.map((manaCard) => {
          const card = manaCard.card;
          const isPlayer = owner === 'player';
          const isSpent = Boolean(manaCard.isSpent);
          const isSelectedForPay = isPlayerPaymentMode && selectedPaymentSet.has(manaCard.instanceId);
          const isTapped = isPlayerPaymentMode ? isSpent || isSelectedForPay : manaCard.isTapped;
          const isLockedSpent = isPlayer && isSpent;
          const imageSrc = card.imageAssetPath
            ? `/${card.imageAssetPath}`
            : card.imageUrl;

          const rotationStyle = isPlayer
            ? isSelectedForPay
              ? 'rotate-90 scale-90 border-emerald-400 ring-2 ring-emerald-400/70 shadow-md shadow-emerald-500/30'
              : isTapped
              ? 'rotate-90 scale-90 opacity-55 border-slate-700'
              : isPlayerPaymentMode
              ? 'rotate-180 hover:scale-108 border-amber-400 shadow-md ring-2 ring-amber-400/60'
              : 'rotate-180 hover:scale-108 border-amber-400/80 shadow-md ring-1 ring-amber-400/20'
            : (isTapped ? 'rotate-90 scale-90 opacity-50 border-slate-700' : 'border-slate-700 hover:scale-108 shadow-xs');

          return (
            <div
              key={manaCard.instanceId}
              data-mana-id={isPlayer ? manaCard.instanceId : undefined}
              draggable={false}
              onDragStart={(e) => e.preventDefault()}
              onMouseEnter={() => onHoverCard?.(card)}
              onMouseLeave={() => onHoverCard?.(null)}
              onContextMenu={(e) => {
                e.preventDefault();
                onInspectCard?.(card);
              }}
              onPointerDown={(e) => {
                if (isOpponent || !activeToggleHandler) {
                  onInspectCard?.(card);
                  return;
                }
                if (isLockedSpent) {
                  activeToggleHandler(manaCard.instanceId, false);
                  return;
                }
                e.preventDefault();
                isDraggingRef.current = true;
                dragVisitedRef.current = new Set([manaCard.instanceId]);
                const nextState = isPlayerPaymentMode ? !isSelectedForPay : !manaCard.isTapped;
                targetTapRef.current = nextState;
                activeToggleHandler(manaCard.instanceId, nextState);
              }}
              onPointerEnter={() => {
                onHoverCard?.(card);
                applyDragToggleIfUnvisited(manaCard.instanceId);
              }}
              className={`relative shrink-0 ${cardDimensions} rounded-xs sm:rounded-sm overflow-hidden border transition-transform duration-150 ${
                isPlayer ? 'touch-none' : ''
              } ${
                isLockedSpent ? 'cursor-not-allowed' : 'cursor-pointer'
              } ${rotationStyle}`}
              title={
                isPlayer
                  ? `${card.name} (${card.civilizations.join('/')}) - ${
                      isLockedSpent
                        ? 'Spent this turn (Locked until start of turn)'
                        : isSelectedForPay
                        ? 'Selected to pay mana (Click or drag to unselect)'
                        : isPlayerPaymentMode
                        ? 'Click or drag to tap this mana for payment'
                        : isTapped
                        ? 'Staged Mana (Click or drag to untap)'
                        : 'Ready (Click or drag to tap)'
                    }`
                  : `${card.name} (${card.civilizations.join('/')}) - ${
                      isTapped ? 'Tapped' : 'Ready'
                    }`
              }
            >
              <img
                src={imageSrc}
                alt={card.name}
                draggable={false}
                className="w-full h-full object-cover pointer-events-none select-none"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  if (card.imageUrl && target.src !== card.imageUrl) {
                    target.src = card.imageUrl;
                  }
                }}
              />
              <div className="absolute top-0.5 left-0.5 p-0.5 rounded bg-slate-950/85 border border-slate-800/70 shadow-xs z-10 pointer-events-none">
                <CivilizationIcon civilization={card.civilizations[0]} className="w-2.5 h-2.5" />
              </div>

              {/* Tap / Lock Indicator Pill for Player Mana */}
              {isPlayer && isTapped && (
                <div className="absolute inset-0 bg-slate-950/45 flex items-center justify-center pointer-events-none">
                  <span
                    className={`text-[7px] font-mono font-bold px-1 py-0.2 rounded border ${
                      isSpent
                        ? 'text-slate-300 bg-slate-900/90 border-slate-600/80'
                        : isSelectedForPay
                        ? 'text-emerald-200 bg-emerald-950/95 border-emerald-400/80'
                        : 'text-amber-300 bg-amber-950/90 border-amber-500/60'
                    }`}
                  >
                    {isSpent ? 'LOCK' : isSelectedForPay ? 'PAY' : 'STAGED'}
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
