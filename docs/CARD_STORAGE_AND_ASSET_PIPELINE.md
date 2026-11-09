# Duel Masters: Card Database & Asset Storage Pipeline

This document defines the architectural storage strategy, database schema specifications, image asset sources, and UI rendering pipeline for the **Duel Masters** digital card game.

---

## 1. Objectives & Technical Requirements

The card storage and asset pipeline must satisfy four core requirements:
1. **Offline-First Playability:** The Android app must function completely without an internet connection for single-player duels, AI matches, and local deck building.
2. **Zero-Latency Hand & Battlefield Rendering:** Card art must render instantly when cards are drawn into the hand, charged to mana, or summoned to the Battle Zone, without UI stutter.
3. **Sub-Millisecond Deck Builder Queries:** Fast filtering across Civilizations, Mana Costs, Power, Races, Keywords, and Card Text.
4. **Authoritative Server Validation:** The Ktor backend must maintain an identical, authoritative copy of card stats and effects to prevent cheating during online multiplayer duels.

---

## 2. Multi-Tier Storage Architecture

```
                       ┌────────────────────────────────────────┐
                       │       Canonical Source of Truth        │
                       │   cards_dm01.json / cards_dm02.json    │
                       └───────────────────┬────────────────────┘
                                           │
                    ┌──────────────────────┴──────────────────────┐
                    ▼                                             ▼
       ┌────────────────────────┐                    ┌────────────────────────┐
       │   Android Client App   │                    │      Ktor Backend      │
       ├────────────────────────┤                    ├────────────────────────┤
       │ Pre-populated Room DB  │                    │ PostgreSQL Master DB   │
       │ (Indexed SQLite)       │                    │ (Deck & Duel Validator)│
       ├────────────────────────┤                    ├────────────────────────┤
       │ Local WebP Asset Cache │                    │ Authoritative Rules    │
       │ + Coil Remote Fallback │                    │ Engine Execution       │
       └────────────────────────┘                    └────────────────────────┘
```

### Storage Tiers
* **Canonical Seed (JSON):** Version-controlled JSON files in the repository defining stats, keywords, and effect hooks.
* **Client Tier (Room SQLite):** Pre-populated database bundled in `app/src/main/assets/database/cards.db` or seeded on first launch. Reactive queries expose card data directly to Jetpack Compose via Kotlin `Flow`.
* **Backend Tier (PostgreSQL):** Seeded via Flyway migrations or startup loader. Validates deck composition and executes server-side combat moves during online duels.

---

## 3. Database Schema & Field Specification

The schema separates card data into four distinct concerns:

### A. Identity & Catalog Metadata
| Column Name | SQL Type | Indexed | Purpose |
|---|---|:---:|---|
| `card_id` | `VARCHAR(16)` | **PK** | Unique card identifier (e.g. `"DM01-001"`). |
| `name` | `VARCHAR(64)` | **Yes** | Display card name (e.g. `"Aqua Hulcus"`). |
| `set_code` | `VARCHAR(10)` | **Yes** | Expansion identifier (e.g. `"DM-01"`). |
| `collector_number` | `INT` | No | Card number within the set. |
| `rarity` | `VARCHAR(16)` | **Yes** | `COMMON`, `UNCOMMON`, `RARE`, `VERY_RARE`, `SUPER_RARE`. |
| `flavor_text` | `TEXT` | No | Printed flavor text / lore. |
| `illustrator` | `VARCHAR(64)` | No | Artist name. |
| `image_asset_path` | `VARCHAR(128)` | No | Local relative asset path (e.g. `"cards/dm01_001.webp"`). |
| `image_url` | `VARCHAR(256)` | No | High-res remote fallback URL (GitHub CDN / Fandom). |

### B. Core Game Stats & Filtering Fields
| Column Name | SQL Type | Indexed | Purpose |
|---|---|:---:|---|
| `card_type` | `VARCHAR(20)` | **Yes** | `CREATURE`, `EVOLUTION_CREATURE`, `SPELL`. |
| `civilizations` | `VARCHAR(32)` | **Yes** | Comma-separated civilization list (e.g. `"WATER"` or `"FIRE,NATURE"`). |
| `mana_cost` | `INT` | **Yes** | Mana required to play card from hand. |
| `mana_number` | `INT` | No | Mana generated when put into Mana Zone (default: `1`). |
| `power` | `INT?` | **Yes** | Combat power value (`NULL` for Spells). |
| `races` | `VARCHAR(64)` | **Yes** | Comma-separated creature race list (e.g. `"Liquid People"`). |
| `evolution_races` | `VARCHAR(64)` | No | Required base race for Evolution Creatures (e.g. `"Cyber Virus"`). |

### C. Combat Keywords & Performance Flags
Flags allow immediate condition checks in the game loop without regex or text parsing:

| Column Name | SQL Type | Indexed | Purpose |
|---|---|:---:|---|
| `is_shield_trigger` | `BOOLEAN` | **Yes** | Instant free cast when broken as a shield (`S・Trigger`). |
| `is_blocker` | `BOOLEAN` | **Yes** | Can intercept attacks targeting players or friendly creatures. |
| `is_slayer` | `BOOLEAN` | **Yes** | Destroys whatever creature it battles. |
| `is_speed_attacker` | `BOOLEAN` | No | Ignores summoning sickness on enter. |
| `power_attacker_bonus` | `INT` | No | Temporary bonus power added while attacking (e.g. `+3000`). |
| `breaker_count` | `INT` | No | Number of shields broken per strike (`1` = normal, `2` = Double, `3` = Triple). |

### D. Rules Text & Scripted Logic Hooks
| Column Name | SQL Type | Purpose |
|---|---|---|
| `rules_text` | `TEXT` | Printed text displayed on card in UI. |
| `effect_script_id` | `VARCHAR(64)` | Unique pointer to engine logic handler (e.g. `"EFFECT_AQUA_HULCUS_DRAW"`). |

---

## 4. Card Image Database Sources

Community sources identified for card images, scans, and metadata:

1. **`db.duelmasters.us` / `bmenneni/SimpleJavaDmdb` ([GitHub](https://github.com/bmenneni/SimpleJavaDmdb)):**
   * Recreated Wizards of the Coast database (referenced frequently on r/DuelMasters).
   * Covers English sets DM-01 to DM-35 and promos with card scans and animation data.
2. **`naveed92/dm-octgn-images` ([GitHub](https://github.com/naveed92/dm-octgn-images)):**
   * High-resolution scans maintained for the OCTGN platform.
   * Direct CDN-friendly folder structure organized by set and card GUID.
3. **`Latepate64/duel-masters-json` ([GitHub](https://github.com/Latepate64/duel-masters-json)):**
   * Clean JSON data representations of DM-01 to DM-12 for automated ingestion.
4. **Duel Masters Wiki (Fandom):**
   * Comprehensive archive of official Japanese and English printings with CDN-hosted images.

---

## 5. Image Asset & Rendering Pipeline

To guarantee 60 FPS rendering in Compose without excessive memory usage:

### Step 1: Format Conversion (WebP)
* Source PNG scans (~1–2 MB each) are downscaled to 600x840 px and converted to compressed **WebP** (~80–120 KB each).
* **Storage Footprint:**
  - DM-01 Base Set (110 cards): **~10–12 MB total**.
  - DM-01 through DM-05 (~340 cards): **~35 MB total**.
* The DM-01 set is bundled directly in `app/src/main/assets/cards/` for zero-load-time offline play.

### Step 2: Hybrid Loader in Jetpack Compose (Coil)
Card rendering components use a fallback chain:
1. Check local assets (`image_asset_path`).
2. If absent, load from remote CDN (`image_url`) via Coil with aggressive disk caching.

```kotlin
@Composable
fun DuelCardImage(
    card: CardEntity,
    modifier: Modifier = Modifier
) {
    val imageModel = remember(card) {
        if (card.imageAssetPath.isNotBlank()) {
            "file:///android_asset/${card.imageAssetPath}"
        } else {
            card.imageUrl
        }
    }

    AsyncImage(
        model = ImageRequest.Builder(LocalContext.current)
            .data(imageModel)
            .crossfade(true)
            .diskCachePolicy(CachePolicy.ENABLED)
            .memoryCachePolicy(CachePolicy.ENABLED)
            .placeholder(R.drawable.card_back_placeholder)
            .error(R.drawable.card_back_placeholder)
            .build(),
        contentDescription = card.name,
        modifier = modifier
    )
}
```

---

## 6. Implementation Milestones

1. **Milestone 1:** Create `CardEntity.kt` and `CardDao.kt` in `app/src/main/java/com/duelmasters/game/data/local/`.
2. **Milestone 2:** Generate the canonical `cards_dm01.json` seed containing all 110 DM-01 cards with stats, keywords, and asset mappings.
3. **Milestone 3:** Add the WebP card assets for DM-01 and configure Room to auto-seed on database creation.
4. **Milestone 4:** Build the Deck Builder filter query and card browser UI in Jetpack Compose.
