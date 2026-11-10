# Core Duel & Rules Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete, deterministic, tournament-accurate Duel Masters Rules & Battle Engine supporting game initialization, 6-phase turn lifecycles, mana rules, summoning, evolution, spell casting, blocker interception, shield breaks, shield triggers, and victory conditions, with an interactive web duel arena.

**Architecture:**
- Create a pure, functional state machine in `web/src/engine/` (`types.ts`, `state.ts`, `turn.ts`, `mana.ts`, `spells.ts`, `combat.ts`, `reducer.ts`).
- All state transitions operate via `step(state: GameState, action: GameAction): GameState` with zero side-effects.
- Adhere to official tournament rules: 5 shields, 5 initial hand cards, Turn 1 draw skip for Player 1, multi-civ mana tapped rule, summoning sickness (unless Speed Attacker/Evolution), Blocker interception, Slayer power mutual destruction, and Shield Triggers.
- Provide a responsive Web Duel Arena (`DuelArena.tsx`) with playable highlights, phase controls, combat arrows, blocker/trigger dialogs, and game logs.
- Verify through comprehensive unit tests (`node:test`) and interactive browser playtesting, then open a GitHub Pull Request via `gh pr create`.

**Tech Stack:** TypeScript, React 18, Tailwind CSS, Lucide Icons, Vite, Node.js Test Runner (`node:test`).

**References:**
- Duel Masters Quick Start Guide & Rulebook (Wizards of the Coast / Takara Tomy)
- DM Rulebook FAQ & Official Rules (Fandom Wiki)
- Official tournament rules: Turn 1 draw skip, multi-civ tapped mana, shield trigger free casting.

## Global Constraints
- Pure deterministic engine with 100% reproducible test scenarios.
- Complete type-safety with zero unhandled `any`.
- Backward compatibility: Deck builder and card database remain fully functional.
- Zero extra external runtime dependencies.

## Review Focus
1. **Turn 1 First-Player Draw Skip:** Player 1 must not draw on turn 1. Player 2 draws on turn 1.
2. **Mana Civilization Matching:** Paying for a card requires at least 1 mana of each civilization the card belongs to.
3. **Multi-Civilization Tapped Entry:** Multi-civ cards charged into mana must enter tapped.
4. **Summoning Sickness & Evolution Inheritance:** Summoned creatures cannot attack on the turn summoned unless Speed Attacker or Evolution; Evolution inherits tapped state from bait creature.
5. **Shield Trigger Execution Order:** Broken shields with Shield Trigger can be cast/summoned immediately for 0 mana before combat finishes.

---

### Task 1: Engine Types, Game State & Initialization

**Files:**
- Create: `web/src/engine/types.ts`
- Create: `web/src/engine/state.ts`
- Create: `web/src/engine/tests/setup.test.mjs`

**Interfaces:**
- Produces:
  - `PlayerId`, `Phase`, `CardInstance`, `CreatureInstance`, `ShieldInstance`, `ManaCardInstance`, `PlayerState`, `GameState`, `GameAction`.
  - `initializeGame(deck1: Deck, deck2: Deck, startingPlayer?: PlayerId): GameState`.

- [ ] **Step 1: Write unit tests for game setup & initialization**
In `web/src/engine/tests/setup.test.mjs`:
- Test that each player starts with 5 shields, 5 hand cards, 30 cards in deck, 0 in mana, 0 in battle zone, 0 in graveyard.
- Test that `turn === 1`, `activePlayer === 'player'`, `phase === 'MANA_CHARGE'` (draw skipped on turn 1).
- Test that card instances have unique IDs and reference the original card definition.

- [ ] **Step 2: Implement `types.ts` and `state.ts`**
Define interfaces and implement `initializeGame()`.

- [ ] **Step 3: Run unit tests**
Run: `node --test web/src/engine/tests/setup.test.mjs`
Expected: PASS.

- [ ] **Step 4: Commit**
```bash
git add web/src/engine/
git commit -m "feat(engine): define core game state types and setup initialization"
```

---

### Task 2: Turn Lifecycle, Draw Step & Mana Charging

**Files:**
- Create: `web/src/engine/turn.ts`
- Create: `web/src/engine/mana.ts`
- Create: `web/src/engine/tests/turn.test.mjs`

**Interfaces:**
- Produces:
  - `startTurn(state: GameState): GameState`
  - `chargeMana(state: GameState, player: PlayerId, cardInstanceId: string): GameState`
  - `validateManaPayment(manaZone: ManaCardInstance[], card: CardDefinition): boolean`
  - `tapManaForCost(manaZone: ManaCardInstance[], card: CardDefinition): ManaCardInstance[]`
  - `endTurn(state: GameState): GameState`

- [ ] **Step 1: Write unit tests for turn flow and mana rules**
In `web/src/engine/tests/turn.test.mjs`:
- Test that untap step untaps all friendly mana and battle zone creatures.
- Test that Turn 2 draws 1 card, but empty deck triggers deck-out loss.
- Test that charging mana only allows 1 card per turn.
- Test that multi-civ cards enter mana tapped; mono-civ cards enter untapped.
- Test mana payment validation: cost check and civilization requirement check.

- [ ] **Step 2: Implement `turn.ts` and `mana.ts`**
Implement untap, draw, deckout checks, mana charging, and civilizational payment validation.

- [ ] **Step 3: Run unit tests**
Run: `node --test web/src/engine/tests/turn.test.mjs`
Expected: PASS.

- [ ] **Step 4: Commit**
```bash
git add web/src/engine/turn.ts web/src/engine/mana.ts web/src/engine/tests/turn.test.mjs
git commit -m "feat(engine): implement turn lifecycle, draw step, and mana charging rules"
```

---

### Task 3: Main Phase: Summoning, Evolution & Spell Casting

**Files:**
- Create: `web/src/engine/spells.ts`
- Create: `web/src/engine/evolution.ts`
- Create: `web/src/engine/tests/mainPhase.test.mjs`

**Interfaces:**
- Produces:
  - `summonCreature(state: GameState, player: PlayerId, cardInstanceId: string, baitInstanceId?: string): GameState`
  - `castSpell(state: GameState, player: PlayerId, cardInstanceId: string, targets?: string[]): GameState`

- [ ] **Step 1: Write unit tests for summoning, evolution, and spells**
In `web/src/engine/tests/mainPhase.test.mjs`:
- Test summoning deducts mana, moves card from hand to battle zone, sets summoning sickness.
- Test Speed Attacker bypasses summoning sickness.
- Test Evolution creature requires valid bait creature in battle zone matching evolution race, stacks on top, and ignores summoning sickness.
- Test spell casting resolves effect (e.g. destroy, tap, bounce, draw) and sends to graveyard.
- Test Charger spells move to mana zone untapped instead of graveyard.

- [ ] **Step 2: Implement `evolution.ts` and `spells.ts`**
Implement summoning, evolution stacking, spell resolver, and charger redirection.

- [ ] **Step 3: Run unit tests**
Run: `node --test web/src/engine/tests/mainPhase.test.mjs`
Expected: PASS.

- [ ] **Step 4: Commit**
```bash
git add web/src/engine/evolution.ts web/src/engine/spells.ts web/src/engine/tests/mainPhase.test.mjs
git commit -m "feat(engine): implement creature summoning, evolution stacking, and spell resolution"
```

---

### Task 4: Attack Phase, Blockers & Combat Resolution

**Files:**
- Create: `web/src/engine/combat.ts`
- Create: `web/src/engine/tests/combat.test.mjs`

**Interfaces:**
- Produces:
  - `declareAttack(state: GameState, attackerId: string, target: AttackTarget): GameState`
  - `declareBlock(state: GameState, blockerId: string | null): GameState`
  - `resolveCombat(state: GameState): GameState`
  - `resolveShieldTrigger(state: GameState, shieldId: string, playTrigger: boolean, targets?: string[]): GameState`

- [ ] **Step 1: Write unit tests for combat, blockers, shield breaks, and triggers**
In `web/src/engine/tests/combat.test.mjs`:
- Test attack taps creature, validates summoning sickness and untapped state.
- Test creature vs creature power comparison (lower dies, tie both die, slayer kills winner).
- Test blocker interception prompts blocker choice, taps blocker, redirects attack.
- Test shield break breaks shields equal to breaker count, adds to hand.
- Test Shield Trigger detection allows immediate free cast/summon.
- Test direct attack with 0 shields declares attacker the winner.

- [ ] **Step 2: Implement `combat.ts`**
Implement attack declaration, blocker interception, power calculations, shield break handling, trigger queue, and victory checks.

- [ ] **Step 3: Run unit tests**
Run: `node --test web/src/engine/tests/combat.test.mjs`
Expected: PASS.

- [ ] **Step 4: Commit**
```bash
git add web/src/engine/combat.ts web/src/engine/tests/combat.test.mjs
git commit -m "feat(engine): implement combat resolution, blocker interception, and shield triggers"
```

---

### Task 5: Master Reducer, Action Dispatcher & Full Game Simulation

**Files:**
- Create: `web/src/engine/reducer.ts`
- Create: `web/src/engine/index.ts`
- Create: `web/src/engine/tests/fullGame.test.mjs`

**Interfaces:**
- Produces:
  - `step(state: GameState, action: GameAction): GameState`
  - Full game simulation test covering a complete 1v1 match from setup to victory.

- [ ] **Step 1: Implement `reducer.ts` and `index.ts`**
Wire all action types through a clean reducer:
- `CHARGE_MANA`, `SUMMON_CREATURE`, `CAST_SPELL`, `DECLARE_ATTACK`, `DECLARE_BLOCK`, `RESOLVE_TRIGGER`, `END_TURN`.

- [ ] **Step 2: Write end-to-end game simulation test**
In `web/src/engine/tests/fullGame.test.mjs`:
- Play a simulated 5-turn duel with Shobu vs Kokujo starter decks.
- Charge mana, summon creatures, cast spells, attack shields, trigger Holy Awe, and deliver winning direct attack.

- [ ] **Step 3: Run all engine tests and build check**
Run: `node --test web/src/engine/tests/*.test.mjs`
Run: `npm run build --prefix web`
Expected: PASS.

- [ ] **Step 4: Commit**
```bash
git add web/src/engine/reducer.ts web/src/engine/index.ts web/src/engine/tests/fullGame.test.mjs
git commit -m "feat(engine): implement master reducer and end-to-end duel simulation test"
```

---

### Task 6: Interactive Duel Arena Web UI Integration

**Files:**
- Create: `web/src/components/duel/DuelArena.tsx`
- Create: `web/src/components/duel/BattleZoneView.tsx`
- Create: `web/src/components/duel/ManaZoneView.tsx`
- Create: `web/src/components/duel/ShieldsView.tsx`
- Create: `web/src/components/duel/HandView.tsx`
- Create: `web/src/components/duel/TriggerModal.tsx`
- Modify: `web/src/App.tsx`

**Interfaces:**
- Navigation tab in `App.tsx`: "Card Explorer" vs "Duel Arena".
- Visual rendering of both players' zones, interactive playable cards, attack targeting, blocker selection, trigger popups, and victory celebration.

- [ ] **Step 1: Build Duel Arena components**
Implement visual layout for battlefield, mana, shields, hand, and action controls.

- [ ] **Step 2: Connect engine state to React UI**
Wire `useReducer(step, initialGameState)` with interactive action buttons and dialogs.

- [ ] **Step 3: Verify TypeScript build**
Run: `npm run build --prefix web`
Expected: PASS with 0 errors.

- [ ] **Step 4: Commit**
```bash
git add web/src/components/duel/ web/src/App.tsx
git commit -m "feat(ui): implement interactive Duel Arena with playable zones and action controls"
```

---

### Task 7: End-to-End Verification & Pull Request Creation

**Files:**
- Dev server verification on `http://localhost:3000`

- [ ] **Step 1: Test interactive duel in browser**
  - Verify card zones, turn flow, mana charging, summoning, attacking, blocking, shield breaking, and victory screen.
- [ ] **Step 2: Run all test suites**
  - `node --test web/src/engine/tests/*.test.mjs`
  - `node --test web/src/data/cardLoader.test.mjs`
  - `node --test web/src/utils/deckStorage.test.mjs`
  - `npm run build --prefix web`
- [ ] **Step 3: Push branch and create Pull Request**
  - `git push -u origin feature/core-duel-rules-engine`
  - `gh pr create --title "feat: Core Duel & Rules Battle Engine with Interactive Arena" --body "..."`
