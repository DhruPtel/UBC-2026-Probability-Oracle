# Probability Oracle

**A probability oracle that lets AI agents insure themselves.** Built for UBC 2026 (University Blockchain Conference), Nov 12–20, 2026. Working name in the code: Hedgehog.

The oracle reads live prices from Gemini's prediction markets and posts each one on Arc testnet as a chance, for example "76% chance BTC ends below $67,500 on Nov 30". Two users act on that number. An agent that holds BTC pays $0.001 per read over x402 and, when the chance reaches 50%, buys cover: prediction-market contracts that pay $1 each if the bad outcome happens. A lending pool lowers its loan limit in steps as the chance rises, enforced onchain by a small contract called the risk switch. A QuickNode Stream carries every post from the chain to the agent and to the pool's keeper.

```mermaid
flowchart LR
  G["Gemini prediction markets"] --> O["Oracle"] --> F[("OddsFeed on Arc")] --> S["QuickNode Stream"] --> A["Agent: pays per read over x402, buys cover"] & K["Keeper: RiskSwitch sets the pool limit"]
```

Everything runs on Arc testnet with testnet USDC. What is a stand-in is listed under [Stand-ins](#stand-ins).

## Screenshots

| | |
|---|---|
| ![Overview](docs/screenshots/home-1440.png) Overview: Gemini's price, our output, and what each user does with it | ![Oracle](docs/screenshots/oracle-1440.png) Oracle: a live feed of about 100 markets, each posted on Arc |
| ![Agent insurance](docs/screenshots/agent-1440.png) Agent insurance: one replay, from watching to covered | ![Our pool](docs/screenshots/our-pool-1440.png) Our pool on Arc: the limit steps down as the chance rises |
| ![Agents](docs/screenshots/agents-1440.png) Agents: the insurance desk, for a demo agent or your own agent over MCP | |
| ![BTC pools](docs/screenshots/pools-1440.png) BTC pools: the same rule as a suggestion for real Aave and Morpho markets | ![One pool](docs/screenshots/pool-1440.png) One pool: its live settings, our suggestion, the last 7 days |

## Run it locally

Needs Node 22 and [Foundry](https://book.getfoundry.sh/) (`forge`). For the Stream you also need `cloudflared` and a QuickNode API key.

```
npm install
forge build --root contracts   # the server reads the contract ABIs from this build
npm run new-keys        # creates .env, two wallets and the desk's seed; prints addresses only
```

Fund both addresses with testnet USDC at https://faucet.circle.com (Arc Testnet). Then:

```
npm run check:arc                 # chain 5042002 and both balances
npm run gateway:deposit -- 1      # once: the agent's balance for paid reads
npm run lab                       # the site, at http://localhost:8787
npm run oracle                    # in a second terminal: posts the nine configured markets every 5 minutes
```

The contracts are already deployed (addresses below, in [`deployments/arc-testnet.json`](deployments/arc-testnet.json)). The server and the agent use them as they are. `npm run deploy -- <Name>` deploys your own copies.

Open `http://localhost:8787`. The tabs are Overview, Oracle, BTC pools and Agent insurance. `/lab` is the workbench behind them.

- **Agent replay:** Agent insurance → Start replay (or `npm run demo -- agent`). About 30 seconds; costs about 2.03 testnet USDC from the agent's wallet. `npm run fund:agent -- 2` moves USDC back from the deployer.
- **Pool replay:** BTC pools → Our pool on Arc → Run the replay (or `npm run demo -- protocol`). About 0.02 USDC of gas.
- **With the Stream:** `npm run stream:demo` before a replay; Ctrl+C afterwards deletes the Stream. Without it the server triggers the agent and the keeper directly, and the page says so.

Environment variables, all in `.env` (see [`.env.example`](.env.example); never commit this file):

| Variable | For |
|---|---|
| `ARC_RPC_URL` | Arc testnet RPC. Default `https://rpc.testnet.arc.io` |
| `DEPLOYER_KEY`, `AGENT_KEY` | The two wallets. `npm run new-keys` fills them in |
| `DESK_SEED` | The agent desk's four demo wallets are derived from it. `npm run new-keys` fills it in; the deployer tops the wallets up |
| `PORT`, `STREAM_PORT` | The site (8787) and the Stream webhook (8788) |
| `ORACLE_INTERVAL_S`, `AGENT_INTERVAL_S` | Loop intervals, 300 s by default |
| `QUICKNODE_API_KEY`, `STREAM_WEBHOOK_URL` | Only for the Stream. `stream:demo` sets the webhook address itself |
| `GEMINI_SANDBOX_API_KEY`, `GEMINI_SANDBOX_API_SECRET` | Only for sandbox orders: `npm run gemini:order` and the agent desk. Without them the desk still writes the order ticket |

A running Lab posts the feed's markets on Arc and so spends deployer gas: up to about 0.13 USDC an hour, plus about 0.11 for the 5-minute loop. All commands are listed in [`CLAUDE.md`](CLAUDE.md).

## Agentic Payments and AI

**The agent's decision loop** is in [`src/agent/agent.ts`](src/agent/agent.ts); the rule itself is the pure function `decide()` in [`src/agent/policy.ts`](src/agent/policy.ts), with tests in [`src/agent/policy.test.ts`](src/agent/policy.test.ts). A run starts on a timer, or when the Stream reports a move of 5 points or more on a watched market or a USDC transfer touching the agent's wallet. For each risk in [`src/agent/threats.json`](src/agent/threats.json):

1. **Pay to read.** `GET /odds/:symbol` answers 402; the agent pays $0.001 in USDC through Circle Gateway and gets the chance and the feed's round.
2. **Check onchain.** It reads `OddsFeed.latestBySymbol` for free and stops if the round or the value differ from what it paid for.
3. **Decide.** Chance of the bad outcome = YES, or 100% − YES, as the risk says. Under the trigger (50%) it holds. At or above it, contracts needed = ceil(holding value × shock × hedge ratio), minus what it already holds.
4. **Buy.** It approves exactly the premium and calls `ProtectionBook.buyProtection`, which moves the USDC to the treasury and emits `ProtectionBought`. The contracts themselves are recorded as a paper trade at Gemini's live price.

Every step is a line in `logs/agent.jsonl` and shows live on the Agent insurance page and in the Lab.

**x402 nanopayments.** The seller is [`src/server/index.ts`](src/server/index.ts) (`createGatewayMiddleware` from `@circle-fin/x402-batching`, network `eip155:5042002`, price $0.001); the buyer is `GatewayClient` in [`src/agent/inputs.ts`](src/agent/inputs.ts). A payment is a signed authorization that Gateway accepts at once and settles on Arc later in a batch, so a single read has a Gateway transfer id, not its own transaction. The Gateway Wallet contract is [`0x0077777d…19b9`](https://explorer.testnet.arc.io/address/0x0077777d7eba4688bdef3e311b846f25870a19b9). A paid read also refreshes the feed when Gemini's value has changed.

**The agent insurance desk** ([`/agents`](demo/agents.html), [`src/desk/desk.ts`](src/desk/desk.ts)). The same loop, opened to any agent. There are two ways in and one desk underneath:

- **A demo agent.** "Create demo agent" on the page picks an asset and a holding; "Run" or "Next" walks our built-in agent through the steps.
- **Your own agent.** An MCP server ([`src/desk/mcp.ts`](src/desk/mcp.ts)) gives any MCP client six tools: `sign_up`, `check_risks`, `list_contracts`, `quote_cover`, `buy_cover`, `my_cover`. The page shows the one-line setup for Claude Code. We tested it with a headless Claude Code session that was given only this server: it signed up, paid for five reads, chose a contract by its own reasoning (not the one our rule picks) and bought it.

Each agent gets one of four reusable Arc testnet wallets. `check_risks` pays $0.001 over x402 per read from that wallet. `buy_cover` pays the premium through `ProtectionBook` from that wallet, writes an order ticket (the exact body for Gemini's order API at the live price, not sent), and places the same order in Gemini's sandbox when the sandbox lists the contract. Example: [Claude Code's premium](https://explorer.testnet.arc.io/tx/0x83f443c591dfb4d7240a96dce882bde8ba1206750d3f394baa2b2d659f1b42da) · [one of its x402 payments, as Circle Gateway records it](https://gateway-api-testnet.circle.com/v1/x402/transfers/6ce6e8a9-13a0-4427-b0a4-942f5e6ee8ce) · [a demo agent's premium](https://explorer.testnet.arc.io/tx/0x89364dbcb0ff45e7c6064bc7a27605c7c3d0bc71884af0c862ddf7e273396728).

**Safety limits, as they are today.** There is no spending budget, no maximum price and no owner approval yet. Those guardrails are a planned phase (units 8.1 to 8.3 in [`PLAN.md`](PLAN.md)) and are not built. What does limit the agent now:

- It buys only what the rule computes, and never more than the contracts still missing, so a second run buys nothing.
- It refuses to act if the paid value and the onchain value differ.
- Its USDC approval is for the exact premium of one purchase.
- One run at a time; a second trigger is skipped.
- It holds testnet USDC only, and its trades are paper trades. No real money can move.
- The server listens on this machine only; only the Stream webhook port is ever tunnelled.
- The desk has no limits of its own: an agent that signs up can buy any cover it is quoted, and the desk's treasury lends its wallet the premium (which returns to the treasury). Its wallets hold testnet USDC only, their keys never leave the server, and no order goes to Gemini's production exchange.

`OddsFeed.publish` and `RiskSwitch.sync` are open to any sender today. Limiting them is part of the same planned phase.

Example transactions: [the agent pays a 2 USDC premium](https://explorer.testnet.arc.io/tx/0xca3342039d25e298467e80d0d88e20a7f14c2ca1802c7dffba8ebaa2820c0745) (`buyProtection`, a replay) · [its first purchase on the live Fed market](https://explorer.testnet.arc.io/tx/0xb62b848bcb4593ec0b59a9949a9259acd9778ae8c164164c2f3e36df0e884ead) · agent wallet [`0xFfc1A84E…cbCF`](https://explorer.testnet.arc.io/address/0xFfc1A84E7050fd8F6648483B79B18074d0cacbCF).

## Best use of Arc

Contracts on Arc testnet (chain 5042002), sources in [`contracts/src`](contracts/src), tests in [`contracts/test`](contracts/test):

| Contract | Address | What it does |
|---|---|---|
| [`OddsFeed`](contracts/src/OddsFeed.sol) | [`0xe83a5a53dd68bf395337343cd25a0432a1acc50d`](https://explorer.testnet.arc.io/address/0xe83a5a53dd68bf395337343cd25a0432a1acc50d) | The latest chance per market; free to read by any contract; emits `OddsUpdated` with the previous value |
| [`ProtectionBook`](contracts/src/ProtectionBook.sol) | [`0x31f88462ddb390cfe8484674509fe83514110692`](https://explorer.testnet.arc.io/address/0x31f88462ddb390cfe8484674509fe83514110692) | Takes the agent's USDC premium and records each purchase |
| [`RiskSwitch`](contracts/src/RiskSwitch.sol) | [`0x6a961276b85bc64214b4a7810a01256363552525`](https://explorer.testnet.arc.io/address/0x6a961276b85bc64214b4a7810a01256363552525) | A protocol opts in with its own tiers; `sync` reads the feed and sets its level |
| [`DemoLendingPool`](contracts/src/DemoLendingPool.sol) (BTC market) | [`0x461994160526949cae165850a45c7a36e8e2149f`](https://explorer.testnet.arc.io/address/0x461994160526949cae165850a45c7a36e8e2149f) | Demo pool: its loan limit follows the switch |
| The same pool for the ETH replay | [`0xc011d750e2d86b299a6ac9d770fbf58e49d4f588`](https://explorer.testnet.arc.io/address/0xc011d750e2d86b299a6ac9d770fbf58e49d4f588) | "Our pool on Arc" on the BTC pools tab |
| The same pool for the BTC replay and for tests | [`0x3a211c22…1ee6`](https://explorer.testnet.arc.io/address/0x3a211c22595425615754823e67928d4af9881ee6), [`0x9ff1c68b…158f`](https://explorer.testnet.arc.io/address/0x9ff1c68b935264add1a7251e107b9b85d860158f) | Replay and test copies |

How the project uses Arc:

- **USDC is the gas.** The oracle's posts, the keeper's syncs and the agent's purchases all pay gas in the same USDC the product moves. A post costs about 0.0011 USDC, which is what makes posting 100 markets practical.
- **x402 settlement.** Paid reads are Circle Gateway nanopayments on Arc testnet.
- **OddsFeed** is the shared source: the agent, the risk switch and the Stream all read the same rounds. [A post from the live feed](https://explorer.testnet.arc.io/tx/0x778999c8f251de86109ba4dab1e3d5cdb58ccbf6dcaaafc13d3131c97f465cf4) · [a post from the 5-minute loop](https://explorer.testnet.arc.io/tx/0x93cdc4114bdf213197a247d22e3c716a3781123db7552d271369b85463330cad).
- **ProtectionBook** keeps the premium onchain in USDC.
- **RiskSwitch** changes a pool's limit in one transaction when the chance crosses a tier: 75% of collateral normally, 60% at a 50% chance, 40% at 70%, and at 85% no new borrowing beyond today's level. [The sync that reached the top tier in a replay](https://explorer.testnet.arc.io/tx/0x14b360c2bbe0f54ca150ed042e1047b60d46e1723b0e9de3f494bf882c5b7bda).
- **A read of Aave V4 on Arc mainnet.** The server reads the cirBTC reserve of Aave V4's Main Spoke on Arc mainnet (chain 5042, [`0xB843bdC3…134d`](https://explorer.arc.io/address/0xB843bdC3a87A05E77E07Df9FE48928b3A34b134d)): collateral factor, caps, supplied and borrowed. From that and our chance it writes a suggested parameter change. This is read only; nothing is sent to Aave.

## Gemini Prediction Markets

- **Market data at scale.** The server reads every open contract in the Crypto, Economics, Economy and Finance categories each minute from `GET /v1/prediction-markets/events` ([`src/oracle/gemini.ts`](src/oracle/gemini.ts)): at the last count 111 events with 471 contracts. It posts about 100 of them on Arc (events closing within a day left out; per event the 10 contracts nearest 50%). Hourly history comes from `GET /v2/candles/<instrumentSymbol>/1hr`, for the 7-day charts and for the replays.
- **The chance of YES.** The middle of the best bid and best ask ([`src/oracle/odds.ts`](src/oracle/odds.ts), tests beside it).
- **The flip to the bad outcome.** Gemini lists "BTC $67,500 or above"; a holder cares about the opposite. Where one outcome is clearly bad (a price ending below a level, a rate hike) the pages show the chance of that outcome: 100% − YES for an "or above" market. The feed onchain stays neutral and always holds YES.
- **Paper trades at live prices.** The agent's cover is recorded at Gemini's real production ask for the side it needs (`logs/paper.jsonl`). No order is sent to Gemini.
- **Sandbox orders.** `npm run gemini:order` ([`src/agent/trade.ts`](src/agent/trade.ts)) places, lists and checks prediction-market orders on Gemini's sandbox with signed REST. It was used to prove the order API. The agent does not use it, because the sandbox lists different markets at unrelated prices.
- **Order tickets and sandbox orders at the desk.** Every purchase at the agent desk carries the exact body for `POST /v1/prediction-markets/order` at Gemini's live price, and Gemini's fee by its [published formula](https://www.gemini.com/fees/predictions): 0.07 × contracts × price × (1 − price), rounded up to the next cent ([`src/desk/cover.ts`](src/desk/cover.ts), tests beside it). The ticket is not sent: production needs a verified, funded US account. Where Gemini's sandbox lists the same contract, the same order is placed there and its order id is shown, labelled "Sandbox". The page's "What this means for Gemini" panel counts the desk's real orders and adds a projection that is labelled as one.
- **Attribution.** Data provided by Gemini. The pages say so wherever Gemini's prices appear.

## QuickNode Streams

- **Network:** Arc testnet. **Dataset:** Logs.
- **Filter:** [`src/stream/filter.js`](src/stream/filter.js), a `function main(stream)` that runs on QuickNode. It keeps only logs from our three contracts and USDC transfers to or from the agent, decodes them by hand, and returns small typed events: `oddsUpdated` (or `bigMove` when the value moved 5 points or more), `protectionBought`, `walletChange`, `riskLevelChanged`. A block with none of these delivers nothing.
- **Destination:** a webhook, `POST /stream` on port 8788 of the server, reached through a cloudflared tunnel. Created by [`scripts/stream-up.ts`](scripts/stream-up.ts) through the Streams REST API, deleted by [`scripts/stream-down.ts`](scripts/stream-down.ts); `npm run stream:demo` does both around a demo.
- **Why:** the Stream is what makes the system react instead of poll. A post on Arc reaches the server about a second after its block; the server then starts an agent run (on a big move or a wallet change) and calls `RiskSwitch.sync` for the pool whose market moved. The pages show the same events live, and our pool's view prints the measured delay ("Delivered 1.1 s after the block").
- The Stream bills per block, so it runs only while it is in use.

## Stand-ins

- **Paper trade.** The agent's Gemini contracts are recorded, not ordered. The price is Gemini's live price; the USDC premium onchain is real testnet USDC.
- **Order ticket and Sandbox.** At the agent desk the Gemini order is a ticket that is not sent, plus a sandbox order with test funds where the sandbox lists the contract. Sandbox prices are unrelated to real ones.
- **Demo wallets.** The desk's agents use a pool of four wallets whose keys the server holds; one agent after another reuses them. An agent does not bring its own key.
- **Declared holding.** The agent's BTC is a number in [`src/agent/portfolio.json`](src/agent/portfolio.json), valued at Gemini's live spot price. Testnet has no real BTC to hold.
- **Demo pool.** `DemoLendingPool` holds no deposits and lends nothing; it answers "would this loan be allowed now?" and counts simulated loans.
- **Replay.** The two demos play back real Gemini hourly prices (BTC Nov 12–15, ETH Nov 9–15) in about 30 seconds under `replay:` symbols, because live markets do not move on cue. Every post, read, sync and purchase in a replay is a real testnet transaction.
- **Read-only advisor.** The Aave and Morpho numbers on the BTC pools tab are read live; our limits there are suggestions. Nothing is sent to any protocol.
- **Testnet.** All USDC is testnet USDC.

## What's next

- The guardrails: an onchain daily budget, a maximum price, owner approval for large purchases, and the oracle's data checks (stale or thin markets, who may publish and sync).
- The agent desk beyond this machine: a hosted MCP endpoint, and agents that pay from their own wallets (the design notes are in [`docs/plan-agent-desk.md`](docs/plan-agent-desk.md)).
- Real orders on Gemini in place of paper trades, once there is a funded account and Gemini's agreement on republishing its data.

## Credits

- **Circle Gateway Nanopayments.** The paid `/odds/:symbol` endpoint and the buyer scripts follow Circle's [seller](https://developers.circle.com/gateway/nanopayments/quickstarts/seller) and [buyer](https://developers.circle.com/gateway/nanopayments/quickstarts/buyer) quickstarts and use the `@circle-fin/x402-batching` SDK. Circle's sample app [circlefin/arc-nanopayments](https://github.com/circlefin/arc-nanopayments) shows the same pattern on Arc; no code was copied from it.
- **Aave.** The advisor reads Aave V4 on Arc with addresses from [aave-dao/aave-address-book](https://github.com/aave-dao/aave-address-book) and function names from the interfaces in [aave/aave-v4](https://github.com/aave/aave-v4); no code was copied. What the home page says about V4 was checked against Aave's own pages: [Aave V4: Risk Isolation](https://aave.com/blog/aave-v4-risk-isolation), [Position conditions](https://aave.com/docs/aave-v4/positions/conditions) and [Aave v4: New Features and Risk Parameter Analysis](https://governance.aave.com/t/aave-v4-new-features-and-risk-parameter-analysis/23443).
- **Morpho and Aave public APIs.** The BTC pools tab reads Morpho markets from [Morpho's public API](https://api.morpho.org/graphql) and Aave V3 reserves from [Aave's public API](https://api.v3.aave.com/graphql). Read only.
- **Gemini.** Market data from Gemini's public prediction-markets API. Data provided by Gemini.
- **Model Context Protocol.** The desk's MCP server uses the official [TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) (`@modelcontextprotocol/sdk`) and `zod`.
- **QuickNode Streams**, **viem**, **Foundry** and forge-std, **Express**.
- **Chart.js and Barlow.** The Lab draws its charts with [Chart.js](https://www.chartjs.org/) (MIT) from a CDN tag. The pages are set in [Barlow and Barlow Semi Condensed](https://fonts.google.com/specimen/Barlow) (SIL Open Font License, from Google Fonts).
- Built with Claude Code. No code was copied from other projects.
