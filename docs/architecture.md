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

- **UI**: React 18, TypeScript, Tailwind CSS, Vite (`web/src/components/duel/` for Battle Zone, Mana Zone, Hand, Shields, Card Inspector, and interactive `ZoneSelectionModal` / `SilentSkillModal` / `OptionalChoiceModal` / `DeckSearchModal`)
- **Rules Engine**: Modular, acyclic TypeScript engine in `web/src/engine/` covering 900 cards across 12 sets — see [RULES_ENGINE_ARCHITECTURE.md](RULES_ENGINE_ARCHITECTURE.md)
- **Verification**: Verified via `node --test web/src/engine/tests/*.test.mjs` and `npm --prefix web run build`
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
