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

export function recordPaperFill(fill: PaperFill) {
  mkdirSync("logs", { recursive: true });
  appendFileSync(FILE, JSON.stringify({ label: "PAPER TRADE", ...fill }) + "\n");
}

export function paperFills(): PaperFill[] {
  if (!existsSync(FILE)) return [];
  return readFileSync(FILE, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

// Contracts held per symbol and side, keyed "<symbol> <side>".
export function paperPositions(): Record<string, number> {
  const held: Record<string, number> = {};
  for (const f of paperFills()) {
    const key = `${f.symbol} ${f.side}`;
    held[key] = (held[key] ?? 0) + f.contracts;
  }
  return held;
}
