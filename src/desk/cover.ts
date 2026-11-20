// The desk's cover math. Pure: no chain, no network, no clock.
// Contracts needed and the decision come from the agent's own rule (policy.ts); the fee is
// Gemini's published one.
import { decide } from "../agent/policy.js";

// Gemini Predictions' taker fee (schedule of March 12, 2026, https://www.gemini.com/fees/predictions):
// 0.07 × contracts × price × (1 − price), rounded up to the next cent.
// Rounding to 6 places first stops float noise (0.07000000000000001) from adding a cent.
export function takerFee(contracts: number, price: number) {
  return Math.ceil(Math.round(0.07 * contracts * price * (1 - price) * 1e6) / 1e4) / 100;
}

// The premium in USDC base units (6 decimals), rounded up: the same sum the agent pays in agent.ts.
export function premiumUnits(contracts: number, price: number) {
  return BigInt(Math.ceil(Math.round(contracts * price * 1e9) / 1e3));
}

export type Terms = { trigger: number; hedgeRatio: number };

// One contract as cover for a holding: what the rule says, and what buying it would cost and pay.
// `share` is how much of the loss to cover (1 = all of it); `held` what is already bought.
export function coverFor(input: { valueUsd: number; terms: Terms; spotUsd: number; strikeUsd: number; yesBps: number; side: "YES" | "NO"; price: number; held: number; share?: number }) {
  const d = decide({
    yesBps: input.yesBps,
    harmfulOutcome: input.side,
    trigger: input.terms.trigger,
    exposureUsd: input.valueUsd,
    spotUsd: input.spotUsd,
    strikeUsd: input.strikeUsd,
    hedgeRatio: input.terms.hedgeRatio * (input.share ?? 1),
    alreadyCovered: input.held,
    sidePrice: input.price,
    execution: "paper",
  });
  // The rule buys only at or above its trigger. An agent that chooses for itself may buy below it,
  // so the cost is worked out either way.
  const contracts = Math.max(0, d.needed - input.held);
  return {
    chanceBps: Math.round(d.pHarm * 10000),
    action: d.action, // what the built-in rule would do
    needed: d.needed,
    lossUsd: Math.round(d.lossUsd * 100) / 100,
    contracts,
    premiumUsdc: Number(premiumUnits(contracts, input.price)) / 1e6,
    feeUsd: takerFee(contracts, input.price),
    payoutUsd: contracts, // a winning contract pays $1
  };
}
