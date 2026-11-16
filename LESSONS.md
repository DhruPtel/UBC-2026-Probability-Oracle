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
- **Lesson:** `git add .` would commit them.
- **Next time:** always `git add` explicit file names. Unit 1.1 adds `*:Zone.Identifier` to `.gitignore`.
