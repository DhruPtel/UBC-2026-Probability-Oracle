# UBC 2026 Probability Oracle

**A probability oracle that lets AI agents insure themselves.** Working name: Hedgehog.

Built for UBC 2026 (University Blockchain Conference), Nov 12–20, 2026.

## The idea

- **Oracle.** Reads live odds from Gemini's prediction markets (for example, "65% chance the Fed raises rates") and publishes them onchain on Arc testnet, where any contract can read them.
- **Agent.** Holds USDC and pays a fraction of a cent per odds read over x402. When an event that would hurt its holdings becomes likely, it buys protection: a Gemini prediction-market contract that pays out if the event happens.
- **Guardrails.** An onchain budget caps what the agent spends on protection, and large purchases need the owner's approval.
- **Live view.** A QuickNode Stream watches the agent's wallet and the oracle contract. It feeds a dashboard and wakes the agent for a fresh check when something big moves.

**Demo example.** The agent holds crypto that would drop on a rate hike. Rate-hike odds climb from 30% to 65%. The agent buys a Gemini contract that pays if the hike happens.

## Sponsor tools

- **Arc** (Circle): contracts and USDC payments on Arc testnet
- **Circle Nanopayments over x402**: pay-per-read odds
- **Gemini Prediction Markets API**: odds data and protection trades
- **QuickNode Streams**: live chain data into the dashboard and the agent

## Status

Phase 0: research and plan done. See [PLAN.md](PLAN.md) for the design, build units and schedule, and [CLAUDE.md](CLAUDE.md) for the working rules. Setup instructions arrive with Phase 1.

## Credits

Open-source inspiration gets credited here as we build.
