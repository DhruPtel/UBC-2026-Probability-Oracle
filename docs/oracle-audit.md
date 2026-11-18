# Oracle correctness audit

Unit 9.1, Wed Nov 18 2026, about 15:00 to 15:20 UTC. Everything here was checked against the running system on Arc testnet (chain 5042002) and the live Gemini API, not read off the code alone. Contract addresses are in [`deployments/arc-testnet.json`](../deployments/arc-testnet.json); transactions open at `https://explorer.testnet.arc.io/tx/<hash>`.

**Updated the same day (Phase 10, 19:20 to 19:45 UTC):** four of the six open findings are closed. `OddsFeed`, `RiskSwitch` and the pools were redeployed for it, so sections 1 to 11 describe the first contracts (the `…V1` keys in the deployment file) and the code as it was at 15:00; the section [Findings closed in Phase 10](#findings-closed-in-phase-10) says what changed and how it was proven.

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
| 8 | QuickNode Stream filter and webhook | Holds. The webhook was unauthenticated; **closed in Phase 10** |
| 9 | Pools and advisor numbers | Holds |
| 10 | Agent and desk: cover, fee, premium, order ticket | Holds |
| 11 | Unit tests | 13 → 29 TypeScript tests; 18 contract tests unchanged (30 and 20 after Phase 10) |

Open findings that were **not** fixed in the audit itself are listed at the end, each with its state after Phase 10.

## 1. Price → probability

**Claim.** The chance of YES is the middle of the best bid and best ask; if either is missing, the last trade; if there is no price, nothing is posted. Values are basis points.

**How.** Read [`src/oracle/odds.ts`](../src/oracle/odds.ts) and both callers; compared live values (section 3); added tests.

**Result.**

- `probability()` does exactly that. A one-sided book is never averaged: bid only → last trade, or nothing.
- The 5-minute loop (`npm run oracle`, nine markets) uses `probability()`, so it can fall back to the last trade (12 of 3,737 logged posts used it). The live feed (about 100 markets) lists only two-sided books and always posts the middle.
- **Wide books were not filtered.** A book of 0.05 / 0.95 posted 50%. Closed in unit 10.2: a book with a missing side or more than 10 points between the sides is not posted, so the last-trade fallback no longer reaches the chain either.
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

**Webhook.** A JSON array is recorded in `logs/stream.jsonl` and handled; junk is recorded and ignored; both answer HTTP 200. **The webhook has no authentication**: anyone who knows the tunnel's address can post events. An event cannot inject a value: the pool sync reads the chain, and the agent pays for its own read. It can only cause a sync or an agent run that would be correct anyway. Closed in unit 10.3: every delivery's signature is now verified.

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

## Open findings, and where they stand after Phase 10

| | Finding at 15:00 | Now |
|---|---|---|
| 1 | `OddsFeed.publish` and `RiskSwitch.sync` were open to any sender | **Closed** for `publish` (10.1). `sync` stays open on purpose, see below |
| 2 | `publish` accepted values above 10,000 bps | **Closed** (10.1) |
| 3 | No spread check, no staleness check, no smoothing | **Closed** for thin books and stale values (10.2). Smoothing is not built (planned, 11.3) |
| 4 | The Stream webhook was unauthenticated | **Closed** (10.3) |
| 5 | Without a running keeper, a pool's stored level lags | Open, by design: anyone may call `sync`, and `paramsOf` returns `syncedAt` so a reader can see the age |
| 6 | No budget, max price or owner approval on the agent or the desk | Open: planned as Phase 11, not built |

## Findings closed in Phase 10

### 10.1 Who may publish, and what

`OddsFeed` now has `publisher` (the deployer, immutable) and two checks at the top of `publish`: `msg.sender == publisher` ("only the publisher") and `probBps <= 10000` ("above 100%"). Two contract tests pin them (20 pass).

The feed was redeployed, and with it everything that holds its address: `RiskSwitch` (the feed is an immutable) and the four pools (the switch is an immutable; each opts in with its tiers in its constructor). `ProtectionBook` does not read the feed and stayed.

| Contract | New address | Deploy transaction |
|---|---|---|
| `OddsFeed` | `0x1857639d8e6b3db0c04aa1288afb278f848d7f6a` | `0x69875c97518a6aa6cad517338c94ceedb5dced9084e13eae2fc798431979228f` |
| `RiskSwitch` | `0x900f9f4406884c75ba124e661f858d6a38e9e620` | `0xb36472d7ad68479ef4ef1c723dda5be8a72ccb9555a5e895e3889b6fb60724ad` |
| `DemoLendingPool` (BTC market, NO) | `0xc23095a7f8932c8947b0f898ec57ee30a12c6e1e` | `0x59fccded3541c20c36c85190612a1c82aeabd52f828a763f269d0e309e6fed07` |
| the test pool (`test:demo`, YES) | `0xac1a328fafede307c34981997e5a86a949f2a742` | `0xb68c27d80a118877ecc2c0ee3fa49e38f16e258ba7db0fae78d227fe9824392e` |
| the BTC replay pool | `0x201cb68496959ccf555be97df91dff46d1c82289` | `0x81c9040f3f7b8c04feb92f44151e71c3547fe813143120d9a2ed4b1399cb0234` |
| the ETH replay pool | `0xbfe83bbb52e808121b936ef63bf68e1ba371c132` | `0x42897b3c1550e6cc1e45c41f689dd1c7dc0ec9ec47efd8da1d344e56199109c3` |

Each new pool's tiers were read back from the new switch: 0 → 75%, 50% → 60%, 70% → 40%, 85% → no new borrowing, the same as before.

**Proof, on the new feed.** Both transactions were sent with a fixed gas limit, so they were mined and show as reverted on the explorer. The round of `test:demo` was 0 before and 0 after.

| Attempt | Transaction | Result |
|---|---|---|
| A publish from the agent's wallet (`0xFfc1A84E…cbCF`, not the publisher) | `0x56cc92d70a76d369c38dc048379630188abbecb9e5ae0f75e803d33e1adf5d18` | reverted, "only the publisher" |
| A publish of 10,001 bps from the publisher | `0x72b7060aa56cab83ec296ba7d1956ee6bf4a9225192fefeb26d5ec414eeedda6` | reverted, "above 100%" |

**Why `sync` stays open.** `sync(pool)` takes no value from its caller. It reads the feed, which now accepts posts from the publisher alone, and applies the pool's own tiers. The worst a stranger can do by calling it is bring a pool up to date, at their own cost. Limiting it to one keeper would take nothing away from an attacker and would add a failure: if that keeper stops, every pool's level freezes. An open `sync` is also how finding 5 is answered: a pool that cares can call it itself before a loan.

**What this leaves.** One key is the publisher, and it cannot be changed: a lost key means a new feed. There is no second publisher, no pause and no dispute step.

### 10.2 Thin books and stale values

- **Thin** (`thin()` in [`src/oracle/odds.ts`](../src/oracle/odds.ts), with tests): no bid, no ask, or more than 10 points between them. Exactly 10 points passes; 11 does not. All three posting paths check it: the live feed, the 5-minute loop and the paid read. A thin market keeps its last onchain value; the paid read's answer says `thin` and why, and the agent holds on it.
- **Stale** (`staleOf` in the server): a posted value more than 15 minutes old that Gemini's middle has since moved half a point or more away from, or any value when Gemini itself has not been read for 15 minutes. A value that is old but still equal to Gemini's is not marked: the feed re-posts unchanged values only once an hour, so marking by age alone would label most of the feed.
- **On the pages:** "Too thin to post" and "Stale" on the Oracle tab's rows; "Stale" beside the posted time on the home page and beside the chance on BTC pools.
- **The desk** leaves thin and stale markets out of what it offers (`matching` in `desk.ts`), so an agent is never handed one.

Checked live at 19:27 UTC: of 100 feed markets one was thin, `GEMI-GDP2026-36TO40` at 0.02 / 0.44 (42 points apart). It shows "Too thin to post" and has no post on the new feed. Two demo agents and one Claude Code agent then ran without an error.

Not checked onchain: the contract does not know a value's age or its book. A contract that reads the feed sees `observedAt` and `publishedAt` and must set its own limit on age.

### 10.3 The Stream webhook

QuickNode signs each delivery with the Stream's security token: header `X-QN-Signature` = HMAC-SHA256 over nonce + timestamp + body, in hex ([QuickNode's guide](https://www.quicknode.com/guides/quicknode-products/streams/validating-incoming-streams-webhook-messages)). `stream:up` keeps the token in `logs/stream-token.txt` (gitignored, never printed) and `stream:down` removes it. The webhook recomputes the signature for every delivery, compares in constant time, and answers 401 to anything else, with a `rejected` line in `logs/stream.jsonl` (the reason and the size, not the body). Nothing in a rejected delivery is acted on.

| Test | Result |
|---|---|
| A delivery with no Stream up (no token on file) | 401, "no Stream is up" |
| Stream `9abf1b17-…` up (19:32 to 19:43 UTC): 73 real deliveries | all accepted; two agent replays and the pool replay were triggered through it (`via: "stream"`, no direct fallback) |
| A delivery with `X-QN-Signature` set to a wrong value | 401, "bad signature" (`logs/stream.jsonl`, 19:33:03 UTC) |
| A delivery with no signature headers | 401, "no signature headers" |

Not checked: the timestamp's age. A captured delivery could be sent again; it would start the same sync or agent run that reads the chain for itself, as section 8 describes.

### The rerun after the changes (19:32 to 19:43 UTC)

`npm run preflight` 7 PASS. Two live desk agents (premiums `0x706962cf580f040c8dff3d03f96b68832ae633ed03637b527a57e6b8c2629af5` for 4 NO on BTC below $65,000 and `0x8aaa566e58934c4803e8222fc9734dde944d9ac57dbc12ea8067f2ae0dc7a2f9` for 6 NO on ETH below $2,000). Two agent replays (each bought 4 contracts at the 50% post). The pool replay (75% → 60% → 40% → no new borrowing; the last sync `0x1be0c1a3f87dbc35eaeffa28fd983c905a1a35ee89ae3912b2757af21544562c`). One Claude Code agent over MCP (premium `0xa2f941bda540c1607638f21b6c696a4002a03ffea35d4ba36ea6b191c17f9bd5`). After Ctrl+C: 0 Streams left.

One thing seen and not changed: a replay's summary printed "0.005 USDC for 4 reads". The fifth read was a normal agent run on the live Fed market that started seconds before the replay and paid from the same Gateway balance.

## How to repeat this

`npm test` and `forge test --root contracts` cover the logic. The live checks used `GET /api/feed`, `GET /api/pools`, `npm run feed <symbol>`, `npm run pay-read -- <symbol>`, `npm run feed -- publish test:demo <percent>`, and Circle's public record at `https://gateway-api-testnet.circle.com/v1/x402/transfers/<id>`. The audit spent about 0.04 testnet USDC.
