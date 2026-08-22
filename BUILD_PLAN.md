# Fishing Game — Living Build Plan

## Purpose

This document is the high-level implementation plan for the game.

Use it as a living checklist.

The tasks are ordered roughly by dependency. They are not strict implementation boundaries.

When working on a task, continue into related work when that work is necessary or useful. Do not stop only because the next piece appears under another checklist item.

You may:

* Add tasks that become necessary.
* Reorder tasks when implementation dependencies require it.
* Mark tasks as partially complete.
* Add deferred work.
* Add technical debt or follow-up tasks.
* Complete multiple related tasks in one implementation pass.
* Change implementation details when the existing architecture suggests a better solution.

Do not reduce the scope of a reasonable implementation only to match one checklist item.

The game should be functionally complete when the main checklist is complete. Deferred tasks can remain for features that are not required for the intended version.

## Current checkpoint — 2026-08-21

* [x] The initial data-driven catalogue now contains three freshwater locations, three boats, three rods, three lures, four baits, and thirteen fish species with biological ranges, movement profiles, and source attribution.
* [x] Authenticated players now receive an idempotently persisted starter state: 100 coins, Shore Fishing access, a Starter Fiberglass rod, a Copper Spinner with 10 durability, and 10 Worms.
* [x] The browser now displays the server-owned loadout and lake access states, including lake selection and a touch/mouse/keyboard fishing challenge.
* [x] The Worker now creates encounters, consumes bait and lure durability, calculates specimen size/value, resolves bounded skill performance, and supports keep/sell decisions with duplicate-resolution guards.
* [ ] The collection/journal views, shop purchasing, rod break outcomes, richer progression, and full balance pass still need to be built on top of this loop.

---

# Build Plan

* [ ] **Establish and verify the application foundation**

  Start from the existing TypeScript, Phaser, Vite, Hono, Cloudflare Workers, D1, and Telegram architecture.

  Make sure local development, Cloudflare deployment, database migrations, environment configuration, authentication, and the basic frontend-to-backend flow work correctly.

  Improve the architecture where necessary before substantial gameplay code depends on it.

---

* [ ] **Define the core game domain and data model**

  Establish the authoritative models and relationships for the game.

  This should cover the concepts required by the product specification, including players, currency, locations, boats, rods, lures, bait, fish species, individual caught fish, equipment ownership, active equipment, fishing encounters, catches, sales, progression, and collection records.

  Decide which data is static game content and which data belongs in D1.

  Create migrations, seed data, shared types, validation, and domain rules as needed.

  Keep game rules centralized enough that balance values can be changed without rewriting unrelated systems.

---

* [ ] **Build the initial fish catalogue and biological data system**

  Add the initial set of realistic freshwater fish.

  Use realistic species names, scientific names, habitats, length ranges, weight ranges, and other useful biological information.

  Model individual fish so that generated length and weight values are plausible for the species and consistent with each other.

  Establish sources and attribution for biological information.

  Add image support where practical. Prefer appropriately licensed Wikimedia Commons images. Store attribution and license information with image metadata.

  The game must continue to work when an image is unavailable.

  Create enough species to support the planned starter, intermediate, and advanced fishing locations.

---

* [ ] **Build locations, boats, and access progression**

  Create the initial freshwater locations.

  Give each location an appropriate fish population, rarity distribution, equipment expectations, and economic profile.

  Implement boats as permanent progression items that unlock locations or fishing areas.

  Establish the progression from starter access through higher-value fishing areas.

  Make locked locations, their requirements, and their expected opportunities understandable to the player.

---

* [ ] **Build the equipment and inventory systems**

  Implement ownership, purchase, selection, and use of boats, rods, lures, and bait.

  Implement the different persistence rules for each equipment class.

  Boats must not break.

  Rods must normally be durable and must only have meaningful break risk in appropriate high-risk situations.

  Lures must support limited durability or loss.

  Bait must be consumed on fishing attempts.

  Equipment attributes must influence fishing opportunities, difficulty, and risk.

  Build the supporting UI and backend operations needed to inspect and manage equipment.

---

* [ ] **Build the fishing encounter system**

  Implement the server-authoritative process that starts a fishing attempt.

  The backend should determine eligible fish from the player's location, boat, rod, lure, bait, and other relevant conditions.

  Generate the individual fish, including its realistic size, weight, difficulty, value-relevant attributes, and encounter parameters.

  Consume or reserve the required resources correctly.

  Create an encounter that the client can play without giving the client authority over the valuable outcome.

  Protect encounters against reuse, invalid completion, obvious manipulation, and other simple forms of cheating.

---

* [ ] **Build and tune the fishing mini-game**

  Implement the main skill-based fishing mechanic.

  The player should control a catch zone with touch, mouse, or equivalent input.

  The fish should move within the fishing area.

  Catch progress should increase while the fish remains inside the controlled zone and decrease when it escapes the zone.

  Support differences in fish speed, acceleration, direction changes, unpredictability, fight duration, and other behavior.

  Give different fish species recognizable movement characteristics where useful.

  Make equipment affect the mini-game in understandable ways.

  Ensure that the mechanic works well on mobile Telegram webviews and normal desktop browsers.

  Tune the controls until successful catches feel primarily skill-based rather than arbitrary.

---

* [ ] **Connect fishing outcomes to equipment risk**

  Implement bait consumption, lure durability or loss, rod stress, rod damage if retained as a concept, and rod break events.

  Connect severe equipment risk to meaningful conditions such as fish difficulty, fish size, rod suitability, player performance, and deliberate equipment mismatch.

  Make suitable equipment safe during ordinary fishing.

  Make dangerous attempts visibly dangerous before the player commits resources.

  Keep rod destruction rare enough that it is a memorable risk rather than a recurring tax.

  Ensure that all economically important outcomes are determined by the backend.

---

* [ ] **Build fish valuation and the game economy**

  Implement fish sale values using species, specimen size, rarity, quality, and other relevant factors.

  Establish costs for bait, lures, rods, and boats.

  Balance fishing tiers so that better fishing areas require greater investment and produce greater potential rewards.

  Preserve meaningful variance without making progression dependent on repeated negative expected-value bets.

  Provide a recovery path so that a player who runs out of useful resources cannot permanently soft-lock the account.

  Keep the economy configurable so that prices and probabilities can be tuned from play-testing data.

---

* [ ] **Build catch results, selling, and the collection**

  After a successful catch, present the individual fish clearly.

  Show relevant information such as species, scientific name, weight, length, specimen quality, catch location, value, and interesting biological information.

  Allow the player to sell the fish immediately or keep it.

  Implement the persistent fish collection.

  Allow a kept fish to be inspected and sold later.

  Make each kept fish an individual specimen rather than only an entry in a species counter.

  Support useful collection sorting and inspection.

---

* [ ] **Build the Fish Journal and record systems**

  Track species discovery independently from fish ownership.

  Record useful player statistics such as number caught, largest specimen, highest-value specimen, and personal records for each species.

  Provide a Fish Journal that distinguishes discovered and undiscovered fish.

  Make discovery and personal records a meaningful progression path that does not depend only on earning currency.

---

* [ ] **Build the shop and overall progression loop**

  Create the player-facing shop and purchasing flows for bait, lures, rods, and boats.

  Connect purchases to the progression from low-risk starter fishing to expensive high-risk fishing.

  Make the relationships between equipment, location access, fish availability, difficulty, cost, and possible reward understandable.

  Ensure that the complete loop works:

  `fish → catch → keep or sell → earn currency → improve equipment → unlock new opportunities → pursue rarer fish`

  Remove progression blockers and unnecessary friction discovered while implementing the full loop.

---

* [ ] **Build the main game interface and navigation**

  Turn the individual systems into one coherent game.

  Provide the necessary screens and transitions for the home state, lake selection, fishing setup, fishing mini-game, catch results, collection, Fish Journal, equipment, and shop.

  Show important player state such as currency, selected equipment, consumable quantities, progression, location access, and risk.

  Keep the interface usable on Telegram mobile layouts first while maintaining normal browser support.

  Add loading, empty, error, and reconnect states where necessary.

---

* [ ] **Make risk understandable before the player commits**

  Present enough information before each fishing attempt for the player to make a meaningful decision.

  This can include bait cost, lure condition, rod suitability, rod risk, expected fish classes, potential value ranges, and warnings for dangerous equipment combinations.

  Use clear descriptions or risk bands when exact percentages would create false precision or encourage undesirable optimization.

  Do not hide significant equipment-loss mechanics from the player.

---

* [ ] **Balance the initial content and progression**

  Play through the game from a new account through the highest initial fishing tier.

  Tune fish availability, rarity, mini-game difficulty, equipment effectiveness, equipment costs, fish values, consumable costs, rod break probabilities, and location progression together.

  Avoid balancing each system in isolation.

  Ensure that:

  * Starter fishing is sustainable.
  * Skill has meaningful economic value.
  * Better equipment feels useful.
  * High-risk fishing has better upside.
  * Rare catches feel significant.
  * Rod loss is uncommon but consequential.
  * Keeping a valuable trophy fish creates a real trade-off against selling it.
  * Progression does not require unreasonable repetitive grinding.

---

* [ ] **Harden server authority and persistence**

  Review every economically valuable action for client trust problems.

  Ensure that the client cannot directly grant itself fish, money, equipment, catches, collection records, rare specimens, successful encounters, or progression.

  Add transaction handling and idempotency where duplicate requests could cause economic problems.

  Handle interrupted fishing sessions, expired encounters, reconnects, duplicate result submissions, and failed network requests safely.

  Add appropriate rate limiting and abuse protections without complicating normal gameplay.

---

* [ ] **Complete Telegram integration**

  Verify Telegram authentication in the real Mini App environment.

  Configure the bot and Mini App launch flow.

  Ensure that Telegram identity maps reliably to the internal player account.

  Verify mobile layout, touch controls, viewport behavior, safe areas, resume behavior, and Telegram-specific webview behavior.

  Keep Telegram integration isolated enough that normal browser development continues to work.

  Do not build the larger social system yet unless it becomes necessary for the core game.

---

* [ ] **Add presentation, feedback, and game feel**

  Improve the experience after the complete gameplay loop works.

  Add appropriate visuals, transitions, feedback, sound, fish presentation, catch celebrations, failure feedback, equipment-break feedback, and other polish.

  Make rare and exceptional fish feel materially different from routine catches.

  Keep presentation work compatible with the data-driven fish and equipment systems.

  Do not allow visual polish to obscure risk, cost, or gameplay information.

---

* [ ] **Test the complete game as a system**

  Test new-player progression, normal fishing, failed fishing, rare catches, equipment mismatch, rod break events, depleted resources, selling, keeping fish, later selling from the collection, purchases, boat unlocks, Telegram sessions, reconnects, and deployment.

  Add automated tests where they provide useful protection.

  Fix state inconsistencies and exploitable economic paths.

  Verify database migrations and production Cloudflare configuration.

  Test with realistic mobile dimensions and touch input.

---

* [ ] **Prepare the first complete playable release**

  Seed the intended initial locations, boats, rods, lures, bait, and fish catalogue.

  Remove development-only shortcuts from production behavior.

  Verify production authentication and secrets.

  Deploy the game and backend.

  Perform a clean-account play-through against the deployed environment.

  Fix issues that prevent the intended progression loop from being completed.

  The game should be considered functionally complete for the initial release when a new Telegram player can progress from the starter state through the available locations, catch and collect fish, manage risk, earn and spend currency, upgrade equipment, and pursue the highest-tier initial fish.

---

# Deferred Work

Add work here when it is deliberately excluded from the current implementation.

Deferred work does not need to block completion unless it becomes necessary for the core game.

Examples can include:

* [ ] Public Telegram player profiles.
* [ ] Viewing other players' collections.
* [ ] Friends and social discovery.
* [ ] Collection sharing.
* [ ] Leaderboards.
* [ ] Tournaments.
* [ ] Achievements.
* [ ] Weather.
* [ ] Time-of-day effects.
* [ ] Seasonal fish.
* [ ] Additional lakes.
* [ ] Saltwater fishing.
* [ ] Fictional or legendary fish.
* [ ] Player trading.
* [ ] Auctions.
* [ ] Crafting.
* [ ] Aquariums or trophy displays.
* [ ] More advanced anti-cheat systems.
* [ ] Analytics and live economy tuning tools.

The agent should add new deferred items when it intentionally postpones useful work.

---

# Agent Working Rule

Treat this document as a guide to completion, not as a sequence of isolated tickets.

When you start an item:

* Inspect the surrounding systems.
* Implement adjacent work when it is naturally required.
* Continue while there is clear productive work to do.
* Update this document when the implementation changes the plan.
* Add newly discovered work instead of silently ignoring it.
* Mark an item complete only when its intended player-facing or architectural outcome works.
* Do not stop merely because one narrow interpretation of the checkbox has been satisfied.

Prefer a coherent working game over strict adherence to the original boundaries of this checklist.
