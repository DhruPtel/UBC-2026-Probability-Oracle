# CLAUDE.md — Hedgehog

Hackathon project for UBC 2026: a probability oracle that lets AI agents insure themselves.
**Every session, read in this order:** this file (the rules), `PLAN.md` (design, units, schedule, cut list), `LESSONS.md` (what has already cost us time).

## How we build

Bottom up, in small sections. This is not a production-grade, one-shot build. Each unit is the smallest proof of concept that runs end to end: the plain working path first, layers on top in later units. If you catch yourself designing for a later phase, stop.

Do **not** add any of these unless the unit explicitly lists it:

- abstractions, interfaces or classes for a single implementation; plugin or config systems; generic helpers "for later";
- retries, caching, rate limiting, validation or schema layers, error-handling frameworks, security hardening;
- monorepo tooling, Docker, CI, logging libraries, env-schema libraries, extra dependencies;
- files the unit doesn't list.

Prefer plain scripts, one file until it hurts, and hardcoded values in a small config. **When unsure, ask. Don't add.**

## Working rules

1. **One unit at a time.** Build only the unit you were asked to build, as defined in `PLAN.md`. Don't start the next unit until the user says go.
   - **Unit numbers always match build order.** If the order needs to change, stop and renumber `PLAN.md` first (as a docs-only unit), before building.
2. **Every unit ends the same way:**
   - (a) it runs end to end;
   - (b) `npm run typecheck` passes, plus `forge test` / `npm test` if core logic changed;
   - (c) `LOG.md` is up to date, and `LESSONS.md` if anything surprised you;
   - (d) the unit is ticked in `PLAN.md`;
   - (e) the git check and the git commands for the user (see Git below);
   - (f) a short report (template below).
3. **Every unit ends with its See it check:** tell me exactly what to open, what to click and what I should see. The checks are the "See it" lines in `PLAN.md`.
4. **The agent guardrails wait for Phase 11.** No budgets, max prices or owner approval before then, and no other limits, caps, allowlists, rate limits, retries or validation layers unless a unit lists them. The oracle's own checks were built in Phase 10 and are kept simple: only the publisher can post and never above 10000 bps (`OddsFeed`), thin books are not posted and stale values are marked (`thin` in `src/oracle/odds.ts`, `staleOf` in the server), and the Stream webhook verifies QuickNode's signature.
5. **Secrets are the one early exception.** Never commit or print private keys, API secrets or `.env` contents.
   - Keys live only in `.env`, which is gitignored. `.gitignore` exists before any key is generated.
   - Scripts print addresses, never keys.
   - Deploy scripts read keys from env, never from command-line arguments.
   - Never ask the user to paste a key in chat; they fill in `.env`.
6. **Real integrations over mocks.** If a real service is blocked, say so and propose the simplest stand-in. Label every stand-in in code, logs, the UI and the README. Labels in use: `PAPER TRADE` (the agent's protection buys, at the real production price), `REPLAY`, `DECLARED HOLDING`, `SANDBOX` (the `gemini:order` script, and the agent desk's sandbox orders), `ORDER TICKET` (the agent desk: the exact Gemini order at the live price, not sent), `DEMO` (the demo lending pool from Phase 6: no real deposits), `TEST` (the test pool on `test:demo`), `LIVE ADVISOR` (unit 6.4: read-only advice about a real protocol).
7. **Testing** means it runs end to end, plus a typecheck. Write small tests only for core logic: `policy.decide()`, odds math, and contract budget and approval math.
8. **When you need the user** (keys, faucet funds, accounts, a decision), start the message with `BLOCKED:`. Say exactly what you need and why.
9. **Keep spend low.**
   - No LLM calls inside loops. Small models for the optional one-shot calls.
   - Run the QuickNode Stream only while it's in use (`npm run stream:down` afterwards); it bills per block, at about 2 blocks/s.
   - Default intervals are 5 min for the oracle and the agent, to save faucet USDC.
10. **Real money and terms belong to the user.**
    - Never place a production (real-money) Gemini order without the user's explicit OK for that specific order. Sandbox orders are fine.
    - The user accepts terms of service (Gemini, Circle, QuickNode) themselves.
11. **Hackathon rules.**
    - Code must be substantially built during the hackathon (Nov 12–20, 2026), in this fresh repo.
    - Copy no code from the user's other project, Vivarium; ideas are fine.
    - Credit every open-source inspiration in the README's Credits section.

12. **Batch mode** (the one exception to rule 1). When I give a batch of units, build them in order without waiting between them.
    - After each unit: run its done-when checks, append to `LOG.md`, tick it in `PLAN.md`, and note its See it lines.
    - Stop immediately at the first `BLOCKED:` item or failed check, and report.
    - At the end of the batch: one report covering every unit, a combined See it walkthrough, and one git block.
    - The no-extras list in "How we build" still applies to every unit.

## Lab and dashboard UI

For Lab and dashboard UI, use the frontend-design skill. The Lab (`/lab`, `lab/index.html`) is a workbench: one consistent, restrained, readable look across panels; new panels reuse the CSS variables at the top of `lab/index.html`. The judges' pages are the home page (`/`, `demo/home.html`), the Oracle tab (`/oracle`, `demo/oracle.html`), the BTC pools tab (`/pools` and `/pools/:id`, `demo/pools.html`) and the Agents tab (`/agents`, `demo/agents.html`: the insurance desk in its "Live" mode and the BTC agent replay in its "Replay Nov 12–15" mode, `/agents#replay`; `/demo/agent` redirects there). On the Agents page one stage shows one agent: a map of the agent and the four platforms it calls (the Oracle on Arc, Circle Gateway, Gemini, the Protection book) with a labelled curved line to the one it is calling now (`drawMap`, from the stage's `calls`), then five steps, the active one in blue. From "Pick contract" the feed table becomes the contracts it compared with the chosen one marked (`drawDecision`), and once covered the chart becomes the cover picture (`drawCover`: the holding, the premium as a coin, the two outcomes). The "Order to Gemini" line and the Gemini node open the exact order (`showOrder`). The cover picture and the "Covered" box open why that amount, from the stage's `cover` (`showWhy`); for an MCP agent it says the choice was its own. A covered demo agent re-checks on each Stream post for its market (`desk.recheck`, step `recheck`). Steps arrive in bursts, so the page plays them one at a time, about 3 s each (`play`); keep new states inside `liveStage` or `replayStage`. The protocol demo has no page of its own: its replay runs inside BTC pools at `/pools/ours` ("Our pool on Arc: enforced onchain"). These pages share `demo/demo.css` and `demo/demo.js`. Buttons are one set, all at least 40px tall: `.primary` (filled blue, the one thing to do), `.how` (outlined, everything else) and `.seg` (a choice between a few, the chosen one blue); a label says what happens ("Back to live", "Back to all pools", "Play the week"). Their look comes from the mockups in `docs/design/` (`Main.dc.html`, `Agent.dc.html`; the old protocol mockup is in `docs/archive/`): copy layout, sizes and colours from them, ignore the `<x-dc>`, `{{hostClass}}` and `data-dc-script` parts, and bind every number to real data. The Oracle and BTC pools tabs have no mockup: they are designed in the same look.

Rules for all these pages:

1. One screen, no scrolling, at 1440×900 and 1920×1080. The layout is sized to `100vh`. Check that `document.documentElement.scrollHeight <= innerHeight` at both sizes. The one exception is the Oracle tab (`body.flowing`): it is a feed of about 100 rows and scrolls under a sticky header.
2. Never show the word "harm" on a page (it can stay in code). Label every probability with its event: "Chance " + the threat's `risk` text from `src/agent/threats.json` (for example "Chance BTC ends below $67,500 on Nov 30").
3. Holdings in dollars from the live spot price (the holding's `valueUsd`), the coin amount second.
4. Cover math only from `policy.ts` and the threat config: trigger, shock, needed = ceil(valueUsd × shock × hedgeRatio), payout = contracts × $1. Nothing hard-coded.
5. Normal states are grey. Orange and red only when a tier is crossed. Blue for live data.
6. No subheaders: a heading and its content, never a second line under a heading, no small label above a value, no caption under a panel title. A page's own explanation sits behind one small "How this works" button (`howToggle`), closed at first. Each card explains itself in one plain paragraph or one short sentence. The stand-in words (declared holding, paper trade, demo pool, read only) stay visible, inside those paragraphs or as chips.
7. The top tier is "No new borrowing" everywhere (`NO_NEW` in `demo/demo.js`), never "freeze" or "pause": the borrow cap is held at today's level; open loans, repayments, deposits and withdrawals carry on. Rule text: "85%+: no new borrowing beyond today's level."

The shared parts (tokens and classes at the top of `demo/demo.css`, functions at the top of `demo/demo.js`): the top bar with tabs and status (`topBar`), panels, cards, numbered badges, chips, the 0–100 rule bar (`ruleBar`), the two-bar picture (`bars`), event rows (`eventRow`: diamond = warning, triangle = critical, filled circle = data, outline circle = info, square = agent action), and the arrow whose blue dots run for about 2 s only when a real event passes (`runFlow`). The agent page and our pool's view also share the workflow diagram (`workflow`: numbered steps that light up one after another, each with its real call at the foot of the card) and the coin that shows a payment (`coin`), the one-line banner (`banner`), the events list (`events`), the replay clock and `bootDemo`, which draws whatever `GET /api/demo/<kind>` returns. Fonts: Barlow and Barlow Semi Condensed, tabular numbers. Motion is off under `prefers-reduced-motion`. After changing a page, retake its screenshots in `docs/screenshots/` at both sizes.

## Records

- **`LOG.md`**: after every change (each edit or step), append an entry under `## YYYY-MM-DD HH:MM · <unit id>`. At most 2–3 sentences: what you did, which files changed, and why. Append only.
- **`LESSONS.md`**: whenever something surprises you or costs time (an API quirk, wrong docs, a failed approach, a setup gotcha), add a short entry: what happened → the lesson → what to do next time.
- **`docs/tracks/`**: one requirements doc per track (`agentic-payments.md`, `arc.md`, `gemini.md`, `quicknode.md`) and the submission checklist (`README.md`). When a contract address, an endpoint or the Stream's filter changes, change it there too.
- **`PLAN.md`**: tick units as they finish. Log any change to the plan in `LOG.md`.

## Git

- **Remote:** `https://github.com/DhruPtel/UBC-2026-Probability-Oracle` (public), branch `main`.
- **Claude never commits or pushes.** The user does both.
- **At the end of each unit, give me exactly:** `git status`, `git add .`, `git commit -m "<one-line summary>"`, `git push`. Before that, check that `git status` lists no `.env`, keys or `logs/`.
- **Message:** one line, `<unit id>: <what works now>`. Example: `1.1: repo setup, Arc connection works`.

## End-of-unit report template

```
Unit: <id> <name>
Runs: <command> → <short output excerpt>
Stand-ins: <labels used, or "none">
Notes: <anything surprising, one or two lines>
Git: <git status check result>, then the add / commit / push commands
Next: <next unit id>, waiting for go
```

## Project facts

| | |
|---|---|
| Arc testnet | chain `5042002` (`0x4cef52`) · RPC `$ARC_RPC_URL`, which today is Arc's public `https://rpc.testnet.arc.io` (`rpc.testnet.arc.network` also answers). It rate-limits: too many calls in a short time get HTTP 429 `Request exceeds defined limit`, so keep per-request and per-refresh chain reads few · explorer `https://explorer.testnet.arc.io` · faucet `https://faucet.circle.com` |
| USDC on Arc | ERC-20 `0x3600000000000000000000000000000000000000`, **6 decimals**. Native gas is the same balance at **18 decimals**. Use the ERC-20 interface for app logic |
| Arc quirks | The public RPC allows at most 10,000 blocks per `getLogs` call. About 0.5 s blocks, no reorgs. `block.timestamp` can repeat (order by block number). `PREVRANDAO` = 0. viem has `arcTestnet` built in |
| Gemini | Public data at `https://api.gemini.com/v1/prediction-markets/...`, no key. Sandbox trading at `https://api.sandbox.gemini.com`. Take `instrumentSymbol` from the API. Prices 0.01–0.99 ≈ probability, $1 payout. Public calls ≤ 1/s. Responses are large: filter by category, keep `limit` small, never print raw JSON. Prices are at `contract.prices.bestBid` / `bestAsk` / `lastTradePrice` (strings, any can be missing). Volume is per event. History: `https://api.gemini.com/v2/candles/<instrumentSymbol>/<1hr|1day>`. Attribute: "Data provided by Gemini". Sandbox trading is signed REST with `account: "primary"`; sandbox markets and prices differ from production; keep order IDs as strings |
| x402 | Circle Gateway Nanopayments. Facilitator `https://gateway-api-testnet.circle.com`, network `eip155:5042002`. Packages `@circle-fin/x402-batching`, `@x402/core`, `@x402/evm`. The buyer must be an EOA. No Circle API key needed. Paid endpoint: `GET /odds/:symbol` at $0.001; it fetches Gemini live and publishes to OddsFeed if the value changed. A payment is accepted at once and settles onchain later in a batch |
| Streams | Costs 20 QuickNode API credits a block whatever the filter keeps: about 144,000 an hour. The top bar shows its state and last delivery, and opens a panel fed by `GET /api/stream` (what it watches, the last 10 deliveries with their delay). QuickNode, Arc testnet, Logs dataset, `function main(stream)` filter, webhook destination. The filter (`src/stream/filter.js`) hardcodes the contract and agent addresses (change them there after a redeploy) and returns typed events: `oddsUpdated`, `bigMove`, `protectionBought`, `walletChange`. QuickNode signs each delivery: `X-QN-Signature` is HMAC-SHA256 over `X-QN-Nonce` + `X-QN-Timestamp` + the body, keyed with the Stream's security token, which `stream:up` keeps in `logs/stream-token.txt` (never print it). The webhook answers 401 to anything unsigned or wrongly signed and records a `rejected` line in `logs/stream.jsonl`. A hand-made test delivery must name only `test:` symbols |
| Contracts | `OddsFeed` accepts posts only from its deployer (`publisher`) and only up to 10000 bps. `RiskSwitch` holds the feed's address and each pool holds the switch's, all immutable: replacing the feed means redeploying all of them, and a pool opts in with its tiers in its constructor. The first set (open to any sender, Nov 16 to 18) stays in `deployments/arc-testnet.json` under `…V1` keys; the server ignores posts in `logs/oracle.jsonl` older than the current feed's `deployedAt` |
| Risk switch | `RiskSwitch` turns OddsFeed odds into a level per opted-in protocol. `sync` is open to anyone on purpose (it only copies the feed). Four pools opted in with tiers 0 → 75%, 50% → 60%, 70% → 40%, 85% → no new borrowing (the contract's field is `paused`; `canBorrow` then answers "borrowing is paused", and the pages say "No new borrowing"): `DemoLendingPool` (`DEMO`, BTC market, side NO), `TestLendingPool` (`TEST`, `test:demo`, side YES), `ReplayLendingPool` (`REPLAY`, `replay:GEMI-BTC2611302200-HI67500`, side NO) and `ReplayEthPool` (`REPLAY`, `replay:GEMI-ETH2611302200-HI2000`, side NO, the protocol demo). The Lab server is the keeper: it calls `sync(pool)` on each Stream odds update for the pool's market |
| Live advisor | Reads Aave V4's Main Spoke on Arc mainnet (chain `5042`, `https://rpc.mainnet.arc.io`): the cirBTC reserve. Addresses from `aave-dao/aave-address-book`, `src/AaveV4Arc.sol`. V4 has one collateral factor, not an LTV plus a liquidation threshold. Read-only; never hardcode its values |
| Live updates | Every record is a line in `logs/*.jsonl`. The server watches `logs/` and pushes each new line on `GET /events` as `oracle`, `agent`, `payment`, `defi`, `stream`, `demo` or `desk`. New records must be appended to one of those files to show up live. Deployer transactions sent by the server go through `asDeployer` (`src/shared/chain.ts`), one at a time |
| BTC pools | The grid shows one chance (the server's BTC market, `view.chance`) with a "what if" slider; every card follows the slider. "Play the week" moves the slider through that market's real 7 days in about 20 s (`weekOf`), and a card rings when its tier changes. A pool's view (`/pools/:id`) has the same slider and a "Market this pool follows" dropdown, kept in the browser (`pools:follows2`): the same market as the grid (the default), automatic (the strike nearest 10% below today's BTC price among the markets that end last, `followable` in the server; an ended market leaves the feed, so automatic moves on), or any BTC market in the feed. Its chart fits the y-axis to the data and marks each tier change with a dot and its date (`drawHist`). A pool on another market says so on its grid card. `/pools` is read only: nothing is sent to any protocol. The same tiers become, per protocol: Aave V4 collateral factor 10 / 25 points lower / no new borrowing (the 25-point cut stays and the reserve's borrow cap is held at what is borrowed today); Aave V3 the same on the LTV, liquidation threshold untouched; Morpho (LLTV is immutable; only new lending is limited, never below what is supplied and borrowed now): hold the vault cap at today's supply / no new borrowing room beyond today's / the same at 85%. Nothing is frozen or paused: open loans, repayments, deposits and withdrawals carry on. Each pool carries a `ladder` (its suggested limit at every level), which the page's "what if" slider uses. `CUTS` is in `src/server/index.ts` |
| Caches | `cached(key, ttl, read)` in the server returns the last value at once and reads again in the background: advisor 60 s (also read every 60 s by a timer), `/api/oracle` 30 s, history 10 min, pools 60 s per source. A feed market's 7 days of hourly candles are kept on disk in `logs/candles/` and in memory (`weeks`, `weekOf`); one market is read again every 6 s, the oldest first, so `/api/feed/history` never waits for Gemini except for a market never seen. The posts per symbol are kept in memory (`posts`). The last run of each replay is kept in `logs/demo-last.json`, so its page shows it after a restart or the other replay. The pages also keep their last values in `localStorage` and draw them first |
| Live feed | The Lab server reads about 100 open Gemini contracts (categories Crypto, Economics, Economy, Finance; events closing within a day left out; per event the 10 contracts nearest 50%) every 60 s: `GET /api/feed`. It also posts them: the nine of `config/markets.json` stay on `npm run oracle`; the rest are posted by the server when a value has moved 0.5 points or more since its last post, and once an hour, but never more than `FEED_POSTS_PER_HOUR` (120) posts in any hour or two in a minute (`FEED_POSTS_PER_TICK`, largest moves first), and not while a replay runs. A thin market (no bid, no ask, or more than 10 points between them) is never posted, by the feed, the loop or the paid read; the Oracle tab shows "Too thin to post". "Stale" marks a posted value over 15 minutes old that Gemini has since moved half a point or more away from; the desk offers neither thin nor stale markets. So a running Lab spends deployer gas: up to about 0.13 USDC an hour (0.0011 a post, 0.0020 for a symbol's first post); with the loop's 0.11 the oracle stays near 0.24 |
| Oracle results | Each Oracle row carries a result for "Insurance agents" (the first threat's `trigger` in `src/agent/threats.json`) or "Lending pools" (the demo pool's tiers). Lending results exist only for price markets of an asset in `LENDING_ASSETS` (`src/server/index.ts`: BTC, ETH). `GET /api/feed?shown=N` also returns markets beyond the feed ("Load more", 25 at a time); those are read but never posted |
| Wallets | Two keys. `DEPLOYER_KEY`: deployer, oracle publisher, x402 seller, book owner, treasury. `AGENT_KEY`: the agent. Plus `DESK_SEED`: the agent desk's pool of four demo wallets is derived from it (`deskKey(index)` in `src/shared/chain.ts`) |
| Agent desk | `src/desk/`: `desk.ts` (sign up, check risks, list contracts, quote, buy, my cover, and the built-in demo agent), `cover.ts` (cover math through `policy.decide`, Gemini's taker fee), `desk.json` (pool size, top-up amounts, each asset's shock and trigger), `mcp.ts` (the MCP server; each tool is one call to `/api/desk/…`). Every step is a line in `logs/desk.jsonl`, pushed as `desk`. Agents share the four pool wallets in turn; the deployer tops a wallet up at sign-up and lends it the premium at a purchase. A desk read uses `/odds/:symbol?source=feed`: the feed's value, no extra Gemini call. The order is good-til-cancel: the sandbox cancels an immediate-or-cancel one unfilled. No budgets, max prices or approvals (Phase 11, planned) |

## Commands

These are added unit by unit. Keep this list current.

- `npm run typecheck`: TypeScript check, no emit.
- `npm test`: unit tests for core logic (Node's built-in runner through `tsx --test`).
- `npm run new-keys`: creates `.env` if missing and fills in empty wallet keys and the desk's seed. Prints addresses only.
- `npm run check:arc`: chain ID, latest block, and both wallets' USDC and native balances.
- `npm run deploy -- <Name> [constructor args…] [--as <Key>]`: builds the contracts, deploys `<Name>` to Arc testnet and records it in `deployments/arc-testnet.json`. An argument written `@Other` becomes that contract's recorded address; `--as` records a second copy under another key. Example: `npm run deploy -- RiskSwitch @OddsFeed`.
- `npm run hello -- <text>`: sends `Hello.ping(text)` and reads the message back.
- `npm run feed [symbols…]`: reads OddsFeed for our markets. `npm run feed -- publish <test:symbol> <percent>` publishes a manual test value.
- `npm run oracle -- --once`: publishes each configured market's live Gemini YES probability to OddsFeed once (nine markets in `config/markets.json`; a round costs about 0.013 USDC of deployer gas). `npm run oracle` loops every `ORACLE_INTERVAL_S` seconds (default 300). Stop the loop when it isn't needed; it spends gas. It can run during a replay: every deployer send, in any process, waits for the lock `logs/deployer.lock` (`asDeployer`).
- `npm run gateway:deposit -- <usdc>`: deposits USDC from the agent's wallet into Circle Gateway (needed once before paid reads).
- `npm run pay-read -- <symbol>`: pays $0.001 as the agent for one odds read from the running Lab server.
- `npm run stream:up`: tests the filter, then creates the QuickNode Stream that sends decoded events (odds updates, big moves, protection buys, the agent's USDC transfers) to `STREAM_WEBHOOK_URL/stream`. While it is up, a big move on a watched symbol or a change to the agent's wallet starts an agent run inside the Lab server. Needs the Lab running and `cloudflared tunnel --url http://localhost:8788`.
- `npm run stream:down`: deletes that Stream and lists what is left on the account. Always run it afterwards; the Stream bills per block.
- `npm run stream:demo`: the Stream for a demo in one command. Starts its own cloudflared tunnel to port 8788, passes the tunnel's address to `stream:up` for this run only (`.env` is not changed), prints "Stream on, press Ctrl+C to stop", and on Ctrl+C, or if the tunnel dies, runs `stream:down` and stops the tunnel. Needs the Lab running. Refuses to start while a Stream is up.
- `npm run gemini:order -- list | buy <symbol> <yes|no> <price> | status <orderId> | positions`: Gemini **sandbox** prediction-market orders (test funds). The sandbox host is hardcoded in `src/agent/trade.ts`.
- `npm run agent -- --once`: one agent cycle. Needs the Lab running, because each threat's odds come through the paid read ($0.001 each, which also refreshes the feed). For each threat it decides and, when cover is needed, pays the USDC premium onchain through ProtectionBook and records a `PAPER TRADE` fill in `logs/paper.jsonl`. `npm run agent` loops every `AGENT_INTERVAL_S` seconds (default 300). It spends the agent's testnet USDC.
- `npm run agent:dry`: prints the agent's holding and its decision for each threat. Reads only; places no orders.
- `forge build --root contracts`: compile the contracts.
- `forge test --root contracts`: contract tests.
- `npm run lab`: starts the server at `http://localhost:8787` (this machine only; while it runs it also posts the live feed's markets to OddsFeed, up to about 0.13 USDC of deployer gas an hour): the home page at `/`, the Oracle tab at `/oracle`, the BTC pools tab at `/pools` (our pool's replay at `/pools/ours`), the Agents tab at `/agents` (the desk; the agent replay at `/agents#replay`), the Lab at `/lab`. All update over `GET /events` (SSE). The same process listens on `http://localhost:8788/stream` for the Stream webhook. Ctrl+C stops it.
- `npm run demo`: a demo in one terminal. Starts the Lab (or uses the one already running) and `stream:demo`; Ctrl+C stops both and leaves 0 Streams. The Lab it starts is plain `npm run lab`, not the watcher: restart it after a server change.
- `npm run replay -- agent | protocol`: starts a demo replay on the running Lab server and prints it (the same run as "Start replay" on `/agents#replay` or "Run the replay" on `/pools/ours`; default `agent`). `REPLAY` of real Gemini hourly odds, about 30 seconds and 8 posts, under a `replay:` symbol: the first and last change, the first one inside each tier, and others spread between. `agent`: BTC, Nov 12–15; costs about 2.03 testnet USDC (a 2 USDC premium that goes to the deployer, eight $0.001 reads, gas); before the run the deployer tops the agent's wallet up to the premium it may need plus 0.5 USDC. `protocol`: ETH, Nov 9–15; costs about 0.021 USDC of deployer gas. With a Stream up the triggers come through it; without one the server triggers the agent and the pool directly. One demo at a time.
- `npm run preflight`: seven PASS or FAIL lines before a demo: the Arc RPC, Gemini, code at every deployed address, the deployer's and the agent's USDC, 0 Streams up, the Lab and its feed. Reads only; exits 1 on a FAIL.
- `npm run demo:reset`: before a demo. Moves the desk's log to `logs/desk-<time>.jsonl` (through `POST /api/desk/reset` when the Lab runs, so the Agents page empties without a restart), tops the agent up to 3 USDC and each desk wallet to `walletTopUpUsdc` from the deployer, counts the Streams, prints the balances.
- `npm run desk:mcp`: the agent desk's MCP server on stdio (tools `sign_up`, `check_risks`, `list_contracts`, `quote_cover`, `buy_cover`, `my_cover`). Needs the Lab running. An MCP client starts it itself: `claude mcp add hedgehog-desk -- <repo>/node_modules/.bin/tsx <repo>/src/desk/mcp.ts` (the Agents page shows the line with this machine's paths).
- `/agents` (a route): the agent insurance desk. `GET /api/desk` is its data; `POST /api/desk/sign-up`, `/api/desk/agents/:id/check-risks | contracts | quote | buy | cover` are the desk's steps, `/next` and `/run` drive the built-in demo agent, `GET /api/desk/order/:quoteId` is one order (ticket and sandbox status), `GET /api/desk/wallets` the pool's balances. A sign-up or a purchase spends a little deployer gas; premiums return to the deployer.
- `npm run fund:agent -- <usdc>`: sends testnet USDC from the deployer (it receives the premiums) to the agent, instead of using the faucet. It waits its turn behind other deployer sends.
- `GET /api/history?symbol=<market symbol>` (a route, not a command): the last 7 days of Gemini's hourly closes for a market in `config/markets.json`, each as the chance of its bad outcome. Cached for 10 minutes. The home page and the Oracle tab use it.
- `/pools/:id` (a route): one pool's view, linkable; `ours` is our demo pool with the protocol replay.
- `GET /api/feed` (a route): the Oracle tab's data: every feed market with Gemini's bid, ask and middle, our output (the chance of the bad outcome where one is clear, else the chance of YES) and its last post on Arc. `GET /api/feed/history?symbol=` gives one market's 7 days: Gemini's hourly YES and every value we posted.
- `GET /api/pools/history?symbol=<the pools' market>` (a route): the pool view's "Since the market opened" line. Of the month's BTC "$X or above" contracts, the one whose first daily close was nearest 50%, then its hourly closes as the chance BTC ends below X. One Gemini call per contract (about 15 s the first time), cached for an hour. One month only: Gemini has no earlier monthly BTC market.
- `GET /api/pools` (a route): the BTC pools tab's data, read only. Aave V4 from the advisor's onchain read, Aave V3 from `api.v3.aave.com`, Morpho from `api.morpho.org`; each source cached 60 s, and a source that fails shows on its own cards only.
- `npm run lab:dev`: the same Lab under `tsx watch`, so it restarts itself whenever server code changes (edit in place: `sed -i` replaces the file and the watcher stops noticing). The user runs this one. Only ask for a restart if `lab:dev` isn't running (`pgrep -af "tsx watch"`). Page changes (`lab/index.html`) need only a browser reload.

## Network access the build needs

`api.gemini.com`, `api.sandbox.gemini.com`, `ws.gemini.com`, `ws.sandbox.gemini.com`, the Arc RPC hosts above, `rpc.mainnet.arc.io` (read-only, for the live advisor), `api.quicknode.com`, `api.morpho.org` and `api.v3.aave.com` (read-only, for the BTC pools tab), `*.trycloudflare.com` (the tunnel of `stream:demo`), `gateway-api-testnet.circle.com`, `registry.npmjs.org`, `binaries.soliditylang.org`, and Foundry install hosts.

If a host is refused, report it with `BLOCKED:`. Don't route around it.
