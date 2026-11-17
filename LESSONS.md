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

## 2026-11-16 · The Gemini SDK can't trade prediction markets with a master API key

- **What happened:** with `@gemini-markets/sdk` 0.1.1, `createClient({ env: "sandbox", auth: new HmacAuth(...) })` first failed with `InvalidNonce` until `nonceMode: "time-based"` was set. Balances then worked, but every prediction-market call failed with `MissingAccounts` ("Expected a JSON payload with accounts"). `POST /v1/account/list` showed one account, `primary`, so the key is a master key, not account-scoped. The SDK's prediction-market methods have no account option.
- **Lesson:** the working path is signed REST on `https://api.sandbox.gemini.com`: HMAC-SHA384 over the base64 payload, payload in `X-GEMINI-PAYLOAD`, empty body, nonce = time in seconds, and `account: "primary"` in the payload. The SDK was removed, so there is no new dependency.
- **Next time:** an account-scoped key would not need the `account` field and could use the SDK. Not worth changing now. The SDK README's example calls `acceptTerms()` automatically; we never do.

## 2026-11-16 · Gemini order IDs don't fit in a JavaScript number

- **What happened:** the first two orders printed IDs ending `…000860` and `…000900`. The real IDs were `…000856` and `…000887`: `JSON.parse` had rounded the 18-digit integers, so a status lookup by the printed ID would never match.
- **Lesson:** `orderId` is an int64. Rounded IDs look plausible and fail silently.
- **Next time:** `trade.ts` quotes `"orderId"` in the response text before parsing, so IDs are strings everywhere. 4.2 must store them as strings in `logs/agent.jsonl` and in `orderRef`.

## 2026-11-16 · The sandbox doesn't have our markets, and its books are thin

- **What happened:** the sandbox listed 97 events, all crypto and commodities, with no Fed or Economics event. `GEMI-BTC2611302200-HI65000` and `GEMI-FED261211-HIKE25` don't exist there; the Nov 30 BTC event starts at the $67,500 strike. Only 33 contracts had both buy prices, and all but one of those expired the same afternoon. `GEMI-BTC2611302200-HI67500` had bot YES bids at 0.01 and 0.02 and no asks, so its "buy YES 0.32" was not a fillable price.
- **Lesson:** `prices.buy.yes` and `prices.buy.no` are not always backed by an order. `GET /v1/book/<symbol>` shows what can actually fill. A NO buy at price p matches YES bids at 1 − p.
- **Next time:** for a guaranteed fill in a demo, use a same-day hourly contract (they have two-sided bot books). Phase 4 uses a labeled `SANDBOX STAND-IN` for BTC and needs a decision for the Fed market (see PLAN.md 4.2).

## 2026-11-16 · Gemini cancels an order that would trade against our own

- **What happened:** with a YES buy resting at 0.32, a NO buy at 0.98 on the same contract came back `cancelled` at once with nothing filled. Buying NO at 0.98 is selling YES at 0.02, which crosses our own bid.
- **Lesson:** an agent that hedges both sides of one contract will cancel itself.
- **Next time:** never rest opposite orders on one contract. Treat a `cancelled` status in the order response as a failed hedge, not a success. `clientOrderId` is echoed back, so 4.2 can use it to tie an order to its `orderRef`.

## 2026-11-16 · `ceil()` on a float product can add a contract

- **What happened:** `130 × 0.1` is `13.000000000000002` in JavaScript, so a plain `Math.ceil` would buy 14 contracts where 13 cover the loss.
- **Lesson:** money math that rounds up needs the float noise removed first.
- **Next time:** `decide()` rounds the product to 6 decimal places before `ceil`, and a test pins the 130 × 0.1 case. Do the same for any budget math in Phase 7.

## 2026-11-16 · A single Gemini call can fail with a 503

- **What happened:** the first `npm run agent:dry` died on `Gemini returned 503` for the Fed event. The same URL answered 200 seconds later.
- **Lesson:** with no retries (by the rules, until Phase 7), one transient error fails the whole agent view, and the Agent panel shows an error until its next 30-second refresh.
- **Next time:** rerun. If it shows up during the demo, this is the first place a single retry would earn its keep; raise it before adding one.

## 2026-11-16 · The agent view needs three Gemini calls, not two

- **What happened:** the two threats sit in different Gemini events (BTC and Fed), and the events API has no way to fetch two events in one call. With the BTC spot ticker that makes three calls, spaced 1 second apart, so `GET /api/agent` takes 2 to 3 seconds.
- **Lesson:** one call per event is the floor.
- **Next time:** keep the Agent panel on its 30-second timer. If more threats are added in other events, the route gets slower by a second each.

## 2026-11-16 · A protection buy costs about 0.0033 USDC in gas

- **What happened:** two buys (four transactions: two `approve`, two `buyProtection`) cost the agent 0.006606 USDC in gas on top of 8.55 USDC of premiums.
- **Lesson:** gas is negligible next to the premium; the premiums are what drain faucet USDC. One full cycle at current prices costs about 8.55 of the agent's balance.
- **Next time:** the premiums land in the deployer's wallet (the treasury), so nothing is lost overall. Before a demo run, check the agent has at least 9 USDC, or send some back from the deployer.

## 2026-11-16 · Coverage lives in `logs/paper.jsonl`, not onchain

- **What happened:** the agent decides "already covered" from the paper fills file. Moving the file aside makes it buy again, while `ProtectionBook.purchases` keeps counting up.
- **Lesson:** that is handy for replaying the demo, but the file and the chain can disagree.
- **Next time:** to reset for a demo, move `logs/paper.jsonl` aside (don't edit it). If the agent crashes between `buyProtection` and the paper fill, the premium is paid but not recorded; check `logs/agent.jsonl` for a `buyProtection` step with no `paper fill` after it.

## 2026-11-16 · `vm.etch` puts a mock token at a fixed address

- **What happened:** `ProtectionBook` hardcodes Arc's USDC address. In the Foundry test, `vm.etch(USDC, address(new MockUSDC()).code)` placed a mock there; its storage starts empty, so the test mints after etching.
- **Lesson:** a hardcoded token address needs no constructor argument to be testable.
- **Next time:** reuse the same mock for the budget tests in Phase 7.

## 2026-11-16 · A USDC transfer on Arc emits two Transfer logs

- **What happened:** the receipt of a `buyProtection` holds two `Transfer` logs for one movement of USDC: one from the ERC-20 address `0x3600…0000` with the amount in 6 decimals, and one from `0xffff…fffe` with the same amount in 18 decimals (the native side of the same balance). Gas fees leave no Transfer log.
- **Lesson:** a filter that matches the Transfer topic alone would report every wallet change twice, with two different amounts.
- **Next time:** match the Transfer topic **and** the address `0x3600…0000`. `src/stream/filter.js` does.

## 2026-11-16 · The test-filter endpoint replays any past block

- **What happened:** `POST /streams/test_filter` with a block number ran the new filter on real history: the block of a protection buy, of an ordinary publish, and of a market's first publish (0% → 33%, a big move). All four event types were checked with no stream running and no tunnel.
- **Lesson:** a filter change can be proven against old blocks for free. Posting that result to the local webhook then exercises the rest of the path.
- **Next time:** test every filter change this way first, and bring the Stream up only for the final live check. Modern JavaScript (spread, arrow functions) runs in the filter; we still decode the ABI by hand and avoid `Buffer` and `BigInt`.

## 2026-11-16 · The cloudflared quick tunnel outlived the session

- **What happened:** the tunnel started at 11:16 for unit 3.2 was still running five hours later, and `STREAM_WEBHOOK_URL` still reached port 8788.
- **Lesson:** the URL only changes when cloudflared restarts. It is not stale just because time passed.
- **Next time:** check with `pgrep -af cloudflared` and a plain GET to `<url>/stream` (a 404 from Express means the tunnel is alive) before asking for a new tunnel.

## 2026-11-16 · The oracle loop and a paid read can race

- **What happened:** with `npm run oracle` looping in another terminal, the feed's round moved from 7 to 8 between two agent runs. Nothing failed, but the agent's onchain check compares the round right after its paid read.
- **Lesson:** a heartbeat publish that lands between the paid read and the check makes that threat end with an error for one run. Two deployer transactions in the same second can also collide on the nonce.
- **Next time:** accept it until Phase 8. If it shows up during the demo, stop the oracle loop while the agent runs; paid reads keep the feed fresh on their own.

## 2026-11-16 · Scratch scripts outside the repo can't import our packages

- **What happened:** a one-off test script in the scratchpad failed with "Cannot find package 'viem'" while the Stream was already up, and a `stream:down` chained after it ran anyway, so the Stream had to be created a second time.
- **Lesson:** Node resolves packages from the script's own folder, not from the directory it is run in. Importing our own files by absolute path works; importing `viem` or `dotenv` by name doesn't.
- **Next time:** run every helper script once before the Stream goes up. Import packages through `/home/…/UBC/node_modules/<pkg>/…`, or get them through `src/shared/chain.ts`.

## 2026-11-16 · Aave V4 is live on Arc mainnet and readable from the public RPC

- **What happened:** for unit 6.4, a search found Aave V4 live on Arc with a cirBTC reserve but no addresses. Aave's official address book has them: `https://github.com/aave-dao/aave-address-book/blob/main/src/AaveV4Arc.sol` (the old `bgd-labs/aave-address-book` repo redirects there). The interfaces are in `https://github.com/aave/aave-v4`, `src/spoke/interfaces/ISpoke.sol` and `src/hub/interfaces/IHub.sol`. Arc's docs (`https://docs.arc.io/integrate/connect-to-arc.md`) give the mainnet RPC `https://rpc.mainnet.arc.io`, chain 5042, explorer `https://explorer.arc.io`. Plain `cast call`s to the Main Spoke `0xB843bdC3a87A05E77E07Df9FE48928b3A34b134d` answered with no key.
- **Lesson:** V4 is hub-and-spoke and has no LTV and liquidation threshold pair. A reserve has one `collateralFactor` in `getDynamicReserveConfig(reserveId, dynamicConfigKey)` (take the key from `getReserve`), flags in `getReserveConfig` (paused, frozen, borrowable), and its caps on the Hub: `getSpokeConfig(assetId, spoke)` → `addCap` and `drawCap` in whole tokens, where `MAX_ALLOWED_SPOKE_CAP` means no cap. `maxLiquidationBonus` 10722 means a 7.22% bonus.
- **Next time:** the read values (78% collateral factor, 7.22%, caps 1,600 and 220) matched the governance proposal, a useful cross-check. News articles and third-party "address" pages were wrong or incomplete; only the address book and the chain were used. viem's `parseAbi` takes the structs as human-readable strings, so no ABI file is needed.

## 2026-11-16 · Cutting a deploy's output hid whether it deployed

- **What happened:** `npm run deploy … | head -2` showed only forge's lint warnings. No address was recorded, and I couldn't tell whether a transaction had been sent. The second run, with the full output, deployed normally.
- **Lesson:** forge prints lint notes before our script prints anything, so the first lines of a deploy are never the useful ones.
- **Next time:** read the end of a deploy's output (`tail`), and check `deployments/arc-testnet.json` right after.

## 2026-11-16 · Two deployer transactions in the same instant collide on the nonce

- **What happened:** the first demo replay published a value and synced a pool within the same second, both from the deployer key. One failed with "Transaction creation failed.": both had read the same nonce.
- **Lesson:** viem reads the nonce when it sends. Anything in one process that sends from one key every few seconds needs to send one at a time.
- **Next time:** server code that sends as the deployer goes through `asDeployer` in `src/shared/chain.ts`. A second process on the same key (`npm run oracle`) can still collide; stop it while recording the demo.

## 2026-11-16 · viem waits 4 seconds between receipt checks by default

- **What happened:** every publish and sync took 4 to 9 s although Arc makes a block every 0.5 s. `waitForTransactionReceipt` polls at the client's `pollingInterval`, 4 s by default.
- **Lesson:** on a fast chain the default polling hides the chain's speed.
- **Next time:** `publicClient` sets `pollingInterval` (800 ms since unit 7.6; see the 429 entry below). A buy (approve plus buyProtection) takes about 3 s.

## 2026-11-16 · Watching the logs folder is the simplest live feed

- **What happened:** for SSE I first thought of emitting from each code path. But the oracle loop and the agent loop run in other processes, and all of them already append to `logs/*.jsonl`.
- **Lesson:** `fs.watch("logs")` plus a byte offset per file turns every appended line into an event, whatever process wrote it. A test move reached the page 59 ms after the webhook.
- **Next time:** to make something show up live, append a line to one of the tailed files. Two events in a demo can arrive in either order (the pool's sync beat the agent's buy by 1.4 s), so the page shows the furthest step reached, not the newest.

## 2026-11-16 · A helper class name collided on the demo page

- **What happened:** the ruler's 100% tick sat 25 px too low. Its class `last` also matched `.last`, the agent's "last decision" block, which has a top margin and padding.
- **Lesson:** short generic class names collide in a one-file page.
- **Next time:** name by component (`t100`), and look at a screenshot after every layout change.

## 2026-11-17 · Arc's public RPC answers 429 when a replay asks too often

- **What happened:** `ARC_RPC_URL` is Arc's public `https://rpc.testnet.arc.io`. The fourth demo replay in ten minutes lost its last two publishes and its summary to `HTTP 429 Request exceeds defined limit`. By then receipts were polled every 400 ms, and every page refresh made three chain reads, several times per publish.
- **Lesson:** the public RPC has a rate limit, and a replay with a watching page is the heaviest thing we run. Nothing retries (Phase 8 is not built), so one 429 costs a publish.
- **Next time:** keep chain reads out of anything a page asks for repeatedly: the demo view takes the pool's state from the sync record, tiers are read once, and receipts are polled every 800 ms. A QuickNode RPC endpoint for Arc testnet in `ARC_RPC_URL` would lift the limit; that is the user's account to set up.

## 2026-11-17 · The real history moves in steps, so a replay publishes the changes

- **What happened:** the first replay took 26 evenly spaced hourly candles and ran over 3 minutes; most publishes repeated the value before. The hourly closes hold one value for hours: BTC has 10 distinct values in a row over Nov 12–15, ETH 13 over Nov 9–15.
- **Lesson:** sampling by time wastes most of a short replay on nothing happening.
- **Next time:** publish the first candle and each candle whose value differs from the one before. That is the whole story in 10 to 13 publishes, about a minute, and every publish is something to look at.

## 2026-11-17 · A page that loads slowly is drawn before its font

- **What happened:** a screenshot of the finished agent demo had the chart's grid in the wrong place. The chart is drawn in pixels from the box's size; the web font arrived after the first draw and changed the height of the row above it.
- **Lesson:** a pixel-drawn chart has to be redrawn when its box changes, not only when the window does.
- **Next time:** `ResizeObserver` on the chart's element, as `demo/demo.js` does.

## 2026-11-17 · A test command that starts a paid run must appear once

- **What happened:** one shell line called the screenshot script twice by mistake. The second call clicked "Start replay" again, which used up the second of two budgeted agent runs before I had looked at the first. Later the same script stopped at once because the page still showed the last run's "done" state, and I deleted the Stream under the run it had just started.
- **Lesson:** a driver that clicks a button which spends money is not idempotent, and a page can show an old run's end state.
- **Next time:** one driver call per command, read the command back before running it, and make the driver wait until it has seen its own run start before it looks for the end.

## 2026-11-17 · A script that rewrites CSS line by line cut two rules in half

- **What happened:** to keep the old demo pages working I scoped their rules to `body.demo` with a regex over lines. The filter meant to drop the old `body { … }` block also dropped the second line and the closing brace of the two rules written over several lines (`.pill`, `.btn`), so every rule after them was ignored. The home page looked right; the old demo pages were bare HTML.
- **Lesson:** an unclosed brace in CSS fails silently, and only on the pages that use the rules after it.
- **Next time:** after any scripted edit to a stylesheet, count `{` against `}`, and screenshot every page that loads the file, not only the one being built.

## 2026-11-17 · A column that fails to load must say so

- **What happened:** on one load the Aave column of the new home page stayed empty: the advisor call had failed once and the page swallowed the error. The next load was fine.
- **Lesson:** an empty column in a screenshot looks like a layout bug, and nothing on the page said which read had failed.
- **Next time:** a part that depends on its own route shows one line when that route fails ("Not read. Reload the page to try again."), as the Aave box now does.
