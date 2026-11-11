import React from 'react';
import { Sparkles, Swords, Wand2 } from 'lucide-react';
import type { CardInstance, ManaCardInstance, Phase, PlayerId } from '../../engine/types';
import type { CardDefinition } from '../../types/card';
import { canPayManaCost } from '../../engine/mana';

interface HandViewProps {
  hand: CardInstance[];
  owner: PlayerId;
  manaZone: ManaCardInstance[];
  isPlayerTurn: boolean;
  phase: Phase;
  manaChargedThisTurn: boolean;
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
  isPlayerTurn,
  phase,
  manaChargedThisTurn,
  onChargeMana,
  onSummonCreature,
  onCastSpell,
  onInspectCard,
  onHoverCard
}) => {
  const isOpponent = owner === 'opponent';

  // Opponent Hand: Centered, Proportional Card Backs (No label text)
  if (isOpponent) {
    return (
      <div
        title={`Opponent Hand: ${hand.length} cards`}
        className="h-12 sm:h-14 w-full flex items-center justify-center gap-1.5 sm:gap-2 px-3 py-1 shrink-0 select-none"
      >
        {hand.map((item, idx) => (
          <div
            key={item.instanceId || idx}
            className="w-7 h-10 sm:w-8 sm:h-11 md:w-9 md:h-12.5 aspect-[491/682] rounded-xs sm:rounded-sm bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 border border-slate-700/80 shadow-xs flex flex-col items-center justify-between p-0.5 shrink-0"
          >
            <div className="w-2.5 h-2.5 rounded-full border border-amber-500/30 bg-amber-500/10 flex items-center justify-center text-[5px] font-cinzel text-amber-400">
              DM
            </div>
            <div className="w-3/4 h-[1px] bg-slate-800 rounded-full" />
          </div>
        ))}
        {hand.length === 0 && (
          <span className="text-[10px] font-mono text-slate-600 italic">No cards in opponent hand</span>
        )}
      </div>
    );
  }

  // Player Hand: Spacious, Clean Tray with Hover-Only Action Overlays
  return (
    <div
      title={`Your Hand: ${hand.length} cards`}
      className="relative select-none w-full shrink-0"
    >
      <div className="h-28 sm:h-30 md:h-32 relative rounded-lg bg-gradient-to-t from-slate-950 via-slate-900/20 to-transparent px-1 pt-3.5 sm:pt-4 pb-1 flex items-center justify-center gap-2 sm:gap-2.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {hand.length === 0 ? (
          <div className="text-center py-3 text-xs text-slate-600 font-mono italic pointer-events-none">
            Hand empty
          </div>
        ) : (
          hand.map((item) => {
            const card = item.card;
            const isCreature = card.type.includes('Creature');
            const isSpell = card.type.includes('Spell');
            const affordable = canPayManaCost(manaZone, card);
            // In Duel Masters, mana can ONLY be charged during the MANA_CHARGE phase before advancing!
            const canCharge =
              isPlayerTurn &&
              !manaChargedThisTurn &&
              phase === 'MANA_CHARGE';
            const canPlay =
              isPlayerTurn &&
              (phase === 'MAIN' || phase === 'MANA_CHARGE') &&
              affordable;

            const imageSrc = card.imageAssetPath ? `/${card.imageAssetPath}` : card.imageUrl;

            return (
              <div
                key={item.instanceId}
                className="relative flex flex-col items-center shrink-0 group transition-transform duration-200 hover:-translate-y-2 cursor-pointer z-10 hover:z-30"
                onMouseEnter={() => {
                  onHoverCard?.(card);
                }}
                onMouseLeave={() => onHoverCard?.(null)}
                onClick={() => onInspectCard?.(card)}
              >
                {/* Physical Card Scan (Balanced to match battle zone creatures) */}
                <div
                  className={`relative w-15 h-21 sm:w-17 sm:h-24 md:w-18 md:h-25 aspect-[491/682] rounded-md overflow-hidden shadow-md border transition-all duration-150 ${
                    canPlay
                      ? 'border-emerald-400 ring-1 ring-emerald-400 shadow-emerald-500/30'
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

                  {/* Top-Right: Mana Cost Badge */}
                  <div className="absolute top-0.5 right-0.5 w-4 h-4 sm:w-4.5 sm:h-4.5 rounded-full bg-slate-950/90 border border-amber-400 text-amber-300 font-mono font-black text-[9px] sm:text-[10px] flex items-center justify-center shadow-md tabular-nums z-10">
                    {card.manaCost}
                  </div>

                  {/* Top-Left: Playable Beacon */}
                  {canPlay && (
                    <div className="absolute top-0.5 left-0.5 px-1 py-0.2 rounded bg-emerald-500 text-slate-950 font-black text-[7px] font-cinzel tracking-wider shadow z-10">
                      PLAY
                    </div>
                  )}

                  {/* HOVER ACTION OVERLAY: ONLY visible on hover */}
                  {(canPlay || canCharge) && (
                    <div className="absolute inset-x-0 bottom-0 p-1 sm:p-1.5 bg-gradient-to-t from-slate-950 via-slate-950/95 to-transparent flex flex-col gap-1 items-stretch justify-end opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity duration-150 z-20">
                      {/* Summon / Cast Action Button */}
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
                          {isCreature ? <Swords className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> : <Wand2 className="w-2.5 h-2.5 sm:w-3 sm:h-3" />}
                          <span>{isCreature ? 'Summon' : 'Cast'}</span>
                        </button>
                      )}

                      {/* +1 Mana Charge Action Button */}
                      {canCharge && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onChargeMana?.(item.instanceId);
                          }}
                          className="w-full flex items-center justify-center gap-1 py-0.5 sm:py-1 px-1.5 rounded bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-cinzel font-bold text-[8px] sm:text-[9px] shadow-md transition-transform cursor-pointer"
                          title={`Charge ${card.name} into Mana Zone`}
                        >
                          <Sparkles className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                          <span>+1 Mana</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
