// One agent cycle: pay for a fresh odds read (x402), confirm it onchain, decide, pay the USDC
// premium onchain through ProtectionBook, and record the hedge as a PAPER TRADE at the real
// Gemini production price.
// No budget or approval yet (Phase 8). No retries: a failed step is recorded and the next threat runs.
import { appendFileSync, mkdirSync } from "node:fs";
import { erc20Abi, keccak256, toHex } from "viem";
import { addressOf, loadArtifact } from "../shared/artifacts.js";
import { USDC, publicClient, walletClient } from "../shared/chain.js";
import { loadDemo, loadThreats, paidRead, readHolding, readThreat, readYesBps, type DemoRun } from "./inputs.js";
import { demoPaperFile, recordPaperFill } from "./paper.js";

export type Step = {
  ts: string;
  run: string; // the run's start time; every step of one run shares it
  threat: string; // a symbol, or "run" for the run's own start and skipped lines
  step: "start" | "skipped" | "paid read" | "onchain check" | "inputs" | "decision" | "approve" | "buyProtection" | "paper fill" | "done" | "hold" | "error";
  detail: string;
  txHash?: string;
  trigger?: string; // on start and skipped: "timer", "button", "manual", "stream: bigMove …", "stream: walletChange …"
  round?: number; // on onchain check: the round the paid read and the chain agree on
  demo?: string; // the demo run this step belongs to (unit 7.3)
};

// One run at a time in this process: two runs at once would collide on the agent's nonce.
let running = false;

// With `demo`, the run checks only the demo threat on the replay symbol, and its fill is REPLAY.
export async function runOnce(trigger: string, demo?: DemoRun): Promise<Step[]> {
  const run = new Date().toISOString();
  const steps: Step[] = [];
  const log = (threat: string, step: Step["step"], detail: string, extra: Partial<Step> = {}) => {
    const line: Step = { ts: new Date().toISOString(), run, threat, step, detail, ...extra, ...(demo ? { demo: demo.runId } : {}) };
    steps.push(line);
    mkdirSync("logs", { recursive: true });
    appendFileSync("logs/agent.jsonl", JSON.stringify(line) + "\n");
  };
  const message = (err: unknown) => (err instanceof Error ? err.message : String(err)).split("\n")[0];

  if (running) {
    log("run", "skipped", "skipped, run in progress", { trigger });
    return steps;
  }
  running = true;
  try {
    log("run", "start", `triggered by ${trigger}`, { trigger });

    let holding;
    try {
      holding = demo ? demo.holding : await readHolding();
    } catch (err) {
      log("holding", "error", `could not value the holding: ${message(err)}`);
      return steps;
    }

    const book = addressOf("ProtectionBook");
    const bookAbi = loadArtifact("ProtectionBook").abi;
    const agent = walletClient("AGENT_KEY");

    for (const threat of demo ? [loadDemo().threat] : loadThreats()) {
      try {
        // Pay for the odds, then confirm the free onchain read shows the same round.
        const paid = await paidRead(threat.symbol, run);
        if (paid.probBps === null) throw new Error("the paid read returned no price: Gemini shows no bid and ask pair and no last trade");
        log(
          threat.symbol,
          "paid read",
          `paid ${paid.amount} USDC over x402 (payer ${paid.payer}, Gateway transfer ${paid.transfer}) → ${paid.probBps / 100}% YES, round ${paid.round}; ` +
            (paid.txHash ? `the read refreshed the feed (was ${paid.prevProbBps / 100}%)` : "the feed already held this value"),
          paid.txHash ? { txHash: paid.txHash } : {},
        );
        const feed = await readYesBps(threat.symbol);
        if (feed.round !== paid.round || feed.yesBps !== paid.probBps) {
          throw new Error(`OddsFeed shows round ${feed.round} at ${feed.yesBps / 100}% YES, but the paid read said round ${paid.round} at ${paid.probBps / 100}%`);
        }
        log(threat.symbol, "onchain check", `OddsFeed.latestBySymbol shows round ${feed.round} at ${feed.yesBps / 100}% YES: the same as the paid read`, { round: feed.round });

        const t = await readThreat(threat, holding.valueUsd, feed, demo);
        const side = t.harmfulSide;
        log(
          t.symbol,
          "inputs",
          `${t.yesBps / 100}% YES (round ${t.feedRound}); ${holding.label} ${holding.amount} ${holding.asset} = $${holding.valueUsd.toFixed(2)}; ` +
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
        log(t.symbol, "approve", `approved ProtectionBook to take ${premiumUsdc} USDC`, { txHash: approveTx });

        const orderRef = keccak256(toHex(`${t.symbol}:${Date.now()}`));
        const buyTx = await agent.writeContract({
          address: book,
          abi: bookAbi,
          functionName: "buyProtection",
          args: [t.symbol, side === "YES" ? 0 : 1, contracts, premium, orderRef],
        });
        const bought = await publicClient.waitForTransactionReceipt({ hash: buyTx });
        if (bought.status !== "success") throw new Error(`buyProtection reverted: ${buyTx}`);
        log(t.symbol, "buyProtection", `paid ${premiumUsdc} USDC premium to the treasury for ${contracts} ${side}`, { txHash: buyTx });

        recordPaperFill({ ts: new Date().toISOString(), symbol: t.symbol, side, contracts, price: t.sidePrice, premiumUsdc, orderRef, txHash: buyTx }, demo ? demoPaperFile(demo.runId) : undefined);
        log(
          t.symbol,
          "paper fill",
          demo
            ? `REPLAY: bought ${contracts} ${side} at $${t.sidePrice.toFixed(2)} (the replayed chance), order ref ${orderRef.slice(0, 10)}…`
            : `PAPER TRADE: bought ${contracts} ${side} at $${t.sidePrice.toFixed(2)} (real production price), order ref ${orderRef.slice(0, 10)}…`,
        );
        log(t.symbol, "done", `covered ${t.alreadyCovered + contracts} / ${t.decision.needed} ${side}`);
      } catch (err) {
        log(threat.symbol, "error", message(err));
      }
    }
    return steps;
  } finally {
    running = false;
  }
}
