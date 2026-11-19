# Hosting the site

One container runs everything: the pages, the oracle's posts, the insurance desk, the keeper and the QuickNode webhook. It is the same server as `npm run lab`, started with `PUBLIC_MODE=1`.

## What public mode changes

- **Only what a visitor needs is served.** The four pages, their data, the paid read (`/odds/:symbol`), the webhook (`/stream`) and `/api/health`. `/lab` and every admin or test route answer 404; the list is `OPEN` at the top of [`src/server/index.ts`](../src/server/index.ts).
- **A visitor can start two things:** a demo agent (at most 20 an hour) and a replay (one at a time, at most 10 an hour).
- **Both pause when the deployer holds under 5 USDC.** The pages and the oracle carry on.
- **"Connect your agent" says it needs a local copy.** The MCP routes are closed on the hosted copy.
- **The server posts all the feed's markets,** the nine of `config/markets.json` too, because no `npm run oracle` runs next to it.
- **One port.** The webhook is `POST /stream` on the main port, with the same signature check.

## Variables

| Variable | What it is |
|---|---|
| `PUBLIC_MODE` | `1` (set in the Dockerfile) |
| `DATA_DIR` | Where `logs/` lives: `/data`, a volume, so records outlive a redeploy |
| `PORT` | The port to listen on; the host usually sets it |
| `ARC_RPC_URL` | The Arc testnet RPC |
| `DEPLOYER_KEY`, `AGENT_KEY`, `DESK_SEED` | The wallets, as in `.env` |
| `GEMINI_SANDBOX_API_KEY`, `GEMINI_SANDBOX_API_SECRET` | The desk's sandbox orders |
| `STREAM_TOKEN` | The Stream's security token, which the webhook checks each delivery against |

Secrets are set on the host, never in the image: `.dockerignore` leaves `.env` and `logs/` out.

## Locally, with Docker

```
docker build -t probability-oracle .
docker run --rm -p 8080:8080 --env-file .env -v oracle-data:/data probability-oracle
# then open http://localhost:8080
```

Stop every other copy first (`npm run lab`, `npm run oracle`): two servers posting from one deployer wallet both spend gas.

## On Railway

The project is `probability-oracle`, with one service, `web`, and a volume at `/data`. The site is at https://web-production-195a7b1c.up.railway.app.

```
railway init --name probability-oracle
railway up                      # builds the Dockerfile
railway volume add --mount-path /data
railway variables --set "NAME=value" …
railway domain
```

`railway.json` names the builder (the Dockerfile) and the healthcheck path, `/api/health`.

The token in `.env` (`RAILWAY_API_TOKEN`) is a workspace token: the CLI's `init`, `list` and `whoami` refuse it. On Nov 18 the project, service, variables, volume and domain were made through Railway's GraphQL API with that token, and the code was uploaded with `railway up --ci --service <id>` under a project token (`RAILWAY_TOKEN`) made for the deploy. To redeploy after a change, make a project token in the project's settings and run that command.

## The Stream

With the site hosted there is no tunnel. Create the Stream with the site's address as the webhook, then copy its token to the host:

```
# set STREAM_TOKEN on the host first (any long random string), wait for the redeploy, then:
STREAM_TOKEN=<the same string> STREAM_WEBHOOK_URL=https://<domain> npm run stream:up
# QuickNode takes it as the Stream's security token, so no delivery is rejected
npm run stream:down             # when the demo period is over; it bills per block
```
