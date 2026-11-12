# Pull Request Workflow & Status Verification Standard

> **MANDATORY FOR ALL PR ACTIONS**: Whenever creating, updating, or presenting a Pull Request to the user for review or merging, you must strictly follow this protocol. Never share a PR link without first querying and reporting its live GitHub status.

## 1. Pre-PR Hygiene
1. **Branch Freshness**:
   - Always branch off the latest `origin/main` (`git fetch origin; git checkout -b feature/<descriptive-name> origin/main`).
   - If `main` has progressed while developing, rebase or merge `origin/main` to ensure a conflict-free merge path.
2. **Local Verification Gate**:
   - Run production build: `npm run build --prefix web` (0 errors required).
   - Run engine test suite: `node --test web/src/engine/tests/*.test.mjs` (all tests passing).
   - Perform live UI inspection via Playwright if UI or styles were modified.

## 2. Live PR Status Check (Always Check Before Sharing)
Before sharing any PR link with the user, query GitHub via `gh` CLI (outside sandbox: `BypassSandbox: true`):
```powershell
gh pr view <number> --json number,title,state,mergeable,mergeStateStatus,reviewDecision,statusCheckRollup,url,headRefName,baseRefName
```

## 3. Mandatory PR Reporting Template
Always accompany the PR link with a concise, structured status report:
- **PR**: `[PR #<number>: <title>](<url>)`
- **Branch**: `<headRefName>` -> `<baseRefName>`
- **Status**: `OPEN` (or current state)
- **Mergeability**: `CLEAN` / `MERGEABLE` (confirm no merge conflicts)
- **CI / Checks**: Passing / No checks required
- **Summary of Changes**: Bullet points of key fixes, features, and verification evidence.
