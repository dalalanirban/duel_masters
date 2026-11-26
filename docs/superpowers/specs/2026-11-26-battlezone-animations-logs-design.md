# Battlezone Active-Voice Logs, Slow Animations & Spell Spotlight

**Date:** 2026-11-26  
**Approach:** UI-Level Visual Queue & Paced AI Loop (Approach A)

## Intent
Make duels easier to follow at a glance without looking away from the board:
1. Show player and AI actions directly over the active player's battlezone in active voice, fading out cleanly without blocking clicks.
2. Slow down and animate shield breaks and card movements so state changes are legible.
3. Briefly spotlight cast spell cards over the battlezone with an engaging fade-out.

## Design

### 1. Active-Voice Battlezone Action Log
- **Where:** `pointer-events-none` overlay positioned over the active player's `BattleZoneView` (top/center edge so it doesn't obscure cards).
- **Behavior:** Watches `state.actionLog` for new entries, converts them to active voice from the acting player's perspective (e.g. `"I summon ..."`, `"I cast ..."`, `"I break your shield"`, `"I charge ... to mana"`, `"I attack ..."`), and displays the latest 2–3 entries.
- **Lifecycle:** Each entry fades in, stays readable (~2.5s), and fades out smoothly. `DuelLogPane` remains unchanged.

### 2. Spell Spotlight Overlay
- **Trigger:** When a spell is cast (detected via new spell cast log / graveyard transition), display the spell's card image & name centered over the battlezone.
- **Animation:** Scale-in + subtle glow/flash, hold briefly, then fade out (~1.4s total), `pointer-events-none`.

### 3. Slow Shield Break & Card Movement Animations
- **Shield Break:** Track removed shields in `ShieldsView` / `DuelArena` and render a shattering/fading ghost shield animation (~800ms) at the broken shield's position.
- **Card Movement:** Animate newly entering creatures in `BattleZoneView` (smooth slide/scale-in ~600ms) and tapped/attacking states with slower CSS transitions.

### 4. Paced AI Loop
- **Gating:** Maintain an `isAnimating` / `animationCooldownUntil` state in `DuelArena.tsx` triggered by shield breaks, spell spotlights, and card movements.
- **AI Effect:** The AI auto-play `useEffect` waits until `isAnimating` clears before dispatching the next AI action, ensuring each move is visible.

## Non-Goals
- No changes to `web/src/engine/` game rules, reducer, or AI decision logic.
- No changes to `DuelLogPane.tsx` content or layout.
