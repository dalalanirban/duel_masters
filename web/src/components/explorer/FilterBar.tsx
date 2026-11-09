import React from 'react';
import { Civilization, CardType } from '../../types/card';
import { CardFilterOptions } from '../../data/cardLoader';
import { CivilizationIcon } from '../card/CivilizationIcon';
import { Search, X, Zap, Shield, Swords, RotateCcw } from 'lucide-react';

interface Props {
  filters: CardFilterOptions;
  onChange: (filters: CardFilterOptions) => void;
  onReset: () => void;
  totalMatches: number;
}

const CIVILIZATIONS: Civilization[] = ['Light', 'Water', 'Darkness', 'Fire', 'Nature'];

const CIV_BTN_COLORS: Record<Civilization, { active: string; border: string }> = {
  Light: {
    active: 'bg-amber-500 text-slate-950 font-bold border-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.4)]',
    border: 'border-amber-500/40 hover:bg-amber-950/30 text-amber-200'
  },
  Water: {
    active: 'bg-sky-500 text-slate-950 font-bold border-sky-400 shadow-[0_0_10px_rgba(14,165,233,0.4)]',
    border: 'border-sky-500/40 hover:bg-sky-950/30 text-sky-200'
  },
  Darkness: {
    active: 'bg-purple-600 text-white font-bold border-purple-400 shadow-[0_0_10px_rgba(168,85,247,0.4)]',
    border: 'border-purple-500/40 hover:bg-purple-950/30 text-purple-200'
  },
  Fire: {
    active: 'bg-red-600 text-white font-bold border-red-400 shadow-[0_0_10px_rgba(239,68,68,0.4)]',
    border: 'border-red-500/40 hover:bg-red-950/30 text-red-200'
  },
  Nature: {
    active: 'bg-emerald-600 text-white font-bold border-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.4)]',
    border: 'border-emerald-500/40 hover:bg-emerald-950/30 text-emerald-200'
  }
};

export const FilterBar: React.FC<Props> = ({
  filters,
  onChange,
  onReset,
  totalMatches
}) => {
  const toggleCiv = (civ: Civilization) => {
    const current = filters.civilizations || [];
    const next = current.includes(civ)
      ? current.filter(c => c !== civ)
      : [...current, civ];
    onChange({ ...filters, civilizations: next });
  };

  const setCardType = (type: CardType | 'All') => {
    onChange({
      ...filters,
      cardTypes: type === 'All' ? undefined : [type]
    });
  };

  const toggleKeyword = (key: keyof CardFilterOptions) => {
    onChange({
      ...filters,
      [key]: !filters[key]
    });
  };

  const isFiltered =
    Boolean(filters.searchQuery) ||
    Boolean(filters.civilizations && filters.civilizations.length > 0) ||
    Boolean(filters.cardTypes && filters.cardTypes.length > 0) ||
    Boolean(filters.isShieldTrigger) ||
    Boolean(filters.isBlocker) ||
    Boolean(filters.isSlayer) ||
    Boolean(filters.isDoubleBreaker) ||
    Boolean(filters.isPowerAttacker);

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl backdrop-blur-md space-y-4">
      {/* Row 1: Search & Sort */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        {/* Search Bar */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={filters.searchQuery || ''}
            onChange={e => onChange({ ...filters, searchQuery: e.target.value })}
            placeholder="Search by name, race (e.g. Dragon, Angel Command), or rules text..."
            className="w-full pl-9 pr-8 py-2 rounded-xl bg-slate-950 border border-slate-700/80 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400 transition-colors"
          />
          {filters.searchQuery && (
            <button
              onClick={() => onChange({ ...filters, searchQuery: '' })}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-slate-800 text-slate-400"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Sort Dropdown & Matches count */}
        <div className="flex items-center gap-3">
          <div className="text-xs text-slate-400 whitespace-nowrap">
            Showing <strong className="text-amber-400 font-bold">{totalMatches}</strong> cards
          </div>

          <select
            value={filters.sortBy || 'id-asc'}
            onChange={e => onChange({ ...filters, sortBy: e.target.value as any })}
            className="text-xs bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-amber-400 cursor-pointer"
          >
            <option value="id-asc">Sort: Collector ID (#1 to #110)</option>
            <option value="cost-asc">Sort: Mana Cost (Low to High)</option>
            <option value="cost-desc">Sort: Mana Cost (High to Low)</option>
            <option value="power-desc">Sort: Power (High to Low)</option>
            <option value="name-asc">Sort: Name (A to Z)</option>
          </select>

          {isFiltered && (
            <button
              onClick={onReset}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 transition-colors whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset
            </button>
          )}
        </div>
      </div>

      {/* Row 2: Civilization Filter Buttons */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-400 mr-1">
          Civilizations:
        </span>
        {CIVILIZATIONS.map(civ => {
          const isActive = (filters.civilizations || []).includes(civ);
          const style = CIV_BTN_COLORS[civ];
          return (
            <button
              key={civ}
              onClick={() => toggleCiv(civ)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all ${
                isActive ? style.active : `bg-slate-950/60 ${style.border}`
              }`}
            >
              <CivilizationIcon civilization={civ} className="w-3.5 h-3.5" />
              <span>{civ}</span>
            </button>
          );
        })}
      </div>

      {/* Row 3: Card Type & Keywords */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/80">
        {/* Card Types */}
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
          {(['All', 'Creature', 'Spell'] as const).map(type => {
            const current = (filters.cardTypes || [])[0];
            const isActive = (type === 'All' && !current) || current === type;
            return (
              <button
                key={type}
                onClick={() => setCardType(type)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                  isActive
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {type === 'All' ? 'All Types' : `${type}s`}
              </button>
            );
          })}
        </div>

        {/* Combat Keyword Badges */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => toggleKeyword('isShieldTrigger')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border font-medium transition-all ${
              filters.isShieldTrigger
                ? 'bg-amber-500/20 border-amber-400 text-amber-300 font-bold shadow-sm'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Zap className="w-3 h-3 text-amber-400" /> Shield Trigger
          </button>

          <button
            onClick={() => toggleKeyword('isBlocker')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border font-medium transition-all ${
              filters.isBlocker
                ? 'bg-sky-500/20 border-sky-400 text-sky-300 font-bold shadow-sm'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Shield className="w-3 h-3 text-sky-400" /> Blocker
          </button>

          <button
            onClick={() => toggleKeyword('isSlayer')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border font-medium transition-all ${
              filters.isSlayer
                ? 'bg-purple-500/20 border-purple-400 text-purple-300 font-bold shadow-sm'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>☠</span> Slayer
          </button>

          <button
            onClick={() => toggleKeyword('isDoubleBreaker')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border font-medium transition-all ${
              filters.isDoubleBreaker
                ? 'bg-red-500/20 border-red-400 text-red-300 font-bold shadow-sm'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Swords className="w-3 h-3 text-red-400" /> 2x Breaker
          </button>

          <button
            onClick={() => toggleKeyword('isPowerAttacker')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border font-medium transition-all ${
              filters.isPowerAttacker
                ? 'bg-orange-500/20 border-orange-400 text-orange-300 font-bold shadow-sm'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>⚡</span> Power Attacker
          </button>
        </div>
      </div>
    </div>
  );
};
