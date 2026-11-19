# Devpost answers

Every Devpost field, ready to paste.

| Field | Paste |
|---|---|
| Project name | Probability Oracle |
| Tagline | A probability oracle that automates risk management and opens up AI agent insurance. |
| Main track | Agentic Payments and AI |
| Chain award | Best use of Arc |
| Bounties | Gemini Prediction Markets · QuickNode Streams |
| Built with | arc, usdc, circle-gateway, x402, gemini, quicknode-streams, model-context-protocol, solidity, foundry, typescript, viem, express, node.js, railway |
| Repository | https://github.com/DhruPtel/UBC-2026-Probability-Oracle |
| Live site | https://web-production-195a7b1c.up.railway.app |
| Video | (coming soon: add the YouTube or Drive link) |

The description is the sections below, from "What we built" to "Technologies and sponsor tools".

Draft answers for the UBC 2026 submission. Every number here is from the running system on Arc testnet; the sources are the [README](../README.md) and the [oracle correctness audit](oracle-audit.md). Edit the wording freely; check a number against those two before changing it.

## Project name

Probability Oracle

## Tagline

A probability oracle that automates risk management and opens up AI agent insurance.

## What we built

An oracle that turns Gemini's prediction-market prices into chances and posts them on Arc, and two things that act on those chances by themselves.

- **The oracle.** Every minute it reads about 100 open Gemini markets (crypto prices, Fed decisions, the economy), takes the middle of each bid and ask, and posts the chance on Arc testnet when it has moved. A price feed says "BTC is $63,400". Ours says "79% chance BTC ends below $67,500 on Nov 30".
- **An insurance desk for AI agents.** An agent signs up with what it holds, pays $0.001 per read over x402, compares contracts, and buys cover: prediction-market contracts that pay $1 each if the bad outcome happens. Our built-in demo agent does it in about 20 seconds. Any other agent can do the same over MCP, on the live site with one line; we connected Claude Code, and it chose a different contract than our rule would have, by its own reasoning.
- **A lending pool that listens.** A small contract, the risk switch, lowers a pool's loan limit in steps as the chance of a drop rises: 75% of collateral normally, 60% once the chance reaches 50%, 40% at 70%, and at 85% no new borrowing beyond today's level. Open loans, repayments and withdrawals carry on.
- **The same rule for real protocols, as advice.** A page reads eight live Aave and Morpho BTC markets and shows what our rule would suggest for each today, and how it would have moved over the last month. Read only.

## The problem

Onchain systems know prices. They do not know what is likely to happen next. A lending protocol finds out that BTC fell when the liquidations start. An agent holding BTC finds out the same way.

Prediction markets already price that question: thousands of people put money on whether BTC ends the month below a level, or whether the Fed raises rates. That number sits on an exchange's API. No contract can read it, and no agent can act on it without a person in the loop.

## How it works

1. **Read.** The server reads Gemini's public prediction-markets API once a minute. The chance of YES is the middle of the best bid and best ask.
2. **Post.** It publishes to `OddsFeed` on Arc when a value has moved half a point, and once an hour. Gas is paid in USDC, about a tenth of a cent a post, which is why posting 100 markets is practical.
3. **Deliver.** A QuickNode Stream filters Arc's logs down to our events and delivers them to a webhook about a second after the block.
4. **Act: the agent.** A move of 5 points or more starts an agent run. The agent pays $0.001 for the read through Circle Gateway (x402), checks the value against the chain, and applies one rule: if the chance of its bad outcome is 50% or more, buy enough $1 contracts to cover the expected loss. It pays the premium in USDC through `ProtectionBook`.
5. **Act: the pool.** A post for the pool's market makes the keeper call `RiskSwitch.sync`, which reads the feed and sets the pool's limit in the same transaction.

Two 30-second replays show both on real past prices (BTC Nov 12 to 15, ETH Nov 9 to 15), because live markets do not move on cue. Every post, read, sync and purchase in a replay is a real testnet transaction.

## What makes it unique

- **The input is a probability, not a price.** The pool tightens before the price falls, while the market only thinks it will.
- **The agent pays for its own information and its own insurance.** A tenth of a cent per read over x402, then a USDC premium, with no person approving either. Any MCP client can be that agent.
- **One number, two users, one chain.** The same round in `OddsFeed` drives the agent and the pool, and the Stream makes both react instead of poll.
- **Honest about what is real.** Stand-ins are labelled on every page (declared holding, paper trade, demo pool, replay). We audited our own claims against the live system, fixed two bugs, closed four of the open findings the same day, and published the audit with transaction hashes.

## Challenges

- **Thin markets.** A candle close is the last trade, the oracle posts the middle of the book, and on a wide book they differ. We show both and say which is which.
- **One key, many senders.** The oracle loop, the feed, the replays and the desk all send as the deployer. They collided on nonces until every send went through one cross-process lock.
- **x402 settles later.** A payment is accepted at once and reaches the chain minutes later in a batch, so a read has a transfer id, not a transaction. We link Circle's own record.
- **History is short.** We wanted a year of BTC pool history. Gemini's first month-long BTC market was listed on Oct 31, so the view shows one real month and nothing invented.

## What's next

- Agents that pay from their own wallets.
- Real Gemini orders in place of paper trades and order tickets.
- A real lending protocol reading the risk switch.

## Technologies and sponsor tools

- **Arc (Circle).** Four contracts on Arc testnet: `OddsFeed`, `ProtectionBook`, `RiskSwitch`, `DemoLendingPool`. USDC is the gas and the money. A live, read-only view of Aave V4's cirBTC reserve on Arc mainnet.
- **Circle Gateway Nanopayments (x402).** Every odds read is a $0.001 payment: `@circle-fin/x402-batching`, `@x402/core`, `@x402/evm`.
- **Gemini Prediction Markets.** Live events and order books, hourly candles, the published fee formula, the order API (exact order tickets, and real orders in the sandbox).
- **QuickNode Streams.** Arc testnet logs, a custom filter that decodes our events, a webhook destination.
- **Model Context Protocol.** The desk as six tools for any MCP client.
- **Also:** Solidity and Foundry, TypeScript, viem, Express, server-sent events, hosted on Railway. Built with Claude Code.

## Links

- Repository: https://github.com/DhruPtel/UBC-2026-Probability-Oracle
- Contracts and example transactions: the "Best use of Arc" section of the README
- Audit: `docs/oracle-audit.md`
- Live site: https://web-production-195a7b1c.up.railway.app
- Video: (coming soon: add the link)
