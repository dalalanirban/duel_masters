# Battle Arena Tactical & Visual Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement tactical readability (mana pips, playable card glow, targeting spotlights), visual craft (tournament playmat depth, hand hover lift), and combat juice (turn announcements) in the Duel Masters arena.

**Architecture:** Update `ManaZoneView.tsx`, `HandView.tsx`, `BattleZoneView.tsx`, `ShieldsRow.tsx`, and `DuelArena.tsx` with dedicated computation helpers for playability, targeting states, and animation cues while maintaining 100vh lock.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Lucide Icons, Vite.

**Spec:** [`docs/superpowers/specs/2026-11-11-battle-arena-tactical-and-visual-overhaul-design.md`](file:///d:/Duel_Masters/docs/superpowers/specs/2026-11-11-battle-arena-tactical-and-visual-overhaul-design.md)

## Global Constraints
- **Zero Viewport Scroll**: Maintain 100vh viewport lock; all rows must fit without vertical window scrolling.
- **Engine Purity**: No modifications to core engine logic; all checks are UI affordances derived from game state.
- **Clean Build**: `npm run build --prefix web` must pass with 0 errors.

---

### Task 1: Tactical Readability (Mana Pips, Playable Card Glow & Targeting Spotlight)

- [x] In `ManaZoneView.tsx`: compute available untapped civilization colors and render compact civilization dots.
- [x] In `HandView.tsx`: compute playability (mana cost <= untapped mana, civ match in mana zone, evolution bait check) and apply active playability aura ring and badge.
- [x] In `BattleZoneView.tsx` & `ShieldsRow.tsx`: dim non-targetable elements when an attacker is selected and spotlight valid attack targets (tapped creatures, shields).
- [x] Verify build with `npm run build --prefix web`.

### Task 2: Visual Craft & Playmat Elegance

- [x] In `DuelArena.tsx`: add tournament playmat radial vignette and refined cockpit container borders.
- [x] In `HandView.tsx`: add card fan overlap styling and smooth spring hover lift (`-translate-y-2 scale-106 shadow-2xl`).
- [x] Refine watermarks across all zones (`tracking-[0.25em]`, `font-cinzel`, 12% opacity).
- [x] Verify build with `npm run build --prefix web`.

### Task 3: Game Feel & Turn Announcements

- [x] In `DuelArena.tsx`: implement turn change announcement overlay (1.2s ephemeral toast-banner with golden/indigo sheen).
- [x] Add attack declaration impact cues and combat focus indicators.
- [x] Verify build with `npm run build --prefix web`.

### Task 4: Master Verification, Screenshot Capture & Commit

- [x] Verify web application on `http://localhost:3000/`.
- [x] Capture screenshot of live duel arena.
- [x] Commit all changes and push to `feature/compact-watermark-layout`.
