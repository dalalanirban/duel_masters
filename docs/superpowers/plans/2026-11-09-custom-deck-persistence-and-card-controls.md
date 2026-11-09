# Custom Deck Persistence & Add Button Click Area Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable full custom deck management (create, name, save strictly at 40 cards, persist across page reloads, load, edit, delete) and enhance the card add button so clicking anywhere on the button adds a card while only the minus button decrements.

**Architecture:** 
- Extract deck persistence and validation logic into a modular storage module (`deckStorage.ts`) managing `savedDecks` in `localStorage` alongside the `activeDeck`.
- Update `useDeckBuilder` hook to expose multi-deck state (`savedDecks`), blank deck creation, saving, loading, and deletion.
- Create a `SaveDeckModal` component prompted when the user clicks the Save button (which is strictly disabled until `totalCards === 40`).
- Update `DeckPanel` to include the Save button, grouped deck selector (New, Saved, Presets), and delete action.
- Update `DuelCard` and `CardModal` button interaction so clicking anywhere on the button increments copy count, and only the `-` button decrements.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Lucide Icons, Vite, Node.js Test Runner (`node:test`).

**Spec:** User requirements from session chat:
1. Add button click area: User can click anywhere on the button to add a card; only clicking the `-` button removes 1 copy.
2. Custom deck creation and save: User can create their own deck.
3. Save button condition: Upon adding all 40 cards, Save button is enabled. Disabled if `totalCards !== 40`.
4. Save popup: Clicking Save opens a modal popup to provide the name of the deck and submit.
5. Reload persistence: On next load and subsequent reloads, the user should be able to see the saved deck, select it, and modify it.

## Global Constraints
- Legal deck size is strictly 40 cards (`totalCards === 40`).
- Maximum 4 copies per card ID.
- Base set is DM-01 (120 cards).
- Zero runtime external dependencies added; utilize existing Tailwind and Lucide icons.
- Persistence key for user custom decks: `dm_saved_decks_v1`; active deck: `dm_active_deck_v1`.

## Review Focus
1. **Partial / Overfilled Decks:** Ensure Save button is disabled when `totalCards < 40` or `totalCards > 40`.
2. **Click Propagation on Minus Button:** Ensure clicking `-` decrements without triggering the outer add click handler.
3. **Max Copies Boundary:** When at 4 copies, clicking the button body must not exceed 4 copies.
4. **Name Validation in Modal:** Prevent saving with an empty or whitespace-only deck name.
5. **Storage Re-hydration:** On reload, verify card objects in saved decks are correctly re-hydrated from `CARD_MAP` without data corruption.

---

### Task 1: Deck Storage & Validation Utilities with Tests

**Files:**
- Create: `web/src/utils/deckStorage.ts`
- Create: `web/src/utils/deckStorage.test.mjs`

**Interfaces:**
- Produces:
  - `isDeckLegal(totalCards: number): boolean`
  - `createEmptyDeck(name?: string): Deck`
  - `loadSavedDecks(): Deck[]`
  - `saveDeckToList(deck: Deck, name: string): { updatedDeck: Deck; savedDecks: Deck[] }`
  - `deleteDeckFromList(deckId: string): Deck[]`

- [ ] **Step 1: Write the failing test for deck storage & legality**

Create `web/src/utils/deckStorage.test.mjs` using `node:test` and `node:assert`:
- Test that `isDeckLegal(40)` returns `true`, and `39` or `41` return `false`.
- Test that `createEmptyDeck('My Deck')` returns a deck with 0 items, correct name, and timestamp.
- Test that `saveDeckToList` saves a 40-card deck and updates existing decks by ID or creates a new entry.
- Test that `deleteDeckFromList` removes the targeted deck ID.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test web/src/utils/deckStorage.test.mjs`
Expected: FAIL (module `web/src/utils/deckStorage.ts` not found).

- [ ] **Step 3: Implement `web/src/utils/deckStorage.ts`**

Implement pure functions:
- `isDeckLegal(totalCards: number): boolean` => `totalCards === 40`
- `createEmptyDeck(name: string = 'Untitled Deck'): Deck`
- `loadSavedDecks(): Deck[]` (with fallback to empty array and safe JSON parsing)
- `saveDeckToList(currentDeck: Deck, newName: string, existingDecks: Deck[]): { updatedDeck: Deck; savedDecks: Deck[] }`
- `deleteDeckFromList(deckId: string, existingDecks: Deck[]): Deck[]`

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test web/src/utils/deckStorage.test.mjs`
Expected: PASS with 4+ passing assertions.

- [ ] **Step 5: Commit**

```bash
git add web/src/utils/deckStorage.ts web/src/utils/deckStorage.test.mjs
git commit -m "feat(deck): add deck storage, validation utilities, and unit tests"
```

---

### Task 2: Update `useDeckBuilder` to Support Saved Decks and Multi-Deck Management

**Files:**
- Modify: `web/src/hooks/useDeckBuilder.ts`

**Interfaces:**
- Consumes: `web/src/utils/deckStorage.ts`
- Produces:
  - `savedDecks: Deck[]`
  - `saveDeck(name: string): boolean`
  - `createBlankDeck(): void`
  - `loadDeck(deckId: string): void`
  - `deleteDeck(deckId: string): void`
  - `isSaveModalOpen: boolean`
  - `setIsSaveModalOpen: (open: boolean) => void`

- [ ] **Step 1: Update hook state and methods**

In `web/src/hooks/useDeckBuilder.ts`:
- Load `savedDecks` from `localStorage.getItem('dm_saved_decks_v1')`.
- Add `createBlankDeck` which sets `activeDeck` to `createEmptyDeck('New Custom Deck')`.
- Add `saveDeck(name: string): boolean` which:
  - Verifies `totalCards === 40`.
  - Saves/updates the deck in `savedDecks` and persists to `dm_saved_decks_v1`.
  - Sets active deck name and updates `activeDeck`.
  - Persists `dm_active_deck_v1`.
  - Returns `true` on success, `false` otherwise.
- Add `loadDeck(deckId: string)`:
  - Looks in `PRESET_DECKS`, then in `savedDecks`.
  - Sets `activeDeck` to the loaded deck.
- Add `deleteDeck(deckId: string)`:
  - Removes from `savedDecks` and updates `localStorage`.
  - If the active deck was deleted, switches to `PRESET_DECKS[0]`.

- [ ] **Step 2: Verify TypeScript compilation**

Run: `node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run build --prefix d:\Duel_Masters\web`
Expected: PASS with 0 type errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/hooks/useDeckBuilder.ts
git commit -m "feat(hook): add multi-deck persistence, saving, and deletion in useDeckBuilder"
```

---

### Task 3: Enhance Add Button Click Area in `DuelCard` and `CardModal`

**Files:**
- Modify: `web/src/components/card/DuelCard.tsx`
- Modify: `web/src/components/card/CardModal.tsx`

**Interfaces:**
- `DuelCard`:
  - When `deckCount === 0`: button is "+ Add to Deck", clicking calls `onAdd(card)`.
  - When `1 <= deckCount < 4`: entire container has `onClick={() => onAdd(card)}` with cursor pointer and hover feedback. The `-` button has `onClick={(e) => { e.stopPropagation(); onRemove(card); }}`.
  - When `deckCount === 4`: container displays `MAX (4)`, does not trigger `onAdd`. Only `-` button triggers `onRemove`.
- `CardModal`:
  - Consistent behavior for deck buttons.

- [ ] **Step 1: Implement full-button click-to-add in `DuelCard.tsx`**

- In `DuelCard.tsx`:
  - Wrap the 1-3 copies state in a clickable container with `onClick={() => onAdd?.(card)}`.
  - Add visual hover cues (e.g. `hover:border-emerald-400 group/btn`) indicating clicking adds a copy.
  - Ensure the `-` button uses `e.stopPropagation()` so clicking it only decrements without adding.
  - When `isMaxCopies` (4), do not call `onAdd` when clicking the container; `-` button retains `onRemove`.

- [ ] **Step 2: Check `CardModal.tsx` controls**

- Ensure Add button increments up to 4, Remove button decrements down to 0, and clear badges reflect count.

- [ ] **Step 3: Verify TypeScript compilation**

Run: `node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run build --prefix d:\Duel_Masters\web`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/card/DuelCard.tsx web/src/components/card/CardModal.tsx
git commit -m "feat(card): make entire add button clickable to increment card count"
```

---

### Task 4: Create `SaveDeckModal` Component

**Files:**
- Create: `web/src/components/deck/SaveDeckModal.tsx`

**Interfaces:**
- Component Props:
  - `isOpen: boolean`
  - `deckName: string`
  - `totalCards: number`
  - `onClose: () => void`
  - `onSave: (name: string) => void`

- [ ] **Step 1: Implement `SaveDeckModal.tsx`**

Features:
- Backdrop with blur and click-to-close (or Escape key listener).
- Header: "Save Custom Deck" with Cinzel font and swords / save icon.
- Input: Deck name input (prefilled with `deckName`), autofocus, selects all on focus.
- Validation: Displays inline warning if name is empty.
- Stats summary: Shows "40 / 40 cards - Ready to save".
- Action buttons:
  - "Cancel" button.
  - "Save Deck" button (amber-gold styling, disabled if name is empty or totalCards !== 40).
- Submitting on `Enter` key triggers save.

- [ ] **Step 2: Verify TypeScript compilation**

Run: `node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run build --prefix d:\Duel_Masters\web`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add web/src/components/deck/SaveDeckModal.tsx
git commit -m "feat(deck): create SaveDeckModal dialog component"
```

---

### Task 5: Update `DeckPanel` and `App` with Save Button, Grouped Selector, and Modal

**Files:**
- Modify: `web/src/components/deck/DeckPanel.tsx`
- Modify: `web/src/App.tsx`

**Interfaces:**
- `DeckPanel` Props:
  - `savedDecks: Deck[]`
  - `onSaveClick: () => void`
  - `onCreateBlank: () => void`
  - `onDeleteDeck: (id: string) => void`
  - `onLoadDeck: (id: string) => void`

- [ ] **Step 1: Update `DeckPanel.tsx`**

- In header:
  - Replace simple preset selector with a grouped `<select>`:
    - `<option value="__NEW__">+ New Blank Deck</option>`
    - `<optgroup label="My Saved Decks">` listing each saved deck with its card count.
    - `<optgroup label="Starter Presets">` listing Shobu, Kokujo, Hakuoh.
  - If current active deck matches an ID in `savedDecks`, display a subtle delete button (trash icon) to delete that saved deck.
- In action buttons row (next to *Test Opening Hand* and *Export Deck*):
  - Add **Save Deck** button:
    - Icon: `Save`
    - Disabled when `totalCards !== 40` (`disabled={totalCards !== 40}`).
    - When disabled, styled with muted opacity and tooltip: "Requires exactly 40 cards to save (current: {totalCards}/40)".
    - When `totalCards === 40`, styled with vibrant amber glow and pulse animation: "Save Deck".
    - Clicking triggers `onSaveClick`.

- [ ] **Step 2: Wire `SaveDeckModal` and toast in `App.tsx`**

- Connect `saveDeck(name)` from `useDeckBuilder`.
- When saved successfully, show success toast: "Deck '[Name]' saved successfully!".
- Ensure `DeckPanel` receives `savedDecks`, `onSaveClick`, `onCreateBlank`, `onDeleteDeck`, `onLoadDeck`.

- [ ] **Step 3: Verify TypeScript compilation**

Run: `node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run build --prefix d:\Duel_Masters\web`
Expected: PASS with 0 errors.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/deck/DeckPanel.tsx web/src/App.tsx
git commit -m "feat(deck): integrate save button, grouped selector, and modal in DeckPanel"
```

---

### Task 6: End-to-End Browser Verification & Polish

**Files:**
- Test via running dev server on `http://localhost:3000`

- [ ] **Step 1: Test Add button click area**
  - Click on a card with 0 copies -> becomes 1 in deck.
  - Click on the text/bar of the button -> increments to 2, then 3, then 4 (MAX).
  - Click on the `-` button only -> decrements to 3, 2, 1, 0.
  - Verify container click at 4 copies does NOT add a 5th copy.

- [ ] **Step 2: Test Save button strictly enabled at 40 cards**
  - Verify Save button is disabled at 0 cards and displays "Requires 40 cards".
  - Add cards until exactly 40 cards -> verify Save button turns active and clickable.
  - Add 1 more (41 cards if possible, or test over-limit) -> verify disabled.

- [ ] **Step 3: Test Save Modal and Multi-Deck Persistence**
  - Click "Save Deck", enter name "My Dragon Stomper", click "Save".
  - Verify success toast appears.
  - Switch to "Starter Presets -> Shobu's Beatdown".
  - Verify deck changes to Shobu.
  - Reload page (`location.reload()`).
  - Open deck selector -> verify "My Dragon Stomper" is in "My Saved Decks".
  - Select "My Dragon Stomper" -> verify all 40 cards are loaded.

- [ ] **Step 4: Final Git commit & push**
```bash
git push origin main
```
