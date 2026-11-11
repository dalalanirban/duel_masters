# Interactive Blocking & Shield Trigger 10s Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide manual interactive control for player blocking (two-step prompt: confirm block -> select blocker if multiple) and shield trigger activation with a 10-second visual countdown timer, eliminating AI preemption.

**Architecture:** 
1. Fix `DuelArena.tsx` auto-play trigger condition so AI never steps when a pending interaction belongs to `'player'`.
2. Upgrade `BlockerModal.tsx` to handle a two-step flow (`PROMPT` -> `SELECT`) with 10-second countdown and auto-pass on timeout.
3. Upgrade `TriggerModal.tsx` with a synchronized 10-second countdown and auto-skip on timeout.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Lucide React, Node.js Test Runner.

**Spec:** `docs/superpowers/specs/2026-11-11-interactive-blocking-shield-triggers-design.md`

## Global Constraints
- Target 10-second timeout across both Blocker and Shield Trigger modals.
- Timer ticks down visibly and smoothly (e.g. interval updating remaining seconds/percentage).
- Timers MUST clear cleanly when the interaction resolves or component unmounts.
- Auto-pass (`blockerId: null`) on blocker timeout; Auto-skip (`activate: false`) on shield trigger timeout.
- Single blocker auto-selects upon clicking "Yes, Block"; multiple blockers navigate to blocker selection screen.
- All existing engine tests (`node web/src/engine/tests/*.test.mjs`) and TypeScript build must pass.

## Review Focus
1. Opponent declares attack against player when player controls 1 blocker: modal prompts "Do you want to block?", clicking "Yes" auto-blocks without asking to pick.
2. Opponent declares attack against player when player controls 2+ blockers: modal prompts "Do you want to block?", clicking "Yes" shows blocker cards list to select.
3. 10-second timer hits 0 on Blocker modal: automatically submits `DECLARE_BLOCK` with `blockerId: null`, closing the modal and resuming combat.
4. Broken shield contains Shield Trigger: `TriggerModal` opens and does NOT get auto-resolved after 700ms by AI auto-play.
5. 10-second timer hits 0 on Shield Trigger modal: automatically calls `onResolve(shieldId, false)` sending the card to player's hand and resuming game.

---

### Task 1: Prevent AI Preemption in `DuelArena.tsx`

**Files:**
- Modify: `web/src/components/duel/DuelArena.tsx`

**Interfaces:**
- Consumes: `state.pendingInteraction`, `state.activePlayer`
- Produces: Correctly guarded `useEffect` that runs `triggerAiStep` only during opponent's own actions and interactions, never when player action is required.

- [ ] **Step 1: Update auto-play condition and `triggerAiStep` guard in `DuelArena.tsx`**
  - Compute `isPlayerPendingInteraction`:
    ```typescript
    const isPlayerPendingInteraction =
      Boolean(state.pendingInteraction &&
        (('defendingPlayer' in state.pendingInteraction && state.pendingInteraction.defendingPlayer === 'player') ||
         ('player' in state.pendingInteraction && state.pendingInteraction.player === 'player')));
    ```
  - In `useEffect` for auto-play, check:
    ```typescript
    const isOpponentTurnActive = state.activePlayer === 'opponent' && !isPlayerPendingInteraction;
    const isOpponentPendingInteraction =
      (state.pendingInteraction?.type === 'BLOCK_DECLARATION' &&
        state.pendingInteraction.defendingPlayer === 'opponent') ||
      (state.pendingInteraction?.type === 'SHIELD_TRIGGER_RESOLUTION' &&
        state.pendingInteraction.player === 'opponent');

    if (isOpponentTurnActive || isOpponentPendingInteraction) {
      const timer = setTimeout(() => {
        triggerAiStep();
      }, 700);
      return () => clearTimeout(timer);
    }
    ```
  - In `triggerAiStep`, ensure `aiTargetPlayer` is NEVER `'player'` when triggered from the opponent auto-play.

- [ ] **Step 2: Verify TypeScript compilation**
  Run: `cmd /c "cd web && npx tsc --noEmit"`
  Expected: Exit code 0 (clean compile).

---

### Task 2: Implement Two-Step Blocker Workflow with 10s Timer in `BlockerModal.tsx`

**Files:**
- Modify: `web/src/components/duel/BlockerModal.tsx`

**Interfaces:**
- Consumes: `interaction: BlockerChoiceInteraction | null`, `onDeclareBlock: (blockerId: string | null) => void`
- Produces: Two-step UI (`PROMPT` and `SELECT`) with 10s timer bar and auto-pass on timeout.

- [ ] **Step 1: Add timer and view step state to `BlockerModal.tsx`**
  - State: `timeLeft` (10 seconds), `modalStep: 'PROMPT' | 'SELECT'`.
  - Reset `timeLeft` to 10 and `modalStep` to `'PROMPT'` whenever `interaction` changes or modal opens.
  - Set up `setInterval` ticking every 100ms or 1000ms.
  - When `timeLeft <= 0`, trigger `onDeclareBlock(null)`.
  - Clear interval on unmount or when `onDeclareBlock` is invoked.

- [ ] **Step 2: Render Step 1 ("PROMPT")**
  - Display incoming attacker card and power.
  - Show animated progress bar for remaining seconds (10s -> 0s).
  - Show available blocker count: e.g. "You have 1 Blocker ready to intercept" or "You have 2 Blockers ready to intercept".
  - Action buttons:
    - Primary Button: `[Shield Icon] Intercept Attack`:
      - If `validBlockers.length === 1`: calls `onDeclareBlock(validBlockers[0].instanceId)`.
      - If `validBlockers.length > 1`: sets `modalStep = 'SELECT'`.
    - Secondary Button: `[X Icon] Pass / Do Not Block`:
      - Calls `onDeclareBlock(null)`.

- [ ] **Step 3: Render Step 2 ("SELECT")**
  - Visible only when `modalStep === 'SELECT'` and multiple blockers exist.
  - Display available blocker cards grid with outcome badges ("Survives & Destroys", "Mutual Destruction", "Defeated").
  - Clicking a blocker calls `onDeclareBlock(blocker.instanceId)`.
  - Include a "Back to decision" button and "Pass / Do Not Block" button.

- [ ] **Step 4: Verify TypeScript compilation**
  Run: `cmd /c "cd web && npx tsc --noEmit"`
  Expected: Exit code 0.

---

### Task 3: Implement 10s Countdown in `TriggerModal.tsx`

**Files:**
- Modify: `web/src/components/duel/TriggerModal.tsx`

**Interfaces:**
- Consumes: `interaction: ShieldTriggerChoiceInteraction | null`, `onResolve: (shieldId: string, activate: boolean, targets?: string[]) => void`
- Produces: 10-second countdown with progress bar and auto-skip on expiration.

- [ ] **Step 1: Add timer state and interval to `TriggerModal.tsx`**
  - State: `timeLeft` (10 seconds).
  - Reset `timeLeft` to 10 whenever `currentTrigger?.shieldId` changes.
  - Set up `setInterval` ticking down to 0.
  - When `timeLeft <= 0`, trigger `handleSkip()` (`onResolve(currentTrigger.shieldId, false)`).
  - Clean up interval on unmount or when action is triggered.

- [ ] **Step 2: Render visual countdown bar and numerical indicator**
  - Add visual progress bar above or next to the header alert banner in `TriggerModal`.
  - Display countdown badge: `⏱ {timeLeft}s remaining to activate`.
  - Primary button: `[Zap Icon] Cast / Summon Shield Trigger`.
  - Secondary button: `[ArrowRight Icon] Skip (Add to Hand)`.

- [ ] **Step 3: Verify TypeScript compilation**
  Run: `cmd /c "cd web && npx tsc --noEmit"`
  Expected: Exit code 0.

---

### Task 4: Full Suite Verification & Build

**Files:**
- Verification only

- [ ] **Step 1: Run all engine unit tests**
  Run: `node web/src/engine/tests/combat.test.mjs`
  Run: `node web/src/engine/tests/fullGame.test.mjs`
  Run: `node web/src/engine/tests/cipAndShields.test.mjs`
  Run: `node web/src/engine/tests/baseDecksMatchSimulation.test.mjs`
  Expected: All tests pass.

- [ ] **Step 2: Verify web build**
  Run: `cmd /c "cd web && npx vite build"`
  Expected: Vite build succeeds with bundle outputs in `dist/`.
