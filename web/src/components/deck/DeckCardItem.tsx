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
  Light: 'border-l-amber-400 bg-amber-950/20 hover:bg-amber-950/30',
  Water: 'border-l-sky-400 bg-sky-950/20 hover:bg-sky-950/30',
  Darkness: 'border-l-purple-500 bg-purple-950/20 hover:bg-purple-950/30',
  Fire: 'border-l-red-500 bg-red-950/20 hover:bg-red-950/30',
  Nature: 'border-l-emerald-500 bg-emerald-950/20 hover:bg-emerald-950/30'
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
      className={`group flex items-center justify-between p-2 rounded-lg border-l-4 border-y border-r border-slate-800 ${borderClass} transition-colors cursor-pointer select-none`}
    >
      {/* Left: Mana orb & Name */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <div className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-900 border border-slate-700 font-cinzel font-bold text-[11px] text-amber-300 shrink-0">
          {card.manaCost}
        </div>

        <CivilizationIcon civilization={primaryCiv} className="w-3.5 h-3.5 shrink-0" />

        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-slate-100 truncate group-hover:text-amber-300 transition-colors">
            {card.name}
          </p>
          <div className="flex items-center gap-2 text-[10px] text-slate-400">
            <span>{card.type}</span>
            {card.power !== null && (
              <span className="text-amber-400/90 font-mono">{card.power}</span>
            )}
            {card.isShieldTrigger && (
              <span className="text-amber-400 font-bold uppercase text-[9px]">ST</span>
            )}
          </div>
        </div>
      </div>

      {/* Right: Quantity controls */}
      <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
        <span className="text-xs font-mono font-bold text-amber-400 px-1.5 py-0.5 rounded bg-slate-900/90 border border-slate-700">
          x{count}
        </span>

        <button
          onClick={() => onDecrement(card)}
          className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
          title="Decrease"
        >
          <Minus className="w-3 h-3" />
        </button>

        <button
          onClick={() => onIncrement(card)}
          disabled={count >= 4}
          className="p-1 rounded bg-slate-800 hover:bg-amber-500 hover:text-slate-950 disabled:opacity-30 disabled:cursor-not-allowed text-slate-300 transition-colors"
          title={count >= 4 ? 'Max copies reached' : 'Increase'}
        >
          <Plus className="w-3 h-3" />
        </button>

        <button
          onClick={() => onRemoveAll(card)}
          className="p-1 rounded hover:bg-red-950/60 text-slate-500 hover:text-red-400 transition-colors ml-0.5"
          title="Remove from Deck"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};
