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
