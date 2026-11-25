---
description: Build, update, and query the project Graphify knowledge graph (graphify-out/)
---

# Graphify Workflow

1. Check if `graphify-out/graph.json` exists.
   - If missing or stale after edits, run local deterministic extraction (no API key required):
     `graphify extract . --code-only` (or `graphify update .` for incremental code changes)
2. To answer architecture or dependency questions, run `graphify query "<question>"`, `graphify affected "<Symbol>"`, `graphify path "<A>" "<B>"`, or `graphify god-nodes`.
3. Interactive visualization is generated at `graphify-out/graph.html`, summary audit at `graphify-out/GRAPH_REPORT.md`, and tree explorer via `graphify tree`.
4. To expose the local graph over MCP stdio for external MCP clients, run `graphify-mcp` (installed alongside `graphify`).
