# Duel Masters Rules Engine & Interactive UI Architecture

This document describes the modular pure-TypeScript Duel Masters rules engine ([web/src/engine/](file:///d:/Duel_Masters/web/src/engine/)) covering **DM-01 through DM-12** (**900 cards across 12 sets**), its acyclic module boundaries, interactive UI prompt pipeline, and Knowledge Graph integration.

---

## 1. Acyclic Module Dependency Architecture

All rules logic executes deterministically on immutable `GameState` snapshots with zero React or DOM dependencies. Modules follow a strictly layered dependency graph so shared rules never duplicate across spells, triggers, combat, or AI decisions:

```
Level 0  types.ts, cardUtils.ts, interactionHelpers.ts
            │
Level 1  mana.ts, continuous.ts, replacements.ts, targeting.ts, state.ts
            │
Level 2  zoneOps.ts, boardRemoval.ts ──► zones.ts (canonical zone movement) ──► effects.ts (legacy facade)
            │
Level 3  triggers.ts, tapAbilities.ts, advancedMechanics.ts, zoneSelection.ts
            │
Level 4  evolution.ts, spells.ts, combat.ts, turn.ts
            │
Level 5  reducer.ts (master step dispatcher), ai.ts (rule-guided bot agent), index.ts
```

### Core Engine Modules

| Module | Responsibility |
|---|---|
| [types.ts](file:///d:/Duel_Masters/web/src/engine/types.ts) | `GameState`, `PlayerState`, `CreatureInstance` (`evolvedOn`, turn modifiers), `ManaCardInstance` (`isSpent`, `isStaged`), `PendingInteraction` union, `GameAction` union |
| [cardUtils.ts](file:///d:/Duel_Masters/web/src/engine/cardUtils.ts) | Capability detection (`getCardCapabilities`), civilization/race normalization, Dragon & Survivor helpers |
| [interactionHelpers.ts](file:///d:/Duel_Masters/web/src/engine/interactionHelpers.ts) | `enqueueInteraction`, `buildZoneOptions` across all 6 zones (`battleZone`, `hand`, `manaZone`, `shields`, `graveyard`, `deck`) |
| [mana.ts](file:///d:/Duel_Masters/web/src/engine/mana.ts) | Cost calculation, multi-civ tapped entry, manual mana staging (`toggleManaTap`), interactive payment validation (`validateManualManaSelection`), spent lock enforcement, distinct dual-civ validation |
| [continuous.ts](file:///d:/Duel_Masters/web/src/engine/continuous.ts) | Continuous power modifiers, Power Attacker, Stealth, Slayer, Speed Attacker, Blocker, Breaker count, Wave Striker, Turbo Rush, Survivor aura sharing |
| [replacements.ts](file:///d:/Duel_Masters/web/src/engine/replacements.ts) | Saver matching, Madness discard replacement, Shield Burn (`Bolmeteus` / `Death Phoenix`), `flattenEvolutionStack`, Vortex `separateEvolutionUnderlyingCreatures` |
| [targeting.ts](file:///d:/Duel_Masters/web/src/engine/targeting.ts) | Declarative spell & ability target filtering and legality validation |
| [zoneOps.ts](file:///d:/Duel_Masters/web/src/engine/zoneOps.ts) | Draw, discard, deck ramp, shield break/burn, `Pulsar Tree` / `Nastasha` shield sacrifice, `Kyuroro` / `Meloppe` defender shield choice, `DECK_SEARCH` & graveyard salvage |
| [boardRemoval.ts](file:///d:/Duel_Masters/web/src/engine/boardRemoval.ts) | Unified destruction/bounce/mana/deck/shield exits with nested evolution stack movement, leave-BZ triggers, and batch pause for interactive Savers |
| [zones.ts](file:///d:/Duel_Masters/web/src/engine/zones.ts) | Unified export boundary combining `zoneOps.ts` and `boardRemoval.ts` |
| [triggers.ts](file:///d:/Duel_Masters/web/src/engine/triggers.ts) | Come-into-play (`triggerCIP`), `triggerAttack`, `triggerBlocked`, `triggerUnblocked`, and `triggerEndTurn` |
| [tapAbilities.ts](file:///d:/Duel_Masters/web/src/engine/tapAbilities.ts) | `hasTapAbility`, `canActivateTapAbility`, and `resolveTapAbility` covering all 41 `$tap` creatures (incl. choose-a-race and Kachua Dragon summons) |
| [advancedMechanics.ts](file:///d:/Duel_Masters/web/src/engine/advancedMechanics.ts) | Wave Striker, Turbo Rush, and Silent Skill resolution (`resolveSilentSkill`, `shouldAiActivateSilentSkill`, `autoResolveAiSilentSkillsDetailed`) |
| [zoneSelection.ts](file:///d:/Duel_Masters/web/src/engine/zoneSelection.ts) | Resolvers for interactive `ZONE_SELECTION` (`resolveZoneSelectionAction`) and `OPTIONAL_CHOICE` (`resolveOptionalChoiceAction`) |
| [evolution.ts](file:///d:/Duel_Masters/web/src/engine/evolution.ts) | Base, `Either-Or`, `Vortex Evolution` validation and nested `evolvedOn` stacking in `summonCreature` |
| [spells.ts](file:///d:/Duel_Masters/web/src/engine/spells.ts) | `canCastSpell`, `castSpell`, and full spell effect resolution across DM-01–DM-12 |
| [combat.ts](file:///d:/Duel_Masters/web/src/engine/combat.ts) | Attack legality (`canDeclareAttack`), `declareAttack`, blocker interception (`declareBlock`), shield break & Shield Trigger queues, `resumeCombatAfterInteraction` |
| [turn.ts](file:///d:/Duel_Masters/web/src/engine/turn.ts) | `startTurn`, `completeHumanSilentSkills`, `passToMainPhase`, `endTurn`, `finalizeEndTurn` |
| [reducer.ts](file:///d:/Duel_Masters/web/src/engine/reducer.ts) | Master `step(state, action)` reducer and `advancePendingState` queue drain |
| [ai.ts](file:///d:/Duel_Masters/web/src/engine/ai.ts) | Heuristic AI (`getAiAction`) handling mana charge, summons, spells, `$tap`, combat, blocking, Silent Skills, optional choices, and zone selections |

---

## 2. Implemented Game Rules & Interactive Pipelines

### 2.1 Manual Mana Selection, Drag-to-Tap, Civilization Matching & Spent Lock
- **Interactive Post-Select Mana Payment (No Auto-Tap)**: Selecting **Summon** (after evolution bait choice, if any) or **Cast** (after target choice, if any) in [DuelArena.tsx](file:///d:/Duel_Masters/web/src/components/duel/DuelArena.tsx) never auto-taps player mana. Unless the exact required mana cards were already manually pre-staged, a compact centered **Tap Mana** prompt opens directly above the player's Shields & Mana Zone showing selected count (`selected/cost`), live per-civilization `✓`/`✗` indicators (`validateManualManaSelection`), `Confirm Summon` / `Confirm Cast`, and `Cancel`.
- **Smooth Click-and-Drag Across Mana Cards**: In [ManaZoneView.tsx](file:///d:/Duel_Masters/web/src/components/duel/ManaZoneView.tsx), player mana cards disable native browser image dragging (`draggable={false}`, `pointer-events-none` on inner artwork/badges, `touch-none`) and use container pointer hit-testing (`data-mana-id` + `document.elementFromPoint` with per-drag deduplication) plus atomic functional state updates so clicking and dragging across cards cleanly toggles `STAGED` or `PAY` across multiple mana cards in one sweep (capped at `requiredCost` during payment).
- **Explicit Civilization Validation**:
  - Mono-civilization cards require at least 1 matching civilization mana card among tapped mana.
  - **Multi-civilization cards** require **distinct tapped mana cards** satisfying each civilization independently (a single `Light/Nature` card cannot simultaneously fulfill both Light and Nature without another matching mana card).
- **Turn Lock & Start-of-Turn Untap**:
  - Mana spent for a summon/cast (or multi-civilization cards charged tapped) sets `isSpent: true`, locking them (`LOCK` badge) from manual untapping until start of turn.
  - `startTurn` automatically resets `isTapped`, `isSpent`, and `isStaged` unless prevented by an active effect such as `DM10-093 Terradragon Cusdalf`.

### 2.2 Interactive `"you may"`, `"opponent chooses"` & 6-Zone Selection
- `initializeGame(..., { interactiveHuman: true })` (used by [DuelArena.tsx](file:///d:/Duel_Masters/web/src/components/duel/DuelArena.tsx)) pauses at human decision points via `pendingInteraction` and `pendingInteractionQueue`, while keeping direct synchronous unit tests and fast AI-vs-AI simulations non-blocking when omitted:
  - **`"you may"` Choices**: Prompted via `OPTIONAL_CHOICE` ([OptionalChoiceModal.tsx](file:///d:/Duel_Masters/web/src/components/duel/OptionalChoiceModal.tsx)) or optional `ZONE_SELECTION` (`minSelections: 0`) for optional draws, Savers (`Kip Chippotto`), Shield Sacrifices (`Pulsar Tree`, `Nastasha`), Destroy-to-Hand replacements (`Aqua Agent`, `Gigastand`, `Dream Pirate`, `Jack Viper`), and EOT Vigilance untaps (`UNTAP_ALL_EOT`).
  - **`"opponent chooses"` & Zone Scopes**: Prompted via [ZoneSelectionModal.tsx](file:///d:/Duel_Masters/web/src/components/duel/ZoneSelectionModal.tsx) restricted strictly to the zone(s) named by the card (`battleZone`, `hand`, `manaZone`, hidden `shields`, `graveyard`, `deck`), including mixed-zone choices (`Crisis Boulder` for BZ/Mana, `Grinning Hunger` for BZ/Shields) and defender shield swaps (`Kyuroro`, `Meloppe`, `Miraculous Meltdown`).

### 2.3 Nested Evolution Stacking & Phoenix Separation
- Evolution creatures summoned onto existing evolutions preserve recursive `evolvedOn` chains (`Evo 2 -> Evo 1 -> Base`) alongside each card's `summonedTurn`.
- Leaving the battle zone normally (`destroy`, `bounce`, `manaZone`, `topOfDeck`, `shields`) moves every stacked base card with the top evolution via `flattenEvolutionStack`.
- Explicit leave-substitution (`Soul Phoenix, Avatar of Unity`) puts only the top evolution card into the destination zone and restores each direct bait creature onto the battle zone with its original `summonedTurn` and nested `evolvedOn` sub-stack intact.

### 2.4 Human Start-of-Turn Silent Skill Choice
- When a human player's turn starts in `interactiveHuman` mode with tapped Silent Skill creatures in the battle zone, `startTurn` pauses at `START_OF_TURN` and displays [SilentSkillModal.tsx](file:///d:/Duel_Masters/web/src/components/duel/SilentSkillModal.tsx) per creature before untap & draw.
- Accepting keeps the creature tapped and triggers its Silent Skill before un-tapping mana, un-tapping remaining creatures, and drawing for turn (`completeHumanSilentSkills`).

### 2.5 Attack vs `$tap` Ability Choice & Phase Rules
- Ready non-summoning-sick creatures possessing `$tap` abilities ([tapAbilities.ts](file:///d:/Duel_Masters/web/src/engine/tapAbilities.ts)) can activate their tap ability during **either** `MAIN` or `ATTACK` phase (`canActivateTapAbility`); activating a `$tap` ability during `MAIN` automatically transitions the turn into `ATTACK` inside `resolveTapAbility`.
- `hasTapAbility` matches case-insensitively (`/\$tap\b|tap ability/i`) so cards formatted as `Tap Ability:` (e.g., `Rikabu's Screwdriver`) are recognized uniformly.
- [BattleZoneView.tsx](file:///d:/Duel_Masters/web/src/components/duel/BattleZoneView.tsx) receives live `gameState` and shows `ATK / $TAP` badges when a creature can attack, or `$TAP` when only its tap ability is legal; selecting the creature opens the choice bar in [DuelArena.tsx](file:///d:/Duel_Masters/web/src/components/duel/DuelArena.tsx), disabling **Attack** if `canCreatureAttack` is false while keeping **`$tap` Ability** actionable.

### 2.6 Card Database Integrity, Live Keywords, Log Ordering & Responsive Layout
- **Keyword Flag & Turbo Rush Hygiene**: [build_card_database.js](file:///d:/Duel_Masters/scripts/build_card_database.js) uses line-anchored `checkShieldTrigger` (`/^\s*(?:■\s*)?shield\s*trigger\b/im`) across DM-01–DM-12 (`84` true Shield Trigger cards; excludes `22` rules-text reference mentions such as `Emeral` and `Cryptic Totem`) and strips `Turbo rush` clauses before evaluating `checkSpeedAttacker` so creatures like `Magmadragon Jagalzor` (`DM08-004`) only gain Speed Attacker dynamically when Turbo Rush unlocks in [combat.ts](file:///d:/Duel_Masters/web/src/engine/combat.ts).
- **Exact Card Name Dispatching & Trigger / Continuous Coverage**: Engine triggers and continuous aura checks in [triggers.ts](file:///d:/Duel_Masters/web/src/engine/triggers.ts) and [continuous.ts](file:///d:/Duel_Masters/web/src/engine/continuous.ts) guard against substring collisions (`Emeral` vs `Emerald Grass`, `Überdragon Bajula` vs `Nemonex, Bajula's Robomantis`, `Gregoria` vs `Gregorian Worm`, `Überdragon Jabaha` vs `Jabaha's Automaton`), implement `Scarlet Skyterror`'s CIP destruction of all `hasCreatureBlocker` creatures across both battle zones (`destroyCreaturesBatch`), and apply `Ultimate Dragon`'s `+5000` power per other friendly Dragon (`hasDragonRace`, excluding Dragonoids and opposing Dragons).
- **Chronological Action Logs**: `castSpell` ([spells.ts](file:///d:/Duel_Masters/web/src/engine/spells.ts)) and `resolveShieldTrigger` ([combat.ts](file:///d:/Duel_Masters/web/src/engine/combat.ts)) append cast/activation entries before `resolveSpellEffect` so card-play logs precede resolved discard or destruction logs.
- **Responsive Viewport Support**: Desktop `lg+` preserves the persistent `w-72` [CardInspectorPane.tsx](file:///d:/Duel_Masters/web/src/components/duel/CardInspectorPane.tsx) and right [DuelLogPane.tsx](file:///d:/Duel_Masters/web/src/components/duel/DuelLogPane.tsx), while `< lg` viewports switch to a compact top HUD bar + slide-over drawers, horizontal-scroll-safe [HandView.tsx](file:///d:/Duel_Masters/web/src/components/duel/HandView.tsx), wrapping [ShieldsView.tsx](file:///d:/Duel_Masters/web/src/components/duel/ShieldsView.tsx), and responsive [App.tsx](file:///d:/Duel_Masters/web/src/App.tsx) navigation down to narrow screens (`480px`+).

### 2.7 Battle Arena v2: Async Presentation, Dual Modes, Audio, Lazy Three.js VFX & Interrupt Polish
- **Ref-Backed Async Presentation Middleware** ([usePresentationQueue.ts](file:///d:/Duel_Masters/web/src/presentation/usePresentationQueue.ts), [compilePresentationBeats.ts](file:///d:/Duel_Masters/web/src/presentation/compilePresentationBeats.ts)): Computes `(prev, action, next)` synchronously via `dispatchWithPresentation`, splits 2-step combat cleanly without duplicate attack VFX, makes `CAST_SPELL` a first-class beat keeping targets visible prior to dissolve, holds `SHIELD_BROKEN` snapshots intact ahead of `SHIELD_TRIGGER`, supports non-leaking `Space` / skip-layer fast-forward, and keeps `TOGGLE_MANA_TAP` / `UNDO_CHARGE_MANA` strictly `0ms`.
- **Smart Visual Modes (`Lite` + `Anime Drama`)** ([visualMode.ts](file:///d:/Duel_Masters/web/src/presentation/visualMode.ts), [vite.config.ts](file:///d:/Duel_Masters/web/vite.config.ts)): Defaults to `lite` on viewports `< 1024px`, `prefers-reduced-motion`, or missing WebGL2, and `drama` on WebGL2 desktops. `ThreeVfxStage` sits behind `React.lazy()` with `vendor-three` split out (`0 bytes` fetched in `Lite`, automatic `webglcontextlost` fallback to `Lite`).
- **Procedural Web Audio** ([AudioEngine.ts](file:///d:/Duel_Masters/web/src/audio/AudioEngine.ts), [civilizationPatches.ts](file:///d:/Duel_Masters/web/src/audio/civilizationPatches.ts)): Five-civilization synth voices routed through master gain (`slider^2` persisted in `localStorage`) and a dynamics compressor, with `65ms` multi-break/wipe staggering, an `8`-voice cap, headless safe no-ops, and `visibilitychange` suspend/resume.
- **`THREE.GLSL3` Shaders, Cached Anchors & Anime Cut-Ins** ([ThreeVfxStage.tsx](file:///d:/Duel_Masters/web/src/vfx/ThreeVfxStage.tsx), [shaders.ts](file:///d:/Duel_Masters/web/src/vfx/shaders.ts), [anchorRegistry.ts](file:///d:/Duel_Masters/web/src/vfx/anchorRegistry.ts), [TraumaViewport.tsx](file:///d:/Duel_Masters/web/src/components/duel/TraumaViewport.tsx), [AnimeCutInOverlay.tsx](file:///d:/Duel_Masters/web/src/components/duel/AnimeCutInOverlay.tsx)): Pooled ES 3.00 shaders (`SummonPortal`, `EnergyBeam`, `FresnelShield`, `ParticleGlow`), canvas-local `[data-vfx-id]` caching (`0` DOM layout reads in `rAF`), `hitStopMs` freeze frames, auto-sleeping `setAnimationLoop(null)`, and diagonal card-scan anime Cut-Ins.
- **Ergonomic Arena, `Peek Board` & Log Severity Tiers**: Collapsed duel navbar + corner `UtilityCornerPill`, `MidlineControlAnchor`, reserved `PlayerClockBadge` (`--:--`), collapsible mobile Mana Strip, ornate SVG `CardBack`, timer-safe `Peek Board` restore pills with safe battlefield inspection across `BlockerModal` / `TriggerModal` / `ZoneSelectionModal` / `OptionalChoiceModal`, and `classifyLogSeverity` tiers with collapsed rail unread indicator ([duelLogParser.ts](file:///d:/Duel_Masters/web/src/components/duel/duelLogParser.ts), [DuelLogPane.tsx](file:///d:/Duel_Masters/web/src/components/duel/DuelLogPane.tsx)).

---

## 3. UI & Presentation Component Inventory

- [App.tsx](file:///d:/Duel_Masters/web/src/App.tsx) — Collapsible site header during active duels, Card Explorer & Deck Builder layout, and full-viewport Duel Arena mount.
- [DuelArena.tsx](file:///d:/Duel_Masters/web/src/components/duel/DuelArena.tsx) — `MotionConfig` + strict `LazyMotion (domMax)` shell, ref-backed presentation queue, audio/VFX orchestration, safe-peek board lock, keyboard shortcuts (`Space`, `Escape`, `L`).
- [UtilityCornerPill.tsx](file:///d:/Duel_Masters/web/src/components/duel/UtilityCornerPill.tsx), [MidlineControlAnchor.tsx](file:///d:/Duel_Masters/web/src/components/duel/MidlineControlAnchor.tsx), [PlayerClockBadge.tsx](file:///d:/Duel_Masters/web/src/components/duel/PlayerClockBadge.tsx), [CardBack.tsx](file:///d:/Duel_Masters/web/src/components/duel/CardBack.tsx) — Floating utility/audio/mode switcher, right-edge phase CTA anchor, future clock slot, and procedural vector card backs.
- [BattleZoneView.tsx](file:///d:/Duel_Masters/web/src/components/duel/BattleZoneView.tsx), [ManaZoneView.tsx](file:///d:/Duel_Masters/web/src/components/duel/ManaZoneView.tsx), [HandView.tsx](file:///d:/Duel_Masters/web/src/components/duel/HandView.tsx), [ShieldsRow.tsx](file:///d:/Duel_Masters/web/src/components/duel/ShieldsRow.tsx), [ShieldsView.tsx](file:///d:/Duel_Masters/web/src/components/duel/ShieldsView.tsx), [CardInspectorPane.tsx](file:///d:/Duel_Masters/web/src/components/duel/CardInspectorPane.tsx), [DuelLogPane.tsx](file:///d:/Duel_Masters/web/src/components/duel/DuelLogPane.tsx).
- [ThreeVfxStage.tsx](file:///d:/Duel_Masters/web/src/vfx/ThreeVfxStage.tsx), [shaders.ts](file:///d:/Duel_Masters/web/src/vfx/shaders.ts), [anchorRegistry.ts](file:///d:/Duel_Masters/web/src/vfx/anchorRegistry.ts), [TraumaViewport.tsx](file:///d:/Duel_Masters/web/src/components/duel/TraumaViewport.tsx), [AnimeCutInOverlay.tsx](file:///d:/Duel_Masters/web/src/components/duel/AnimeCutInOverlay.tsx).
- [BlockerModal.tsx](file:///d:/Duel_Masters/web/src/components/duel/BlockerModal.tsx), [TriggerModal.tsx](file:///d:/Duel_Masters/web/src/components/duel/TriggerModal.tsx), [ZoneSelectionModal.tsx](file:///d:/Duel_Masters/web/src/components/duel/ZoneSelectionModal.tsx), [OptionalChoiceModal.tsx](file:///d:/Duel_Masters/web/src/components/duel/OptionalChoiceModal.tsx), [SilentSkillModal.tsx](file:///d:/Duel_Masters/web/src/components/duel/SilentSkillModal.tsx), [DeckSearchModal.tsx](file:///d:/Duel_Masters/web/src/components/duel/DeckSearchModal.tsx).

---

## 4. Verification & Knowledge Graph Maintenance

```bash
# Run full test sweep (419 tests / 119 suites: engine + data + presentation + audio + VFX)
node --test web/src/engine/tests/*.test.mjs web/src/data/cardLoader.test.mjs web/src/presentation/tests/*.test.mjs web/src/audio/tests/*.test.mjs web/src/vfx/tests/*.test.mjs

# Typecheck & Vite production bundle build (with isolated vendor-three split)
npm --prefix web run build

# Refresh Graphify code graph after edits
graphify update .
```

Graphify is configured via [.graphifyignore](file:///d:/Duel_Masters/.graphifyignore), [.agents/rules/graphify.md](file:///d:/Duel_Masters/.agents/rules/graphify.md), [.agents/workflows/graphify.md](file:///d:/Duel_Masters/.agents/workflows/graphify.md), and git hooks (`post-commit`, `post-checkout`, merge driver in `.gitattributes`) to keep `graphify-out/` synchronized cleanly across commits.
