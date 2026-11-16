// The agent's decision rule. Pure: no chain, no network, no clock.

export type DecideInput = {
  yesBps: number; // YES probability from OddsFeed, in basis points
  harmfulOutcome: "YES" | "NO"; // which outcome hurts the holding
  trigger: number; // act when the harm probability reaches this (0 to 1)
  exposureUsd: number; // value of the holding at risk
  shock: number; // fraction of that value we expect to lose if the harm happens
  hedgeRatio: number; // how much of the expected loss to cover (1 = all of it)
  alreadyCovered: number; // contracts already held on the harmful side
  sidePrice: number; // price to buy one contract of the harmful side
  execution: "paper"; // a PAPER TRADE: recorded at the real production price, no order is sent
};

export type Decision = {
  pHarm: number;
  action: "hold" | "buy";
  contracts: number;
  side: "YES" | "NO";
  premiumEstimate: number;
  execution: "paper";
  reason: string;
};

const pct = (p: number) => `${Math.round(p * 1000) / 10}%`;

export function decide(input: DecideInput): Decision {
  const side = input.harmfulOutcome;
  const pYes = input.yesBps / 10000;
  const pHarm = Math.round((side === "YES" ? pYes : 1 - pYes) * 10000) / 10000;
  const hold = (reason: string): Decision => ({ pHarm, action: "hold", contracts: 0, side, premiumEstimate: 0, execution: input.execution, reason });

  if (pHarm < input.trigger) {
    return hold(`harm ${pct(pHarm)} < trigger ${pct(input.trigger)} → hold`);
  }

  // A winning contract pays $1, so covering a loss of $L takes L contracts, rounded up.
  // Rounding to 6 places first stops float noise (13.000000000000002) from adding a contract.
  const expectedLoss = Math.round(input.hedgeRatio * input.exposureUsd * input.shock * 1e6) / 1e6;
  const needed = Math.ceil(expectedLoss / 1);
  const contracts = needed - input.alreadyCovered;
  if (contracts <= 0) {
    return hold(`harm ${pct(pHarm)} ≥ trigger ${pct(input.trigger)}, but ${input.alreadyCovered} ${side} already cover the ${needed} needed → hold`);
  }

  const premiumEstimate = Math.round(contracts * input.sidePrice * 100) / 100;
  return {
    pHarm,
    action: "buy",
    contracts,
    side,
    premiumEstimate,
    execution: input.execution,
    reason: `harm ${pct(pHarm)} ≥ trigger ${pct(input.trigger)} → buy ${contracts} ${side} at $${input.sidePrice.toFixed(2)} ≈ $${premiumEstimate.toFixed(2)}`,
  };
}
