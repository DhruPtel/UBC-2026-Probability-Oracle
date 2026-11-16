// Turns one Gemini contract's prices into a probability that YES happens.
// A YES contract pays $1 if the event happens, so its price is roughly the probability.

type Prices = { bestBid?: string; bestAsk?: string; lastTradePrice?: string };

export type Odds =
  | { prob: number; method: "mid"; inputs: { bid: number; ask: number } }
  | { prob: number; method: "last"; inputs: { last: number } }
  | { prob: null; method: "none"; inputs: {} };

function price(text: string | undefined): number | null {
  if (text === undefined || text === "") return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

export function probability(contract: { prices?: Prices }): Odds {
  const bid = price(contract.prices?.bestBid);
  const ask = price(contract.prices?.bestAsk);
  const last = price(contract.prices?.lastTradePrice);

  if (bid !== null && ask !== null) {
    return { prob: (bid + ask) / 2, method: "mid", inputs: { bid, ask } };
  }
  if (last !== null) {
    return { prob: last, method: "last", inputs: { last } };
  }
  return { prob: null, method: "none", inputs: {} };
}

// 0.515 -> 5150. OddsFeed stores probabilities in basis points.
export function toBps(prob: number): number {
  return Math.round(prob * 10000);
}
