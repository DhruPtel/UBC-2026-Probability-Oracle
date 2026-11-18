import assert from "node:assert/strict";
import { test } from "node:test";
import { CUTS, aaveLadder, lessUsd, levelOf, morphoLadder } from "./limits.js";

const tiers = [{ thresholdBps: 0 }, { thresholdBps: 5000 }, { thresholdBps: 7000 }, { thresholdBps: 8500 }];

test("levelOf: a tier starts exactly at its threshold", () => {
  assert.deepEqual([0, 4999, 5000, 6999, 7000, 8499, 8500, 10000].map((bps) => levelOf(tiers, bps)), [0, 0, 1, 1, 2, 2, 3, 3]);
});

test("Aave: 10 points lower, 25 points lower, and the same 25 at the top tier; never below 0", () => {
  assert.deepEqual(CUTS, [0, 1000, 2500, 2500]);
  assert.deepEqual(aaveLadder(7800), [7800, 6800, 5300, 5300]);
  assert.deepEqual(aaveLadder(2000), [2000, 1000, 0, 0]);
});

test("Morpho: the suggestion never goes below what is supplied and borrowed now, or above the LLTV", () => {
  // $100 of collateral, $60 supplied, $50 borrowed, LLTV 86%.
  assert.deepEqual(morphoLadder({ limitBps: 8600, collateralUsd: 100, supplyUsd: 60, borrowedUsd: 50 }), [8600, 6000, 5000, 5000]);
  // More supplied than the LLTV allows to be borrowed: held at the LLTV.
  assert.deepEqual(morphoLadder({ limitBps: 8600, collateralUsd: 100, supplyUsd: 120, borrowedUsd: 50 }), [8600, 8600, 5000, 5000]);
  // Less supplied than borrowed cannot be: the cap is held at what is borrowed.
  assert.deepEqual(morphoLadder({ limitBps: 8600, collateralUsd: 100, supplyUsd: 40, borrowedUsd: 50 }), [8600, 5000, 5000, 5000]);
});

test("lessUsd: the collateral times the points taken off", () => {
  assert.equal(lessUsd(1000000, 7800, 5300), 250000);
  assert.equal(lessUsd(1000000, 7800, 7800), 0);
});
