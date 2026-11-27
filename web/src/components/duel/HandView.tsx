import React, { useState, useEffect } from 'react';
import { Sparkles, Swords, Wand2, Eye } from 'lucide-react';
import { m, AnimatePresence } from 'motion/react';
import type { CardInstance, CreatureInstance, ManaCardInstance, Phase, PlayerId } from '../../engine/types';
import type { CardDefinition } from '../../types/card';
import { canPayManaCost, getEffectiveManaCost } from '../../engine/mana';
import { CardBack } from './CardBack.tsx';

interface HandViewProps {
  hand: CardInstance[];
  owner: PlayerId;
  manaZone: ManaCardInstance[];
  battleZone?: CreatureInstance[];
  opponentBattleZone?: CreatureInstance[];
  isPlayerTurn: boolean;
  phase: Phase;
  manaChargedThisTurn: boolean;
  disableActions?: boolean;
  pendingManaCardInstanceId?: string | null;
  paymentProgressLabel?: string;
  onChargeMana?: (cardInstanceId: string) => void;
  onSummonCreature?: (cardInstanceId: string) => void;
  onCastSpell?: (cardInstanceId: string) => void;
  onInspectCard?: (card: CardDefinition) => void;
  onHoverCard?: (card: CardDefinition | null) => void;
}

export const HandView: React.FC<HandViewProps> = ({
  hand,
  owner,
  manaZone,
  battleZone = [],
  opponentBattleZone = [],
  isPlayerTurn,
  phase,
  manaChargedThisTurn,
  disableActions = false,
  pendingManaCardInstanceId = null,
  paymentProgressLabel,
  onChargeMana,
  onSummonCreature,
  onCastSpell,
  onInspectCard,
  onHoverCard
}) => {
  const isOpponent = owner === 'opponent';
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);

  useEffect(() => {
    if (selectedCardId && !hand.some((c) => c.instanceId === selectedCardId)) {
      setSelectedCardId(null);
    }
  }, [hand, selectedCardId]);

  useEffect(() => {
    setSelectedCardId(null);
  }, [phase, isPlayerTurn]);

  // Opponent Hand: Compact Centered Ornate Card Backs
  if (isOpponent) {
    return (
      <div
        data-vfx-id="hand-opponent"
        title={`Opponent Hand: ${hand.length} cards`}
        className="h-8 sm:h-10 md:h-11 w-full flex items-center justify-center gap-1 sm:gap-1.5 px-3 py-0.5 shrink-0 select-none"
      >
        {hand.map((item, idx) => (
          <m.div
            key={item.instanceId || idx}
            layout="position"
            layoutId={item.instanceId ? `card-${item.instanceId}` : undefined}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 360, damping: 28 }}
            className="shrink-0"
          >
            <CardBack
              data-vfx-id={`hand-card-${item.instanceId || idx}`}
              variant="compact"
              className="w-5 h-7 sm:w-6 sm:h-[34px] md:w-7 md:h-[38px] rounded-[3px]"
            />
          </m.div>
        ))}
        {hand.length === 0 && (
          <span className="text-[10px] font-mono text-slate-600 italic">No cards in opponent hand</span>
        )}
      </div>
    );
  }

  const selectedItem = selectedCardId ? hand.find((c) => c.instanceId === selectedCardId) ?? null : null;
  const selectedCanPlay = Boolean(
    selectedItem &&
      !disableActions &&
      isPlayerTurn &&
      (phase === 'MAIN' || phase === 'MANA_CHARGE') &&
      canPayManaCost(manaZone, selectedItem.card, battleZone, opponentBattleZone)
  );
  const selectedCanCharge = Boolean(
    selectedItem && !disableActions && isPlayerTurn && !manaChargedThisTurn && phase === 'MANA_CHARGE'
  );
  const selectedIsCreature = Boolean(selectedItem?.card.type.includes('Creature'));
  const selectedIsSpell = Boolean(selectedItem?.card.type.includes('Spell'));

  // Player Hand: Non-overlapping badges + Desktop hover + Mobile tap-to-select action strip
  return (
    <div
      data-vfx-id="hand-player"
      title={`Your Hand: ${hand.length} cards`}
      className="relative select-none w-full shrink-0 flex flex-col items-center gap-1"
    >
      <m.div
        layoutScroll
        className="h-[104px] sm:h-[132px] md:h-[146px] w-full relative rounded-lg bg-gradient-to-t from-slate-950 via-slate-900/20 to-transparent px-1 pt-3 sm:pt-4 pb-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {hand.length === 0 ? (
          <div className="h-full flex items-center justify-center text-center py-3 text-xs text-slate-600 font-mono italic pointer-events-none">
            Hand empty
          </div>
        ) : (
          <div className="mx-auto flex w-max items-center gap-1.5 sm:gap-2.5 px-1">
            {hand.map((item) => {
                const card = item.card;
                const isCreature = card.type.includes('Creature');
                const isSpell = card.type.includes('Spell');
                const effectiveCost = getEffectiveManaCost(card, battleZone, opponentBattleZone);
                const affordable = canPayManaCost(manaZone, card, battleZone, opponentBattleZone);
                const canCharge =
                  !disableActions &&
                  isPlayerTurn &&
                  !manaChargedThisTurn &&
                  phase === 'MANA_CHARGE';
                const canPlay =
                  !disableActions &&
                  isPlayerTurn &&
                  (phase === 'MAIN' || phase === 'MANA_CHARGE') &&
                  affordable;

                const isPendingPay = pendingManaCardInstanceId === item.instanceId;
                const isSelected = selectedCardId === item.instanceId;
                const imageSrc = card.imageAssetPath ? `/${card.imageAssetPath}` : card.imageUrl;

                return (
                  <m.div
                    key={item.instanceId}
                    layout="position"
                    layoutId={`card-${item.instanceId}`}
                    initial={{ opacity: 0, y: 12, scale: 0.92 }}
                    animate={{ opacity: 1, y: isSelected ? -8 : 0, scale: 1 }}
                    whileHover={{ y: -8 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 28 }}
                    data-vfx-id={`hand-card-${item.instanceId}`}
                    tabIndex={0}
                    className={`relative flex flex-col items-center shrink-0 group cursor-pointer z-10 hover:z-30 focus-within:z-30 outline-none ${
                      isSelected ? 'z-30' : ''
                    }`}
                  onMouseEnter={() => onHoverCard?.(card)}
                  onMouseLeave={() => onHoverCard?.(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedCardId((prev) => (prev === item.instanceId ? null : item.instanceId));
                    onInspectCard?.(card);
                  }}
                >
                  {/* Floating Reduced-Cost Pill Above Card Edge (never covers printed art title/cost) */}
                  {effectiveCost < card.manaCost && (
                    <div
                      className="absolute -top-2 right-1 px-1 py-[1px] rounded bg-emerald-950/95 border border-emerald-400/80 text-emerald-300 font-mono font-black text-[7.5px] shadow-md z-30 pointer-events-none"
                      title={`Reduced cost ${effectiveCost} (base ${card.manaCost})`}
                    >
                      Cost {effectiveCost}
                    </div>
                  )}

                  {/* Card Artwork Container */}
                  <div
                    className={`relative w-[62px] h-[86px] sm:w-[80px] sm:h-[112px] md:w-[88px] md:h-[122px] aspect-[491/682] rounded-md overflow-hidden shadow-md border transition-all duration-150 ${
                      isPendingPay
                        ? 'border-amber-400 ring-2 ring-amber-400 shadow-amber-500/40 animate-pulse'
                        : isSelected
                        ? 'border-sky-400 ring-2 ring-sky-400/80 shadow-sky-500/30'
                        : canPlay
                        ? 'border-emerald-400 ring-1 ring-emerald-400/90 shadow-emerald-500/30'
                        : canCharge
                        ? 'border-amber-500/60 shadow-amber-500/10'
                        : 'border-slate-800 opacity-90'
                    }`}
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

                    {/* Unambiguous Semantic Action Pill (Anchored bottom-left above action tray; clear of printed top title/mana) */}
                    {isPendingPay ? (
                      <div className="absolute bottom-1 left-1 px-1 py-[1px] rounded bg-amber-400 text-slate-950 font-black text-[7px] font-mono tracking-tight shadow z-10 pointer-events-none">
                        {paymentProgressLabel ? `PAYING ${paymentProgressLabel}` : 'PAYING'}
                      </div>
                    ) : canPlay ? (
                      <div className="hidden sm:inline-block absolute bottom-1 left-1 px-1 py-[1px] rounded bg-emerald-500 text-slate-950 font-black text-[7px] font-cinzel tracking-wider shadow z-10 pointer-events-none group-hover:opacity-0">
                        PLAY
                      </div>
                    ) : canCharge ? (
                      <div className="hidden sm:inline-block absolute bottom-1 left-1 px-1 py-[1px] rounded bg-amber-500/95 text-slate-950 font-black text-[7px] font-cinzel tracking-wider shadow z-10 pointer-events-none group-hover:opacity-0">
                        CHARGE (+1)
                      </div>
                    ) : null}

                    {/* Desktop Hover / Keyboard Focus Quick Action Overlay */}
                    {(canPlay || canCharge) && (
                      <div className="hidden lg:flex absolute inset-x-0 bottom-0 p-1 sm:p-1.5 bg-gradient-to-t from-slate-950 via-slate-950/95 to-transparent flex-col gap-1 items-stretch justify-end opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity duration-150 z-20">
                        {canPlay && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isCreature) onSummonCreature?.(item.instanceId);
                              else if (isSpell) onCastSpell?.(item.instanceId);
                            }}
                            className="w-full flex items-center justify-center gap-1 py-1 px-1.5 rounded bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 font-cinzel font-black text-[9px] sm:text-[10px] shadow-md transition-transform cursor-pointer"
                            title={isCreature ? `Summon ${card.name}` : `Cast ${card.name}`}
                          >
                            {isCreature ? <Swords className="w-3 h-3" /> : <Wand2 className="w-3 h-3" />}
                            <span>{isCreature ? 'Summon' : 'Cast'}</span>
                          </button>
                        )}

                        {canCharge && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onChargeMana?.(item.instanceId);
                            }}
                            className="w-full flex items-center justify-center gap-1 py-0.5 sm:py-1 px-1.5 rounded bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-cinzel font-bold text-[8.5px] sm:text-[9px] shadow-md transition-transform cursor-pointer"
                            title={`Charge ${card.name} into Mana Zone`}
                          >
                            <Sparkles className="w-3 h-3" />
                            <span>+1 Mana</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </m.div>
              );
            })}
          </div>
        )}
      </m.div>

      {/* Tap-to-Select Persistent Action Bar (Essential for Mobile/Touch; also helpful on Desktop when clicked) */}
      <AnimatePresence>
        {selectedItem && (selectedCanPlay || selectedCanCharge) && (
          <m.div
            key="hand-selected-action-bar"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.14 }}
            data-testid="hand-selected-action-bar"
            onClick={(e) => e.stopPropagation()}
            className="lg:hidden w-full max-w-md mx-auto px-2 py-1 rounded-lg bg-slate-900/95 border border-sky-500/45 shadow-lg flex items-center justify-between gap-1.5 text-[10px] z-30"
          >
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-cinzel font-bold text-slate-100 truncate">
              {selectedItem.card.name}
            </span>
            <span className="font-mono text-[9px] px-1 rounded bg-slate-800 text-amber-300 shrink-0 tabular-nums">
              {getEffectiveManaCost(selectedItem.card, battleZone, opponentBattleZone)}
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {selectedCanPlay && (
              <button
                type="button"
                onClick={() => {
                  if (selectedIsCreature) onSummonCreature?.(selectedItem.instanceId);
                  else if (selectedIsSpell) onCastSpell?.(selectedItem.instanceId);
                }}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 font-cinzel font-black text-[9.5px] cursor-pointer"
              >
                {selectedIsCreature ? <Swords className="w-3 h-3" /> : <Wand2 className="w-3 h-3" />}
                <span>{selectedIsCreature ? 'Summon' : 'Cast'}</span>
              </button>
            )}

            {selectedCanCharge && (
              <button
                type="button"
                onClick={() => {
                  onChargeMana?.(selectedItem.instanceId);
                  setSelectedCardId(null);
                }}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-cinzel font-bold text-[9.5px] cursor-pointer"
              >
                <Sparkles className="w-3 h-3" />
                <span>+1 Mana</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => onInspectCard?.(selectedItem.card)}
              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 cursor-pointer"
              title="Inspect Card"
              aria-label="Inspect Card"
            >
              <Eye className="w-3 h-3" />
            </button>
          </div>
        </m.div>
        )}
      </AnimatePresence>
    </div>
  );
};
