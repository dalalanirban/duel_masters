# Duel Masters: Card Sets Knowledge & Card Database Roadmap

This document outlines the complete card set knowledge base for **Duel Masters**, spanning the classic English TCG (DM-01 through DM-12) to the ongoing Japanese OCG / Duel Masters PLAY'S eras, along with a phased roadmap for constructing the game's digital card database.

---

## 1. The Classic English TCG Era (DM-01 to DM-12)

The English release by Wizards of the Coast (2004–2006) spans 12 core booster expansions and approximately 780 unique cards.

### Expansion Catalog

| Set Code | Set Name | Cards | Year | Key Mechanics & Archetypes | Iconic Cards |
|---|---|:---:|:---:|---|---|
| **DM-01** | *Base Set* | 110 | 2004 | Foundational mechanics: Vanilla creatures, Blockers, Shield Triggers, Slayer, Power Attacker, direct creature destruction, mana ramp, bounce, card draw. | *Bolshack Dragon, Aqua Hulcus, Terror Pit, Holy Awe, Bronze-Arm Tribe, Death Smoke, Spiral Gate, Natural Snare* |
| **DM-02** | *Evo-Crushinators of Doom* | 60 | 2004 | **Evolution Creatures** (stacking creatures on specific races to bypass summoning sickness). | *Barkwhip the Smasher, Fighter Dual Fang, Crystal Lancer, Ballom Master of Death, Alcadeias Lord of Spirits, Armored Blaster Valdios* |
| **DM-03** | *Rampage of the Super Warriors* | 60 | 2004 | **Tap Abilities** (tapping a creature as an alternative to attacking to trigger effects), high-impact finishers. | *Twin-Cannon Skyterror, Bazagazeal Dragon, Searing Wave, Mana Crisis* |
| **DM-04** | *Shadowclash of Blinding Night* | 55 | 2004 | Darkness vs. Light conflict, anti-civilization destruction, graveyard retrieval loops. | *Photocide, Gregoria, Trox General of Destruction, Amber Piercer* |
| **DM-05** | *Survivors of the Megapocalypse* | 55 | 2004 | **Survivor Mechanic** (creatures share their designated abilities with all friendly Survivors in the Battle Zone). | *Smash Horn Q, Gallup Ground Guardian Q, Split-Head Hydroturtle Q* |
| **DM-06** | *Stomp-a-trons of Invincible Wrath* | 110 | 2005 | 13-cost "Invincible" legendary spell cycle with game-winning effects. | *Invincible Technology, Invincible Aura, Invincible Abyss, Invincible Cataclysm, Invincible Power* |
| **DM-07** | *Thundercharge of Ultra Blues* | 55 | 2005 | **Charger Spells** (spells that move to the Mana Zone upon resolving rather than the Graveyard). | *Brain Charger, Soulswap, Slash Charger, Bone Dance Charger* |
| **DM-08** | *Epic Dragons of Hyperchaos* | 55 | 2005 | Dragon tribal support, cost reducers, and dragon synergies. | *Cocco Lupia, Uberdragon Bajula, Dragon's Sign, Super Necrodragon Abzo Dolba* |
| **DM-09** | *Fatal Brood of Infinite Ruin* | 55 | 2005 | **Wave Striker Mechanic** (abilities activate when 3 or more Wave Striker creatures are in the Battle Zone). | *Lalapoo Dirty Rat, Propeller Mutant, Razor Wolverine* |
| **DM-10** | *Shockwaves of the Shattered Rainbow* | 110 | 2005 | **Multi-Civilization (Rainbow) Cards**; introduce tap-to-enter-mana-zone rules and dual-civilization mana requirements. | *Gauza, Melnia, Soul Phoenix, Avatar of Unity, King Tsunami* |
| **DM-11** | *Blastosaurus of Terror* | 55 | 2006 | **Silent Skill** (creature stays tapped during untap phase to activate a powerful effect), expanded multi-civ support. | *Cruel Belferg, Billion-Degree Dragon, Glena Lue* |
| **DM-12** | *Thrash of the Hybrid Monsters* | 55 | 2006 | **Vortex Evolution** (evolving on top of two creatures of different races), concluding the physical English run. | *Super Dragon Machine Dolzark, Ultra Miraculous Mikado, Hydro Hurricane* |

---

## 2. Japanese OCG & Modern Digital Era (Takara Tomy / DM PLAY'S)

The game has continued without pause in Japan for over two decades with more than 10,000 unique cards. Key advanced mechanics include:

* **Cross Gears:** Equipment artifacts paid with mana, placed on the battlefield, and "crossed" onto creatures.
* **God Link:** Separate creature cards that physically link side-by-side in the Battle Zone to combine powers, stats, and abilities.
* **Psychic Creatures & Hyperspatial Zone:** Double-sided creatures residing in an extra deck that "awaken" and flip into stronger forms when battle conditions are met.
* **GR (Gacharange) Summoning:** An auxiliary 12-card deck summoned via card effects.
* **Twinpact Cards:** Dual-faced split cards containing a Creature on top and a Spell on the bottom, castable as either half.
* **Tamaseed:** Non-creature permanent cards representing element hearts with static effects.

---

## 3. Phased Card Database Roadmap

To build a clean, modular engine, card data and mechanics will be implemented incrementally:

```
[Phase 1: DM-01 Base Set (110 Cards)]
  - Core stats: Cost, Civilizations, Power, Races
  - Fundamental Keywords: Blocker, Shield Trigger, Slayer, Power Attacker
  - Basic Spells: Removal, Bounce, Draw, Mana Ramp
         │
         ▼
[Phase 2: DM-02 Evolutions (60 Cards)]
  - Evolution Creature Engine (Race validation, stacking, summoning sickness bypass)
         │
         ▼
[Phase 3: DM-03 & DM-04 Advanced Combat (115 Cards)]
  - Tap Abilities, Target Filtration, Graveyard Recursion
         │
         ▼
[Phase 4: DM-05 to DM-07 Keywords & Spell Cycles (220 Cards)]
  - Survivor Ability Sharing, 13-Cost Invincibles, Charger Spells
         │
         ▼
[Phase 5: DM-08 to DM-12 Multi-Civ & Wave Strikers (285 Cards)]
  - Multi-Civilization Mana & Cost Payment Rules, Wave Striker State Checks
```

---

## 4. Technical Card Schema (Specification)

Every card in the database will follow a declarative model:

```kotlin
enum class Civilization {
    LIGHT, WATER, DARKNESS, FIRE, NATURE
}

enum class CardType {
    CREATURE, EVOLUTION_CREATURE, SPELL
}

data class CardDefinition(
    val id: String,                    // e.g. "DM01-001"
    val name: String,                  // e.g. "Aqua Hulcus"
    val set: String,                   // e.g. "DM-01"
    val collectorNumber: Int,          // e.g. 1
    val civilizations: List<Civilization>,
    val type: CardType,
    val manaCost: Int,
    val power: Int? = null,            // null for Spells
    val races: List<String> = emptyList(), // e.g. ["Liquid People"]
    val isShieldTrigger: Boolean = false,
    val isBlocker: Boolean = false,
    val isSlayer: Boolean = false,
    val powerAttackerBonus: Int = 0,
    val breakerCount: Int = 1,         // 1 = normal, 2 = Double Breaker, 3 = Triple Breaker
    val evolutionRaces: List<String> = emptyList(), // For Evolution Creatures
    val effects: List<CardEffect> = emptyList()     // Scripted triggers (OnPlay, OnAttack, OnDestroy, etc.)
)
```
