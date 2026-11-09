import React, { useState } from 'react';
import { CardDefinition, Deck, DeckItem } from '../../types/card';
import { DeckCardItem } from './DeckCardItem';
import { ManaCurve } from './ManaCurve';
import { CivBreakdown } from './CivBreakdown';
import { TestDrawModal } from './TestDrawModal';
import { PRESET_DECKS } from '../../data/presets';
import { Play, RotateCcw, Download, Sparkles, CheckCircle2, AlertTriangle, Layers, Save, Trash2 } from 'lucide-react';

interface Props {
  items: DeckItem[];
  deckId: string;
  deckName: string;
  totalCards: number;
  deckStatus: 'building' | 'legal' | 'over';
  savedDecks: Deck[];
  onIncrement: (card: CardDefinition) => void;
  onDecrement: (card: CardDefinition) => void;
  onRemoveAll: (card: CardDefinition) => void;
  onClear: () => void;
  onCreateBlank: () => void;
  onLoadDeck: (deckId: string) => void;
  onDeleteDeck: (deckId: string) => void;
  onSaveClick: () => void;
  onRename: (name: string) => void;
  onInspect: (card: CardDefinition) => void;
  onExportText: () => void;
}

export const DeckPanel: React.FC<Props> = ({
  items,
  deckId,
  deckName,
  totalCards,
  deckStatus,
  savedDecks,
  onIncrement,
  onDecrement,
  onRemoveAll,
  onClear,
  onCreateBlank,
  onLoadDeck,
  onDeleteDeck,
  onSaveClick,
  onRename,
  onInspect,
  onExportText
}) => {
  const [isTestDrawOpen, setIsTestDrawOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'cards' | 'stats'>('cards');

  const isSaved = savedDecks.some(d => d.id === deckId);
  const isPreset = PRESET_DECKS.some(p => p.id === deckId);

  return (
    <div className="flex flex-col h-full bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl overflow-hidden backdrop-blur-md">
      {/* Top Deck Header */}
      <div className="p-4 border-b border-slate-800 bg-slate-950/40">
        <div className="flex items-center justify-between gap-2 mb-2">
          <input
            type="text"
            value={deckName}
            onChange={e => onRename(e.target.value)}
            className="flex-1 min-w-0 bg-transparent font-cinzel font-bold text-lg text-white border-b border-transparent hover:border-slate-700 focus:border-amber-400 focus:outline-none transition-colors px-1"
            placeholder="Deck Name..."
          />

          {/* Grouped Deck Selector & Delete Action */}
          <div className="flex items-center gap-1.5 shrink-0">
            <select
              value={deckId}
              onChange={e => {
                const val = e.target.value;
                if (val === '__NEW__') {
                  onCreateBlank();
                } else if (val) {
                  onLoadDeck(val);
                }
              }}
              className="text-xs bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-slate-300 hover:text-white cursor-pointer focus:outline-none max-w-[170px] truncate"
            >
              <option value="__NEW__">+ New Blank Deck</option>
              {!isSaved && !isPreset && (
                <option value={deckId}>
                  {deckName || 'Untitled Deck'} (Unsaved)
                </option>
              )}
              <optgroup label={`My Saved Decks (${savedDecks.length})`}>
                {savedDecks.map(d => {
                  const count = d.items.reduce((sum, item) => sum + item.count, 0);
                  return (
                    <option key={d.id} value={d.id}>
                      {d.name} ({count} cards)
                    </option>
                  );
                })}
              </optgroup>
              <optgroup label="Starter Presets">
                {PRESET_DECKS.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
            </select>

            {isSaved && (
              <button
                type="button"
                onClick={() => onDeleteDeck(deckId)}
                title="Delete this saved deck"
                className="p-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-red-400 hover:border-red-500/50 transition-colors cursor-pointer"
                aria-label="Delete saved deck"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Deck Count & Legal Status Pill */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-cinzel font-extrabold text-amber-400">
              {totalCards}
            </span>
            <span className="text-xs text-slate-400 font-medium">/ 40 Cards</span>
          </div>

          <div className="flex items-center gap-1.5">
            {deckStatus === 'legal' ? (
              <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-500/50 px-2 py-0.5 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.3)]">
                <CheckCircle2 className="w-3.5 h-3.5" /> Tournament Legal
              </span>
            ) : deckStatus === 'over' ? (
              <span className="flex items-center gap-1 text-[11px] font-bold text-red-400 bg-red-950/60 border border-red-500/50 px-2 py-0.5 rounded-full">
                <AlertTriangle className="w-3.5 h-3.5" /> Exceeds 40
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-300/80 bg-amber-950/40 border border-amber-500/30 px-2 py-0.5 rounded-full">
                Building ({40 - totalCards} needed)
              </span>
            )}
          </div>
        </div>

        {/* Action Buttons: Save Deck & Secondary Actions */}
        <div className="space-y-2 mt-3">
          <button
            type="button"
            onClick={onSaveClick}
            disabled={totalCards !== 40}
            title={
              totalCards === 40
                ? 'Save custom deck'
                : `Requires exactly 40 cards to save (current: ${totalCards}/40)`
            }
            className={`w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg font-bold text-xs transition-all ${
              totalCards === 40
                ? 'bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 shadow-md shadow-amber-500/25 ring-1 ring-amber-400 cursor-pointer'
                : 'bg-slate-800 text-slate-400 opacity-40 cursor-not-allowed'
            }`}
          >
            <Save className="w-3.5 h-3.5" /> Save Deck
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setIsTestDrawOpen(true)}
              disabled={totalCards === 0}
              className="flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold text-slate-200 transition-colors"
            >
              <Play className="w-3.5 h-3.5 fill-current" /> Test Opening Hand
            </button>

            <button
              type="button"
              onClick={onExportText}
              disabled={totalCards === 0}
              className="flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold text-slate-200 transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> Export Deck
            </button>
          </div>
        </div>
      </div>

      {/* Tabs: Cards List vs Stats */}
      <div className="flex border-b border-slate-800 bg-slate-950/60 px-3">
        <button
          onClick={() => setActiveTab('cards')}
          className={`flex items-center gap-1.5 py-2 px-3 text-xs font-bold border-b-2 transition-colors ${
            activeTab === 'cards'
              ? 'border-amber-400 text-amber-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Layers className="w-3.5 h-3.5" /> Cards ({items.length} unique)
        </button>

        <button
          onClick={() => setActiveTab('stats')}
          className={`flex items-center gap-1.5 py-2 px-3 text-xs font-bold border-b-2 transition-colors ${
            activeTab === 'stats'
              ? 'border-amber-400 text-amber-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" /> Stats & Curve
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {activeTab === 'cards' ? (
          items.length > 0 ? (
            items.map(({ card, count }) => (
              <DeckCardItem
                key={card.id}
                card={card}
                count={count}
                onIncrement={onIncrement}
                onDecrement={onDecrement}
                onRemoveAll={onRemoveAll}
                onInspect={onInspect}
              />
            ))
          ) : (
            <div className="flex flex-col items-center justify-center h-48 text-center p-4">
              <Layers className="w-8 h-8 text-slate-600 mb-2" />
              <p className="text-sm font-semibold text-slate-400">Your deck is empty</p>
              <p className="text-xs text-slate-500 mt-1 max-w-[200px]">
                Browse the catalog and click "+ Add" on cards, or select a preset deck above.
              </p>
            </div>
          )
        ) : (
          <div className="space-y-3">
            <ManaCurve items={items} />
            <CivBreakdown items={items} />
          </div>
        )}
      </div>

      {/* Footer Clear Control */}
      {items.length > 0 && (
        <div className="p-2 border-t border-slate-800 bg-slate-950/40 flex justify-end">
          <button
            onClick={onClear}
            className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-red-400 transition-colors px-2 py-1"
          >
            <RotateCcw className="w-3 h-3" /> Clear Deck
          </button>
        </div>
      )}

      {/* Test Draw Simulator Modal */}
      <TestDrawModal
        items={items}
        isOpen={isTestDrawOpen}
        onClose={() => setIsTestDrawOpen(false)}
      />
    </div>
  );
};
