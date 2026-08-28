# Fishing with Friends

The foundation for a 2D browser fishing game delivered as a Telegram Mini App. The current slice includes the data-driven freshwater catalogue, persistent loadouts, lake access progression, a touch/mouse-friendly skill challenge, server-resolved rod break risk, the tackle shop, the kept-fish collection, and the Fish Journal.

## Architecture

The browser is responsible for rendering, local UI state, and network requests. The Cloudflare Worker is responsible for authentication, domain services, and authoritative persistent state. Telegram identity is accepted only after the Worker validates the signed `initData` payload with the Worker secret `TELEGRAM_BOT_TOKEN`.

```text
Telegram Mini App / desktop browser
  apps/game
    Phaser scenes and rendering
    DOM UI shell
    Telegram adapter
    API client
          │ typed HTTP contracts
          ▼
  apps/worker
    Hono routes and middleware
    auth/session verification
    player service
    D1 repositories for player and game state
          │
          ▼
  Cloudflare D1: players
```

Cloudflare KV and R2 are not configured yet. KV is not useful until there is cache/config/rate-limit data to store, and R2 is not needed for static game assets. Neither should become a source of authoritative player state.

## Repository structure

```text
apps/
  game/                 Vite + Phaser frontend
  worker/               Hono + Cloudflare Worker backend
packages/
  shared/               Shared request/response contracts
migrations/             Wrangler D1 migrations
scripts/                Safe operational helpers
wrangler.jsonc          Worker, assets, and D1 configuration
```

Future gameplay belongs in these existing boundaries:

- Phaser scenes and rendering in `apps/game/src/game`.
- Browser-facing screens and controls in `apps/game/src/features` and `apps/game/src/shared-ui`.
- Client-side request methods in `apps/game/src/api`.
- Authoritative gameplay services in `apps/worker/src/services`.
- D1 reads/writes in `apps/worker/src/persistence`.
- New public contracts in `packages/shared/src`.

The initial game state is server-owned. A first authenticated request to `GET /api/game/state` idempotently creates the starter account state: 100 coins, shore fishing access, a Starter Fiberglass rod, a Copper Spinner with 10 durability, and 10 Worms. The browser may select a lake for local setup preview, but it cannot grant itself currency, equipment, or access. Starting a fishing attempt consumes bait and lure durability on the Worker, which also selects and stores the fish specimen before the browser mini-game begins.

Fishing encounters are server-owned and survive a browser reload. On startup the browser checks `GET /api/game/encounters/active`: a live encounter resumes, while an expired encounter is reported explicitly and its consumed bait and lure are not restored. The Worker enforces at most one active encounter per player, so a duplicate cast cannot create a second authoritative attempt.

The Phaser layer must not become the owner of persistent currency, inventory, progression, rewards, purchases, catches, or other authoritative state. New gameplay APIs should be added only when the corresponding feature is introduced.

## Prerequisites

- Node.js 20 or newer
- npm
- A Telegram bot created with BotFather for Mini App testing
- A Cloudflare account with an API token that can manage Workers and D1

The project uses npm workspaces. From the repository root:

```bash
npm install
npm run typecheck
npm test
npm run lint
npm run build
```

## Environment variables

Never put secrets in `VITE_*` variables. Vite variables are public browser configuration.

Deployment credentials are read by Wrangler from the process environment:

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
TELEGRAM_BOT_TOKEN
STAGING_D1_DATABASE_ID
STAGING_TELEGRAM_BOT_TOKEN
```

`.envrc`, `.dev.vars`, `.env`, and `.env.*` are ignored. The Worker needs `TELEGRAM_BOT_TOKEN` as a deployed Worker secret, not as a normal `wrangler.jsonc` variable. The helper below reads the existing process variable and pipes it directly to Wrangler without printing it:

```bash
npm run secret:set:telegram
```

Staging uses a different Telegram bot and D1 database. `STAGING_D1_DATABASE_ID` is the non-secret UUID of that database; `STAGING_TELEGRAM_BOT_TOKEN` is read only when setting the staging Worker secret. Never use the production database ID or production bot token for staging.

The checked-in Wrangler development environment supplies these non-secret flags automatically:

```text
ENVIRONMENT=development
DEV_AUTH_ENABLED=true
```

The browser uses the development auth route only when Vite is running in development mode. The Worker additionally requires the exact `development` Wrangler environment, the explicit `DEV_AUTH_ENABLED=true` binding, and the `X-Dev-Auth: true` marker. Production rejects this route. `.dev.vars` only needs the local `TELEGRAM_BOT_TOKEN` binding; the example file shows all values for a fresh setup.

Optional public frontend configuration:

```text
VITE_API_BASE_URL=https://your-api.example.com
```

Leave it unset for the default same-origin production deployment and the Vite development proxy.

## Local development

After adding the local flags above:

```bash
npm run dev
```

This starts Vite at `http://127.0.0.1:5173` and Wrangler at `http://localhost:8787`. Vite proxies `/api` requests to the Worker. Open the Vite URL in a normal browser; it uses the explicitly gated local development auth route. In Telegram, the same frontend sends Telegram `initData` to the Telegram auth route instead.

To run only one side:

```bash
npm run dev:game
npm run dev:worker
```

The browser game uses the React application through `apps/game/index.html`. The standard checks build the production client and Worker from the same application path:

```bash
npm run typecheck
npm test
npm run lint
npm run build:game
npm run build:worker
npm run verify:layout
npm run verify:encounter
node scripts/shots.mjs
```

With the Worker running, use `npm run dev:game` and open `http://127.0.0.1:5173/`. The browser checks exercise the production React entry across the supported mobile viewports and encounter flows.

In managed environments where Wrangler cannot write its default preferences or logs, provide writable task-local paths before starting the stack or applying local migrations:

```bash
WRANGLER_LOG_PATH=/private/tmp/fishing-with-friends-wrangler.log \
WRANGLER_REGISTRY_PATH=/private/tmp/fishing-with-friends-wrangler-home/registry \
npm run dev
```

The Phaser shell currently proves initialization, responsive canvas sizing, scene lifecycle, and future asset-loading placement. It deliberately contains no fishing mechanics or game state.

## Telegram authentication flow

1. Telegram injects `window.Telegram.WebApp.initData` into the Mini App.
2. The frontend sends the opaque `initData` string to `POST /api/auth/telegram`.
3. The Worker recomputes Telegram's HMAC signature using `TELEGRAM_BOT_TOKEN`, checks required fields and freshness, and extracts the user only from the validated payload.
4. The Worker upserts a player using the Telegram user ID as a unique external identity and a separate UUID as the internal player ID.
5. The Worker returns a short, signed bearer session token.
6. Later requests use `Authorization: Bearer ...`; backend routes resolve this to the internal player ID before accessing D1.

The frontend never sends `initDataUnsafe` or a client-provided user ID for authentication. The bot token is never bundled by Vite.

For Telegram setup, configure the bot's Mini App URL in BotFather to the deployed Worker URL. During development, a normal browser can use the gated local mode; no Telegram client data is trusted in that mode.

The current workers.dev deployment is `https://fishing-with-friends.fishing-with-friends.workers.dev`.

## API

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Infrastructure health check |
| `POST` | `/api/auth/telegram` | Validate Telegram `initData` and establish a session |
| `POST` | `/api/auth/dev` | Explicitly gated local development authentication |
| `GET` | `/api/me` | Return the authenticated internal player profile |
| `GET` | `/api/game/state` | Return the authoritative loadout, catalogue, and lake access |
| `GET` | `/api/game/encounters/active` | Resume the player's live encounter or report an expired one |
| `POST` | `/api/game/encounters` | Validate a setup, consume resources, and create a server-owned encounter |
| `POST` | `/api/game/encounters/:id/complete` | Resolve a bounded mini-game performance into a catch or loss, including rod break rolls |
| `POST` | `/api/game/catches/:id/decision` | Keep a pending catch or sell it for its server-calculated value |
| `POST` | `/api/game/catches/:id/sell` | Sell a pending or kept fish from the collection |
| `GET` | `/api/game/collection` | List the player's kept individual specimens |
| `GET` | `/api/game/journal` | List per-species discovery state and personal records |
| `POST` | `/api/game/shop/purchase` | Buy bait (with quantity), lures, rods, or boats with guarded coin deductions |
| `POST` | `/api/game/equipment/select` | Set the active rod, lure, or bait among owned items |
| `POST` | `/api/game/recovery/dig-worms` | Emergency bait and starter-lure recovery to prevent soft locks |

Route handlers stay thin. Input validation and centralized error responses live at the Worker boundary; authentication is middleware; D1 access is isolated in the player repository.

Mutating game routes are rate limited per player (casts and general actions use separate buckets), and authentication routes are rate limited per IP. Limits use best-effort in-memory fixed windows inside each Worker isolate and default to 30 casts/min, 90 actions/min, and 20 auth attempts/min; they can be overridden with the `RATE_LIMIT_CASTS_PER_MINUTE`, `RATE_LIMIT_ACTIONS_PER_MINUTE`, and `RATE_LIMIT_AUTH_PER_MINUTE` bindings. Encounter completions that arrive faster than any real fight could be played are rejected without consuming the encounter, so scripted instant wins fail while honest players are unaffected.

## D1

The first migration creates the `players` table and a unique index on `telegram_user_id`. Migration `0002_create_game_state.sql` adds the server-owned player game state and normalized equipment inventory. Migration `0003_create_fishing_encounters.sql` adds server-created encounters and individual pending/kept/sold catches. Migration `0004_create_fish_journal.sql` adds per-species discovery and personal records. Migration `0005_one_active_encounter_per_player.sql` expires older duplicate active rows and adds a partial unique index so each player has at most one active encounter. The internal player `id` is independent of Telegram's external ID.

## Game systems

All economic outcomes stay on the Worker. Purchases deduct coins with guarded `coins >= cost` updates before equipment rows are inserted or incremented; failed writes refund the deduction. Lures are bought as spare stock: the active lure's durability is consumed per cast, and when it runs out a spare is automatically tied on. Rod breaks are rolled on the Worker after each fight from specimen weight versus rod rating, submitted performance, and the rod's break resistance; a broken rod leaves the inventory, the strongest surviving rod is equipped, and the free starter rod can be reclaimed from the shop. Kept catches are individual specimens that can be inspected in the collection and sold later for their stored value. The journal records discovery and personal bests independently of currency.

```bash
# Only needed when creating this project from scratch.
npm run db:create

npm run db:migrate:local
npm run db:migrate:remote
npm run db:migrations
```

The created D1 database ID is stored in `wrangler.jsonc`; credentials and database passwords are not used. Do not add fish, inventory, equipment, currency, or progression tables until those features are actually introduced.

## Cloudflare deployment

Wrangler uses the existing `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` environment variables; interactive `wrangler login` is not required.

```bash
npm run db:migrate:remote
npm run secret:set:telegram
npm run deploy
```

`npm run deploy` builds the Vite frontend and deploys the Worker with the static assets directory. Update `APP_ORIGIN` in `wrangler.jsonc` if the frontend will be served from a separate origin. The initial deployment does not configure KV or R2.

## Staging

Staging is a production-like, isolated Cloudflare environment at `https://fishing-with-friends-staging.fishing-with-friends.workers.dev`. It has its own Worker, D1 database, Telegram bot token, player data, and one-day session lifetime. Local development auth is disabled there.

The `Deploy staging` GitHub Actions workflow runs on pushes to the `staging` branch or by manual dispatch. It:

1. Runs typechecking, tests, and linting.
2. Creates or reuses the `fishing-with-friends-staging` D1 database in Eastern North America.
3. Generates a temporary Wrangler config that refuses the production D1 database ID.
4. Builds, migrates, and deploys staging serially.
5. Installs the staging Telegram bot token when configured.
6. Smoke-tests health, frontend delivery, and rejection of development auth.

Create a separate bot with BotFather for staging, then add its token as the `STAGING_TELEGRAM_BOT_TOKEN` secret in the GitHub `staging` environment. Configure that bot's Mini App URL to the staging URL above. The Cloudflare credentials remain the existing repository secrets, while the bot token is scoped to the staging environment.

To run the same operations locally after authenticating Wrangler:

```bash
export STAGING_D1_DATABASE_ID="your-staging-d1-uuid"
export STAGING_TELEGRAM_BOT_TOKEN="your-staging-bot-token"

npm run build:staging
npm run db:migrate:staging
npm run deploy:staging
npm run secret:set:telegram:staging
```

The generated `.wrangler.staging.jsonc` is ignored and contains no secret. Do not copy production player data into staging; use synthetic Telegram accounts and resettable test data.

## CI/CD

GitHub Actions runs typechecking, tests, linting, and both production builds for every pull request targeting `main`. The `Checks` job is required by the `main` branch protection rule.

After a pull request is merged, the same workflow reruns `Checks` for the exact commit on `main`. A successful run applies pending D1 migrations and deploys the Worker and frontend to production. Deployments are serialized so two merges cannot migrate or deploy production concurrently.

The deployment job uses these GitHub Actions repository secrets:

```text
CLOUDFLARE_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

`CLOUDFLARE_TOKEN` must be a narrowly scoped Cloudflare API token with permission to deploy this Worker and edit its D1 database. `CLOUDFLARE_ACCOUNT_ID` identifies the account containing the Worker. The Telegram bot token remains a deployed Worker secret and is not copied into each deployment run.

The separate staging workflow uses the GitHub `staging` environment. A manual dispatch from `main` validates that exact release candidate; pushes to a long-lived `staging` branch are also supported when changes need soak time before merging.

## Verification

The regression suite covers Telegram HMAC validation, payload freshness, tampering, local auth gating, session verification, player creation, and `/api/me`. The main checks are:

```bash
npm run typecheck
npm test
npm run lint
npm run build:game
npm run build:worker
```

`build:worker` uses Wrangler's non-destructive `--dry-run`; it verifies the Worker bundle, D1 binding, and static asset upload without deploying.

The mobile browser verifier requires the local game and Worker stack to be running:

```bash
npx playwright install chromium
npm run dev
# In a second terminal:
npm run verify:layout
```

`verify:layout` uses an iPhone-class viewport and checks fixed-chrome geometry, complete scrolling, loading/retry states, stale navigation cancellation, duplicate-submit protection, pending control semantics, one-time session recovery, and active/expired encounter startup behavior. The checked-in verifier currently covers iPhone portrait; Android portrait, landscape, and short-height viewport coverage remains part of the verification backlog.
