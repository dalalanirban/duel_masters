import React, { useState, useMemo } from 'react';
import { CardDefinition } from './types/card';
import { filterCards, CardFilterOptions } from './data/cardLoader';
import { useDeckBuilder } from './hooks/useDeckBuilder';
import { FilterBar } from './components/explorer/FilterBar';
import { CardGrid } from './components/explorer/CardGrid';
import { DeckPanel } from './components/deck/DeckPanel';
import { CardModal } from './components/card/CardModal';
import { SaveDeckModal } from './components/deck/SaveDeckModal';
import { DuelArena } from './components/duel/DuelArena';
import { Swords, Check, ExternalLink, Layers } from 'lucide-react';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'explorer' | 'duel'>('explorer');
  const [filters, setFilters] = useState<CardFilterOptions>({
    sortBy: 'id-asc'
  });
  const [inspectedCard, setInspectedCard] = useState<CardDefinition | null>(null);
  const [notification, setNotification] = useState<string | null>(null);

  const {
    activeDeck,
    savedDecks,
    totalCards,
    deckStatus,
    isSaveModalOpen,
    setIsSaveModalOpen,
    addCard,
    removeCard,
    removeAllOfCard,
    clearDeck,
    createBlankDeck,
    loadDeck,
    saveDeck,
    deleteDeck,
    setDeckName,
    getCardCountInDeck,
    exportAsText
  } = useDeckBuilder();

  // Filter cards based on user selection
  const displayedCards = useMemo(() => {
    return filterCards(filters);
  }, [filters]);

  const resetFilters = () => {
    setFilters({ sortBy: 'id-asc' });
  };

  const showNotification = (message: string) => {
    setNotification(message);
    setTimeout(() => setNotification(null), 3000);
  };

  const handleExportText = () => {
    const text = exportAsText();
    navigator.clipboard.writeText(text);
    showNotification('Decklist copied to clipboard!');
  };

  return (
    <div className={`${activeTab === 'duel' ? 'h-screen overflow-hidden' : 'min-h-screen'} bg-slate-950 text-slate-100 flex flex-col`}>
      {/* Top Navigation Bar */}
      <header
        className={`sticky top-0 z-30 bg-slate-950/85 backdrop-blur-md border-b border-slate-800/80 ${
          activeTab === 'duel' ? 'h-12 shrink-0 py-1 px-3 md:px-4' : 'px-4 md:px-8 py-3'
        }`}
      >
        <div className="max-w-[1700px] mx-auto flex items-center justify-between h-full">
          {/* Logo & Branding */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div
              className={`flex items-center justify-center ${
                activeTab === 'duel' ? 'w-7 h-7 rounded-lg text-base' : 'w-10 h-10 rounded-xl text-xl'
              } bg-gradient-to-br from-amber-500 to-yellow-600 text-slate-950 shadow-lg shadow-amber-500/20 font-black shrink-0`}
            >
              <Swords className={activeTab === 'duel' ? 'w-4 h-4 fill-current' : 'w-5 h-5 fill-current'} />
            </div>
            <div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <h1
                  className={`font-cinzel font-extrabold ${
                    activeTab === 'duel' ? 'text-sm md:text-base' : 'text-xl md:text-2xl'
                  } tracking-wider text-white`}
                >
                  DUEL MASTERS
                </h1>
                <span className="text-[10px] uppercase font-bold px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 hidden xs:inline">
                  DM-01 Base Set
                </span>
              </div>
              {activeTab !== 'duel' && (
                <p className="text-[11px] text-slate-400">
                  Interactive Card Database & 40-Card Deck Builder (120 Cards)
                </p>
              )}
            </div>
          </div>

          {/* Top Navigation Tabs */}
          <nav className="flex items-center gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded-2xl shadow-inner">
            <button
              type="button"
              onClick={() => setActiveTab('explorer')}
              className={`flex items-center gap-2 px-3 py-1 sm:px-3.5 sm:py-1.5 rounded-xl font-cinzel font-bold text-xs transition-all ${
                activeTab === 'explorer'
                  ? 'bg-gradient-to-r from-amber-500 to-yellow-600 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Card Explorer & Deck Builder</span>
              <span className="sm:hidden">Explorer</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('duel')}
              className={`flex items-center gap-2 px-3 py-1 sm:px-3.5 sm:py-1.5 rounded-xl font-cinzel font-bold text-xs transition-all relative ${
                activeTab === 'duel'
                  ? 'bg-gradient-to-r from-amber-500 to-yellow-600 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Swords className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Duel Battle Arena</span>
              <span className="sm:hidden">Battle Arena</span>
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
              </span>
            </button>
          </nav>

          {/* Quick Stats Pill */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-xl bg-slate-900 border border-slate-800 text-xs">
              <span className="text-slate-400">Active Deck:</span>
              <span className="font-cinzel font-bold text-amber-400 truncate max-w-[160px]">
                {activeDeck.name}
              </span>
              <span className="font-mono text-xs px-1.5 py-0.2 rounded bg-slate-800 text-slate-200">
                {totalCards}/40
              </span>
            </div>

            <a
              href="https://github.com/dalalanirban/duel_masters"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-xs px-3 py-1 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition-colors"
            >
              <span>GitHub</span>
              <ExternalLink className="w-3 h-3 text-slate-500" />
            </a>
          </div>
        </div>
      </header>

      {/* Main App Body */}
      <main
        className={
          activeTab === 'duel'
            ? 'flex-1 h-[calc(100vh-3rem)] overflow-hidden p-0 max-w-none w-full'
            : 'flex-1 max-w-[1700px] w-full mx-auto p-4 md:p-6 lg:p-8'
        }
      >
        {activeTab === 'explorer' ? (
          <div className="flex flex-col lg:flex-row gap-6 items-start">
            {/* Left Column: Explorer FilterBar + Card Grid */}
            <div className="flex-1 w-full space-y-5">
              <FilterBar
                filters={filters}
                onChange={setFilters}
                onReset={resetFilters}
                totalMatches={displayedCards.length}
              />

              <CardGrid
                cards={displayedCards}
                getDeckCount={getCardCountInDeck}
                onAdd={addCard}
                onRemove={removeCard}
                onInspect={setInspectedCard}
                onResetFilters={resetFilters}
              />
            </div>

            {/* Right Column: Sticky Deck Builder Sidebar */}
            <div className="w-full lg:w-[380px] xl:w-[420px] lg:sticky lg:top-20 shrink-0 h-[calc(100vh-6rem)]">
              <DeckPanel
                items={activeDeck.items}
                deckId={activeDeck.id}
                deckName={activeDeck.name}
                totalCards={totalCards}
                deckStatus={deckStatus}
                savedDecks={savedDecks}
                onIncrement={addCard}
                onDecrement={removeCard}
                onRemoveAll={removeAllOfCard}
                onClear={clearDeck}
                onCreateBlank={createBlankDeck}
                onLoadDeck={loadDeck}
                onDeleteDeck={deleteDeck}
                onSaveClick={() => setIsSaveModalOpen(true)}
                onRename={setDeckName}
                onInspect={setInspectedCard}
                onExportText={handleExportText}
              />
            </div>
          </div>
        ) : (
          <DuelArena
            activeDeck={activeDeck}
            onNavigateToBuilder={() => setActiveTab('explorer')}
          />
        )}
      </main>

      {/* Inspected Card Detail Modal */}
      <CardModal
        card={inspectedCard}
        deckCount={inspectedCard ? getCardCountInDeck(inspectedCard.id) : 0}
        onClose={() => setInspectedCard(null)}
        onAdd={addCard}
        onRemove={removeCard}
      />

      {/* Save Deck Modal */}
      <SaveDeckModal
        isOpen={isSaveModalOpen}
        deckName={activeDeck.name}
        totalCards={totalCards}
        onClose={() => setIsSaveModalOpen(false)}
        onSave={(name) => {
          const ok = saveDeck(name);
          if (ok) {
            showNotification(`Deck '${name}' saved successfully!`);
          }
        }}
      />

      {/* Notification Toast */}
      {notification && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-600 text-white font-semibold text-xs shadow-2xl animate-fade-in">
          <Check className="w-4 h-4" />
          <span>{notification}</span>
        </div>
      )}
    </div>
  );
};
