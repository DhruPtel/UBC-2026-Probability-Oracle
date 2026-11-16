import assert from "node:assert/strict";
import { test } from "node:test";
import { decide, type DecideInput } from "./policy.js";

// A YES-harm threat: $130 exposed, 10% shock, so 13 contracts fully cover it.
const base: DecideInput = {
  yesBps: 6900,
  harmfulOutcome: "YES",
  trigger: 0.5,
  exposureUsd: 130,
  shock: 0.1,
  hedgeRatio: 1,
  alreadyCovered: 0,
  sidePrice: 0.69,
  execution: "paper",
};

test("below the trigger → hold", () => {
  const d = decide({ ...base, yesBps: 4900 });
  assert.equal(d.action, "hold");
  assert.equal(d.contracts, 0);
  assert.equal(d.premiumEstimate, 0);
  assert.equal(d.reason, "harm 49% < trigger 50% → hold");
});

test("at or above the trigger → buy, with the contract count rounded up", () => {
  const d = decide(base);
  assert.equal(d.action, "buy");
  assert.equal(d.contracts, 13); // 130 × 0.1 = 13 exactly; float noise must not make it 14
  assert.equal(d.premiumEstimate, 8.97);
  assert.equal(d.reason, "harm 69% ≥ trigger 50% → buy 13 YES at $0.69 ≈ $8.97");

  assert.equal(decide({ ...base, exposureUsd: 64.98 }).contracts, 7); // 6.498 → 7
  assert.equal(decide({ ...base, yesBps: 5000 }).action, "buy"); // exactly at the trigger
});

test("already covered → hold", () => {
  const d = decide({ ...base, alreadyCovered: 13 });
  assert.equal(d.action, "hold");
  assert.equal(d.contracts, 0);
  assert.equal(decide({ ...base, alreadyCovered: 10 }).contracts, 3); // tops up the rest
});

test("NO flip: YES at 31% means harm at 69%, and the side to buy is NO", () => {
  const d = decide({ ...base, harmfulOutcome: "NO", yesBps: 3100 });
  assert.equal(d.pHarm, 0.69);
  assert.equal(d.side, "NO");
  assert.equal(d.reason, "harm 69% ≥ trigger 50% → buy 13 NO at $0.69 ≈ $8.97");
});

test("paper → the action is buy, and the decision carries execution: paper", () => {
  const d = decide({ ...base, execution: "paper" });
  assert.equal(d.action, "buy");
  assert.equal(d.execution, "paper");
  assert.equal(d.contracts, 13);
  assert.equal(decide({ ...base, yesBps: 1000 }).execution, "paper"); // a hold carries it too
});
