# Battlezone Active-Voice Logs, Slow Animations & Spell Spotlight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add active-voice fading action logs over the active player's battlezone, a brief spell card spotlight overlay, slow shield-break/card-movement animations, and a paced AI loop in `DuelArena.tsx`.

**Architecture:** Keep `web/src/engine/` pure and synchronous. Add a pure active-voice log translator, CSS keyframe animations in `web/src/index.css`, a `pointer-events-none` `BattlezoneOverlay` component for the floating log + spell spotlight, and visual diffing in `ShieldsView.tsx` / `BattleZoneView.tsx` / `DuelArena.tsx` with an `isAnimating` gate for the AI auto-play loop.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Lucide icons, Vite (`npm run build`).

**Spec:** [2026-11-26-battlezone-animations-logs-design.md](file:///c:/Github/duel_masters/docs/superpowers/specs/2026-11-26-battlezone-animations-logs-design.md)

## Global Constraints
- Do not modify `web/src/engine/` game rules, reducer, or AI decision logic.
- Keep `DuelLogPane.tsx` content and layout unchanged.
- All battlezone overlays must use `pointer-events-none` so they never block card clicks or targeting.
- Must pass `npm run build` (`tsc && vite build`) in `web/` with zero TypeScript or Vite errors.

## Review Focus
- Rapid consecutive AI actions must not overlap or skip animations; `isAnimating` must gate the AI `useEffect` until the current animation finishes.
- `toActiveVoiceLog` must handle both `player` and `opponent` prefixes as well as unrecognized log lines gracefully without throwing.
- Broken shield ghost animations must clean up after their timeout (~800ms) so they don't linger or accumulate.
- Spell spotlight must clear cleanly even if a new spell is cast or the game is reset mid-animation.
- Battlezone log overlay must remain readable on both player and opponent halves without blocking clicks.

---

### Task 1: Active-Voice Log Translator

**Files:**
- Create: `web/src/components/duel/activeVoiceLog.ts`

**Interfaces:**
- Produces: `export interface BattlezoneLogEntry { id: string; actor: 'player' | 'opponent'; text: string; createdAt: number; }`
- Produces: `export function toActiveVoiceLog(rawLog: string, actor: 'player' | 'opponent'): string`

- [ ] **Step 1: Create `web/src/components/duel/activeVoiceLog.ts`**
  Implement `toActiveVoiceLog(rawLog: string, actor: 'player' | 'opponent'): string` to rewrite engine log strings into active voice from the acting player's perspective:
  - `"Player"` / `"Opponent"` prefixes stripped, converted to `"I ..."`:
  - Shield break: `"I break your shield"` (or `"I break your N shields"` if multiple)
  - Summon: `"I summon <card>"`
  - Cast spell: `"I cast <card>"`
  - Charge mana: `"I charge <card> to mana"`
  - Attack creature / player: `"I attack <target>"` / `"I attack you directly"`
  - Block: `"I block with <card>"`
  - Destroy / discard / draw: `"I draw ..."`, `"I destroy ..."`, `"I discard ..."`
  - Fallback: return cleaned string with `"I "` prefix if it started with `"Player "` / `"Opponent "`, otherwise return `rawLog`.

- [ ] **Step 2: Verify TypeScript compilation**
  Run: `cd web && npx tsc --noEmit`
  Expected: Exit 0, no errors.

- [ ] **Step 3: Commit**
  ```bash
  git add web/src/components/duel/activeVoiceLog.ts
  git commit -m "feat(duel): add active-voice log translator for battlezone feed"
  ```

---

### Task 2: CSS Keyframe Animations

**Files:**
- Modify: `web/src/index.css:30-37`

**Interfaces:**
- Produces CSS classes: `.animate-bz-log`, `.animate-spell-spotlight`, `.animate-shield-break`, `.animate-card-enter`

- [ ] **Step 1: Add keyframe animations to `web/src/index.css`**
  - `@keyframes bzLogFade`: fade in quickly (0–12%), stay visible (12–75%), fade out + slight upward drift (75–100%) over `2.6s`.
  - `@keyframes spellSpotlight`: scale from `0.75` to `1.05` with glow (0–20%), hold (20–70%), scale to `1.12` + fade out (70–100%) over `1.4s`.
  - `@keyframes shieldBreak`: flash, shake/tilt, scale down + fade out over `0.8s`.
  - `@keyframes cardEnter`: slide up/in from `translateY(14px) scale(0.92)` to `translateY(0) scale(1)` over `0.6s`.

- [ ] **Step 2: Verify build**
  Run: `cd web && npm run build`
  Expected: Exit 0.

- [ ] **Step 3: Commit**
  ```bash
  git add web/src/index.css
  git commit -m "style(duel): add keyframes for battlezone logs, spell spotlight, shield break, and card enter"
  ```

---

### Task 3: Battlezone Floating Log Overlay & Spell Spotlight

**Files:**
- Create: `web/src/components/duel/BattlezoneOverlay.tsx`

**Interfaces:**
- Consumes: `BattlezoneLogEntry` from `./activeVoiceLog`, `CardDefinition` from `../../types/card`
- Produces: `export const BattlezoneOverlay: React.FC<{ logs: BattlezoneLogEntry[]; activePlayer: 'player' | 'opponent'; spellSpotlight: { card: CardDefinition; actor: 'player' | 'opponent'; key: number } | null; }>`

- [ ] **Step 1: Create `web/src/components/duel/BattlezoneOverlay.tsx`**
  - Render `pointer-events-none` container over the battlezone.
  - Display up to 3 recent `logs` positioned near the active player's battlezone side (`activePlayer === 'opponent'` top half, `'player'` bottom half), styled as compact, high-contrast pills with `.animate-bz-log` so they fade out smoothly.
  - When `spellSpotlight` is non-null, render the spell card image (with `imageAssetPath` / `imageUrl` fallback) and card name centered over the battlezone with `.animate-spell-spotlight` and an amber/arcane glow.

- [ ] **Step 2: Verify TypeScript compilation**
  Run: `cd web && npx tsc --noEmit`
  Expected: Exit 0.

- [ ] **Step 3: Commit**
  ```bash
  git add web/src/components/duel/BattlezoneOverlay.tsx
  git commit -m "feat(duel): add BattlezoneOverlay for active-voice logs and spell spotlight"
  ```

---

### Task 4: Slow Shield Break & Card Movement Animations

**Files:**
- Modify: `web/src/components/duel/ShieldsView.tsx`
- Modify: `web/src/components/duel/BattleZoneView.tsx`

- [ ] **Step 1: Inspect `ShieldsView.tsx` and add broken-shield ghost animation**
  - Track previous `shields` array; when a shield is removed, briefly render a ghost shield element with `.animate-shield-break` (~800ms) before cleaning it up.
- [ ] **Step 2: Add slow card entrance & transition in `BattleZoneView.tsx`**
  - Track newly added `creature.instanceId`s in `battleZone` and apply `.animate-card-enter` (~600ms) to entering creatures.
  - Increase tap/untap transition duration to `duration-500` so tapping/attacking is visibly smooth and deliberate.

- [ ] **Step 3: Verify TypeScript compilation**
  Run: `cd web && npx tsc --noEmit`
  Expected: Exit 0.

- [ ] **Step 4: Commit**
  ```bash
  git add web/src/components/duel/ShieldsView.tsx web/src/components/duel/BattleZoneView.tsx
  git commit -m "feat(duel): animate shield breaks and slow card movements"
  ```

---

### Task 5: Wire Event Queue & Paced AI Loop in `DuelArena.tsx`

**Files:**
- Modify: `web/src/components/duel/DuelArena.tsx`

- [ ] **Step 1: Track `state.actionLog` diffs in `DuelArena.tsx`**
  - Maintain `prevLogLengthRef` to detect newly added log lines.
  - Translate each new log line with `toActiveVoiceLog` and append to `bzLogs` (auto-expiring after `2600ms`).
  - Detect spell casts (e.g. log matching cast spell) and set `spellSpotlight` for `1400ms`.
  - Detect shield breaks or zone movements and set `isAnimating` for the corresponding duration (`1400ms` for spell, `800ms` for shield break, `600ms` for creature summon/move).
- [ ] **Step 2: Gate the AI auto-play `useEffect` on `isAnimating`**
  - In the AI auto-play `useEffect`, return early if `isAnimating` is `true` so the AI waits for each animation/spell spotlight to finish before taking its next action.
- [ ] **Step 3: Render `<BattlezoneOverlay />` inside the battlezone container in `DuelArena.tsx`**
- [ ] **Step 4: Run full build verification**
  Run: `cd web && npm run build`
  Expected: Exit 0, clean `tsc` and `vite build`.
- [ ] **Step 5: Commit**
  ```bash
  git add web/src/components/duel/DuelArena.tsx
  git commit -m "feat(duel): wire battlezone overlay, spell spotlight, and paced AI loop"
  ```
