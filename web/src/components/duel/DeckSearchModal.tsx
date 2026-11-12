import React, { useState } from 'react';
import { Search, X, ChevronRight, Eye } from 'lucide-react';
import type { CardDefinition } from '../../types/card';
import type { DeckSearchInteraction, CardInstance } from '../../engine/types';
import { CivilizationIcon } from '../card/CivilizationIcon';

export interface DeckSearchModalProps {
  isOpen: boolean;
  interaction: DeckSearchInteraction | null;
  deck: CardInstance[];
  onSelectCard: (cardInstanceId: string) => void;
  onSkip: () => void;
  onInspectCard?: (card: CardDefinition) => void;
  onHoverCard?: (card: CardDefinition | null) => void;
}

export const DeckSearchModal: React.FC<DeckSearchModalProps> = ({
  isOpen,
  interaction,
  deck,
  onSelectCard,
  onSkip,
  onInspectCard,
  onHoverCard
}) => {
  const [searchFilter, setSearchFilter] = useState('');

  if (!isOpen || !interaction) return null;

  const validIds = new Set(interaction.validCardInstanceIds);
  const matchingDeckCards = deck.filter((c) => validIds.has(c.instanceId));

  const filteredCards = matchingDeckCards.filter((c) => {
    if (!searchFilter.trim()) return true;
    const term = searchFilter.toLowerCase();
    return (
      c.card.name.toLowerCase().includes(term) ||
      (c.card.races && c.card.races.some((r) => r.toLowerCase().includes(term))) ||
      c.card.civilizations.some((civ) => civ.toLowerCase().includes(term))
    );
  });

  const destLabel =
    interaction.destination === 'manaZone'
      ? 'mana zone'
      : interaction.destination === 'battleZone'
      ? 'battle zone'
      : 'hand';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="deck-search-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-fade-in select-none"
    >
      <div className="relative w-full max-w-2xl max-h-[85vh] flex flex-col bg-slate-900 border border-amber-500/40 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 bg-gradient-to-r from-amber-950/30 via-slate-900 to-slate-900 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Search className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="deck-search-title" className="font-cinzel font-bold text-base text-amber-300 tracking-wide">
                  {interaction.sourceCardName}: Search Deck
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 font-semibold">
                  {matchingDeckCards.length} {interaction.filterDescription}(s) available
                </span>
              </div>
              <p className="text-xs text-slate-400 font-sans mt-0.5">
                Select 1 {interaction.filterDescription} to take into your <span className="text-amber-300 font-semibold capitalize">{destLabel}</span>. Deck will be shuffled.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onSkip}
            title="Skip without taking a card"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter Input */}
        {matchingDeckCards.length > 4 && (
          <div className="px-5 py-2.5 bg-slate-950/40 border-b border-slate-800/80 flex items-center gap-2">
            <Search className="w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder={`Filter matching ${interaction.filterDescription.toLowerCase()}s...`}
              className="w-full bg-transparent text-xs text-slate-200 placeholder:text-slate-500 outline-none font-sans"
            />
            {searchFilter && (
              <button
                type="button"
                onClick={() => setSearchFilter('')}
                className="text-[10px] text-slate-400 hover:text-slate-200 font-mono"
              >
                Clear
              </button>
            )}
          </div>
        )}

        {/* Scrollable Card Grid */}
        <div className="flex-1 overflow-y-auto p-5 space-y-2 [scrollbar-width:thin] max-h-[50vh]">
          {filteredCards.length === 0 ? (
            <div className="py-12 text-center text-slate-500 font-mono text-xs">
              No cards matching filter "{searchFilter}".
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredCards.map((instance) => {
                const card = instance.card;
                const imageSrc = card.imageAssetPath
                  ? `/${card.imageAssetPath}`
                  : card.imageUrl;

                return (
                  <div
                    key={instance.instanceId}
                    onMouseEnter={() => onHoverCard?.(card)}
                    onMouseLeave={() => onHoverCard?.(null)}
                    onClick={() => onSelectCard(instance.instanceId)}
                    className="group relative flex items-center gap-3 p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-amber-500/60 hover:bg-slate-800/60 transition-all cursor-pointer shadow-sm hover:shadow-md"
                  >
                    {/* Card Thumbnail */}
                    <div className="relative w-12 h-16 shrink-0 rounded-md overflow-hidden border border-slate-700/80 bg-slate-950 group-hover:scale-105 transition-transform">
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
                      <div className="absolute top-0.5 left-0.5 p-0.5 rounded bg-slate-950/85">
                        <CivilizationIcon civilization={card.civilizations[0]} className="w-2.5 h-2.5" />
                      </div>
                    </div>

                    {/* Card Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-cinzel font-bold text-xs text-slate-200 group-hover:text-amber-300 truncate transition-colors">
                          {card.name}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 mt-1 text-[10px] font-mono text-slate-400">
                        <span className="px-1.5 py-0.2 rounded bg-slate-800 text-amber-400 font-semibold">
                          Cost {card.manaCost}
                        </span>
                        {card.power !== null && card.power !== undefined && (
                          <span className="text-slate-300 font-bold">
                            {card.power} Power
                          </span>
                        )}
                        <span className="text-slate-400 truncate">
                          {card.races?.join('/') || card.type}
                        </span>
                      </div>

                      {card.rulesText && (
                        <p className="text-[10px] text-slate-400 line-clamp-1 mt-1 font-sans">
                          {card.rulesText}
                        </p>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {onInspectCard && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onInspectCard(card);
                          }}
                          title="Inspect card details"
                          className="p-1 rounded-lg text-slate-400 hover:text-amber-300 hover:bg-slate-800 transition-colors cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectCard(instance.instanceId);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-amber-500/20 group-hover:bg-amber-500 text-amber-300 group-hover:text-slate-950 font-cinzel font-bold text-[10px] tracking-wider transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <span>Choose</span>
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <span className="text-[11px] font-mono text-slate-500">
            Total cards in deck: {deck.length}
          </span>
          <button
            type="button"
            onClick={onSkip}
            className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-cinzel font-semibold text-xs tracking-wider transition-colors cursor-pointer border border-slate-700"
          >
            Skip (Take Nothing)
          </button>
        </div>
      </div>
    </div>
  );
};
