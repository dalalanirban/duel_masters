# Multi-Shield Breaker Individual Shield Selection Design

## 1. Intent and The Why
When a player declares an attack with a creature that has a multiple shield-breaking ability (e.g. Double Breaker or Triple Breaker), the game currently requires selecting only 1 shield and then automatically selects the remaining shields in sequential order without player input.
In Duel Masters rules, the attacking player chooses each shield to break. This design enables the player to individually select each shield to break when attacking with multi-breaker creatures, providing complete agency and tactical control over which opponent shields are targeted.

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
- **Individual Shield Selection**: Allow the attacking player to pick exactly `Math.min(breakerCount, unbrokenShieldsCount)` shields individually when attacking with a creature having multiple shield breaking abilities (`breakerCount > 1`).
- **Seamless Single-Breaker UX**: Preserve single-click attack declaration for standard single-breaker creatures (`breakerCount <= 1`) so basic gameplay remains fast and effortless.
- **Clear Multi-Select Feedback**:
  - Display progress in the UI (e.g., *"Select 2 shields to attack (1/2 selected)"*).
  - Numbered badges (`#1`, `#2`, `#3`) on selected shields to clearly indicate target designation and order.
  - Ability to click a selected shield again to unselect / deselect it before the final shield is picked.
  - Auto-dispatch attack once the required number of shields has been picked.
- **Engine Support**:
  - Update `AttackTarget` to support `indices: number[]` alongside backward-compatible `index?: number`.
  - Validate and resolve the exact specified shield indices during combat resolution in `combat.ts`.
  - Update AI attack declaration to pass full shield indices array according to breaker count.

### Non-Goals
- Changing combat resolution mechanics (shield triggers still queue and resolve as normal).
- Modifying creature-vs-creature or direct player attacks.

### Anti-Goals
- Forcing single-breaker creatures to go through a multi-step confirmation or select flow.
- Breaking existing unit tests that pass `{ type: 'shield', index: 0 }`.

---

## 3. Constraints
- Must maintain backward compatibility for tests and AI using `{ type: 'shield', index: number }`.
- Must handle cases where unbroken shields count is less than `breakerCount` (e.g., Double Breaker attacking an opponent with only 1 shield left requires selecting 1 shield).

---

## 4. Approaches Considered

### Approach 1: Upfront Multi-Select at Attack Declaration (Selected)
- **Concept**: When selecting an attacker with `breakerCount > 1`, the opponent's shields enter a multi-select mode. The player clicks each shield individually. As shields are selected, badges (`1`, `2`) appear. Once `requiredCount = Math.min(breakerCount, oppUnbrokenShieldsCount)` shields are selected, the attack declaration is automatically dispatched with `indices: number[]`.
- **Why Chosen**: Very fluid, immediate tactile board feedback, does not interrupt the duel with modals or extra steps, and keeps single-breaker attacks at 1 click.

### Approach 2: Post-Block Selection Interaction Prompt
- **Concept**: Attacker targets the opponent's shields generally. If the opponent chooses not to block (or has no blockers), the game enters a `SHIELD_BREAK_SELECTION` pending interaction where the player selects shields before they break.
- **Trade-off**: Strictly matches physical TCG step timing if blockers exist, but introduces an extra modal/prompt delay on every single multi-breaker attack even when no blockers exist or when attacking without interruption.

---

## 5. Technical Implementation Details

### 5.1 Types (`web/src/engine/types.ts`)
- Update `AttackTarget`:
  ```typescript
  export type AttackTarget =
    | { type: 'shield'; index?: number; indices?: number[] }
    | { type: 'creature'; instanceId: string }
    | { type: 'player' };
  ```

### 5.2 Combat Engine (`web/src/engine/combat.ts`)
- In `canDeclareAttack`:
  - When `target.type === 'shield'`, support both `target.indices` and `target.index`.
  - Ensure all specified indices are within bounds and represent unbroken shields.
  - Ensure indices are distinct.
- In `resolveCombat`:
  - For `target.type === 'shield'`:
    - Determine target indices: `target.indices ?? (target.index !== undefined ? [target.index] : [])`.
    - Gather primary shields matching the specified indices.
    - If fewer indices are provided than `breakerCount` (e.g. from legacy actions), backfill unbroken shields as before to preserve full backward compatibility.
    - Break the gathered shields and queue any Shield Triggers.

### 5.3 AI Engine (`web/src/engine/ai.ts`)
- When AI attacks shields with an attacker having `breakerCount > 1`, collect up to `breakerCount` distinct unbroken shield indices and pass `{ type: 'shield', indices, index: indices[0] }`.

### 5.4 UI State & Interaction (`web/src/components/duel/DuelArena.tsx` & `ShieldsView.tsx`)
- In `DuelArena.tsx`:
  - Track `selectedShieldIndices: number[]`.
  - When an attacker is selected, calculate `requiredBreakerCount = Math.min(attacker.card.breakerCount || 1, oppUnbrokenShieldsCount)`.
  - If `requiredBreakerCount <= 1`:
    - Clicking a shield immediately dispatches `DECLARE_ATTACK` with `target: { type: 'shield', index: shieldIndex, indices: [shieldIndex] }`.
  - If `requiredBreakerCount > 1`:
    - Clicking an unselected shield adds it to `selectedShieldIndices`.
    - Clicking an already-selected shield removes it from `selectedShieldIndices`.
    - If `newSelected.length === requiredBreakerCount`:
      - Dispatch `DECLARE_ATTACK` with `target: { type: 'shield', indices: newSelected, index: newSelected[0] }`.
      - Reset `selectedShieldIndices` and `selectedAttackerId`.
    - Show helper toast or indicator banner: `"Selected X of Y shields to break."`.
  - Clear `selectedShieldIndices` when switching attackers, canceling selection, or changing turns/phases.
- In `ShieldsView.tsx`:
  - Accept `selectedShieldIndices?: number[]` and `requiredSelectionCount?: number`.
  - Render a numbered selection badge (e.g. badge with order `1`, `2`) on selected shields.
  - Update hover/active styles for multi-select state.

### 5.5 Unit Tests (`web/src/engine/tests/combat.test.mjs`)
- Test Double Breaker with explicit `indices: [0, 2]` breaks exactly shield 0 and shield 2.
- Test Triple Breaker with explicit `indices: [1, 3, 4]` breaks exactly shields 1, 3, and 4.
- Test legacy `index: 0` fallback continues to work as expected.
- Test rejection when duplicate indices or broken shield indices are declared.
