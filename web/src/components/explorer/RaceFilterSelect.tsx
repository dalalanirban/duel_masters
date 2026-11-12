import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ChevronDown, Check, X } from 'lucide-react';

interface Props {
  value?: string;
  races: string[];
  onChange: (race: string | undefined) => void;
}

export const RaceFilterSelect: React.FC<Props> = ({
  value,
  races,
  onChange
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedRace = value && value !== 'all' ? value : undefined;

  // Filter races based on search query
  const filteredRaces = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return races;
    return races.filter(r => r.toLowerCase().includes(q));
  }, [races, searchQuery]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
      // Auto-focus the search input on open
      setTimeout(() => inputRef.current?.focus(), 50);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleSelect = (race: string | undefined) => {
    onChange(race);
    setIsOpen(false);
    setSearchQuery('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(undefined);
  };

  return (
    <div ref={containerRef} className={`relative inline-block text-left ${isOpen ? 'z-50' : 'z-20'}`}>
      {/* Trigger Button - Exactly matches Set and Sort dropdown styles */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`h-9 pl-3 ${selectedRace ? 'pr-12' : 'pr-8'} text-xs bg-slate-950/90 border rounded-xl text-slate-200 hover:border-slate-600 focus:outline-none transition-colors relative flex items-center justify-between cursor-pointer font-medium min-w-[150px] max-w-[210px] ${
          selectedRace
            ? 'border-amber-500/60 text-amber-300 font-semibold'
            : isOpen
              ? 'border-amber-400/80 ring-1 ring-amber-400/30'
              : 'border-slate-700/80'
        }`}
        title={selectedRace ? `Filter: ${selectedRace}` : 'Filter cards by race'}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="truncate pr-0.5">
          {selectedRace ? selectedRace : `All Races (${races.length})`}
        </span>

        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-auto">
          {selectedRace && (
            <span
              onClick={handleClear}
              className="p-0.5 rounded-full hover:bg-slate-800 text-slate-400 hover:text-amber-300 transition-colors cursor-pointer"
              title="Clear race filter"
            >
              <X className="w-3.5 h-3.5" />
            </span>
          )}
          <ChevronDown
            className={`w-3.5 h-3.5 text-slate-400 pointer-events-none transition-transform duration-200 ${
              isOpen ? 'rotate-180 text-amber-400' : ''
            }`}
          />
        </div>
      </button>

      {/* Searchable Dropdown Popover */}
      {isOpen && (
        <div className="absolute left-0 top-full mt-1.5 w-64 bg-slate-950 border border-slate-700 rounded-xl shadow-[0_20px_40px_rgba(0,0,0,0.85)] z-50 overflow-hidden ring-1 ring-amber-500/20 backdrop-blur-md animate-fade-in">
          {/* Search Input Box */}
          <div className="p-2 border-b border-slate-800/80 bg-slate-900/60">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search 60+ races..."
                className="w-full pl-8 pr-7 py-1.5 rounded-lg bg-slate-950 border border-slate-700/80 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400/80 transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Races Options List */}
          <div
            role="listbox"
            className="max-h-60 overflow-y-auto p-1.5 space-y-0.5 scrollbar-thin scrollbar-thumb-slate-700"
          >
            {/* "All Races" option */}
            {(!searchQuery || 'all races'.includes(searchQuery.toLowerCase())) && (
              <button
                type="button"
                onClick={() => handleSelect(undefined)}
                className={`w-full px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition-colors text-left cursor-pointer ${
                  !selectedRace
                    ? 'bg-amber-500/15 text-amber-300 font-bold border border-amber-500/30'
                    : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                }`}
              >
                <span>All Races ({races.length})</span>
                {!selectedRace && <Check className="w-3.5 h-3.5 text-amber-400" />}
              </button>
            )}

            {/* Filtered Races */}
            {filteredRaces.length > 0 ? (
              filteredRaces.map(race => {
                const isSelected = selectedRace?.toLowerCase() === race.toLowerCase();
                return (
                  <button
                    key={race}
                    type="button"
                    onClick={() => handleSelect(race)}
                    className={`w-full px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition-colors text-left cursor-pointer ${
                      isSelected
                        ? 'bg-amber-500/15 text-amber-300 font-bold border border-amber-500/30'
                        : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                    }`}
                  >
                    <span className="truncate">{race}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-amber-400 shrink-0 ml-1" />}
                  </button>
                );
              })
            ) : (
              <div className="py-4 text-center text-xs text-slate-500">
                No races matching "<span className="text-slate-400">{searchQuery}</span>"
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
