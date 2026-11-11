# Awesome GameDev Agent Skills Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install all 78 GameDev agent skills (including master router, `card-game`, web engines, and disciplines) into the workspace and global agent caches.

**Architecture:** Copy flattened skill folders from `scratch/gamedev-skills/skills/*/*` and `router/` into `.agents/skills/`. Mirror all 78 skills to global directories. Verify web build and commit.

**Tech Stack:** Agent Skills Standard (agentskills.io), Markdown (`SKILL.md`), Antigravity Customization System.

**Spec:** [`docs/superpowers/specs/2026-11-11-awesome-gamedev-agent-skills-integration-design.md`](file:///d:/Duel_Masters/docs/superpowers/specs/2026-11-11-awesome-gamedev-agent-skills-integration-design.md)

## Global Constraints
- Flatten the category hierarchy so each `<skill-name>` folder sits directly in `.agents/skills/<skill-name>` with its `SKILL.md` at top level.
- Keep total disk footprint minimal (~1.6 MB workspace).

---

### Task 1: Install GameDev Skills Suite into Workspace `.agents/skills/`

- [x] Copy all 77 skill folders from `scratch/gamedev-skills/skills/*/*` into `d:\Duel_Masters\.agents\skills/`.
- [x] Copy `router/` into `d:\Duel_Masters\.agents\skills/gamedev-router/`.
- [x] Verify all 78 copied skill folders contain a valid `SKILL.md`.

### Task 2: Mirror GameDev Skills Suite to Global Directories

- [x] Mirror all 78 skills to `~/.gemini/config/skills/`.
- [x] Mirror all 78 skills to `~/.agents/skills/`.
- [x] Mirror all 78 skills to `~/.claude/skills/`.
- [x] Remove scratch clone `C:\Users\anirb\.gemini\antigravity\brain\83a7a494-4dac-4049-9a42-3a971c9cb650\scratch\gamedev-skills`.

### Task 3: Verify and Commit

- [ ] Run `npm run build --prefix web` to verify clean build.
- [ ] Commit all changes to `feature/compact-watermark-layout`.
- [ ] Push to remote.
