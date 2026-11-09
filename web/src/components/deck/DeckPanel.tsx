import React, { useState } from 'react';
import { CardDefinition, DeckItem } from '../../types/card';
import { DeckCardItem } from './DeckCardItem';
import { ManaCurve } from './ManaCurve';
import { CivBreakdown } from './CivBreakdown';
import { TestDrawModal } from './TestDrawModal';
import { PRESET_DECKS } from '../../data/presets';
import { Play, RotateCcw, Download, Sparkles, CheckCircle2, AlertTriangle, Layers } from 'lucide-react';

interface Props {
  items: DeckItem[];
  deckName: string;
  totalCards: number;
  deckStatus: 'building' | 'legal' | 'over';
  onIncrement: (card: CardDefinition) => void;
  onDecrement: (card: CardDefinition) => void;
  onRemoveAll: (card: CardDefinition) => void;
  onClear: () => void;
  onLoadPreset: (presetId: string) => void;
  onRename: (name: string) => void;
  onInspect: (card: CardDefinition) => void;
  onExportText: () => void;
}

export const DeckPanel: React.FC<Props> = ({
  items,
  deckName,
  totalCards,
  deckStatus,
  onIncrement,
  onDecrement,
  onRemoveAll,
  onClear,
  onLoadPreset,
  onRename,
  onInspect,
  onExportText
}) => {
  const [isTestDrawOpen, setIsTestDrawOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'cards' | 'stats'>('cards');

  return (
    <div className="flex flex-col h-full bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl overflow-hidden backdrop-blur-md">
      {/* Top Deck Header */}
      <div className="p-4 border-b border-slate-800 bg-slate-950/40">
        <div className="flex items-center justify-between gap-2 mb-2">
          <input
            type="text"
            value={deckName}
            onChange={e => onRename(e.target.value)}
            className="flex-1 bg-transparent font-cinzel font-bold text-lg text-white border-b border-transparent hover:border-slate-700 focus:border-amber-400 focus:outline-none transition-colors px-1"
            placeholder="Deck Name..."
          />

          {/* Preset Selector */}
          <select
            onChange={e => {
              if (e.target.value) onLoadPreset(e.target.value);
            }}
            defaultValue=""
            className="text-xs bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-slate-300 hover:text-white cursor-pointer focus:outline-none"
          >
            <option value="" disabled>Load Preset Deck...</option>
            {PRESET_DECKS.map(p => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
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

        {/* Action Buttons: Test Draw & Export */}
        <div className="grid grid-cols-2 gap-2 mt-3">
          <button
            onClick={() => setIsTestDrawOpen(true)}
            disabled={totalCards === 0}
            className="flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 disabled:opacity-40 disabled:cursor-not-allowed font-bold text-xs text-slate-950 shadow-md shadow-amber-500/20 transition-all"
          >
            <Play className="w-3.5 h-3.5 fill-current" /> Test Opening Hand
          </button>

          <button
            onClick={onExportText}
            disabled={totalCards === 0}
            className="flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-semibold text-slate-200 transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Export Deck
          </button>
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
