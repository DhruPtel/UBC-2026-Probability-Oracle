# Hosting the site

One container runs everything: the pages, the oracle's posts, the insurance desk, the keeper and the QuickNode webhook. It is the same server as `npm run lab`, started with `PUBLIC_MODE=1`. It is live at https://web-production-195a7b1c.up.railway.app.

## What public mode changes

- **Only what a visitor needs is served.** The website (`/`, `/markets`, `/use`, `/insure`), the live demo's four pages (`/overview`, `/oracle`, `/pools`, `/agents`), their data, the paid read (`/odds/:symbol`), the webhook (`/stream`), the desk's MCP endpoint (`/mcp`) and `/health`. `/lab` and every admin, reset or test route answer 404; the list is `OPEN` at the top of [`src/server/index.ts`](../src/server/index.ts).
- **A visitor can start two things.** A demo agent: at most 20 an hour and 200 a day. A replay: one at a time, at the earliest 2 minutes after the last one started, at most 10 an hour and 60 a day.
- **Both pause when the deployer holds under 5 USDC.** The pages and the oracle carry on.
- **"Connect your agent" gives one line** for any MCP client: `claude mcp add --transport http hedgehog-desk https://<host>/mcp`. An agent that signs up there shows as "Your agent"; a sign-up from the page is always a demo agent. MCP sign-ups are limited to 5 an hour per address, and every agent shares the desk's four pool wallets.
- **The server posts all the feed's markets,** the nine of `config/markets.json` too, because no `npm run oracle` runs next to it.
- **One port.** The webhook is `POST /stream` on the main port, with the same signature check.
- **Live updates stay open.** `GET /events` sends a keep-alive line every 20 s.
- **No response carries a variable's value.** Responses hold addresses and transaction hashes.

## Variables

| Variable | What it is |
|---|---|
| `PUBLIC_MODE` | `1` (set in the Dockerfile) |
| `LOOPS` | `off` starts the server with nothing sent from the deployer: no posts, no keeper syncs, no agent runs, no new agents or replays. Anything else, or unset, is on |
| `DATA_DIR` | Where `logs/` lives: `/data`, a volume, so the records, the candle cache, the last replay and the deployer's lock outlive a redeploy |
| `PORT` | The port to listen on; the host sets it |
| `ARC_RPC_URL` | The Arc testnet RPC |
| `DEPLOYER_KEY`, `AGENT_KEY`, `DESK_SEED` | The wallets, as in `.env` |
| `GEMINI_SANDBOX_API_KEY`, `GEMINI_SANDBOX_API_SECRET` | The desk's sandbox orders |
| `STREAM_TOKEN` | The Stream's security token, which the webhook checks each delivery against |

Secrets are set on the host, never in the image: `.dockerignore` leaves `.env` and `logs/` out.

## Health

`GET /health` answers 200 while the feed loop is alive (Gemini read in the last 5 minutes) and 503 otherwise; with `LOOPS=off` it answers 200 and says `"loops":"off"`. `railway.json` points Railway's healthcheck at it, restarts the container on failure, and keeps one replica that never sleeps.

## The first visit

The candle cache (`logs/candles/`) is on the volume, so charts open at once after a redeploy. On an empty volume the server reads one market every 2 s in the background, about 4 minutes for the whole feed. The home page's data is read once at boot.

## On Railway

Project `probability-oracle`, one service `web`, a volume at `/data`. Two tokens:

- `RAILWAY_API_TOKEN` in `.env` is an account token. The CLI's `up` refuses it; it works with Railway's GraphQL API (`https://backboard.railway.com/graphql/v2`), which is how the project, service, variables, volume and domain were made.
- `RAILWAY_PROJECT_TOKEN` in `.env` is a project token for the production environment, made through the same API. `railway up` takes it as `RAILWAY_TOKEN`, for that command only.

**Redeploy after a change** (from the repository's folder; the token is read from `.env` and never printed):

```
RAILWAY_TOKEN=$(grep '^RAILWAY_PROJECT_TOKEN=' .env | cut -d= -f2-) npx @railway/cli up --ci --service web
```

Or, with a browser: `railway login`, `railway link` (choose `probability-oracle`, `production`, `web`), then `railway up`.

**Read the logs:** `railway logs` after `railway link`, or the service's "Deployments" tab in the dashboard. With the project token: `RAILWAY_TOKEN=… npx @railway/cli logs --service web`.

**Two copies never post at once.** A service with a volume is stopped before its replacement starts, and every deployer send waits for the lock in `DATA_DIR`. Do not run `npm run lab`, `npm run demo` or `npm run oracle` on a laptop with the same keys while the hosted copy runs; `LOOPS=off npm run lab` is safe.

## Locally, with Docker

```
docker build -t probability-oracle .
docker run --rm -p 8080:8080 --env-file .env -e LOOPS=off -v oracle-data:/data probability-oracle
# then open http://localhost:8080
```

## The Stream

With the site hosted there is no tunnel. The Stream's webhook is the site's own address, and its security token is the host's `STREAM_TOKEN`:

```
STREAM_TOKEN=<the host's value> STREAM_WEBHOOK_URL=https://<domain> npm run stream:up
npm run stream:down             # when judging is over; it bills per block
```
