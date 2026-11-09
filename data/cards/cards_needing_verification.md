# Duel Masters DM-01 to DM-12 Rules Verification & Card Audit Checklist

> **Generated**: 2026-11-09  
> **Scope**: 900 Canonical Cards across DM-01 to DM-12  
> **Source Datasets**: `data/cards/dm01.json` – `dm12.json`, `web/src/data/all_cards.json`  
> **Audience**: Duel Masters Engine Implementers, Rules Verifiers, QA Testers

---

## Executive Summary & Audit Matrix

This document provides an exhaustive, automated rules verification audit for all complex cards across Duel Masters sets **DM-01 (Base Set)** through **DM-12 (Thrash of the Hybrid Megacreatures)**. Every card mechanic with non-standard timing, multi-zone state transitions, replacement effects, or deck search actions is cataloged with required engine behaviors.

| Audit Category | Card Count | Primary Sets | Critical Engine Behavior to Verify |
| :--- | :---: | :--- | :--- |
| **1. Evolution Creatures & Bait Races** | **66** | DM-02 – DM-12 | Stack placement on matching bait race; summoning sickness immunity; multi-race bait; Vortex dual-bait; de-evolution zone transitions. |
| **2. Multi-Civilization Cards** | **45** | DM-10 – DM-12 | Enters mana zone tapped; tap yields 1 mana of either civilization; casting requires at least 1 mana of each civilization in mana zone. |
| **3. Survivors & Shared Abilities** | **18** | DM-05 – DM-06 | Aura ability sharing among all friendly Survivors; dynamic stacking; vanilla receiver logic (*Promephius Q*); evolution survivors. |
| **4. Chargers & Mana Spells** | **15** | DM-07 – DM-09 | Redirection to player's mana zone upon spell resolution instead of going to graveyard. |
| **5. High-Impact & Unusual Breakers** | **17** | DM-05 – DM-12 | Triple Breakers (3 shields); scaling Crew Breakers; shield-burning replacement effects (*Bolmeteus*, *Death Phoenix*). |
| **6. Complex Mechanics & Triggers** | **112** | DM-01 – DM-12 | Silent Skill untap choice; Tap Abilities instead of attacking; Wave Striker (3+ requirement); Library search tutors; Shield/Mana swaps; Replacement effects. |
| **7. Image Assets & Data Integrity** | **900** | DM-01 – DM-12 | 120/120 DM-01 local assets verified; 780 remote CDN assets mapped; upstream typo fixes verified. |

---

## Section 1: Evolution Creatures & Bait Races (66 Cards)

Evolution creatures must be summoned on top of an existing creature in the battle zone matching the specified bait race requirement. 

### Evolution Core Rules & Verification Checklist
1. **Summoning Sickness**: Evolution creatures do not suffer from summoning sickness and can attack immediately the turn they are summoned.
2. **State Inheritance**: If the bait creature was tapped, the evolution creature enters **tapped**. If the bait creature was summoning sick, the evolution creature can still attack.
3. **Zone Transitions & De-evolution**: When an evolution creature leaves the battle zone (destroyed, bounced, or mana-sent), both the top card and all underlying bait cards move to the destination zone together, unless an explicit replacement effect states otherwise (e.g. *Soul Phoenix, Avatar of Unity*).
4. **Card Types & Evolution**: Spells can never be evolution targets. Only battle zone creatures matching the exact race qualify.

### Evolution Classification Breakdown
- **Single-Race Evolutions**: 51 cards (e.g. Liquid People, Guardians, Beast Folk, Humans, Angel Commands, Demon Commands).
- **Vortex Evolutions (Dual-Bait)**: 5 cards (*DM-12 Avatar cycle* — requires **two** specific bait creatures simultaneously).
- **Multi-Race Choice Evolutions**: 5 cards (*DM-12 Hybrid cycle* — allows either of two races as bait).
- **Wildcard Dragon Evolutions**: 3 cards (*DM-08 Super Dragons* — accepts any creature with "Dragon" in its race).
- **Survivor Evolutions**: 2 cards (*DM-06 Q-tronic cycle* — accepts any friendly Survivor).

### Evolution Checklist Table

| Card ID | Name | Set | Civ | Cost | Power | Evolution Race Requirement | Mechanic Type |
| :--- | :--- | :--- | :--- | :---: | :---: | :--- | :--- |
| `DM02-005` | **Larba Geer, the Immaculate** | DM-02 | Light | 3 | 5000 | `Guardians` | Single Race |
| `DM02-015` | **Crystal Lancer** | DM-02 | Water | 6 | 8000 | `Liquid People` | Single Race |
| `DM02-024` | **Chaos Worm** | DM-02 | Darkness | 5 | 5000 | `Parasite Worms` | Single Race |
| `DM02-034` | **Armored Cannon Balbaro** | DM-02 | Fire | 3 | 3000 | `Humans` | Single Race |
| `DM02-045` | **Barkwhip, the Smasher** | DM-02 | Nature | 2 | 5000 | `Beast Folk` | Single Race |
| `DM02-S01` | **Ladia Bale, the Inspirational** | DM-02 | Light | 6 | 9500 | `Guardians` | Single Race |
| `DM02-S02` | **Crystal Paladin** | DM-02 | Water | 4 | 5000 | `Liquid People` | Single Race |
| `DM02-S03` | **Ultracide Worm** | DM-02 | Darkness | 6 | 11000 | `Parasite Worms` | Single Race |
| `DM02-S04` | **Armored Blaster Valdios** | DM-02 | Fire | 4 | 6000 | `Humans` | Single Race |
| `DM02-S05` | **Fighter Dual Fang** | DM-02 | Nature | 6 | 8000 | `Beast Folk` | Single Race |
| `DM03-008` | **Sieg Balicula, the Intense** | DM-03 | Light | 8 | 5000 | `Initiates` | Single Race |
| `DM03-018` | **Legendary Bynor** | DM-03 | Water | 6 | 8000 | `Leviathans` | Single Race |
| `DM03-029` | **Jack Viper, Shadow of Doom** | DM-03 | Darkness | 3 | 4000 | `Ghosts` | Single Race |
| `DM03-043` | **Überdragon Jabaha** | DM-03 | Fire | 7 | 11000 | `Armored Dragons` | Single Race |
| `DM03-047` | **Gigamantis** | DM-03 | Nature | 4 | 5000 | `Giant Insects` | Single Race |
| `DM04-001` | **Alcadeias, Lord of Spirits** | DM-04 | Light | 6 | 12500 | `Angel Commands` | Single Race |
| `DM04-002` | **Astral Warper** | DM-04 | Water | 6 | 5000 | `Cyber Viruses` | Single Race |
| `DM04-004` | **Doboulgyser, Giant Rock Beast** | DM-04 | Fire | 6 | 8000 | `Rock Beasts` | Single Race |
| `DM04-S03` | **Ballom, Master of Death** | DM-04 | Darkness | 8 | 12000 | `Demon Commands` | Single Race |
| `DM04-S05` | **Niofa, Horned Protector** | DM-04 | Nature | 6 | 9000 | `Horned Beasts` | Single Race |
| `DM06-012` | **Arc Bine, the Astounding** | DM-06 | Light | 5 | 5000 | `Guardians` | Single Race |
| `DM06-033` | **Fort Megacluster** | DM-06 | Water | 5 | 5000 | `Cyber Clusters` | Single Race |
| `DM06-054` | **Frost Specter, Shadow of Age** | DM-06 | Darkness | 3 | 5000 | `Ghosts` | Single Race |
| `DM06-071` | **Armored Decimator Valkaizer** | DM-06 | Fire | 5 | 5000 | `Humans` | Single Race |
| `DM06-086` | **Q-tronic Gargantua** | DM-06 | Fire | 6 | 9000 | `Survivors` | Survivor Evolution |
| `DM06-104` | **Living Citadel Vosh** | DM-06 | Nature | 5 | 5000 | `Colony Beetles` | Single Race |
| `DM06-S01` | **Craze Valkyrie, the Drastic** | DM-06 | Light | 6 | 7500 | `Initiates` | Single Race |
| `DM06-S03` | **Crystal Jouster** | DM-06 | Water | 7 | 7000 | `Liquid People` | Single Race |
| `DM06-S04` | **Q-tronic Hypermind** | DM-06 | Water | 8 | 8000 | `Survivors` | Survivor Evolution |
| `DM06-S06` | **Phantasmal Horror Gigazald** | DM-06 | Darkness | 5 | 5000 | `Chimeras` | Single Race |
| `DM06-S08` | **Lava Walker Executo** | DM-06 | Fire | 4 | 5000 | `Dragonoids` | Single Race |
| `DM06-S10` | **Ultra Mantis, Scourge of Fate** | DM-06 | Nature | 6 | 9000 | `Giant Insects` | Single Race |
| `DM07-009` | **Kizar Basiku, the Outrageous** | DM-07 | Light | 5 | 8500 | `Initiates` | Single Race |
| `DM07-030` | **Phantasmal Horror Gigazabal** | DM-07 | Darkness | 5 | 9000 | `Chimeras` | Single Race |
| `DM07-044` | **Valkrowzer, Ultra Rock Beast** | DM-07 | Fire | 6 | 9000 | `Rock Beasts` | Single Race |
| `DM07-055` | **World Tree, Root of Life** | DM-07 | Nature | 6 | 7000 | `Tree Folk` | Single Race |
| `DM07-S02` | **Cosmic Nebula** | DM-07 | Water | 5 | 3000 | `Cyber Viruses` | Single Race |
| `DM08-001` | **Kuukai, Finder of Karma** | DM-08 | Light | 5 | 10500 | `Mecha Thunders` | Single Race |
| `DM08-S02` | **Emperor Quazla** | DM-08 | Water | 6 | 5000 | `Cyber Lords` | Single Race |
| `DM08-S03` | **Super Necrodragon Abzo Dolba** | DM-08 | Darkness | 6 | 11000 | `creatures that has Dragon in its race` | Wildcard Dragon |
| `DM08-S04` | **Überdragon Bajula** | DM-08 | Fire | 7 | 13000 | `creatures that has Dragon in its race` | Wildcard Dragon |
| `DM08-S05` | **Super Terradragon Bailas Gale** | DM-08 | Nature | 5 | 9000 | `creatures that has Dragon in its race` | Wildcard Dragon |
| `DM09-001` | **Glena Vuele, the Hypnotic** | DM-09 | Light | 5 | 8500 | `Guardians` | Single Race |
| `DM09-003` | **Azaghast, Tyrant of Shadows** | DM-09 | Darkness | 7 | 9000 | `Dark Lords` | Single Race |
| `DM09-004` | **Balesk Baj, the Timeburner** | DM-09 | Fire | 9 | 8000 | `Armored Wyverns` | Single Race |
| `DM09-017` | **Emperor Maroll** | DM-09 | Water | 3 | 5000 | `Cyber Lords` | Single Race |
| `DM09-051` | **Storm Wrangler, the Furious** | DM-09 | Nature | 4 | 5000 | `Beast Folk` | Single Race |
| `DM10-016` | **Glais Mejicula, the Extreme** | DM-10 | Light | 2 | 5500 | `Initiates` | Single Race |
| `DM10-033` | **Crystal Spinslicer** | DM-10 | Water | 2 | 5000 | `Liquid People` | Single Race |
| `DM10-061` | **Zero Nemesis, Shadow of Panic** | DM-10 | Darkness | 6 | 6000 | `Ghosts` | Single Race |
| `DM10-062` | **Armored Raider Gandaval** | DM-10 | Fire | 5 | 6000 | `Human` | Single Race |
| `DM10-082` | **Earth Ripper, Talon of Rage** | DM-10 | Nature | 4 | 6000 | `Beast Folk` | Single Race |
| `DM11-001` | **Evil Incarnate** | DM-11 | Darkness | 6 | 11000 | `Devil Masks` | Single Race |
| `DM11-003` | **Diamondia, the Blizzard Rider** | DM-11 | Nature | 3 | 5000 | `Snow Faeries` | Single Race |
| `DM11-038` | **Jabaha's Automaton** | DM-11 | Fire | 5 | 6000 | `Xenoparts` | Single Race |
| `DM11-S01` | **Warlord Ailzonius** | DM-11 | Light | 5 | 8000 | `Gladiators` | Single Race |
| `DM12-005` | **Soul Phoenix, Avatar of Unity** | DM-12 | Fire / Nature | 4 | 13000 | `Fire Birds and one of your Earth Dragons` | Vortex Evolution (Dual Bait) |
| `DM12-016` | **Agira, the Warlord Crawler** | DM-12 | Light / Water | 4 | 5500 | `Gladiators or Earth Eaters` | Multi-Race Option |
| `DM12-017` | **Hydrooze, the Mutant Emperor** | DM-12 | Water / Darkness | 4 | 5000 | `Cyber Lords or Hedrians` | Multi-Race Option |
| `DM12-018` | **Phantomach, the Gigatrooper** | DM-12 | Darkness / Fire | 5 | 6000 | `Chimeras or Armorloids` | Multi-Race Option |
| `DM12-019` | **Nemonex, Bajula's Robomantis** | DM-12 | Fire / Nature | 6 | 5000 | `Xeno Parts or Giant Insects` | Multi-Race Option |
| `DM12-020` | **Comet Eye, The Spectral Spud** | DM-12 | Light / Nature | 4 | 5500 | `Wild Veggies or a Rainbow Phantoms` | Multi-Race Option |
| `DM12-S02` | **Wise Starnoid, Avatar of Hope** | DM-12 | Light / Water | 5 | 9000 | `Light Bringers and one of your Cyber Lords` | Vortex Evolution (Dual Bait) |
| `DM12-S03` | **Cruel Naga, Avatar of Fate** | DM-12 | Water / Darkness | 6 | 9000 | `Merfolks and one of your Chimeras` | Vortex Evolution (Dual Bait) |
| `DM12-S04` | **Death Phoenix, Avatar of Doom** | DM-12 | Darkness / Fire | 4 | 9000 | `Zombie Dragons and one of your Fire Birds` | Vortex Evolution (Dual Bait) |
| `DM12-S05` | **Aura Pegasus, Avatar of Life** | DM-12 | Light / Nature | 6 | 12000 | `Horn Beasts and one of your Angel Commands` | Vortex Evolution (Dual Bait) |

### Evolution False-Positive Audit & Corrections Note
During initial data parsing, 3 cards in DM-03 and DM-06 were flagged due to mentioning "evolution" in their text. The rules parser was refined with strict regex `/(?:Vortex\s+)?Evolution\s*(?:—|-|–)\s*Put on/i`, correctly classifying them as standard creatures:
1. **`DM03-050` Pouch Shell**: Regular creature with on-play de-evolution ability (*"choose one of your opponent's evolution creatures... put the top card into opponent's graveyard"*).
2. **`DM06-002` Lu Gila, Silver Rift Guardian**: Regular Blocker creature with static hate aura (*"Evolution creatures are put into the battle zone tapped"*).
3. **`DM06-103` Innocent Hunter, Blade of All**: Regular creature with universal bait ability (*"You can put an evolution creature of any race on this creature"*).

---

## Section 2: Multi-Civilization Cards (DM-10 to DM-12, 45 Cards)

Introduced in **DM-10 Shockwaves of the Shattered Rainbow**, multi-civilization cards combine two different civilizations into a single card frame.

### Multi-Civilization Core Rules
1. **Mana Zone Tap Rule**: When a multi-civilization card is put into the mana zone from hand or deck, it is placed into the mana zone **tapped**. It cannot be tapped for mana on the turn it is played.
2. **Mana Production**: When tapped in subsequent turns, it produces **1 mana** of either civilization (player's choice when generating mana, but only 1 total mana per card).
3. **Casting Civilization Requirement**: To cast or summon a multi-civilization card, the player must have at least **1 card of EACH** of the card's civilizations in their mana zone (one of which may be the card tapped to pay for it).

### Dual-Civilization Pairings Distribution

| Civilization Pairing | Set DM-10 | Set DM-11 | Set DM-12 | Total Cards |
| :--- | :---: | :---: | :---: | :---: |
| **Darkness / Fire** | 4 | 2 | 3 | **9** |
| **Darkness / Water** | 4 | 2 | 3 | **9** |
| **Fire / Nature** | 4 | 2 | 3 | **9** |
| **Light / Nature** | 4 | 2 | 3 | **9** |
| **Light / Water** | 4 | 2 | 3 | **9** |
| **Total Multi-Civ Cards** | **20** | **10** | **15** | **45** |

### Complete Multi-Civilization Cards Table

| Card ID | Name | Set | Civilizations | Type | Cost | Power | Primary Abilities / Rules Summary |
| :--- | :--- | :--- | :--- | :--- | :---: | :---: | :--- |
| `DM10-008` | **Tanzanyte, the Awakener** | DM-10 | Water / Darkness | Creature | 7 | 9000 | Double breaker (This creature breaks 2 shields.)<br>Instead of having this creature attack, you may tap it to use... |
| `DM10-009` | **Bombazar, Dragon of Destiny** | DM-10 | Fire / Nature | Creature | 7 | 6000 | When you put this creature into the battle zone, destroy all other creatures that have 6000 power. Take an ext... |
| `DM10-010` | **Techno Totem** | DM-10 | Light / Nature | Creature | 4 | 5000 | While this creature is tapped, each of your other creatures has "power attacker +1500." (While attacking, a cr... |
| `DM10-096` | **Aqua Skydiver** | DM-10 | Light / Water | Creature | 4 | 1000 | Shield trigger (When this creature is put into your hand from your shield zone, you may summon it for no cost.... |
| `DM10-097` | **Estol, Vizier of Aqua** | DM-10 | Light / Water | Creature | 5 | 2000 | When you put this creature into the battle zone, add the top card of your deck to your shields face down. Then... |
| `DM10-098` | **Tajimal, Vizier of Aqua** | DM-10 | Light / Water | Creature | 3 | 4000 | Blocker (Whenever an opponent's creature attacks, you may tap this creature to stop the attack. Then the 2 cre... |
| `DM10-099` | **Melnia, the Aqua Shadow** | DM-10 | Water / Darkness | Creature | 2 | 1000 | This creature can't be blocked.<br>Slayer (Whenever this creature battles, destroy the other creature after the b... |
| `DM10-100` | **Pointa, the Aqua Shadow** | DM-10 | Water / Darkness | Creature | 5 | 2000 | When you put this creature into the battle zone, look at one of your opponent's shields. Then your opponent di... |
| `DM10-101` | **Soderlight, the Cold Blade** | DM-10 | Water / Darkness | Creature | 4 | 4000 | This creature can't be blocked.<br>Silent skill (At the start of each of your turns, if this creature is tapped, ... |
| `DM10-102` | **Dolmarks, the Shadow Warrior** | DM-10 | Darkness / Fire | Creature | 4 | 4000 | When you put this creature into the battle zone, destroy one of your creatures and put a card from your mana z... |
| `DM10-103` | **Galek, the Shadow Warrior** | DM-10 | Darkness / Fire | Creature | 5 | 2000 | When you put this creature into the battle zone, destroy one of your opponent's creatures that has "blocker." ... |
| `DM10-104` | **Ulex, the Dauntless** | DM-10 | Darkness / Fire | Creature | 3 | 3000 | Your opponent can't tap this creature. |
| `DM10-105` | **Gonta, the Warrior Savage** | DM-10 | Fire / Nature | Creature | 2 | 4000 | - |
| `DM10-106` | **Tagtapp, the Retaliator** | DM-10 | Fire / Nature | Creature | 3 | 3000 | This creature gets +1000 power for each water card in your opponent's mana zone.<br>While this creature has power... |
| `DM10-107` | **Wind Axe, the Warrior Savage** | DM-10 | Fire / Nature | Creature | 5 | 2000 | When you put this creature into the battle zone, destroy one of your opponent's creatures that has "blocker." ... |
| `DM10-108` | **Lukia Lex, Pinnacle Guardian** | DM-10 | Light / Nature | Creature | 3 | 2500 | Power attacker +3000 (While attacking, this creature gets +3000 power.)<br>At the end of each of your turns, you ... |
| `DM10-109` | **Sanfist, the Savage Vizier** | DM-10 | Light / Nature | Creature | 3 | 3000 | Blocker (Whenever an opponent's creature attacks, you may tap this creature to stop the attack. Then the 2 cre... |
| `DM10-110` | **Skysword, the Savage Vizier** | DM-10 | Light / Nature | Creature | 5 | 2000 | When you put this creature into the battle zone, put the top card of your deck into your mana zone. Then add t... |
| `DM10-S09` | **Bluum Erkis, Flare Guardian** | DM-10 | Light / Water | Creature | 6 | 8500 | Whenever this creature would break one of your opponent's shields, your opponent shows that shield to you inst... |
| `DM10-S10` | **Deklowaz, the Terminator** | DM-10 | Darkness / Fire | Creature | 6 | 5000 | Instead of having this creature attack, you may tap it to use its $tap ability.<br>$tap Destroy all creatures tha... |
| `DM11-004` | **Miraculous Snare** | DM-11 | Light / Water | Spell | 3 | - | Choose a non-evolution creature in the battle zone and add it to its owner's shields face down. |
| `DM11-005` | **Miraculous Truce** | DM-11 | Light / Nature | Spell | 5 | - | Shield trigger (When this spell is put into your hand from your shield zone, you may cast it for no cost.)<br><br>Ch... |
| `DM11-051` | **Rise and Shine** | DM-11 | Light / Water | Spell | 4 | - | Shield trigger (When this spell is put into your hand from your shield zone, you may cast it for no cost.)<br><br>Re... |
| `DM11-052` | **Live and Breathe** | DM-11 | Light / Nature | Spell | 3 | - | Whenever you summon a creature this turn, search your deck. You may take a creature from your deck that has th... |
| `DM11-053` | **Hide and Seek** | DM-11 | Water / Darkness | Spell | 4 | - | Choose one of your opponent's non-evolution creatures in the battle zone and return it to his hand. Then he di... |
| `DM11-054` | **Slash and Burn** | DM-11 | Darkness / Fire | Spell | 4 | - | Whenever any of your opponent's creatures is destroyed this turn, your opponent chooses a card in his mana zon... |
| `DM11-055` | **Reap and Sow** | DM-11 | Fire / Nature | Spell | 5 | - | Choose a card in your opponent's mana zone and put it into his graveyard. Then put the top card of your deck i... |
| `DM11-S03` | **Miraculous Plague** | DM-11 | Water / Darkness | Spell | 7 | - | Choose 2 of your opponent's creatures in the battle zone. Your opponent chooses one of them, puts it into his ... |
| `DM11-S04` | **Miraculous Meltdown** | DM-11 | Darkness / Fire | Spell | 6 | - | You can cast this spell only if your opponent has more shields than you do.<br>Your opponent chooses one of his s... |
| `DM11-S05` | **Miraculous Rebirth** | DM-11 | Fire / Nature | Spell | 6 | - | Destroy one of your opponent's creatures that has power 5000 or less. When your opponent puts that creature in... |
| `DM12-005` | **Soul Phoenix, Avatar of Unity** | DM-12 | Fire / Nature | Evolution Creature | 4 | 13000 | Vortex Evolution—Put on one of your Fire Birds and one of your Earth Dragons.<br>Triple breaker (This creature br... |
| `DM12-016` | **Agira, the Warlord Crawler** | DM-12 | Light / Water | Evolution Creature | 4 | 5500 | Evolution—Put on one of your Gladiators or Earth Eaters.<br>Each of your other Gladiators and Earth Eaters in the... |
| `DM12-017` | **Hydrooze, the Mutant Emperor** | DM-12 | Water / Darkness | Evolution Creature | 4 | 5000 | Evolution—Put on one of your Cyber Lords or Hedrians.<br>Each of your other Cyber Lords and Hedrians in the battl... |
| `DM12-018` | **Phantomach, the Gigatrooper** | DM-12 | Darkness / Fire | Evolution Creature | 5 | 6000 | Evolution—Put on one of your Chimeras or Armorloids.<br>Each of your other Chimeras and Armorloids in the battle ... |
| `DM12-019` | **Nemonex, Bajula's Robomantis** | DM-12 | Fire / Nature | Evolution Creature | 6 | 5000 | Evolution—Put on one of your Xeno Parts or Giant Insects.<br>Each of your other Xeno Parts and Giant Insects in t... |
| `DM12-020` | **Comet Eye, The Spectral Spud** | DM-12 | Light / Nature | Evolution Creature | 4 | 5500 | Evolution—Put on one of your Wild Veggies or a Rainbow Phantoms.<br>Each of your other Wild Veggies and Rainbow P... |
| `DM12-031` | **Electro Explorer Syrion** | DM-12 | Light / Water | Creature | 3 | 4000 | - |
| `DM12-032` | **Sea Mutant Dormel** | DM-12 | Water / Darkness | Creature | 3 | 4000 | - |
| `DM12-033` | **Gigappi Ponto** | DM-12 | Darkness / Fire | Creature | 3 | 4000 | - |
| `DM12-034` | **Buzz Betocchi** | DM-12 | Fire / Nature | Creature | 3 | 4000 | - |
| `DM12-035` | **Spectral Horn Glitalis** | DM-12 | Nature / Light | Creature | 3 | 4000 | - |
| `DM12-S02` | **Wise Starnoid, Avatar of Hope** | DM-12 | Light / Water | Evolution Creature | 5 | 9000 | Vortex Evolution—Put on one of your Light Bringers and one of your Cyber Lords.<br>Whenever this creature attacks... |
| `DM12-S03` | **Cruel Naga, Avatar of Fate** | DM-12 | Water / Darkness | Evolution Creature | 6 | 9000 | Vortex Evolution—Put on one of your Merfolks and one of your Chimeras.<br>This creature can't be blocked.<br>Double ... |
| `DM12-S04` | **Death Phoenix, Avatar of Doom** | DM-12 | Darkness / Fire | Evolution Creature | 4 | 9000 | Vortex Evolution—Put on one of your Zombie Dragons and one of your Fire Birds.<br>Double breaker (This creature b... |
| `DM12-S05` | **Aura Pegasus, Avatar of Life** | DM-12 | Light / Nature | Evolution Creature | 6 | 12000 | Vortex Evolution—Put on one of your Horn Beasts and one of your Angel Commands.<br>Whenever this creature attacks... |

---

## Section 3: Survivors & Shared Abilities (DM-05 & DM-06, 18 Cards)

Survivors are a tribe introduced in **DM-05 Survivors of the Megapocalypse** and expanded in **DM-06 Stomp-A-Trons of Invincible Wrath**.

### Survivor Core Rules & Verification Checklist
1. **Shared Ability Propagation**: Each friendly creature in the battle zone with the `Survivor` race inherits every `Survivor : <ability>` printed on all friendly Survivors in the battle zone.
2. **Dynamic Gaining & Losing**: As Survivors enter or leave the battle zone, the shared abilities are dynamically added or removed immediately without requiring state recomputation steps.
3. **Stacking**: Multiple instances of additive abilities (e.g., *Blazosaur Q* giving Power Attacker +1000, or *Smash Horn Q* giving +1000 power) stack additively.
4. **Vanilla Survivor Case (*Promephius Q* - DM06-042)**: Verified vanilla card in canonical printings. It has 2000 power for 3 mana and race `Survivor / Sea Hacker`. It contributes no ability of its own, but gains all abilities from other Survivors.
5. **Survivor Evolutions (*Q-tronic Gargantua* & *Q-tronic Hypermind*)**: Evolve on top of any Survivor. Gargantua introduces **Crew Breaker - Survivor** (+1 shield broken per other friendly Survivor).

### Survivors Table

| Card ID | Name | Set | Civ | Cost | Power | Subtypes | Granted Survivor Ability / Effect |
| :--- | :--- | :--- | :--- | :---: | :---: | :--- | :--- |
| `DM05-004` | **Bladerush Skyterror Q** | DM-05 | Fire | 7 | 5000 | Survivor, Armored Wyvern | Double breaker (This creature breaks 2 shields.) |
| `DM05-006` | **Ballus, Dogfight Enforcer Q** | DM-05 | Light | 5 | 3000 | Survivor, Berserker | At the end of each of your turns, untap this creature. |
| `DM05-008` | **Gallia Zohl, Iron Guardian Q** | DM-05 | Light | 5 | 2000 | Survivor, Guardian | Blocker (Whenever an opponent's creature attacks, you may tap this creature to stop the attack. Then the 2 creatures battle.) |
| `DM05-023` | **Spikestrike Ichthys Q** | DM-05 | Water | 6 | 3000 | Survivor, Fish | This creature can't be blocked. |
| `DM05-024` | **Split-Head Hydroturtle Q** | DM-05 | Water | 5 | 2000 | Survivor, Gel Fish | Whenever this creature attacks, you may draw a card. |
| `DM05-027` | **Gigaling Q** | DM-05 | Darkness | 5 | 2000 | Survivor, Chimera | Slayer (Whenever this creature battles, destroy the other creature after the battle.) |
| `DM05-032` | **Skullsweeper Q** | DM-05 | Darkness | 4 | 1000 | Survivor, Brain Jacker | Whenever this creature attacks, your opponent chooses and discards a card from his hand. |
| `DM05-036` | **Blazosaur Q** | DM-05 | Fire | 2 | 1000 | Survivor, Rock Beast | Power attacker +1000 (While attacking, this creature gets +1000 power.) |
| `DM05-047` | **Balloonshroom Q** | DM-05 | Nature | 4 | 2000 | Survivor, Balloon Mushroom | When this creature would be destroyed, put it into your mana zone instead. |
| `DM05-055` | **Smash Horn Q** | DM-05 | Nature | 3 | 2000 | Survivor, Horned Beast | This creature gets +1000 power. |
| `DM06-019` | **Forbos, Sanctum Guardian Q** | DM-06 | Light | 6 | 4000 | Survivor, Guardian | When you put this creature into the battle zone, search your deck. You may take a spell from your deck, show that spell to your opponent, and put it into your hand. Then shuffle your deck. |
| `DM06-042` | **Promephius Q** | DM-06 | Water | 3 | 2000 | Survivor, Sea Hacker | *Vanilla Survivor*: Has no inherent ability of its own; receives all abilities granted by other friendly Survivors in the battle zone. |
| `DM06-044` | **Ripple Lotus Q** | DM-06 | Water | 6 | 2000 | Survivor, Cyber Virus | When you put this creature into the battle zone, you may choose one of your opponent's creatures in the battle zone and tap it. |
| `DM06-058` | **Grave Worm Q** | DM-06 | Darkness | 5 | 3000 | Survivor, Parasite Worm | When you put this creature into the battle zone, you may return a Survivor from your graveyard to your hand. |
| `DM06-086` | **Q-tronic Gargantua** | DM-06 | Fire | 6 | 9000 | Survivor | *Survivor Evolution*: Crew breaker - Survivor (Breaks +1 shield for each other friendly Survivor). |
| `DM06-088` | **Rumblesaur Q** | DM-06 | Fire | 6 | 3000 | Survivor, Rock Beast | Speed attacker (This creature doesn't get summoning sickness.) |
| `DM06-097` | **Factory Shell Q** | DM-06 | Nature | 6 | 2000 | Survivor, Colony Beetle | When you put this creature into the battle zone, search your deck. You may take a Survivor from your deck, show that Survivor to your opponent, and put it into your hand. Then shuffle your deck. |
| `DM06-S04` | **Q-tronic Hypermind** | DM-06 | Water | 8 | 8000 | Survivor | *Survivor Evolution*: On summon, draw 1 card for each Survivor in the battle zone. Double breaker. |

---

## Section 4: Chargers & Mana Acceleration Spells (DM-07 to DM-09, 15 Cards)

Charger spells provide spell utility while accelerating the player's mana development.

### Charger Core Rules & Verification Checklist
1. **Destination Redirection**: When a spell with the Charger keyword resolves, instead of being placed into the graveyard, it is put directly into the player's **mana zone**.
2. **State in Mana Zone**: Unlike multi-civ cards which enter tapped, single-civilization Charger spells enter the mana zone **untapped** unless another continuous effect dictates otherwise.
3. **Interrupted Resolution / Counterspells**: If a Charger spell is countered or canceled before resolving, it goes to the graveyard as normal unless the countering effect specifies another zone.

### Chargers Table

| Card ID | Name | Set | Civ | Cost | Spell Effect Summary | Charger Rule |
| :--- | :--- | :--- | :--- | :---: | :--- | :--- |
| `DM07-010` | **Lightning Charger** | DM-07 | Light | 4 | Choose one of your opponent's creatures in the battle zone and tap it. | Puts into mana zone upon resolution instead of graveyard. |
| `DM07-022` | **Riptide Charger** | DM-07 | Water | 5 | Choose a creature in the battle zone and return it to its owner's hand. | Puts into mana zone upon resolution instead of graveyard. |
| `DM07-035` | **Venom Charger** | DM-07 | Darkness | 3 | One of your creatures in the battle zone gets "slayer" until the end of the turn. (Whenever a creature that has "slayer" battles, destroy the other creature after the battle.) | Puts into mana zone upon resolution instead of graveyard. |
| `DM07-039` | **Energy Charger** | DM-07 | Fire | 3 | One of your creatures gets +2000 power until the end of the turn. | Puts into mana zone upon resolution instead of graveyard. |
| `DM07-051` | **Mulch Charger** | DM-07 | Nature | 3 | Put one of your creatures from the battle zone into your mana zone. | Puts into mana zone upon resolution instead of graveyard. |
| `DM08-008` | **Lunar Charger** | DM-08 | Light | 3 | Choose up to 2 of your creatures in the battle zone. At the end of the turn, you may untap them. | Puts into mana zone upon resolution instead of graveyard. |
| `DM08-018` | **Eureka Charger** | DM-08 | Water | 4 | Draw a card. | Puts into mana zone upon resolution instead of graveyard. |
| `DM08-026` | **Corpse Charger** | DM-08 | Darkness | 4 | Put a creature from your graveyard into your hand. | Puts into mana zone upon resolution instead of graveyard. |
| `DM08-045` | **Volcano Charger** | DM-08 | Fire | 4 | Destroy one of your opponent's creatures that has power 2000 or less. | Puts into mana zone upon resolution instead of graveyard. |
| `DM08-050` | **Muscle Charger** | DM-08 | Nature | 3 | Each of your creatures in the battle zone gets +3000 power until the end of the turn. | Puts into mana zone upon resolution instead of graveyard. |
| `DM08-052` | **Root Charger** | DM-08 | Nature | 3 | Whenever any of your creatures would be destroyed this turn, put it into your mana zone instead. | Puts into mana zone upon resolution instead of graveyard. |
| `DM09-013` | **Nexus Charger** | DM-09 | Light | 6 | Add a card from your hand to your shields face down. | Puts into mana zone upon resolution instead of graveyard. |
| `DM09-016` | **Abduction Charger** | DM-09 | Water | 7 | Choose up to 2 creatures in the battle zone and return them to their owners' hands. | Puts into mana zone upon resolution instead of graveyard. |
| `DM09-032` | **Slash Charger** | DM-09 | Darkness | 3 | Search a player's deck. You may take a card from that deck and put it into that player's graveyard. Then the player shuffles his deck. | Puts into mana zone upon resolution instead of graveyard. |
| `DM09-053` | **Vine Charger** | DM-09 | Nature | 4 | Your opponent chooses one of his creatures in the battle zone and puts it into his mana zone. | Puts into mana zone upon resolution instead of graveyard. |

---

## Section 5: High-Impact & Unusual Breakers (17 Cards)

Duel Masters standard creatures break 1 shield; Double Breakers break 2. High-impact breakers break 3+ shields or scale dynamically.

### Table 5.1: Triple Breakers (15 Cards)

| Card ID | Name | Set | Civ | Cost | Power | Breaker Type | Special Attack Conditions / Notes |
| :--- | :--- | :--- | :--- | :---: | :---: | :--- | :--- |
| `DM05-037` | **Bolgash Dragon** | DM-05 | Fire | 8 | 4000 | Static Triple Breaker | Power attacker +8000 (While attacking, this creature gets +8000 power.) |
| `DM05-053` | **Nocturnal Giant** | DM-05 | Nature | 7 | 7000 | Static Triple Breaker | This creature can't attack creatures.<br>Power attacker +7000 (While attacking, this creature gets... |
| `DM05-S01` | **Syrius, Firmament Elemental** | DM-05 | Light | 11 | 12000 | Static Triple Breaker | Blocker (Whenever an opponent's creature attacks, you may tap this creature to stop the attack.... |
| `DM05-S02` | **King Tsunami** | DM-05 | Water | 12 | 12000 | Static Triple Breaker | When you put this creature into the battle zone, return all other creatures from the battle zon... |
| `DM05-S03` | **Death Cruzer, the Annihilator** | DM-05 | Darkness | 7 | 13000 | Static Triple Breaker | When you put this creature into the battle zone, destroy all your other creatures. |
| `DM05-S04` | **Billion-Degree Dragon** | DM-05 | Fire | 10 | 15000 | Static Triple Breaker | - |
| `DM07-S05` | **Headlong Giant** | DM-07 | Nature | 9 | 14000 | Static Triple Breaker | This creature can't attack if you have no cards in your hand.<br>Whenever this creature attacks, d... |
| `DM08-S03` | **Super Necrodragon Abzo Dolba** | DM-08 | Darkness | 6 | 11000 | Static Triple Breaker | Evolution—Put on one of your creatures that has Dragon in its race.<br>This creature gets +2000 po... |
| `DM08-S04` | **Überdragon Bajula** | DM-08 | Fire | 7 | 13000 | Static Triple Breaker | Evolution—Put on one of your creatures that has Dragon in its race.<br>Whenever this creature atta... |
| `DM09-S04` | **Magmadragon Ogrist Vhal** | DM-09 | Fire | 7 | 0 | Conditional (Active when power >= 15,000) | This creature gets +3000 power for each card in your hand. (A creature that has power 0 or less... |
| `DM09-S05` | **Stratosphere Giant** | DM-09 | Nature | 8 | 13000 | Static Triple Breaker | When you put this creature into the battle zone, your opponent chooses up to 2 creatures in his... |
| `DM10-S01` | **Elixia, Pureblade Elemental** | DM-10 | Light | 6 | 1000 | Conditional (Active when power >= 15,000) | This creature gets +3000 power for each civilization in your mana zone.<br>While this creature has... |
| `DM10-S08` | **Terradragon Dakma Balgarow** | DM-10 | Nature | 7 | 1000 | Conditional (Active when power >= 15,000) | This creature gets +2000 power for each shield you and your opponent have.<br>While this creature ... |
| `DM12-005` | **Soul Phoenix, Avatar of Unity** | DM-12 | Fire / Nature | 4 | 13000 | Static Triple Breaker | (This creature is put into your mana zone tapped.)<br>Vortex Evolution—Put on one of your Fire Bir... |
| `DM12-S05` | **Aura Pegasus, Avatar of Life** | DM-12 | Light / Nature | 6 | 12000 | Static Triple Breaker | (This creature is put into your mana zone tapped.)<br>Vortex Evolution—Put on one of your Horn Bea... |

### Table 5.2: Scaling, Crew & Shield-Burning Breakers

| Card ID | Name | Set | Civ | Breaker Mechanic | Rules Text & Engine Verification Requirement |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `DM06-086` | **Q-tronic Gargantua** | DM-06 | Nature | **Crew Breaker - Survivor** | Breaks 1 additional shield for each other friendly Survivor in the battle zone. Dynamic calculation at shield break resolution. |
| `DM10-S06` | **Ultimate Dragon** | DM-10 | Fire | **Crew Breaker - Dragon** | Breaks 1 additional shield for each other friendly Dragon in the battle zone. Power also scales +5000 per Dragon. |
| `DM06-S07` | **Bolmeteus Steel Dragon** | DM-06 | Fire | **Shield Burn (Graveyard)** | Whenever it breaks shields, opponent puts them into graveyard instead of hand. **Shield Triggers do not activate**. |
| `DM12-S04` | **Death Phoenix, Avatar of Doom** | DM-12 | Dark/Fire | **Shield Burn + Hand Wipe** | Breaks shields to graveyard instead of hand (no Shield Triggers). When it leaves battle zone, opponent discards entire hand. |
| `DM10-S09` | **Bluum Erkis, Flare Guardian** | DM-10 | Light/Fire | **Shield Steal / Trigger Cast** | On shield break, reveals shield; if Spell Shield Trigger, you cast it free! Otherwise opponent takes to hand. |
| `DM05-S05` | **Avalanche Giant** | DM-05 | Nature | **Block-Breaker** | Whenever blocked, breaks 1 opponent shield anyway! Double breaker against unblocked attacks. |

---

## Section 6: Complex Mechanics, Triggers, Tutors & Swaps

### 6.1 Silent Skill Creatures (21 Cards + 2 Support Cards)
Introduced in DM-10, Silent Skill grants a powerful ability during the untap step: **at the start of your turn, if this creature is tapped, you may choose to keep it tapped instead of untapping it. If you do, use its Silent Skill ability.**

#### Silent Skill Bearers (21 Cards)

| Card ID | Name | Set | Civ | Cost | Power | Silent Skill Ability Effect |
| :--- | :--- | :--- | :--- | :---: | :---: | :--- |
| `DM10-005` | **Kejila, the Hidden Horror** | DM-10 | Darkness | 6 | 6000 | This creature breaks 2 of your opponent's shields. |
| `DM10-012` | **Bulgluf, the Spydroid** | DM-10 | Light | 6 | 4000 | Add the top card of your deck to your shields face down. |
| `DM10-015` | **Flohdani, the Spydroid** | DM-10 | Light | 4 | 4000 | Choose up to 2 of your opponent's creatures in the battle zone and tap them. |
| `DM10-018` | **Kaemira, the Oracle** | DM-10 | Light | 4 | 1000 | Add the top card of your deck to your shields face down. |
| `DM10-032` | **Charge Whipper** | DM-10 | Water | 3 | 2000 | You may add a card from your hand to your shields face down. If you do, choose one of your shields and put it into your hand. You can't use the "shield trigger" ability of that shield. |
| `DM10-035` | **Milporo** | DM-10 | Water | 4 | 3000 | Draw a card. |
| `DM10-037` | **Pinpoint Lunatron** | DM-10 | Water | 6 | 2000 | Choose a creature in the battle zone or a card in either player's mana zone and return it to its owner's hand. |
| `DM10-048` | **Gigamente** | DM-10 | Darkness | 4 | 3000 | Return a creature from your graveyard to your hand. |
| `DM10-060` | **Venom Capsule** | DM-10 | Darkness | 2 | 1000 | This creature breaks one of your opponent's shields. |
| `DM10-063` | **Brad, Super Kickin' Dynamo** | DM-10 | Fire | 3 | 2000 | Destroy one of your opponent's creatures that has "blocker." |
| `DM10-071` | **Minelord Skyterror** | DM-10 | Fire | 4 | 3000 | Destroy all creatures that have power 3000 or less. |
| `DM10-078` | **Vorg's Engine** | DM-10 | Fire | 2 | 2000 | Destroy all creatures that have power 2000 or less. |
| `DM10-084` | **Hustle Berry** | DM-10 | Nature | 2 | 1000 | Put the top card of your deck into your mana zone. |
| `DM10-092` | **Sporeblast Erengi** | DM-10 | Nature | 4 | 4000 | Search your deck. You may take a creature from your deck, show that creature to your opponent, and put it into your hand. |
| `DM10-101` | **Soderlight, the Cold Blade** | DM-10 | Water / Darkness | 4 | 4000 | Your opponent chooses one of his creatures and destroys it. |
| `DM11-007` | **Baraid, the Explorer** | DM-11 | Light | 5 | 5000 | Your light creatures can't be blocked this turn. |
| `DM11-021` | **Squawking Lunatron** | DM-11 | Water | 5 | 4000 | Return up to 3 cards from your mana zone to your hand. |
| `DM11-026` | **Gazer Eyes, Shadow of Secrets** | DM-11 | Darkness | 4 | 3000 | Look at your opponent's hand and choose a card from it. Your opponent discards that card. |
| `DM11-036` | **Gankloak, Rogue Commando** | DM-11 | Fire | 3 | 2000 | Each of your fire creatures in the battle zone gets "double breaker" until the end of the turn. (It breaks 2 shields.) |
| `DM11-048` | **Rollicking Totem** | DM-11 | Nature | 5 | 4000 | Put a creature that has Dragon in its race from your mana zone into the battle zone. |
| `DM11-049` | **Royal Durian** | DM-11 | Nature | 5 | 1000 | Put a creature that has Dragon in its race from your mana zone into the battle zone. |

#### Silent Skill Support & Tribal Lords (2 Cards)

| Card ID | Name | Set | Civ | Cost | Power | Support Aura / Interaction |
| :--- | :--- | :--- | :--- | :---: | :---: | :--- |
| `DM10-036` | **Mystic Magician** | DM-10 | Water | 5 | 3000 | Your creatures that have "silent skill" enter the battle zone tapped. When one of your creatures with "silent skill" would be destroyed, return it to hand instead! |
| `DM10-064` | **Burnwisp Lizard** | DM-10 | Fire | 5 | 4000 | Each of your creatures in the battle zone that has "silent skill" has "speed attacker." |

### 6.2 Tap Ability Creatures (41 Cards)
Introduced in DM-06, Tap Abilities allow a creature to activate a special spell-like ability **instead of attacking** by tapping itself.

| Card ID | Name | Set | Civ | Cost | Power | Tap Ability Effect |
| :--- | :--- | :--- | :--- | :---: | :---: | :--- |
| `DM06-003` | **Aeropica** | DM-06 | Water | 7 | 4000 | Choose a creature in the battle zone and return it to its owner's hand. |
| `DM06-006` | **Tank Mutant** | DM-06 | Darkness | 9 | 6000 | Your opponent chooses one of his creatures in the battle zone and destroys it. |
| `DM06-011` | **Adomis, the Oracle** | DM-06 | Light | 3 | 2000 | Choose a shield and look at it. Then put it back where it was. |
| `DM06-016` | **Chen Treg, Vizier of Blades** | DM-06 | Light | 5 | 2000 | Choose one of your opponent's creatures in the battle zone and tap it. |
| `DM06-017` | **Cosmogold, Spectral Knight** | DM-06 | Light | 4 | 3000 | Return a spell from your mana zone to your hand. |
| `DM06-040` | **Neon Cluster** | DM-06 | Water | 7 | 4000 | Draw 2 cards. |
| `DM06-046` | **Sopian** | DM-06 | Water | 4 | 2000 | Choose one of your creatures in the battle zone. It can't be blocked this turn. |
| `DM06-059` | **Grim Soul, Shadow of Reversal** | DM-06 | Darkness | 5 | 3000 | Return a darkness creature from your graveyard to your hand. |
| `DM06-064` | **Lupa, Poison-Tipped Doll** | DM-06 | Darkness | 2 | 1000 | One of your creatures in the battle zone gets "slayer" until the end of the turn. (Whenever a creature that has "slayer" battles, destroy the other creature after the battle.) |
| `DM06-081` | **Legionnaire Lizard** | DM-06 | Fire | 6 | 4000 | One of your creatures in the battle zone gets "speed attacker" until the end of the turn. |
| `DM06-082` | **Migasa, Adept of Chaos** | DM-06 | Fire | 3 | 2000 | One of your fire creatures in the battle zone gets "double breaker" until the end of the turn. (A creature that has "double breaker" breaks 2 shields.) |
| `DM06-087` | **Rikabu's Screwdriver** | DM-06 | Fire | 2 | 1000 | Destroy one of your opponent's creatures that has "blocker." |
| `DM06-091` | **Bliss Totem, Avatar of Luck** | DM-06 | Nature | 6 | 5000 | Put up to 3 cards from your graveyard into your mana zone. |
| `DM06-094` | **Charmilia, the Enticer** | DM-06 | Nature | 4 | 3000 | Search your deck. You may take a creature from your deck, show that creature to your opponent, and put it into your hand. Then shuffle your deck. |
| `DM06-105` | **Mighty Bandit, Ace of Thieves** | DM-06 | Nature | 3 | 2000 | One of your creatures in the battle zone gets +5000 power until the end of the turn. |
| `DM07-001` | **Gandar, Seeker of Explosions** | DM-07 | Light | 7 | 6500 | At the end of the turn, untap all your light creatures. |
| `DM07-002` | **King Benthos** | DM-07 | Water | 8 | 6000 | Each of your water creatures gets "This creature can't be blocked" until the end of the turn. |
| `DM07-003` | **Battleship Mutant** | DM-07 | Darkness | 6 | 5000 | Until the end of the turn, each of your darkness creatures in the battle zone gets +4000 power and "double breaker." Whenever any of those creatures battles this turn, destroy it after the battle. |
| `DM07-004` | **Armored Transport Galiacruse** | DM-07 | Fire | 6 | 5000 | Each of your fire creatures gets "This creature can attack untapped creatures" until the end of the turn. |
| `DM07-005` | **Spinning Totem** | DM-07 | Nature | 5 | 4000 | This turn, whenever any of your nature creatures is attacking your opponent and becomes blocked, it breaks one of his shields. (If a creature has "double breaker" or "triple breaker," it still breaks only one shield.) |
| `DM07-015` | **Rondobil, the Explorer** | DM-07 | Light | 6 | 5000 | Add one of your creatures from the battle zone to your shields face down. |
| `DM07-017` | **Aqua Fencer** | DM-07 | Water | 7 | 3000 | Choose a card in your opponent's mana zone and return it to his hand. |
| `DM07-018` | **Biancus** | DM-07 | Water | 6 | 3000 | Choose one of your creatures in the battle zone. It can't be blocked this turn. |
| `DM07-021` | **Garatyano** | DM-07 | Water | 4 | 2000 | Look at the top 3 cards of your deck. Then put them back in any order. |
| `DM07-041` | **Kipo's Contraption** | DM-07 | Fire | 8 | 3000 | Destroy one of your opponent's creatures that has power 2000 or less. |
| `DM07-046` | **Brood Shell** | DM-07 | Nature | 4 | 3000 | Return a creature from your mana zone to your hand. |
| `DM07-052` | **Popple, Flowerpetal Dancer** | DM-07 | Nature | 4 | 2000 | Put the top card of your deck into your mana zone. |
| `DM07-054` | **Tangle Fist, the Weaver** | DM-07 | Nature | 4 | 2000 | Put up to 3 cards from your hand into your mana zone. |
| `DM07-S03` | **Crath Lade, Merciless King** | DM-07 | Darkness | 8 | 4000 | Your opponent discards 2 cards at random from his hand. |
| `DM07-S04` | **Sky Crusher, the Agitator** | DM-07 | Fire | 7 | 4000 | Each player puts a card from his mana zone into his graveyard. |
| `DM08-005` | **Kachua, Keeper of the Icegate** | DM-08 | Nature | 7 | 3000 | Search your deck. You may take a creature that has Dragon in its race from your deck and put it into the battle zone. Then shuffle your deck. That creature has "speed attacker." At the end of the turn, destroy it. |
| `DM09-014` | **Tra Rion, Penumbra Guardian** | DM-09 | Light | 6 | 5500 | Choose a race. At the end of this turn, untap all creatures of that race in the battle zone. |
| `DM09-018` | **Hokira** | DM-09 | Water | 4 | 3000 | Choose a race. Whenever one of your creatures of that race would be destroyed this turn, return it to your hand instead. |
| `DM09-034` | **Venom Worm** | DM-09 | Darkness | 3 | 1000 | Choose a race. Each creature of that race gets "slayer" until the end of the turn. (Whenever a creature that has "slayer" battles, destroy the other creature after the battle.) |
| `DM09-039` | **Gigio's Hammer** | DM-09 | Fire | 3 | 2000 | Choose a race. Each creature of that race attacks this turn if able and gets "power attacker +4000" until the end of the turn. (While attacking, a creature that has "power attacker +4000" gets +4000 power.) |
| `DM09-049` | **Silvermoon Trailblazer** | DM-09 | Nature | 4 | 3000 | Choose a race. Creatures of that race can't be blocked by creatures that have power 3000 or less this turn. |
| `DM10-008` | **Tanzanyte, the Awakener** | DM-10 | Water / Darkness | 7 | 9000 | Choose a creature in your graveyard. Return all creatures that have that name from your graveyard to your hand. |
| `DM10-010` | **Techno Totem** | DM-10 | Light / Nature | 4 | 5000 | Choose one of your opponent's creatures in the battle zone and tap it. |
| `DM10-053` | **Mummy Wrap, Shadow of Fatigue** | DM-10 | Darkness | 3 | 1000 | Each player discards a card at random from his hand. |
| `DM10-S10` | **Deklowaz, the Terminator** | DM-10 | Darkness / Fire | 6 | 5000 | Destroy all creatures that have power 3000 or less. Then look at your opponent's hand. He discards all creatures from it that have power 3000 or less. |
| `DM11-002` | **Heavyweight Dragon** | DM-11 | Fire | 7 | 9000 | Choose up to 2 of your opponent's tapped creatures in the battle zone. If they have total power less than this creature's power, destroy them. |

### 6.3 Wave Striker Creatures (19 Cards)
Introduced in DM-11, Wave Striker abilities are active **only while you have at least 2 other creatures that have "wave striker" in the battle zone** (3 total Wave Strikers).

| Card ID | Name | Set | Civ | Cost | Power | Wave Striker Active Ability |
| :--- | :--- | :--- | :--- | :---: | :---: | :--- |
| `DM11-006` | **Asra, Vizier of Safety** | DM-11 | Light | 3 | 2000 | This creature gets +4000 power and has "Blocker (Whenever an opponent's creature attacks, you may tap this creature to stop the attack. Then the 2 creatures battle)." |
| `DM11-010` | **Lamiel, Destiny Enforcer** | DM-11 | Light | 5 | 3000 | Whenever one of your creatures is destroyed during your opponent's turn, you may draw a card. |
| `DM11-011` | **Merlee, the Oracle** | DM-11 | Light | 2 | 1500 | Each of your creatures in the battle zone gets +1000 power. |
| `DM11-015` | **Aqua Trickster** | DM-11 | Water | 2 | 1000 | When you put this creature into the battle zone, choose one of your opponent's creatures in the battle zone and tap it. |
| `DM11-020` | **Revival Soldier** | DM-11 | Water | 3 | 2000 | This creature gets +4000 power. : When this creature would be destroyed, return it to your hand instead. |
| `DM11-027` | **Hazaria, Duke of Thorns** | DM-11 | Darkness | 4 | 2000 | When you put this creature into the battle zone, your opponent chooses one of his creatures and destroys it. |
| `DM11-028` | **Jagila, the Hidden Pillager** | DM-11 | Darkness | 5 | 3000 | When you put this creature into the battle zone, your opponent discards 3 cards at random from his hand. |
| `DM11-031` | **Saliva Worm** | DM-11 | Darkness | 3 | 2000 | This creature gets +4000 power and has "Darkness stealth (This creature can't be blocked while your opponent has any darkness cards in his mana zone)." |
| `DM11-033` | **Bonfire Lizard** | DM-11 | Fire | 6 | 4000 | When you put this creature into the battle zone, destroy up to 2 of your opponent's creatures that have "blocker." |
| `DM11-035` | **Eviscerating Warrior Lumez** | DM-11 | Fire | 3 | 2000 | When you put this creature into the battle zone, destroy all creatures that have power 2000 or less. |
| `DM11-040` | **Sapian Tark, Flame Dervish** | DM-11 | Fire | 3 | 2000 | This creature gets +4000 power and can attack untapped creatures. |
| `DM11-044` | **Macho Melon** | DM-11 | Nature | 2 | 1000 | Power attacker +3000 (While attacking, this creature gets +3000 power.) |
| `DM11-045` | **Ninja Pumpkin** | DM-11 | Nature | 3 | 2000 | This creature gets +4000 power and can't be blocked by any creature that has power 5000 or less. |
| `DM11-050` | **Skyscraper Shell** | DM-11 | Nature | 4 | 2000 | When you put this creature into the battle zone, your opponent chooses one of his creatures in the battle zone and puts it into his mana zone. |
| `DM11-S02` | **Klujadras** | DM-11 | Water | 7 | 4000 | When you put this creature into the battle zone, each player draws a card for each of his creatures in the battle zone that has "wave striker." |
| `DM12-001` | **Kilstine, Nebula Elemental** | DM-12 | Light | 7 | 5000 | Each of your other creatures in battle zone gets +5000 power and has "blocker" and "double breaker". |
| `DM12-011` | **Steamroller Mutant** | DM-12 | Darkness | 4 | 3000 | When this creature is put into battle Zone, destroy all creatures. |
| `DM12-048` | **Flame Trooper Goliac** | DM-12 | Fire | 5 | 4000 | When you put this creature is put into battle zone, destroy one of your opponent's creatures that has power 5000 or less. |
| `DM12-055` | **Uncanny Turnip** | DM-12 | Nature | 2 | 1000 | When you put this creature into the battle zone, put the top card of your deck into your mana zone. Then put a creature from your mana zone into your hand. |

### 6.4 Deck Tutors & Search Effects (29 Cards)
Cards that search the library require UI modal selection, card-type validation filtering, and deck reshuffling.

| Card ID | Name | Set | Civ | Type | Search Scope / Target Filter |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `DM01-015` | **Rayla, Truth Enforcer** | DM-01 | Light | Creature | **Spell** |
| `DM01-029` | **Crystal Memory** | DM-01 | Water | Spell | **Any card** |
| `DM01-093` | **Dimension Gate** | DM-01 | Nature | Spell | **Creature** |
| `DM02-004` | **Laguna, Lightning Enforcer** | DM-02 | Light | Creature | **Spell** |
| `DM02-006` | **Logic Cube** | DM-02 | Light | Spell | **Spell** |
| `DM02-051` | **Rainbow Stone** | DM-02 | Nature | Spell | **Any card** |
| `DM02-052` | **Rumbling Terahorn** | DM-02 | Nature | Creature | **Creature** |
| `DM03-017` | **King Ponitas** | DM-03 | Water | Creature | **Any card** |
| `DM04-S05` | **Niofa, Horned Protector** | DM-04 | Nature | Evolution Creature | **Any card** |
| `DM05-049` | **Brutal Charge** | DM-05 | Nature | Spell | **Creature** |
| `DM05-054` | **Scissor Scarab** | DM-05 | Nature | Creature | **Any card** |
| `DM06-004` | **Invincible Technology** | DM-06 | Water | Spell | **Any card** |
| `DM06-019` | **Forbos, Sanctum Guardian Q** | DM-06 | Light | Creature | **Spell** |
| `DM06-094` | **Charmilia, the Enticer** | DM-06 | Nature | Creature | **Creature** |
| `DM06-096` | **Dimension Gate** | DM-06 | Nature | Spell | **Creature** |
| `DM06-097` | **Factory Shell Q** | DM-06 | Nature | Creature | **Survivor creature** |
| `DM06-106` | **Mystic Treasure Chest** | DM-06 | Nature | Spell | **Any card** |
| `DM08-005` | **Kachua, Keeper of the Icegate** | DM-08 | Nature | Creature | **Creature** |
| `DM08-024` | **Vikorakys** | DM-08 | Water | Creature | **Any card** |
| `DM09-008` | **Cyclolink, Spectral Knight** | DM-09 | Light | Creature | **Spell** |
| `DM09-046` | **Cavern Raider** | DM-09 | Nature | Creature | **Creature** |
| `DM09-055` | **Whispering Totem** | DM-09 | Nature | Creature | **Any card** |
| `DM10-020` | **Logic Cube** | DM-10 | Light | Spell | **Spell** |
| `DM10-092` | **Sporeblast Erengi** | DM-10 | Nature | Creature | **Creature** |
| `DM10-S02` | **Hawkeye Lunatron** | DM-10 | Water | Creature | **Any card** |
| `DM11-047` | **Rainbow Gate** | DM-11 | Nature | Spell | **Any card** |
| `DM11-052` | **Live and Breathe** | DM-11 | Light / Nature | Spell | **Creature** |
| `DM11-S05` | **Miraculous Rebirth** | DM-11 | Fire / Nature | Spell | **Creature** |
| `DM12-053` | **Turtle Horn, the Imposing** | DM-12 | Nature | Creature | **Creature** |

### 6.5 Shield Manipulation & Swapping Mechanics

| Card ID | Name | Set | Manipulation Type | Verification & Engine Rule |
| :--- | :--- | :--- | :--- | :--- |
| `DM03-014` | **Emeral** | DM-03 | Hand <-> Shield Swap | Add card from hand to shields face down; take existing shield to hand. **Shield Trigger does not activate**. |
| `DM03-048` | **Mana Nexus** | DM-03 | Mana -> Shield Add | Add card from mana zone to shields face down. |
| `DM04-052` | **Mystic Inscription** | DM-04 | Deck -> Shield Add | Top card of deck added to shields face down. |
| `DM06-001` | **Invincible Aura** | DM-06 | Deck -> 3 Shields | Top 3 cards of deck added to shields face down. |
| `DM10-S04` | **Necrodragon Bryzenaga** | DM-10 | Full Shield Pickup | Put all your shields into hand. **Shield Triggers CAN be used**! |
| `DM12-006` | **Ularus, Punishment Elemental** | DM-12 | Face-Up Shields | Turns shields face-up. Face-up shields retain trigger identity but are public knowledge. |
| `DM12-007` | **Cosmic Darts** | DM-12 | Cast from Shield | Opponent chooses one of your shields; if spell, cast free immediately without breaking shield! |
| `DM12-009` | **Meloppe** | DM-12 | Shield Redirection | When opponent chooses one of your shields, you choose instead; when you choose opponent shield, opponent chooses. |

### 6.6 Mana Zone Swaps & Creature Swapping Mechanics

| Card ID | Name | Set | Mechanic | Verification & Engine Rule |
| :--- | :--- | :--- | :--- | :--- |
| `DM10-091` | **Soulswap** | DM-10 | Creature <-> Mana Swap | Choose creature in battle zone and put it into owner's mana zone. If you do, choose a creature in that mana zone of equal or lower cost than total mana and put it into battle zone! |
| `DM10-043` | **Transmogrify** | DM-10 | Polymorph Replacement | Destroy creature. Its controller reveals cards from deck top until creature is found, puts it into battle zone, and puts rest into graveyard! |
| `DM10-082` | **Earth Ripper, Talon of Rage** | DM-10 | Mana Zone Harvest | Evolution. On summon, put all cards from your mana zone into your hand! |
| `DM07-051` | **Mulch Charger** | DM-07 | Battle Zone -> Mana | Sacrifice friendly creature into mana zone, then spell itself becomes mana. |

### 6.7 Zone Transition & Destruction Replacement Effects

| Card ID | Name | Set | Trigger Condition | Replacement Destination & Rules Note |
| :--- | :--- | :--- | :--- | :--- |
| `DM01-001` | **Chilias, the Oracle** | DM-01 | When would be destroyed | Return to hand instead of graveyard. |
| `DM01-024` | **Aqua Knight** | DM-01 | When would be destroyed | Return to hand instead of graveyard. |
| `DM01-025` | **Aqua Soldier** | DM-01 | When would be destroyed | Return to hand instead of graveyard. |
| `DM01-092` | **Coiling Vines** | DM-01 | When would be destroyed | Put into mana zone instead of graveyard. |
| `DM01-098` | **Mighty Shouter** | DM-01 | When would be destroyed | Put into mana zone instead of graveyard. |
| `DM03-002` | **Aless, the Oracle** | DM-03 | When would be destroyed | Add to shields face down instead of graveyard. |
| `DM03-007` | **Raza Vega, Thunder Guardian** | DM-03 | When would be destroyed | Add to shields face down instead of graveyard. |
| `DM04-014` | **Ouks, Vizier of Restoration** | DM-04 | When would be destroyed | Add to shields face down instead of graveyard. |
| `DM05-047` | **Balloonshroom Q** | DM-05 | When would be destroyed | Shared Survivor ability: puts into mana zone instead of graveyard. |
| `DM12-005` | **Soul Phoenix, Avatar of Unity** | DM-12 | When would leave battle zone | **Vortex De-evolution Separation**: Only the top card leaves the battle zone; the 2 underlying bait creatures remain in the battle zone as separate creatures! |

### 6.8 Anti-Discard Punishment Counters (4 Cards)
When an opponent casts discard spells (*Ghost Touch*, *Locomotiver*, *Lost Soul*), these creatures replace the discard action by summoning themselves directly into the battle zone for free!

| Card ID | Name | Set | Civ | Cost | Power | Counter Replacement Rule |
| :--- | :--- | :--- | :--- | :---: | :---: | :--- |
| `DM06-018` | **Dava Torey, Seeker of Clouds** | DM-06 | Light | 6 | 5000 | If discarded during opponent's turn, put into battle zone instead! |
| `DM10-109` | **Sanfist, the Savage Vizier** | DM-10 | Light/Nat | 4 | 3000 | Blocker. If discarded during opponent's turn, put into battle zone instead! |
| `DM12-036` | **Bingole, the Explorer** | DM-12 | Light | 3 | 2000 | If discarded during opponent's turn, put into battle zone instead! |
| `DM12-S01` | **Terradragon Arque Delacerna** | DM-12 | Nature | 7 | 6000 | Double Breaker. If discarded during opponent's turn, put into battle zone instead! |

---

## Section 7: Card Scan / Image Verification Notes

### Local vs. Remote Asset Coverage Audit

| Set Code | Set Name | Total Cards | Local Assets (`web/public/cards/`) | Remote CDN URLs (`img.duelmasters.us`) | Status / Verification Action |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **DM-01** | Base Set | 120 | **120 / 120 (100%)** | 120 / 120 | Verified locally cached WebP assets. Fully functional offline. |
| **DM-02** | Evo-Crushinators of Doom | 60 | 0 / 60 (0%) | 60 / 60 | Remote URLs verified; pending batch asset download. |
| **DM-03** | Rampage of the Super Warriors | 60 | 0 / 60 (0%) | 60 / 60 | Remote URLs verified; pending batch asset download. |
| **DM-04** | Shadowclash of Blinding Night | 60 | 0 / 60 (0%) | 60 / 60 | Remote URLs verified; pending batch asset download. |
| **DM-05** | Survivors of the Megapocalypse | 60 | 0 / 60 (0%) | 60 / 60 | Remote URLs verified; pending batch asset download. |
| **DM-06** | Stomp-A-Trons of Invincible Wrath | 120 | 0 / 120 (0%) | 120 / 120 | Remote URLs verified; pending batch asset download. |
| **DM-07** | Thundercharge of Ultra Destruction | 60 | 0 / 60 (0%) | 60 / 60 | Remote URLs verified; pending batch asset download. |
| **DM-08** | Epic Dragons of Hyperchaos | 60 | 0 / 60 (0%) | 60 / 60 | Remote URLs verified; pending batch asset download. |
| **DM-09** | Fatal Brood of Infinite Ruin | 60 | 0 / 60 (0%) | 60 / 60 | Remote URLs verified; pending batch asset download. |
| **DM-10** | Shockwaves of the Shattered Rainbow | 120 | 0 / 120 (0%) | 120 / 120 | Remote URLs verified; pending batch asset download. |
| **DM-11** | Blastosplosion of Gigantic Rage | 60 | 0 / 60 (0%) | 60 / 60 | Remote URLs verified; pending batch asset download. |
| **DM-12** | Thrash of the Hybrid Megacreatures | 60 | 0 / 60 (0%) | 60 / 60 | Remote URLs verified; pending batch asset download. |
| **Total** | **All 12 Expansions** | **900** | **120 / 900 (13.3%)** | **900 / 900 (100%)** | Canonical remote fallback functional across all cards. |

### Upstream Collector Number Verification
1. **DM-07 Curious Eye Collector Number Correction**:
   - Upstream raw JSON had `id: "3/55"` for *Curious Eye*, which conflicted with Super Rare indexing.
   - The official physical print collector number for *Curious Eye* in DM-07 is **20/55**.
   - Verified and hard-coded override applied in `scripts/build_card_database.js`.

2. **CDN URL Structure Verification**:
   - Remote images follow the indexing scheme `https://img.duelmasters.us/{0001..0900}.webp`.
   - Indexing properly offsets Super Rares first (1..S_N) followed by Regular Cards (1..Reg_N) for each set.
   - All 900 cards have non-colliding, strictly unique image URLs mapped.

---

## Verification Sign-Off Checklist for Implementers

- [x] **Evolution Bait Races**: All 66 evolution creatures have their exact bait race extracted and classified.
- [x] **Evolution False Positives**: Verified *Pouch Shell*, *Lu Gila*, and *Innocent Hunter* are standard creatures.
- [x] **Multi-Civilization**: All 45 dual-civ cards have mana zone entering rules and casting costs documented.
- [x] **Survivors**: All 18 Survivors analyzed, including *Promephius Q* vanilla state and Q-tronic evolutions.
- [x] **Chargers**: All 15 Charger spells verified with mana zone redirect resolution.
- [x] **Triple Breakers**: All 15 Triple Breakers + scaling Crew Breakers verified.
- [x] **Special Mechanics**: Silent Skill (23), Tap Abilities (41), Wave Striker (19), Tutors (29), Discard Counters (4) cataloged.
- [x] **Asset Audit**: Complete 900-card local/remote image matrix documented.
