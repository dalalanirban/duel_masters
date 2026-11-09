import React from 'react';
import { DeckItem } from '../../types/card';

interface Props {
  items: DeckItem[];
}

export const ManaCurve: React.FC<Props> = ({ items }) => {
  const curve: { [cost: number]: number } = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0 };
  let totalCards = 0;
  let totalCost = 0;

  items.forEach(({ card, count }) => {
    const costKey = Math.min(card.manaCost, 8);
    curve[costKey] = (curve[costKey] || 0) + count;
    totalCards += count;
    totalCost += card.manaCost * count;
  });

  const maxCount = Math.max(...Object.values(curve), 1);
  const avgCost = totalCards > 0 ? (totalCost / totalCards).toFixed(1) : '0.0';

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
          Mana Curve
        </span>
        <span className="text-xs text-amber-400 font-semibold">
          Avg Cost: {avgCost}
        </span>
      </div>

      <div className="grid grid-cols-8 gap-1.5 items-end h-20 pt-2 border-b border-slate-800">
        {[1, 2, 3, 4, 5, 6, 7, 8].map(cost => {
          const count = curve[cost] || 0;
          const heightPercent = totalCards > 0 ? (count / maxCount) * 100 : 0;

          return (
            <div key={cost} className="flex flex-col items-center justify-end h-full group">
              <span className={`text-[10px] font-bold mb-1 transition-opacity ${count > 0 ? 'text-amber-300' : 'text-slate-600'}`}>
                {count > 0 ? count : ''}
              </span>
              <div className="w-full bg-slate-800 rounded-t overflow-hidden flex items-end h-12">
                <div
                  style={{ height: `${heightPercent}%` }}
                  className="w-full bg-gradient-to-t from-amber-600 to-yellow-400 rounded-t transition-all duration-300 group-hover:brightness-125"
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-8 gap-1.5 text-center mt-1">
        {[1, 2, 3, 4, 5, 6, 7, '8+'].map(c => (
          <span key={String(c)} className="text-[10px] font-mono text-slate-400">
            {c}
          </span>
        ))}
      </div>
    </div>
  );
};
