import React, { useState, useMemo } from 'react';
import type { CardDefinition, CardFilterOptions, Deck } from '../../types/card';
import { filterCardList, type CardCatalog } from '../../data/cardCatalogCore';
import { FilterBar } from './FilterBar';
import { CardGrid } from './CardGrid';
import { DeckPanel } from '../deck/DeckPanel';
import { CardModal } from '../card/CardModal';
import { SaveDeckModal } from '../deck/SaveDeckModal';

export interface ExplorerWorkspaceProps {
  catalog: CardCatalog;
  activeDeck: Deck;
  savedDecks: Deck[];
  totalCards: number;
  deckStatus: 'legal' | 'building' | 'over';
  isSaveModalOpen: boolean;
  setIsSaveModalOpen: (open: boolean) => void;
  addCard: (card: CardDefinition) => void;
  removeCard: (card: CardDefinition) => void;
  removeAllOfCard: (card: CardDefinition) => void;
  clearDeck: () => void;
  createBlankDeck: () => void;
  loadDeck: (deckId: string) => void;
  saveDeck: (name: string) => boolean;
  deleteDeck: (deckId: string) => void;
  setDeckName: (name: string) => void;
  getCardCountInDeck: (cardId: string) => number;
  onExportText: () => void;
  onNotify: (message: string) => void;
}

export const ExplorerWorkspace: React.FC<ExplorerWorkspaceProps> = ({
  catalog,
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
  onExportText,
  onNotify
}) => {
  const [filters, setFilters] = useState<CardFilterOptions>({
    sortBy: 'id-asc'
  });
  const [inspectedCard, setInspectedCard] = useState<CardDefinition | null>(null);

  const displayedCards = useMemo(() => {
    return filterCardList(catalog.cardList, filters);
  }, [catalog.cardList, filters]);

  const resetFilters = () => {
    setFilters({ sortBy: 'id-asc' });
  };

  return (
    <>
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Left Column: Explorer FilterBar + Card Grid */}
        <div className="flex-1 w-full space-y-5">
          <FilterBar
            filters={filters}
            onChange={setFilters}
            onReset={resetFilters}
            totalMatches={displayedCards.length}
            sets={catalog.sets}
            allRaces={catalog.allRaces}
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
        <div className="w-full lg:w-[380px] xl:w-[420px] lg:sticky lg:top-16 shrink-0 h-[65vh] lg:h-[calc(100vh-5rem)]">
          <DeckPanel
            items={activeDeck.items}
            deckId={activeDeck.id}
            deckName={activeDeck.name}
            totalCards={totalCards}
            deckStatus={deckStatus}
            savedDecks={savedDecks}
            presetDecks={catalog.presetDecks}
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
            onExportText={onExportText}
          />
        </div>
      </div>

      {/* Inspected Card Detail Modal */}
      <CardModal
        card={inspectedCard}
        sets={catalog.sets}
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
            onNotify(`Deck '${name}' saved successfully!`);
          }
        }}
      />
    </>
  );
};

export default ExplorerWorkspace;
