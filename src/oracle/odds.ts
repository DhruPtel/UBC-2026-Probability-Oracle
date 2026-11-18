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

// The data check before a post (unit 10.2): a book is too thin when a side is missing or the
// two sides are more than 10 points apart. Its middle is then one order's opinion, not a market's.
// Returns why, or null for a book we can post.
export const THIN_SPREAD_POINTS = 10;
export function thin(contract: { prices?: Prices }): string | null {
  const bid = price(contract.prices?.bestBid);
  const ask = price(contract.prices?.bestAsk);
  if (bid === null) return "no bid";
  if (ask === null) return "no ask";
  const points = Math.round((ask - bid) * 100);
  return points > THIN_SPREAD_POINTS ? `bid and ask are ${points} points apart` : null;
}

// 0.515 -> 5150. OddsFeed stores probabilities in basis points.
export function toBps(prob: number): number {
  return Math.round(prob * 10000);
}

// The flip: OddsFeed holds the chance of YES; a reader who fears the NO outcome wants the rest.
export const chanceOfBad = (yesBps: number, side: "YES" | "NO") => (side === "NO" ? 10000 - yesBps : yesBps);

// Is one outcome clearly bad for someone who holds the asset or borrows money? Only a few plain
// patterns count; for everything else (null) a reader gets the chance of YES.
export function badOutcomeOf(title: string, label: string): { side: "YES" | "NO"; risk: string } | null {
  const price = title.match(/^(\w+) price on (\w+) (\d+)/), above = label.match(/^(\$[\d,.]+) or above$/);
  if (price && above) return { side: "NO", risk: `${price[1]} ends below ${above[1]} on ${price[2].slice(0, 3)} ${price[3]}` };
  const question = title.replace(/\?$/, "");
  if (/hike/i.test(label) || /recession/i.test(title + label) || /or below$/i.test(label)) return { side: "YES", risk: `“${question}” resolves ${label}` };
  return null;
}
