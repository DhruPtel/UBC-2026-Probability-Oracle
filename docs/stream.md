# The QuickNode Stream

What the Stream does for the project, what a delivery looks like, what would break without it, and what it costs. The short version is in the [README](../README.md#the-pieces).

## What it is

- **Network:** Arc testnet. **Dataset:** Logs. QuickNode reads the logs of every block, about two blocks a second.
- **Filter:** [`src/stream/filter.js`](../src/stream/filter.js), a `function main(stream)` that runs on QuickNode. It keeps logs from `OddsFeed`, `ProtectionBook` and `RiskSwitch`, and USDC transfers to or from the agent, decodes them by hand and returns small typed events. A block with none delivers nothing.
- **Destination:** a webhook, `POST /stream` on port 8788 of the server, reached through a cloudflared tunnel.
- **Lifecycle:** created by [`scripts/stream-up.ts`](../scripts/stream-up.ts) through the Streams REST API, deleted by [`scripts/stream-down.ts`](../scripts/stream-down.ts). `npm run demo` starts the site and the Stream together and deletes the Stream on Ctrl+C.

## The events

| Event | From | What the server does with it |
|---|---|---|
| `oddsUpdated` | `OddsFeed.OddsUpdated` | Calls `RiskSwitch.sync` for a pool that follows the market; a covered desk agent on that market re-checks |
| `bigMove` | The same log, when the value moved 5 points or more | All of the above, and starts an agent run |
| `protectionBought` | `ProtectionBook.ProtectionBought` | Shows the purchase live |
| `walletChange` | A USDC transfer to or from the agent | Starts an agent run |

The filter also passes a fifth type, `riskLevelChanged` (`RiskSwitch.RiskLevelChanged`): the record that a pool's tier moved. Nothing is triggered by it.

## One delivery

A post of `GEMI-BTC2611302200-HI67500` on Nov 18, as the webhook received it (from `logs/stream.jsonl`):

```json
[{ "type": "oddsUpdated", "symbol": "GEMI-BTC2611302200-HI67500",
   "probBps": 1500, "prevProbBps": 1500, "round": 17,
   "block": 72908775, "time": 1795034993,
   "tx": "0xdf323ad24b1fe0741d25043bb0a36e3ba162745ef9c43b3eddf821f600430352" }]
```

The block's time was 20:49:53 UTC and the webhook received it at 20:49:54.75, so 1.75 s later. Our pool's view prints the measured delay of each sync ("Delivered 1.1 s after the block").

## The signature

Every delivery carries `X-QN-Signature`: HMAC-SHA256 over `X-QN-Nonce` + `X-QN-Timestamp` + the body, keyed with the Stream's security token. `stream:up` keeps the token in `logs/stream-token.txt` (gitignored, never printed). The webhook answers 401 to anything unsigned or wrongly signed and records a `rejected` line.

On Nov 18 one `stream:demo` session carried two live desk agents, two agent replays and the pool replay: 73 signed deliveries accepted, every trigger through the Stream, a forged delivery rejected, and no Stream left afterwards ([audit](oracle-audit.md#103-the-stream-webhook)). The filter is tested against each event type in [`src/stream/filter.test.ts`](../src/stream/filter.test.ts).

## Why a Stream and not polling

Arc's public RPC rate-limits, and a block arrives twice a second. To react within a second or two by polling, the server would call `getLogs` for three contracts and one wallet every second, all day, and still decode and deduplicate the results itself. The Stream turns that around: QuickNode reads every block, runs our filter next to the data and calls us only when one of our events happened.

## What stops or slows down without it

- **The live demo pool** moves only when someone calls `sync` by hand.
- **A covered desk agent** no longer re-checks its cover on a new post. "Re-checked at 69%: still covered" is a Stream delivery.
- **The BTC agent** stops reacting to big moves and wallet changes and falls back to its 5-minute loop: up to five minutes, not about a second.
- **The two replays** keep working on a direct trigger, and the page says "direct trigger".
- **The pages** still update, because they follow the server's own records.

## What it costs, and why it is on only for demos

A Stream bills per block whether or not the filter keeps anything: 20 QuickNode API credits a block for Arc testnet logs ([QuickNode's billing table](https://www.quicknode.com/docs/streams/billing)). At about 2 blocks a second that is about 144,000 credits an hour and 3.5 million a day.

This account's plan has 80 million credits a billing period, so an hour is under 0.2% of it and a full day about 4%. The figure comes from the price table: QuickNode's usage counter had not yet moved 15 minutes after a 9-minute run.

So the Stream is on for demos and off otherwise. `npm run demo` deletes it on Ctrl+C, `npm run preflight` fails while one is up, and the top bar of every page shows "QuickNode Stream: on" with the last delivery time, or "off: start with npm run demo". Clicking it opens what the Stream watches and its last 10 deliveries with their delay.
