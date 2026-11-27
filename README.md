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

## Web Application (Card Explorer, Deck Builder & AI Duel Arena)

A modern web application built with **React**, **TypeScript**, **Vite**, and **Tailwind CSS**, powered by a modular pure-TypeScript Duel Masters rules engine.

```bash
cd web
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

- **900 Cards across 12 Sets (DM-01 through DM-12)** with localized scan assets, Search, and multi-filter Explorer (Civilization, Cost, Power, Type, Race, Keywords).
- **Tournament Deck Builder:** Strict 40-card limit, 4-copy rule, Mana Curve, Civilization breakdown, and ready-made dual-civ/mechanics preset decks.
- **Full Rules Engine & Responsive Duel Arena:** Manual post-select mana payment (`Tap N Mana` compact prompt with click-and-drag across Mana Zone cards), distinct multi-civ mana & lock rules, dual-civ & Vortex Evolution (including nested stack separation), Wave Striker, Turbo Rush (live condition unlocking without static Speed Attacker bleed, e.g., `Magmadragon Jagalzor`), Silent Skill start-of-turn choices, all 41 `$tap` abilities usable in `MAIN` or `ATTACK` phase (`Attack` vs `$tap`), `Scarlet Skyterror` blocker wipes, live continuous Dragon power bonuses (`Ultimate Dragon`), 6-zone/optional effect prompts, and responsive `< lg` slide-over drawers for narrow/mobile viewports.
- **Verification Suites:**
  - Engine & Simulation Tests (`365` tests / `107` suites): `node --test web/src/engine/tests/*.test.mjs`
  - Card Loader & Database Integrity (`29` tests): `node --test web/src/data/cardLoader.test.mjs`
  - TypeScript & Production Build: `npm --prefix web run build`

## Documentation

- [Rules Engine & Interactive UI Architecture](docs/RULES_ENGINE_ARCHITECTURE.md)
- [Game Overview, Rules & Mechanics Specification](docs/GAME_OVERVIEW.md)
- [Web-First Architecture & Strategy](docs/WEB_FIRST_STRATEGY.md)
- [Card Sets Knowledge & Database Roadmap](docs/CARD_SETS_AND_DATABASE_ROADMAP.md)
- [Card Database & Asset Storage Pipeline](docs/CARD_STORAGE_AND_ASSET_PIPELINE.md)
- [Architecture & Setup Notes](docs/architecture.md)

## Development roadmap

- [x] Core card game rules engine (DM-01–DM-12)
- [x] Local single-player Duel Arena vs AI
- [ ] Room persistence for decks and match history
- [ ] Online matchmaking and real-time sync via Ktor WebSockets
- [ ] PostgreSQL-backed player accounts and rankings

## License

MIT
