import assert from "node:assert/strict";
import { test } from "node:test";
import { badOutcomeOf, chanceOfBad, probability, toBps } from "./odds.js";

test("mid: uses the middle of bid and ask when both exist", () => {
  const odds = probability({
    prices: { bestBid: "0.62", bestAsk: "0.66", lastTradePrice: "0.5" },
  });
  assert.equal(odds.method, "mid");
  assert.ok(odds.prob !== null && Math.abs(odds.prob - 0.64) < 1e-9);
  assert.deepEqual(odds.inputs, { bid: 0.62, ask: 0.66 });
});

test("last: falls back to the last trade when a bid or an ask is missing", () => {
  const odds = probability({ prices: { bestAsk: "0.03", lastTradePrice: "0.05" } });
  assert.deepEqual(odds, { prob: 0.05, method: "last", inputs: { last: 0.05 } });
});

test("none: no probability when there are no usable prices", () => {
  assert.deepEqual(probability({ prices: {} }), { prob: null, method: "none", inputs: {} });
  assert.deepEqual(probability({}), { prob: null, method: "none", inputs: {} });
});

test("toBps: 0.515 is 5150 basis points", () => {
  assert.equal(toBps(0.515), 5150);
});

test("toBps: 0.885 is 8850 basis points", () => {
  assert.equal(toBps(0.885), 8850);
});

test("a one-sided book is not a mid: bid only falls back to the last trade, or to nothing", () => {
  assert.equal(probability({ prices: { bestBid: "0.4", lastTradePrice: "0.45" } }).method, "last");
  assert.deepEqual(probability({ prices: { bestBid: "0.4" } }), { prob: null, method: "none", inputs: {} });
  assert.deepEqual(probability({ prices: { bestBid: "", bestAsk: "0.6" } }), { prob: null, method: "none", inputs: {} });
});

test("a wide book still gives its middle (no spread check before unit 10.3)", () => {
  const odds = probability({ prices: { bestBid: "0.05", bestAsk: "0.95" } });
  assert.equal(odds.method, "mid");
  assert.equal(toBps(odds.prob!), 5000);
});

test("a bid of 0 is a price, not a missing one", () => {
  assert.equal(toBps(probability({ prices: { bestBid: "0", bestAsk: "0.02" } }).prob!), 100);
});

test("toBps: every middle of two cent prices is a whole number of half points", () => {
  for (let bid = 1; bid < 99; bid++) {
    for (let ask = bid; ask <= 99; ask++) {
      const odds = probability({ prices: { bestBid: (bid / 100).toFixed(2), bestAsk: (ask / 100).toFixed(2) } });
      assert.equal(toBps(odds.prob!), (bid + ask) * 50);
    }
  }
});

test("the flip: NO as the bad outcome is 100% minus YES; YES is YES", () => {
  assert.equal(chanceOfBad(2100, "NO"), 7900);
  assert.equal(chanceOfBad(9150, "YES"), 9150);
  assert.equal(chanceOfBad(0, "NO"), 10000);
  assert.equal(chanceOfBad(5050, "NO") + 5050, 10000);
});

test("which outcome is bad: price floors are NO, hikes and \"or below\" are YES, the rest has none", () => {
  assert.deepEqual(badOutcomeOf("BTC price on November 30", "$67,500 or above"), { side: "NO", risk: "BTC ends below $67,500 on Nov 30" });
  assert.deepEqual(badOutcomeOf("ETH price on December 31", "$2,000 or above"), { side: "NO", risk: "ETH ends below $2,000 on Dec 31" });
  assert.equal(badOutcomeOf("Fed decision in December?", "Hike 25bps")!.side, "YES");
  assert.equal(badOutcomeOf("BTC price on November 30", "$55,000 or below")!.side, "YES");
  assert.equal(badOutcomeOf("How high will the S&P get this year?", "8,000 or above"), null);
  assert.equal(badOutcomeOf("BTC price on November 30", "$65,000 to $67,500"), null);
});
