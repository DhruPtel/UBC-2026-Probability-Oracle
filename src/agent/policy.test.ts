import assert from "node:assert/strict";
import { test } from "node:test";
import { decide, lossIfBelow, pickStrike, strikeOf, whyLine, type DecideInput } from "./policy.js";

// $50 of BTC at $61,830; "BTC ends below $60,000" (NO is the bad side) at 31.5%.
const base: DecideInput = {
  yesBps: 6850,
  harmfulOutcome: "NO",
  trigger: 0.25,
  exposureUsd: 50,
  spotUsd: 61830,
  strikeUsd: 60000,
  hedgeRatio: 1,
  alreadyCovered: 0,
  sidePrice: 0.32,
  execution: "paper",
};

test("the loss is holding × (1 − strike / price), and nothing at or above the price", () => {
  assert.equal(Math.round(lossIfBelow(50, 61830, 60000) * 100) / 100, 1.48);
  assert.equal(lossIfBelow(130, 100, 90), 13); // exactly 13: float noise must not make it 14 contracts
  assert.equal(lossIfBelow(50, 61830, 65000), 0);
  assert.equal(lossIfBelow(50, 61830, 61830), 0);
});

test("at or above the trigger → buy enough $1 contracts to pay the loss, rounded up", () => {
  const d = decide(base);
  assert.equal(d.pHarm, 0.315);
  assert.equal(d.action, "buy");
  assert.equal(d.side, "NO");
  assert.equal(d.needed, 2); // $1.48 → 2
  assert.equal(d.contracts, 2);
  assert.equal(d.premiumEstimate, 0.64);
  assert.equal(decide({ ...base, exposureUsd: 130, spotUsd: 100, strikeUsd: 90 }).contracts, 13);
  assert.equal(decide({ ...base, yesBps: 7500 }).action, "buy"); // exactly at the trigger
});

test("below the trigger → hold", () => {
  const d = decide({ ...base, yesBps: 7600 });
  assert.equal(d.action, "hold");
  assert.equal(d.contracts, 0);
  assert.equal(d.reason, "chance 24% < trigger 25% → hold");
});

test("a strike the price is already below is no threat, whatever its chance", () => {
  const d = decide({ ...base, strikeUsd: 65000, yesBps: 2500 });
  assert.equal(d.action, "hold");
  assert.equal(d.needed, 0);
  assert.equal(d.lossUsd, 0);
});

test("already covered → hold; partly covered → the rest", () => {
  assert.equal(decide({ ...base, alreadyCovered: 2 }).action, "hold");
  assert.equal(decide({ ...base, alreadyCovered: 1 }).contracts, 1);
  assert.equal(decide({ ...base, yesBps: 1000 }).execution, "paper");
});

test("the pick: the nearest strike below today's price, on the latest date", () => {
  const rows = [
    { s: "a", strikeUsd: 57500, expiry: "2026-11-30" },
    { s: "b", strikeUsd: 60000, expiry: "2026-11-30" },
    { s: "c", strikeUsd: 62500, expiry: "2026-11-30" }, // above the price
    { s: "d", strikeUsd: 61000, expiry: "2026-11-27" }, // nearer, but ends sooner
  ];
  assert.equal(pickStrike(rows, 61830)?.s, "b");
  assert.equal(pickStrike(rows, 50000), null);
});

test("strike from a label, and the one-line why", () => {
  assert.equal(strikeOf("$67,500 or above"), 67500);
  assert.equal(strikeOf("BTC price on November 30: $62,500 or above"), 62500);
  assert.equal(strikeOf("Hike 25bps"), null);
  assert.equal(
    whyLine({ asset: "BTC", spotUsd: 61830, strikeUsd: 60000, by: "Nov 30", chanceBps: 3150, lossUsd: 1.48, contracts: 2, trigger: 0.25 }),
    "BTC is $61,830. Below $60,000 by Nov 30 is 31.5%. You'd lose $1.48, so 2 contracts.",
  );
  assert.equal(
    whyLine({ asset: "BTC", spotUsd: 61830, strikeUsd: 60000, by: "Nov 30", chanceBps: 2000, lossUsd: 1.48, contracts: 2, trigger: 0.25 }),
    "BTC is $61,830. Below $60,000 by Nov 30 is 20%. That is under 25%, so no cover.",
  );
});
