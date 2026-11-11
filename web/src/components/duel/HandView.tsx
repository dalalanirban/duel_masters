import React, { useState } from 'react';
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Opponent Hand: Minimalist Concealed Hand Bar
  if (isOpponent) {
    return (
      <div
        title={`Opponent Hand: ${hand.length} cards`}
        className="h-6 sm:h-7 px-3 rounded-md bg-slate-950/40 border border-slate-800/40 flex items-center justify-between shrink-0 select-none"
      >
        <span className="text-[9px] font-cinzel font-bold text-slate-500 tracking-wider">
          OPPONENT HAND
        </span>

        {/* Mini Card Backs Cascade */}
        <div className="flex items-center gap-1">
          {hand.map((item, idx) => (
            <div
              key={item.instanceId || idx}
              className="w-3.5 h-4.5 sm:w-4 sm:h-5 rounded-xs bg-slate-900 border border-slate-700/60 shadow-xs shrink-0"
            />
          ))}
          <span className="text-[9px] font-mono text-slate-400 font-semibold ml-1 tabular-nums">
            {hand.length}
          </span>
        </div>
      </div>
    );
  }

  // Player Hand: Spacious, Clean Tray
  return (
    <div
      title={`Your Hand: ${hand.length} cards`}
      className="relative select-none w-full shrink-0"
    >
      {/* Hand Row with Card Overlap */}
      <div className="h-28 sm:h-30 relative rounded-lg bg-gradient-to-t from-slate-950 via-slate-900/20 to-transparent p-1 pt-7 flex items-center justify-center gap-1.5 sm:gap-2.5 overflow-x-auto scrollbar-thin">
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
            const canCharge =
              isPlayerTurn &&
              !manaChargedThisTurn &&
              (phase === 'MANA_CHARGE' || phase === 'MAIN');
            const canPlay =
              isPlayerTurn &&
              (phase === 'MAIN' || phase === 'MANA_CHARGE') &&
              affordable;

            const imageSrc = card.imageAssetPath ? `/${card.imageAssetPath}` : card.imageUrl;

            const isHovered = hoveredId === item.instanceId;
            const isSelected = selectedId === item.instanceId;
            const isActive = isHovered || isSelected;

            return (
              <div
                key={item.instanceId}
                className={`relative group shrink-0 transition-transform duration-200 cursor-pointer ${
                  isActive ? '-translate-y-3.5 scale-108 z-30' : 'hover:-translate-y-3.5 hover:scale-108 hover:z-30'
                }`}
                onMouseEnter={() => {
                  setHoveredId(item.instanceId);
                  onHoverCard?.(card);
                  onInspectCard?.(card);
                }}
                onMouseLeave={() => {
                  setHoveredId(null);
                  onHoverCard?.(null);
                }}
                onClick={() => {
                  setSelectedId(selectedId === item.instanceId ? null : item.instanceId);
                  onInspectCard?.(card);
                }}
              >
                {/* Floating Minimalist Action Pill Above Card on Hover / Active */}
                {(canPlay || canCharge) && (
                  <div
                    className={`absolute -top-7 left-1/2 -translate-x-1/2 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-slate-900/95 border border-slate-700/80 shadow-2xl backdrop-blur-md z-40 whitespace-nowrap transition-all duration-150 pointer-events-auto ${
                      isActive ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 group-hover:pointer-events-auto'
                    }`}
                  >
                    {/* Primary Play Action */}
                    {canPlay && isCreature && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedId(null);
                          onSummonCreature?.(item.instanceId);
                        }}
                        className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-300 border border-emerald-500/40 text-[9px] font-bold font-cinzel transition-colors cursor-pointer"
                      >
                        <Swords className="w-2.5 h-2.5" />
                        <span>Summon</span>
                      </button>
                    )}

                    {canPlay && isSpell && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedId(null);
                          onCastSpell?.(item.instanceId);
                        }}
                        className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-300 border border-indigo-500/40 text-[9px] font-bold font-cinzel transition-colors cursor-pointer"
                      >
                        <Wand2 className="w-2.5 h-2.5" />
                        <span>Cast</span>
                      </button>
                    )}

                    {/* Charge Mana Action */}
                    {canCharge && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedId(null);
                          onChargeMana?.(item.instanceId);
                        }}
                        className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 hover:bg-amber-500/40 text-amber-300 border border-amber-500/40 text-[9px] font-bold font-cinzel transition-colors cursor-pointer"
                      >
                        <Sparkles className="w-2.5 h-2.5" />
                        <span>+1 Mana</span>
                      </button>
                    )}
                  </div>
                )}

                {/* Card Artwork Face */}
                <div
                  className={`relative w-16 h-22 sm:w-18 sm:h-25 aspect-[491/682] rounded-md overflow-hidden shadow-lg transition-shadow duration-200 border ${
                    canPlay
                      ? 'border-emerald-400/90 shadow-emerald-500/25 ring-1 ring-emerald-400/60'
                      : canCharge
                      ? 'border-amber-500/50 shadow-amber-500/10'
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

                  {/* Top-Right: Mana Cost Jewel */}
                  <div className="absolute top-0.5 right-0.5 w-4.5 h-4.5 sm:w-5 sm:h-5 rounded-full bg-slate-950/90 border border-amber-400/80 text-amber-300 font-mono font-black text-[9px] sm:text-[10px] flex items-center justify-center shadow-md tabular-nums">
                    {card.manaCost}
                  </div>

                  {/* Top-Left: Playable Badge */}
                  {canPlay && (
                    <div className="absolute top-0.5 left-0.5 px-1 py-0.2 rounded-full bg-emerald-500 text-slate-950 font-black text-[7px] font-cinzel tracking-wider shadow animate-pulse">
                      PLAY
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
