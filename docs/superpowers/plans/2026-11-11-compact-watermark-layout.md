# Implementation Plan: Compact Watermark Layout & Focused Inspector Pane

## Overview
Transform the Duel Battle Arena UI based on the user's annotated feedback:
1. **Reduce Left Inspector Pane Width**: Narrow from `w-64`/`w-72`/`w-80` to `w-44 sm:w-48 xl:w-52` (~180-208px), precisely aligning with the top title logo.
2. **Remove Deck vs Deck Matchup Bar**: Delete the redundant matchup bar taking vertical space in the left inspector header. Consolidate Turn, Player Turn, and Phase into an ultra-slim single row.
3. **Eliminate Header Text Label Rows Across All 8 Arena Zones**:
   - Opponent Hand, Opponent Mana, Opponent Shields, Opponent Battle Zone, Player Battle Zone, Player Shields, Player Mana, Player Hand.
4. **Implement Subtle Watermarks**:
   - Use non-intrusive, low-opacity background watermark typography and icons (`HAND`, `MANA`, `SHIELDS`, `BATTLE ZONE`) that consume zero vertical pixels.
   - Embed counters (e.g. mana ratio `0/0`, hand count, shield strike alert) directly into widgets or as unobtrusive corner chips.

---

## Files Changed

1. `web/src/components/duel/DuelArena.tsx`
   - Adjust `CardInspectorPane` width prop/className to `w-44 sm:w-48 xl:w-52`.
   - Ensure center column fills the gained horizontal space smoothly.
2. `web/src/components/duel/CardInspectorPane.tsx`
   - Remove `playerDeckName` vs `opponentDeckName` matchup box.
   - Consolidate Turn, Active Player, and Phase into a compact single-line header.
   - Resize preview artwork container and text typography to fit comfortably in `w-48`.
   - Scale down empty placeholder state.
3. `web/src/components/duel/HandView.tsx`
   - Remove header row from Opponent Hand (`Opponent's Hand (5 Cards)`).
   - Remove header row from Player Hand (`Your Hand (5 Cards) | Click card to Charge or Play`).
   - Add subtle background watermark (`HAND`) and optional tiny corner badge.
4. `web/src/components/duel/ManaZoneView.tsx`
   - Remove standalone header row from both empty and populated states.
   - Add faint background watermark (`MANA ZONE` / `MANA`) and inline corner chip for mana ratio `untapped/total` and civ icons.
5. `web/src/components/duel/ShieldsRow.tsx`
   - Remove standalone header row (`GY (0) | Shields (5/5) | Deck (30)`).
   - The row directly displays `[Graveyard Pile] | [Shields View] | [Deck Pile]` with background watermark `SHIELDS`.
6. `web/src/components/duel/BattleZoneView.tsx`
   - Remove standalone header row and empty state text row.
   - Render battle zone field with centered faint watermark `BATTLE ZONE` with swords icon (`opacity-10`).
   - Position target selection prompt as subtle overlay badge when targeting opponent creatures.
7. `web/src/engine/tests/graveyardShieldsZone.test.mjs`
   - Maintain and expand tests verifying shield, mana, and graveyard data contracts.

---

## Tasks

### Task 1: Left Inspector Pane - Narrow Width & Compact Header
- Update `CardInspectorPane.tsx`:
  - Remove deck vs deck matchup box.
  - Consolidate Turn number, active player, and phase badge into a single compact bar.
  - Adjust image max-width and font sizing for narrower pane.
  - Adjust empty state placeholder.
- Update `DuelArena.tsx` left column width to `w-44 sm:w-48 xl:w-52`.

### Task 2: Center Arena - Remove Labels & Add Watermarks to Hands & Mana Zones
- Update `HandView.tsx`:
  - Remove opponent hand header text.
  - Remove player hand header text.
  - Add faint watermark in the background of both hand rows.
- Update `ManaZoneView.tsx`:
  - Remove dedicated header row.
  - In empty state, show slim container with subtle `MANA ZONE` watermark.
  - In populated state, show cards with background watermark and compact corner chip for available/total mana.

### Task 3: Center Arena - Remove Labels & Add Watermarks to Shields & Battle Zones
- Update `ShieldsRow.tsx`:
  - Remove top header row entirely.
  - Display `[Graveyard Pile]` | `[Shields]` | `[Deck Pile]` directly.
- Update `BattleZoneView.tsx`:
  - Remove standalone header row and empty state text row.
  - Render sleek field with faint `BATTLE ZONE` watermark in center.
  - Add contextual overlay badge for attack/spell targeting without taking vertical layout lines.

### Task 4: Verification & Build
- Run full engine test suite (259 tests across 71 suites).
- Run card loader and deck storage test suites.
- Run production TypeScript compile (`npm run build --prefix web`).
- Verify dev server HTTP 200 response and visual alignment.
- Commit, push, and open PR.
