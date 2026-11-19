# Main track: Agentic Payments and AI

What the track asks for, how the project meets it, and where to check. The requirements are the hackathon guide's, in our words. Everything is on Arc testnet with testnet USDC.

| Requirement | How we meet it | Proof |
|---|---|---|
| Agents execute onchain transactions or read the chain | An agent reads `OddsFeed` to check what it paid for, then sends its own USDC premium through `ProtectionBook.buyProtection` | [`src/agent/agent.ts`](../../src/agent/agent.ts) · [a premium paid by Claude Code's wallet](https://explorer.testnet.arc.io/tx/0xebff2e19c4487122ba65bd9b3f056c2641f9689defc0c4761ddea6f81998dcc9) · [the replay agent's](https://explorer.testnet.arc.io/tx/0x71dbc20286c7d6b4d57ebe27de42e2f0d7226c3b0101e0bd5b49b7cf2a09df72) |
| The agent's decision loop is documented | Step by step below, for the built-in agent and for an MCP agent | [The decision loop](#the-decision-loop) · [`src/agent/policy.ts`](../../src/agent/policy.ts), tests in [`policy.test.ts`](../../src/agent/policy.test.ts) |
| The safety limits in place are documented | Listed below, with what is not built | [Safety limits](#safety-limits) |
| Objective: agents pay per request (x402) | Every odds read costs $0.001, paid over x402 through Circle Gateway Nanopayments | [`GET /odds/:symbol`](../../src/server/index.ts) · [one read in Circle's record](https://gateway-api-testnet.circle.com/v1/x402/transfers/92fc7c71-d798-4058-aa53-35d95d601769) · [two reads settled in one Arc transaction](https://explorer.testnet.arc.io/tx/0x20e3339be04d92bef7e0ac0a503a2b3933fc96e97f8e8a30b9cea5775993dfe0) |
| Objective: a service agents discover and pay for in USDC | The agent desk: an agent signs up, lists the contracts on offer, pays for reads and pays a premium, all in USDC | [`src/desk/desk.ts`](../../src/desk/desk.ts) · [screenshot](../screenshots/10b-agent-line-1440.png) |
| Objective: a tool that lets LLMs read and act on the chain | The desk's MCP server: six tools any MCP client can call | [`src/desk/mcp.ts`](../../src/desk/mcp.ts) · [Claude Code's run](../screenshots/10b-your-agent-1440.png) |
| Objective: spending controls and guardrails | Partly. The limits below exist; budgets, a maximum price and owner approval are planned and not built | [Safety limits](#safety-limits) |

## The decision loop

**The built-in agent** ([`src/agent/agent.ts`](../../src/agent/agent.ts); the desk's demo agent in [`src/desk/desk.ts`](../../src/desk/desk.ts) follows the same steps). A run starts on a timer, on a button, or when the QuickNode Stream reports a move of 5 points or more.

1. **Pay to read.** `GET /odds/:symbol` answers 402. The agent signs a $0.001 USDC payment through Circle Gateway and gets the chance and the feed's round.
2. **Check onchain.** It reads `OddsFeed.latestBySymbol` for free and stops if the round or the value differ from what it paid for.
3. **Decide.** `decide()` in `policy.ts`: under a 50% chance of the bad outcome, hold. At 50% or more, contracts needed = ceil(holding × expected loss of 10%), minus what it already holds.
4. **Pick a contract** (desk agent): of the contracts at 50% or more, the latest end date, then the cheapest per $1 of payout.
5. **Buy.** It approves exactly the premium and calls `ProtectionBook.buyProtection`. The Gemini side is an order ticket, plus a sandbox order where the sandbox lists the contract.
6. **Keep watching.** Each new post for its market, delivered by the Stream, makes it re-check: "Re-checked at 69%: still covered".

**An MCP agent** ([`src/desk/mcp.ts`](../../src/desk/mcp.ts)). The steps are tools, and the model decides which to call and what to buy:

1. `sign_up` with what it holds: it gets an agent id and an Arc wallet with test USDC.
2. `check_risks`: one paid read per market, $0.001 each, from its own wallet.
3. `list_contracts`: every contract with its chance, price, cost and payout.
4. `quote_cover` for the contract and number it chose, then `buy_cover`: the premium is paid onchain from its wallet.
5. `my_cover`: what it holds now.

## One example

A demo agent that holds $40 of BTC: five reads at $0.001, 16 contracts compared, "BTC ends below $70,000 on Nov 30" chosen. It expects to lose about 10%, $4, so it bought 4 contracts at $0.96: a $3.84 premium on Arc. On the Agents page, clicking the cover shows this sum ([screenshot](../screenshots/10e-cover-why-1440.png)).

Claude Code, asked over MCP to insure $60 of BTC, chose differently: 3 contracts on "below $60,000" at a 27.5% chance for $0.84. Our rule would not have picked that one. The page says "Chosen by your agent, not our rule."

## Safety limits

In place today:

- The built-in agent buys only what the rule computes, never more than the contracts still missing, so a second run buys nothing.
- It refuses to act if the paid value and the onchain value differ.
- Its USDC approval is for the exact premium of one purchase.
- One run at a time; a second trigger is skipped.
- The desk offers no market whose book is too thin or whose posted value is stale.
- Every wallet holds testnet USDC only, its key never leaves the server, and no order goes to Gemini's production exchange.
- The server listens on this machine only.

Not built (planned as Phase 12 in [`PLAN.md`](../../PLAN.md)): a daily budget, a maximum price, owner approval for large purchases. Until then an MCP agent can buy any cover it is quoted.

More: [architecture](../architecture.md#the-agent) · [the audit](../oracle-audit.md).
