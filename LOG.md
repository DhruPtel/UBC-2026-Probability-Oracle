# LOG

A running record of every change. After each edit or step, append an entry under
`## YYYY-MM-DD HH:MM · <unit id>` with at most 2–3 sentences: what was done, which files
changed, and why. Append only; never rewrite old entries. Times are Pacific.

## 2026-11-16 00:45 · 0 (planning)

Re-checked the research with read-only commands: `node` v22.23.1, `forge` 1.8.3, Gemini events endpoint HTTP 200, and `eth_chainId` = `0x4cef52` (5042002) on both `rpc.testnet.arc.io` and `rpc.testnet.arc.network`. No files changed in this step. Results went into PLAN.md §0.7 in a later entry.

## 2026-11-16 00:47 · 0 (planning)

Rewrote `CLAUDE.md`: added the "How we build" and "Records" sections, and replaced the Git section so the user commits and pushes while Claude runs `git status` and hands over the commands. Also dropped the `Commit:` line from the report template, added a Wallets row to the project facts, and emptied the Commands list because no command exists yet.

## 2026-11-16 00:48 · 0 (planning)

Added `PLAN.md` §0.7 with the re-check results and what the Gemini response changes: a 1.3 MB response for 3 events, no `priceHistory` in the list response, and `lastTradePrice` sometimes missing. Marked §6 blocker 1 (where we build) and item 6 (cloudflared) as resolved, since the build runs locally on WSL2.

## 2026-11-16 00:48 · 0 (planning)

Simplified `PLAN.md` after the review, with five new rows in the §1 Decisions table. Changes: two keys only, both generated in 1.1 (4.1 needs the agent key on Day 1, before 3.3; treasury and owner are the deployer address); one viem `scripts/deploy.ts` instead of a `.s.sol` script per contract; hand-written `parseAbi` ABIs in `src/shared/abi.ts` instead of reading Foundry's `out/`; `logs/*.jsonl` by `appendFileSync`; `npm test` on Node's built-in runner. Dropped `src/shared/env.ts`, the README stub from 1.1 and `forge init` from 1.2.

## 2026-11-16 00:48 · 0 (planning)

Tightened unit text in `PLAN.md` so every "done when" names a command: 2.1 (category filter, `priceHistory` check on the single-event endpoint), 2.2 (deploy command, `forge-std` arrives here), 2.3 (no-publish case, `logs/odds.jsonl`), 3.3 (no key generation, a checkpoint after the onchain tx), 6.2 (dashboard typecheck command). Phases, schedule and cut list are unchanged.

## 2026-11-16 00:49 · 1.1, 1.2 (plan only)

Replaced the Phase 1 section of `PLAN.md` with the detailed plan for 1.1 and 1.2: exact files and contents, ordered steps, command-level "done when" checks, and what the user must provide. `.gitignore` is now step 1 of 1.1 and is verified with `git check-ignore .env` before any key exists.

## 2026-11-16 00:50 · 0 (planning)

Created `LOG.md` and `LESSONS.md` with headers, and recorded this session's surprises in `LESSONS.md`. No project code was written; unit 1.1 waits for go.

## 2026-11-16 09:46 · 0.2 (plan for seeing it work)

Docs only. `PLAN.md`: added a "See it" line to every unit, the new unit 1.3 "Lab v1" (Express on 8787 plus `lab/index.html`), a Lab panel and `/api` route in the Files list of each later unit that produces something new, the Stream webhook on its own port 8788 in 5.1 (only that port is tunneled), and a Phase 6 that polishes the Lab instead of building a Vite + React app (6.2 drops from 2.5 h to 1.5 h; the hour is Wednesday buffer). `CLAUDE.md`: added the See it rule as rule 3 (later rules renumbered) and the `git status` / `git add .` / commit / push hand-off, so the user can see and click each piece as it is built.

## 2026-11-16 09:48 · 1.1

Updated the Zone.Identifier entry in `LESSONS.md` (files deleted and ignored, so `git add .` is the flow). Created `.gitignore` first and confirmed `git check-ignore .env` prints `.env` before any key existed.

## 2026-11-16 09:49 · 1.1

Created `package.json`, `tsconfig.json`, `.env.example`, `src/shared/chain.ts`, `scripts/new-keys.ts` and `scripts/check-arc.ts`, and ran `npm install` (viem, dotenv; typescript, tsx, @types/node). Added `"types": ["node"]` to `tsconfig.json` because TypeScript 7 no longer loads `@types/node` by default; `npm run typecheck` then passed.

## 2026-11-16 09:50 · 1.1

Ran `npm run new-keys` twice: it created `.env` and printed the same two addresses both times, with no key shown. `npm run check:arc` reads chain 5042002 and both balances as 0 before funding, and both explorer hosts answer (the old `testnet.arcscan.app` redirects to `explorer.testnet.arc.io`).

## 2026-11-16 09:52 · 1.1

Updated unit 1.1 in `PLAN.md` to match what was built (`new-keys` name, `contracts/broadcast/` in `.gitignore`, `account()` and `EXPLORER` in `chain.ts`, the native-balance column, the `types` line) and filled in the Commands list in `CLAUDE.md`. Waiting for the user to fund both addresses at the faucet.

## 2026-11-16 09:54 · 1.1

The user funded both addresses (the faucet gave 20 USDC each). `npm run check:arc` shows chain 5042002, block 72583118 and 20 USDC on both wallets with USDC and native matching; `npm run typecheck` passes; `git status --short` lists no `.env`. Ticked 1.1 in `PLAN.md`.

## 2026-11-16 09:56 · 1.2

Created `contracts/foundry.toml` and `contracts/src/Hello.sol` (no `forge init`, no forge-std); `forge build --root contracts` compiles with solc 0.8.28. Added `walletClient(name)` to `src/shared/chain.ts` and the new `src/shared/artifacts.ts` (`loadArtifact`, `addressOf`), so ABIs come from Foundry's output instead of being written by hand.

## 2026-11-16 09:57 · 1.2

Created `scripts/deploy.ts` and `scripts/hello.ts` and added the `deploy` and `hello` scripts to `package.json`. `npm run deploy -- Hello` deployed Hello at `0xc06b4ee36f838bb1f6ca95caa25ed9d6f2d45e67` and wrote `deployments/arc-testnet.json`; `npm run hello -- gm` printed `message = gm`.

## 2026-11-16 09:58 · 1.2

Verified Hello on the explorer on the first try with Arc's documented command run through stock `forge`; the explorer API reports `is_verified: true` and decodes the `Ping` event. `npm run typecheck` passes.

## 2026-11-16 09:59 · 1.2

Updated `PLAN.md` to match the build: unit 1.2 (files, the verify command for reuse, ticked), the ABIs and Deploys decision rows (artifacts replace hand-written `parseAbi`), and the `abi.ts` mentions in 2.2, 3.3 and the repo layout. Added the new commands to `CLAUDE.md` and two entries to `LESSONS.md`.

## 2026-11-16 10:01 · 1.3

Installed `express` and `@types/express`, added `PORT=8787` to `.env.example` and the `lab` script to `package.json`. Created `src/server/index.ts` (Express on 127.0.0.1 with `GET /`, `GET /api/status`, `POST /api/ping`) and `lab/index.html` (header, Wallets, Contracts and Hello panels, polling every 3 seconds).

## 2026-11-16 10:03 · 1.3

Tested with curl: `/api/status` returned chain 5042002 with both wallets and the Hello contract; `POST /api/ping` with "hello lab" returned a tx in block 72583925; the next status showed `hello.message` = "hello lab" and the deployer down from 19.98885 to 19.988101 USDC. `npm run typecheck` passes, the listener is on 127.0.0.1:8787 only, and the server was stopped afterwards.

## 2026-11-16 10:04 · 1.3

Updated unit 1.3 in `PLAN.md` to match the build (127.0.0.1 binding, the exact JSON shapes, the curl-based done-when) and ticked it. Added `npm run lab` to the Commands list in `CLAUDE.md` and one entry to `LESSONS.md`.

## 2026-11-16 10:08 · 2.1

Saved raw Gemini samples to `logs/` (list, single event, categories, the Economics and Crypto lists, history probes) and summarized them with small `node` commands. Found that history exists on `/v2/candles/<instrumentSymbol>/<1hr|1day>` and not in the events API.

## 2026-11-16 10:15 · 2.1

Created `src/oracle/gemini.ts` (four fetch functions, 1 second spacing, each returns its URL), `src/oracle/odds.ts` (`probability()`) and `src/oracle/odds.test.ts` (mid, last, none). Added `"test": "tsx --test"` to `package.json`; `npm test` passes 3 tests.

## 2026-11-16 10:17 · 2.1

Added three routes to `src/server/index.ts` (`/api/markets/categories`, `/api/markets`, `/api/markets/inspect`). Rewrote `lab/index.html` with the frontend-design skill: a small visual base (CSS variables, IBM Plex Sans and Mono) applied to the existing panels, plus the new Markets panel with the Source link, per-event row groups, Inspect boxes and "Load more".

## 2026-11-16 10:19 · 2.1

Found the user's own Lab on port 8787, so tested a second copy on port 8799 and left theirs running. All three routes return live data; `npm run typecheck` passes. Made `app.listen` rethrow its error, because Express 5 otherwise prints "Lab running" even when the port is taken.

## 2026-11-16 10:21 · 2.1

Updated `PLAN.md` (unit 2.1 as built, the odds math moved from 2.3, the history finding in §0.7 and 8.1, tests from 2.1), `CLAUDE.md` (the frontend-design rule, `npm test`, Gemini field facts) and `LESSONS.md` (four entries). Not ticked yet: `config/markets.json` waits for the user's pick.

## 2026-11-16 10:26 · 2.1

The user picked the markets. Wrote `config/markets.json` (live: BTC $65,000 with harm NO and the Fed 25 bp hike with harm YES; replay: BTC $67,500, hourly candles Nov 12 to Nov 15). A test copy of the Lab on port 8799 returned all three symbols in `chosen`, so their rows get highlighted; tests and typecheck pass.

## 2026-11-16 10:27 · 2.1

Updated `PLAN.md` for the picks: a "Harmful outcome" row in the Decisions table, a neutral YES-only oracle in 2.3, harm derived from `harmfulOutcome` in §0.5, 3.2 and 3.3, and 8.1 replaying the real candles with a labeled `SCENARIO` only as a fallback. Ticked 2.1 and added the market findings to `LESSONS.md`. Nothing was built for the replay or the agent.

## 2026-11-16 10:33 · 2.2

Vendored forge-std with `forge install foundry-rs/forge-std --no-git` into `contracts/lib/forge-std` (plain files, 1.4 MB, to be committed) so a clean clone builds without extra steps; no remapping was needed. Created `contracts/src/OddsFeed.sol` and `contracts/test/OddsFeed.t.sol`; `forge test --root contracts` passes 4 tests.

## 2026-11-16 10:36 · 2.2

Created `scripts/feed.ts` (read table, and manual publish for `test:` symbols only) and added the `feed` script to `package.json`. Deployed OddsFeed at `0xe83a5a53dd68bf395337343cd25a0432a1acc50d` and verified it with the command from 1.2 on the first try.

## 2026-11-16 10:37 · 2.2

Published `test:demo` at 42 and then 57: `npm run feed test:demo` shows round 2 at 57%, and the explorer API decodes the second event with `prevProbBps` 4200 and `probBps` 5700. A real symbol is refused by the manual publish. The running Lab lists OddsFeed in its Contracts table with no code change; typecheck and `npm test` pass.

## 2026-11-16 10:39 · 2.2

Updated `PLAN.md` (unit 2.2 as built and ticked, the event and `marketId` definition in §0.6, `feed.ts` removed from 2.3's file list) and added the `feed` and `forge test` commands to `CLAUDE.md`. One entry added to `LESSONS.md`.

## 2026-11-16 10:44 · 2.3

Added `toBps` to `src/oracle/odds.ts` with two tests, and created `src/oracle/publisher.ts` (`publishOnce`) and `scripts/oracle.ts` (`--once` or a loop). Added the `oracle` script to `package.json` and `ORACLE_INTERVAL_S=300` to `.env.example`. `npm run oracle -- --once` published BTC $65,000 at 51.5% and the Fed hike at 88.5%, and `npm run feed` reads the same values back.

## 2026-11-16 10:46 · 2.3

Added `GET /api/oracle`, `GET /api/oracle/history` and `POST /api/oracle/publish` to `src/server/index.ts`. The public RPC refuses getLogs ranges over 10,000 blocks, so the history route reads in chunks and keeps its place in memory. Tested all three on a second Lab copy on port 8799.

## 2026-11-16 10:48 · 2.3

Added the Oracle panel to `lab/index.html`: cards per market, "Publish now", a Chart.js chart (one CDN tag, colors checked with the dataviz skill's validator) and a table of publishes, on a 30-second timer. Took a headless Chromium screenshot and the panel renders as intended. Ran the loop for short test cycles, then stopped the loop and the test server; tests (5) and typecheck pass.

## 2026-11-16 10:52 · 2.3

Updated `PLAN.md` (unit 2.3 as built and ticked, `logs/oracle.jsonl` as the log name, the measured gas of about 0.6 USDC a day, the getLogs limit), `CLAUDE.md` (the `oracle` command, the getLogs limit) and `LESSONS.md` (four entries).

## 2026-11-16 10:56 · 0.3 (renumber)

Docs only. Renumbered `PLAN.md` so unit numbers match build order, moving each unit's full text with it and updating every cross-reference (Decisions table, Phase 1 notes, schedule, checkpoints, cut list, open questions). Added the rule "unit numbers always match build order" to `CLAUDE.md`. Entries above this one keep their old numbers. Old → new:

| Old | New | Unit |
|---|---|---|
| 4.1 | 3.1 | Paid read over x402 on Arc |
| 5.1 | 3.2 | QuickNode Stream to webhook |
| 3.1 | 3.3 | Gemini sandbox order |
| 3.2 | 4.1 | Rules and Agent panel |
| 3.3 | 4.2 | ProtectionBook and first protection buy |
| 3.4 | 4.3 | LLM threat map, optional |
| 4.2 | 5.1 | Agent pays per read; the read refreshes the feed |
| 5.2 | 5.2 | Real Stream filter (unchanged) |
| 5.3 | 5.3 | Agent re-checks on Stream events (unchanged) |
| 7.2 | 7.1 | Onchain budget |
| 7.3 | 7.2 | Owner approval |
| 7.1 | 7.3 | Oracle data checks |

Phases 1, 2, 6 and 8 are unchanged. New phase names: 3 "Prove the integrations", 4 "Agent", 5 "Live wiring", 7 "Guardrails".

## 2026-11-16 10:58 · 3.1

Read Circle's seller and buyer quickstarts and the batched-settlement page, then the type definitions of the installed packages. Installed `@circle-fin/x402-batching` 4.0.0, `@x402/core` and `@x402/evm`. Created `scripts/gateway-deposit.ts`; `npm run gateway:deposit -- 2` moved 2 USDC from the agent's wallet into Gateway with no API key.

## 2026-11-16 11:03 · 3.1

Added the paid endpoint `GET /odds/:symbol` ($0.001, Arc testnet only, 404 for unknown symbols before any payment), the payments log, and the routes `GET /api/payments` and `POST /api/pay-read` to `src/server/index.ts`. Created `scripts/pay-read.ts`. On a test copy (port 8799): the unpaid call returns 402 with a `PAYMENT-REQUIRED` header, both paid paths return 200 with live odds, and the agent's Gateway balance went 2 → 1.999 → 1.998.

## 2026-11-16 11:05 · 3.1

Added the Payments panel to `lab/index.html` (balances, market dropdown, pay button, settlement note, table of paid reads with Gateway's settlement status) on a 10-second timer; a headless screenshot shows it rendering correctly. Tests (5) and typecheck pass.

## 2026-11-16 11:07 · 3.1

Updated `PLAN.md` (unit 3.1 as built and ticked, confirmed facts added to §0.3), `CLAUDE.md` (two commands, x402 facts) and `LESSONS.md` (three entries).

## 2026-11-16 11:09 · 3.1

Added the Circle Gateway Nanopayments credit (quickstarts, SDK, and the `circlefin/arc-nanopayments` sample) to the Credits section of `README.md`. Stopped the test server on port 8799.

## 2026-11-16 11:13 · 3.2

Read QuickNode's Streams REST docs. A probe through the test-filter endpoint confirmed the network name `arc-testnet`, the `logs` dataset and its nesting, and that the account has no streams. Added `QUICKNODE_API_KEY`, `STREAM_WEBHOOK_URL` and `STREAM_PORT` to `.env.example`.

## 2026-11-16 11:16 · 3.2

Created `src/stream/filter.js`, `scripts/stream-up.ts` and `scripts/stream-down.ts` (scripts `stream:up`, `stream:down`). In `src/server/index.ts`, added the webhook as a second Express app on port 8788 with only `POST /stream`, and `GET /api/stream` on the Lab port. Added the Stream panel to `lab/index.html`. A local fake delivery on spare ports showed up in the panel; the test line was removed afterwards.

## 2026-11-16 11:20 · 3.2

First live run: `stream:up` created the stream and three deliveries reached the webhook through the tunnel, but each was saved without its body, so I ran `stream:down` (confirmed 0 streams left). Changed the webhook in `src/server/index.ts` to read the body as text for any Content-Type and parse it itself, and to record the Content-Type on each line.

## 2026-11-16 11:22 · 3.2

Second live run after the user restarted the Lab: `stream:up`, `oracle -- --once` and `hello -- stream-test`. All three logs arrived at the webhook with matching tx hashes, 0.5 to 5.5 seconds after their blocks, and `GET /api/stream` and the Stream panel showed them. `stream:down` deleted the stream (0 left on the account); typecheck and tests pass.

## 2026-11-16 11:25 · 3.2

Updated `PLAN.md` (unit 3.2 as built and ticked), `CLAUDE.md` (two commands, the webhook port) and `LESSONS.md` (three entries).

## 2026-11-16 11:46 · 3.3

Read the Gemini SDK README and types, the trading quickstart and the OpenAPI spec. Installed `@gemini-markets/sdk`, found it can't send the `account` field our master key needs, and removed it. Created `src/agent/trade.ts` (sandbox host hardcoded, signed REST) and `scripts/gemini-order.ts` with the `list`, `buy`, `status` and `positions` modes; added the `gemini:order` script and the two sandbox variables to `.env.example`.

## 2026-11-16 11:48 · 3.3

`list` showed terms accepted, 100,000 USD of test funds and 97 sandbox events; neither production symbol exists there. Placed four 1-contract sandbox orders: a YES on the Nov 30 BTC contract (open), a NO on the same contract (cancelled by Gemini as a self-trade), then a YES and a NO on two same-day BTC contracts (both filled, both listed by `positions`). Fixed `trade.ts` to keep order IDs as strings after the first IDs came back rounded.

## 2026-11-16 11:50 · 3.3

Read the organizers' guide in `docs/` and added section 0.8 "Hackathon rules" to `PLAN.md`. Updated `PLAN.md` (unit 3.3 as built and ticked, confirmed facts in section 0.1, sandbox stand-in note under 4.2), `CLAUDE.md` (the command, two labels, the Gemini facts row) and `LESSONS.md` (four entries). Typecheck and tests pass.

## 2026-11-16 11:57 · 4.1

Recorded the user's decisions and swapped the BTC market in `config/markets.json` to `GEMI-BTC2611302200-HI67500`; `npm run oracle -- --once` published its first onchain value (33% YES). Created `src/agent/portfolio.json` (0.001 BTC, `DECLARED HOLDING`), `src/agent/threats.json`, `src/agent/policy.ts` with `decide()`, and `src/agent/policy.test.ts` (5 tests).

## 2026-11-16 11:59 · 4.1

Created `src/agent/inputs.ts` (OddsFeed read, production buy price, the agent view) and `scripts/agent-dry.ts`; added `getSpot` and `prices.buy` to `src/oracle/gemini.ts`, the routes `GET /api/agent` and `POST /api/agent/whatif` to `src/server/index.ts`, and the `agent:dry` script. The dry run shows buy 7 NO for BTC (about $4.83) and would buy 4 YES for the Fed.

## 2026-11-16 12:01 · 4.1

Added the Agent panel to `lab/index.html` (holding line, a card per threat, what-if slider with reset) and checked it in a headless screenshot on a test copy, which is stopped. Updated `PLAN.md` (unit 4.1 as built and ticked, four rows in the Decisions table, the markets note under 4.2), `CLAUDE.md` (the command) and `LESSONS.md` (three entries). 10 tests and typecheck pass.

## 2026-11-16 12:08 · 4.1

Amended before commit, on the user's new direction: real Gemini odds always, protection buys are `PAPER TRADE`s at the real production price, and the agent doesn't use the sandbox. `threats.json` uses execution `paper` for both threats; `policy.ts` and its test drop the monitor path and carry `execution: "paper"` in the output; the Agent panel, `inputs.ts` and `agent-dry.ts` say `PAPER TRADE` and "real production price; paper trades fill here"; the what-if slider now sets the assumed buy price equal to the harm probability. Updated `PLAN.md` (Trading and Fed rows, unit 4.1 text, unit 4.2 with `logs/paper.jsonl` and no sandbox orders) and the label list in `CLAUDE.md`.

## 2026-11-16 12:04 · 4.2

Created `contracts/src/ProtectionBook.sol` and `contracts/test/ProtectionBook.t.sol` (2 tests; 6 forge tests pass). Deployed it to Arc testnet at `0x31f88462ddb390cfe8484674509fe83514110692` and verified it; the Lab's Contracts table lists it.

## 2026-11-16 12:10 · 4.2

Created `src/agent/paper.ts`, `src/agent/agent.ts` (`runOnce()`) and `scripts/agent.ts`; split `src/agent/inputs.ts` into `readHolding` and `readThreat` so coverage comes from the paper fills; `decide()` output gained `needed`. Added `POST /api/agent/run` and the wallet and fills to `GET /api/agent`, the `agent` script and `AGENT_INTERVAL_S`. First run bought 7 NO (4.83 USDC) and 4 YES (3.72 USDC); the second run holds.

## 2026-11-16 12:25 · 4.2

Added the Agent panel pieces to `lab/index.html` (Run agent once with steps, coverage, Protection bought table, wallet balance) and checked them on a test copy, now stopped. Updated `PLAN.md` (unit 4.2 as built and ticked, the stay-on-Arc decision, the Solana port as a later idea, the diagram, 3.3, cut list, open decisions and 8.2), `CLAUDE.md` (the command) and `LESSONS.md` (three entries).

## 2026-11-16 15:50 · 4.2 fix

Rewrote the Lab's Agent panel in plain language (`lab/index.html`): one card per risk with the chance, a bar with the 50% mark, the loss, the insurance and a status line; the slider answers in one sentence and ignores insurance already held; "Run agent once" gives one line per risk; the numbers and steps sit behind closed toggles. Added plain `risk` and `riskShort` names to `src/agent/threats.json`, passed through `src/agent/inputs.ts`. No change to the agent's logic, the contracts or `decide()`; checked with headless Chromium screenshots.

## 2026-11-16 16:20 · 0.5

Docs-only replan of `PLAN.md` on the user's decisions: a DeFi risk switch as the oracle's second consumer, and the demo website before the guardrails. Old → new: 4.3 → "Later ideas" (no number); 5.1, 5.2, 5.3 unchanged; new 6.1 RiskSwitch, 6.2 Demo lending pool, 6.3 Automatic updates and DeFi panel; 6.1 → 7.1; 6.2 → 7.2 (reshaped into the `/demo` page); 8.1 → 7.3 (extended: Start demo, demo pool, reset); 7.1 → 8.1 (plus the $0.85 max price); 7.2 → 8.2; 7.3 → 8.3 (plus `sync` limited to the keeper); 8.2 → 9.1 (plus a RiskSwitch section); 8.3 → 9.2; 8.4 → 9.3. Also updated the Decisions table, design, diagram, repo layout, schedule, checkpoints, cut list and open questions, and the phase numbers and `DEMO` label in `CLAUDE.md`.

## 2026-11-16 16:32 · 0.6

Docs only, on the user's instruction. Added working rule 12 "Batch mode" to `CLAUDE.md`. Added unit 6.4 "Live advisor (read-only)" to `PLAN.md` after 6.3, with no renumbering, and put it on Tuesday's schedule (Tuesday about 7.75 h, remaining build about 20.5 h, one new Tuesday-night checkpoint line).

## 2026-11-16 16:36 · 5.1

Split `src/oracle/publisher.ts` into `refreshMarket(market, onlyIfChanged)` plus the `publishOnce()` loop. `GET /odds/:symbol` in `src/server/index.ts` now refreshes the feed when the value changed and returns the round and tx hash; payment rows record `run`, `round` and `txHash`. Added `paidRead()` to `src/agent/inputs.ts`; `src/agent/agent.ts` pays for each read, checks the same round onchain, and tags every step with its run.

## 2026-11-16 16:38 · 5.1

Lab (`lab/index.html`): the Agent panel renders the newest check from `GET /api/agent` (`runs`) with "odds via paid read ($0.001) · round N onchain" per risk, and the Payments table has a "Paid for" column. On a test copy (ports 8799 and 8798): one run with the feed unchanged, and one where the BTC read published 28% → 27.5% as round 9 and the onchain check matched. Typecheck and 10 tests pass; 5.1 ticked in `PLAN.md`.

## 2026-11-16 16:40 · 5.2

Rewrote `src/stream/filter.js` to decode `OddsUpdated` (`oddsUpdated` or `bigMove`), `ProtectionBought` and the agent's USDC transfers into typed events; QuickNode's test-filter endpoint returned all four types on real past blocks. Added `POST /api/test-move`, typed events in `GET /api/stream`, the "Send test move" button and the plain-language Stream table; `scripts/stream-up.ts` prints typed events. The live delivery check still needs the Stream up.

## 2026-11-16 16:42 · 5.3

The webhook in `src/server/index.ts` starts `runOnce(trigger)` on a `bigMove` for a watched symbol or on a `walletChange`; `runOnce` allows one run at a time and logs "skipped, run in progress" otherwise. Each run records its trigger, and the Agent panel shows it ("Last check: triggered by …"). Simulated with real filter output posted to the test webhook: a wallet change started a run in 1 ms, a second delivery was skipped, and a `test:demo` big move started none; the simulated lines were removed from the logs afterwards.

## 2026-11-16 16:44 · 5.1–5.3

Updated `PLAN.md` (5.1 as built and ticked; 5.2 and 5.3 as built, not ticked until the live Stream check), `CLAUDE.md` (the agent and stream commands, the x402 and Streams facts) and `LESSONS.md` (four entries).

## 2026-11-16 16:41 · 5.2

Live check after the user restarted the Lab (the morning's tunnel still worked): `stream:up`, then two test moves on `test:demo` arrived as `bigMove` (2.8 s and 1.4 s after their blocks), 0.1 USDC from the deployer to the agent arrived as `walletChange` (3.3 s), and a publish caused by a paid read arrived as `oddsUpdated`. Ticked 5.2 in `PLAN.md` with the result.

## 2026-11-16 16:42 · 5.3

Live check: with `test:demo` added to `src/agent/threats.json` for one test move, the big move started an agent run in the same millisecond the delivery arrived; the wallet change started another. Both runs held, at $0.002 of paid reads each. `threats.json` is restored to the two real threats (identical to its backup), `stream:down` ran twice (0 streams left; the Stream was up under 2 minutes in total), and 5.3 is ticked in `PLAN.md`. One entry added to `LESSONS.md`.

## 2026-11-16 17:02 · 6.1

Created `contracts/src/RiskSwitch.sol` (opt-in with tiers, `sync`, `paramsOf`, `tiersOf`) and `contracts/test/RiskSwitch.t.sol` (7 tests). `scripts/deploy.ts` now passes constructor arguments, resolves `@Name` to a recorded address and takes `--as <Key>`. Deployed RiskSwitch at `0x6a961276b85bc64214b4a7810a01256363552525` with `npm run deploy -- RiskSwitch @OddsFeed` and verified it with `--constructor-args`.

## 2026-11-16 17:06 · 6.2

Created `contracts/src/DemoLendingPool.sol` (`DEMO`: opts in from its constructor, `canBorrow`, `borrow`, `LoanRecorded`) and `contracts/test/DemoLendingPool.t.sol` (5 tests; 18 forge tests pass). Deployed it for `GEMI-BTC2611302200-HI67500`, side NO, at `0x461994160526949cae165850a45c7a36e8e2149f`, verified it, and called `sync(pool)` once: level 2, LTV 40%, harm 72%. `canBorrow(100, 40)` is true and `canBorrow(100, 41)` is false.

## 2026-11-16 17:12 · 6.3

Added to `src/server/index.ts`: the keeper (`syncPool`, one sync at a time, logged to `logs/defi.jsonl` with its trigger), the webhook call that syncs a pool on any odds update for its market, and `GET /api/defi`, `POST /api/defi/sync`, `POST /api/defi/check`. `src/stream/filter.js` decodes `RiskSwitch.RiskLevelChanged` into `riskLevelChanged`; the test-filter endpoint returned it for the block of the pool's first sync. Added the DeFi panel to `lab/index.html` and checked it in a screenshot of a test copy; "Sync now" sent a sync that stayed at level 2.

## 2026-11-16 17:14 · 6.4

Found a real source: Aave V4's Main Spoke on Arc mainnet (chain 5042), cirBTC reserve, read through the public RPC `https://rpc.mainnet.arc.io` with addresses from Aave's official address book. Added `GET /api/advisor` (live reads only, nothing written) and the "Live advisor" card to the DeFi panel. It read collateral factor 78%, supply cap 1,600 and borrow cap 220 cirBTC, and at 72% harm (level 2) recommends 53%.

## 2026-11-16 17:15 · 6.3

Deployed a temporary second pool for the live level-change test: `DemoLendingPool` on `test:demo`, side YES, recorded as `TestLendingPool` with `--as`. It is labeled TEST in the panel's history.

## 2026-11-16 17:20 · 6.3

On the user's instruction, added the script `lab:dev` (`tsx watch src/server/index.ts`) to `package.json`, so the user's Lab restarts itself when server code changes. Updated `CLAUDE.md`: the `lab:dev` and `deploy` commands, `rpc.mainnet.arc.io` on the network list, the `TEST` and `LIVE ADVISOR` labels, and two project-facts rows (risk switch, live advisor).

## 2026-11-16 17:22 · 6.1–6.4

Rewrote Phase 6 in `PLAN.md` as built: 6.1 and 6.2 ticked with addresses and the verify command with constructor arguments; 6.3 and 6.4 described as built, not ticked until the live Stream check. Two entries added to `LESSONS.md` (the Aave V4 source, and reading a deploy's full output).

## 2026-11-16 17:27 · 6.3

Live check with the user's Lab on `lab:dev`: `stream:up`, then "Publish now" led to an automatic `sync` of the demo pool (level stayed 2, harm 72% → 71%), and four `test:demo` publishes moved the test pool 0 → 1 → 2 → 3 → 0, each arriving as `riskLevelChanged`. `stream:down` ran (0 streams left). Ticked 6.3 and 6.4 in `PLAN.md` with the result.
