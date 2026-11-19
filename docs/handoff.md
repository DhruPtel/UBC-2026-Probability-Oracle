# Hand-off: picking this up on another computer

The site runs on Railway, not on a laptop: https://web-production-195a7b1c.up.railway.app. The other computer is only needed to change code, redeploy, read logs, and stop the Stream after judging.

## 1. Get the code

```
git clone https://github.com/DhruPtel/UBC-2026-Probability-Oracle && cd UBC-2026-Probability-Oracle
npm install
forge build --root contracts        # needs Foundry; only for running the server or tests locally
```

Needs Node 22.

## 2. Bring `.env` across

Copy `.env` from the old computer by AirDrop or a password manager. Never through git, email or a chat. It is gitignored and must stay that way.

The names in it (values are never printed by any script):

| Name | For |
|---|---|
| `ARC_RPC_URL` | Arc testnet RPC |
| `DEPLOYER_KEY`, `AGENT_KEY`, `DESK_SEED` | The wallets. The hosted copy uses the same ones |
| `QUICKNODE_API_KEY` | Creating and deleting the Stream |
| `STREAM_TOKEN` | The hosted Stream's security token, the same value as on Railway |
| `GEMINI_SANDBOX_API_KEY`, `GEMINI_SANDBOX_API_SECRET` | Sandbox orders |
| `RAILWAY_API_TOKEN` | Railway's API (account token) |
| `RAILWAY_PROJECT_TOKEN` | `railway up` and `railway logs` for the project |
| `STREAM_WEBHOOK_URL` | Local demos only |

`.env` also has a line named `RAILWAY_TOKEN` from before this batch. Nothing in the repository reads it.

## 3. Never run the demo there while Railway is live

`npm run demo`, `npm run lab` and `npm run oracle` send from the same wallets as the hosted copy. Two copies collide on the wallet's nonce and both spend gas. If you need the pages locally, use:

```
LOOPS=off npm run lab        # the pages and their data only; sends nothing
```

## 4. Railway

With a browser, once:

```
npx @railway/cli login
npx @railway/cli link        # choose probability-oracle, production, web
```

Then:

| To | Run |
|---|---|
| Redeploy after a change | `npx @railway/cli up` |
| Read the logs | `npx @railway/cli logs` |
| Check it is alive | open `/health` on the site: `{"ok":true,"loops":"on",…}` |

Without logging in, the project token does the same:

```
RAILWAY_TOKEN=$(grep '^RAILWAY_PROJECT_TOKEN=' .env | cut -d= -f2-) npx @railway/cli up --ci --service web
RAILWAY_TOKEN=$(grep '^RAILWAY_PROJECT_TOKEN=' .env | cut -d= -f2-) npx @railway/cli logs --service web
```

A redeploy takes about 2 minutes; the old container stops before the new one starts, and the records are kept on the volume at `/data`. The repository is not linked to the Railway project, so a `git push` does not redeploy. More in [deploy.md](deploy.md).

## 5. Stop the Stream after Saturday

The QuickNode Stream bills per block, about 3.4 million credits a day, whether or not anyone visits. After judging (Saturday Nov 21):

```
npm run stream:down -- 87b65c4a-937d-456c-90fc-576b50b127a9
```

It prints `delete …: HTTP 200` and `streams left on the account: 0`. Or in QuickNode's dashboard: Streams → the Stream → Pause or Delete. The site keeps working without it: the top bar says "QuickNode Stream off" and the replays use a direct trigger.

To stop the site too: Railway dashboard → `probability-oracle` → `web` → Settings → remove the deployment, or delete the project.

## 6. If the treasury runs low

The hosted copy spends about 0.14 testnet USDC an hour on posts, and pauses new agents and replays when the deployer holds under 5 USDC. Top it up at https://faucet.circle.com (Arc Testnet) to the deployer's address, `0x96fF876149B830D473904957fe711b5eb4c28400`. `npm run check:arc` prints the balances.
