# DM-01 to DM-12 Complete Card Database Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ingest, parse, and structure all canonical English Duel Masters cards from DM-01 through DM-12 (840 cards total) with full game stats and mechanic flags, generate a dedicated rules verification audit document, and integrate set filtering and new mechanic tags into the web deck builder.

**Architecture:**
- Create an automated data pipeline script (`scripts/build_card_database.js`) that processes raw Duel Masters records, standardizes IDs (`DM01-001` through `DM12-060`), parses abilities (Evolution, Survivor, Charger, Multi-Civ, Breakers), and emits both modular per-set JSON files (`data/cards/dm01.json` to `dm12.json`) and compiled bundles for the web app.
- Generate an audit report (`data/cards/cards_needing_verification.md`) identifying cards with complex rules text, multi-race evolution criteria, multi-civ mana rules, and conditional triggers.
- Update `web/src/types/card.ts` to support new mechanic flags (`isEvolution`, `isSurvivor`, `isCharger`, `isMultiCiv`).
- Update `web/src/data/cardLoader.ts` and `FilterBar.tsx` to support set filtering (DM-01 to DM-12) and mechanic keyword filters.
- Update `DuelCard.tsx` and `CardModal.tsx` to render evolution and multi-civilization badges cleanly.
- Open a GitHub Pull Request upon completion via `gh pr create`.

**Tech Stack:** Node.js, TypeScript, React 18, Tailwind CSS, Lucide Icons, `node:test`.

**Spec:**
- Canonical sets:
  - DM-01: Base Set (120 cards)
  - DM-02: Evo-Crushinators of Doom (60 cards)
  - DM-03: Rampage of the Super Warriors (60 cards)
  - DM-04: Shadowclash of Blinding Night (60 cards)
  - DM-05: Survivors of the Megapocalypse (60 cards)
  - DM-06: Stomp-A-Trons of Invincible Wrath (120 cards)
  - DM-07: Thundercharge of Ultra Destruction (60 cards)
  - DM-08: Epic Dragons of Hyperchaos (60 cards)
  - DM-09: Fatal Brood of Infinite Ruin (60 cards)
  - DM-10: Shockwaves of the Shattered Rainbow (120 cards)
  - DM-11: Blastosplosion of Gigantic Rage (60 cards)
  - DM-12: Thrash of the Hybrid Megacreatures (60 cards)
- Total cards: 840 cards.
- Separate verification list for cards needing rule adjudication.

## Global Constraints
- Every card must validate against `CardDefinition` schema with zero missing required fields.
- Backward compatibility: DM-01 cards must keep existing local image asset mappings (`cards/dm01/dm01-xxx.webp`).
- Multi-civilization cards (DM-10 and later) must represent all component civilizations in `civilizations` array and have `isMultiCiv: true`.
- Zero broken imports or build errors in `web/` (`tsc && vite build` must pass).

## Review Focus
1. **Multi-Civilization Handling:** Cards in DM-10 with multiple civs must not break mono-civ filters or mana curve calculations.
2. **Evolution Bait Race Parsing:** Evolution cards must correctly identify their target evolution race.
3. **Breaker Count Accuracy:** Double Breaker, Triple Breaker, and World Breaker cards must correctly have `breakerCount >= 2`.
4. **Image Fallbacks:** Cards without cached local assets must fall back gracefully to remote URLs or styled card frames without throwing image load errors.
5. **App Performance:** Loading 840 cards in memory must maintain instant filtering and 60fps scrolling in React.

---

### Task 1: Card Parser, Pipeline Script & Per-Set Data Generation

**Files:**
- Create: `scripts/build_card_database.js`
- Create: `data/cards/dm02.json` through `data/cards/dm12.json`
- Create: `data/cards/sets.json`
- Create: `web/src/data/all_cards.json`
- Create: `web/src/data/sets.json`

**Interfaces:**
- Produces:
  - 12 per-set JSON files in `data/cards/` (and mirrored in `web/src/data/`).
  - Compiled `web/src/data/all_cards.json` containing all 840 cards.
  - Set metadata manifest `sets.json`.

- [ ] **Step 1: Write database ingestion and parsing script**
Implement `scripts/build_card_database.js` to:
- Fetch or ingest `DuelMastersCards.json`.
- Normalize set codes (`DM-01` to `DM-12`).
- Parse abilities using regular expressions:
  - `isShieldTrigger`: /Shield trigger/i
  - `isBlocker`: /Blocker/i
  - `isSlayer`: /Slayer/i
  - `isSpeedAttacker`: /Speed attacker/i
  - `isEvolution`: /Evolution/i or type contains Evolution
  - `isSurvivor`: /Survivor/i or race contains Survivor
  - `isCharger`: /Charger/i in name or rules text
  - `isMultiCiv`: `civilizations.length > 1`
  - `powerAttackerBonus`: extract `+XXXX` power attacker value if present
  - `breakerCount`: 2 for Double Breaker, 3 for Triple Breaker, 1 otherwise
- Output individual `data/cards/dmXX.json` files and master `web/src/data/all_cards.json`.

- [ ] **Step 2: Run pipeline and verify card counts**
Run: `node scripts/build_card_database.js`
Expected: 840 total cards generated across 12 sets with 0 missing fields.

- [ ] **Step 3: Commit**
```bash
git add scripts/build_card_database.js data/cards/ web/src/data/
git commit -m "feat(data): generate complete DM-01 to DM-12 card database (840 cards)"
```

---

### Task 2: Automated Rules Verification & Audit Checklist

**Files:**
- Create: `scripts/generate_audit_list.js`
- Create: `data/cards/cards_needing_verification.md`

**Interfaces:**
- Produces:
  - `data/cards/cards_needing_verification.md`: Markdown report categorizing flagged cards.

- [ ] **Step 1: Create audit script and generate checklist**
Analyze all 840 cards and flag cards matching any of:
- Evolution creatures: List required bait race for each.
- Multi-civilization cards: List dual-civ combinations and mana zone rules.
- Survivors: List shared abilities granted to other survivors.
- Chargers: Spells returning to mana zone instead of graveyard.
- Complex triggers: "Whenever this creature attacks...", "When this creature is destroyed...", "At the start of your turn...", "Silent skill".
- High-impact breakers: Triple Breaker and World Breakers.

- [ ] **Step 2: Verify audit file completeness**
Check that `cards_needing_verification.md` includes card IDs, names, sets, abilities, and verification notes.

- [ ] **Step 3: Commit**
```bash
git add scripts/generate_audit_list.js data/cards/cards_needing_verification.md
git commit -m "docs(cards): generate audit checklist for DM-01 to DM-12 complex cards"
```

---

### Task 3: Update TypeScript Types & Card Loader

**Files:**
- Modify: `web/src/types/card.ts`
- Modify: `web/src/data/cardLoader.ts`
- Create: `web/src/data/cardLoader.test.mjs`

**Interfaces:**
- Updates:
  - `CardDefinition` interface with `isEvolution?: boolean`, `isSurvivor?: boolean`, `isCharger?: boolean`, `isMultiCiv?: boolean`, `evolutionRaces?: string[]`.
  - `CardFilterOptions` interface with `set?: string`, `mechanics?: string[]`.
  - `filterCards()` supporting set and new mechanic filtering.
  - `CARD_LIST` containing all 840 cards.

- [ ] **Step 1: Write unit tests for cardLoader with all sets**
In `web/src/data/cardLoader.test.mjs`:
- Test that total loaded cards equals 840.
- Test filtering by set `DM-02` returns exactly 60 cards.
- Test filtering by `isEvolution` returns all evolution creatures.
- Test filtering by multi-civ returns dual-civ cards from DM-10 to DM-12.

- [ ] **Step 2: Update `web/src/types/card.ts` and `web/src/data/cardLoader.ts`**
- Load `all_cards.json`.
- Support new filtering options in `filterCards()`.

- [ ] **Step 3: Run unit tests and verify**
Run: `node --test web/src/data/cardLoader.test.mjs`
Expected: PASS with all card loader tests passing.

- [ ] **Step 4: Verify TypeScript build**
Run: `npm run build --prefix web`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add web/src/types/card.ts web/src/data/cardLoader.ts web/src/data/cardLoader.test.mjs
git commit -m "feat(web): update card types and loader to support DM-01 to DM-12 and new mechanics"
```

---

### Task 4: UI Updates: Set Selector & Mechanic Filters in Explorer

**Files:**
- Modify: `web/src/components/explorer/FilterBar.tsx`
- Modify: `web/src/components/card/DuelCard.tsx`
- Modify: `web/src/components/card/CardModal.tsx`

**Interfaces:**
- `FilterBar`:
  - Set / Expansion dropdown (`All Sets (840 Cards)`, `DM-01 Base Set`, ..., `DM-12 Thrash of the Hybrid Megacreatures`).
  - Mechanic pills: `Trigger`, `Blocker`, `Slayer`, `Speed Attacker`, `Evolution`, `Survivor`, `Charger`, `Multi-Civ`.
- `DuelCard` & `CardModal`:
  - Visual badges for `Evolution`, `Survivor`, `Charger`.
  - Multi-civ gradient borders for dual-civilization cards.

- [ ] **Step 1: Update `FilterBar.tsx`**
Add Set dropdown and new mechanic toggle buttons.

- [ ] **Step 2: Update `DuelCard.tsx` and `CardModal.tsx`**
Display set code badge and mechanic badges on card details.

- [ ] **Step 3: Verify TypeScript build**
Run: `npm run build --prefix web`
Expected: PASS with 0 errors.

- [ ] **Step 4: Commit**
```bash
git add web/src/components/explorer/FilterBar.tsx web/src/components/card/DuelCard.tsx web/src/components/card/CardModal.tsx
git commit -m "feat(ui): add set selector, mechanic filters, and multi-civ card rendering"
```

---

### Task 5: End-to-End Verification & Pull Request Creation

**Files:**
- Dev server verification on `http://localhost:3000`

- [ ] **Step 1: Test set filtering in browser**
  - Verify switching sets updates card count (e.g., DM-01: 120, DM-02: 60, DM-10: 120).
  - Verify filtering by Evolution shows evolution creatures (e.g. Fighter Dual Fang, Crystal Lancer).
  - Verify building and saving a 40-card multi-set custom deck works.
- [ ] **Step 2: Run complete test suite and production build**
  - `node --test web/src/utils/deckStorage.test.mjs`
  - `node --test web/src/data/cardLoader.test.mjs`
  - `npm run build --prefix web`
- [ ] **Step 3: Push branch and create Pull Request**
  - `git push -u origin feature/dm01-to-dm12-card-database`
  - `gh pr create --title "feat: complete DM-01 to DM-12 card database and expansion filtering" --body "..."`
