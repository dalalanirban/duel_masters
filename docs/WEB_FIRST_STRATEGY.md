# Duel Masters: Web-First Architecture & Strategy

This document outlines the strategic pivot to develop the **Web version** of the Duel Masters digital card game prior to the native Android build, detailing the rationale, monorepo architecture, and phased delivery milestones.

---

## 1. Rationale: Why Web-First?

Building a complex Trading Card Game (TCG) involves intricate rule state machines, combat step priority, trigger stacks, and responsive UI layout. Starting with a web application provides distinct engineering advantages:

1. **Sub-Second Feedback Loop:**
   - Changes to game state rules, card animations, and combat resolution reflect instantly via Hot Module Replacement (HMR) without Android Studio / Gradle compilation delays.
2. **Deterministic Rules Engine Testing:**
   - The card game rules engine can be built in pure, framework-agnostic TypeScript with 100% test coverage.
   - Turns, battle priority, and Shield Trigger interruptions can be simulated and debugged using browser developer tools.
3. **Card Art & Visual Layout Validation:**
   - Visualizing the 6 distinct zones (Player Hand, Shield Zone, Mana Zone, Battle Zone, Graveyard, and Deck) across diverse screen resolutions is significantly faster to prototype in web technologies (React + Tailwind CSS).
4. **Seamless Android Transition:**
   - Once card data schemas, rules engines, and UI paradigms are validated in the browser, porting to Android (either native Jetpack Compose using the shared schema or wrapping via Capacitor/PWA) is straightforward and de-risked.

---

## 2. Monorepo Organization

```
duel_masters/
├── data/
│   └── cards/
│       ├── dm01.json         # Canonical DM-01 dataset (all 120 cards)
│       └── dm02.json         # Future: DM-02 Evolutions dataset
│
├── web/                      # Web Game Client & Simulator
│   ├── src/
│   │   ├── engine/           # Pure TypeScript Rules Engine
│   │   │   ├── state.ts      # GameState, Zones, Player models
│   │   │   ├── phases.ts     # Untap, Draw, Mana, Main, Attack, End
│   │   │   ├── combat.ts     # Blocker, Slayer, Shield Breaking resolution
│   │   │   └── triggers.ts   # Shield Trigger interrupt queue
│   │   ├── cards/            # Card types, schemas, and loader
│   │   ├── components/       # Board, Hand, Shields, Mana, Card renderer
│   │   └── ai/               # Single-player bot agent
│   ├── public/cards/         # Static card WebP assets
│   ├── package.json
│   └── vite.config.ts
│
├── app/                      # Android Client (Jetpack Compose + Room)
├── backend/                  # Ktor Server (Online Multiplayer & Matchmaking)
└── docs/                     # Specifications and architectural documentation
```

---

## 3. Phased Web Delivery Milestones

```
[Milestone 1: DM-01 Card Database & Schema]
  - Extract & format all 120 cards of DM-01 Base Set
  - Build Card Definition TypeScript interfaces
  - Construct searchable Card Explorer UI
         │
         ▼
[Milestone 2: Turn & Zone Engine (State Machine)]
  - Implement GameState: Deck (40), Shields (5), Hand, Mana, Battle Zone, Graveyard
  - Core Turn Loop: Untap -> Draw -> Charge Mana -> Summon/Cast -> End Turn
         │
         ▼
[Milestone 3: Interactive Combat & Priority Stack]
  - Creature attack declarations (target tapped creatures or opponent shields)
  - Blocker interception step
  - Power comparison & Slayer destruction
  - Shield Break & Shield Trigger instant casting
         │
         ▼
[Milestone 4: Single-Player AI Opponent]
  - Rule-based AI agent to play complete offline matches in the browser
         │
         ▼
[Milestone 5: Android Build Integration]
  - Port verified rules logic to Android app (Compose + Room)
```
