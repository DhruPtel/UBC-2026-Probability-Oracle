// One agent cycle: read our onchain odds, decide, pay the USDC premium onchain through
// ProtectionBook, and record the hedge as a PAPER TRADE at the real Gemini production price.
// No budget or approval yet (Phase 7). No retries: a failed step is recorded and the next threat runs.
import { appendFileSync, mkdirSync } from "node:fs";
import { erc20Abi, keccak256, toHex } from "viem";
import { addressOf, loadArtifact } from "../shared/artifacts.js";
import { USDC, publicClient, walletClient } from "../shared/chain.js";
import { loadThreats, readHolding, readThreat } from "./inputs.js";
import { recordPaperFill } from "./paper.js";

export type Step = {
  ts: string;
  threat: string;
  step: "inputs" | "decision" | "approve" | "buyProtection" | "paper fill" | "done" | "hold" | "error";
  detail: string;
  txHash?: string;
};

export async function runOnce(): Promise<Step[]> {
  const steps: Step[] = [];
  const log = (threat: string, step: Step["step"], detail: string, txHash?: string) => {
    const line: Step = { ts: new Date().toISOString(), threat, step, detail, ...(txHash ? { txHash } : {}) };
    steps.push(line);
    mkdirSync("logs", { recursive: true });
    appendFileSync("logs/agent.jsonl", JSON.stringify(line) + "\n");
  };
  const message = (err: unknown) => (err instanceof Error ? err.message : String(err)).split("\n")[0];

  let holding;
  try {
    holding = await readHolding();
  } catch (err) {
    log("holding", "error", `could not value the holding: ${message(err)}`);
    return steps;
  }

  const book = addressOf("ProtectionBook");
  const bookAbi = loadArtifact("ProtectionBook").abi;
  const agent = walletClient("AGENT_KEY");

  for (const threat of loadThreats()) {
    try {
      const t = await readThreat(threat, holding.valueUsd);
      const side = t.harmfulSide;
      log(
        t.symbol,
        "inputs",
        `OddsFeed says ${t.yesBps / 100}% YES (round ${t.feedRound}); ${holding.label} ${holding.amount} ${holding.asset} = $${holding.valueUsd.toFixed(2)}; ` +
          `price to buy ${side} ${t.sidePrice === null ? "none" : "$" + t.sidePrice.toFixed(2)} (${t.sidePriceNote}); already covered ${t.alreadyCovered} ${side}`,
      );
      log(t.symbol, "decision", t.decision.reason);

      if (t.decision.action === "hold") {
        log(t.symbol, "hold", t.alreadyCovered > 0 ? `hold, already covered (${t.alreadyCovered} / ${t.decision.needed} ${side})` : "hold");
        continue;
      }
      if (t.sidePrice === null) throw new Error(`Gemini has no price to buy ${side} right now`);

      // Premium in USDC base units (6 decimals), rounded up. Rounding to 3 places first removes float noise.
      const contracts = t.decision.contracts;
      const premium = BigInt(Math.ceil(Math.round(contracts * t.sidePrice * 1e9) / 1e3));
      const premiumUsdc = Number(premium) / 1e6;

      const approveTx = await agent.writeContract({ address: USDC, abi: erc20Abi, functionName: "approve", args: [book, premium] });
      const approved = await publicClient.waitForTransactionReceipt({ hash: approveTx });
      if (approved.status !== "success") throw new Error(`approve reverted: ${approveTx}`);
      log(t.symbol, "approve", `approved ProtectionBook to take ${premiumUsdc} USDC`, approveTx);

      const orderRef = keccak256(toHex(`${t.symbol}:${Date.now()}`));
      const buyTx = await agent.writeContract({
        address: book,
        abi: bookAbi,
        functionName: "buyProtection",
        args: [t.symbol, side === "YES" ? 0 : 1, contracts, premium, orderRef],
      });
      const bought = await publicClient.waitForTransactionReceipt({ hash: buyTx });
      if (bought.status !== "success") throw new Error(`buyProtection reverted: ${buyTx}`);
      log(t.symbol, "buyProtection", `paid ${premiumUsdc} USDC premium to the treasury for ${contracts} ${side}`, buyTx);

      recordPaperFill({ ts: new Date().toISOString(), symbol: t.symbol, side, contracts, price: t.sidePrice, premiumUsdc, orderRef, txHash: buyTx });
      log(t.symbol, "paper fill", `PAPER TRADE: bought ${contracts} ${side} at $${t.sidePrice.toFixed(2)} (real production price), order ref ${orderRef.slice(0, 10)}…`);
      log(t.symbol, "done", `covered ${t.alreadyCovered + contracts} / ${t.decision.needed} ${side}`);
    } catch (err) {
      log(threat.symbol, "error", message(err));
    }
  }
  return steps;
}
