import assert from "node:assert/strict";
import { test } from "node:test";
import { coverFor, premiumUnits, takerFee } from "./cover.js";

test("Gemini's taker fee: its own two examples, and no extra cent from float noise", () => {
  assert.equal(takerFee(100, 0.4), 1.68);
  assert.equal(takerFee(100, 0.9), 0.63);
  assert.equal(takerFee(4, 0.5), 0.07); // 0.07 × 4 × 0.25 is 0.07000000000000001 in floats
  assert.equal(takerFee(1, 0.77), 0.02); // 0.0124 rounds up to the next cent
});

const terms = { trigger: 0.25, hedgeRatio: 1 };

test("cover for $50 of BTC at $61,830 on 'below $60,000': 2 contracts, premium and payout", () => {
  const c = coverFor({ valueUsd: 50, terms, spotUsd: 61830, strikeUsd: 60000, yesBps: 6850, side: "NO", price: 0.32, held: 0 });
  assert.deepEqual(c, { chanceBps: 3150, action: "buy", needed: 2, lossUsd: 1.48, contracts: 2, premiumUsdc: 0.64, feeUsd: 0.04, payoutUsd: 2 });
  assert.equal(premiumUnits(2, 0.32), 640000n);
});

test("below the trigger the rule holds, but the cost is still worked out; half cover halves it", () => {
  const low = coverFor({ valueUsd: 50, terms, spotUsd: 61830, strikeUsd: 60000, yesBps: 8000, side: "NO", price: 0.2, held: 0 });
  assert.equal(low.action, "hold");
  assert.equal(low.contracts, 2);
  assert.equal(coverFor({ valueUsd: 400, terms, spotUsd: 100, strikeUsd: 90, yesBps: 5000, side: "NO", price: 0.5, held: 0, share: 0.5 }).contracts, 20);
  assert.equal(coverFor({ valueUsd: 50, terms, spotUsd: 61830, strikeUsd: 60000, yesBps: 6850, side: "NO", price: 0.32, held: 2 }).contracts, 0);
});

test("a strike above today's price needs no cover", () => {
  const c = coverFor({ valueUsd: 50, terms, spotUsd: 61830, strikeUsd: 65000, yesBps: 2500, side: "NO", price: 0.77, held: 0 });
  assert.equal(c.needed, 0);
  assert.equal(c.contracts, 0);
  assert.equal(c.premiumUsdc, 0);
});
