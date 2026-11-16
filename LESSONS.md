# LESSONS

Things that surprised us or cost time: API quirks, docs that were wrong, approaches that
failed, setup gotchas. One short entry each: **what happened → the lesson → what to do next
time.** Read this at the start of every session. Newest at the bottom.

## 2026-11-16 · Gemini event lists are huge

- **What happened:** `GET /v1/prediction-markets/events?status=active&limit=3` returned 1.3 MB. Events nest sub-events (26 under one NFL game), and every contract carries a long rules text. Piping it to `head` made curl fail with error 23.
- **Lesson:** `limit` counts top-level events, not bytes.
- **Next time:** save the response to a file in the scratchpad and summarize it with a few lines of `node`. Filter by category, keep `limit` small, and never print raw JSON.

## 2026-11-16 · The list response has no `priceHistory`

- **What happened:** the Nov 15 research said contracts carry a `priceHistory` array. None of the contracts in the list response has that field.
- **Lesson:** a field named in the docs isn't proven until we've seen it in a response.
- **Next time:** unit 2.1 checks the single-event endpoint before 8.1 relies on it. The fallback is to replay the odds our own oracle records in `logs/odds.jsonl`.

## 2026-11-16 · Gemini price fields are strings, and some are missing

- **What happened:** prices sit at `contract.prices` as strings (`bestBid`, `bestAsk`, `lastTradePrice`). Player-prop contracts had no `lastTradePrice` at all. `quantityMinimum` is `0.01` on some markets and `1` on others.
- **Lesson:** treat every price field as optional.
- **Next time:** the odds rule is mid → last trade → no publish. Parse with `Number()` and check the result.

## 2026-11-16 · The plan was written in a sandbox that couldn't reach the network

- **What happened:** PLAN.md listed "where we build" as a blocker, because the cloud workspace refused Gemini and Arc. From the user's machine (WSL2) every host answers, including the older `rpc.testnet.arc.network`.
- **Lesson:** blockers found in one environment may not exist in another.
- **Next time:** re-run the cheap checks first when the environment changes.

## 2026-11-16 · Windows downloads leave `:Zone.Identifier` files in WSL

- **What happened:** `git status` shows three untracked `*:Zone.Identifier` files next to the downloaded docs.
- **Lesson:** `git add .` would have committed them.
- **Next time:** nothing to do. The files are deleted and `.gitignore` covers `*:Zone.Identifier` (unit 1.1), so `git add .` is the flow.

## 2026-11-16 · TypeScript 7 doesn't load `@types/node` on its own

- **What happened:** `npm install -D typescript` brought in TypeScript 7.0.2. With the tsconfig as planned, `tsc` failed with "Cannot find name 'process'" and "Cannot find name 'node:fs'", even though `@types/node` was installed.
- **Lesson:** since TypeScript 6, `types` defaults to an empty list, so `@types/*` packages are no longer picked up automatically.
- **Next time:** list them in `tsconfig.json`: `"types": ["node"]`. Any later `@types/*` package (for example `@types/express` in 1.3) only needs adding there if it declares globals; normal imports work without it.

## 2026-11-16 · Both explorer hosts work; the old one redirects

- **What happened:** `https://explorer.testnet.arc.io/address/<address>` returns HTTP 200. `https://testnet.arcscan.app/address/<address>` redirects to the same `explorer.testnet.arc.io` page.
- **Lesson:** `explorer.testnet.arc.io` is the current host.
- **Next time:** keep `EXPLORER = "https://explorer.testnet.arc.io"`.

## 2026-11-16 · Stock Foundry works on Arc; `arc-forge` isn't needed

- **What happened:** Arc's docs use `arc-forge` and `arc-cast`. Stock `forge` 1.8.3 built, and stock `forge verify-contract` verified Hello on the first try, with the default EVM version (the explorer reports `prague`).
- **Lesson:** we don't need to install Arc Foundry for building, deploying through viem, or verifying.
- **Next time:** reuse the verify command in PLAN.md unit 1.2. Add `--watch`; verification sat "Pending in queue" for about 20 seconds before passing.

## 2026-11-16 · The explorer has a JSON API for checks

- **What happened:** the explorer is Blockscout, so `https://explorer.testnet.arc.io/api/v2/smart-contracts/<address>` returns `is_verified`, and `/api/v2/transactions/<hash>/logs` returns decoded events.
- **Lesson:** I can confirm what the user will see on an explorer page without a browser.
- **Next time:** use these two endpoints for "See it" checks on contracts and events.

## 2026-11-16 · `pkill -f` on a script name can kill the shell that runs it

- **What happened:** I stopped the Lab with `pkill -f "tsx src/server/index.ts"` inside a longer command. The pattern also matched that command's own shell, so the shell died (exit 144) before the last checks ran. The server did stop.
- **Lesson:** `pkill -f` matches every command line that contains the pattern, including the one calling it.
- **Next time:** stop a test server in a command of its own, or kill the PID that owns the port (`ss -ltnp` shows it).

## 2026-11-16 · Gemini's real field names (unit 2.1)

- **What happened:** saved raw samples to `logs/` and read the shapes. The names we use:
  - **Event:** `ticker`, `title`, `category`, `type` (`binary` or `categorical`), `expiryDate`, `volume` and `volume24h` (strings), `contracts`.
  - **Contract:** `instrumentSymbol`, `label`, `marketState`, `expiryDate`, and `prices` = `{ bestBid, bestAsk, lastTradePrice, buy: { yes, no }, sell: { yes, no } }`, all strings.
  - **List:** `{ data: [event], pagination: { limit, offset, total } }`. **Single event:** the event object itself, with no `data` wrapper. **Categories:** `{ categories: [string] }`.
- **Where this differs from PLAN.md:** there is no `priceHistory`. There is no per-contract volume; volume is per event. "YES bid / ask / last" are `prices.bestBid`, `prices.bestAsk` and `prices.lastTradePrice`.
- **Next time:** of 135 Economics contracts, 45 had no usable price at all and 46 had only a last trade. Expect `"none"` and `"last"` often, and pick demo markets with a real two-sided book.

## 2026-11-16 · Price history lives on the candles endpoint, not the events API

- **What happened:** neither the list nor the single-event response has history. `GET https://api.gemini.com/v2/candles/<instrumentSymbol>/1hr` (and `/1day`) returns `[timeMs, open, high, low, close, volume]` rows, newest first, back to the contract's first trade: 911 hourly candles since Oct 9 for `GEMI-FED261211-HIKE25`. `GET /v1/trades/<instrumentSymbol>`, `/v1/pubticker/<symbol>` (per-contract volume) and `/v1/book/<symbol>` also work. Guessed paths under `/v1/prediction-markets/` return 404.
- **Lesson:** a prediction-market `instrumentSymbol` works on Gemini's ordinary spot market-data endpoints.
- **Next time:** 8.1 replays real hourly candles. A contract only has candles from its listing date, so short-dated markets have short histories.

## 2026-11-16 · Category values and what Gemini lists

- **What happened:** the category filter takes the capitalized names from `/categories` (`Economics`, `Crypto`). `Economy` and `Finance` are listed but empty. There is no January 2027 Fed event; the only Fed market is December (`FED261211`), with "Hike 25bps" near 88%. Crypto is mostly 5- and 15-minute markets with zero volume; the useful ones are the dated price thresholds, which sit past the first 50 events.
- **Lesson:** BTC and ETH thresholds are "$X or above" contracts, so for someone holding the coin the harmful outcome is NO.
- **Next time:** the plan's "YES hurts" assumption only fits the Fed market. `harmfulOutcome` has to allow `"NO"`.

## 2026-11-16 · Express 5 doesn't crash when the port is taken

- **What happened:** a Lab was already running on 8787 (started by the user). My second `npm run lab` printed "Lab running at http://localhost:8787" and exited quietly, so my curls hit the old server and the new routes returned 404.
- **Lesson:** Express 5 passes the listen error to the callback instead of throwing.
- **Next time:** the callback now rethrows it, so a taken port fails loudly with `EADDRINUSE`. To test while the user's Lab is running, start a second copy with `PORT=8799` and never stop theirs.

## 2026-11-16 · Which markets we picked, and why the feed stays YES-only

- **What happened:** the live picks are `GEMI-BTC2611302200-HI65000` (YES near 51%, tight 0.51 / 0.52 book, harm = NO) and `GEMI-FED261211-HIKE25` (YES near 88%, wide 0.86 / 0.91 book, harm = YES). The replay source is `GEMI-BTC2611302200-HI67500`, whose YES fell from 0.88 to 0.39 between Nov 12 and Nov 15.
- **Lesson:** "the event that hurts us" is not always the YES side. Flipping inside the oracle would make the feed depend on one reader's portfolio.
- **Next time:** the oracle publishes YES exactly as `odds.ts` computes it. The agent reads `harmfulOutcome` from `config/markets.json` and uses YES, or 1 − YES. Both BTC picks expire Nov 30 and the Fed one Dec 11, so all three outlive the Nov 20 deadline.

## 2026-11-16 · forge-std vendors cleanly with `--no-git`

- **What happened:** `forge install foundry-rs/forge-std --no-git`, run from `contracts/`, left plain files in `contracts/lib/forge-std` (1.4 MB) with no `.git` folder and no submodule entry. Forge found `forge-std/Test.sol` without a remapping.
- **Lesson:** vendoring works inside a subfolder of our repo and needs nothing in `foundry.toml`.
- **Next time:** it is committed, so nobody runs `forge install` again. The first `forge test` compiles 21 files; later runs are cached.

## 2026-11-16 · The public Arc RPC caps getLogs at 10,000 blocks

- **What happened:** `eth_getLogs` over more than 10,000 blocks (a block difference of 10,000 or more) returns `-32012 requested range too large`. A difference of 9,999 works. Several quick calls in a row also hit `-32005 rate limit exceeded`.
- **Lesson:** at about 2 blocks a second, 10,000 blocks is only about 83 minutes, so "all events since deploy" costs about 17 calls per day elapsed.
- **Next time:** read in 10,000-block chunks and remember the last scanned block (the Lab server does this in memory). If the first scan gets slow later in the week, a QuickNode `ARC_RPC_URL` may allow bigger ranges; check before relying on it.

## 2026-11-16 · Gemini's candle close is the last trade, not the mid

- **What happened:** for the Fed hike contract the hourly candle close is 0.85 while the bid and ask are 0.86 and 0.91, so our published value (the mid, 88.5%) sits above the candle line on the chart.
- **Lesson:** candles and our oracle value measure different things on a wide book.
- **Next time:** the chart legend says "hourly close (last trade)". Expect a visible gap on thin markets; it is not a bug. The 8.1 replay uses candle closes, so replayed values are last trades.

## 2026-11-16 · A publish costs about 0.001 USDC, less than estimated

- **What happened:** the first publish for a market cost about 0.0024 USDC; later ones about 0.0011.
- **Lesson:** two markets every 5 minutes is about 0.6 USDC a day, not 0.9.
- **Next time:** the deployer's 20 USDC covers the week with the loop running, but still stop the loop when nobody is watching.

## 2026-11-16 · I can screenshot the Lab with the Playwright Chromium already on this machine

- **What happened:** `~/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome --headless=new --no-sandbox --window-size=1200,2600 --virtual-time-budget=15000 --screenshot=<file> http://localhost:8799/` produced a full-page image I could read.
- **Lesson:** I don't have to ship Lab changes unseen.
- **Next time:** take a screenshot after every Lab change, against a test copy on port 8799.

## 2026-11-16 · Gateway Nanopayments on Arc testnet needs no API key

- **What happened:** the buyer quickstart has two tabs. The first ("Circle Wallets") needs a Circle API key and an entity secret. The second ("Self-managed") is just `new GatewayClient({ chain: "arcTestnet", privateKey })` with `deposit()`, `pay()` and `getBalances()`, and needs no account. The seller middleware needs none either.
- **Lesson:** read past the first tab; the simple path is the second one.
- **Next time:** stay on the self-managed path. `GatewayClient` also takes `rpcUrl`, so it follows `ARC_RPC_URL`.

## 2026-11-16 · A paid read is "settled" with Gateway long before anything is onchain

- **What happened:** the middleware's settle step returns at once with a transfer id (a UUID such as `ec909ce1-…`), and `req.payment.transaction` holds that id, not a tx hash. `getTransferById(id)` showed `status: "received"` and `txHash: null` minutes later, and the seller's Gateway balance was still 0. Circle's docs say batches settle "often several minutes" later.
- **Lesson:** a single read never appears as its own onchain transfer. What is onchain is the buyer's deposit and, later, Gateway's batch transaction.
- **Next time:** show the per-payment status from `getTransferById` (the Payments panel does, for the 5 newest). For the Stream in 3.2 and 5.2, watch the deposit and the batch settlement, not individual reads. Don't promise the seller's balance moves right away.

## 2026-11-16 · The middleware charges before the handler runs

- **What happened:** `gateway.require()` answers 402 for any path it guards, so an unknown symbol would have asked for payment and then returned 404 after the buyer paid.
- **Lesson:** anything that can be rejected for free must be checked before the payment middleware.
- **Next time:** the route is `known-symbol check → gateway.require → handler`. If Gemini fails inside the handler the buyer has still paid; that is accepted for now and worth a line in the README's limits.

## 2026-11-16 · QuickNode Streams REST API, as used in unit 3.2

- **What happened:** read the docs, then confirmed each point with real calls.
  - **Base and auth:** `https://api.quicknode.com/streams/rest/v1/streams`, header `x-api-key`.
  - **Endpoints:** create `POST /streams` · test filter `POST /streams/test_filter` (`{ network, dataset, filter_function, block }`, block as a string; answers 201 with `{ result, logs }`) · get `GET /streams/{id}` · list `GET /streams?limit=&offset=` (`{ data, pageInfo }`) · delete `DELETE /streams/{id}` (answers 200).
  - **Create body:** `name`, `network`, `dataset`, `region` (`usa_east`), `dataset_batch_size`, `elastic_batch_enabled`, `destination` (`webhook`), `destination_attributes` (`url`, `compression`, `max_retry`, `retry_interval_sec`, `post_timeout_sec`), `status` (`active`), and optional `filter_function` (base64 JavaScript), `start_range`, `end_range` (omit to run continuously).
  - **Arc testnet is `arc-testnet`; the logs dataset is `logs`.**
  - **Filter input:** `stream.data` is nested blocks → transactions → logs, and `stream.metadata` has the batch range, network and stream id. Each log has `address`, `topics`, `data`, `blockNumber`, `blockTimestamp` (hex seconds), `transactionHash`, `logIndex`.
  - **Webhook payload:** exactly what the filter returns. Ours is a flat JSON array of logs. Returning `null` means no delivery.
- **Lesson:** Arc has sub-second blocks, so a stream that follows the tip needs `dataset_batch_size` of at least 5. With `elastic_batch_enabled` it still delivers at once.
- **Next time:** the create response includes a generated `security_token`; never print the whole response. 5.2 can read `blockTimestamp` straight from each log.

## 2026-11-16 · QuickNode's webhook deliveries carry no Content-Type header

- **What happened:** the first live run delivered three payloads, but `express.json()` skipped them and each line was saved without a body. The docs say deliveries are `application/json`; the recorded header was missing entirely. It cost one extra stream run and one extra Lab restart.
- **Lesson:** `express.json()` only parses when the Content-Type matches. A webhook from a third party should not depend on that header.
- **Next time:** the webhook uses `express.text({ type: () => true })` and parses the JSON itself. When a webhook first goes live, save the raw request before trusting a parser.

## 2026-11-16 · Stream deliveries reach us 0.5 to 5.5 seconds after the block

- **What happened:** measured as received time minus `blockTimestamp`, through a cloudflared quick tunnel: 5.5 s, 1.7 s and 0.5 s. The first delivery after creating a stream was the slowest.
- **Lesson:** "within seconds" holds, but it is not instant right after startup.
- **Next time:** start the stream a little before the demo moment. The quick tunnel's URL changes each time cloudflared restarts, so `STREAM_WEBHOOK_URL` must be updated and the stream recreated. The Lab must be restarted after any change to the webhook code, and I can't restart the user's Lab myself.
