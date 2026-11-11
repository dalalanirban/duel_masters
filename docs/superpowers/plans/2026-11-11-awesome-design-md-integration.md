# Awesome DESIGN.md Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the VoltAgent `awesome-design-md` library as a discoverable agent skill and establish a project-level `DESIGN.md` specification for Duel Masters.

**Architecture:** Install the 84+ curated design systems into `.agents/skills/awesome-design-md/` with a comprehensive `SKILL.md` index. Sync the skill globally across Antigravity, Claude, and Agent platforms. Author a root `DESIGN.md` specifying Duel Masters design tokens, typography, colors, and layout rules.

**Tech Stack:** Markdown (DESIGN.md / SKILL.md), Antigravity Customization System, React / Tailwind / TypeScript frontend.

**Spec:** [`docs/superpowers/specs/2026-11-11-awesome-design-md-integration-design.md`](file:///d:/Duel_Masters/docs/superpowers/specs/2026-11-11-awesome-design-md-integration-design.md)

## Global Constraints
- Preserve existing build and test stability (`npm run build --prefix web`).
- Pure text/markdown files only (no bloated binary assets).
- Keep total disk footprint minimal (~2.5 MB in workspace, ~5 MB in global agent cache).

## Review Focus
1. Skill frontmatter (`name: awesome-design-md`) must be valid YAML with concise, accurate `description`.
2. All 84 brand design markdown folders in `design-md/` must be intact.
3. Duel Masters `DESIGN.md` must strictly follow the Stitch / VoltAgent specification format.
4. Global mirrors must be accurately created without permission errors.
5. Workspace build and git status must be clean.

---

### Task 1: Install `awesome-design-md` Workspace Skill

- [x] Create `.agents/skills/awesome-design-md/` directory in workspace.
- [x] Copy the `design-md/` directory from scratch into `.agents/skills/awesome-design-md/design-md/`.
- [x] Create `.agents/skills/awesome-design-md/SKILL.md` with:
  - YAML frontmatter: `name: awesome-design-md`, descriptive prompt triggers.
  - Quick reference index categorizing all 84 design systems (Dev tools, AI labs, FinTech, Consumer, Minimalist, Dark mode).
  - Agent instructions on how to inspect, load, and adapt tokens from specific brands.
- [x] Verify file presence and count (~167 markdown files, ~2.5 MB).

### Task 2: Mirror Skill to Global Agent Directories

- [x] Create and copy skill files to `~/.gemini/config/skills/awesome-design-md/`.
- [x] Create and copy skill files to `~/.agents/skills/awesome-design-md/`.
- [x] Create and copy skill files to `~/.claude/skills/awesome-design-md/`.
- [x] Verify global directories exist and contain `SKILL.md`.

### Task 3: Author Root `DESIGN.md` for Duel Masters

- [x] Author `d:\Duel_Masters\DESIGN.md` following Stitch / VoltAgent standard:
  - YAML metadata (`name: duel-masters-arena`, `version: 1.0`, description).
  - Color tokens (canvas `#070b14`, surface `#0d1322`, border `#1e293b`, 5 civilization palettes).
  - Typography scale (SF Pro / Inter display & mono tokens).
  - Component tokens (card aspect ratio `2.5 : 3.5`, shield pill badges, battle zones, watermark styling).
  - Layout rules (100vh viewport lock, 3-column duel arena grid).
- [x] Run `npm run build --prefix web` to verify frontend build passes cleanly.
- [ ] Commit all changes with informative git commit message.
