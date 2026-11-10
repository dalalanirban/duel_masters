# Declarative Card Rules & Effect Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Overview
Build an authoritative, declarative, composable effect engine (`web/src/engine/effects.ts`) supporting all 900 cards across DM-01 to DM-12.
The engine standardizes triggers (`ON_ENTER`, `ON_ATTACK`, `ON_DESTROY`, `ON_END_OF_TURN`, `STATIC_BUFF`), replacement effects (bounce/mana instead of graveyard), Survivor ability sharing, Civilization Stealth, and advanced mass spells into pure functional pipelines.

---

### Task 1: Core Effect Engine Primitives & Trigger Pipeline

**Files:**
- Create: `web/src/engine/effects.ts`
- Create: `web/src/engine/tests/effectsPrimitives.test.mjs`

**Interfaces:**
- `triggerCIP(state: GameState, player: PlayerId, creature: CreatureInstance, targets?: string[]): GameState`
- `triggerAttack(state: GameState, player: PlayerId, attacker: CreatureInstance, target: AttackTarget): GameState`
- `triggerEndTurn(state: GameState, activePlayer: PlayerId): GameState`
- `discardRandomHandCards(state: GameState, player: PlayerId, count: number): GameState`
- `searchDeckForCard(state: GameState, player: PlayerId, filterFn: (c: CardDefinition) => boolean, dest: 'hand' | 'manaZone' | 'shields'): GameState`
- `salvageFromGraveyard(state: GameState, player: PlayerId, filterFn: (c: CardDefinition) => boolean, dest: 'hand' | 'battleZone'): GameState`

- [ ] **Step 1: Implement `web/src/engine/effects.ts`**
  Build pure atomic primitive operations and regex rule matching for CIP triggers, discard, deck search, and graveyard salvage.
- [ ] **Step 2: Write tests in `web/src/engine/tests/effectsPrimitives.test.mjs`**
  Cover draw, ramp, discard, deck search, graveyard salvage, and trigger invocation.
- [ ] **Step 3: Run tests & verify**
  Run: `node --test web/src/engine/tests/effectsPrimitives.test.mjs`
- [ ] **Step 4: Commit Task 1**
  Commit: `feat(engine): implement core declarative effect engine and atomic primitives`

---

### Task 2: Attack Triggers, Stealth & Untapped Creature Targeting

**Files:**
- Modify: `web/src/engine/combat.ts`
- Modify: `web/src/engine/effects.ts`
- Create: `web/src/engine/tests/attackTriggers.test.mjs`

**Mechanics:**
- Stealth: `Light stealth`, `Water stealth`, `Darkness stealth`, `Fire stealth`, `Nature stealth` (unblockable if opponent has matching civilization in mana zone).
- Attack Untapped Creatures: `"This creature can attack untapped creatures"` (e.g. *Bloodwing Mantis*, *Meteor Dragon*).
- Attack Triggers: `"Whenever this creature attacks..."` (power buffs, destruction, discard, draw).

- [ ] **Step 1: Wire attack triggers and stealth in `combat.ts`**
  Hook `triggerAttack()` inside `declareAttack()`. In `canDeclareAttack()`, allow targeting untapped opponent creatures if attacker has the untapped attack ability. In `declareAttack()`, check stealth against opponent mana zone to bypass blockers.
- [ ] **Step 2: Write unit tests in `web/src/engine/tests/attackTriggers.test.mjs`**
- [ ] **Step 3: Run tests & verify**
  Run: `node --test web/src/engine/tests/attackTriggers.test.mjs`
- [ ] **Step 4: Commit Task 2**
  Commit: `feat(engine): implement attack triggers, stealth, and untapped creature combat`

---

### Task 3: Destruction Replacement Effects & Leaves-Play Triggers

**Files:**
- Modify: `web/src/engine/spells.ts`
- Modify: `web/src/engine/combat.ts`
- Modify: `web/src/engine/effects.ts`
- Create: `web/src/engine/tests/destructionEffects.test.mjs`

**Mechanics:**
- Self-bounce replacement: *"When this creature would be destroyed, return it to your hand instead."* (*Aqua Soldier*, *Chilias, the Oracle*).
- Mana zone replacement: *"When this creature would be destroyed, put it into your mana zone instead."* (*Pochan, Ocean Guardian*, *Stinger Worm*).
- On-destruction triggers: *"When this creature is destroyed..."* (draw card, opponent discards, destroy opponent creature).

- [x] **Step 1: Enhance `destroyCreature` in `spells.ts` with replacement hooks**
  Check rules text before moving to graveyard; route to hand or mana zone if replacement rule applies.
- [x] **Step 2: Write tests in `web/src/engine/tests/destructionEffects.test.mjs`**
- [x] **Step 3: Run tests & verify**
  Run: `node --test web/src/engine/tests/destructionEffects.test.mjs`
- [x] **Step 4: Commit Task 3**
  Commit: `feat(engine): implement destruction replacement and leaves-play triggers`

---

### Task 4: Survivor Mechanics & Continuous Auras

**Files:**
- Modify: `web/src/engine/effects.ts`
- Modify: `web/src/engine/combat.ts`
- Create: `web/src/engine/tests/survivorAndAuras.test.mjs`

**Mechanics:**
- Survivor ability sharing: DM-05 Survivor creatures share their abilities (Blocker, Slayer, Power Attacker +X) with all friendly Survivors in the battle zone.
- Continuous civilization/race buffs: *"All your Fire creatures get +1000 power"*, *"Your Dragons get..."*.

- [x] **Step 1: Implement `applySurvivorAbilities` and aura power calculation in `effects.ts`**
  Integrate with `getCreatureEffectivePower` in `combat.ts`.
- [x] **Step 2: Write tests in `web/src/engine/tests/survivorAndAuras.test.mjs`**
- [x] **Step 3: Run tests & verify**
  Run: `node --test web/src/engine/tests/survivorAndAuras.test.mjs`
- [x] **Step 4: Commit Task 4**
  Commit: `feat(engine): implement Survivor ability sharing and continuous auras`

---

### Task 5: Mass Board Wipes & Advanced Spells

**Files:**
- Modify: `web/src/engine/spells.ts`
- Create: `web/src/engine/tests/advancedSpells.test.mjs`

**Mechanics:**
- Mass Board Wipes: *Apocalypse Day* (destroy all creatures if 6 or more in battle zone), *Burst Shot* (destroy all creatures power 2000 or less), *Searing Wave* (destroy all opponent creatures power 3000 or less).
- Graveyard Salvage: *Dark Reversal* (return creature from graveyard to hand), *Zombie Carnival* (return up to 3 creatures of same race from graveyard to hand).
- Mass Mana Destruction / Hand Wipes: *Lost Soul* (opponent discards entire hand).

- [ ] **Step 1: Implement advanced spell handlers in `spells.ts`**
- [ ] **Step 2: Write unit tests in `web/src/engine/tests/advancedSpells.test.mjs`**
- [ ] **Step 3: Run tests & verify**
  Run: `node --test web/src/engine/tests/advancedSpells.test.mjs`
- [ ] **Step 4: Commit Task 5**
  Commit: `feat(engine): implement mass board wipe spells and graveyard salvage`

---

### Task 6: Master Engine Integration, Verification & Pull Request

**Files:**
- Modify: `web/src/engine/index.ts`
- Modify: `web/src/engine/reducer.ts`
- Modify: `web/src/engine/ai.ts`

- [ ] **Step 1: Wire barrel exports and ensure reducer & AI recognize all new triggers**
- [ ] **Step 2: Run all test suites across the entire codebase**
  Run: `node --test web/src/engine/tests/*.test.mjs`
  Run: `node --test web/src/data/cardLoader.test.mjs`
  Run: `node --test web/src/utils/deckStorage.test.mjs`
- [ ] **Step 3: Verify TypeScript production build**
  Run: `npm run build --prefix web`
- [ ] **Step 4: Commit, Push branch and raise Pull Request #4**
  Run: `git push -u origin feature/declarative-card-rules-engine`
  Run: `gh pr create --title "feat: Declarative Card Rules and Effect Engine across DM-01 to DM-12" --body "..."`
