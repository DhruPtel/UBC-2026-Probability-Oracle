// npm run agent:dry
// Prints the agent's holding and its decision for each threat. Reads only; places no orders.
import { agentView } from "../src/agent/inputs.js";

const view = await agentView();
const h = view.holding;
console.log(`${h.label}: ${h.amount} ${h.asset} × $${h.spotUsd.toFixed(2)} (Gemini spot) = $${h.valueUsd.toFixed(2)}`);
console.table(
  view.threats.map((t) => ({
    symbol: t.symbol,
    "harmful side": t.harmfulSide,
    "YES (OddsFeed)": `${t.yesBps / 100}%`,
    harm: `${Math.round(t.decision.pHarm * 1000) / 10}%`,
    trigger: `${t.trigger * 100}%`,
    execution: t.execution,
    "side price": t.sidePrice === null ? "none" : `$${t.sidePrice.toFixed(2)}`,
    action: t.decision.action,
    covered: `${t.alreadyCovered} / ${t.decision.needed}`,
    "to buy": t.decision.contracts,
    "premium est.": `$${t.decision.premiumEstimate.toFixed(2)}`,
  })),
);
for (const t of view.threats) console.log(`${t.symbol}: ${t.decision.reason}`);
console.log("PAPER TRADE: side prices are real production prices; paper trades fill here. No orders are sent.");
