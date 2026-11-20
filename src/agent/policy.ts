// The agent's decision rule. Pure: no chain, no network, no clock.
//
// A holder's threat is "the asset ends below $X", with X below today's price. If it happens,
// the holding loses holding × (1 − X / today's price), and enough $1 contracts pay that back.

export type DecideInput = {
  yesBps: number; // YES probability from OddsFeed, in basis points
  harmfulOutcome: "YES" | "NO"; // which outcome hurts the holding ("$X or above" markets: NO)
  trigger: number; // act when the chance of the bad outcome reaches this (0 to 1)
  exposureUsd: number; // value of the holding at risk
  spotUsd: number; // today's price of the asset
  strikeUsd: number; // X in "ends below $X"
  hedgeRatio: number; // how much of the loss to cover (1 = all of it)
  alreadyCovered: number; // contracts already held on the harmful side
  sidePrice: number; // price to buy one contract of the harmful side
  execution: "paper"; // a PAPER TRADE: recorded at the real production price, no order is sent
};

export type Decision = {
  pHarm: number;
  action: "hold" | "buy";
  contracts: number; // how many to buy now
  needed: number; // how many cover the loss in full
  lossUsd: number; // what the holding loses if the bad outcome happens
  side: "YES" | "NO";
  premiumEstimate: number;
  execution: "paper";
  reason: string;
};

const pct = (p: number) => `${Math.round(p * 1000) / 10}%`;

// The loss if the asset ends at the strike: holding × (1 − strike / spot). Zero when the price
// is already at or below the strike: that has happened, so it is no threat to insure.
export function lossIfBelow(exposureUsd: number, spotUsd: number, strikeUsd: number) {
  if (!(strikeUsd < spotUsd)) return 0;
  // Rounding to 6 places stops float noise (13.000000000000002) from adding a contract.
  return Math.round(exposureUsd * (1 - strikeUsd / spotUsd) * 1e6) / 1e6;
}

export function decide(input: DecideInput): Decision {
  const side = input.harmfulOutcome;
  const pYes = input.yesBps / 10000;
  const pHarm = Math.round((side === "YES" ? pYes : 1 - pYes) * 10000) / 10000;
  const lossUsd = lossIfBelow(input.exposureUsd, input.spotUsd, input.strikeUsd);
  // A winning contract pays $1, so covering a loss of $L takes L contracts, rounded up.
  const needed = Math.ceil(Math.round(input.hedgeRatio * lossUsd * 1e6) / 1e6);
  const hold = (reason: string): Decision => ({ pHarm, action: "hold", contracts: 0, needed, lossUsd, side, premiumEstimate: 0, execution: input.execution, reason });

  if (!(input.strikeUsd < input.spotUsd)) {
    return hold(`the price $${Math.round(input.spotUsd)} is already at or below $${input.strikeUsd} → no threat to insure, hold`);
  }
  if (pHarm < input.trigger) {
    return hold(`chance ${pct(pHarm)} < trigger ${pct(input.trigger)} → hold`);
  }

  const contracts = needed - input.alreadyCovered;
  if (contracts <= 0) {
    return hold(`chance ${pct(pHarm)} ≥ trigger ${pct(input.trigger)}, but ${input.alreadyCovered} ${side} already cover the ${needed} needed → hold, already covered`);
  }

  const premiumEstimate = Math.round(contracts * input.sidePrice * 100) / 100;
  return {
    pHarm,
    action: "buy",
    contracts,
    needed,
    lossUsd,
    side,
    premiumEstimate,
    execution: input.execution,
    reason: `chance ${pct(pHarm)} ≥ trigger ${pct(input.trigger)}, loss $${lossUsd.toFixed(2)} → buy ${contracts} ${side} at $${input.sidePrice.toFixed(2)} ≈ $${premiumEstimate.toFixed(2)}`,
  };
}

// The pick, the same for every agent of ours and the desk's recommendation: among the strikes
// below today's price, those on the latest date, and of those the nearest to the price.
export function pickStrike<T extends { strikeUsd: number; expiry: string }>(rows: T[], spotUsd: number): T | null {
  const below = rows.filter((r) => r.strikeUsd < spotUsd);
  const latest = below.map((r) => r.expiry).sort().at(-1);
  return below.filter((r) => r.expiry === latest).sort((a, b) => b.strikeUsd - a.strikeUsd)[0] ?? null;
}

// "$67,500 or above" → 67500; null when the label is not a price strike.
export function strikeOf(label: string) {
  const m = label.match(/\$([\d,]+(?:\.\d+)?) or above/);
  return m ? Number(m[1].replace(/,/g, "")) : null;
}

// Why this amount, in one line: "BTC is $61,830. Below $60,000 by Nov 30 is 31.5%. You'd lose $1.48, so 2 contracts."
export function whyLine(w: { asset: string; spotUsd: number; strikeUsd: number; by: string; chanceBps: number; lossUsd: number; contracts: number; trigger: number }) {
  const dollars = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
  const head = `${w.asset} is ${dollars(w.spotUsd)}. Below ${dollars(w.strikeUsd)} by ${w.by} is ${w.chanceBps / 100}%.`;
  if (w.chanceBps < w.trigger * 10000) return `${head} That is under ${w.trigger * 100}%, so no cover.`;
  return `${head} You'd lose $${w.lossUsd.toFixed(2)}, so ${w.contracts} ${w.contracts === 1 ? "contract" : "contracts"}.`;
}
