# Awesome DESIGN.md Integration Design

## Intent & The Why
Integrate [VoltAgent/awesome-design-md](https://github.com/voltagent/awesome-design-md) to provide AI coding agents (Antigravity, Claude, Codex, etc.) with standardized `DESIGN.md` design system knowledge, and establish a dedicated `DESIGN.md` specification for the Duel Masters web application. This ensures future UI generation adheres strictly to pixel-accurate visual tokens, dark gaming aesthetics, and civilized card mechanics.

## Goals
1. **Agent Skill Integration**:
   - Install the curated collection of 84+ design systems from `VoltAgent/awesome-design-md` into `.agents/skills/awesome-design-md/`.
   - Provide a clear, actionable `SKILL.md` with progressive disclosure that allows agents to query, extract, and apply design systems (Linear, Raycast, Vercel, Supabase, etc.) during UI development.
   - Sync the skill globally to `~/.gemini/config/skills/awesome-design-md/`, `~/.agents/skills/`, and `~/.claude/skills/`.
2. **Project-Specific `DESIGN.md`**:
   - Create a production-grade `DESIGN.md` in the project root (`d:\Duel_Masters\DESIGN.md`) following the Google Stitch / VoltAgent specification standard.
   - Codify the Duel Masters visual language:
     - Void canvas tokens (`#070b14`, `#0d1322`, `#141c2e`).
     - Civilization theme tokens (Light `#facc15`, Water `#38bdf8`, Darkness `#c084fc`, Fire `#f87171`, Nature `#4ade80`).
     - Typography scales, tracking, and font families.
     - Viewport-locked 100vh duel arena layout standards (fixed three-column grid, compact watermarks, card inspector).
     - Card token specs (aspect ratio `2.5 : 3.5`, border radiuses, glow treatments, mana/shield indicators).

## Non-Goals & Anti-Goals
- **Non-Goals**:
  - Overhauling existing React components immediately in this step (that will be guided by `DESIGN.md` in subsequent UI tasks).
  - Bloating git with unnecessary binary assets or heavy build dependencies.
- **Anti-Goals**:
  - Generic or inconsistent "AI slop" styles that deviate from the dark sci-fi / fantasy card game feel.
  - Breaking existing Vite build or test suites.

## Approaches Considered
1. **Option 1 (Skill Only)**: Install `awesome-design-md` as an agent skill/catalog only. (Drawback: Lacks a project-specific single source of truth for Duel Masters).
2. **Option 2 (Root `DESIGN.md` Only)**: Author `DESIGN.md` at root without the 84-system reference library. (Drawback: Coding agents cannot reference or borrow archetypes from other top design systems).
3. **Option 3 (Full Integration - Chosen)**: Both Option 1 and Option 2. Agents gain full access to the curated 84 design systems catalog, while `Duel_Masters` gets a tailored `DESIGN.md` codifying its own visual identity.

## Architecture & Directory Layout
```
d:\Duel_Masters\
├── DESIGN.md                                    # Active project design system
├── .agents/
│   └── skills/
│       ├── design-taste-frontend/               # Taste skill (installed)
│       └── awesome-design-md/                   # Curated DESIGN.md library skill
│           ├── SKILL.md                         # Skill definition & guidelines
│           └── design-md/                       # 84+ design system profiles
```

## Global Sync Targets
- `~/.gemini/config/skills/awesome-design-md/`
- `~/.agents/skills/awesome-design-md/`
- `~/.claude/skills/awesome-design-md/`
