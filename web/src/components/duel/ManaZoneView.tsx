import React, { useRef, useEffect, useState } from 'react';
import { Sparkles, Undo2, ChevronDown, ChevronUp } from 'lucide-react';
import { m } from 'motion/react';
import type { ManaCardInstance, Phase, PlayerId } from '../../engine/types';
import type { CardDefinition, Civilization } from '../../types/card';
import { CivilizationIcon } from '../card/CivilizationIcon.tsx';

export interface ManaZoneViewProps {
  manaZone: ManaCardInstance[];
  owner: PlayerId;
  phase?: Phase;
  isPlayerTurn?: boolean;
  manaChargedThisTurn?: boolean;
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
  phase = 'MANA_CHARGE',
  isPlayerTurn = true,
  manaChargedThisTurn = false,
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

  // Smart auto-expand on narrow mobile during MANA_CHARGE or manual mana payment
  const shouldAutoExpandMobile =
    !isOpponent &&
    (manaPaymentMode || (isPlayerTurn && phase === 'MANA_CHARGE' && !manaChargedThisTurn));

  const [manualMobileToggle, setManualMobileToggle] = useState<boolean | null>(null);

  useEffect(() => {
    setManualMobileToggle(null);
  }, [phase, isPlayerTurn, manaPaymentMode, manaChargedThisTurn]);

  const isMobileExpanded = manualMobileToggle !== null ? manualMobileToggle : shouldAutoExpandMobile;

  const isDraggingRef = useRef(false);
  const targetTapRef = useRef<boolean>(true);
  const dragVisitedRef = useRef<Set<string>>(new Set());

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

  // Outer non-rotated slot sized with clearance for 90-degree rotated card art inside
  const slotDimensions = 'w-11 h-14 sm:w-12 sm:h-[62px] md:w-[54px] md:h-[68px]';
  const innerCardDimensions = 'w-8 h-[46px] sm:w-[38px] sm:h-[54px] md:w-[42px] md:h-[58px]';

  // Empty State
  if (totalCount === 0) {
    return (
      <div
        data-vfx-id={`mana-zone-${owner}`}
        title={`${isOpponent ? "Opponent's" : "Your"} Mana: 0/0`}
        className={`h-8 sm:h-11 px-2.5 sm:px-3 rounded-md bg-slate-950/35 border border-slate-800/45 flex items-center justify-between select-none shrink-0 ${className}`}
      >
        <div className="flex items-center gap-1.5 text-[9px] font-cinzel font-bold text-slate-500 tracking-wider">
          <Sparkles className="w-2.5 h-2.5 text-amber-500/50" />
          <span>{isOpponent ? 'OPPONENT MANA' : 'MANA ZONE'}</span>
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

  return (
    <div
      data-vfx-id={`mana-zone-${owner}`}
      data-mana-expanded={isMobileExpanded ? 'true' : 'false'}
      title={`${isOpponent ? "Opponent's" : "Your"} Mana: ${untappedCount}/${totalCount} (${untappedCount} ready, ${totalCount - untappedCount} tapped)`}
      onDragStart={(e) => e.preventDefault()}
      className={`relative rounded-md border flex flex-col select-none shrink-0 transition-all ${
        isPlayerPaymentMode
          ? 'bg-amber-950/35 border-amber-400/90 ring-2 ring-amber-400/50 shadow-lg shadow-amber-500/20'
          : 'bg-slate-950/45 border-slate-800/70'
      } ${className}`}
    >
      {/* Mobile (< 1024px) Summary Bar + Collapsible Toggle */}
      <div className="lg:hidden flex items-center justify-between gap-2 px-2 py-1 min-h-[32px]">
        <button
          type="button"
          onClick={() => setManualMobileToggle((prev) => (prev !== null ? !prev : !isMobileExpanded))}
          data-testid={`mana-collapse-toggle-${owner}`}
          className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-amber-300 cursor-pointer"
        >
          <Sparkles className="w-3 h-3 text-amber-400 shrink-0" />
          <span className="uppercase font-cinzel text-[9px] text-slate-300">
            {isOpponent ? 'Opp Mana' : 'Mana'}
          </span>
          <span className="tabular-nums text-amber-300">
            {untappedCount}/{totalCount}
          </span>
          <div className="flex items-center gap-1 pl-1 border-l border-slate-800">
            {allCivilizations.map((civ) => {
              const isReady = untappedCivs.has(civ);
              return (
                <span
                  key={civ}
                  className={isReady ? 'opacity-100' : 'opacity-30 grayscale'}
                  title={`${civ} (${isReady ? 'Ready' : 'Tapped'})`}
                >
                  <CivilizationIcon civilization={civ} className="w-2.5 h-2.5" />
                </span>
              );
            })}
          </div>
          {!isOpponent && (
            <span className="inline-flex items-center text-slate-400 ml-0.5">
              {isMobileExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </span>
          )}
        </button>

        <div className="flex items-center gap-1.5 shrink-0">
          {canUndoMana && !isOpponent && (
            <button
              type="button"
              onClick={onUndoMana}
              title="Undo mana charge"
              className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/35 border border-amber-400/50 text-amber-300 font-mono text-[9px] font-bold cursor-pointer"
            >
              <Undo2 className="w-2.5 h-2.5 text-amber-400" />
              <span>Undo</span>
            </button>
          )}
          {isOpponent && (
            <button
              type="button"
              onClick={() => setManualMobileToggle((prev) => (prev !== null ? !prev : !isMobileExpanded))}
              className="p-0.5 rounded text-slate-400 hover:text-white cursor-pointer"
              aria-label="Toggle opponent mana cards"
            >
              {isMobileExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>

      {/* Expandable Cards Strip (Always visible on desktop lg+, collapsible on mobile) */}
      <div
        className={`${
          isMobileExpanded ? 'flex' : 'hidden lg:flex'
        } items-center justify-between gap-2 px-2 h-[70px] sm:h-18 md:h-20 border-t border-slate-800/60 lg:border-t-0`}
      >
        <m.div
          layoutScroll
          data-mana-strip={owner}
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
              const imageSrc = card.imageAssetPath ? `/${card.imageAssetPath}` : card.imageUrl;

              const innerTransformClass = isPlayer
                ? isSelectedForPay
                  ? 'border-emerald-400 ring-2 ring-emerald-400/80 shadow-md shadow-emerald-500/30'
                  : isTapped
                  ? 'opacity-60 border-slate-600'
                  : isPlayerPaymentMode
                  ? 'hover:brightness-110 border-amber-400 shadow-md ring-2 ring-amber-400/60'
                  : 'hover:brightness-110 border-amber-400/75 shadow-sm ring-1 ring-amber-400/20'
                : isTapped
                ? 'opacity-50 border-slate-700'
                : 'border-slate-700 shadow-xs';

              return (
                <m.div
                  key={manaCard.instanceId}
                  layout="position"
                  layoutId={`card-${manaCard.instanceId}`}
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 360, damping: 28 }}
                  data-mana-id={isPlayer ? manaCard.instanceId : undefined}
                  data-vfx-id={`mana-${manaCard.instanceId}`}
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
                  className={`relative shrink-0 ${slotDimensions} flex items-center justify-center ${
                    isPlayer ? 'touch-none' : ''
                  } ${isLockedSpent ? 'cursor-not-allowed' : 'cursor-pointer'}`}
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
                  {/* Inner Rotating Card Art Frame */}
                  <m.div
                    initial={false}
                    animate={{
                      rotate: isTapped ? 90 : 180,
                      scale: isSelectedForPay ? 0.95 : isTapped ? 0.9 : 1
                    }}
                    transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                    className={`relative ${innerCardDimensions} aspect-[491/682] rounded-xs sm:rounded-sm overflow-hidden border transition-colors duration-150 ${innerTransformClass}`}
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
                  </m.div>

                  {/* Upright Civilization Corner Pip */}
                  <div className="absolute top-0.5 left-0.5 p-0.5 rounded bg-slate-950/90 border border-slate-800/80 shadow-xs z-10 pointer-events-none">
                    <CivilizationIcon civilization={card.civilizations[0]} className="w-2.5 h-2.5" />
                  </div>

                  {/* Upright Non-Rotated Tap / Lock / Pay Indicator */}
                  {isPlayer && isTapped && (
                    <div className="absolute inset-x-0 bottom-0.5 flex items-center justify-center z-20 pointer-events-none">
                      <span
                        className={`text-[7.5px] leading-none font-mono font-black px-1 py-0.5 rounded border shadow-sm ${
                          isSpent
                            ? 'text-slate-200 bg-slate-900/95 border-slate-500/80'
                            : isSelectedForPay
                            ? 'text-emerald-200 bg-emerald-950/95 border-emerald-400/90'
                            : 'text-amber-200 bg-amber-950/95 border-amber-400/80'
                        }`}
                      >
                        {isSpent ? 'LOCK' : isSelectedForPay ? 'PAY' : 'STAGED'}
                      </span>
                    </div>
                  )}
                </m.div>
              );
            })}
        </m.div>

        {/* Desktop Right Summary & Undo Controls (Hidden on mobile because bar above already displays them) */}
        <div className="hidden lg:flex items-center gap-2 shrink-0">
          {canUndoMana && !isOpponent && (
            <button
              type="button"
              onClick={onUndoMana}
              title="Undo mana charge: return the card charged this turn back to hand"
              className="flex items-center gap-1 px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/35 active:scale-95 border border-amber-400/50 text-amber-300 font-mono text-[9.5px] font-bold transition-all cursor-pointer shadow-xs"
            >
              <Undo2 className="w-3 h-3 text-amber-400" />
              <span>Undo</span>
            </button>
          )}

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
    </div>
  );
};
