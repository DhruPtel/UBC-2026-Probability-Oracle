// The oracle's core step: read each configured market from Gemini and publish its
// YES probability to OddsFeed on Arc.
// The plain path: always publishes (a heartbeat), with no checks, smoothing or change
// detection. Those arrive in Phase 7.
// The oracle is neutral: it publishes YES exactly as odds.ts computes it and never
// reads harmfulOutcome.
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { keccak256, stringToHex } from "viem";
import { addressOf, loadArtifact } from "../shared/artifacts.js";
import { EXPLORER, publicClient, walletClient } from "../shared/chain.js";
import { getEvent } from "./gemini.js";
import { probability, toBps } from "./odds.js";

export type PublishResult = {
  ts: string;
  symbol: string;
  ok: boolean;
  note?: string; // why nothing was published: "no price: ..." or an error message
  probBps?: number;
  prevProbBps?: number;
  method?: string;
  bid?: number | null;
  ask?: number | null;
  last?: number | null;
  sourceHash?: string;
  txHash?: string;
  txUrl?: string;
  block?: number;
};

const toNumber = (text: string | undefined) => (text === undefined ? null : Number(text));

export async function publishOnce(): Promise<PublishResult[]> {
  const config = JSON.parse(readFileSync("config/markets.json", "utf8"));
  const markets: { symbol: string; eventTicker: string }[] = config.markets;
  const address = addressOf("OddsFeed");
  const { abi } = loadArtifact("OddsFeed");
  const results: PublishResult[] = [];

  for (const { symbol, eventTicker } of markets) {
    const ts = new Date().toISOString();
    try {
      const { event } = await getEvent(eventTicker); // gemini.ts spaces calls 1 second apart
      const rawContract = event.contracts.find((c) => c.instrumentSymbol === symbol);
      if (!rawContract) throw new Error(`${symbol} is not a contract of event ${eventTicker}`);

      const odds = probability(rawContract);
      if (odds.prob === null) {
        const note = "no price: Gemini shows no bid and ask pair and no last trade";
        console.log(`${symbol}  ${note}`);
        results.push({ ts, symbol, ok: false, note });
        continue;
      }

      const probBps = toBps(odds.prob);
      const observedAt = BigInt(Math.floor(Date.now() / 1000));
      const sourceHash = keccak256(stringToHex(JSON.stringify(rawContract)));

      const current = (await publicClient.readContract({
        address,
        abi,
        functionName: "latestBySymbol",
        args: [symbol],
      })) as { probBps: number };
      const prevProbBps = current.probBps;

      const txHash = await walletClient("DEPLOYER_KEY").writeContract({
        address,
        abi,
        functionName: "publish",
        args: [symbol, probBps, observedAt, sourceHash],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

      const line = {
        ts,
        symbol,
        probBps,
        prevProbBps,
        method: odds.method,
        bid: toNumber(rawContract.prices?.bestBid),
        ask: toNumber(rawContract.prices?.bestAsk),
        last: toNumber(rawContract.prices?.lastTradePrice),
        sourceHash,
        txHash,
        block: Number(receipt.blockNumber),
      };
      mkdirSync("logs", { recursive: true });
      appendFileSync("logs/oracle.jsonl", JSON.stringify(line) + "\n");

      results.push({ ...line, ok: true, txUrl: `${EXPLORER}/tx/${txHash}` });
    } catch (err) {
      const note = err instanceof Error ? err.message : String(err);
      console.log(`${symbol}  error: ${note}`);
      results.push({ ts, symbol, ok: false, note });
    }
  }
  return results;
}
