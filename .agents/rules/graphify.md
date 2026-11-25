# Graphify Knowledge Graph Navigation Standard

> Whenever investigating codebase architecture, cross-module dependencies, call graphs, or change impact in this repository, prefer querying Graphify's built graph (`graphify-out/graph.json`) before brute-force scanning files.

## 1. Query First When `graphify-out/graph.json` Exists
- Broad question / traversal: `graphify query "<question>"` (or `--dfs` to trace specific flows)
- Architectural hubs / most-connected symbols: `graphify god-nodes`
- Blast-radius check before editing a module or symbol: `graphify affected "<SymbolName>"`
- Shortest dependency path between modules/symbols: `graphify path "<NodeA>" "<NodeB>"`
- Detailed node + neighbor inspection: `graphify explain "<SymbolName>"`

## 2. Keeping the Graph Current
- Code-only deterministic AST refresh (no API key needed): `graphify extract . --code-only`
- Incremental code re-extraction after edits: `graphify update .`
- Check token efficiency vs full-corpus scanning: `graphify benchmark`
- Git hooks (`post-commit`, `post-checkout`, merge driver) auto-update `graphify-out/` on code commits/checkouts.

## 3. Repository Scoping (`.graphifyignore`)
- Indexing focuses on project source (`web/src/`, `app/`, `backend/`, `scripts/`), build configs, and architecture docs (`docs/`, `DESIGN.md`, `README.md`).
- Large datasets (`web/src/data/*.json`, `data/`), card artwork (`web/public/`), `node_modules/`, `dist/`, `.agents/`, and `reference_engine/` are excluded via `.graphifyignore`.
