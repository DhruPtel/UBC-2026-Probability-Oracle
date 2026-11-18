# Oracle correctness audit

Unit 9.1, Wed Nov 18 2026, about 15:00 to 15:20 UTC. Everything here was checked against the running system on Arc testnet (chain 5042002) and the live Gemini API, not read off the code alone. Contract addresses are in [`deployments/arc-testnet.json`](../deployments/arc-testnet.json); transactions open at `https://explorer.testnet.arc.io/tx/<hash>`.

## Summary

| | Area | Result |
|---|---|---|
| 1 | Price → probability | Holds. Edge cases now pinned by tests |
| 2 | The flip to the bad outcome | Holds |
| 3 | OddsFeed against Gemini; rounds; timestamps | Holds, within the posting rules |
| 4 | Move threshold, heartbeat, hourly budget | **Bug found and fixed:** the hour's budget went out in one burst |
| 5 | The cross-process deployer lock | **Bug found and fixed:** five deployer sends skipped it |
| 6 | x402 paid reads and settlement | Holds for the nine loop markets and the replays. **Claim narrowed** for other feed markets |
| 7 | RiskSwitch tiers and the demo pool | Holds. Two notes on what "refuses" and "follows" mean |
| 8 | QuickNode Stream filter and webhook | Holds. The webhook is unauthenticated (known, Phase 10) |
| 9 | Pools and advisor numbers | Holds |
| 10 | Agent and desk: cover, fee, premium, order ticket | Holds |
| 11 | Unit tests | 13 → 29 TypeScript tests; 18 contract tests unchanged |

Open findings that were **not** fixed, because they are the guardrails planned for Phase 10 (units 10.1 to 10.3 in [`PLAN.md`](../PLAN.md)), are listed at the end.

## 1. Price → probability

**Claim.** The chance of YES is the middle of the best bid and best ask; if either is missing, the last trade; if there is no price, nothing is posted. Values are basis points.

**How.** Read [`src/oracle/odds.ts`](../src/oracle/odds.ts) and both callers; compared live values (section 3); added tests.

**Result.**

- `probability()` does exactly that. A one-sided book is never averaged: bid only → last trade, or nothing.
- The 5-minute loop (`npm run oracle`, nine markets) uses `probability()`, so it can fall back to the last trade (12 of 3,737 logged posts used it). The live feed (about 100 markets) lists only two-sided books and always posts the middle.
- **Wide books are not filtered.** A book of 0.05 / 0.95 posts 50%. This is the "thin market" check of unit 10.3, not built. A test documents today's behaviour.
- **Rounding.** `toBps = Math.round(prob × 10000)`. Gemini quotes whole cents, so a middle is a multiple of 0.005. A test walks every bid/ask pair from 0.01 to 0.99 (4,949 pairs) and gets a whole number of half points each time: no float drift.
- A bid of `"0"` is treated as a price (0), an empty string as missing.

## 2. The flip to the bad outcome

**Claim.** OddsFeed stores the chance of YES. A reader gets the chance of the bad outcome where one is clear (for "BTC $67,500 or above", the bad outcome is NO, so the output is 100% − YES), else the chance of YES.

**How.** Moved the rule into pure functions (`chanceOfBad`, `badOutcomeOf` in `odds.ts`) and tested them; compared 15 live markets.

**Result.** Holds. Live at 15:07 UTC:

| Market | Gemini bid / ask | YES | Bad side | Our output |
|---|---|---|---|---|
| BTC $67,500 or above, Nov 30 | 0.20 / 0.22 | 21% | NO | 79% "BTC ends below $67,500" |
| ETH $2,000 or above, Nov 30 | 0.10 / 0.11 | 10.5% | NO | 89.5% |
| Fed hikes in December | 0.90 / 0.93 | 91.5% | YES | 91.5% |
| S&P 8,000 or above this year | 0.07 / 0.12 | 9.5% | none | 9.5% "chance of YES" |
| Strait of Hormuz normal before Jan 1 | 0.02 / 0.05 | 3.5% | none | 3.5% "chance of YES" |

The patterns: "`<asset> price on <date>`" with "`$X or above`" → NO is bad; a label with "hike", a title with "recession", or a label ending "or below" → YES is bad; anything else has no bad side. The nine configured markets carry their side in `config/markets.json`. The onchain `RiskSwitch` does the same flip (`harmfulSide`), checked in section 7.

## 3. OddsFeed against Gemini; rounds; timestamps

**How.** For the nine loop markets and six feed markets: one direct Gemini read, the Lab's `/api/feed`, and `OddsFeed.latestBySymbol` onchain, within one minute. Then every `OddsUpdated` event of the last 9,000 blocks.

**Result.**

- The feed's value equalled Gemini's middle for 14 of 15 markets; the 15th had moved one point in the minute between the two reads.
- Onchain values of the nine loop markets were 0 to 2 points from Gemini, all posted 4 to 5 minutes earlier (the loop's interval). Example: `GEMI-BTC2611302200-HI67500` Gemini 2100, onchain 2200, round 432, observed 15:03:19, block time 15:03:20.
- Onchain values of feed markets were up to 2 points behind and 29 minutes old. That led to finding 4.
- **Rounds and history, from the chain:** 286 events over blocks 72,859,211 to 72,868,211, 85 symbols, 201 consecutive pairs. Round not +1: **0**. `prevProbBps` not the value before: **0**. `observedAt` going backwards on a live symbol: **0**. One publisher only: the deployer `0x96fF…8400`.
- **Timestamps.** `observedAt` is when we read Gemini; `publishedAt` is the block time. For live posts they are about a second apart. For a `replay:` symbol `observedAt` is the replayed hour (Nov 12 to 15), by design.
- The log file `logs/oracle.jsonl` is not a complete history (27 round gaps: test publishes and early posts were not logged). The chain is the record.

## 4. Move threshold, heartbeat, hourly budget

**Claim.** A feed market is posted when it has moved 0.5 points or more since its last post, and once an hour, with at most 120 feed posts in any hour.

**How.** Classified all 1,415 logged feed posts.

**Result.** First post 140, moved 0.5 points or more 837, heartbeat 438, **neither 0**. Most posts in any hour: **120**. The rules hold.

**Bug.** The budget was spent as fast as posts could be sent. At 15:08 UTC the last hour held 120 posts, 44 of them in the last 30 minutes and none in the last 10: after a burst the feed posted nothing for half an hour, while `GEMI-BTC2611302200-HI60000` sat 2 points from Gemini (7700 onchain, 7900 live, last post 14:39).

**Fix.** `postFeed` now sends at most two posts a minute (`FEED_POSTS_PER_TICK` in `src/server/index.ts`), largest moves first. Same hourly budget and gas; no blackout. Markets that have not moved wait longer for their heartbeat, which is the right way round. See `LESSONS.md`.

## 5. The cross-process lock

**Claim.** Every deployer transaction, in any process, waits for `logs/deployer.lock`.

**How.** Three processes published in the same instant.

**Result. Bug.** One of the three failed with a nonce error. `scripts/feed.ts` (publish), `scripts/hello.ts`, `scripts/deploy.ts` and the Lab's `/api/ping` and `/api/test-move` sent as the deployer without `asDeployer`. The oracle loop, the feed poster, the replays, the desk and `fund:agent` were already behind the lock.

**Fix.** All five go through `asDeployer`. Re-test with four processes at once: four of four published (`0x3760fb19…`, `0x3e48557e…`, `0x374ae7bd…`, `0x599e262b…`).

## 6. x402: paid reads and settlement

**How.** Paid for reads with `npm run pay-read`, compared with the chain, and followed transfers in Circle Gateway's public record.

**Result.**

- **A loop market's paid read is the onchain value.** `GEMI-BTC2611302200-HI65000`: the paid body said 4000 bps, round 153, tx `0x6afea07f47fbea9032f728a18227423b21e2e06e2356d8d7dc87544a52b423d1` (the read itself published, because Gemini had moved from 4050). `latestBySymbol` then: 40%, round 153, the same source hash.
- **A replay symbol's paid read is the onchain value** (`replayRead` reads the contract).
- **Claim narrowed: other feed markets.** The desk reads with `?source=feed`, which answers with the feed's last Gemini value (under a minute old) and the round of the last post, and does not publish. `GEMI-BTC2611302200-HI60000` returned 7900 while the chain held 7700. The body says so (`"method": "feed"`, `"prevProbBps": 7700`, `"txHash": null`), but "a paid read returns the onchain value" is only true for the nine loop markets and the replays. The README now says this. With fix 4 the gap closes within a minute or two for anything that moved.
- **Payments settle.** Transfer [`ec909ce1-…`](https://gateway-api-testnet.circle.com/v1/x402/transfers/ec909ce1-8e6b-42b5-9037-9bb6414a0b71): `completed`, 0.001 USDC from the agent to the seller, settled 4.5 minutes after it was accepted, in tx `0x02254bae5ec129ae717971cf725268eca247272d386f77f7f4f40015a2418c69` (success, block 72,589,474, to Circle's Gateway contract `0x0077777d…19b9`).
- **A settled batch.** Two reads from this audit, accepted at 15:05:35 and 15:10:57 ([`c683327d-…`](https://gateway-api-testnet.circle.com/v1/x402/transfers/c683327d-fd42-4bff-ba62-809a38e48a16), [`08c4f29a-…`](https://gateway-api-testnet.circle.com/v1/x402/transfers/08c4f29a-e265-44ee-9093-34a9e245482a)), both became `completed` at 15:12:03 in **one** transaction: `0x20e3339be04d92bef7e0ac0a503a2b3933fc96e97f8e8a30b9cea5775993dfe0`. A read is accepted at once (`received`) and settles onchain minutes later.

## 7. RiskSwitch and the demo pool

**How.** Read `tiersOf` for all four pools. Then walked the `TEST` pool (`0x9ff1…158f`, market `test:demo`, YES is bad) through the boundaries: publish, `sync`, read `paramsOf` and `canBorrow`, simulate `borrow`.

**Result.** All four pools hold the same tiers: 0 → 75%, 50% → 60%, 70% → 40%, 85% → no new borrowing. A tier starts exactly at its threshold:

| Chance | Level | Limit | `canBorrow($100, $30)` | sync tx |
|---|---|---|---|---|
| 40% | 0 | 75% | yes, max $75 | `0x0f8a8341…` |
| 49.99% | 0 | 75% | yes, max $75 | `0x109e85de…` |
| 50% | 1 | 60% | yes, max $60 | `0x1a3a6fb3…` |
| 69.99% | 1 | 60% | yes, max $60 | `0x71299021…` |
| 70% | 2 | 40% | yes, max $40 | `0x638333f8…` |
| 84.99% | 2 | 40% | yes, max $40 | `0x7434dfcf…` |
| 85% | 3 | no new borrowing | no: "borrowing is paused"; `borrow` reverts | `0x8579c012…` |
| 100% | 3 | no new borrowing | no; `borrow` reverts | `0x0e8ee5e5…` |
| 40% again | 0 | 75% | yes, max $75 | `0x0cc1be23…` |

The level comes back down when the chance does. The 18 contract tests pass.

**Two notes.**

- **"Refuses only new loans" is true by construction.** `DemoLendingPool` is a `DEMO`: it holds no tokens and has no deposit, repay or withdraw function. The only thing it can do is record or refuse a new loan. Nothing else exists to be frozen.
- **A pool follows the odds only when someone calls `sync`.** The Lab is the keeper: it syncs on each Stream event for the pool's market, and directly during a replay. With no Stream up, the live `DemoLendingPool` is not synced: at audit time its last sync was 12.5 hours old (harm 74%, level 2) while the live chance was 79.5% (also level 2). The pages read the live chance from the feed, so they were right; the contract's stored level would lag if a tier were crossed with no Stream.

## 8. QuickNode Stream: filter and webhook

**How.** Ran `src/stream/filter.js` on the real logs of four of our transactions; added tests that build each event with viem from its signature; posted to the webhook by hand. Then ran `npm run stream:demo` for three minutes with three demos (unit 9.3).

**Result.**

| Transaction | Decoded as |
|---|---|
| a publish, `0x6afea07f…` | `oddsUpdated` `GEMI-BTC2611302200-HI65000` 4050 → 4000, round 153 |
| a 9-point move, `0x75bd8127…` | `bigMove` `replay:GEMI-BTC2611302200-HI67500` 5000 → 4100, round 248 |
| a sync, `0x09bb88c2…` | `riskLevelChanged` level 0 → 1, harm 5000, protocol `0x3a21…1ee6` |
| the agent's premium, `0x11c50c55…` (3 logs) | `walletChange` out, 2,000,000 units to the treasury, and `protectionBought` id 32, 4 NO, premium 2,000,000 |

Every value matches the transaction. The filter's three contract addresses equal the deployment file (now a test). A block with nothing of ours returns `null` (no delivery).

**A real Stream, end to end (15:26 to 15:30 UTC).** `npm run stream:demo` opened its own tunnel and created Stream `10546200-…` from block 72,870,375. With it up: one live desk agent (premium tx `0xaa04ce9f2b2385f9883f25deb3082e9ae4bd6573d384fa29156315b6ba71468a`), the agent replay (bought at the 50% post, round 255, `0xd16112f3…`) and the pool replay (75% → 60% → 40% → no new borrowing). QuickNode delivered 24 batches: 14 `bigMove`, 2 `oddsUpdated`, 6 `riskLevelChanged`, 2 `walletChange`, 1 `protectionBought`; every trigger in both replays came through the Stream (`via: "stream"`), none through the direct fallback. On Ctrl+C: `delete 10546200-…: HTTP 200`, `streams left on the account: 0`; `npm run preflight` then printed `PASS  Streams    0 up`. The first start that day failed ("The tunnel stopped", cloudflared exited before giving an address) and left nothing behind; the second worked.

**Webhook.** A JSON array is recorded in `logs/stream.jsonl` and handled; junk is recorded and ignored; both answer HTTP 200. **The webhook has no authentication**: anyone who knows the tunnel's address can post events. An event cannot inject a value: the pool sync reads the chain, and the agent pays for its own read. It can only cause a sync or an agent run that would be correct anyway. Limiting who may trigger is unit 10.3.

## 9. Pools and advisor

**How.** Compared `/api/pools` with Aave's and Morpho's own APIs at the same moment, and recomputed every ladder.

| Pool | Their API | Ours |
|---|---|---|
| Aave V3 Ethereum WBTC | maxLTV 0.81, liquidation threshold 0.85, size $2,220,328,738 | limit 8100, liquidation 8500, collateral $2,220,328,738 |
| Aave V3 Base cbBTC | maxLTV 0.81, threshold 0.84, size $211,573,822 | 8100, 8400, $211,573,822 |
| Morpho Base cbBTC / USDC (`0x9103c3b4…`) | LLTV 0.86, collateral $2,601.9M, borrowed $1,527.8M | 8600, $2,608.6M, $1,527.8M (read up to 60 s apart) |

Aave V4 on Arc is read from the Main Spoke contract itself (collateral factor 78%, 1,271.7 cirBTC supplied, 1.12 borrowed, borrow cap 220); there is no second source to compare with, so that row is as good as the contract read.

**The limit math**, at level 2 (chance 79.5%): Aave limit − 25 points (7800 → 5300, 8100 → 5600); Morpho never below today's use (8600 → 5857 where 58.57% of the collateral's value is borrowed). "$ less new lending" = collateral × (limit − suggested) ÷ 10,000. All eight cards recomputed to the same numbers. This is the most that could no longer be borrowed against that collateral, an upper bound, not a forecast. The math now lives in [`src/oracle/limits.ts`](../src/oracle/limits.ts) with tests.

## 10. Agent and desk

- **Cover.** needed = ceil(value × shock × hedgeRatio), each contract pays $1. Tests in `policy.test.ts` and `cover.test.ts` (a $40 holding at 10% → 4 contracts; float noise does not add a contract). In the replay: $31.78 × 10% → 4 contracts; onchain event `protectionBought` 4 NO.
- **Premium.** contracts × price, in USDC base units rounded up. The replay's 4 × $0.50 moved exactly 2,000,000 units (the `walletChange` above).
- **Gemini's fee.** [gemini.com/fees/predictions](https://www.gemini.com/fees/predictions) (schedule dated March 12, 2026): taker fee = 0.07 × C × P × (1 − P), rounded up to the next cent. Gemini's own examples, 100 contracts at $0.40 → $1.68 and at $0.90 → $0.63, are tests and pass. We show the taker fee; a resting order would pay the maker rate (0.0175), so ours is the higher of the two.
- **Order ticket.** Gemini's docs for `POST /v1/prediction-markets/order` require `symbol`, `orderType`, `side`, `quantity`, `price`, `outcome`; `timeInForce` is optional (`good-til-cancel` default). Our ticket: `{"symbol":"GEMI-ETH2611302200-HI2000","orderType":"limit","side":"buy","outcome":"no","quantity":"6","price":"0.90","timeInForce":"good-til-cancel"}`: the same fields, types and values. The same body was accepted by Gemini's sandbox (order `145853902321840045`, status `open`). The ticket itself is never sent to production.

## 11. Tests added

`npm test`: 13 → 29.

- `src/oracle/odds.test.ts`: one-sided and wide books, a zero bid, every cent pair's rounding, the flip, which outcome is bad.
- `src/oracle/limits.test.ts` (new): tier boundaries, Aave and Morpho ladders, "$ less new lending".
- `src/stream/filter.test.ts` (new): each event type, big-move boundary, the agent's transfers only, deployed addresses.
- Cover math and the fee were already covered (`policy.test.ts`, `cover.test.ts`).

## Open findings, left for Phase 10

1. `OddsFeed.publish` and `RiskSwitch.sync` are open to any sender. All 286 recent events came from our deployer, but nothing enforces it.
2. `publish` accepts values above 10,000 bps. For a NO-side pool `sync` would then revert (10000 − probBps underflows), so the level would freeze rather than go wrong.
3. No spread check, no staleness check, no smoothing (unit 10.3).
4. The Stream webhook is unauthenticated (section 8).
5. Without a running keeper, a pool's stored level lags (section 7).
6. No budget, max price or owner approval on the agent or the desk (units 10.1, 10.2).

## How to repeat this

`npm test` and `forge test --root contracts` cover the logic. The live checks used `GET /api/feed`, `GET /api/pools`, `npm run feed <symbol>`, `npm run pay-read -- <symbol>`, `npm run feed -- publish test:demo <percent>`, and Circle's public record at `https://gateway-api-testnet.circle.com/v1/x402/transfers/<id>`. The audit spent about 0.04 testnet USDC.
