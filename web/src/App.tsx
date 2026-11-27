import React, { useState, useEffect, Suspense } from 'react';
import { Swords, Check, ExternalLink, Layers, AlertTriangle, RotateCcw } from 'lucide-react';
import type { CardCatalog } from './data/cardCatalogCore';
import { loadCardCatalog } from './data/cardCatalogBrowser';
import { useDeckBuilder } from './hooks/useDeckBuilder';
import { ChunkErrorBoundary } from './components/common/ChunkErrorBoundary';

const loadExplorerWorkspace = () => import('./components/explorer/ExplorerWorkspace');
const loadDuelArena = () => import('./components/duel/DuelArena');

const LazyExplorerWorkspace = React.lazy(loadExplorerWorkspace);
const LazyDuelArena = React.lazy(loadDuelArena);

type ActiveTab = 'explorer' | 'duel';

function resolveInitialTab(): ActiveTab {
  if (typeof window === 'undefined') return 'explorer';
  const tab = new URLSearchParams(window.location.search).get('tab');
  return tab === 'duel' ? 'duel' : 'explorer';
}

const ExplorerLoadingSkeleton: React.FC = () => (
  <div
    data-testid="explorer-loading-skeleton"
    className="flex flex-col lg:flex-row gap-6 items-start animate-pulse"
  >
    <div className="flex-1 w-full space-y-5">
      <div className="h-32 rounded-2xl bg-slate-900/75 border border-slate-800/80" />
      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
        {Array.from({ length: 8 }).map((_, idx) => (
          <div
            key={idx}
            className="w-full max-w-[208px] aspect-[491/682] rounded-xl bg-slate-900/70 border border-slate-800/70"
          />
        ))}
      </div>
    </div>
    <div className="w-full lg:w-[380px] xl:w-[420px] shrink-0 h-[65vh] lg:h-[calc(100vh-5rem)] rounded-2xl bg-slate-900/75 border border-slate-800/80" />
  </div>
);

const DuelLoadingSkeleton: React.FC = () => (
  <div
    data-testid="duel-loading-skeleton"
    className="h-[100dvh] w-full overflow-hidden bg-[#070b14] flex flex-col justify-between p-4 sm:p-6"
  >
    <div className="h-16 rounded-2xl bg-slate-900/70 border border-slate-800/75 animate-pulse" />
    <div className="my-auto mx-auto flex flex-col items-center gap-3 text-center">
      <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-400 animate-pulse">
        <Swords className="w-6 h-6" />
      </div>
      <div className="space-y-1">
        <p className="font-cinzel font-bold text-sm tracking-wider text-amber-300">
          PREPARING BATTLE ARENA
        </p>
        <p className="text-xs text-slate-400">
          Loading Duel Engine &amp; 12-Set Card Archive...
        </p>
      </div>
    </div>
    <div className="h-24 rounded-2xl bg-slate-900/70 border border-slate-800/75 animate-pulse" />
  </div>
);

interface AppWorkspaceProps {
  catalog: CardCatalog;
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  tabRetryKey: number;
  onRetryTab: () => void;
  onNotify: (message: string) => void;
}

const AppWorkspace: React.FC<AppWorkspaceProps> = ({
  catalog,
  activeTab,
  onSelectTab,
  tabRetryKey,
  onRetryTab,
  onNotify
}) => {
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
  } = useDeckBuilder(catalog);

  const handleExportText = () => {
    const text = exportAsText();
    navigator.clipboard.writeText(text);
    onNotify('Decklist copied to clipboard!');
  };

  return (
    <>
      {activeTab !== 'duel' && (
        <AppHeader
          activeTab={activeTab}
          onSelectTab={onSelectTab}
          deckName={activeDeck.name}
          totalCards={totalCards}
        />
      )}

      <main
        className={
          activeTab === 'duel'
            ? 'flex-1 min-h-0 overflow-hidden p-0 max-w-none w-full'
            : 'flex-1 max-w-[1700px] w-full mx-auto p-4 md:p-6 lg:p-8'
        }
      >
        <ChunkErrorBoundary
          key={`${activeTab}-${tabRetryKey}`}
          label={activeTab === 'duel' ? 'Duel Battle Arena' : 'Card Explorer'}
          fullViewport={activeTab === 'duel'}
          onRetry={onRetryTab}
        >
          <Suspense
            fallback={
              activeTab === 'duel' ? <DuelLoadingSkeleton /> : <ExplorerLoadingSkeleton />
            }
          >
            {activeTab === 'explorer' ? (
              <LazyExplorerWorkspace
                catalog={catalog}
                activeDeck={activeDeck}
                savedDecks={savedDecks}
                totalCards={totalCards}
                deckStatus={deckStatus}
                isSaveModalOpen={isSaveModalOpen}
                setIsSaveModalOpen={setIsSaveModalOpen}
                addCard={addCard}
                removeCard={removeCard}
                removeAllOfCard={removeAllOfCard}
                clearDeck={clearDeck}
                createBlankDeck={createBlankDeck}
                loadDeck={loadDeck}
                saveDeck={saveDeck}
                deleteDeck={deleteDeck}
                setDeckName={setDeckName}
                getCardCountInDeck={getCardCountInDeck}
                onExportText={handleExportText}
                onNotify={onNotify}
              />
            ) : (
              <LazyDuelArena
                activeDeck={activeDeck}
                savedDecks={savedDecks}
                presetDecks={catalog.presetDecks}
                cardMap={catalog.cardMap}
                onNavigateToBuilder={() => onSelectTab('explorer')}
              />
            )}
          </Suspense>
        </ChunkErrorBoundary>
      </main>
    </>
  );
};

interface AppHeaderProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  deckName?: string;
  totalCards?: number;
}

const AppHeader: React.FC<AppHeaderProps> = ({
  activeTab,
  onSelectTab,
  deckName,
  totalCards
}) => (
  <header className="sticky top-0 z-30 bg-slate-950/85 backdrop-blur-md border-b border-slate-800/80 px-3 md:px-8 py-2.5">
    <div className="max-w-[1700px] mx-auto flex items-center justify-between gap-2 h-full min-w-0">
      {/* Logo & Branding */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-xl text-lg bg-gradient-to-br from-amber-500 to-yellow-600 text-slate-950 shadow-lg shadow-amber-500/20 font-black shrink-0">
          <Swords className="w-4.5 h-4.5 fill-current" />
        </div>
        <div className="hidden min-[420px]:flex items-center">
          <h1 className="font-cinzel font-extrabold whitespace-nowrap text-sm sm:text-lg md:text-xl tracking-wider text-white">
            DUEL MASTERS
          </h1>
        </div>
      </div>

      {/* Top Navigation Tabs */}
      <nav className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-2xl shadow-inner shrink-0">
        <button
          type="button"
          onClick={() => onSelectTab('explorer')}
          className={`flex items-center gap-1.5 px-2.5 py-1 sm:px-3.5 sm:py-1.5 rounded-xl font-cinzel font-bold text-[11px] sm:text-xs whitespace-nowrap transition-all ${
            activeTab === 'explorer'
              ? 'bg-gradient-to-r from-amber-500 to-yellow-600 text-slate-950 shadow-md shadow-amber-500/20'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Layers className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden lg:inline">Card Explorer &amp; Deck Builder</span>
          <span className="lg:hidden">Explorer</span>
        </button>

        <button
          type="button"
          onClick={() => onSelectTab('duel')}
          className={`flex items-center gap-1.5 px-2.5 py-1 sm:px-3.5 sm:py-1.5 rounded-xl font-cinzel font-bold text-[11px] sm:text-xs whitespace-nowrap transition-all relative ${
            activeTab === 'duel'
              ? 'bg-gradient-to-r from-amber-500 to-yellow-600 text-slate-950 shadow-md shadow-amber-500/20'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Swords className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden lg:inline">Duel Battle Arena</span>
          <span className="lg:hidden">Battle Arena</span>
          <span className="flex h-2 w-2 relative shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
          </span>
        </button>
      </nav>

      {/* Quick Stats Pill */}
      <div className="flex items-center gap-2 shrink-0">
        {deckName !== undefined && totalCards !== undefined ? (
          <div className="hidden xl:flex items-center gap-2 px-3 py-1 rounded-xl bg-slate-900 border border-slate-800 text-xs">
            <span className="text-slate-400">Active Deck:</span>
            <span className="font-cinzel font-bold text-amber-400 truncate max-w-[200px]">
              {deckName}
            </span>
            <span className="font-mono text-xs px-1.5 py-0.2 rounded bg-slate-800 text-slate-200 tabular-nums">
              {totalCards}/40
            </span>
          </div>
        ) : (
          <div className="hidden xl:flex items-center gap-2 px-3 py-1 rounded-xl bg-slate-900 border border-slate-800 text-xs animate-pulse">
            <span className="h-3 w-32 rounded bg-slate-800" />
          </div>
        )}

        <a
          href="https://github.com/dalalanirban/duel_masters"
          target="_blank"
          rel="noreferrer"
          title="GitHub Repository"
          className="flex items-center gap-1 text-xs px-2.5 py-1 sm:px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition-colors whitespace-nowrap"
        >
          <span className="hidden sm:inline">GitHub</span>
          <ExternalLink className="w-3 h-3 text-slate-400 shrink-0" />
        </a>
      </div>
    </div>
  </header>
);

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>(resolveInitialTab);
  const [catalog, setCatalog] = useState<CardCatalog | null>(null);
  const [catalogError, setCatalogError] = useState(false);
  const [catalogAttempt, setCatalogAttempt] = useState(0);
  const [tabRetryKey, setTabRetryKey] = useState(0);
  const [notification, setNotification] = useState<string | null>(null);

  // Zero-waterfall cold start: fetch card catalog and active lazy tab module in parallel
  useEffect(() => {
    let cancelled = false;
    setCatalogError(false);

    void (activeTab === 'duel' ? loadDuelArena() : loadExplorerWorkspace()).catch(() => {
      // ChunkErrorBoundary will surface retry controls if React.lazy rejects
    });

    loadCardCatalog()
      .then((loaded) => {
        if (!cancelled) {
          setCatalog(loaded);
        }
      })
      .catch((err) => {
        console.error('Failed to load card catalog:', err);
        if (!cancelled) {
          setCatalogError(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [catalogAttempt]);

  const handleSelectTab = (tab: ActiveTab) => {
    void (tab === 'duel' ? loadDuelArena() : loadExplorerWorkspace()).catch(() => {});
    setActiveTab(tab);
  };

  const showNotification = (message: string) => {
    setNotification(message);
    setTimeout(() => setNotification(null), 3000);
  };

  return (
    <div
      className={`${
        activeTab === 'duel' ? 'h-[100dvh] overflow-hidden' : 'min-h-screen'
      } bg-[#070b14] text-slate-100 flex flex-col`}
    >
      {!catalog ? (
        <>
          {activeTab !== 'duel' && (
            <AppHeader activeTab={activeTab} onSelectTab={handleSelectTab} />
          )}

          {catalogError ? (
            <main
              className={
                activeTab === 'duel'
                  ? 'h-[100dvh] flex items-center justify-center p-6'
                  : 'flex-1 flex items-center justify-center p-6'
              }
            >
              <div className="max-w-md w-full rounded-2xl bg-slate-900/90 border border-red-500/40 p-6 text-center shadow-2xl space-y-4">
                <div className="mx-auto w-11 h-11 rounded-xl bg-red-500/15 border border-red-500/35 flex items-center justify-center text-red-400">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <h2 className="font-cinzel font-bold text-base text-white">
                    Unable to Load Card Catalog
                  </h2>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Could not download the 12-set card database. Check your network and retry.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setCatalogAttempt((c) => c + 1)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Retry Loading
                </button>
              </div>
            </main>
          ) : activeTab === 'duel' ? (
            <DuelLoadingSkeleton />
          ) : (
            <main className="flex-1 max-w-[1700px] w-full mx-auto p-4 md:p-6 lg:p-8">
              <ExplorerLoadingSkeleton />
            </main>
          )}
        </>
      ) : (
        <AppWorkspace
          catalog={catalog}
          activeTab={activeTab}
          onSelectTab={handleSelectTab}
          tabRetryKey={tabRetryKey}
          onRetryTab={() => setTabRetryKey((k) => k + 1)}
          onNotify={showNotification}
        />
      )}

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
