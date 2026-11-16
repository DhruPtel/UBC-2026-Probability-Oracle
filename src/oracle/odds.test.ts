import assert from "node:assert/strict";
import { test } from "node:test";
import { probability } from "./odds.js";

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
