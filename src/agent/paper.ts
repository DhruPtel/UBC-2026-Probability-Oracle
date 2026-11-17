// PAPER TRADE fills: the agent's Gemini buys, recorded at the real production price.
// No order is sent to Gemini. The USDC premium for each fill is real and onchain (ProtectionBook).
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";

const FILE = "logs/paper.jsonl";

export type PaperFill = {
  ts: string;
  symbol: string;
  side: "YES" | "NO";
  contracts: number;
  price: number; // production prices.buy.<side> at decision time
  premiumUsdc: number;
  orderRef: string;
  txHash: string; // the buyProtection transaction that paid the premium
};

// A demo run (unit 7.3) keeps its own fills, so every run starts uninsured. They are
// labeled REPLAY: priced at the replayed chance, not at a live Gemini price.
export const demoPaperFile = (runId: string) => `logs/paper-demo-${runId}.jsonl`;

export function recordPaperFill(fill: PaperFill, file = FILE) {
  mkdirSync("logs", { recursive: true });
  appendFileSync(file, JSON.stringify({ label: file === FILE ? "PAPER TRADE" : "REPLAY", ...fill }) + "\n");
}

export function paperFills(file = FILE): PaperFill[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

// Contracts held per symbol and side, keyed "<symbol> <side>".
export function paperPositions(file = FILE): Record<string, number> {
  const held: Record<string, number> = {};
  for (const f of paperFills(file)) {
    const key = `${f.symbol} ${f.side}`;
    held[key] = (held[key] ?? 0) + f.contracts;
  }
  return held;
}
