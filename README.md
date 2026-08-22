# Fishing with Friends

The foundation for a 2D browser fishing game delivered as a Telegram Mini App. The current slice establishes the data-driven freshwater catalogue, persistent starter loadout, lake access progression, and a first playable fishing loop with a touch/mouse-friendly skill challenge.

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
- Browser-facing screens and controls in `apps/game/src/ui`.
- Client-side request methods in `apps/game/src/api`.
- Authoritative gameplay services in `apps/worker/src/services`.
- D1 reads/writes in `apps/worker/src/persistence`.
- New public contracts in `packages/shared/src`.

The initial game state is server-owned. A first authenticated request to `GET /api/game/state` idempotently creates the starter account state: 100 coins, shore fishing access, a Starter Fiberglass rod, a Copper Spinner with 10 durability, and 10 Worms. The browser may select a lake for local setup preview, but it cannot grant itself currency, equipment, or access. Starting a fishing attempt consumes bait and lure durability on the Worker, which also selects and stores the fish specimen before the browser mini-game begins.

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
```

`.envrc`, `.dev.vars`, `.env`, and `.env.*` are ignored. The Worker needs `TELEGRAM_BOT_TOKEN` as a deployed Worker secret, not as a normal `wrangler.jsonc` variable. The helper below reads the existing process variable and pipes it directly to Wrangler without printing it:

```bash
npm run secret:set:telegram
```

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
| `GET` | `/api/game/state` | Return the authoritative starter loadout, catalogue, and lake access |
| `POST` | `/api/game/encounters` | Validate a setup, consume resources, and create a server-owned encounter |
| `POST` | `/api/game/encounters/:id/complete` | Resolve a bounded mini-game performance into a catch or loss |
| `POST` | `/api/game/catches/:id/decision` | Keep a pending catch or sell it for its server-calculated value |

Route handlers stay thin. Input validation and centralized error responses live at the Worker boundary; authentication is middleware; D1 access is isolated in the player repository.

## D1

The first migration creates the `players` table and a unique index on `telegram_user_id`. Migration `0002_create_game_state.sql` adds the server-owned player game state and normalized equipment inventory. Migration `0003_create_fishing_encounters.sql` adds server-created encounters and individual pending/kept/sold catches. The internal player `id` is independent of Telegram's external ID.

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
