import React from 'react';
import { CardDefinition } from '../../types/card';
import { CivilizationIcon } from '../card/CivilizationIcon';
import { Plus, Minus, Trash2 } from 'lucide-react';

interface Props {
  card: CardDefinition;
  count: number;
  onIncrement: (card: CardDefinition) => void;
  onDecrement: (card: CardDefinition) => void;
  onRemoveAll: (card: CardDefinition) => void;
  onInspect: (card: CardDefinition) => void;
}

const CIV_BORDER: Record<string, string> = {
  Light: 'border-l-amber-400 bg-amber-950/15 hover:bg-amber-950/25 border-l-[3px]',
  Water: 'border-l-sky-400 bg-sky-950/15 hover:bg-sky-950/25 border-l-[3px]',
  Darkness: 'border-l-purple-500 bg-purple-950/15 hover:bg-purple-950/25 border-l-[3px]',
  Fire: 'border-l-red-500 bg-red-950/15 hover:bg-red-950/25 border-l-[3px]',
  Nature: 'border-l-emerald-500 bg-emerald-950/15 hover:bg-emerald-950/25 border-l-[3px]'
};

export const DeckCardItem: React.FC<Props> = ({
  card,
  count,
  onIncrement,
  onDecrement,
  onRemoveAll,
  onInspect
}) => {
  const primaryCiv = card.civilizations[0] || 'Fire';
  const borderClass = CIV_BORDER[primaryCiv] || CIV_BORDER.Fire;

  return (
    <div
      onClick={() => onInspect(card)}
      className={`group flex items-center justify-between py-1.5 px-2.5 rounded-lg border-y border-r border-slate-800/90 ${borderClass} transition-all cursor-pointer select-none hover:border-slate-700`}
    >
      {/* Left: Mana orb, Civ Icon, Name & Badges */}
      <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
        {/* Mana Cost Orb */}
        <div className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-950 border border-slate-700/80 font-cinzel font-bold text-[11px] text-amber-300 shrink-0 shadow-xs">
          {card.manaCost}
        </div>

        <CivilizationIcon civilization={primaryCiv} className="w-3.5 h-3.5 shrink-0" />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-cinzel text-xs font-semibold text-slate-100 truncate group-hover:text-amber-300 transition-colors">
              {card.name}
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
            <span>{card.type}</span>
            {card.power !== null && (
              <span className="text-amber-400/90 font-mono font-medium">{card.power}</span>
            )}
            {card.isShieldTrigger && (
              <span className="text-amber-400 font-bold uppercase text-[9px] bg-amber-950/60 border border-amber-500/40 px-1 rounded">
                ST
              </span>
            )}
            {card.isBlocker && (
              <span className="text-sky-400 font-bold uppercase text-[9px] bg-sky-950/60 border border-sky-500/40 px-1 rounded">
                Blocker
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Right: Quantity controls */}
      <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
        <span className="text-xs font-mono font-bold text-amber-300 px-1.5 py-0.5 rounded bg-slate-950/90 border border-slate-700/80 mr-0.5">
          x{count}
        </span>

        <button
          type="button"
          onClick={() => onDecrement(card)}
          className="p-1 rounded bg-slate-800/80 hover:bg-slate-700 hover:text-white text-slate-300 transition-colors cursor-pointer"
          title="Remove 1 copy"
        >
          <Minus className="w-3 h-3" />
        </button>

        <button
          type="button"
          onClick={() => onIncrement(card)}
          disabled={count >= 4}
          className="p-1 rounded bg-slate-800/80 hover:bg-amber-500 hover:text-slate-950 disabled:opacity-30 disabled:cursor-not-allowed text-slate-300 transition-colors cursor-pointer"
          title={count >= 4 ? 'Max 4 copies allowed' : 'Add 1 copy'}
        >
          <Plus className="w-3 h-3" />
        </button>

        <button
          type="button"
          onClick={() => onRemoveAll(card)}
          className="p-1 rounded hover:bg-red-950/60 text-slate-500 hover:text-red-400 transition-colors ml-0.5 cursor-pointer"
          title="Remove all copies from deck"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};
