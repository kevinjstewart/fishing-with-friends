# Repository Instructions

## Mobile layout verification

- Verify every HTML, CSS, sticky-element, fixed-overlay, viewport, or safe-area change in a real browser before opening a PR.
- Use Playwright with headless Chromium and an iPhone-class mobile viewport.
- Run the game and worker development stack, open the affected screen, and scroll through its complete range.
- Measure bounding boxes for the changed element and adjacent chrome such as top bars, bottom tabs, modals, CTAs, and overlays.
- Require zero overlap with fixed chrome and the expected gap for docked actions; report before/after measurements in the PR.
- Do not approve a layout fix based on CSS reasoning alone.

## Async interaction verification

- Treat screen navigation as latest-wins: abort the previous screen request and ignore stale responses before rendering.
- Give every mutating action an in-flight guard, native `disabled`, `aria-disabled`, and `try/finally` cleanup so double submissions cannot reach the Worker.
- On a `401`, recover the session once and retry the original request once; surface retry UI for other failures.
- On startup, query the active-encounter endpoint. Resume a live encounter and explicitly explain an expired encounter.
- Run `npm run verify:layout` for async interaction changes. The browser check must cover slow, failed, out-of-order, duplicate, expired-session, and reload-interrupted flows in addition to layout measurements.

## Managed Wrangler environments

- If Wrangler cannot write its default preferences or log path, set `WRANGLER_LOG_PATH` and `WRANGLER_REGISTRY_PATH` to writable task-local paths before running the dev stack, local migrations, or builds.
