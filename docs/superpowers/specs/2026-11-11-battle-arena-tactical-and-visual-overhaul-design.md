# Battle Arena Tactical & Visual Overhaul Design

## Intent & The Why
Transform the Duel Masters battle arena into a tournament-grade, responsive, and tactile web experience. Applying newly integrated principles from `design-taste-frontend`, `awesome-design-md`, `card-game`, and `game-feel`:
1. Provide instant tactical feedback (playable hand highlighting, civilization mana pips, and combat targeting spotlights).
2. Refine the visual craft (playmat texture vignette, hand hover lift, refined watermarks, unified cockpit borders).
3. Introduce game feel (turn transition announcements and shield break impact).

## Core Requirements

### 1. Tactical Clarity (`card-game` & `game-ui-ux`)
- **Civilization Mana Pips**:
  - In `ManaZoneView.tsx`, display small civilization orbs next to `Untapped / Total` mana count representing available untapped civilizations (Light 🟡, Water 🔵, Darkness 🟣, Fire 🔴, Nature 🟢).
- **Playable Card Glow in Hand**:
  - In `HandView.tsx`, compute whether each card in player's hand can be summoned/cast:
    - Must be player's turn and MAIN phase.
    - Card mana cost <= untapped mana count.
    - At least one card in mana zone shares a civilization with the card.
    - For evolution creatures, must have a valid bait in the battle zone.
  - Apply an active emerald/amber glow border (`ring-2 ring-emerald-400 shadow-emerald-500/30`) to playable cards.
  - Keep unplayable cards at standard neutral borders.
- **Combat Targeting Spotlight**:
  - When `selectedAttackerId` is active:
    - Valid creature targets (tapped opposing creatures) glow with an active red targeting ring and crosshair icon.
    - Intact opposing shields glow with amber/red targeting rings.
    - Non-targetable elements (untapped opposing creatures, empty zones) are slightly dimmed (`opacity-60`) to guide focus.

### 2. High-End Visual Craft (`design-taste-frontend` & `awesome-design-md`)
- **Playmat Vignette & Depth**:
  - In `DuelArena.tsx`, add subtle dark radial vignette and woven mesh styling (`bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-900/40 via-slate-950/80 to-[#070b14]`).
- **Dynamic Hand Fan & Hover Lift**:
  - Player hand cards gain negative horizontal margin overlap on small/medium viewports with smooth hover lift (`-translate-y-2.5 scale-108 z-30 shadow-2xl`).
- **Watermark Refinements**:
  - Zone watermarks use wide tracking (`tracking-[0.25em]`), `font-cinzel`, and subtle civilization corner accents at 10-12% opacity.

### 3. Game Feel & Juice (`game-feel`)
- **Turn Switch Banner**:
  - In `DuelArena.tsx`, when `state.turn` or `state.activePlayer` changes, trigger an ephemeral 1.2s centered announcement overlay:
    - `"TURN X — YOUR TURN"` (with golden glow) or `"TURN X — OPPONENT'S TURN"` (with indigo glow).
    - Pointer-events-none, hardware-accelerated fade-and-scale transition.
- **Shield Break Visual Pulse**:
  - In `ShieldsView.tsx`, add break animations when shields decrease.

## Non-Goals & Constraints
- Must NOT cause root viewport scrolling (100vh lock must be preserved).
- Must preserve all existing rules engine mechanics and card abilities.
- All existing engine and frontend tests must pass (`npm run build --prefix web`).
