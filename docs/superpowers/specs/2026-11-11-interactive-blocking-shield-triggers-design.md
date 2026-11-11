# Interactive Blocking and Shield Trigger Prompt Design

## 1. Intent and The Why
In the current web implementation of Duel Masters, when an opponent creature attacks or breaks a shield with a shield trigger, the opponent auto-play loop in `DuelArena.tsx` mistakenly takes actions on behalf of the human player after only 700ms. Players lose agency over blocker decisions and shield trigger activations.
This design restores player agency by pausing the AI loop during player-owned pending interactions and presenting an interactive, two-step blocker prompt and shield trigger prompt, both guarded by a 10-second countdown timer.

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
- **Fix AI Preemption**: Prevent the AI loop from automatically deciding player-owned blocker declarations (`BLOCK_DECLARATION`) or shield trigger resolutions (`SHIELD_TRIGGER_RESOLUTION`).
- **Two-Step Blocker Workflow**:
  - Prompt: "Opponent is attacking! Do you want to block?" with a 10-second countdown timer.
  - If player chooses to block:
    - If exactly 1 blocker is available: automatically block with that creature.
    - If multiple blockers are available: transition to a blocker selection view to let the player pick which creature blocks.
  - If player clicks "Pass / Do Not Block" or the 10-second timer expires: proceed with `blockerId: null` (unblocked attack on original target).
- **Shield Trigger Countdown Workflow**:
  - When a shield trigger is drawn, display `TriggerModal` with a 10-second countdown timer.
  - If player activates: cast/summon trigger with chosen targets (if required).
  - If player clicks "Skip / Add to Hand" or the 10-second timer expires: skip trigger and add card to hand.
- **Visual Countdown Feedback**: Clear visual countdown (e.g. animated progress bar and numerical seconds remaining) in both modals.

### Non-Goals
- Altering the core engine rules, card data, or AI decision logic for the opponent's own turns and blockers.
- Changing combat resolution formulas (power calculations, slayer, double breaker, etc.).

### Anti-Goals
- Freezing the game permanently if a player is AFK (the 10-second timer guarantees the duel progresses per game rules).
- Breaking existing engine unit tests.

---

## 3. Constraints
- Must work within React state and existing engine action contracts (`DECLARE_BLOCK`, `RESOLVE_SHIELD_TRIGGER`).
- Timers must properly clean up on unmount or when the player resolves the interaction early to prevent memory leaks or duplicate dispatches.

---

## 4. Approaches Considered

### Approach 1: Two-Step Interactive Modal (Selected)
- **Concept**: Separate the decision "Do I want to block?" from "Which creature blocks?". Auto-select if there is only 1 blocker, otherwise present the selection view. Apply a synchronized 10-second countdown to both Blocker and Shield Trigger modals.
- **Why Chosen**: Directly fulfills user requirement, reduces cognitive overload (simple yes/no prompt first), and prevents accidental card taps.

### Approach 2: Single-Screen Immediate Action Modal with Countdown
- **Concept**: Present the blocker cards list immediately along with a Pass button and countdown.
- **Trade-off**: Doesn't provide an initial prompt to block and skips the single-blocker auto-select convenience.

### Approach 3: Engine-Level Interaction State Changes
- **Concept**: Add new engine interactions like `BLOCK_PROMPT` vs `BLOCK_SELECTION` in `combat.ts`.
- **Trade-off**: Overcomplicates pure game engine state for what is fundamentally a client UX flow.

---

## 5. Technical Implementation Details

### 5.1 `web/src/components/duel/DuelArena.tsx`
- Refactor the auto-play condition:
  ```typescript
  const isOpponentPendingInteraction =
    (state.pendingInteraction?.type === 'BLOCK_DECLARATION' &&
      state.pendingInteraction.defendingPlayer === 'opponent') ||
    (state.pendingInteraction?.type === 'SHIELD_TRIGGER_RESOLUTION' &&
      state.pendingInteraction.player === 'opponent');

  const isPlayerPendingInteraction =
    (state.pendingInteraction?.type === 'BLOCK_DECLARATION' &&
      state.pendingInteraction.defendingPlayer === 'player') ||
    (state.pendingInteraction?.type === 'SHIELD_TRIGGER_RESOLUTION' &&
      state.pendingInteraction.player === 'player');

  const isOpponentTurnActive = state.activePlayer === 'opponent' && !isPlayerPendingInteraction;
  ```
- Guard `triggerAiStep` so it never runs actions on behalf of `'player'`.

### 5.2 `web/src/components/duel/BlockerModal.tsx`
- Add countdown state (10s, ticks every 100ms or 1s, with visual progress bar).
- Add view step state: `'PROMPT'` vs `'SELECT'`.
- Reset view step to `'PROMPT'` whenever a new attack interaction opens.
- Step `'PROMPT'`:
  - Shows incoming attacker information.
  - Buttons:
    - `[Yes, Intercept Attack]` (Primary green/amber button)
    - `[Pass / Do Not Block]` (Slate button)
  - If `validBlockers.length === 1`: clicking Intercept immediately calls `onDeclareBlock(validBlockers[0].instanceId)`.
  - If `validBlockers.length > 1`: clicking Intercept switches step to `'SELECT'`.
- Step `'SELECT'`:
  - Shows the available blockers grid (with effective power and outcome predictions).
  - Clicking a blocker calls `onDeclareBlock(blocker.instanceId)`.
  - Also includes a back/pass button.
- On timeout (0s): calls `onDeclareBlock(null)`.

### 5.3 `web/src/components/duel/TriggerModal.tsx`
- Add 10-second countdown timer with visual progress bar.
- Shows current trigger card, target selector (if targeting spell), and buttons:
  - `[Cast / Summon Shield Trigger]`
  - `[Skip (Add to Hand)]`
- On timeout (0s): calls `onResolve(currentTrigger.shieldId, false)`.
- Resets timer on each trigger resolution if multiple triggers occurred.

---

## 6. Verification Plan
- **Automated Tests**: Run existing engine test suite (`npm test` in `web/` or node tests) to ensure no regressions.
- **Manual / Interactive Testing**:
  - Verify player with 1 blocker gets prompt and clicking "Yes" auto-blocks.
  - Verify player with multiple blockers gets prompt and clicking "Yes" shows blocker selection list.
  - Verify 10-second countdown bar in `BlockerModal` and auto-pass on timeout.
  - Verify 10-second countdown bar in `TriggerModal` and auto-skip on timeout.
  - Verify AI auto-play functions properly during AI turns without auto-resolving player triggers.
