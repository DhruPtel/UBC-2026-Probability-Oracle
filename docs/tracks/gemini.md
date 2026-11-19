# Bounty: Gemini Prediction Markets

What the bounty asks for, how the project meets it, and where to check. The requirements are the hackathon guide's, in our words. Data provided by Gemini.

| Requirement | How we meet it | Proof |
|---|---|---|
| Use the Gemini Prediction Markets API (market data and/or trading) | Both: live market data every minute, hourly candles, and signed orders on the sandbox | [Endpoints](#endpoints-we-call) below |
| Objective: track how odds move over time | A 7-day chart per market on the Oracle tab; a pool's month since Gemini listed its market | [`/oracle`](../screenshots/oracle-1440.png) · [`/pools/:id`](../screenshots/pools-month-1440.png) |
| Objective: agents that act on prediction-market data | An agent reads the chance, picks a contract and buys cover with it | [`src/desk/desk.ts`](../../src/desk/desk.ts) · [screenshot](../screenshots/agents-decision-1440.png) |
| Objective: bring the data into onchain applications | About 100 markets posted on Arc as chances; a lending pool's limit follows one | [`OddsFeed`](https://explorer.testnet.arc.io/address/0x1857639d8e6b3db0c04aa1288afb278f848d7f6a) · [a post](https://explorer.testnet.arc.io/tx/0xfc51ab1cb85157f068924d884fc4a4774d34de267c40031dee32286185fc66a0) |
| Objective: help users understand markets | Each market is shown as the chance of its bad outcome, in words: "Chance BTC ends below $67,500 on Nov 30" | [`/oracle`](../screenshots/oracle-1440.png) |

## Endpoints we call

| Endpoint | For | Code |
|---|---|---|
| `GET /v1/prediction-markets/events` (and `/events/:ticker`, `/categories`) on `api.gemini.com` | Every open contract in Crypto, Economics, Economy and Finance, each minute: best bid, best ask, last trade | `getEvents`, `getEvent`, `getCategories` in [`src/oracle/gemini.ts`](../../src/oracle/gemini.ts) |
| `GET /v2/candles/<instrumentSymbol>/1hr` and `/1day` | Hourly history: the 7-day charts, the two replays, the pool's month | `getCandles` in [`src/oracle/gemini.ts`](../../src/oracle/gemini.ts) |
| `GET /v1/prediction-markets/events` on `api.sandbox.gemini.com` | Which contracts the sandbox lists today | `listEvents` in [`src/agent/trade.ts`](../../src/agent/trade.ts) |
| `POST /v1/prediction-markets/order` (sandbox, signed) | The agent desk's order, where the sandbox lists the contract | `placeLimitBuy` in [`src/agent/trade.ts`](../../src/agent/trade.ts), called from `sandboxOrder` in [`src/desk/desk.ts`](../../src/desk/desk.ts) |
| `/v1/prediction-markets/orders/active`, `/orders/history`, `/positions` (sandbox, signed) | Order status and positions | `getOrder`, `positions` in [`src/agent/trade.ts`](../../src/agent/trade.ts) |

Public calls are kept to one a second. The fee on each order follows Gemini's [published formula](https://www.gemini.com/fees/predictions) ([`src/desk/cover.ts`](../../src/desk/cover.ts)).

## What we built on it

- **An oracle.** The chance of YES is the middle of the best bid and ask. A book with a side missing or more than 10 points wide is not posted ([`src/oracle/odds.ts`](../../src/oracle/odds.ts)).
- **Odds over time.** Every market has its 7 days of hourly closes beside every value we posted.
- **Agents that act on it.** An agent compares Gemini's contracts by chance and price, and its order is the exact body Gemini's order API takes, at the live price.
- **The data onchain.** `OddsFeed` on Arc holds the latest chance per market, free for any contract to read. The risk switch is the first reader.

## One example

Gemini's "BTC at or above $67,500 on Nov 30" had YES at $0.14 bid, $0.16 ask. The midpoint, 15%, was posted on Arc as 1500 basis points ([transaction](https://explorer.testnet.arc.io/tx/0xfc51ab1cb85157f068924d884fc4a4774d34de267c40031dee32286185fc66a0)). For a BTC holder that is an 85% chance of the bad outcome.

A desk agent then bought cover on a Gemini contract, and its order went to the sandbox as: buy, outcome no, limit price, good-til-cancel. The panel on the Agents page shows the order and its status ([screenshot](../screenshots/agents-order-1440.png)).

## What is a stand-in

No order goes to Gemini's production exchange: that needs a verified, funded US account. The production order is a ticket that is not sent, and sandbox prices are unrelated to real ones. Republishing Gemini's data publicly is a question of Gemini's terms, which the team accepts before any public launch.

More: [architecture](../architecture.md#gemini-data).
