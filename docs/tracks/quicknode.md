# Bounty: QuickNode Streams

Website: https://web-production-195a7b1c.up.railway.app · Live demo: https://web-production-195a7b1c.up.railway.app/overview

What the bounty asks for, how the project meets it, and where to check. The requirements are the hackathon guide's, in our words.

| Requirement | How we meet it | Proof |
|---|---|---|
| Streams as a core data source | The Stream is how a post on Arc reaches the pool's keeper and the agents. Without it the live pool does not move and agents fall back to a 5-minute loop | [What each delivery triggers](#what-each-delivery-triggers) |
| At least one Stream with a filter and a destination | One Stream, a custom filter, a signed webhook | [`src/stream/filter.js`](../../src/stream/filter.js) · [`scripts/stream-up.ts`](../../scripts/stream-up.ts) · [the Stream panel](../screenshots/stream-panel-1440.png) |
| Explain the network, dataset, filter logic and destination, and why | The table below | |
| Objective: real-time apps that react to onchain events | The pool's limit changes 1 to 2 seconds after a post; the pages show the measured delay | [our pool's replay](../screenshots/our-pool-1440.png) |
| Objective: filters that turn raw data into what the app needs | The filter decodes logs into four small typed events | [`src/stream/filter.test.ts`](../../src/stream/filter.test.ts) |
| Objective: trigger automated actions | A delivery sends a `RiskSwitch.sync` transaction and starts agent runs | [a sync it triggered](https://explorer.testnet.arc.io/tx/0x1be0c1a3f87dbc35eaeffa28fd983c905a1a35ee89ae3912b2757af21544562c) |

## How the Stream is configured, and why

| | Setting | Why |
|---|---|---|
| Network | Arc testnet | Where the contracts are |
| Dataset | Logs | Everything we react to is an event: a post, a purchase, a transfer |
| Filter | `function main(stream)` in [`src/stream/filter.js`](../../src/stream/filter.js). It keeps logs from `OddsFeed`, `ProtectionBook` and `RiskSwitch`, and USDC transfers to or from the agent; decodes them; returns `oddsUpdated`, `bigMove` (a move of 5 points or more), `protectionBought`, `walletChange`. A block with none delivers nothing | The server gets only its own events, already decoded, and nothing to dedupe |
| Destination | A webhook: `POST /stream` on the server, through a cloudflared tunnel | The server is the keeper, so the event lands where the action is taken |
| Signature | Each delivery is checked: HMAC-SHA256 over nonce + timestamp + body with the Stream's token; anything else gets 401 | A forged delivery could otherwise start agent runs |

Why a Stream and not polling: Arc's public RPC rate-limits and a block arrives twice a second. Polling for logs every second, all day, would still be slower and would need its own decoding and deduplication.

## One delivery

As the webhook received it on Nov 18 (trimmed):

```json
[{ "type": "oddsUpdated", "symbol": "GEMI-BTC2611302200-HI67500",
   "probBps": 1500, "prevProbBps": 1500, "round": 17,
   "block": 72908775, "time": 1795034993,
   "tx": "0xdf323ad24b1fe0741d25043bb0a36e3ba162745ef9c43b3eddf821f600430352" }]
```

It arrived 1.75 s after the block.

## What each delivery triggers

| Event | What the server does |
|---|---|
| `oddsUpdated` | Calls `RiskSwitch.sync` for a pool that follows that market; a covered desk agent on that market re-checks ("Re-checked at 69%: still covered"); the pages update |
| `bigMove` | The same, and starts an agent run |
| `protectionBought` | Shows the purchase live |
| `walletChange` | Starts an agent run |

In one session on Nov 18 the Stream carried two live agents, two agent replays and the pool replay: 73 signed deliveries accepted, a forged one rejected ([audit](../oracle-audit.md#103-the-stream-webhook)).

## Cost, and when it runs

A Stream bills 20 API credits a block whatever the filter keeps, about 144,000 an hour on Arc. So locally it runs during demos: `npm run demo` starts it with the site and deletes it on Ctrl+C. For the judging period one Stream delivers to the hosted site's `/stream` (https://web-production-195a7b1c.up.railway.app). The top bar of every page shows whether it is on and its last delivery.

More: [stream.md](../stream.md).
