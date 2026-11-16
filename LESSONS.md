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
