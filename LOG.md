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

## 2026-11-16 17:58 · 7.1

Added `GET /events` (SSE) to `src/server/index.ts`: the server watches `logs/*.jsonl` and pushes each new line as a typed event (`oracle`, `agent`, `payment`, `defi`, `stream`, `demo`), plus a `status` event every 5 s with the block and whether a Stream is up. `lab/index.html` now subscribes with `EventSource` and reloads a panel when an event concerns it; the 3 s and 10 s timers are gone, and only the slow outside reads keep one (Gemini 30 s, Circle settlement 60 s, Aave 5 min).

## 2026-11-16 18:00 · 7.3

Groundwork done before the page, because 7.2 shows its data. `src/agent/`: `runOnce(trigger, demo?)` checks only the demo threat in `demo.json` (0.0005 BTC `DECLARED HOLDING`) with per-run fills in `logs/paper-demo-<runId>.jsonl` labeled `REPLAY`. `src/oracle/publisher.ts` got `publishValue`, shared by live publishes and the replay. `src/server/index.ts`: the webhook body moved into `handleEvents(events, via)`, plus `POST /api/demo/start`, `GET /api/demo` and `GET /demo`. Deployed `ReplayLendingPool` at `0x3a211c22595425615754823e67928d4af9881ee6` on the replay symbol, side NO.

## 2026-11-16 18:12 · 7.2

Design direction for `/demo`, written before building. Palette: cool fog page `#E8ECEF`, white surfaces, navy ink `#0A1E33`, risk red `#D93A26`, insured teal `#0B7A6B`, yellow `#FFD23F` for the stand-in labels; a replay flips the whole page to navy so nobody mistakes it for live. Type: Archivo only, condensed and heavy for the big numbers, normal width for text, large enough for a projector.
Layout: one idea carries the page, a 0 to 100% ruler with the lines that matter on it (the agent buys at 50%; the pool's tiers at 50, 70 and 85%), used for the odds and again for the pool. Two columns on a wide screen, the story on the left and the live timeline on the right, so a 1080p recording shows odds, agent, pool and timeline without scrolling.

## 2026-11-16 18:20 · 7.2

Built `demo/index.html` and `GET /api/demo` (chain reads and logs only, plus the newest 80 events for the timeline). First screenshot showed three layout bugs (a tick label pushed down by a class-name clash, clipped tier labels, wrapping tx links); fixed. Chart colours passed the dataviz validator for both the light page and the navy replay page.

## 2026-11-16 18:30 · 7.3

A partial replay with the Stream down failed one publish on a nonce collision with a sync, and transactions took 4 to 9 s. Added `asDeployer` (one deployer transaction at a time) and `pollingInterval: 1000` in `src/shared/chain.ts`; used in `publishValue` and `syncPool`. Timeline rows for a paid read and its decision now share one sentence, and a replay hides the pitch to leave room for the banner.

## 2026-11-16 18:40 · 7.1

Proved the SSE path with the Stream up: a test move reached the webhook at 01:52:40.754 UTC and the Lab's Stream panel changed at 01:52:40.813 with no refresh. The Lab made one request per route in 12 s.

## 2026-11-16 18:45 · 7.3

Full run 1 through the Stream (3 min 10 s): 26 publishes, the agent bought 4 contracts for 2 USDC at the 50% crossing, the replay pool went 75% → 60%, cost 2.080 USDC. `stream:down` ran (0 streams left). Added `scripts/demo.ts` (`npm run demo`) and ran full run 2 with it, Stream down, direct triggers: same result, 2.081 USDC, no cleanup between runs. The page now shows the furthest caption reached and, during a replay, only that run's events.

## 2026-11-16 18:50 · 7.2

Saved `docs/screenshots/demo-top.png`, `demo-full.png`, `demo-replay.png` and `demo-replay-end.png`. Fixed the live page's "last decision" showing the replay's run (`/api/agent` now returns `lastLive`). `ReplayLendingPool` is verified on the explorer.

## 2026-11-16 18:55 · 7.1–7.3

Rewrote Phase 7 in `PLAN.md` as built and ticked 7.1 to 7.3. `CLAUDE.md`: `npm run demo`, `/demo`, the live-updates and risk-switch facts, the UI section. Four entries added to `LESSONS.md`. README credits for Archivo and Chart.js.

## 2026-11-17 00:02 · 7.4–7.6 (plan)

Playtest 6 changed the brief: `/demo` was too busy and too slow. Added units 7.4 (home page), 7.5 (agent demo) and 7.6 (protocol demo) to `PLAN.md` after 7.3, with the shared design rules and the new routes, and updated the schedule and the Wednesday checkpoint. No other renumbering.

## 2026-11-17 00:08 · 7.6

Deployed `ReplayEthPool` (a `DemoLendingPool` on `replay:GEMI-ETH2611302200-HI2000`, side NO) at `0xc011d750e2d86b299a6ac9d770fbf58e49d4f588`; the explorer reports it verified (same bytecode as the other pools). Checked the history with the v2 candles endpoint: 168 hourly candles Nov 9 to 15, YES 0.89 → 0.15, 13 distinct values in a row. Aave V4's Main Spoke on Arc lists a WETH reserve (reserve 3, `0x128cC466…4EDB`, the same address as `WETH_UNDERLYING` in Aave's address book), so the advisor card uses WETH.

## 2026-11-17 00:18 · 7.5

`src/server/index.ts`: the demo state now carries a kind (`agent` or `protocol`, from `config/markets.json` `replays`), publishes only the candles where the value changed, spreads them over 65 s and waits for the agent run and pool sync each publish set off before the next. `GET /api/demo/:kind` returns everything a demo page draws; `POST /api/demo/:kind/start` starts a run. Routes moved: `/` home, `/lab` Lab, `/demo/agent`, `/demo/protocol`, `/demo` redirects to `/`; `demo/index.html` deleted. `/api/advisor` takes `?asset=WETH&pool=` and returns the recommendation for every level. New `scripts/fund-agent.ts` (`npm run fund:agent`); `scripts/demo.ts` takes `agent` or `protocol`.

## 2026-11-17 00:20 · 7.4

Wireframe for the home page (`/`), before building:

```
Hedgehog                                                                        Lab
Prediction-market odds, onchain, so agents and protocols can insure themselves.

                                                   ┌ AI agents ───────────────┐
┌ Gemini prediction ─┐       ┌ Our oracle on Arc ┐ │ Insure themselves        │
│ markets            │       │                   │→│ Insured 7 of 7 (big)     │
│ BTC ends below     │ ●───→ │ 71% (big, red)    │ └ [Watch the agent demo] ──┘
│ $67.5k             │       │ round N · 2 min   │ ┌ DeFi protocols ──────────┐
│ 71% (big, blue)    │       │ ago · tx          │→│ Tighten risk limits      │
└────────────────────┘       └───────────────────┘ │ Demo pool: up to 40%(big)│
                                                   │ Aave V4 cirBTC 78% → 53% │
                                                   └ [Watch the protocol demo]┘
Odds: Gemini · Chain: Arc · Pay-per-read: x402 via Circle Gateway · Live events: QuickNode Streams   Contracts
```

## 2026-11-17 00:21 · 7.5

Wireframe for the agent demo (`/demo/agent`), before building:

```
Home  [REPLAY]
(1) Odds rising ─ (2) Crosses 50% ─ (3) Agent pays $0.001 for fresh odds ─ (4) Agent buys insurance ─ (5) Insured
┌ Oracle output: Gemini 47% → onchain 47% (big, red) · round 14 · tx ┐ ┌ agent ──────────────────┐
│ 100%                                                               │ │ Holds 0.0005 BTC (≈ $32)│
│  50% - - - - - - - agent insures here - - - - - - - - - - - - - -  │ │ [DECLARED HOLDING]      │
│        faint blue Gemini line; red onchain line with a dot ● 47%   │ │ Risk: BTC ends below    │
│   0%   Nov 12        Nov 13        Nov 14        Nov 15            │ │ $67.5k                  │
└────────────────────────────────────────────────────────────────────┘ │ Watching (big)          │
                                                                       └─────────────────────────┘
[Oracle update · round N] [Paid read $0.001 · x402] [Insurance bought $2.00 PAPER TRADE] [Delivered by QuickNode Stream]
At the end the step bar becomes the summary: 19% → 61% | 4 contracts, $2.00 | 8 reads | Replay again | Home
```

## 2026-11-17 00:22 · 7.6

Wireframe for the protocol demo (`/demo/protocol`), before building:

```
Home  [REPLAY]
(1) Risk rising ─ (2) Past 50%: limit 60% ─ (3) Past 70%: limit 40% ─ (4) Past 85%: borrowing paused
┌ Oracle output: Gemini 58% → onchain 58% (big, red) · round 9 · tx ─┐ ┌ lending pool [DEMO] ────┐
│  85% - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -   │ │ Loans up to 75% (big)   │
│  70% - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -   │ │ [75%][60%][40%][Paused] │
│  50% - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -   │ │ $50 loan against $100 ✓ │
│        faint blue Gemini line; red onchain line with a dot ● 58%   │ ├ Aave V4 WETH [LIVE ADV.]┤
│   0%   Nov 9    Nov 10    Nov 11    Nov 12    Nov 13    Nov 14     │ │ 83% now → suggest 73%   │
└────────────────────────────────────────────────────────────────────┘ └─────────────────────────┘
[Oracle update · round N]            [Pool limit changed → 60% · via QuickNode Stream]
At the end the step bar becomes the summary: 11% → 85% | 75 → 60 → 40 → paused | 3 updates | Replay again | Home
```

## 2026-11-17 00:27 · 7.4

Built `demo/home.html` and `demo/demo.css`: the hero line, the flow (Gemini in blue → our oracle in red → AI agents and DeFi protocols), arrows drawn from the boxes' positions, a dot along an arrow and a pulse on each `/events` event, the two demo buttons, the one-line footer with an expanding contracts list. It uses only existing routes. 60 visible words; fits 1920×1080.

## 2026-11-17 00:28 · 7.5, 7.6

Built `demo/demo.js` (step bar, pixel-drawn SVG chart, Oracle output chip, transaction cards, focus) and the two pages `demo/agent.html` and `demo/protocol.html`. First protocol run with direct triggers passed every tier but took 79 s; set the replay's floor to 50 s and receipt polling to 400 ms, and the next run took 66 s. `npm run fund:agent -- 5` sent 5 USDC from the deployer to the agent. A partial agent run (4 publishes, stopped before the crossing) checked the agent page.

## 2026-11-17 00:33 · 7.5

Stream up 00:29 to 00:33. Protocol run through the Stream: 65 s, three level changes delivered. Agent full run 1 through the Stream: 60 s, bought 4 contracts for 2.00 USDC, cost 2.039 USDC. My command called the screenshot script twice, so full run 2 started at once, also through the Stream: 57 s, same result, cost 2.038 USDC. That is the two-run budget; the agent's direct-trigger buy was not run again. `stream:down` ran (0 streams left).

## 2026-11-17 00:36 · 7.5, 7.6

`demo/demo.js`, `demo/demo.css`: the dot now rides the tip of the red line instead of cutting across, the chart redraws when its box changes size (a late web font had misplaced the grid), and the step bar no longer dims. Retook the four agent screenshots from run 2's recorded state with these fixes: `agent-1-start`, `agent-2-crossing` and `agent-3-bought` are that run's data drawn at its third publish, fifth publish and purchase; `agent-4-summary` is its real end state. Deleted `docs/screenshots/demo-*.png` (the old page is gone).

## 2026-11-17 00:42 · 7.6

A protocol run through the Stream lost publishes 12 and 13 to HTTP 429 from Arc's public RPC. `src/server/index.ts`: the protocol view now takes the pool's state from the run's sync record, tiers are read once, the loan check once per level; `src/shared/chain.ts`: receipts polled every 800 ms; the pages refresh 200 ms after an event. After that: `npm run demo -- protocol` with direct triggers, 65 s; then through the Stream, 62 s, which gave the five `protocol-*.png` screenshots (Stream up 00:39 to 00:41, 0 streams left).

## 2026-11-17 00:48 · 7.4–7.6

Ticked 7.4 to 7.6 in `PLAN.md` with results and costs, and updated the remaining-hours line. `CLAUDE.md`: routes, `npm run demo -- agent | protocol`, `npm run fund:agent`, the page rules, `ReplayEthPool`, the WETH advisor, the RPC's rate limit. `LESSONS.md`: four entries. `README.md` credits, a Home link in `lab/index.html`.

## 2026-11-17 00:52 · 7.4

`demo/home.html`: the oracle box now fills from `/api/defi`'s feed read first, because `/api/oracle` waits on Gemini for several seconds. Checked live: "Publish now" sent one dot along the Gemini → oracle arrow and the round changed. Retook `docs/screenshots/home.png`.

## 2026-11-17 14:20 · 7.7

Plan change from playtest 6b: added units 7.7 (shared look and home page), 7.8 (agent demo page) and 7.9 (protocol demo page) to Phase 7 in `PLAN.md`, with the five page rules, and updated the schedule row and the remaining-hours line. The pages are rebuilt from the user's mockups in `docs/design/`.

## 2026-11-17 14:22 · 7.7

`src/server/index.ts`: new read-only `GET /api/history?symbol=` (7 days of Gemini hourly closes for a threat, each as the chance of its bad outcome), and each market of `/api/oracle` now carries the threat's `risk` text, so the page can name a chance by its event.

## 2026-11-17 14:25 · 7.7

`demo/demo.css` and `demo/demo.js`: the shared look from the mockups at the top (tokens, Barlow, top bar with tabs and status, panels, cards, badges, chips, rule bar, two-bar picture, event rows and marks, the arrow's dots). The 7.5/7.6 styles and code stay below, scoped to `body.demo`, so the two demo pages keep working until 7.8 and 7.9.

## 2026-11-17 14:27 · 7.7

`demo/home.html` rebuilt as `docs/design/Main.dc.html`: market prices, oracle output with 7-day charts, and the three users of the BTC number. Every number comes from `/api/oracle`, `/api/history`, `/api/agent`, `/api/defi` and `/api/advisor`. Moved "Data provided by Gemini" into the first panel's heading to fit 900 px.

## 2026-11-17 14:29 · 7.7

Checked: `scrollHeight` 900 at 1440×900 and 1080 at 1920×1080, no "harm" in the page text, one publish ran the arrow's dots for 2 s. Fixed the scoped 7.5/7.6 rules for `.pill` and `.btn`, which my rewrite had cut. Screenshots `docs/screenshots/7.7-home-1440.png` and `7.7-home-1920.png`. `CLAUDE.md` (page rules, shared parts, the history route) and `README.md` (Barlow credit) updated; 7.7 ticked in `PLAN.md`.

## 2026-11-17 15:05 · 7.7 fix

Home page matched to the user's revised brief. `demo/home.html`: no line under any heading, new section titles, charts 190 px tall with dashed lines only where a rule uses the market, bottom grid 1fr 1fr 1.35fr, one overview paragraph per card, type tags, an Aave table and a "View the written proposal" panel. `demo/demo.css`: the home section rewritten; `demo/demo.js`: the rule bar is drawn at its size on the page so its text is the same in every card.

## 2026-11-17 15:08 · 7.7 fix

`src/server/index.ts`: the proposal's signal line says "the chance that <event> is X%" instead of "harm probability", because the page now shows that text. Checked `contracts/src/DemoLendingPool.sol`: the limit is read only in `canBorrow` and `borrow()`. `CLAUDE.md` and `PLAN.md`: page rule 6 (no helper lines under headings; one paragraph per card; stand-in words stay visible). Screenshots `docs/screenshots/7.7-home-1440.png` and `7.7-home-1920.png` replaced. The revised `docs/design/Main.dc.html` was not on disk (the file there is the first version), so layout details come from the written brief. `.gitignore` already had `*:Zone.Identifier`.

## 2026-11-17 15:40 · 7.7 wording pass

`demo/home.html`, `demo/demo.css`, `demo/demo.js`: the home page's paragraphs, labels and spacing now follow the revised `docs/design/Main.dc.html` (15/22 px paragraphs, 48 px oracle numbers, outlined type tags, bar captions, coloured dashed lines on the charts, the Aave table beside the bars with a note next to the proposal button). At 1440×900 the charts shrink to 168 px so the paragraphs keep their size; at 1920×1080 they are 190 px.

## 2026-11-17 15:45 · 7.7 wording pass

Checked the Aave V4 claims on Aave's pages and credited them in `README.md`. Both confirmed that a new configuration reaches an open position only on a risk-increasing action; the docs list more actions than the design's sentence (disabling or enabling collateral, a manual update), so the page says "takes on more risk, such as borrowing more or withdrawing collateral". Neither page states that one collateral factor sets both borrowing and liquidation; Aave's governance forum analysis does, and is credited too. Screenshots `docs/screenshots/7.7-home-1440.png` and `7.7-home-1920.png` replaced; `PLAN.md` notes the pass.

## 2026-11-17 15:50 · 7.7 wording pass

`demo/home.html`: when the oracle has moved to another step and the pool has not synced yet, the pool's paragraph names the chance of its last sync ("at 71% (its last sync)") instead of pairing the new chance with the old limit. Seen live when BTC went from 71% to 69.5% with no Stream up.

## 2026-11-17 15:36 · 7.8

(The 7.7 wording-pass times above ran ahead of the clock; this is the real local time.) `src/server/index.ts`: `demoView` returns more read-only fields for the new pages: post and delivery times, `deliveries` with the Stream delay, `asset`, `label`, `from`/`to`, and for the agent `threat`, `expectedLossUsd`, `reads` and `fill`. No change to the replay, the publisher or the policy.

## 2026-11-17 15:37 · 7.8

`demo/agent.html` rebuilt from `docs/design/Agent.dc.html` on the shared look; `demo/demo.css` and `demo/demo.js` lost the 7.5/7.6 code and gained the demo parts (header with progress and button, banner, flow, events, `bootDemo`). Ran it twice (Stream off 56 s, Stream on 56 s): 4 contracts for 2.00 USDC at the 50% post both times, 0 errors. Sent 2 USDC back to the agent with `fund:agent` between runs. Screenshots `docs/screenshots/7.8-agent-*.png`; ticked in `PLAN.md`.

## 2026-11-17 15:38 · 7.9

`demo/protocol.html` rebuilt from `docs/design/Protocol.dc.html`: banner that follows the pool, stacked chart, tier table from `tiersOf`, flow with the real Stream delay, live Aave V4 panel, events. The side card's three mockup paragraphs are merged into one (page rule 6). Ran it twice (Stream off 54 s, Stream on 55 s): 75% → 60% → 40% → paused, 0 errors. The Stream was up about 2.5 minutes and is deleted (0 left). Screenshots `docs/screenshots/7.9-protocol-*.png`; the screenshots of the old pages are removed; `README.md` and `CLAUDE.md` updated; ticked in `PLAN.md`.

## 2026-11-17 16:18 · plan

`PLAN.md`: added units 7.10 (faster, smoother demos), 7.11 (Oracle tab), 7.12 (BTC pools tab) and 7.13 (`npm run stream:demo`) after playtest 6c. The proposed 7.14 Live risk board is dropped; 7.12 replaces it (it was never written into the plan).

## 2026-11-17 16:27 · 7.10

`src/server/index.ts`: a replay posts about 8 of its changes (`pickPosts`), `DEMO_SECONDS` 50 → 22, the view carries the posts' planned hours (`plan`, `intervalMs`); a small `cached()` helper (advisor 60 s with a timer, `/api/oracle` 30 s, history 10 min). `demo/demo.js`, `demo/agent.html`, `demo/protocol.html`: the chart is drawn from a playhead that glides toward the next planned post on every frame. `demo/home.html`, `demo/demo.css`: last values from `localStorage`, card shapes while loading. Runs: agent 29 s, protocol 29 s, 0 errors.

## 2026-11-17 16:30 · 7.11

`config/markets.json`: seven more open Gemini markets, each with a `risk` text (nine in all). `demo/oracle.html` (new) at `/oracle`; `/api/history` takes any configured market; `/api/oracle` asks Gemini once per event and marks the agent's two markets `featured` for the home page. `src/shared/chain.ts`: `asDeployer` holds the lock directory `logs/deployer.lock` across processes; `scripts/fund-agent.ts` goes through it. A replay and a full oracle round ran together with 0 errors. One round: about 0.013 USDC.

## 2026-11-17 16:32 · 7.12

`demo/pools.html` (new) at `/pools`, `GET /api/pools` in `src/server/index.ts`: eight BTC-collateral markets (Aave V4 onchain, Aave V3 from `api.v3.aave.com`, Morpho from `api.morpho.org`), each cached 60 s and failing on its own, with the suggestion our tiers make for it. Read only. Tabs in `demo/demo.js` are now Overview, Oracle, BTC pools, Agent insurance, Protocol risk.

## 2026-11-17 16:36 · 7.13

`scripts/stream-demo.ts` (new), `package.json`: `npm run stream:demo` starts its own tunnel, creates the Stream with that address, and deletes it on Ctrl+C or when the tunnel dies. Tested with one protocol replay (27 s through the Stream) and both exit paths; 0 streams left. `CLAUDE.md`, `README.md`, `PLAN.md` updated; screenshots `docs/screenshots/7.10-*` to `7.12-*`.

## 2026-11-17 17:28 · 7.14

`src/server/index.ts`: the live feed (about 100 open Gemini crypto and economics contracts, read every 60 s), its poster (a move of 0.5 points or more, an hourly heartbeat, at most 95 posts an hour, none during a replay), `GET /api/feed` and `GET /api/feed/history`. `demo/oracle.html` rewritten as a scrolling feed with a sticky header, category filter, search and lazy two-line charts; `demo/demo.js` gets `howToggle`.

## 2026-11-17 17:28 · 7.15

`demo/pools.html` rewritten as an app: pool list, live settings, our adjustment, the animated picture, the 7-day chart, the "what if" slider. `/api/pools` now gives caps, utilization and a `ladder` per pool; Morpho's suggestion never goes below what is supplied and borrowed (`CAP_CUTS` removed).

## 2026-11-17 17:28 · 7.16

`demo/agent.html`: the workflow diagram (eight steps with the real calls, coins for the two payments), the chart as a side panel, "How the agent decides" expandable, "How the cover is bought" at the bottom, banner copy "about 30 seconds". `demo/demo.js`: `workflow` and `coin`; `demo/demo.css`; each read in the demo view carries its round and payment id.

## 2026-11-17 17:28 · 7.17

`demo/protocol.html`: the five-step workflow, the tiers as a staircase, a smaller chart, "What the loan limit is" expandable. Tested direct and through `stream:demo` (0 streams left). `PLAN.md` gets units 7.14 to 7.17; `CLAUDE.md` the Oracle scroll exception, the live feed fact, the feed routes and the new shared parts; screenshots `docs/screenshots/7.14-*` to `7.17-*` replace the 7.11 and 7.12 ones.

## 2026-11-17 18:44 · 7.18

`demo/oracle.html`: orange output, no math line, charts with our output as the main line and a dot per post, a result per row with the "Insurance agents | Lending pools" toggle, "Load more". `src/server/index.ts`: the feed keeps every open quoted market (216) beside the 100 it posts; `/api/feed` gives counts, tiers, the trigger and `LENDING_ASSETS`; `/api/feed/history` gives `ours`.

## 2026-11-17 18:44 · 7.19

`demo/pools.html`: `/pools` opens on a 3 × 3 grid of small cards; a card opens `/pools/:id` (new route) with "Back to all pools". The chance bar and slider moved above both views.

## 2026-11-17 18:44 · 7.20

`demo/agent.html` rebuilt around five large steps (watching, paying to read, deciding, buying cover, covered), three wallet totals, chart and events below, the two explanations behind header buttons. `workflow` in `demo/demo.js` takes `big` and `always`.

## 2026-11-17 18:44 · 7.21

"Protocol risk" removed from the tabs; the home link goes to `/pools/ours`. Our demo pool is the first card on `/pools` and its view runs the protocol replay with the workflow (`bootDemo` takes options). Two replays passed, one through `stream:demo`. `demo/protocol.html` kept: it is not committed yet. Screenshots `docs/screenshots/7.18-*` to `7.21-*` replace 7.14 to 7.16; `PLAN.md`, `CLAUDE.md` updated.

## 2026-11-18 04:30 · 8.0

Plan change: units 8.0, 8.0b and 8.0c added to `PLAN.md` as Phase 8.0, ahead of the guardrails (8.1 to 8.3, untouched). `PLAN.md` now opens with "Where we are" and lists finished units one line each.

## 2026-11-18 04:30 · 8.0

Cleanup, behaviour unchanged. Deleted: `demo/protocol.html` and its route, the `/demo` redirect, `flow` and `shortTx` in `demo/demo.js`, about 50 unused CSS rules, the advisor's unused `asset` and `pool` options, 35 superseded screenshots. Moved `docs/solana-option.md` and `docs/design/Protocol.dc.html` to `docs/archive/`.

## 2026-11-18 04:30 · 8.0

The top tier reads "No new borrowing" everywhere (`NO_NEW` in `demo/demo.js`; server `CUTS`, advisor, `/api/pools`, Oracle results, home rule bars, our pool, Lab, `scripts/demo.ts`). For Aave it is now the 25-point cut plus the borrow cap held at today's borrowing, not a freeze. The contracts are not changed: the tier's `paused` flag already refuses only new loans.

## 2026-11-18 04:30 · 8.0

No subheaders: stat boxes and captions on the home page became one line, the Oracle count moved beside the heading, banners are one line, the workflow's call sits at the foot of each card, and the agent page has one "How this works" button and one sentence a step. Checks: typecheck, 10 tests, fit at 1440×900 and 1920×1080, two agent replays (28 s and 27 s), one pool replay through `stream:demo` (25 s), 0 streams left. Screenshots retaken under stable names.

## 2026-11-18 04:30 · 8.0b

`README.md` rewritten for judges: what it is, a one-line mermaid diagram, screenshots, how to run it, a section per track with links to code and to transactions taken from `deployments/` and `logs/`, the stand-ins, what's next, credits. It says plainly that budgets, max price and approval are not built.

## 2026-11-18 04:30 · 8.0c

`docs/plan-agent-desk.md` written, nothing built. Research: Gemini's order endpoint and fields, its fee formula (0.07 × contracts × price × (1 − price) for takers), production eligibility, and a fresh sandbox listing: 33 of the feed's 100 symbols now exist there, including our BTC market.

## 2026-11-18 06:08 · 8.0d

Plan change: the agent desk goes ahead as units 8.0d to 8.0i in `PLAN.md` (two ways in, one desk; guardrails stay 8.1 to 8.3). New dependencies `@modelcontextprotocol/sdk` and `zod`, as agreed.

## 2026-11-18 06:08 · 8.0d

The desk: `src/desk/desk.json`, `cover.ts` (cover math through `policy.decide`, Gemini's taker fee) with 3 tests, `desk.ts` (`signUp`, `checkRisks`, `listContracts`, `quoteCover`), routes under `/api/desk`, `logs/desk.jsonl` pushed as `desk`. `DESK_SEED` (`new-keys`, `.env.example`, `deskKey` in `chain.ts`) gives a pool of 4 reusable wallets. `/odds/:symbol` now answers for any feed market; with `?source=feed` it uses the feed's value, so a desk read never waits behind Gemini's one call a second.

## 2026-11-18 06:08 · 8.0e

`buyCover` and `myCover` in `src/desk/desk.ts`, `GET /api/desk/order/:quoteId`; `placeLimitBuy` in `src/agent/trade.ts` takes a time in force. A purchase pays the premium through ProtectionBook from the agent's wallet (topped up from the treasury first), writes the order ticket and sends the same order to the sandbox. Tried by curl: 4 NO on BTC $67,500 for 3.12 USDC, sandbox order accepted.

## 2026-11-18 06:08 · 8.0f

The built-in demo agent: `runStep` and `runAll` in `src/desk/desk.ts`, routes `/next` and `/run`. An ETH agent stepped through all five steps in 20 s including its wallet's first funding: 5 paid reads, 8 contracts browsed, 3 NO on ETH $1,800 for 1.62 USDC, sandbox order open.

## 2026-11-18 06:08 · 8.0g

`src/desk/mcp.ts` (stdio, six tools, each one call to the desk API) and `npm run desk:mcp`. A headless Claude Code session given only this server signed up with $60 of BTC, paid 5 reads, chose BTC below $57,500 itself (our rule would hold there), and bought 6 NO for 0.66 USDC.

## 2026-11-18 06:15 · 8.0h

The Agents page: `demo/agents.html` at `/agents`, a fifth tab in `topBar` (`demo/demo.js`), its styles at the end of `demo/demo.css`. Agents on the left with "Create demo agent", the selected agent's line with Next and Run, its six-step timeline with links, the contracts it browsed, the desk's orders and events, and "Connect your agent" with the MCP line for Claude Code. `runAll` pauses 1.5 s after each step so the steps can be followed.

## 2026-11-18 06:15 · 8.0i

"What this means for Gemini" on the Agents page: six real counts from `deskView().stats` (the fee by `takerFee` per order) and a projection with three sliders, labelled "Projection". Screenshots `agents-1440` and `agents-1920`.

## 2026-11-18 06:15 · 8.0i

Records for 8.0d to 8.0i: `README.md` (the desk under Agentic Payments, Gemini, Stand-ins, env table, credits), `CLAUDE.md` (labels, pages, wallets, the Agent desk fact, commands and routes), `PLAN.md` ticks, a note at the top of `docs/plan-agent-desk.md`. Typecheck clean, 13 tests pass.

## 2026-11-18 06:20 · 8.0j

Bug first: the agent replay never bought because `buyProtection` reverted; the agent's wallet held 0.98 USDC and the premium is 2. `src/server/index.ts`: the treasury tops the agent up before an agent replay, and the replay view carries `error`, `tiers`, the wallet and the fill's Gemini fee. `PLAN.md` gets unit 8.0j.

## 2026-11-18 06:25 · 8.0j

`src/desk/desk.ts`: risk reads and the built-in pick prefer the latest expiry, the sign-up and buy lines carry balances, and `runAll` no longer pauses (the page paces the steps). `logs/desk.jsonl` moved aside to `logs/desk-tests-20261118.jsonl` so the desk starts empty.

## 2026-11-18 06:35 · 8.0j

New `demo/agents.html` and a new Agents section in `demo/demo.css`: the stage (who, status, progress bar, five connected steps, order and cover lines), the curved line to the feed row, the chart over the feed, one line of proven numbers, the agents drawer, and the Live / Replay switch. A cursor plays the recorded steps one at a time, about 3 s each.

## 2026-11-18 06:45 · 8.0j

Merged the replay in: `/demo/agent` redirects to `/agents#replay`, the Agent insurance tab is gone from `topBar`, `demo/agent.html` and `coin` are deleted, the home page's link and `scripts/demo.ts` point at the new place. Fixed a feed row class that clashed with the shared `.at` tile.

## 2026-11-18 06:58 · 8.0j

Checks: two replays and three demo agents followed start to finish in a headless page, one Claude Code agent over MCP shown as "Your agent"; typecheck clean, 13 tests pass. New screenshots `docs/screenshots/agents-live-*` and `agents-replay-*` replace `agent-*` and `agents-1440/1920`. `README.md`, `CLAUDE.md`, `PLAN.md` (8.0j ticked) and `LESSONS.md` updated.

## 2026-11-18 07:03 · plan

Plan change (docs only): units 9.0 to 9.5 added to `PLAN.md` as Phase 9 for the unattended batch. To keep numbers in build order the guardrails moved from 8.1–8.3 to 10.1–10.3, the old 9.1 README became 9.4, the old video unit 10.4 and the optional deploy 10.5; `CLAUDE.md` rule 4 and four code comments follow.

## 2026-11-18 07:06 · 9.0

Deleted what nothing uses after 8.0j: 34 lines of `demo/demo.css` (`.row-low`, `.storypanel`, `.wsteps.story`, `.wallets`, `.wallet`, `@keyframes got`: only the deleted Agent insurance page set these classes); the replay view's `threat`, `expectedLossUsd` and `cards` fields in `src/server/index.ts` (only that page read them); `stats` and `expectedLossUsd` in the desk view and the now unused `takerFee` import in `src/desk/desk.ts` (the page counts orders itself). Kept: the 1920 screenshots (CLAUDE.md asks for both sizes), `docs/design/Agent.dc.html` (still the look's source), type exports.

## 2026-11-18 07:07 · 9.0

`demo/agents.html`: the line reaches a low feed row down the gap between the panels instead of across the status rows; the "N agents → N contracts → $Y for Gemini" total is counted from the lines shown so far; "Start replay" clears the stage and says "Starting…" at once. Checked with one replay (Starting… at 0.3 s, Covered at the 50% post), typecheck clean, 13 tests pass, pages fit 1440×900.

## 2026-11-18 07:10 · 9.1

Audit, live checks: Gemini against `/api/feed` against `OddsFeed` for 15 markets; 286 onchain events (rounds, previous values, timestamps); all 1,415 logged feed posts against the posting rules; the TEST pool walked through every tier boundary; the Stream filter on four real transactions; pools against Aave's and Morpho's APIs; paid reads and Circle's settlement record. About 0.04 USDC of gas.

## 2026-11-18 07:13 · 9.1

Two bugs fixed. `src/server/index.ts`: the feed poster sends at most two posts a minute (`FEED_POSTS_PER_TICK`) instead of the whole hour's budget at once. `scripts/feed.ts`, `scripts/hello.ts`, `scripts/deploy.ts` and the Lab's `/api/ping` and `/api/test-move` now send through `asDeployer`; four processes at once all publish.

## 2026-11-18 07:16 · 9.1

Core logic made testable: `chanceOfBad` and `badOutcomeOf` in `src/oracle/odds.ts`, and a new `src/oracle/limits.ts` (`levelOf`, `aaveLadder`, `morphoLadder`, `lessUsd`); the server imports them, behaviour unchanged. New tests in `odds.test.ts`, `limits.test.ts`, `src/stream/filter.test.ts`: 13 → 29. Wrote `docs/oracle-audit.md`; three `LESSONS.md` entries.

## 2026-11-18 07:19 · 9.2

Data check: asked Gemini for each 2026 month-end BTC event and its candles. Only the current monthly market exists (listed Oct 31); earlier month ends were same-day markets with no usable candles. The year-long chain is BLOCKED by the data; one month is real.

## 2026-11-18 07:23 · 9.2

Built what the data supports. `src/server/index.ts`: `GET /api/pools/history` (the contract nearest 50% at the listing, its hourly closes). `demo/pools.html`: the history panel's "Since the market opened" switch. Screenshots `docs/screenshots/pools-month-1440.png` and `-1920.png`; `PLAN.md`, `CLAUDE.md`, `LESSONS.md` updated.

## 2026-11-18 07:26 · 9.3

New `scripts/preflight.ts` and `scripts/demo-reset.ts` (`npm run preflight`, `npm run demo:reset`), `desk.reset()` in `src/desk/desk.ts` and `POST /api/desk/reset` in the server, so the desk empties without a restart. Both run: seven PASS lines; desk log archived, agent and four desk wallets topped up, 0 Streams.

## 2026-11-18 07:33 · 9.3

End to end through `npm run stream:demo`: one live desk agent, the agent replay, the pool replay; 24 Stream deliveries, every trigger via the Stream; Ctrl+C left 0 Streams. Evidence added to `docs/oracle-audit.md`; `PLAN.md`, `CLAUDE.md`, `LESSONS.md` updated.

## 2026-11-18 07:36 · 9.4

Agents and one-pool screenshots retaken (one replay, one live agent). `README.md`: a "What is built" table, the full mermaid diagram, live and replay modes, Connect your agent, the audit link and its open findings under the safety limits, today's transactions, the month view, `preflight` and `demo:reset`.

## 2026-11-18 07:38 · 9.4

Clean-copy test: the repository's files (tracked and new, no `.env`, no `logs/`) copied to a temporary folder; `npm install`, `forge build`, typecheck, 29 and 18 tests pass; with fresh keys the Lab starts on other ports and every page answers 200. Wrote `docs/submission.md` and `docs/video-script.md`. Stale "Phase 7" comments in `ProtectionBook.sol` and `OddsFeed.sol` now say Phase 10 (comments only; the deployed contracts are unchanged).

## 2026-11-18 07:39 · 9.5

Wrote `docs/hosting-plan.md` (options, cost, keys, what Connect your agent needs remotely, risks). Nothing deployed. `PLAN.md` ticked for 9.4 and 9.5; "Where we are" updated; `CLAUDE.md` notes `FEED_POSTS_PER_TICK`.
