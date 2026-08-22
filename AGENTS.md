# Repository Instructions

## Mobile layout verification

- Verify every HTML, CSS, sticky-element, fixed-overlay, viewport, or safe-area change in a real browser before opening a PR.
- Use Playwright with headless Chromium and an iPhone-class mobile viewport.
- Run the game and worker development stack, open the affected screen, and scroll through its complete range.
- Measure bounding boxes for the changed element and adjacent chrome such as top bars, bottom tabs, modals, CTAs, and overlays.
- Require zero overlap with fixed chrome and the expected gap for docked actions; report before/after measurements in the PR.
- Do not approve a layout fix based on CSS reasoning alone.
