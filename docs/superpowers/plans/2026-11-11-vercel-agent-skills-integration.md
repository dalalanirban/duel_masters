# Vercel Agent Skills Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install the complete suite of 9 Vercel Agent Skills into the workspace and global agent directories.

**Architecture:** Copy unpacked skill directories from `scratch/vercel-agent-skills/skills/` into `d:\Duel_Masters\.agents\skills/`, omitting zip archives. Mirror each skill to global agent caches. Verify frontend build and commit.

**Tech Stack:** Agent Skills Standard (agentskills.io), Markdown (`SKILL.md`), Antigravity Customization System.

**Spec:** [`docs/superpowers/specs/2026-11-11-vercel-agent-skills-integration-design.md`](file:///d:/Duel_Masters/docs/superpowers/specs/2026-11-11-vercel-agent-skills-integration-design.md)

## Global Constraints
- Exclude `.zip` files from copying to keep footprint light (~1.2 MB).
- Preserve existing build and test suite integrity.

---

### Task 1: Install Vercel Skills Suite into Workspace `.agents/skills/`

- [x] Copy all 9 skill folders (`composition-patterns`, `deploy-to-vercel`, `react-best-practices`, `react-native-skills`, `react-view-transitions`, `vercel-cli-with-tokens`, `vercel-optimize`, `web-design-guidelines`, `writing-guidelines`) from scratch into `d:\Duel_Masters\.agents\skills/`.
- [x] Verify each copied folder contains a valid `SKILL.md`.
- [x] Confirm no `.zip` files were copied.

### Task 2: Mirror Vercel Skills Suite to Global Directories

- [x] Mirror all 9 skill folders to `~/.gemini/config/skills/`.
- [x] Mirror all 9 skill folders to `~/.agents/skills/`.
- [x] Mirror all 9 skill folders to `~/.claude/skills/`.
- [x] Remove scratch clone `C:\Users\anirb\.gemini\antigravity\brain\83a7a494-4dac-4049-9a42-3a971c9cb650\scratch\vercel-agent-skills` to reclaim disk space.

### Task 3: Verify and Commit

- [ ] Run `npm run build --prefix web` to verify clean build.
- [ ] Commit all changes to `feature/compact-watermark-layout`.
- [ ] Push to remote.
