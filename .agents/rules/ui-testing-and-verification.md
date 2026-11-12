# UI Feature Testing & Design Verification Standard

> **MANDATORY FOR ALL UI TASKS**: Whenever building, refactoring, or polishing any UI feature, you must proactively apply the installed design standards (`design-taste-frontend`, `game-ui-ux`, `web-design-guidelines`, and root `DESIGN.md`) by default. NEVER wait for the user to point out design slop, outdated copy, or layout flaws.

## 1. Proactive Design Standards Enforcement (Default Pre-Flight Gate)
Before touching any UI code or presenting changes, audit against our core design standards:
- **Anti-Slop (`design-taste-frontend`)**:
  - Eliminate all generic, templated, or AI-made aesthetics: noisy descriptive subtitles (e.g. "Interactive Card Database & 40-Card Deck Builder"), tacky hardcoded badges, nested gradient cards, and bloated wrappers.
  - Plain, authentic copy only: keep branding clean, confident, and minimal (e.g. crisp "DUEL MASTERS" title, clean controls).
  - Balanced padding and equal edges across all screen sizes.
- **Project Design System (`DESIGN.md` & `awesome-design-md`)**:
  - Canvas: Deep void canvas (`#070b14` / `#07090e`).
  - Surfaces: Layered slate (`#0b1220` to `#17233d`) with hairline borders (`#1e293b`).
  - Typography: Cinzel for headers/titles, Inter for UI text, tabular mono for stats/numbers.
  - Colors: Authentic 5-civilization accents (Light `#facc15`, Water `#38bdf8`, Darkness `#c084fc`, Fire `#f87171`, Nature `#4ade80`).
- **Game UI/UX Architecture (`game-ui-ux`, `card-game`)**:
  - Card-first design: card artwork and stats have top priority; never squash cards into tiny thumbnails when space exists.
  - Responsive container scaling: use container-query / flex proportions so elements scale smoothly to fit available space without awkward page-level scrollbars.
  - Event-driven HUD updates, authentic TCG zones, and clean keyboard/mouse focus.
- **Web Interface Guidelines (`web-design-guidelines`)**:
  - Semantic form and select controls with truncate and accessible focus rings.
  - Proper contrast ratios and clear hover/focus states.

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
- [ ] **Vertical Space Budget & Proportional Card Scaling**:
  - Do NOT forcefully shrink card artwork preview down into a small thumbnail if space permits.
  - Card artwork preview must be able to expand up to the full inner width of the details pane (e.g. `255px`).
  - Use responsive container-query proportional scaling (`width: min(100cqw, calc(100cqh * (491 / 682)), 255px); aspect-ratio: 491 / 682;`) so that when card abilities/details increase or the viewport height is shorter, the card shrinks dynamically and proportionally to accommodate all details without overflow.
  - Card stats (Cost, Power, Type, Civilization, Keywords, Race) must remain consolidated into a sleek inline/two-line bar taking ≤ 50px total.
  - Abilities & Effects must display all abilities cleanly without requiring initial vertical scroll on standard 900px desktop viewports.
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
