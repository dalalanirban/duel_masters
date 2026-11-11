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
  3. All 7 criteria from user feedback verified.
