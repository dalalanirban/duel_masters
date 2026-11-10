import React, { useState } from 'react';
import { Sparkles, Swords, Wand2, Eye, Hand as HandIcon } from 'lucide-react';
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
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // If opponent, display concealed card backs with count
  if (isOpponent) {
    return (
      <div className="flex flex-col gap-1 select-none">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-1.5 text-xs font-cinzel font-bold text-slate-400">
            <HandIcon className="w-3.5 h-3.5 text-slate-500" />
            <span>Opponent's Hand ({hand.length} Cards)</span>
          </div>
        </div>

        <div className="min-h-16 flex items-center gap-1.5 overflow-x-auto py-1 px-1">
          {hand.length === 0 ? (
            <span className="text-xs text-slate-600 font-mono italic">Hand is empty</span>
          ) : (
            hand.map((item, idx) => (
              <div
                key={item.instanceId || idx}
                className="w-10 sm:w-12 h-14 sm:h-16 rounded-md bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 border border-slate-700/80 shadow-md flex items-center justify-center shrink-0"
              >
                <div className="w-4 h-6 rounded border border-slate-700/60 bg-slate-950/60" />
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  // Player's Hand
  return (
    <div className="flex flex-col gap-1 select-none w-full shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5 text-xs font-cinzel font-bold text-slate-300">
          <HandIcon className="w-3.5 h-3.5 text-sky-400" />
          <span>Your Hand ({hand.length} Cards)</span>
        </div>

        <span className="text-[10px] text-slate-400">
          Click card to Charge Mana or Play
        </span>
      </div>

      {/* Hand Row */}
      <div className="min-h-24 sm:min-h-28 rounded-xl border border-slate-800/90 bg-gradient-to-t from-slate-950 via-slate-900/40 to-slate-950/80 p-1.5 sm:p-2 flex items-center gap-2 overflow-x-auto scrollbar-thin">
        {hand.length === 0 ? (
          <div className="w-full text-center py-4 text-xs text-slate-600 font-mono italic">
            Your hand is empty
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

            const isMenuOpen = activeMenuId === item.instanceId;
            const imageSrc = card.imageAssetPath ? `/${card.imageAssetPath}` : card.imageUrl;

            return (
              <div
                key={item.instanceId}
                className="relative group shrink-0"
                onMouseEnter={() => onHoverCard?.(card)}
                onMouseLeave={() => onHoverCard?.(null)}
                onClick={() => {
                  setActiveMenuId(isMenuOpen ? null : item.instanceId);
                }}
              >
                {/* Physical Card Scan */}
                <div
                  className={`relative w-18 h-26 sm:w-20 sm:h-28 aspect-[491/682] rounded-lg overflow-hidden cursor-pointer transition-all duration-200 shadow-lg ${
                    canPlay
                      ? 'ring-2 ring-cyan-400/90 shadow-cyan-500/25 group-hover:-translate-y-1 group-hover:scale-105 group-hover:shadow-cyan-400/50'
                      : canCharge
                      ? 'ring-1 ring-amber-500/60 group-hover:-translate-y-1'
                      : 'border border-slate-700/80 opacity-90 group-hover:-translate-y-0.5'
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
                  <div className="absolute top-0.5 right-0.5 px-1 py-0.2 rounded-full bg-slate-950/90 border border-amber-400/80 text-amber-300 font-mono font-black text-[10px] shadow-md">
                    {card.manaCost}
                  </div>

                  {/* Playable Badge */}
                  {canPlay && (
                    <div className="absolute top-0.5 left-0.5 px-1 py-0.2 rounded bg-cyan-500 text-slate-950 font-cinzel font-black text-[8px] shadow animate-pulse">
                      PLAYABLE
                    </div>
                  )}

                  {/* Quick Action Overlay on Hover / Active */}
                  <div
                    className={`absolute inset-0 bg-slate-950/85 backdrop-blur-xs flex flex-col items-center justify-center gap-1 p-1 transition-opacity duration-200 ${
                      isMenuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                    }`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* 1. Summon Creature */}
                    {isCreature && (
                      <button
                        type="button"
                        disabled={!canPlay}
                        onClick={() => {
                          setActiveMenuId(null);
                          onSummonCreature?.(item.instanceId);
                        }}
                        className="w-full flex items-center justify-center gap-1 py-0.5 px-1.5 rounded-md text-[10px] font-bold bg-cyan-600 hover:bg-cyan-500 text-white disabled:opacity-40 disabled:pointer-events-none transition-colors shadow"
                      >
                        <Swords className="w-2.5 h-2.5" /> Summon
                      </button>
                    )}

                    {/* 2. Cast Spell */}
                    {isSpell && (
                      <button
                        type="button"
                        disabled={!canPlay}
                        onClick={() => {
                          setActiveMenuId(null);
                          onCastSpell?.(item.instanceId);
                        }}
                        className="w-full flex items-center justify-center gap-1 py-0.5 px-1.5 rounded-md text-[10px] font-bold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 disabled:pointer-events-none transition-colors shadow"
                      >
                        <Wand2 className="w-2.5 h-2.5" /> Cast Spell
                      </button>
                    )}

                    {/* 3. Charge Mana */}
                    <button
                      type="button"
                      disabled={!canCharge}
                      onClick={() => {
                        setActiveMenuId(null);
                        onChargeMana?.(item.instanceId);
                      }}
                      className="w-full flex items-center justify-center gap-1 py-0.5 px-1.5 rounded-md text-[10px] font-bold bg-amber-600 hover:bg-amber-500 text-white disabled:opacity-40 disabled:pointer-events-none transition-colors shadow"
                    >
                      <Sparkles className="w-2.5 h-2.5" /> +1 Mana
                    </button>

                    {/* 4. Inspect */}
                    <button
                      type="button"
                      onClick={() => {
                        setActiveMenuId(null);
                        onInspectCard?.(card);
                      }}
                      className="w-full flex items-center justify-center gap-1 py-0.5 px-1 rounded text-[9px] text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors"
                    >
                      <Eye className="w-2.5 h-2.5" /> Inspect
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
