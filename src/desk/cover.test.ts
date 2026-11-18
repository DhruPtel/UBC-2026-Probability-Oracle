import assert from "node:assert/strict";
import { test } from "node:test";
import { coverFor, premiumUnits, takerFee } from "./cover.js";

test("Gemini's taker fee: its own two examples, and no extra cent from float noise", () => {
  assert.equal(takerFee(100, 0.4), 1.68);
  assert.equal(takerFee(100, 0.9), 0.63);
  assert.equal(takerFee(4, 0.5), 0.07); // 0.07 × 4 × 0.25 is 0.07000000000000001 in floats
  assert.equal(takerFee(1, 0.77), 0.02); // 0.0124 rounds up to the next cent
});

test("cover for a $40 holding with a 10% shock: 4 contracts, premium and payout", () => {
  const terms = { shock: 0.1, trigger: 0.5, hedgeRatio: 1 };
  const c = coverFor({ valueUsd: 40, terms, yesBps: 2250, side: "NO", price: 0.78, held: 0 });
  assert.deepEqual(c, { chanceBps: 7750, action: "buy", needed: 4, contracts: 4, premiumUsdc: 3.12, feeUsd: 0.05, payoutUsd: 4 });
  assert.equal(premiumUnits(4, 0.78), 3120000n);
});

test("below the trigger the rule holds, but the cost is still worked out; half cover halves it", () => {
  const terms = { shock: 0.1, trigger: 0.5, hedgeRatio: 1 };
  const low = coverFor({ valueUsd: 40, terms, yesBps: 6550, side: "NO", price: 0.35, held: 0 });
  assert.equal(low.action, "hold");
  assert.equal(low.contracts, 4);
  assert.equal(coverFor({ valueUsd: 40, terms, yesBps: 2250, side: "NO", price: 0.78, held: 0, share: 0.5 }).contracts, 2);
  assert.equal(coverFor({ valueUsd: 40, terms, yesBps: 2250, side: "NO", price: 0.78, held: 4 }).contracts, 0);
});
