# React Frontend Port Plan

## Purpose

Port the browser UI from Lit custom elements plus the imperative `AppShell` adapter to a React SPA that is easier to extend without changing the authoritative Worker architecture or rewriting the Phaser fishing game.

This is an execution plan for coding agents. Each phase must leave the repository buildable, testable, and reviewable. Do not combine the whole port into an unverified rewrite.

## Outcome

The completed frontend will use:

- Vite as the client development server and bundler.
- React for UI composition and local UI state.
- TanStack Query for Worker-backed server state, mutations, caching, cancellation, and invalidation.
- Phaser behind one narrow React-owned runtime adapter.
- The existing Hono Worker, D1 persistence, Telegram authentication, shared domain contracts, and server-authoritative gameplay rules.
- The existing visual design, CSS tokens, responsive behavior, accessibility behavior, and Playwright coverage.

The completed frontend will not contain Lit, custom-element registration, `AppShell`, or application-wide custom DOM events.

## Why this port exists

The current application has several overlapping coordination systems:

- `apps/game/src/main.ts` owns authentication, session recovery, navigation sequencing, all mutations, reconciliation, encounter startup/resolution, and Phaser coordination.
- `apps/game/src/ui/app-shell.ts` duplicates UI state and translates custom DOM events into imperative handler callbacks.
- `apps/game/src/ui/components/game-app.ts` owns another copy of the render state.
- Individual Lit elements communicate through the `UiEventMap` in `apps/game/src/ui/types.ts`.
- Phaser communicates through its own event emitter.

An ordinary feature can therefore require changes to a component, the custom-event map, `AppShell`, `main.ts`, the API client, and multiple pending/error paths. The port must remove those bridges, not reproduce them as React contexts or a global store.

## Scope boundaries

### In scope

- React application shell and feature components.
- TanStack Query integration with the existing `ApiClient`.
- Centralized session recovery with exactly one retry after a `401`.
- Explicit encounter lifecycle state.
- A narrow Phaser lifecycle interface owned by React.
- Component tests for migrated UI behavior.
- Playwright fixture and selector updates needed because React does not use Shadow DOM.
- Removal of Lit, `AppShell`, custom-element registration, and custom UI events after cutover.
- Direct shared-package imports so client-only helpers do not pull the server catalogue into the browser bundle.

### Out of scope

- Replacing Vite.
- Replacing Phaser with PixiJS or Canvas.
- Rewriting Hono routes, Worker services, D1 repositories, or migrations.
- Changing gameplay probabilities, economy, catalogue content, progression, or authentication semantics.
- Redesigning screens or changing copy during the port.
- Adding SSR, React Server Components, Next.js, TanStack Start, or a URL router.
- Adopting Tailwind, shadcn/ui, CSS-in-JS, or a new design system.
- Deploying, changing production/staging configuration, mutating D1 data, or opening a PR unless separately authorized.
- Migrating to the Cloudflare Vite plugin in the same change. That is a follow-up after the React port is stable.

## Preflight gate

Before editing:

1. Run `git status --short --branch`.
2. Confirm the intended base branch with the user or parent agent. At the time this plan was written, the checkout was `codex/visible-cost` at `14354f3`, one commit ahead of `origin/main`. Do not silently drop or overwrite that visible-cost change.
3. Read `AGENTS.md` and follow its browser-verification and async-interaction contracts.
4. Do not read `.envrc` or print secret values. Use the checked-in examples for variable names.
5. Record a baseline from the intended base:

   ```bash
   npm run typecheck
   npm test
   npm run lint
   npm run build:game
   WRANGLER_LOG_PATH=/private/tmp/fishing-with-friends-wrangler.log \
   WRANGLER_REGISTRY_PATH=/private/tmp/fishing-with-friends-wrangler-registry \
   npm run build:worker
   ```

6. Start the current game and Worker stack, migrate the local D1 database if needed, and run `npm run verify:layout`.
7. Capture the current screenshots with `node scripts/shots.mjs` and retain the report and measurements for comparison. Do not commit generated screenshots unless explicitly requested.
8. Record the current production bundle sizes from `npm run build:game`.

Do not begin the port if the baseline is red for an unrelated reason. Document the failure and ask whether it should be fixed first or treated as a known exception.

## Non-negotiable behavior contracts

The port is incomplete unless all of these remain true:

### Authentication and session recovery

- Telegram `initData` remains opaque client input and is validated only by the Worker.
- Development authentication remains available only in Vite development mode and only when the Worker permits it.
- A `401` starts one shared recovery operation, then retries the original request exactly once.
- Concurrent `401` responses share the same recovery promise.
- Non-`401` failures do not retry automatically; they expose an explicit retry UI.
- No mutation is replayed more than once by TanStack Query or an interceptor.

### Navigation

- Navigation is latest-wins.
- Starting a new screen request aborts or cancels the preceding screen request.
- A stale response cannot replace the newest screen.
- A failed navigation leaves the last successful screen usable and exposes a retry.
- Repeated taps on the currently active tab do not create duplicate requests.

### Mutations

- Every mutation has an in-flight guard independent of rendering latency.
- The initiating native control receives `disabled` and `aria-disabled` while the mutation is pending.
- Double taps cannot send duplicate Worker mutations.
- Pending state is scoped to the affected action where possible; do not freeze unrelated screens behind one global boolean.
- Error cleanup always occurs.
- UI state is reconciled from authoritative Worker responses or refetched queries after ambiguous failures.

### Encounter lifecycle

- Startup queries the active-encounter endpoint after authentication.
- A live encounter resumes.
- An expired encounter is explained explicitly.
- Starting a cast cannot create a second active encounter.
- A reload during a fight returns to the server-owned encounter.
- Completion is submitted once.
- Catch-decision retry and return-to-lakes behavior remain intact.
- The DOM result UI is not revealed until Phaser has left fight mode and emitted/confirmed its ambient state.

### Layout, Telegram, and accessibility

- Telegram theme, viewport, stable height, device safe area, and content safe area continue to update from Telegram events.
- The Phaser HUD receives the same safe-area values as the DOM UI.
- Top bar, tab bar, cast action, modals/results, and scrollable content never overlap.
- The iPhone portrait, Android portrait, landscape, and short-height checks continue to pass.
- Reduced-motion and forced-colors behavior remains.
- Buttons keep accessible names, native disabled state, and visible focus behavior.
- The visual port must not be approved from source reasoning alone.

## Target architecture

Use this as the intended file shape. Exact filenames may change if the current checkout makes a nearby location more natural, but preserve the boundaries.

```text
apps/game/src/
  main.tsx
  app/
    App.tsx
    AppProviders.tsx
    app-reducer.ts
    app-types.ts
    use-bootstrap.ts
    use-screen-navigation.ts
  api/
    client.ts                 existing transport
    authenticated-client.ts   single-flight 401 recovery + one retry
    query-client.ts
    query-keys.ts
  features/
    chrome/
      GameTopbar.tsx
      GameTabbar.tsx
      StatusToast.tsx
    lakes/
      LakesScreen.tsx
      GameHero.tsx
      LocationCarousel.tsx
      LocationCard.tsx
      GearDock.tsx
      GearSelector.tsx
      CastBar.tsx
      queries.ts
      mutations.ts
    shop/
      ShopScreen.tsx
      ShopItem.tsx
      mutations.ts
    collection/
      CollectionScreen.tsx
      mutations.ts
    journal/
      JournalScreen.tsx
    friends/
      FriendsScreen.tsx
    encounter/
      encounter-reducer.ts
      use-encounter.ts
      CatchResult.tsx
      CatchDecision.tsx
  game/
    PhaserCanvas.tsx
    phaser-runtime.ts
    create-game.ts            existing Phaser creation
    fishing-mechanics.ts      unchanged pure mechanics
    scenes/                   initially unchanged
  shared-ui/
    FishImage.tsx
    SpecimenDetails.tsx
    icons.tsx
    presenters.ts
  styles/
    tokens.css
    globals.css
  test/
    render-fixture.tsx
    setup.ts
```

### State ownership rules

- Worker/server state belongs in TanStack Query: game state, collection, journal, leaderboard, and active encounter.
- Screen selection, shop category, collection sort, journal filter, confirmation prompts, and toast visibility are client UI state.
- A component owns state used only by that component.
- Shared app transitions live in a reducer, not a collection of independent booleans.
- Frame-by-frame fishing values stay inside Phaser and pure fishing mechanics. Do not push per-frame state through React.
- Refs are for Phaser instances, abort controllers, mutation locks, and other transient values that must not trigger rendering.
- Do not add Redux, Zustand, XState, or another global state library during the initial port. Add one only if the completed React data flow demonstrates a concrete need.
- Do not create a catch-all `AppContext` that changes on every query or animation update. Keep providers narrow and values stable.

### Rendering and import rules

- Import feature modules directly. Do not create a barrel that re-exports the catalogue beside client helpers.
- Keep `packages/shared/src/catalog.ts`, `contracts.ts`, and `risk.ts` available through explicit subpath exports.
- Lazy-load heavy noninitial screens after functional parity.
- Keep Phaser behind a dynamic-import boundary after the eager parity port is verified.
- Do not optimize by memoizing every component. Add memoization only for measured expensive renders or stable list items.
- Derive display values during render instead of mirroring them into effects.
- Start independent authenticated fetches together where doing so preserves current semantics.

### CSS strategy

- Preserve `apps/game/src/styles.css` tokens, safe-area rules, font setup, Phaser root positioning, and accessibility media queries first.
- Move each Lit component's `static styles` into a sibling CSS file without redesigning it.
- Scope component CSS under a stable feature root such as `.shop-screen` or `.collection-screen` because React will not provide Shadow DOM isolation.
- Preserve public class names used by Playwright until the related verifier is updated to a role or `data-testid` selector.
- Do not combine the framework port with a Tailwind, CSS Modules, or design-token rewrite.
- Replace the old Shadow DOM isolation assertion with checks for computed-style stability and absence of cross-screen selector leakage.

## API and query design

Keep `apps/game/src/api/client.ts` as the low-level typed transport initially. Add a wrapper that owns authentication recovery. Query and mutation functions call that wrapper rather than implementing recovery independently.

### Query keys

Define query keys in one file and use factories where an identifier is required:

```text
gameState                 ["game-state"]
activeEncounter           ["active-encounter"]
collection                ["collection"]
journal                   ["journal"]
leaderboard               ["leaderboard"]
```

Default automatic query and mutation retries must be disabled during the parity port. The authenticated wrapper owns the single allowed `401` recovery/retry. User-driven retry controls handle other failures.

Pass TanStack Query's `AbortSignal` through every query function to `ApiClient`. Query cancellation that does not reach `fetch` does not satisfy the latest-wins contract.

### Mutation invalidation matrix

Start conservatively with this matrix, then narrow only when tests prove a smaller set is correct:

| Mutation | Lock scope | Authoritative cache work after settlement |
| --- | --- | --- |
| Start fishing | Cast action | Refresh `gameState`; set/refetch `activeEncounter` |
| Complete encounter | Encounter completion | Clear/refetch `activeEncounter`; refresh `gameState` and `journal`; retain returned result |
| Decide catch | Catch decision | Refresh `gameState`, `collection`, `journal`, and `leaderboard` |
| Purchase item | Item/category purchase | Refresh `gameState` |
| Select equipment | Selected equipment slot | Refresh or atomically update `gameState` from the response |
| Dig for worms | Recovery action | Refresh `gameState` |
| Sell one catch | Catch ID | Refresh `collection`, `gameState`, and `leaderboard` |
| Sell all catches | Collection sale operation | Preserve current sequential/partial-success behavior, then refresh `collection`, `gameState`, and `leaderboard` |

Do not replace sell-all with a new bulk Worker endpoint during this port. That is a separate backend feature.

## Phaser boundary

Create a framework-neutral runtime interface. React may own it, but Phaser must not import React.

```ts
export interface FishingRuntime {
  setSafeArea(insets: SafeAreaInsets): void;
  startFight(encounter: FishingEncounterResponse): void;
  returnToLobby(): Promise<void>;
  onComplete(handler: (event: FishingCompleteEvent) => void): () => void;
  onAmbient(handler: () => void): () => void;
  destroy(): void;
}
```

Implementation requirements:

- Construct the Phaser game once per application mount.
- Keep the instance in a ref; never in React state.
- Register every Phaser/global listener in an effect and remove it in cleanup.
- Preserve `fight:start`, `fishing:complete`, `fishing:ambient`, and safe-area semantics behind the adapter until `OceanScene` is refactored.
- Do not rewrite `OceanScene` during the UI port. After cutover, split it into layout, drawing, input, and effects modules in a separate change.
- First achieve eager-load parity. Only then make `PhaserCanvas` dynamically import the runtime and measure startup behavior.

## Execution phases

Each phase should be a separate reviewable PR or, if one PR is explicitly required, a separate passing commit. Never leave both implementations writing to the same root or handling the same user event.

Every acceptance criterion below is mandatory unless it is explicitly marked optional. The implementing agent must attach evidence for each checked item in its handoff: the command or browser scenario, the observed result, and any relevant measurement. “Not applicable” requires a written explanation. A phase is not complete if a criterion is deferred to a later phase without this plan explicitly saying so.

### Phase 0: Characterize the existing behavior

Changes:

- Add missing tests around session single-flight recovery, latest-wins navigation, mutation deduplication, encounter resume/expiry, catch-decision retry, and partial sell-all reconciliation.
- Add stable `data-testid` attributes only where Playwright currently depends on Lit instance methods or Shadow DOM structure.
- Record visual measurements and screenshots for every screen and encounter result.
- Document the current bundle output in the PR description.

Acceptance criteria:

- [ ] `npm run typecheck`, `npm test`, `npm run lint`, `npm run build:game`, the Worker build, and `git diff --check` pass before behavior-preserving extraction begins.
- [ ] Tests explicitly exercise shared single-flight `401` recovery, latest-wins navigation, mutation deduplication, active-encounter resume, expired-encounter explanation, catch-decision retry, and partial sell-all reconciliation.
- [ ] The relevant tests fail when their corresponding guard is intentionally disabled or otherwise demonstrate that they assert the protected behavior rather than only the happy path.
- [ ] `npm run verify:layout` passes and covers slow, failed, out-of-order, duplicate, expired-session, active/expired encounter, and reload-interrupted flows.
- [ ] Browser baselines exist for iPhone portrait, Android portrait, iPhone landscape, and short-height portrait, with full-range scrolling and no console errors.
- [ ] The baseline records bounding boxes and gaps for the top bar, hero/first control, cast bar, tab bar, last scrollable content, result actions, modals, retry panels, and overlays where present.
- [ ] Baseline screenshots include every screen plus catch, loss, broken-rod, keep, sell, and retry result states, using deterministic fixtures.
- [ ] The game build report records total and per-chunk minified and gzip sizes, including the Phaser chunk and application chunk.
- [ ] Production behavior and copy are unchanged; any production-source edit is limited to stable test hooks and is justified in the handoff.

### Phase 1: Create framework-neutral runtime services

Changes:

- Extract the single-flight `401` recovery logic from `main.ts` into `api/authenticated-client.ts`.
- Extract Telegram initialization and safe-area synchronization into a small lifecycle module or hook-compatible service.
- Add `game/phaser-runtime.ts` around the existing Phaser events.
- Add pure reducers and transition tests for app/encounter phases.
- Add explicit `@fishing/shared/contracts`, `@fishing/shared/risk`, and `@fishing/shared/catalog` package exports. Update browser runtime imports to use the narrow paths and prove the catalogue is absent unless deliberately imported.
- Keep Lit and `AppShell` as the active production UI.

Acceptance criteria:

- [ ] Lit remains the only production UI entry, and React is not yet added to the production dependency graph.
- [ ] The existing Lit UI passes the Phase 0 unit, integration, and browser baselines without changed copy, layout, or interaction semantics.
- [ ] Concurrent `401` responses trigger one shared recovery promise; each original operation retries no more than once; a second `401` and every non-`401` error are surfaced without an automatic retry loop.
- [ ] Aborted reads remain aborted through recovery and cannot commit stale results after a newer navigation succeeds.
- [ ] Tests prove that duplicate completion and every extracted mutation are rejected before a second Worker request is sent, including calls made before a rerender could disable the control.
- [ ] The authenticated client preserves existing request payloads, response types, error objects, and development-auth behavior.
- [ ] The Phaser runtime adapter constructs and destroys the existing game exactly once, forwards safe-area updates, preserves fight/complete/ambient semantics, and removes every registered listener during cleanup.
- [ ] Pure app and encounter reducer tests cover every allowed transition plus invalid or repeated completion/decision events.
- [ ] `@fishing/shared/contracts`, `@fishing/shared/risk`, and `@fishing/shared/catalog` resolve in typecheck, tests, and builds; browser imports use explicit subpaths.
- [ ] Bundle inspection proves that a browser import of contracts or risk does not include the catalogue unless the catalogue subpath is imported deliberately.
- [ ] All Phase 0 commands, async scenarios, screenshots, and measured gaps remain green after extraction.

### Phase 2: Add the React scaffold behind an explicit migration entry

Changes:

- Install `react`, `react-dom`, `@tanstack/react-query`, `@vitejs/plugin-react`, React type packages, React Testing Library, user-event, and a DOM test environment.
- Update `apps/game/tsconfig.json` for `react-jsx`.
- Add the Vite React plugin without changing the `/api` proxy or Worker build.
- Add `main.tsx`, `AppProviders`, `QueryClient`, and a minimal React shell.
- Keep the Lit entry as the default until the React shell passes its own tests.
- Use a compile-time migration entry or separate development entry, not a runtime flag that ships both full applications to production.
- Add component-test setup while preserving existing Node-environment Worker and mechanics tests.

Acceptance criteria:

- [ ] The default production entry still builds and runs Lit only; the React migration entry is explicit and cannot be selected accidentally by a production runtime flag.
- [ ] Both the default Lit build and explicit React migration build typecheck, test, and bundle from documented commands.
- [ ] The React shell renders a deterministic boot/loading state, authenticated success state, recoverable bootstrap failure, and retry path in component tests.
- [ ] The QueryClient has automatic query and mutation retries disabled for the parity port, and query functions pass TanStack Query's `AbortSignal` to the authenticated transport.
- [ ] Mounting, unmounting, and remounting the React entry leaves exactly one React root, at most one Phaser game, and one copy of each Telegram/global listener.
- [ ] The React entry can be opened in headless Chromium without an uncaught page error, console error, failed bootstrap loop, or request to a nonexistent route.
- [ ] No React code imports the root `@fishing/shared` barrel or imports the catalogue except from the explicit catalogue subpath where catalogue data is required.
- [ ] Existing Node-environment Worker/mechanics tests and new DOM-environment component tests run in their intended environments without leaking globals between suites.
- [ ] Dependency and bundle changes are recorded; the migration build contains one copy of React and TanStack Query and does not bundle a second Lit application root.

### Phase 3: Port chrome and read-only screens

Port in this order:

1. Top bar, tab bar, status toast, loading state, and retry panel.
2. Friends screen.
3. Journal screen and its local filter.
4. Shared icons, fish images, specimen details, and presenters needed by those screens.

Changes:

- Use props and callbacks, not custom DOM events.
- Use queries for leaderboard and journal data.
- Preserve visible loading/error states and the latest-wins screen commit.
- Add component tests for empty, loading, error, populated, filtered, and retry states.
- Begin converting Playwright selectors from custom-element hosts to roles or stable `data-testid` values.

Acceptance criteria:

- [ ] Top bar, tab bar, toast, loading, retry, friends, journal, icons, fish images, and specimen details render through React on the migration entry without custom UI DOM events.
- [ ] Component tests cover empty, loading, error, populated, filtered, retry, image-loaded, image-retry, and image-unavailable states with accessible queries.
- [ ] Friends and journal queries use the authenticated query layer, preserve the last successful screen on failure, and expose an explicit user-driven retry.
- [ ] Starting a newer navigation aborts the previous fetch; a stale success or error cannot replace the current screen; repeated taps on the active tab do not duplicate requests.
- [ ] Tab selection, journal filtering, retry controls, and toast announcements work with keyboard and touch input and expose correct accessible names and states.
- [ ] Playwright selectors for migrated elements use roles, labels, or stable test IDs and contain no dependency on Lit instance methods or migrated Shadow Roots.
- [ ] Computed-style checks show no selector leakage between migrated screens, including after navigating between each screen in both directions.
- [ ] Reduced-motion and forced-colors checks pass, visible focus remains clear, and the browser run reports no page or console errors.
- [ ] Each read-only screen matches the Phase 0 viewport screenshots and bounding-box gaps with zero overlap after full-range scrolling; every intentional pixel difference is documented.
- [ ] The default Lit entry remains green until cutover, and no event or request is handled simultaneously by Lit and React.

### Phase 4: Port shop and collection mutations

Port in this order:

1. Shop screen and item cards.
2. Collection screen and specimen cards.
3. Buy quantity selection, sell-one, and sell-all confirmation.

Changes:

- Use feature-local mutation hooks.
- Implement explicit mutation locks that prevent repeated `mutate` calls before React rerenders.
- Drive native `disabled` and `aria-disabled` from the same pending source.
- Preserve sell-all partial-success reporting and final reconciliation.
- Invalidate/refetch according to the mutation matrix.
- Do not apply broad optimistic updates to currency or inventory during parity work.

Acceptance criteria:

- [ ] Shop, collection, quantity selection, sell-one, sell-all confirmation, cancel, partial-success, and final-result states render through React on the migration entry.
- [ ] Purchase, sell-one, and sell-all each use an imperative in-flight lock that rejects a repeated call before React can rerender.
- [ ] Every initiating native control has matching `disabled` and `aria-disabled` pending state, restores both in `finally`, and leaves unrelated controls usable where safe.
- [ ] Tests prove that rapid double taps, keyboard activation while pending, and repeated programmatic invocation send no duplicate Worker mutation.
- [ ] A `401` uses the shared single recovery and one retry; a non-`401` or second failure exposes retry UI and does not replay a mutation automatically.
- [ ] Successful and ambiguous outcomes refresh exactly the authoritative queries required by the mutation matrix, and wallet, inventory, collection, and leaderboard settle to Worker-owned values.
- [ ] Sell-all preserves the current sequential and partial-success semantics, reports completed and failed work accurately, and performs final reconciliation even after an intermediate failure.
- [ ] No broad optimistic currency or inventory update is introduced during parity work.
- [ ] Quantity and confirmation state remains feature-local and resets correctly after cancel, success, navigation, and remount.
- [ ] Shop and collection pass loading, failure, retry, duplicate-action, full-scroll, modal, focus, reduced-motion, forced-colors, and console-health checks at every required viewport.
- [ ] Cards, confirmations, and docked actions meet the Phase 0 gaps with zero overlap, and screenshots show no unintended design or copy change.

### Phase 5: Port lakes, equipment, and cast startup

Changes:

- Port the lakes screen, location cards/carousel, gear dock/selectors, and cast bar.
- Keep selected location and open gear selector state local to the lakes feature.
- Use the game-state query as the authoritative inventory/loadout source.
- Preserve rod-risk explanations, locked-location navigation to the correct shop category, bait recovery, and selected-location behavior.
- Wire cast startup through the encounter mutation and Phaser runtime adapter.

Acceptance criteria:

- [ ] Lakes, location carousel/cards, gear dock/selectors, cast bar, locked-location affordance, rod-risk explanation, and bait-recovery UI render through React on the migration entry.
- [ ] Selected location and open-selector state remain local to the lakes feature while inventory, loadout, locks, balances, and location availability derive from authoritative game-state data.
- [ ] Gear menus open from touch and keyboard input, expose the correct expanded state, close on selection/outside interaction/Escape, restore focus, and do not clip at any required viewport.
- [ ] Equipment selection and bait recovery use pre-render in-flight locks, native `disabled`, `aria-disabled`, and `finally` cleanup; duplicate requests cannot reach the Worker.
- [ ] Locked-location navigation selects the correct shop category without issuing stale or duplicate screen requests.
- [ ] Cast startup sends one mutation, uses only the returned server encounter to start Phaser, and never synthesizes or predicts an encounter client-side.
- [ ] A failed or ambiguous cast does not start Phaser or consume optimistic gear; it reconciles game state and exposes a safe retry.
- [ ] An already active encounter prevents a second cast and routes into the documented resume behavior.
- [ ] Slow, failed, duplicate, successful, expired-session, and out-of-order cast-start browser scenarios pass with no page or console errors.
- [ ] Full-range scrolling and bounding-box checks preserve the baseline top-bar, hero, carousel, selector, cast-bar, tab-bar, and last-content gaps with zero overlap in every required viewport.

### Phase 6: Port encounter completion and results

Changes:

- Add an explicit encounter reducer with states equivalent to `booting`, `lobby`, `starting`, `fighting`, `resolving`, `result`, `deciding`, `decision-result`, and `recoverable-error`.
- Replace `fishingActive`, `fishingSceneSettled`, `completionPending`, and nested decision callbacks with reducer events and mutation state.
- Port catch result, tackle report, catch decision, lost result, retry panel, and decision receipt.
- Preserve the wait for Phaser ambient mode before revealing DOM results.
- Replace test-only dynamic imports of `AppShell` in `scripts/shots.mjs` and `scripts/verify-layout.mjs` with `apps/game/src/test/render-fixture.tsx`. That module must be reachable only as a development/test import and must not enter the production graph.

Acceptance criteria:

- [ ] Pure reducer tests cover booting, lobby, starting, fighting, resolving, result, deciding, decision-result, recoverable-error, resume, expiry, retry, return, and repeated/stale event transitions.
- [ ] Startup queries the active-encounter endpoint after authentication; a live encounter resumes from Worker data, an expired encounter receives explicit user-facing explanation, and no encounter returns to the lobby.
- [ ] Reload during fighting, resolving, result, and decision recovery returns to the correct server-authoritative state without creating another encounter or replaying completion.
- [ ] Completion and catch decision each have independent imperative locks and submit exactly once under rapid taps, repeated Phaser events, rerenders, reload recovery, and delayed responses.
- [ ] The DOM result remains hidden until Phaser confirms ambient mode; listener ordering and cleanup prevent an old ambient event from revealing a newer result.
- [ ] Catch, loss, broken rod, keep, sell, completion failure, decision failure/retry, decision receipt, and return-to-lakes flows pass in component and browser tests.
- [ ] A second `401`, non-`401`, or ambiguous completion/decision failure reconciles against the Worker and exposes the documented retry without automatic duplicate mutation.
- [ ] `scripts/shots.mjs` and `scripts/verify-layout.mjs` render React through `apps/game/src/test/render-fixture.tsx` and contain no import of `ui/app-shell.ts` or another Lit fixture.
- [ ] The test fixture is reachable only from development/test tooling and is absent from the production bundle graph.
- [ ] Result screens pass touch, keyboard, accessible-name, native-disabled, reduced-motion, forced-colors, full-scroll, and console-health checks.
- [ ] Catch decision/result actions retain the baseline tab-bar and safe-area gaps with zero overlap at every required viewport, and deterministic screenshots cover every result variant.

### Phase 7: Cut over and remove Lit

Changes:

- Make the React entry the only application entry in `index.html`.
- Remove the temporary migration entry.
- Delete `AppShell`, `UiEventMap`, `emitUiEvent`, Lit components, Lit-only style helpers, and custom-element registrations.
- Remove `lit` from `apps/game/package.json` and regenerate `package-lock.json` through npm.
- Remove Shadow DOM-specific Playwright logic and replace it with equivalent style-isolation assertions.
- Confirm no code or browser fixture imports deleted files.
- Confirm all production client imports use the explicit shared-package subpaths added in Phase 1.
- Run a production bundle analysis. Confirm the catalogue is not accidentally included through a helper import.

Acceptance criteria:

- [ ] `index.html` selects the React entry directly, the temporary migration entry is removed, and no runtime flag can start the legacy UI.
- [ ] `rg` finds no production import or runtime reference to `lit`, `LitElement`, `customElements.define`, `AppShell`, `UiEventMap`, `emitUiEvent`, migrated Lit components, or application `ui:*` custom events.
- [ ] Lit source, registrations, helpers, and dependencies are removed; `package-lock.json` is regenerated by npm and contains no direct game-workspace Lit dependency.
- [ ] All code, tests, browser scripts, and fixtures resolve without importing a deleted file or traversing a migrated Shadow Root.
- [ ] Production bootstrap and remount tests prove there is exactly one React root, one Phaser game instance, one Telegram listener set, and one handler for each user action.
- [ ] TanStack Query owns Worker-backed state and mutation lifecycle; there is no duplicate server-state mirror in a catch-all context, `App` state object, or Phaser state.
- [ ] Shared imports use explicit subpaths, and bundle inspection proves the full catalogue is absent unless a rendered feature deliberately imports it.
- [ ] The production build contains React and migrated feature code once and contains no dormant Lit application, alternate entry, test fixture, or duplicate Phaser runtime.
- [ ] `npm run typecheck`, `npm test`, `npm run lint`, `npm run build:game`, the Worker build, `npm run verify:layout`, `node scripts/shots.mjs`, and `git diff --check` all pass from a cleanly installed dependency graph.
- [ ] Browser verification covers every Phase 0 viewport and scenario with no overlap, accessibility regression, failed request loop, stale render, duplicate mutation, page error, or unexpected console error.
- [ ] Before/after bundle and mobile geometry measurements are reported. Every material increase is attributed to a named feature or dependency; an unexplained regression blocks cutover.
- [ ] The final diff contains no unapproved gameplay, Worker, D1, deployment, visual redesign, or copy change, and the documented git-revert rollback remains viable.

### Phase 8: Post-port cleanup, separate from cutover

Do only after Phase 7 is merged and stable:

- Split `OceanScene` into focused layout, drawing, input, and effects modules without changing mechanics.
- Lazy-load Phaser and noninitial feature screens; measure Telegram cold start before and after.
- Add a CI bundle budget.
- Evaluate the official Cloudflare Vite plugin to replace the two-process Vite proxy plus `wrangler dev` workflow.
- Remove duplicate staging game builds.

The Cloudflare Vite integration must be its own PR because it changes development, build, preview, staging, and deployment assumptions simultaneously.

Acceptance criteria:

- [ ] Phase 7 has been merged, observed as stable, and rerun from its final commit before any Phase 8 cleanup begins.
- [ ] Each selected cleanup item is implemented in its own reviewable PR or explicitly isolated commit; unselected items remain documented rather than being reported complete.
- [ ] Splitting `OceanScene`, if selected, preserves public runtime events, safe-area behavior, frame timing, mechanics, input behavior, and deterministic mechanics tests without moving frame state into React.
- [ ] Lazy loading, if selected, produces separate Phaser/noninitial-screen chunks, initializes the game at most once, shows an accessible loading/failure state, and records before/after Telegram cold-start and bundle measurements on the same device/profile.
- [ ] A bundle budget, if selected, fails CI on an intentional over-budget fixture or threshold test and covers at least total game gzip, the Phaser chunk, and the application chunk without relying on unstable hashed filenames.
- [ ] Cloudflare Vite integration, if selected, preserves local D1 state, `/api` behavior, Telegram/dev authentication boundaries, production asset delivery, staging configuration, and all Worker/game build commands; it is not combined with another cleanup item.
- [ ] Duplicate staging build removal, if selected, proves the retained artifact is built once, consumed by the expected deploy step, and identical in content to the previously deployed artifact path.
- [ ] The full static, unit, integration, browser, screenshot, console-health, and bounding-box gates from Phase 7 pass after each selected cleanup.
- [ ] Every performance claim is supported by repeatable before/after measurements; a regression or unexplained variance blocks that cleanup from merging.
- [ ] No selected cleanup changes gameplay, economy, API contracts, authentication semantics, visual design, or user-facing copy unless separately authorized.

## Test strategy

### Unit and component tests

- Preserve all existing Worker, shared-package, safe-area, fishing-mechanics, and presenter tests.
- Keep Worker and pure TypeScript tests in a Node environment.
- Run React component tests in a DOM environment.
- Prefer accessible queries (`getByRole`, labels, names) over implementation selectors.
- Test each feature with realistic typed fixtures from shared contracts.
- Test reducer transitions as pure functions.
- Test mutation hooks with a controlled QueryClient and transport fake; do not mock TanStack Query internals.

Required React coverage:

- Shell bootstrap success and retry failure.
- Navigation cancellation and stale-response rejection.
- Shared `401` recovery and one retry.
- Query loading/error/success/empty states.
- Per-action mutation pending and duplicate suppression.
- Sell-all partial completion.
- Encounter resume, expiry, completion, decision, and recoverable failure.
- Telegram share fallback behavior.
- Fish-image lookup retry and unavailable fallback.

### Browser verification

Run the real game and Worker development stack. Use task-local Wrangler paths when required:

```bash
WRANGLER_LOG_PATH=/private/tmp/fishing-with-friends-wrangler.log \
WRANGLER_REGISTRY_PATH=/private/tmp/fishing-with-friends-wrangler-registry \
npm run dev
```

Then run:

```bash
npm run verify:layout
node scripts/shots.mjs
```

The browser gate must cover:

- iPhone portrait, Android portrait, iPhone landscape, and short-height portrait.
- Every screen's full scroll range.
- Top bar, tab bar, cast bar, result actions, retry panels, and overlays.
- Slow, failed, out-of-order, and duplicate interactions.
- Session expiration and recovery.
- Active and expired encounter startup.
- Reload during an encounter.
- Catch, loss, rod-break, keep, and sell results.
- Reduced motion, forced colors, touch input, keyboard Escape, and console errors.

Report before/after bounding-box measurements in every UI migration PR. A visually similar screenshot without measurements does not pass.

### Final command gate

From the repository root:

```bash
npm run typecheck
npm test
npm run lint
npm run build:game
WRANGLER_LOG_PATH=/private/tmp/fishing-with-friends-wrangler.log \
WRANGLER_REGISTRY_PATH=/private/tmp/fishing-with-friends-wrangler-registry \
npm run build:worker
```

Also run `git diff --check` and inspect `git status --short --branch`.

## Review and rollback rules

- Keep the legacy Lit implementation functional until the React entry passes the same browser suite.
- Do not let legacy and React handlers run simultaneously.
- Before cutover, rollback is selecting the legacy entry and reverting the isolated migration phase.
- After Phase 7, rollback is a normal git revert of the cutover PR; do not keep dormant Lit code in production as a permanent fallback.
- Do not change Worker endpoints merely to make React integration easier unless the existing endpoint is demonstrably insufficient and the change is separately reviewed.
- Preserve unrelated working-tree changes.
- Never use destructive git cleanup to resolve migration conflicts.

## Agent handoff requirements

At the end of every phase, the implementing agent must report:

1. The exact phase completed.
2. Files added, changed, and deleted.
3. Behavior preserved and any intentional deviation.
4. Commands run and their results.
5. Browser scenarios run, screenshots captured, and before/after measurements.
6. Bundle sizes before and after.
7. Remaining legacy dependencies and imports.
8. Known risks or follow-up work.
9. Current branch, commit, and working-tree status.

An agent must not report the port complete while any Phase 7 acceptance item remains open.

## Definition of done

The port is complete only when:

- React is the sole UI renderer.
- TanStack Query owns Worker-backed server state and mutation lifecycle.
- Session recovery, latest-wins navigation, mutation guards, and encounter restoration meet the repository contracts.
- Phaser is isolated behind the runtime adapter and created exactly once.
- Lit, `AppShell`, custom UI events, and custom-element registrations are absent from the production graph.
- Shared client imports do not accidentally bundle the complete catalogue.
- Existing visual design and copy are preserved.
- All required commands and real-browser checks pass.
- Mobile bounding boxes meet or improve the recorded baseline with zero overlap.
- The final diff contains no unrelated product, gameplay, backend, deployment, or design changes.
