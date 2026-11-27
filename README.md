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

A modern web application built with **React**, **TypeScript**, **Vite**, **Tailwind CSS**, **`motion` (`motion/react` strict `LazyMotion`)**, lazy-loaded **Three.js (`WebGL2` / `THREE.GLSL3`)**, and zero-dependency **Web Audio API** synthesis, powered by a modular pure-TypeScript Duel Masters rules engine.

```bash
cd web
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

- **900 Cards across 12 Sets (DM-01 through DM-12)** with localized scan assets, Search, and multi-filter Explorer (Civilization, Cost, Power, Type, Race, Keywords).
- **Tournament Deck Builder:** Strict 40-card limit, 4-copy rule, Mana Curve, Civilization breakdown, and ready-made dual-civ/mechanics preset decks.
- **Full Rules Engine & Battle Arena v2 (`Lite` + `Anime Drama`):**
  - **Ref-Backed Async Presentation Queue:** Decouples canonical `step()` state from sequenced UI beats (`DRAW`, `CHARGE_MANA`, `SUMMON_CREATURE`, `CAST_SPELL`, `EVOLVE`, `DECLARE_ATTACK`, `BLOCK`, `SHIELD_BROKEN`, `SHIELD_TRIGGER`, `CREATURE_DESTROYED`, `GAME_OVER`), supporting `Space` / click fast-forward without click-through and `0ms` instant mana tapping.
  - **Dual Visual Modes:** Auto-selects **Lite** on narrow mobile (`< 1024px`), `prefers-reduced-motion`, or missing WebGL2 (**0 bytes** of `vendor-three` fetched) and **Anime Drama** on desktop WebGL2 (`THREE.GLSL3` summoning portals, energy beams, 3D Fresnel shield shatters, damped `trauma^2` viewport shake, and real-artwork diagonal speed-line Cut-Ins with automatic `webglcontextlost` Lite fallback). Toggle mid-turn via the top utility corner pill.
  - **Procedural Web Audio Engine:** Zero-asset synthesizer with 5 civilization timbre signatures, pre-baked hall reverb, dynamics compressor limiter, staggered multi-break cues, `visibilitychange` suspend/resume, Mute, and squared-curve volume persistence.
  - **Ergonomic Desktop & Mobile (`390px`) Controls:** Compact corner utility pill, collapsible desktop Inspector (`w-72`) and Duel Log rails (`#N` + high-severity unread badge + `L` / `Escape` shortcuts), Midline Phase CTA anchor, collapsible auto-expanding mobile Mana Strip with drag-to-tap, tap-to-select hand actions, ornate SVG `CardBack` art, and timer-safe `Peek Board` interrupt modals.
- **Verification Suites:**
  - Full Test Sweep (`419` tests / `119` suites across engine, data, presentation, audio, and VFX): `node --test web/src/engine/tests/*.test.mjs web/src/data/cardLoader.test.mjs web/src/presentation/tests/*.test.mjs web/src/audio/tests/*.test.mjs web/src/vfx/tests/*.test.mjs`
  - TypeScript & Production Build (isolated `vendor-three` split): `npm --prefix web run build`

## Documentation

- [Battle Arena v2 (Lite + Anime Drama) Design Spec](docs/superpowers/specs/2026-11-27-battle-arena-ui-vfx-design.md)
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
