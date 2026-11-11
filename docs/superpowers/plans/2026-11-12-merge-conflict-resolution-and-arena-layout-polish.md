# Merge Conflict Resolution and Duel Arena Layout Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

This plan resolves the compiler breakages and code duplication introduced in merge commit `1e99f2e` (PR #7) while implementing the user's layout requirements from their annotated screenshots:
1. **Fix syntax & compile breakages**: Resolve duplicated `const breakerCount` in `web/src/engine/combat.ts` and clean up the fractured JSX in `web/src/components/duel/ShieldsView.tsx`.
2. **Remove duplicate UI**: Eliminate the redundant pre-PR#6 arena and action center re-introduced into `web/src/components/duel/DuelArena.tsx`.
3. **Multi-shield target selection**: Wire `selectedShieldIndices` and `requiredSelectionCount` into `ShieldsView` with heraldic translucent blue shields and numbered target badges for multi-breakers.
4. **Card Inspector expansion**: Widen `CardInspectorPane` to eliminate the dead space between the left pane and the battlefield.
5. **Edge-to-edge Battle Zone**: Expand the battlefield width to fill the center playmat with uniform ~5px side margins.
6. **Vertically spanned Graveyard**: Restructure player (and opponent) playmat flanks so Graveyard spans vertically across both the Shield row and the Mana zone.
7. **Dedicated Deck placement**: Relocate the player's Deck to the bottom-right corner as annotated, freeing the Shield row from horizontal cramping.

---

## File Structure & Responsibilities

- **`web/src/engine/combat.ts`**:
  - Remove duplicate `const breakerCount` declaration.
  - Implement clean multi-shield breaking: break `targetIndices` first, followed by remaining unbroken shields up to `breakerCount`.
- **`web/src/components/duel/ShieldsView.tsx`**:
  - Unify into a single, clean component.
  - Retain translucent blue heraldic shield cards with card aspect ratio `aspect-[491/682]`.
  - Retain full-area `FINAL BLOW • DIRECT ATTACK` button when unbroken shields = 0 and `canDirectAttack` is true.
  - Support multi-shield selection badges (`#1`, `#2`) for Double/Triple Breakers when `requiredSelectionCount > 1`.
  - Ensure zero card-details leakage on hover (no hover popups for face-down shields).
- **`web/src/components/duel/ShieldsRow.tsx`**:
  - Refactor into a unified territory zone container that supports:
    - Left flank: Graveyard spanning vertically across both Shields and Mana.
    - Center: Shields row and Mana zone.
    - Right flank / Hand row: Deck placed cleanly in its designated spot.
- **`web/src/components/duel/DuelArena.tsx`**:
  - Remove duplicate combat stage / old action center block (lines 574–735).
  - Expand `CardInspectorPane` width (e.g. `w-80 lg:w-88 xl:w-96`) and remove dead space.
  - Expand `BattleZoneView` width with uniform ~5px side gaps.
  - Pass multi-shield selection state (`selectedShieldIndices`, `requiredBreakerCount`) to `ShieldsRow`.
- **`web/src/components/duel/CardInspectorPane.tsx`**:
  - Adjust card artwork max-width (`max-w-[210px] sm:max-w-[240px]`) to utilize the expanded pane width comfortably.

---

## Task Decomposition

### Task 1: Engine Combat Reconcile & Unit Test Verification
- [ ] Fix `web/src/engine/combat.ts`: remove duplicate `breakerCount` on line 536 and cleanly resolve `targetIndices`.
- [ ] Verify test suite `node web/src/engine/tests/graveyardShieldsZone.test.mjs` and `node web/src/engine/tests/manaPhaseUndoRules.test.mjs`.

### Task 2: ShieldsView Reconcile & Multi-Shield Badge Integration
- [ ] Cleanly rebuild `web/src/components/duel/ShieldsView.tsx` with a single return statement.
- [ ] Integrate `selectedShieldIndices` and `requiredSelectionCount` into the translucent blue card-aspect layout.
- [ ] Ensure direct attack full-button styling is preserved when shields = 0.

### Task 3: DuelArena De-duplication & State Wiring
- [ ] Remove obsolete lines 574–735 from `web/src/components/duel/DuelArena.tsx`.
- [ ] Ensure `selectedShieldIndices` is maintained and resets properly when attacker changes or attack is cancelled.
- [ ] Forward `selectedShieldIndices` and `requiredBreakerCount` through to `ShieldsRow`.

### Task 4: Arena Layout Enhancements (Inspector, Battle Zone, Spanned GY, Deck)
- [ ] Expand `CardInspectorPane` width to `w-72 sm:w-80 lg:w-88 xl:w-96` and update artwork sizing in `CardInspectorPane.tsx`.
- [ ] Set `BattleZoneView` and center arena column to edge-to-edge layout with ~5px (`px-1.5`) side margins.
- [ ] Layout player flank: Graveyard spans vertically across the combined height of Shields and Mana zone on the left.
- [ ] Layout player deck: Position Deck at the bottom right corner ("Show Deck here").
- [ ] Ensure opponent side matches with symmetric elegance.

### Task 5: Build, Test & Playwright Live Browser Verification
- [ ] Run `npm run build --prefix web` and verify 0 TypeScript/Vite errors.
- [ ] Run complete test suite (`node --test web/src/engine/tests/*.test.mjs`).
- [ ] Use Playwright to load `http://localhost:3000/`, capture a screenshot of the duel arena, and visually inspect with `read_file`.
- [ ] Verify hover state, card inspector, and player/opponent layout.

### Task 6: Git Commit & Push
- [ ] Stage all changes.
- [ ] Commit with descriptive commit message.
- [ ] Push to `origin main`.
