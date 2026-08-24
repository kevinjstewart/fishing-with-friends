# Fishing Game MVP Product Specification

## 1. Purpose

This game is a 2D freshwater fishing game.

The player catches fish through a skill-based fishing mini-game.

Each fishing attempt has a cost.

More valuable fish require better equipment and create more financial risk.

The player must decide how much value to risk before each fishing attempt.

The main game loop must combine:

* Player skill.
* Equipment progression.
* Economic risk.
* Fish collection.
* Fish discovery.
* Long-term progression.

The game will use Telegram for player authentication.

Social features will use Telegram identity later.

The MVP does not require social features.

---

# 2. Core Design Principle

The game must create the following decision:

> "How much equipment and money am I willing to risk for this fish?"

A valuable fish must feel exciting before the player catches it.

A failed catch must have a real cost.

A successful catch must create a meaningful reward.

The game must not use random chance as the only source of success or failure.

Player skill must have a large effect on the result.

Equipment must change the difficulty and economic risk.

---

# 3. Core Game Loop

The basic game loop is:

1. The player selects a lake.
2. The player selects a boat, rod, lure, and bait.
3. The game shows the expected fishing conditions.
4. The player starts a fishing attempt.
5. The game consumes one unit of bait.
6. The game selects an eligible fish.
7. The fishing mini-game starts.
8. The player tries to land the fish.
9. The player either catches or loses the fish.
10. Equipment can take damage or break when applicable.
11. The player receives the fish if the catch succeeds.
12. The player chooses to keep or sell the fish.
13. The player uses the money to buy better equipment.
14. Better equipment gives access to more valuable fish and lakes.

This loop must work without social features.

---

# 4. Player Equipment

The player has four primary equipment types.

| Equipment | Purpose                                           | Consumable  |
| --------- | ------------------------------------------------- | ----------- |
| Boat      | Gives access to lakes and fishing areas           | No          |
| Rod       | Affects fishing ability and maximum fish class    | Very rarely |
| Lure      | Changes fish availability and fishing performance | Sometimes   |
| Bait      | Attracts fish and affects fish availability       | Always      |

---

# 5. Boats

A boat is permanent equipment.

A boat cannot break.

A better boat gives access to better fishing locations.

A better boat can also give access to deeper water or special fishing zones.

Example progression:

| Boat               | Access                                |
| ------------------ | ------------------------------------- |
| Shore Fishing      | Starter lake and shoreline fish       |
| Rowboat            | Small lakes and near-shore deep water |
| Fishing Skiff      | Larger lakes and deeper water         |
| Sport Fishing Boat | High-value lakes and difficult areas  |

The MVP can use three boat tiers.

The boat must function primarily as a progression gate.

The game must not require maintenance or fuel in the MVP.

These systems can be added later if they improve the economy.

---

# 6. Rods

The rod is durable equipment.

The rod normally survives many fishing attempts.

The rod must not feel like a normal consumable.

A rod can have properties such as:

* Strength.
* Control.
* Maximum supported fish weight.
* Catch-zone size modifier.
* Durability class.
* Break resistance.

The rod must have a very low break risk during normal fishing.

The break risk can increase when:

* The fish is much stronger than the rod.
* The fish is near or above the rod's recommended weight.
* The player selects a high-risk fishing area.
* The player performs poorly during the mini-game.
* The fish is an exceptional specimen.

The player must see the rod risk before the attempt when possible.

Example:

> Rod Break Risk: Very Low
> Estimated Risk: Less than 1%

For dangerous fish:

> Rod Break Risk: High
> Estimated Risk: 4-6%

The system must not secretly destroy expensive equipment without warning.

---

# 7. Lures

A lure is semi-consumable equipment.

A lure can survive multiple fishing attempts.

A lure can be lost or damaged.

A lure can affect:

* Available fish species.
* Chance of rare fish.
* Fish difficulty.
* Bite frequency.
* Catch-zone size.
* Fish movement speed.

A lure can have a limited number of uses.

Alternatively, a lure can have a small loss chance after each attempt.

The MVP should use a simple durability system.

Example:

> Spinner Lure
> Uses Remaining: 8

This system is easy for the player to understand.

---

# 8. Bait

Bait is fully consumable.

One fishing attempt consumes one bait.

Better bait increases access to more valuable fish.

Example bait:

* Worm.
* Corn.
* Minnow.
* Crayfish.
* Premium Minnow.
* Special Bait.

A fish species can accept one or more bait types.

Expensive bait should not guarantee an expensive fish.

Expensive bait should improve the expected value of the fishing attempt.

---

# 9. Fishing Locations

The initial game must use freshwater locations.

The locations can be loosely inspired by the Great Lakes and Lake Ontario.

The locations do not have to be exact real-world simulations.

The game can use fictional lakes that contain realistic freshwater fish.

Example MVP locations:

## 9.1 Willow Pond

Starter location.

Possible fish:

* Yellow Perch.
* Pumpkinseed.
* Rock Bass.
* Bluegill.
* Smallmouth Bass.

Risk is low.

Equipment requirements are low.

---

## 9.2 Pinewater Lake

Intermediate location.

Possible fish:

* Smallmouth Bass.
* Largemouth Bass.
* Walleye.
* Northern Pike.
* Channel Catfish.

Risk is moderate.

---

## 9.3 Lake Greywater

Advanced location.

This lake is loosely based on Lake Ontario.

Possible fish:

* Lake Trout.
* Chinook Salmon.
* Coho Salmon.
* Walleye.
* Northern Pike.
* Muskellunge.

Risk is high.

Equipment costs are high.

## 9.4 Cedar Marsh

Side-water reached by Rowboat.

Possible fish:

* Black Crappie.
* Common Carp.
* Bowfin.
* Freshwater Drum.

Risk is moderate.

The marsh adds a cover-fishing route between the starter pond and deeper lakes.

The MVP now includes four locations.

---

# 10. Fish Species

Each fish species must have authoritative game data.

A fish definition should contain:

```text
id
common_name
scientific_name
description
habitat
native_range
minimum_weight
typical_weight
maximum_weight
minimum_length
typical_length
maximum_length
rarity
base_value
difficulty
movement_profile
accepted_baits
preferred_lures
available_locations
```

The game must use realistic weight and length ranges.

The game can simplify habitat and distribution information.

The game must not generate impossible fish weights for normal catches.

Exceptional record-class fish can exist later.

---

# 11. Individual Fish

Each caught fish is a unique item.

A caught fish must contain:

```text
fish_id
species_id
player_id
weight
length
quality
caught_at
location_id
bait_used
lure_used
rod_used
sale_value
```

The weight must be generated when the fish appears.

The length should be consistent with the weight.

The game must not independently generate weight and length without a relationship.

A heavier fish of the same species should normally be longer.

Small random variation is acceptable.

---

# 12. Fish Value

Fish value must depend on more than species.

A simple MVP formula can use:

* Species base value.
* Weight.
* Size percentile.
* Rarity.
* Quality.

Example concept:

```text
sale value =
species base value
× weight modifier
× rarity modifier
× specimen quality modifier
```

A very large specimen should be more valuable than an average specimen of the same species.

The exact formula must remain understandable and tunable.

---

# 13. Fish Quality

Each fish can have a specimen quality.

Example:

* Common.
* Good.
* Large.
* Trophy.
* Exceptional.

Quality should mostly represent the fish's position in the realistic size distribution.

A Trophy fish should be unusually large for its species.

An Exceptional fish should be very rare.

The game should not generate a separate arbitrary quality roll that ignores fish size.

---

# 14. Collection

The player can keep a caught fish.

A kept fish enters the player's collection.

The collection must show:

* Common name.
* Scientific name.
* Weight.
* Length.
* Catch location.
* Catch date.
* Rarity.
* Sale value.
* Species information.

The player can sell a collected fish later.

Selling removes that individual fish from the collection.

The player must receive the current sale value.

The MVP does not require storage limits.

---

# 15. Catch Decision

After a successful catch, the game must show a result screen.

Example:

> **Northern Pike**
> *Esox lucius*
> Weight: 8.4 kg
> Length: 101 cm
> Trophy specimen
> Estimated value: $286

The player receives two main options:

* Keep.
* Sell.

The player can inspect basic species information before making this decision.

---

# 16. Fishing Mini-Game

The fishing mini-game is inspired by the general control concept of Stardew Valley fishing.

The implementation must be original.

The player controls a catch zone.

The fish moves vertically.

The player must keep the fish inside the catch zone.

The player presses or holds the input to move the catch zone.

The catch meter increases while the fish is inside the catch zone.

The catch meter decreases while the fish is outside the catch zone.

The player catches the fish when the catch meter reaches the success threshold.

The fish escapes when the failure condition is reached.

The game must support:

* Mouse input.
* Touch input.
* Telegram mobile webview input.

---

# 17. Fishing Difficulty

Difficulty can use the following values:

```text
fish movement speed
fish acceleration
direction change frequency
movement unpredictability
catch-zone size
catch meter gain rate
catch meter loss rate
fight duration
```

Different species should have different movement styles.

Examples:

Yellow Perch:

> Slow movement.
> Small direction changes.

Smallmouth Bass:

> Fast bursts.
> Moderate direction changes.

Northern Pike:

> Long aggressive movements.
> Strong bursts.

Muskellunge:

> Fast movement.
> Large direction changes.
> Long fight duration.

This gives species personality without requiring complex animation.

---

# 18. Equipment and Mini-Game Interaction

Equipment should modify the mini-game.

A better rod can:

* Increase catch-zone size.
* Reduce sudden fish movement.
* Reduce catch-meter loss.
* Improve control response.
* Support heavier fish.

A better lure can:

* Attract better fish.
* Modify fish behavior.
* Improve catch-zone size for specific species.

Bait primarily controls fish availability.

The player should feel that equipment improves the fishing experience.

Equipment must not convert the game into an automatic success roll.

---

# 19. Risk

Every fishing attempt has an expected cost.

Example:

```text
Bait:             $8
Expected lure use: $3
Rod risk:          $1.50 expected value
----------------------
Expected attempt cost: ~$12.50
```

The game does not need to show this exact mathematical calculation.

However, the player must understand the major risks.

Before a fishing attempt, the game should show information such as:

```text
Location: Pinewater Lake

Bait:
Premium Minnow
Cost: $12

Lure:
Silver Spinner
Durability: 6/10

Rod:
Carbon Medium-Heavy
Break Risk: Very Low

Potential Catch Value:
$20 - $450
```

The system should help the player make an informed decision.

---

# 20. Rod Break Fairness

Rod destruction is an important high-stakes mechanic.

It must also be fair.

The following rules should apply.

## 20.1 Normal fish must almost never break a suitable rod

A player who uses the correct rod should not regularly lose it.

## 20.2 Dangerous equipment mismatch increases risk

A player can attempt to catch a fish with an underpowered rod.

The game must warn the player.

Example:

> WARNING
> This fish may exceed the recommended strength of your rod.
> Rod break risk is increased.

## 20.3 Player skill should affect break risk

Poor mini-game performance can increase rod stress.

Excellent performance can reduce rod stress.

This makes rod loss feel connected to gameplay.

## 20.4 Break risk must not become a hidden tax

A rod that costs 1,000 coins should not randomly disappear every 20 fishing attempts.

Rod destruction should be memorable.

It should not be routine.

---

# 21. Recommended Initial Rod Risk

For the MVP, use approximate risk bands instead of aggressive random destruction.

| Situation                         | Break Risk |
| --------------------------------- | ---------: |
| Easy fish with suitable rod       |         0% |
| Normal fish with suitable rod     |     0-0.1% |
| Difficult fish with suitable rod  |   0.1-0.5% |
| Trophy fish near rod limit        |   0.5-1.5% |
| Fish above recommended rod rating |       2-5% |
| Extreme mismatch                  |        5%+ |

These values are starting points.

They require play testing.

The game should avoid a 5% break chance on normal high-level fishing.

A 5% chance means one rod loss approximately every 20 attempts on average.

That rate can feel punitive if rods are expensive.

---

# 22. Risk and Reward

High-risk fishing should increase expected profit.

It should not always increase actual profit.

Example:

### Safe Fishing

```text
Attempt cost: $5
Typical fish: $8-$20
Rare fish: $50
Rod risk: None
```

### Intermediate Fishing

```text
Attempt cost: $20
Typical fish: $25-$80
Rare fish: $300
Rod risk: Very Low
```

### High-Risk Fishing

```text
Attempt cost: $100
Typical fish: $100-$400
Rare fish: $2,000+
Rod risk: Moderate
```

The player should be able to choose a risk level.

---

# 23. Economy

The primary currency can be called `Coins` during development.

The player earns currency by selling fish.

The player spends currency on:

* Bait.
* Lures.
* Rods.
* Boats.

The MVP should not contain:

* Premium currency.
* Real-money purchases.
* Player-to-player trading.
* Auctions.
* Loans.
* Energy systems.

These systems can distort the economy before the core game is fun.

---

# 24. Starting State

A new player should receive:

```text
Starter Boat
Starter Rod
Basic Lure
10 Worms
Small amount of currency
```

The player must be able to recover from losing most of their money.

The game must never create an unrecoverable state.

If the player has no money and no bait, the game should provide a basic recovery option.

Example:

> Dig for Worms

This action gives free basic bait.

It can have a cooldown or low efficiency.

This prevents a permanent soft lock.

---

# 25. Fish Discovery

The game should track species discovery.

The player can have a Fish Journal.

Each species starts as undiscovered.

The first catch unlocks its entry.

The Fish Journal can show:

* Common name.
* Scientific name.
* Description.
* Habitat.
* Maximum caught weight.
* Maximum caught length.
* Number caught.
* Largest specimen.
* Best sale value.

This creates progression that does not depend on currency.

---

# 26. Fish Information

Species information should use factual freshwater biology where practical.

Each fish profile should contain short information.

Example:

> **Northern Pike**
> *Esox lucius*
>
> Northern Pike are predatory freshwater fish.
> They live in lakes and slow rivers.
> They often stay near vegetation.
> They eat fish and other aquatic animals.

Keep this information short.

Do not copy large sections of external sources.

---

# 27. Fish Images

Fish images are optional for the first MVP.

If an image is available, prefer Wikimedia Commons rather than copying an image directly from a Wikipedia article.

Store the following metadata with each image:

```text
source_url
author
license
license_url
attribution
```

Only use images with licenses that permit the intended use.

Do not make game functionality depend on an image being available.

Use a placeholder when an image is missing.

---

# 28. Fish Data Sources

Real-world fish data should eventually use reliable sources.

Possible data sources include:

* Government fisheries agencies.
* FishBase.
* Fisheries and Oceans Canada.
* US Fish and Wildlife Service.
* Provincial or state fisheries agencies.
* Reputable scientific references.

Wikipedia can help with discovery.

Wikipedia should not be the only source for biological limits.

Store source information for biological data.

---

# 29. Rare Fish

The MVP can include realistic rare fish before fictional fish.

Examples:

* Large Muskellunge.
* Lake Sturgeon.
* Trophy Lake Trout.
* Trophy Walleye.
* Trophy Chinook Salmon.

Some species can be rare because of:

* Location.
* Bait.
* Weather later.
* Equipment.
* Size.

The MVP should avoid fantasy fish.

Fantasy or legendary fish can be added after the realistic foundation works.

---

# 30. Fish Selection

The game must not select fish using one global random table.

Fish eligibility should depend on:

```text
location
boat access
bait
lure
equipment
species availability
rarity
```

The game then selects one fish from the eligible pool.

The server should make this selection.

The client must not decide which fish appears.

This prevents cheating.

---

# 31. Server Authority

The backend must control all valuable outcomes.

The server must control:

* Fish selection.
* Fish weight.
* Fish length.
* Fish rarity.
* Sale value.
* Equipment consumption.
* Lure durability.
* Rod damage or break results.
* Player currency.
* Collection contents.

The client controls the mini-game input.

The server validates the result.

Do not trust a client request such as:

```text
"I caught a 25 kg Muskellunge. Give me 5,000 coins."
```

The server must already know which fish encounter is active.

---

# 32. Fishing Encounter

When fishing starts, the backend should create an encounter.

Example:

```text
encounter_id
player_id
species_id
fish_weight
fish_length
difficulty_seed
equipment_snapshot
started_at
expires_at
status
```

The client receives only the information required to run the mini-game.

When the mini-game finishes, the client submits the result.

The server validates that:

* The encounter exists.
* The player owns the encounter.
* The encounter is not expired.
* The encounter was not already completed.
* The submitted result is plausible.

This design makes cheating more difficult.

---

# 33. Failure Outcomes

A failed fishing attempt can cause:

* Bait loss.
* Lure durability loss.
* Lure loss.
* No fish.
* Rare rod damage.
* Very rare rod destruction.

The player should normally lose only the bait.

More severe losses should be associated with greater risk.

---

# 34. Success Outcomes

A successful attempt gives:

* One unique fish.
* Fish Journal progress.
* Collection opportunity.
* Sale opportunity.

A successful catch can still damage equipment in exceptional situations.

However, the player should generally feel rewarded after winning a difficult mini-game.

---

# 35. Progression

The MVP progression loop is:

```text
Catch fish
    ↓
Sell some fish
    ↓
Earn currency
    ↓
Buy better bait/lures/rods
    ↓
Buy better boat
    ↓
Access better lake
    ↓
Catch rarer fish
    ↓
Build collection
```

This is enough progression for the MVP.

Do not add experience levels unless testing shows that equipment progression is not sufficient.

---

# 36. Prestige

Collection value should create prestige without affecting the core economy.

Possible collection statistics:

* Total species discovered.
* Largest fish.
* Total collection value.
* Rarest fish.
* Trophy count.
* Largest fish for each species.

Later, other Telegram users can view these statistics.

A player can choose between immediate money and long-term prestige.

This is an important economic decision.

Example:

> Sell Trophy Muskellunge for 4,200 coins.
>
> OR
>
> Keep it as the largest fish in your collection.

---

# 37. MVP Screens

The MVP should have the following screens.

## Home

Show:

* Current currency.
* Current boat.
* Current rod.
* Main actions.

Actions:

* Go Fishing.
* Collection.
* Equipment.
* Shop.

## Lake Selection

Show:

* Available lakes.
* Locked lakes.
* Required boat.
* Expected fish.
* Risk level.

## Fishing Setup

Show:

* Rod.
* Lure.
* Bait.
* Expected fish range.
* Equipment risk.

## Fishing Mini-Game

Show:

* Fish indicator.
* Catch zone.
* Catch progress.
* Basic equipment information.

## Catch Result

Show:

* Fish.
* Weight.
* Length.
* Quality.
* Value.
* Species information.

Actions:

* Keep.
* Sell.

## Collection

Show all stored fish.

Allow sorting by:

* Species.
* Weight.
* Value.
* Rarity.
* Catch date.

## Shop

Sell:

* Bait.
* Lures.
* Rods.
* Boats.

## Fish Journal

Show:

* Discovered species.
* Undiscovered species.
* Personal records.

---

# 38. MVP Content Target

A good first playable MVP should contain approximately:

```text
3 lakes
3 boats
5 rods
5 lures
5 bait types
15-20 fish species
```

This is enough content to test the progression system.

Do not create 100 fish before the game loop is proven.

---

# 39. MVP Success Criteria

The MVP is successful if a player can:

1. Sign in through Telegram.
2. Enter the game.
3. Select equipment.
4. Select a lake.
5. Spend bait.
6. Encounter a realistic freshwater fish.
7. Play the fishing mini-game.
8. Catch or lose the fish.
9. Experience equipment risk.
10. Keep or sell the fish.
11. View caught fish in the collection.
12. Read basic biological information.
13. Earn money.
14. Buy improved equipment.
15. Unlock a better fishing location.
16. Progress toward rarer fish.

The full loop should be enjoyable before social features are added.

---

# 40. Features That Are Not in the MVP

Do not implement these systems in the first MVP:

* Multiplayer fishing.
* Player trading.
* Auctions.
* Guilds.
* Telegram collection sharing.
* Friends.
* Tournaments.
* Seasons.
* Weather.
* Time-of-day fishing.
* Real-money purchases.
* Premium currency.
* Saltwater fishing.
* Fishing licenses.
* Rod repair systems.
* Boat maintenance.
* Boat fuel.
* Crafting.
* Player housing.
* Aquariums.
* PvP.
* Complex achievements.

These features can be evaluated after the core fishing economy works.

---

# 41. Important Balance Rule

Every fishing attempt has three values:

```text
Expected Cost
Expected Reward
Variance
```

Low-level fishing should have:

```text
Low cost
Low reward
Low variance
```

High-level fishing should have:

```text
High cost
High reward
High variance
```

The game should not make high-level fishing mathematically worse than low-level fishing.

High-risk fishing should have a positive expected return when the player has appropriate equipment and reasonable skill.

The player accepts variance to get access to unusually valuable fish.

---

# 42. Recommended Design Direction

The game should not feel like a casino with a fishing skin.

The player's main question should not be:

> "Did the random number generator let me win?"

The player's question should be:

> "Do I have the equipment and skill to take this risk?"

Randomness should determine what opportunity appears.

Skill should strongly determine whether the player converts that opportunity into a catch.

Equipment should determine which opportunities the player can pursue safely.

The collection should give value to fish that is separate from their sale price.

This combination is the central design of the game.
