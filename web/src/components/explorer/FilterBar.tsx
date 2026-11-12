import React from 'react';
import { Civilization, CardType } from '../../types/card';
import { CardFilterOptions, SETS, ALL_RACES } from '../../data/cardLoader';
import { CivilizationIcon } from '../card/CivilizationIcon';
import { RaceFilterSelect } from './RaceFilterSelect';
import {
  Search,
  X,
  ChevronDown,
  Zap,
  Shield,
  RotateCcw,
  Sparkles,
  Users,
  BatteryCharging,
  Combine,
  Skull,
  Flame,
  Swords
} from 'lucide-react';

interface Props {
  filters: CardFilterOptions;
  onChange: (filters: CardFilterOptions) => void;
  onReset: () => void;
  totalMatches: number;
}

const CIVILIZATIONS: Civilization[] = ['Light', 'Water', 'Darkness', 'Fire', 'Nature'];

const CIV_BTN_COLORS: Record<Civilization, { active: string; inactive: string }> = {
  Light: {
    active: 'bg-amber-500 text-slate-950 font-bold border-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.35)]',
    inactive: 'border-slate-800 bg-slate-950/70 hover:border-amber-500/50 hover:bg-amber-950/20 text-slate-300'
  },
  Water: {
    active: 'bg-sky-500 text-slate-950 font-bold border-sky-400 shadow-[0_0_12px_rgba(14,165,233,0.35)]',
    inactive: 'border-slate-800 bg-slate-950/70 hover:border-sky-500/50 hover:bg-sky-950/20 text-slate-300'
  },
  Darkness: {
    active: 'bg-purple-600 text-white font-bold border-purple-400 shadow-[0_0_12px_rgba(168,85,247,0.35)]',
    inactive: 'border-slate-800 bg-slate-950/70 hover:border-purple-500/50 hover:bg-purple-950/20 text-slate-300'
  },
  Fire: {
    active: 'bg-red-600 text-white font-bold border-red-400 shadow-[0_0_12px_rgba(239,68,68,0.35)]',
    inactive: 'border-slate-800 bg-slate-950/70 hover:border-red-500/50 hover:bg-red-950/20 text-slate-300'
  },
  Nature: {
    active: 'bg-emerald-600 text-white font-bold border-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.35)]',
    inactive: 'border-slate-800 bg-slate-950/70 hover:border-emerald-500/50 hover:bg-emerald-950/20 text-slate-300'
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

  const isKeywordActive = (kw: string) => (filters.keywords || []).includes(kw);

  const toggleKeyword = (kw: string) => {
    const current = filters.keywords || [];
    const next = current.includes(kw)
      ? current.filter(k => k !== kw)
      : [...current, kw];
    onChange({
      ...filters,
      keywords: next.length > 0 ? next : undefined
    });
  };

  const toggleLegacyKeyword = (key: keyof CardFilterOptions) => {
    onChange({
      ...filters,
      [key]: !filters[key]
    });
  };

  const isFiltered =
    Boolean(filters.searchQuery) ||
    Boolean(filters.set && filters.set !== 'all') ||
    Boolean(filters.race && filters.race !== 'all') ||
    Boolean(filters.civilizations && filters.civilizations.length > 0) ||
    Boolean(filters.cardTypes && filters.cardTypes.length > 0) ||
    Boolean(filters.keywords && filters.keywords.length > 0) ||
    Boolean(filters.isShieldTrigger) ||
    Boolean(filters.isBlocker) ||
    Boolean(filters.isSlayer) ||
    Boolean(filters.isDoubleBreaker) ||
    Boolean(filters.isPowerAttacker);

  return (
    <div className="relative z-30 bg-slate-900/90 border border-slate-800/90 rounded-2xl p-4 shadow-xl backdrop-blur-md space-y-3.5">
      {/* Row 1: Search & Toolbar Controls */}
      <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
        {/* Search Input */}
        <div className="relative flex-1 max-w-lg">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={filters.searchQuery || ''}
            onChange={e => onChange({ ...filters, searchQuery: e.target.value })}
            placeholder="Search by name, race, or rules text..."
            className="w-full pl-9 pr-8 py-2 rounded-xl bg-slate-950/80 border border-slate-700/80 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400/90 focus:ring-1 focus:ring-amber-400/30 transition-all"
          />
          {filters.searchQuery && (
            <button
              onClick={() => onChange({ ...filters, searchQuery: '' })}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Dropdowns, Count Badge, & Reset Button */}
        <div className="flex flex-wrap lg:flex-nowrap items-center gap-2 shrink-0 relative z-40">
          {/* Integrated Count & Reset Badge */}
          <div className="flex items-center gap-1.5 h-9 px-3 rounded-xl bg-slate-950/80 border border-slate-800 font-mono text-xs text-slate-300">
            <span className="text-amber-400 font-bold">{totalMatches}</span>
            <span className="text-slate-500">cards</span>
            {isFiltered && (
              <>
                <span className="text-slate-700">|</span>
                <button
                  type="button"
                  onClick={onReset}
                  className="flex items-center gap-1 text-amber-400 hover:text-amber-300 transition-colors font-sans font-semibold cursor-pointer"
                  title="Reset all filters"
                >
                  <RotateCcw className="w-3 h-3" /> Reset
                </button>
              </>
            )}
          </div>

          {/* Set / Expansion Selector */}
          <div className="relative inline-flex items-center">
            <select
              value={filters.set || 'all'}
              onChange={e => onChange({ ...filters, set: e.target.value === 'all' ? undefined : e.target.value })}
              className={`h-9 pl-3 pr-8 text-xs bg-slate-950/90 border rounded-xl text-slate-200 focus:outline-none focus:border-amber-400/80 cursor-pointer hover:border-slate-600 transition-colors appearance-none font-medium ${
                filters.set && filters.set !== 'all' ? 'border-amber-500/60 text-amber-300 font-semibold' : 'border-slate-700/80'
              }`}
            >
              <option value="all">All Sets (900)</option>
              {SETS.map(s => (
                <option key={s.id} value={s.code}>
                  {s.code}: {s.name} ({s.cardCount})
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          </div>

          {/* Searchable Race Filter Dropdown with Text Input */}
          <RaceFilterSelect
            value={filters.race}
            races={ALL_RACES}
            onChange={race => onChange({ ...filters, race })}
          />

          {/* Sort Dropdown */}
          <div className="relative inline-flex items-center">
            <select
              value={filters.sortBy || 'id-asc'}
              onChange={e => onChange({ ...filters, sortBy: e.target.value as any })}
              className={`h-9 pl-3 pr-8 text-xs bg-slate-950/90 border rounded-xl text-slate-200 focus:outline-none focus:border-amber-400/80 cursor-pointer hover:border-slate-600 transition-colors appearance-none font-medium ${
                filters.sortBy && filters.sortBy !== 'id-asc' ? 'border-amber-500/60 text-amber-300 font-semibold' : 'border-slate-700/80'
              }`}
            >
              <option value="id-asc">Sort: ID (#1 to #110)</option>
              <option value="cost-asc">Sort: Cost (Low to High)</option>
              <option value="cost-desc">Sort: Cost (High to Low)</option>
              <option value="power-desc">Sort: Power (High to Low)</option>
              <option value="name-asc">Sort: Name (A to Z)</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Row 2: Civilizations, Card Types, and Mechanics */}
      <div className="flex flex-wrap items-center gap-2.5 pt-3 border-t border-slate-800/80">
        {/* Civilizations */}
        <div className="flex items-center gap-1.5">
          {CIVILIZATIONS.map(civ => {
            const isActive = (filters.civilizations || []).includes(civ);
            const style = CIV_BTN_COLORS[civ];
            return (
              <button
                key={civ}
                onClick={() => toggleCiv(civ)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium transition-all cursor-pointer ${
                  isActive ? style.active : style.inactive
                }`}
                title={`Filter by ${civ}`}
              >
                <CivilizationIcon civilization={civ} className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{civ}</span>
              </button>
            );
          })}
        </div>

        {/* Separator */}
        <div className="hidden sm:block h-5 w-px bg-slate-800/80" />

        {/* Card Types Toggle */}
        <div className="flex items-center gap-0.5 bg-slate-950/80 p-0.5 rounded-lg border border-slate-800">
          {(['All', 'Creature', 'Spell'] as const).map(type => {
            const current = (filters.cardTypes || [])[0];
            const isActive = (type === 'All' && !current) || current === type;
            return (
              <button
                key={type}
                onClick={() => setCardType(type)}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  isActive
                    ? 'bg-amber-500 text-slate-950 shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {type === 'All' ? 'All' : `${type}s`}
              </button>
            );
          })}
        </div>

        {/* Separator */}
        <div className="hidden md:block h-5 w-px bg-slate-800/80" />

        {/* Keywords & Mechanics */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => toggleKeyword('evolution')}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] border font-medium transition-all cursor-pointer ${
              isKeywordActive('evolution')
                ? 'bg-amber-500/20 border-amber-400 text-amber-300 font-bold shadow-xs'
                : 'bg-slate-950/60 border-slate-800/80 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3 h-3 text-amber-400" /> Evolution
          </button>

          <button
            type="button"
            onClick={() => toggleKeyword('survivor')}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] border font-medium transition-all cursor-pointer ${
              isKeywordActive('survivor')
                ? 'bg-teal-500/20 border-teal-400 text-teal-300 font-bold shadow-xs'
                : 'bg-slate-950/60 border-slate-800/80 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="w-3 h-3 text-teal-400" /> Survivor
          </button>

          <button
            type="button"
            onClick={() => toggleKeyword('charger')}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] border font-medium transition-all cursor-pointer ${
              isKeywordActive('charger')
                ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 font-bold shadow-xs'
                : 'bg-slate-950/60 border-slate-800/80 text-slate-400 hover:text-slate-200'
            }`}
          >
            <BatteryCharging className="w-3 h-3 text-cyan-400" /> Charger
          </button>

          <button
            type="button"
            onClick={() => toggleKeyword('multi-civ')}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] border font-medium transition-all cursor-pointer ${
              isKeywordActive('multi-civ')
                ? 'bg-gradient-to-r from-amber-500/20 to-sky-500/20 border-amber-400 text-amber-300 font-bold shadow-xs'
                : 'bg-slate-950/60 border-slate-800/80 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Combine className="w-3 h-3 text-amber-400" /> Multi-Civ
          </button>

          <button
            type="button"
            onClick={() => toggleLegacyKeyword('isShieldTrigger')}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] border font-medium transition-all cursor-pointer ${
              filters.isShieldTrigger
                ? 'bg-amber-500/20 border-amber-400 text-amber-300 font-bold shadow-xs'
                : 'bg-slate-950/60 border-slate-800/80 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Zap className="w-3 h-3 text-amber-400" /> Trigger
          </button>

          <button
            type="button"
            onClick={() => toggleLegacyKeyword('isBlocker')}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] border font-medium transition-all cursor-pointer ${
              filters.isBlocker
                ? 'bg-sky-500/20 border-sky-400 text-sky-300 font-bold shadow-xs'
                : 'bg-slate-950/60 border-slate-800/80 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Shield className="w-3 h-3 text-sky-400" /> Blocker
          </button>

          <button
            type="button"
            onClick={() => toggleLegacyKeyword('isSlayer')}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] border font-medium transition-all cursor-pointer ${
              filters.isSlayer
                ? 'bg-purple-500/20 border-purple-400 text-purple-300 font-bold shadow-xs'
                : 'bg-slate-950/60 border-slate-800/80 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Skull className="w-3 h-3 text-purple-400" /> Slayer
          </button>

          <button
            type="button"
            onClick={() => toggleLegacyKeyword('isDoubleBreaker')}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] border font-medium transition-all cursor-pointer ${
              filters.isDoubleBreaker
                ? 'bg-red-500/20 border-red-400 text-red-300 font-bold shadow-xs'
                : 'bg-slate-950/60 border-slate-800/80 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Swords className="w-3 h-3 text-red-400" /> 2x Breaker
          </button>

          <button
            type="button"
            onClick={() => toggleLegacyKeyword('isPowerAttacker')}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] border font-medium transition-all cursor-pointer ${
              filters.isPowerAttacker
                ? 'bg-orange-500/20 border-orange-400 text-orange-300 font-bold shadow-xs'
                : 'bg-slate-950/60 border-slate-800/80 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Flame className="w-3 h-3 text-orange-400" /> Power Attacker
          </button>
        </div>
      </div>
    </div>
  );
};
