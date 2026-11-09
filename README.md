# Duel Masters Game (Android)

A Duel Masters card game for Android with local and online multiplayer support.

## Stack

| Layer | Technology |
|-------|------------|
| **Android UI** | Kotlin, Jetpack Compose, Material 3 |
| **Local storage** | Room Database |
| **Backend** | Kotlin, Ktor |
| **Online database** | PostgreSQL |

## Project structure

```
duel-masters-game-android/
├── app/          # Android client (Compose + Room)
├── backend/      # Ktor server for online multiplayer
└── docs/         # Architecture and setup notes
```

## Prerequisites

- **Android Studio** (Ladybug or newer recommended)
- **JDK 17+**
- **PostgreSQL 15+** (for online multiplayer backend)
- **Gradle 8.9+** (wrapper included)

## Getting started

### Android app

1. Open this repository in Android Studio.
2. Sync Gradle when prompted.
3. Run the `app` configuration on an emulator or device.

### Backend (Ktor)

1. Start PostgreSQL and create a database:

```sql
CREATE DATABASE duel_masters;
```

2. Copy the backend env template and set your connection details:

```bash
cp backend/.env.example backend/.env
```

3. Run the server:

```bash
./gradlew :backend:run
```

The server starts on `http://localhost:8080` by default.

## Web Application (Card Explorer & Deck Builder)

A modern, fast web application built with **React**, **TypeScript**, **Vite**, and **Tailwind CSS**.

```bash
cd web
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

- **120 Cards from DM-01 Base Set** with authentic procedural card frames.
- **Search & Multi-Filter:** Filter by Civilization, Cost, Power, Type, and Keywords (Blocker, Shield Trigger, Slayer, etc.).
- **Tournament Deck Builder:** Strict 40-card limit, 4-copy rule, live Mana Curve, and Civilization breakdown.
- **Opening Hand & Shield Simulator:** Deal 5 face-down Shields and 5 Starting Hand cards to test your curve.
- **Presets:** Pre-loaded with Shobu Beatdown, Kokujo Control, and Hakuoh Stall.

## Documentation

- [Game Overview, Rules & Mechanics Specification](docs/GAME_OVERVIEW.md)
- [Web-First Architecture & Strategy](docs/WEB_FIRST_STRATEGY.md)
- [Card Sets Knowledge & Database Roadmap](docs/CARD_SETS_AND_DATABASE_ROADMAP.md)
- [Card Database & Asset Storage Pipeline](docs/CARD_STORAGE_AND_ASSET_PIPELINE.md)
- [Architecture & Setup Notes](docs/architecture.md)

## Development roadmap

- [ ] Core card game rules engine
- [ ] Local single-player vs AI
- [ ] Room persistence for decks and match history
- [ ] Online matchmaking and real-time sync via Ktor WebSockets
- [ ] PostgreSQL-backed player accounts and rankings

## License

MIT
