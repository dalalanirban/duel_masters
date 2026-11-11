# Viewport Duel Arena Layout & Interactive Card Inspector Plan

## Overview
Redesign and implement the Duel Arena UI to match the user's wireframe layout, fitting entirely within the viewport (`100vh`) with zero vertical scrolling in the battle arena. Introduce a 3-column architecture featuring a persistent Card Inspector Left Pane (with instant hover inspection), an 8-row Center Battle Arena with compact Mana and Shield zones flanked by interactive Deck and Graveyard zones, and a Right Pane containing Duel Event Logs (with clickable card links) and Phase/Turn controls.

---

## Architecture & Layout Specification

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Title Bar (Header) - Match Title, Preset Info, Sound/Theme/Builder Navigation                          │
├──────────────────────────┬─────────────────────────────────────────────────┬───────────────────────────┤
│ Left Column (~260px)     │ Center Column: Battle Arena (Zero Page Scroll)  │ Right Column (~300px)     │
├──────────────────────────┼─────────────────────────────────────────────────┼───────────────────────────┤
│ [Match Status Card]      │ 1. Opponent Hand (compact cards/backs)          │ [Controls Header]         │
│ • Turn #, Active Player  │ 2. Opponent Mana Zone (condensed mini-cards)    │ • AI Auto-Play toggle     │
│ • Player vs Opponent deck│ 3. [Oppo GY] | [Opponent Shields] | [Oppo Deck] │ • Restart & Exit button   │
│                          │ 4. Opponent Battle Zone (compact creatures)     │                           │
│ [Card Inspector Pane]    │ 5. Player Battle Zone (compact creatures)       │ [Duel Event Log]          │
│ • Instant live card      │ 6. [Player GY] | [Player Shields] | [Player Deck│ • Scrollable event stream │
│   details on hover over  │ 7. Player Mana Zone (condensed mini-cards)      │ • Interactive card links  │
│   ANY card in the arena  │ 8. Player Hand (playable cards with actions)    │                           │
│ • Also previews cards    │                                                 │ [Turn & Action Bar]       │
│   clicked in duel log    │                                                 │ • Pass / Attack / End Turn│
│                          │                                                 │ • Direct Attack to Win    │
└──────────────────────────┴─────────────────────────────────────────────────┴───────────────────────────┘
```

---

## File Structure

- **Create**: `web/src/components/duel/CardInspectorPane.tsx` — Left pane showing match status and live hovered card details.
- **Create**: `web/src/components/duel/GraveyardDeckZone.tsx` — Graveyard and Deck widgets flanking the Shield Zone.
- **Create**: `web/src/components/duel/GraveyardModal.tsx` — Interactive modal displaying all cards in player/opponent graveyard with inspection and salvage selection.
- **Create**: `web/src/components/duel/DuelLogPane.tsx` — Right pane with duel logs (clickable card name links), match controls, and phase advancement action buttons.
- **Modify**: `web/src/components/duel/ShieldsView.tsx` — Compact layout, trigger badges, hover support.
- **Modify**: `web/src/components/duel/ManaZoneView.tsx` — Compact horizontal mini-card strips, civilization icons, tap indicators, hover support.
- **Modify**: `web/src/components/duel/HandView.tsx` — Add `onHoverCard` callback on mouse enter/leave.
- **Modify**: `web/src/components/duel/BattleZoneView.tsx` — Add `onHoverCard` callback on mouse enter/leave.
- **Modify**: `web/src/components/duel/DuelArena.tsx` — Assemble the 3-column viewport layout, wire hover state and log card clicking.
- **Modify**: `web/src/App.tsx` — Ensure duel view container uses `h-screen overflow-hidden`.
- **Create**: `web/src/engine/tests/duelArenaLayout.test.mjs` — Automated verification tests for log link parsing, graveyard indexing, and layout logic.

---

## Proposed Tasks

### Task 1: Card Inspector & Match Status Left Pane
- [x] Create `web/src/components/duel/CardInspectorPane.tsx`.
- [x] Displays Turn #, active player, phase, and deck names at top.
- [x] Displays full card image, civilization badges, mana cost, power, type, race, rules text, and flavor text when a card is hovered or selected.
- [x] Defaults to a sleek Duel Masters logo/placeholder when no card is hovered.

### Task 2: Compact Mana, Shields, Graveyard & Deck Zones
- [x] Create `web/src/components/duel/GraveyardDeckZone.tsx` showing graveyard pile count + top card thumbnail, and deck back with card count.
- [x] Create `web/src/components/duel/GraveyardModal.tsx` showing all graveyard cards in a grid with inspection.
- [x] Modify `ShieldsView.tsx` and `ManaZoneView.tsx` to be compact and responsive to fit in standard screen heights without vertical scrolling.

### Task 3: Duel Log & Action Controls Right Pane
- [x] Create `web/src/components/duel/DuelLogPane.tsx`.
- [x] Top: AI Auto-Play toggle, Restart button, Exit to Deck Builder button.
- [x] Middle: Scrollable duel logs where card names (matching card database) are rendered as clickable tags that preview in the Left Pane.
- [x] Bottom: Large primary action button dynamically reflecting current turn state (Pass to Main Phase, Attack Phase, End Turn, Direct Attack to Win, Play Opponent Move).

### Task 4: Master Duel Arena 3-Column Integration & Viewport Locking
- [x] Refactor `DuelArena.tsx` to integrate the 3-column layout.
- [x] Update `HandView.tsx` and `BattleZoneView.tsx` to pass `onHoverCard` callbacks.
- [x] Update `App.tsx` to lock viewport to `h-screen overflow-hidden` during duel view.
- [x] Verify full viewport sizing on standard resolutions (1080p, 900p, 768p).

### Task 5: Testing, Production Build & Pull Request
- [x] Create `web/src/engine/tests/duelArenaLayout.test.mjs` to test card log regex parsing and graveyard state utilities.
- [x] Run all test suites across the project (`node --test web/src/engine/tests/*.test.mjs`, `cardLoader.test.mjs`, `deckStorage.test.mjs`).
- [x] Run TypeScript production build (`npm run build --prefix web`).
- [x] Commit, push branch `feature/viewport-duel-arena-layout`, and create Pull Request #5.
