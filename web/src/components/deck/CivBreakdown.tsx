import React from 'react';
import { DeckItem, Civilization } from '../../types/card';
import { CivilizationIcon } from '../card/CivilizationIcon';
import { AlertCircle, Zap } from 'lucide-react';

interface Props {
  items: DeckItem[];
}

const CIV_COLORS: Record<Civilization, { bar: string; text: string }> = {
  Light: { bar: 'bg-amber-400', text: 'text-amber-400' },
  Water: { bar: 'bg-sky-400', text: 'text-sky-400' },
  Darkness: { bar: 'bg-purple-400', text: 'text-purple-400' },
  Fire: { bar: 'bg-red-500', text: 'text-red-400' },
  Nature: { bar: 'bg-emerald-400', text: 'text-emerald-400' }
};

export const CivBreakdown: React.FC<Props> = ({ items }) => {
  const civCounts: Record<Civilization, number> = {
    Light: 0,
    Water: 0,
    Darkness: 0,
    Fire: 0,
    Nature: 0
  };

  let totalCards = 0;
  let triggerCount = 0;

  items.forEach(({ card, count }) => {
    card.civilizations.forEach(civ => {
      civCounts[civ] = (civCounts[civ] || 0) + count;
    });
    totalCards += count;
    if (card.isShieldTrigger) {
      triggerCount += count;
    }
  });

  const activeCivs = (Object.keys(civCounts) as Civilization[]).filter(c => civCounts[c] > 0);

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 space-y-3">
      {/* Civilization Ratio Bar */}
      <div>
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="font-bold uppercase tracking-wider text-slate-400">Civilizations</span>
          <span className="text-slate-400">{activeCivs.length} elements</span>
        </div>

        {totalCards > 0 ? (
          <div className="flex h-3 w-full rounded-full overflow-hidden bg-slate-800">
            {activeCivs.map(civ => {
              const count = civCounts[civ];
              const pct = (count / totalCards) * 100;
              return (
                <div
                  key={civ}
                  style={{ width: `${pct}%` }}
                  className={`${CIV_COLORS[civ].bar} transition-all duration-300`}
                  title={`${civ}: ${count} cards (${pct.toFixed(0)}%)`}
                />
              );
            })}
          </div>
        ) : (
          <div className="h-3 w-full rounded-full bg-slate-800" />
        )}

        {/* Civ Badges List */}
        <div className="flex flex-wrap gap-2 mt-2">
          {activeCivs.map(civ => {
            const count = civCounts[civ];
            const pct = totalCards > 0 ? ((count / totalCards) * 100).toFixed(0) : '0';
            return (
              <div key={civ} className="flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-slate-800 border border-slate-700/60">
                <CivilizationIcon civilization={civ} className="w-3.5 h-3.5" />
                <span className={`font-semibold ${CIV_COLORS[civ].text}`}>{count}</span>
                <span className="text-[10px] text-slate-400">({pct}%)</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Warning if any Civ has < 6 cards (hard to pay mana costs) */}
      {activeCivs.some(c => civCounts[c] > 0 && civCounts[c] < 6) && (
        <div className="flex items-start gap-1.5 p-2 rounded-lg bg-amber-950/40 border border-amber-600/40 text-[11px] text-amber-200">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <span>
            Warning: Civilizations with fewer than 6 cards can cause mana inconsistency in duels.
          </span>
        </div>
      )}

      {/* Shield Trigger Count */}
      <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/80 border border-slate-800">
        <div className="flex items-center gap-1.5">
          <Zap className="w-4 h-4 text-amber-400 fill-amber-400/20" />
          <span className="text-xs font-semibold text-slate-300">Shield Triggers</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-bold text-amber-400">{triggerCount}</span>
          <span className="text-[10px] text-slate-400">
            {triggerCount >= 4 && triggerCount <= 8
              ? '✓ Optimal (4–8)'
              : triggerCount < 4
              ? 'Low defense'
              : 'Heavy defense'}
          </span>
        </div>
      </div>
    </div>
  );
};
