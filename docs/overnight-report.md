# Overnight report, Nov 18 to 19

The unattended batch 11.1 to 11.7. Written at 04:20 UTC on Nov 19 (10:20 pm CST, Nov 18).

**Live demo: https://web-production-195a7b1c.up.railway.app**

## What was done

| Unit | Result |
|---|---|
| 11.1 README | Already in the asked shape from 10c to 10f; checked and committed. The planned agent guardrails were renumbered to Phase 12 so this batch could be Phase 11 |
| 11.2 Hosting prep | Done, except the local Docker test (blocked, below) |
| 11.3 Railway | Deployed: project `probability-oracle`, service `web`, a volume at `/data`, a public domain, healthcheck passing |
| 11.4 Switch over | Local demo, Lab and tunnel stopped; one Stream delivers to the hosted `/stream` |
| 11.5 Walkthrough | Every check passes on the hosted site; 12 screenshots in `docs/screenshots/` |
| 11.6 Live address | In `README.md`, `docs/tracks/README.md`, `docs/submission.md`; the video script updated |
| 11.7 Video | `docs/video/demo.mp4`: 3:01, 1440×900, silent with captions, 8.4 MB, committed |

## Blocked

1. **`git push`.** This shell has no GitHub credentials ("could not read Username for https://github.com"). Seven commits are local on `main`. Until they are pushed, GitHub shows the old README without the live address.
2. **Docker locally.** `docker` is not usable in this WSL distro (Docker Desktop's WSL integration is off). The image was built by Railway from the same Dockerfile and runs there; before that, public mode was tested locally with Node on another port.

## What was deployed

- The Lab server with `PUBLIC_MODE=1`, built from the `Dockerfile` (Node 22, Foundry, `forge build`, `npm ci`), at the commit of unit 11.4.
- Variables set on Railway, values never printed: `ARC_RPC_URL`, `DEPLOYER_KEY`, `AGENT_KEY`, `DESK_SEED`, `GEMINI_SANDBOX_API_KEY`, `GEMINI_SANDBOX_API_SECRET`, `STREAM_TOKEN`, `PUBLIC_MODE=1`, `DATA_DIR=/data`. `QUICKNODE_API_KEY` and the Railway token were not copied: the server does not use them.
- In public mode: `/lab` and every admin or test route answer 404; at most 20 new demo agents and 10 replays an hour; both pause when the deployer holds under 5 USDC; "Connect your agent" says it needs a local copy.
- The hosted server posts all the feed's markets, the nine of `config/markets.json` too, because no `npm run oracle` runs beside it.

How it was deployed: the token in `.env` is a workspace token, which the CLI's `init`, `list` and `whoami` refuse. The project, service, variables, volume and domain were made through Railway's GraphQL API with it, and the code was uploaded with `railway up --ci` under a project token made for the deploy. Details are in `docs/deploy.md`.

## The pick fix

The built-in agent now picks the cheapest per $1 of payout among the contracts that end last (Nov 30) with a chance from 50% to 80%, or buys nothing and says why. On the hosted site it bought 4 contracts on "BTC ends below $65,000" at 62% for $0.64 each.

Why it once bought "below $70,000" at $0.96: the month-end contracts near 50% are the nine markets posted only by `npm run oracle`. That loop was not running, their posts went stale, and the desk leaves stale markets out. What remained at 50% or more were the nearly certain ones, and the cheapest of those cost $0.96 for $1 of payout.

## Balances (04:18 UTC)

| Wallet | USDC |
|---|---|
| Deployer `0x96fF…8400` | 23.67 |
| Agent `0xFfc1…cbCF` | 3.00 |

Testnet spend tonight was under 1 USDC of gas; premiums return to the deployer. The hosted server spends about 0.15 to 0.25 USDC of deployer gas an hour on posts, so about 10 to 15 USDC by Saturday night. That leaves the deployer above the 5 USDC pause line, but not by much if many visitors run replays: top it up from the faucet if it drops under 10.

## The Stream

- **Status:** on. Stream `87b65c4a-937d-456c-90fc-576b50b127a9`, created 04:07:56 UTC, delivering to `https://web-production-195a7b1c.up.railway.app/stream`. Deliveries arrive 0.7 to 1.6 s after their block and pass the signature check.
- **Cost so far:** 1,263 blocks in the first 10.7 minutes × 20 credits = about 25,000 credits (from the price table, not QuickNode's counter).
- **Cost through Saturday:** about 142,000 credits an hour, so about 10.5 million by the end of Saturday: 13% of the plan's 80 million.
- **To stop it:** `npm run stream:down` in the repo (its id is in `logs/stream-id.txt`).

## The walkthrough (11.5)

Playwright at 1440×900 on the hosted site: the home page, Oracle (154 charts drawn) and BTC pools load; a demo agent ran to Covered and "Why this amount" opened; the protocol replay ran to "No new borrowing" through the Stream; the pools slider and "Play the week" moved; the Stream panel showed hosted deliveries; 12 admin routes answered 404. The one thing seen: `/api/oracle` and `/api/agent` answered 500 for the first seconds after a redeploy, then recovered.

## What you still have to do

1. **`git push`** (seven commits). Then check the README on GitHub: the "Live demo" line and the coloured diagram under "Tracks".
2. **Devpost:**
   - add all team members;
   - paste the answers from `docs/submission.md`;
   - put the live address in "Try it out": https://web-production-195a7b1c.up.railway.app;
   - add the GitHub repository;
   - add a video link: upload `docs/video/demo.mp4` to YouTube or Google Drive (open to anyone with the link), or record your own with a voice from `docs/video-script.md`;
   - choose the main track (Agentic Payments and AI), the chain award (Arc) and both bounties (Gemini, QuickNode).
   - Deadline: Friday Nov 20, 12:00 pm CST.
3. **Do not run `npm run lab`, `npm run demo` or `npm run oracle` locally** while the hosted copy is up: both would post from the same deployer wallet. For local work, expect a failed post now and then, or stop the Railway service first.
4. **Railway:** an older project, `observant-upliftment`, is linked to the GitHub repository and failed its one build. After the push it will build the Dockerfile and then crash for lack of variables. Delete it in the dashboard. The new project is not linked to GitHub, so a push does not redeploy it: see `docs/deploy.md`.
5. **After Saturday:** `npm run stream:down`, and stop the Railway service so the deployer stops spending gas.
