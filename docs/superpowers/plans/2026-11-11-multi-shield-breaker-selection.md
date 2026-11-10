# Multi-Shield Breaker Individual Shield Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable players to individually select each shield to break when attacking with creatures with multiple shield breaking abilities (such as Double Breaker or Triple Breaker), while preserving instant single-click targeting for standard single breakers.

**Architecture:** Extend `AttackTarget` to support `indices: number[]` alongside backward-compatible `index?: number`. Update `canDeclareAttack` and `resolveCombat` to validate and break the designated shield indices. Update `ai.ts` to supply full shield indices when attacking with multi-breakers. Update `DuelArena.tsx` and `ShieldsView.tsx` with interactive multi-shield selection state, numbered badges, and automatic dispatch once the required shield count is selected.

**Tech Stack:** TypeScript, React, Vite, Node test runner (`node --test`).

**Spec:** [`docs/superpowers/specs/2026-11-11-multi-shield-breaker-selection-design.md`](file:///c:/Github/duel_masters/docs/superpowers/specs/2026-11-11-multi-shield-breaker-selection-design.md)

## Global Constraints

- Must maintain backward compatibility for existing code and tests using `{ type: 'shield', index: number }`.
- Must handle situations where unbroken shields count is fewer than creature's `breakerCount`.
- Must preserve 1-click attack declaration for single-breaker creatures.

## Review Focus

1. *Double Breaker attacks when opponent has only 1 unbroken shield remaining*: Must only require selecting 1 shield and resolve cleanly without crashing.
2. *Attacking player clicks already-selected shield during multi-select*: Must toggle / unselect that shield and reduce selection count.
3. *Duplicate shield indices in attack target*: Engine must validate and reject duplicate indices.
4. *Broken shield targeted in indices*: Engine must validate and reject already-broken shield indices.
5. *Shield triggers on multi-break*: Broken shields with shield triggers must continue to trigger in proper sequence regardless of the order they were selected.

---

### Task 1: Engine & Types - Multi-Shield Target Validation and Combat Resolution

**Files:**
- Modify: `web/src/engine/types.ts:13-17`
- Modify: `web/src/engine/combat.ts:127-149,434-470`
- Test: `web/src/engine/tests/combat.test.mjs`

**Interfaces:**
- Consumes: `AttackTarget`, `ShieldInstance`, `GameState`
- Produces: Updated `AttackTarget = { type: 'shield'; index?: number; indices?: number[] } | ...`, `canDeclareAttack`, `resolveCombat`

- [ ] **Step 1: Write the failing tests in `web/src/engine/tests/combat.test.mjs`**

Add unit tests in `Shield Breaking & Breaker Counts` suite:
- Double Breaker with explicit `indices: [0, 2]` breaks shield 0 and shield 2 specifically (not sequential 0 and 1).
- Double Breaker targeting duplicate indices (`indices: [0, 0]`) is rejected by `canDeclareAttack`.
- Double Breaker targeting an already-broken shield in `indices` is rejected by `canDeclareAttack`.
- Double Breaker with legacy `index: 1` continues to break shield 1 and backfill one unbroken shield.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node web/src/engine/tests/combat.test.mjs`
Expected: FAIL due to missing support for `target.indices` and duplicate validation.

- [ ] **Step 3: Update `AttackTarget` in `web/src/engine/types.ts`**

Change `AttackTarget`:
```typescript
export type AttackTarget =
  | { type: 'shield'; index?: number; indices?: number[] }
  | { type: 'creature'; instanceId: string }
  | { type: 'player' };
```

- [ ] **Step 4: Update `canDeclareAttack` and `resolveCombat` in `web/src/engine/combat.ts`**

In `canDeclareAttack`:
- If `target.type === 'shield'`:
  - Determine indices: `target.indices ?? (target.index !== undefined ? [target.index] : [])`.
  - Validate `indices.length > 0`.
  - Check duplicates: `new Set(indices).size === indices.length`.
  - For each `idx` in `indices`: validate `idx >= 0 && idx < defendingPlayer.shields.length && !defendingPlayer.shields[idx].isBroken`.

In `resolveCombat`:
- If `target.type === 'shield'`:
  - Determine target indices: `target.indices ?? (target.index !== undefined ? [target.index] : [])`.
  - Push matching unbroken shields into `shieldsToBreak`.
  - If `shieldsToBreak.length < breakerCount`: backfill remaining unbroken shields (preserving legacy behavior when only `index` was given).
  - Proceed with existing broken cards and trigger resolution logic.

- [ ] **Step 5: Run tests to verify they pass**

Run: `node web/src/engine/tests/combat.test.mjs`
Expected: PASS with all tests passing.

- [ ] **Step 6: Commit**

```bash
git add web/src/engine/types.ts web/src/engine/combat.ts web/src/engine/tests/combat.test.mjs
git commit -m "feat(engine): support individual shield selection for multiple shield breakers"
```

---

### Task 2: AI Support for Multi-Shield Breaker Declarations

**Files:**
- Modify: `web/src/engine/ai.ts:80-105`
- Test: `web/src/engine/tests/baseDeckMechanics.test.mjs`

**Interfaces:**
- Consumes: `AttackTarget`, `getAiAction`, `breakerCount`
- Produces: AI actions with `indices: number[]` when declaring attacks on shields.

- [ ] **Step 1: Write test for AI multi-shield selection in `web/src/engine/tests/baseDeckMechanics.test.mjs`**

Add test:
- When AI attacks with a Double Breaker (e.g. King Depthcon or Valdios) against shields, the generated `DECLARE_ATTACK` action includes `target.indices` with 2 distinct valid shield indices.

- [ ] **Step 2: Run test to verify it fails**

Run: `node web/src/engine/tests/baseDeckMechanics.test.mjs`
Expected: FAIL because AI currently emits single `index: 0`.

- [ ] **Step 3: Update AI attack generation in `web/src/engine/ai.ts`**

When generating a shield attack:
- Get `breakerCount = Math.max(1, creature.card.breakerCount || 1)`.
- Find all unbroken shield indices: `unbrokenIndices`.
- Slice `targetIndices = unbrokenIndices.slice(0, breakerCount)`.
- Set `target: { type: 'shield', index: targetIndices[0], indices: targetIndices }`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node web/src/engine/tests/baseDeckMechanics.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/engine/ai.ts web/src/engine/tests/baseDeckMechanics.test.mjs
git commit -m "feat(ai): emit multi-shield indices for AI multi-breaker attacks"
```

---

### Task 3: Interactive Multi-Shield Selection in UI

**Files:**
- Modify: `web/src/components/duel/ShieldsView.tsx`
- Modify: `web/src/components/duel/DuelArena.tsx`

**Interfaces:**
- Consumes: `ShieldsViewProps`, `DECLARE_ATTACK`, `selectedAttackerId`
- Produces: Visual multi-selection with numbered badge indicators and auto-dispatch when required shield count is met.

- [ ] **Step 1: Update `ShieldsViewProps` and badge rendering in `web/src/components/duel/ShieldsView.tsx`**

Add props:
```typescript
interface ShieldsViewProps {
  shields: ShieldInstance[];
  owner: PlayerId;
  canTargetShields?: boolean;
  selectedTarget?: AttackTarget | null;
  selectedShieldIndices?: number[];
  requiredSelectionCount?: number;
  onSelectShield?: (index: number) => void;
}
```
- In the shield item rendering:
  - Check `const selectionOrder = selectedShieldIndices?.indexOf(index);`
  - If `selectionOrder !== undefined && selectionOrder >= 0`:
    - Apply active selection border & ring (e.g. `ring-2 ring-red-400 border-red-400 bg-red-950/60 scale-105`).
    - Render a prominent badge with target order `#{selectionOrder + 1}`.
  - Update header hint text: if `requiredSelectionCount && requiredSelectionCount > 1`, show `"Select shields (" + (selectedShieldIndices?.length || 0) + "/" + requiredSelectionCount + ")"`.

- [ ] **Step 2: Implement multi-shield selection state and handling in `web/src/components/duel/DuelArena.tsx`**

In `DuelArena.tsx`:
- Add state: `const [selectedShieldIndices, setSelectedShieldIndices] = useState<number[]>([]);`
- Compute `selectedAttacker`:
  ```typescript
  const selectedAttacker = selectedAttackerId
    ? state.players.player.battleZone.find((c) => c.instanceId === selectedAttackerId)
    : null;
  const attackerBreakerCount = selectedAttacker?.card.breakerCount || 1;
  const oppUnbrokenShieldsCount = state.players.opponent.shields.filter((s) => !s.isBroken).length;
  const requiredBreakerCount = Math.min(attackerBreakerCount, oppUnbrokenShieldsCount);
  ```
- Clear `selectedShieldIndices` when:
  - Attacker changes or is unselected (`setSelectedAttackerId(null)`).
  - Turn, phase, or active player changes.
  - Restart / reset game is triggered.
- Update `handleSelectShieldTarget(shieldIndex: number)`:
  - If `requiredBreakerCount <= 1`:
    - Dispatch `DECLARE_ATTACK` with `target: { type: 'shield', index: shieldIndex, indices: [shieldIndex] }`.
    - Reset `selectedAttackerId(null)` and `selectedShieldIndices([])`.
  - If `requiredBreakerCount > 1`:
    - If `selectedShieldIndices.includes(shieldIndex)`:
      - Unselect it: `setSelectedShieldIndices(prev => prev.filter(i => i !== shieldIndex))`.
    - Else:
      - `const next = [...selectedShieldIndices, shieldIndex];`
      - If `next.length === requiredBreakerCount`:
        - Dispatch `DECLARE_ATTACK` with `target: { type: 'shield', indices: next, index: next[0] }`.
        - Reset `selectedAttackerId(null)` and `selectedShieldIndices([])`.
      - Else:
        - `setSelectedShieldIndices(next);`
        - `showToast(`Selected ${next.length} of ${requiredBreakerCount} shields.`);`
- Pass `selectedShieldIndices` and `requiredSelectionCount={requiredBreakerCount}` to `ShieldsView`.

- [ ] **Step 3: Verify TypeScript compilation and production build**

Run: `cd web; npm.cmd run build`
Expected: Vite build succeeds with 0 type errors.

- [ ] **Step 4: Run all engine test suites**

Run: `node --test web/src/engine/tests/*.test.mjs`
Expected: 100% of test suites pass (138+ tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/components/duel/ShieldsView.tsx web/src/components/duel/DuelArena.tsx
git commit -m "feat(ui): interactive individual shield selection for multiple shield breakers"
```
