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

  // Player Hand: Spacious, Clean Tray with Always-Visible Action Buttons
  return (
    <div
      title={`Your Hand: ${hand.length} cards`}
      className="relative select-none w-full shrink-0"
    >
      <div className="h-28 sm:h-30 relative rounded-lg bg-gradient-to-t from-slate-950 via-slate-900/20 to-transparent p-1 flex items-center justify-center gap-2 sm:gap-3 overflow-x-auto scrollbar-thin">
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

            return (
              <div
                key={item.instanceId}
                className="flex flex-col items-center gap-1 shrink-0 group transition-transform duration-200 hover:-translate-y-2 cursor-pointer"
                onMouseEnter={() => {
                  onHoverCard?.(card);
                  onInspectCard?.(card);
                }}
                onMouseLeave={() => onHoverCard?.(null)}
                onClick={() => onInspectCard?.(card)}
              >
                {/* Physical Card Scan */}
                <div
                  className={`relative w-15 h-20 sm:w-16 sm:h-22 aspect-[491/682] rounded-md overflow-hidden shadow-md border ${
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
                  <div className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-slate-950/90 border border-amber-400 text-amber-300 font-mono font-black text-[9px] flex items-center justify-center shadow-md tabular-nums">
                    {card.manaCost}
                  </div>

                  {/* Top-Left: Playable Beacon */}
                  {canPlay && (
                    <div className="absolute top-0.5 left-0.5 px-1 py-0.2 rounded bg-emerald-500 text-slate-950 font-black text-[7px] font-cinzel tracking-wider shadow animate-pulse">
                      PLAY
                    </div>
                  )}
                </div>

                {/* Dedicated Action Buttons directly below the card */}
                <div className="w-full flex items-center justify-center gap-1">
                  {/* Summon / Cast Action Button */}
                  {canPlay && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isCreature) onSummonCreature?.(item.instanceId);
                        else if (isSpell) onCastSpell?.(item.instanceId);
                      }}
                      className="flex-1 flex items-center justify-center gap-0.5 py-0.5 px-1.5 rounded bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-cinzel font-black text-[9px] shadow-sm transition-transform cursor-pointer"
                      title={isCreature ? `Summon ${card.name}` : `Cast ${card.name}`}
                    >
                      {isCreature ? <Swords className="w-2.5 h-2.5" /> : <Wand2 className="w-2.5 h-2.5" />}
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
                      className={`${canPlay ? 'flex-1' : 'w-full'} flex items-center justify-center gap-0.5 py-0.5 px-1.5 rounded bg-amber-600 hover:bg-amber-500 active:scale-95 text-white font-cinzel font-bold text-[9px] shadow-sm transition-transform cursor-pointer`}
                      title={`Charge ${card.name} into Mana Zone`}
                    >
                      <Sparkles className="w-2.5 h-2.5" />
                      <span>+1 Mana</span>
                    </button>
                  )}

                  {/* Neither playable nor chargeable */}
                  {!canPlay && !canCharge && (
                    <div className="w-full text-center py-0.5 text-[8px] font-mono text-slate-500 leading-none">
                      Cost {card.manaCost}
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
