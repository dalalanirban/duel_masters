# Architecture

## Overview

This repository is a monorepo containing the active Web client & Duel Masters rules engine (`web/`), the Android Jetpack Compose client (`app/`), and the online multiplayer backend (`backend/`).

```
Web Client (React/TS) ──► Pure-TS Rules Engine (DM-01–DM-12) & AI Agent
Android App (Compose)  <--REST/WebSocket-->  Ktor Backend  -->  PostgreSQL
        |
     Room DB (local decks, offline cache)
```

## Web client & Rules Engine (`web/`)

- **UI & Presentation**: React 18, TypeScript, Tailwind CSS, Vite (`manualChunks` isolating `vendor-three` and `vendor-motion`), `motion/react` (`LazyMotion` + `domMax` strict), ref-backed Async Presentation Queue (`web/src/presentation/`), lazy WebGL2/`THREE.GLSL3` VFX (`web/src/vfx/`, 0 KB loaded in `Lite`), procedural Web Audio synthesizer (`web/src/audio/`), and responsive arena UI (`web/src/components/duel/`)
- **Rules Engine**: Modular, acyclic TypeScript engine in `web/src/engine/` covering 900 cards across 12 sets — see [RULES_ENGINE_ARCHITECTURE.md](RULES_ENGINE_ARCHITECTURE.md) and [2026-11-27-battle-arena-ui-vfx-design.md](superpowers/specs/2026-11-27-battle-arena-ui-vfx-design.md)
- **Verification**: Verified via `node --test web/src/engine/tests/*.test.mjs web/src/data/cardLoader.test.mjs web/src/presentation/tests/*.test.mjs web/src/audio/tests/*.test.mjs web/src/vfx/tests/*.test.mjs` (419 tests / 119 suites) and `npm --prefix web run build`
- **Knowledge Graph**: Indexed via Graphify (`graphify-out/`, `.graphifyignore`, git hooks)

## Android client (`app/`)

- **UI**: Jetpack Compose with Material 3
- **Navigation**: Navigation Compose (to be expanded)
- **Local persistence**: Room for decks and cached game data
- **Networking**: Ktor Client for REST and WebSocket communication with the backend

## Backend (`backend/`)

- **Framework**: Ktor on Netty
- **API**: REST endpoints for accounts/matches; WebSockets for real-time duel sync
- **Database**: PostgreSQL with Flyway migrations
- **Connection pooling**: HikariCP

## Data flow (online multiplayer)

1. Player authenticates and opens a match lobby via REST.
2. Match is created in PostgreSQL with status `pending`.
3. Both clients connect to a WebSocket room for the match ID.
4. Game state updates are broadcast between clients through Ktor.
5. Final match result is persisted to PostgreSQL.

## Next implementation steps

1. Game rules engine (shared logic module or duplicated with tests)
2. Deck builder UI backed by Room
3. Matchmaking REST API
4. WebSocket protocol for turn-based actions
5. Player registration and session tokens
