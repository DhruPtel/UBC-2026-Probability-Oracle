# Plan: the agent insurance desk

Unit 8.0c, written Nov 18, 2026, as a plan. No budgets, maximum prices or approvals are part of it; those stay in the guardrails phase.

**Built the same day as units 8.0d to 8.0i** (see `PLAN.md` and `README.md`), with these changes: two ways in (a demo agent made on the page, and your own agent over MCP); a pool of four reusable wallets instead of one wallet per agent; a `list_contracts` tool; the sandbox order is always sent where the sandbox lists the contract; the order is good-til-cancel; the Gemini panel sits on the page, not behind a button. The rest of this document is the plan as it was written.

## Goal

A real AI agent (for example Claude, connected over MCP) does what our scripted agent does today, by its own choice:

1. signs up for insurance with a wallet and what it holds;
2. checks its risks, paying $0.001 per read over x402;
3. compares cover;
4. buys it;
5. and a page on our site shows that agent's process live.

What changes from today: the caller is an outside agent choosing its own steps, there can be more than one agent, and the purchase carries an exact Gemini order.

## What the research found

### Gemini's order API

Checked on Nov 18 against Gemini's trading reference and its fee page (links at the end).

- **Endpoint:** `POST /v1/prediction-markets/order` on `api.gemini.com`; the same path on `api.sandbox.gemini.com`.
- **Fields:** `symbol` (the `instrumentSymbol`), `orderType` (`limit` or `stop-limit`), `side` (`buy` or `sell`), `quantity` and `price` as decimal strings (price between 0 and 1), `outcome` (`yes` or `no`). Optional: `timeInForce` (`good-til-cancel` by default, `immediate-or-cancel`, `fill-or-kill`), `makerOrCancel`, `stopPrice`. Each contract has its own `quantityMinimum`, `quantityIncrement`, `priceMinimum` and `priceIncrement`.
- **Auth:** the standard signed REST headers (the payload in `X-GEMINI-PAYLOAD`, HMAC-SHA384 signature), with a key that has the NewOrder permission. Our `src/agent/trade.ts` already does this for the sandbox, including `account: "primary"` for a master key.
- **Terms:** `GET /v1/prediction-markets/terms/status`, then `POST /v1/prediction-markets/terms/accept` if the latest version is not accepted. You accept terms yourself.
- **Also there:** batch orders (1 to 20), cancel, active orders, history, positions. Gemini recommends WebSocket `order.place` for active trading; REST is fine for one order at a time.

### Production

- Gemini Predictions is offered by Gemini Titan, a CFTC-registered exchange. It needs a fully verified US account (18+, ID and SSN), funded in USD, and the trader physically in the US.
- Which states are covered is not settled: launch coverage said all 50, later third-party lists say 42 with eight excluded. I could not read Gemini's own support page (it answered 403), so this is not confirmed with Gemini.
- You have no funded production account, so a production order is out. It would also need your OK for each order.

### Sandbox

I listed the sandbox with `npm run gemini:order -- list` on Nov 18:

- 96 events with 317 contracts, in Crypto (78 events) and Commodities (18). No Economics, so no Fed markets.
- **33 of the feed's 100 production symbols also exist in the sandbox**, among them `GEMI-BTC2611302200-HI67500`, the market our agent insures against. On Nov 16 the sandbox had different strikes; now they overlap.
- Prices differ: that contract showed NO at $0.68 in the sandbox against about $0.76 in production. Many sandbox contracts show no price at all.
- Terms are accepted and the sandbox account holds about 99,999 test dollars.

### Gemini's fee

From Gemini's fee schedule dated March 12, 2026 (contracts listed on or after March 18, 2026):

- Taker fee = 0.07 × contracts × price × (1 − price). Maker fee = 0.0175 × the same. Rounded up to the next cent. No settlement fee.
- Example: our usual purchase, 4 NO contracts at $0.50 as a taker, is 0.07 × 4 × 0.25 = $0.07.

So the panel can compute Gemini's fee from a published formula. It does not need a user-entered rate.

### Recommendation: an order ticket always, a sandbox order where the market exists

- **Order ticket (the base).** `buy_cover` returns, and the page shows, the exact body that would be sent to `POST /v1/prediction-markets/order` at Gemini's live production price: symbol, `buy`, outcome, quantity, limit price, `immediate-or-cancel`, plus the fee by the formula. Labelled "Order ticket: not sent". This works for every market, uses real prices, and claims nothing that did not happen.
- **Sandbox order (on top, can be cut).** When the sandbox lists the same symbol with a price, the desk also places that order there and shows its order id, labelled "Sandbox". It proves the order path end to end. The ticket stays the record of price, because sandbox prices are unrelated.
- The USDC premium onchain through `ProtectionBook` stays as it is: real testnet USDC, at the production price.

## Design

### Parts

```
AI agent (Claude) ──MCP, stdio──> desk MCP server ──HTTP──> Lab server (/api/desk/…)
                                                              ├─ x402 paid read of /odds/:symbol, as that agent's wallet
                                                              ├─ ProtectionBook.buyProtection, as that agent's wallet
                                                              ├─ order ticket (and sandbox order)
                                                              └─ logs/desk.jsonl ──SSE "desk"──> /agents page
```

The MCP server is a thin translator: each tool is one HTTP call to the Lab server. All logic, keys and logs stay in the Lab server, so the page sees every step whichever client the agent uses.

### MCP tools

| Tool | Input | What it does | Returns |
|---|---|---|---|
| `sign_up` | `name`, `holding` (`asset`: BTC or ETH, `amount`) | Creates the agent's desk wallet, funds it, deposits into Circle Gateway for reads, records the declared holding | agent id, wallet address, explorer link, balances |
| `check_risks` | agent id | For each market that matches the holding's asset, a paid read ($0.001 over x402 from the agent's wallet) | per risk: the chance with its event text, the feed round, what it paid, the payment id |
| `quote_cover` | agent id, `symbol`, optional `share` of the loss to cover | Reads Gemini's live ask and computes cover with `policy.ts` | options side by side: contracts, side, price, premium, payout, Gemini's fee, cost per $1 of payout |
| `buy_cover` | agent id, a quote id | Pays the premium through `ProtectionBook`, writes the order ticket, places the sandbox order if listed | transaction link, ticket, sandbox order id or "not listed" |
| `my_cover` | agent id | Reads the agent's purchases from `ProtectionBought` logs and the desk log | holdings, cover held per risk, spent, payout if the event happens |

"Compares cover" in `quote_cover` means two real choices, both from live data: other strikes of the same Gemini event (for BTC: $65,000, $67,500, $70,000, each with its own chance, price and payout condition) and how much of the expected loss to cover (half or all). The agent picks; the desk does not decide for it.

### Wallet model

- One wallet per signed-up agent, on Arc testnet. All are derived from one seed, `DESK_SEED` in `.env` (created by `npm run new-keys`), by the agent's index. Keys never leave the Lab server and are never written to a log or sent over MCP; tools return addresses only.
- Funding at sign-up: the deployer sends a fixed starter amount of testnet USDC (5 USDC), and the wallet deposits 0.5 of it into Circle Gateway (approve and deposit). This is funding, not a spending limit. Premiums go to the treasury, which is the deployer, so the money cycles.
- The holding is declared, as today, and valued at Gemini's live spot price.
- Why not the agent's own key: an MCP client such as Claude cannot hold or sign with a key. Why not Circle Agent Wallets: their policies are mainnet only and the Gateway buyer must be an EOA (PLAN §0.2).

### The "Agents" view

A fifth tab, `/agents`, in the shared look, one screen:

- **Left:** the agents that signed up, newest first: name, holding in dollars, covered or not.
- **Centre:** the selected agent's process as the five-step story the Agent insurance page already uses (`workflow`): signed up → paid to read → compared → bought → covered. Each step lights when its tool call arrives, with the real call at its foot and a transaction link where there is one.
- **Right:** the agent's tool calls as they happen (`events`), and the order ticket once it exists.
- Live over SSE: every desk step is a line in `logs/desk.jsonl`, pushed as a `desk` event.
- Chips: "Declared holding", "Order ticket: not sent", "Sandbox" when used.

### "What this means for Gemini" panel

On the Agents view, behind one button so the main screen stays simple.

- **Real counts, from our logs:** agents signed up, paid reads, quotes, purchases, contracts, notional (contracts × price), and Gemini's fee on those orders by its published formula, per order and rounded up as Gemini does.
- **A labelled projection:** three inputs the viewer can change (number of agents, purchases per agent per month, contracts per purchase), at today's average price from our real orders. Output: contracts and fees per month. Chip: "Projection". The formula is shown in the panel.
- No claim about Gemini's actual volume or revenue.

## Units

Estimates are build time. The numbers are provisional: when you say go, a docs-only unit renumbers `PLAN.md` so numbers match build order.

| Unit | What | Time |
|---|---|---|
| D1 | Desk wallets and `sign_up`: `DESK_SEED`, derivation, funding, Gateway deposit, `logs/desk.jsonl`, routes `POST /api/desk/sign-up` and `GET /api/desk` | 1.5 h |
| D2 | `check_risks` and `quote_cover`: paid reads as the agent's wallet, the quote with strikes, shares and Gemini's fee | 1.5 h |
| D3 | `buy_cover` and `my_cover`: `ProtectionBook`, the order ticket, the record | 1.5 h |
| D4 | The MCP server with the five tools, and a real Claude session that signs up and buys cover | 1 h |
| D5 | The `/agents` tab, live | 2.5 h |
| D6 | The "What this means for Gemini" panel | 1 h |
| D7 | Optional: the sandbox order beside the ticket | 1 h |

Total about 9 hours without D7. If time is short, cut from the bottom: D7, then D6, then the strike comparison in D2.

With the deadline on Friday at 10:00 am Pacific, the desk and the guardrails (about 4 hours) do not both fit comfortably with the video. That choice is yours.

## Risks

- **Time.** Nine hours on the day before the video. D1 to D4 alone (5.5 hours) already give a real agent buying cover, visible in the Lab's logs.
- **Sign-up is slow.** Funding plus the Gateway deposit is three transactions, perhaps 5 to 10 seconds. The tool returns when the wallet is ready.
- **Arc's public RPC rate limit (429).** Several agents at once multiply chain reads. Reads go through the existing cache; `my_cover` reads the desk log first.
- **The agent may not follow the story.** A real model can call tools in any order. The page lights the steps that happened and leaves the others dim; `buy_cover` without a quote answers with a plain error.
- **The Stream filter names one agent address.** Desk wallets' USDC transfers will not arrive as `walletChange`. Their purchases still arrive as `protectionBought`. Leave as is.
- **Sandbox drift.** The overlap of 33 symbols may change again, and many sandbox contracts have no price. That is why the ticket is the base.
- **Gemini's data terms.** Selling reads of Gemini's data is redistribution under its Market Data Agreement (PLAN §0.1). Still open with the Gemini bounty team.

## What I need from you

1. **Go or no go**, and whether the desk comes before the guardrails.
2. **A new dependency:** `@modelcontextprotocol/sdk` (and `zod`, which it needs) for the MCP server.
3. **Which client** will be the real agent in the demo: Claude Code or Claude Desktop. Both use the same stdio server.
4. **Testnet USDC:** about 5 USDC per agent that signs up, from the deployer (32.7 USDC now).
5. **Sandbox or not** (D7): yes or no.

## Later units, not built

- **BTC pools over time.** Replay this year's successive monthly BTC markets one after another, so the pools tab shows our suggested limits moving across the year and what each protocol's lending would have been.
- **ETH pools.** The same tab for pools that take ETH as collateral, driven by the ETH price markets, with our ETH replay pool beside them.

## Sources

- [Gemini: prediction markets trading reference](https://developer.gemini.com/prediction-markets-spec/trading)
- [Gemini Predictions fee schedule](https://www.gemini.com/fees/predictions)
- [Gemini sandbox](https://developer.gemini.com/get-started/sandbox)
- State coverage, third-party and not confirmed: [Cointelegraph on the 50-state launch](https://cointelegraph.com/news/winklevoss-gemini-kicks-off-prediction-markets-in-50-us-states), [DeFi Rate's state list](https://defirate.com/prediction-markets/states/)
- The sandbox listing and the overlap count come from our own run of `npm run gemini:order -- list` on Nov 18.
