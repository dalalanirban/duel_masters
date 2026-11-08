# Duel Masters: Game Overview, Rules & Mechanics Specification

This document provides a comprehensive reference of the **Duel Masters** collectible card game (TCG/OCG) rules, zones, turn structure, civilizations, keywords, and foundational concepts required to build an accurate digital game engine.

---

## 1. Overview & Objectives

Duel Masters is a two-player, turn-based card game originally developed by Wizards of the Coast in collaboration with Takara Tomy and Shogakukan.

### Primary Win Condition
* **Direct Attack:** Break all 5 of the opponent's shields and successfully land one final unblocked direct attack on the opponent with an unsick creature.
* **Deckout:** If a player is required to draw a card and their deck has zero cards remaining, that player immediately loses the game.

---

## 2. Game Setup & Zones

| Zone | Visibility | Description |
|---|---|---|
| **Deck** | Hidden (Face-down) | Exactly 40 cards. Maximum 4 copies of any single card by name. |
| **Hand** | Private (Owner only) | Cards drawn from deck; maximum starting hand is 5 cards. |
| **Shield Zone** | Hidden (Face-down) | 5 cards placed from the top of the deck at game start. Form the player's life buffer. |
| **Mana Zone** | Public (Face-down / Inverted) | Tapped to pay costs for spells and creatures. Typically 1 card charged per turn. |
| **Battle Zone** | Public (Face-up) | Where creatures, evolution creatures, and persistent cards reside and engage in combat. |
| **Graveyard** | Public (Face-up) | Discard pile for destroyed creatures, cast spells, and discarded cards. Order is preserved. |

---

## 3. Turn Structure

Each turn follows a strict sequence of phases:

```
[Start of Turn / Untap]
         │
         ▼
    [Draw Phase]
         │
         ▼
    [Mana Phase]
         │
         ▼
    [Main Phase]
         │
         ▼
   [Attack Phase]  <── (Optional / Multiple Attacks)
         │
         ▼
 [End of Turn Phase]
```

### Phase Details
1. **Start of Turn (Untap Phase):**
   * All tapped cards in the active player's Battle Zone and Mana Zone untap (return to vertical position).
   * "At the start of your turn" effects trigger and resolve.
2. **Draw Phase:**
   * Active player draws 1 card from the top of their deck.
   * *(Note: In standard rules, the player going first draws on turn 1).*
3. **Mana Phase:**
   * Active player may choose up to 1 card from their hand and place it upside-down into their Mana Zone.
4. **Main Phase:**
   * Active player may summon creatures or cast spells by tapping the required mana.
   * **Mana Payment Rule:** 
     - Total tapped mana must equal or exceed card cost.
     - At least 1 mana card tapped must match each of the civilizations present on the card being played.
5. **Attack Phase:**
   * Active player may declare attacks with any eligible (untapped, non-summoning-sick) creature.
   * An attack can target either:
     - The opponent directly (targeting their shields).
     - An opponent's **tapped** creature in the Battle Zone.
   * **Combat Resolution Sub-steps:**
     1. *Attack Declaration:* Creature taps. Attack-triggered abilities activate.
     2. *Blocker Step:* Opponent may tap an eligible Blocker creature to redirect the attack.
     3. *Battle Step (if creature vs creature):* Highest power wins; lower power creature is destroyed. If powers are equal, both are destroyed.
     4. *Shield Break Step (if creature vs player):* One or more shields are selected and broken. They are moved into the defending player's hand.
     5. *Shield Trigger (`S・Trigger`) Step:* If any broken shield has a Shield Trigger, the defender can immediately reveal and cast/summon it for free before combat resolves.
6. **End of Turn Phase:**
   * "Until the end of the turn" effects expire.
   * "At the end of your turn" abilities trigger and resolve.
   * Turn passes to the opponent.

---

## 4. The Five Civilizations

Every card belongs to one or more of the five civilizations, each embodying distinct tactical archetypes:

```
                  [ Light ]
                  /       \
            [ Water ]   [ Darkness ]
                  \       /
             [ Nature ] - [ Fire ]
```

### 1. Light (Yellow / White)
* **Philosophy:** Order, defense, justice, protection.
* **Key Mechanics:** Blockers, high defensive power, untapping creatures, adding cards to shields.
* **Iconic Cards:** *Holy Awe, Urth, Purifying Elemental, Alcadeias, Lord of Spirits, Diamond Cutter*.

### 2. Water (Blue)
* **Philosophy:** Knowledge, intellect, trickery, flow.
* **Key Mechanics:** Card draw, bouncing creatures back to hand, unblockable attackers, deck manipulation.
* **Iconic Cards:** *Aqua Hulcus, Corile, Crystal Lancer, Cyber Brain, Illusionary Merfolk*.

### 3. Darkness (Black)
* **Philosophy:** Power at any price, decay, ambition.
* **Key Mechanics:** Direct creature destruction, discard / hand disruption, graveyard recursion, Slayer.
* **Iconic Cards:** *Terror Pit, Death Smoke, Ballom, Master of Death, Locomotiver, Cranium Clamp*.

### 4. Fire (Red)
* **Philosophy:** Passion, speed, destruction, raw power.
* **Key Mechanics:** Fast aggro, Speed Attacker, power-based removal (destroy creatures with Power $\le X$), Dragon tribal support.
* **Iconic Cards:** *Bolshack Dragon, Twin-Cannon Skyterror, Crimson Hammer, Tornado Flame, Pyrokinesis*.

### 5. Nature (Green)
* **Philosophy:** Growth, instincts, vitality, abundance.
* **Key Mechanics:** Mana acceleration (ramp), Power Attacker buffs, fetching creatures from deck/mana, high power/cost ratio.
* **Iconic Cards:** *Bronze-Arm Tribe, Natural Snare, Barkwhip the Smasher, Fighter Dual Fang, Fairie Life*.

---

## 5. Core Keywords & Mechanics

* **Summoning Sickness:** A creature cannot attack the turn it enters the Battle Zone (unless it has Speed Attacker or is an Evolution Creature).
* **Shield Trigger (`S・Trigger`):** When this card is broken as a shield and added to your hand, you may reveal it and cast or summon it immediately without paying its mana cost.
* **Blocker:** When an opponent attacks, you may tap this creature to change the target of the attack to this creature.
* **Slayer:** Whenever this creature battles another creature, destroy the other creature after the battle (even if this creature had lower power).
* **Speed Attacker:** This creature does not suffer from summoning sickness and can attack on the turn it is summoned.
* **Power Attacker +X:** This creature gains $+X$ power while attacking.
* **Double / Triple / World Breaker:**
  - *Double Breaker:* Breaks 2 shields in a single attack.
  - *Triple Breaker:* Breaks 3 shields.
  - *World Breaker:* Breaks all of the opponent's shields.
* **Evolution Creature:** Must be played directly on top of an existing creature in the Battle Zone matching the specified race. Evolution creatures ignore summoning sickness and inherit the tapped/untapped state of the base creature.

---

## 6. Digital Game Engine Architecture Plan

To build a robust Duel Masters simulator or playable game, the software architecture will be divided into the following decoupled modules:

1. **Card Definition Model:** Declarative data structure (JSON/TypeScript/Python) representing card metadata, costs, civilizations, stats, and scripted effect hooks.
2. **Deterministic Game State Machine:** Complete state representation (players, turns, phases, zones, modifiers) enabling undo, replay, and AI state cloning.
3. **Action & Priority Resolver:** Manages turn transitions, valid action validation (casting, charging, attacking), and the interrupt stack (Blocker declaration, Shield Trigger resolution).
4. **Agent / Player Interface:** Abstract controller interface supporting Human CLI/GUI inputs, Random/Rule-Based AI, and Minimax/MCTS bots.
5. **Presentation Layer:** Terminal CLI / Web-based UI / Canvas representation of the duel.
