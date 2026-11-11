import React, { useState } from 'react';
import { Sparkles, Swords, Wand2, Eye } from 'lucide-react';
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

  // If opponent, display concealed card backs in ultra-compact single row with watermark & count badge
  if (isOpponent) {
    return (
      <div
        title={`Opponent Hand: ${hand.length} cards`}
        className="h-7 sm:h-8 px-2 py-0.5 rounded-lg bg-slate-950/60 border border-slate-800/60 relative flex items-center justify-center shrink-0 select-none"
      >
        {/* Background Watermark */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none text-[9px] font-cinzel font-bold text-slate-800/60 uppercase tracking-widest">
          OPPONENT HAND
        </div>

        {/* Floating Count Badge */}
        <div className="absolute top-1 right-2 text-[9px] font-mono text-slate-500/70 pointer-events-none z-10">
          {hand.length} cards
        </div>

        {/* Mini Card Backs */}
        <div className="flex items-center gap-1 overflow-x-auto py-0.5 relative z-10 max-w-full">
          {hand.map((item, idx) => (
            <div
              key={item.instanceId || idx}
              className="w-4 h-5 sm:w-5 sm:h-6 rounded-xs bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 border border-slate-700/80 shadow-xs flex items-center justify-center shrink-0"
            >
              <div className="w-2 h-3 sm:w-2.5 sm:h-3.5 rounded-xs border border-slate-700/60 bg-slate-950/60" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Player's Hand
  return (
    <div
      title={`Your Hand: ${hand.length} cards`}
      className="relative select-none w-full shrink-0"
    >
      {/* Floating Card Count Badge taking zero vertical space */}
      <div className="absolute top-1 right-2 text-[9px] font-mono text-slate-500/70 pointer-events-none z-20">
        {hand.length} cards
      </div>

      {/* Hand Row */}
      <div className="h-22 sm:h-24 relative rounded-lg border border-slate-800/90 bg-gradient-to-t from-slate-950 via-slate-900/40 to-slate-950/80 p-1 flex items-center gap-1.5 overflow-x-auto scrollbar-thin">
        {/* Subtle Background Watermark */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none text-xs font-cinzel font-bold text-slate-800/40 uppercase tracking-widest">
          YOUR HAND
        </div>

        {hand.length === 0 ? (
          <div className="w-full text-center py-2 text-xs text-slate-600/70 font-mono italic relative z-10 pointer-events-none">
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
                className="relative group shrink-0 z-10"
                onMouseEnter={() => onHoverCard?.(card)}
                onMouseLeave={() => onHoverCard?.(null)}
                onClick={() => {
                  setActiveMenuId(isMenuOpen ? null : item.instanceId);
                }}
              >
                {/* Physical Card Scan */}
                <div
                  className={`relative w-14 h-20 sm:w-15 sm:h-22 aspect-[491/682] rounded-md overflow-hidden cursor-pointer transition-all duration-200 shadow-md ${
                    canPlay
                      ? 'ring-2 ring-cyan-400/90 shadow-cyan-500/25 group-hover:-translate-y-0.5 group-hover:scale-105 group-hover:shadow-cyan-400/50'
                      : canCharge
                      ? 'ring-1 ring-amber-500/60 group-hover:-translate-y-0.5'
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
                    className={`absolute inset-0 bg-slate-950/85 backdrop-blur-xs flex flex-col items-center justify-center gap-1 p-1 transition-opacity duration-200 z-30 ${
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