# UX Issue Chunks

This backlog groups the UX audit into implementation-sized chunks. The order is intentional: viewport and request-lifecycle foundations should land before content and polish work.

## Chunk 0 — Verification foundation

Supporting work before UI fixes:

- Add Playwright as a project dependency.
- Expand layout verification beyond portrait Lakes and Shop.
- Add fixtures for slow requests, out-of-order responses, double taps, expired sessions, and active encounters.
- Verify iPhone portrait, Android portrait, landscape, and short-height viewports.

Primary file: `scripts/verify-layout.mjs`.

## Chunk 1 — Viewport, safe areas, and fixed chrome

- Correct safe-area measurement in `apps/game/src/main.ts`.
- Keep the fishing HUD inside Telegram safe areas.
- Make the cast bar and tab bar work in landscape and short viewports.
- Prevent toasts from obscuring important content.
- Prevent result/fight canvas overlap during transitions.

Primary files:

- `apps/game/src/main.ts`
- `apps/game/src/game/scenes/OceanScene.ts`
- `apps/game/src/styles.css`

Acceptance test: zero overlap between fight HUD, cast bar, tabs, Telegram safe areas, and content on iPhone portrait, Android portrait, landscape, and short-height viewports.

## Chunk 2 — Async state, pending actions, and recovery

- Add loading states to screen navigation.
- Cancel or ignore stale navigation responses.
- Disable buttons visually and semantically while requests are pending.
- Prevent duplicate Keep/Sell, purchase, Sell All, recovery, and cast submissions.
- Clear stale loading toasts when a result arrives.
- Add retry/recovery UI for normal screen failures.
- Handle expired sessions after startup.
- Restore, abandon, or explain active encounters after reload.

Primary files:

- `apps/game/src/main.ts`
- `apps/game/src/api/client.ts`
- `apps/game/src/ui/app-shell.ts`
- `apps/worker/src/services/fishing-service.ts`

Acceptance test: slow, failed, duplicated, expired, and interrupted requests all produce deterministic UI states.

## Chunk 3 — Fishing decisions and economy clarity

- Show bait/lure consumption before casting.
- Show actual rod-risk information, including break consequences.
- Explain why a location is risky.
- Show the returned `rodRiskBand`.
- Make caught/lost result states authoritative and unambiguous.
- Add clear rod-break and recovery guidance.
- Confirm Sell All and report the actual number/value sold.
- Preserve wallet and collection consistency after partial failures.

Primary files:

- `apps/game/src/ui/app-shell.ts`
- `packages/shared/src/contracts.ts`
- `apps/game/src/main.ts`

Acceptance test: a new player can predict the cost, risk, and consequence of casting, keeping, selling, and recovering.

## Chunk 4 — Shop and location planning

- Render catalog descriptions.
- Show meaningful rod, lure, bait, and boat stats.
- Explain attracted species and location unlocks.
- Use explicit action labels such as “Buy bait” or “Buy rod.”
- Show equipped versus owned state.
- Make locked locations readable and explain how to unlock them.
- Replace non-interactive `+N` fish indicators with expandable or complete lists.
- Improve gear selector dismissal and mobile name handling.

Primary files:

- `apps/game/src/ui/app-shell.ts`
- `packages/shared/src/catalog.ts`
- `apps/game/src/styles.css`

Acceptance test: players can choose a location and purchase/equip gear without guessing what the item changes.

## Chunk 5 — Journal, Collection, and social surfaces

- Replace repeated Journal placeholders with compact undiscovered entries.
- Add descriptions, habitat, native range, source, and discovery dates.
- Fix “A uncommon fish.”
- Add filtering/grouping or useful discovery hints.
- Add a “Go fishing” CTA to the empty Collection state.
- Show specimen location and caught date.
- Clarify whether the Friends board counts caught, kept, or sold fish.
- Add meaningful empty and self-ranking states.

Primary files:

- `apps/game/src/ui/app-shell.ts`
- `apps/worker/src/routes/game.ts`
- `packages/shared/src/contracts.ts`

Acceptance test: Journal, Collection, and Friends each give the player a clear next action and meaningful progress information.

## Chunk 6 — Accessibility and interaction semantics

- Make the Phaser fishing interaction accessible or provide an equivalent semantic control.
- Add focus management after navigation and result changes.
- Complete tab/panel ARIA relationships.
- Associate the Collection sort label with its select.
- Add `aria-disabled` and proper disabled behavior.
- Improve keyboard handling for gear menus.
- Increase small touch targets.
- Remove global `user-select: none` from informational content.

Primary files:

- `apps/game/index.html`
- `apps/game/src/ui/app-shell.ts`
- `apps/game/src/styles.css`

Acceptance test: keyboard navigation, screen-reader structure, focus movement, and touch targets work consistently on every screen.

## Chunk 7 — Reliability and visual polish

- Add timeouts/retries for external fish images.
- Improve truncated equipment names.
- Fix the undefined `--panel` variable.
- Refine toast placement and result transitions.
- Add reduced-motion/high-contrast checks where appropriate.
- Extend browser verification to cover all completed fixes.

Primary files:

- `apps/game/src/ui/fish-images.ts`
- `apps/game/src/styles.css`
- `scripts/verify-layout.mjs`

Recommended order: Chunk 0 → Chunk 1 → Chunk 2 → Chunks 3–5 in parallel → Chunk 6 → Chunk 7.
