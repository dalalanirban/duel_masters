# UI Feature Testing & Design Verification Standard

> **MANDATORY FOR ALL UI TASKS**: Whenever building, refactoring, or polishing any UI feature, you must strictly follow this verification standard before marking the task complete.

## 1. Automated Visual Verification via Playwright
- Always launch and use browser automation (`playwright` or `chrome-devtools-mcp`) to navigate to the running application.
- Take high-resolution screenshots of the live UI across relevant game states (empty arena, cards in hand, mana charged, creatures summoned, attack targeting, card hover, modal open).
- Visually inspect the rendered output, element bounding boxes, font rendering, text truncation, and spacing. Never assume code edits look right without seeing the actual rendered pixels.

## 2. Design Standards & Anti-Slop Enforcement
- **Anti-Slop (`design-taste-frontend` standard)**:
  - Reject generic AI-made aesthetics: eliminate unnecessary rounded border boxes around every container, nested gradient wrappers, tacky watermark text in empty spaces, and cluttered button stacks.
  - Maintain a **premium, minimalist, lightweight dark-mode aesthetic** (`#07090e` / `#0b0f17` palette with refined border filaments).
  - High breathing room: never squeeze cards into tiny postage stamps while leaving massive empty striped boxes.
  - Dedicated focus on typography: use `tabular-nums` for numbers, crisp tracking, and clean hierarchy.

## 3. Game Design & TCG UX Standards (`game-ui-ux`, `card-game`, `game-feel`)
- **Card-First Design**: The artwork and tactical stats of cards are sacred. Never cover cards with chunky button overlays.
- **Shield Realism**: Shields must look like authentic TCG shields / protective card barriers with heraldic crests and energy borders—never wireframe button boxes.
- **Battle Zone Prominence**: The battlefield is the centerpiece of the duel. Allocate the primary flex height to the active combat zone so creatures can be large, readable, and visually impactful.
- **Inspector Sticky State**: Card inspection must stay visible when the user moves their mouse to read abilities; never reset inspector state on mouse-leave. Show only tactical gameplay-relevant data (Cost, Name, Type, Civ, Power, Breakers, Race, Abilities); strip collector/set/illustrator trivia during duels.
- **Action Elegance**: Card actions (Summon, Charge) must appear as floating, minimalist glass pills above the card, preserving full card visibility.

## 4. Verification Gate
- No UI feature may be declared done without:
  1. TypeScript typecheck & production build passing (`npm run build --prefix web`).
  2. Live browser testing and screenshot evidence verified via Playwright / DevTools.
  3. All criteria from user feedback verified.
  4. When raising or sharing a PR, verify live PR status via `gh pr view` and report mergeability and status checks per `pr-workflow-and-status-checks.md`.

## 5. Mandatory UI Testing Checklist & Layout Guardrails

Before submitting or requesting review for ANY UI change:

- [ ] **Panel Width Constraint**:
  - The left Card Inspector Pane must strictly maintain `18rem` (`w-72 2xl:w-72`). Never inflate or allow media queries (like `2xl:w-[26rem]` or `2xl:w-[24.5rem]`) to widen it.
- [ ] **Vertical Space Budget & Abilities Visibility**:
  - The "Abilities & Effects" container in `CardInspectorPane` MUST have prominent vertical breathing room.
  - Card artwork preview must be compact (height ~130–140px, e.g. `h-32 sm:h-34 aspect-[491/682] max-w-[105px]`).
  - Card stats (Cost, Power, Type, Civilization, Keywords, Race) must be consolidated into a sleek inline/two-line bar taking ≤ 55px total.
  - Standard cards (including cards with substantial rules text like *King Depthcon*) must display all abilities cleanly without requiring initial vertical scroll on standard 900px desktop viewports.
- [ ] **Arena Layout Symmetry & Zones**:
  - Battle Zone occupies primary flex space between opponent and player zones.
  - Deck and Graveyard occupy parallel slots at left/right flanks of shield and mana areas.
  - Player hand and opponent hand are horizontally centered without clashing labels.
- [ ] **Live Visual Verification Gate**:
  - Use Playwright / browser tools at desktop resolution (1440x900) to inspect:
    1. Initial turn state with deck selector.
    2. Card inspection with full stats, badges, and abilities visible.
    3. Live targeting & combat interactions.
  - Inspect screenshots before committing. Evidence before assertions always.
