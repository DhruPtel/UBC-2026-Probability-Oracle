// The oracle's core step: read a market from Gemini and publish its YES probability to
// OddsFeed on Arc.
// The plain path: no checks or smoothing (Phase 10).
// The oracle is neutral: it publishes YES exactly as odds.ts computes it and never
// reads harmfulOutcome.
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { keccak256, stringToHex } from "viem";
import { addressOf, loadArtifact } from "../shared/artifacts.js";
import { EXPLORER, asDeployer, publicClient, walletClient } from "../shared/chain.js";
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
  round?: number;
  txHash?: string;
  txUrl?: string;
  block?: number;
};

const toNumber = (text: string | undefined) => (text === undefined ? null : Number(text));

// One market: fetch it live from Gemini and publish it. With onlyIfChanged, an unchanged
// value is not published again: round stays the onchain round and txHash is null.
// probBps is null when Gemini shows no usable price; nothing is published then.
export async function refreshMarket({ symbol, eventTicker }: { symbol: string; eventTicker: string }, onlyIfChanged: boolean) {
  const address = addressOf("OddsFeed");
  const { abi } = loadArtifact("OddsFeed");
  const ts = new Date().toISOString();

  const { event } = await getEvent(eventTicker); // gemini.ts spaces calls 1 second apart
  const rawContract = event.contracts.find((c) => c.instrumentSymbol === symbol);
  if (!rawContract) throw new Error(`${symbol} is not a contract of event ${eventTicker}`);

  const current = (await publicClient.readContract({
    address,
    abi,
    functionName: "latestBySymbol",
    args: [symbol],
  })) as { probBps: number; round: number };

  const odds = probability(rawContract);
  const seen = {
    ts,
    symbol,
    probBps: odds.prob === null ? null : toBps(odds.prob),
    prevProbBps: current.probBps,
    method: odds.method,
    bid: toNumber(rawContract.prices?.bestBid),
    ask: toNumber(rawContract.prices?.bestAsk),
    last: toNumber(rawContract.prices?.lastTradePrice),
    sourceHash: keccak256(stringToHex(JSON.stringify(rawContract))),
  };
  const unchanged = current.round > 0 && current.probBps === seen.probBps;
  if (seen.probBps === null || (onlyIfChanged && unchanged)) {
    return { ...seen, round: current.round, txHash: null, block: null };
  }

  return publishValue({ ...seen, probBps: seen.probBps }, current.round);
}

// Sends one value to OddsFeed and records it in logs/oracle.jsonl. `ts` is the time the value
// was observed. The demo replay (unit 7.3) publishes each historical candle through this too.
export async function publishValue<T extends { ts: string; symbol: string; probBps: number; sourceHash: `0x${string}` }>(seen: T, currentRound: number) {
  const { txHash, receipt } = await asDeployer(async () => {
    const txHash = await walletClient("DEPLOYER_KEY").writeContract({
      address: addressOf("OddsFeed"),
      abi: loadArtifact("OddsFeed").abi,
      functionName: "publish",
      args: [seen.symbol, seen.probBps, BigInt(Math.floor(Date.parse(seen.ts) / 1000)), seen.sourceHash],
    });
    return { txHash, receipt: await publicClient.waitForTransactionReceipt({ hash: txHash }) };
  });

  const line = { ...seen, round: currentRound + 1, txHash, block: Number(receipt.blockNumber), publishedAt: new Date().toISOString() };
  mkdirSync("logs", { recursive: true });
  appendFileSync("logs/oracle.jsonl", JSON.stringify(line) + "\n");
  return line;
}

// Every configured market, one at a time. Always publishes, even an unchanged value, as a
// heartbeat. No retries: a failed market is logged and the next one runs.
export async function publishOnce(): Promise<PublishResult[]> {
  const config = JSON.parse(readFileSync("config/markets.json", "utf8"));
  const markets: { symbol: string; eventTicker: string }[] = config.markets;
  const results: PublishResult[] = [];

  for (const market of markets) {
    try {
      const r = await refreshMarket(market, false);
      if (r.probBps === null || r.txHash === null) {
        const note = "no price: Gemini shows no bid and ask pair and no last trade";
        console.log(`${r.symbol}  ${note}`);
        results.push({ ts: r.ts, symbol: r.symbol, ok: false, note });
        continue;
      }
      results.push({ ...r, probBps: r.probBps, txHash: r.txHash, block: r.block ?? undefined, ok: true, txUrl: `${EXPLORER}/tx/${r.txHash}` });
    } catch (err) {
      const note = err instanceof Error ? err.message : String(err);
      console.log(`${market.symbol}  error: ${note}`);
      results.push({ ts: new Date().toISOString(), symbol: market.symbol, ok: false, note });
    }
  }
  return results;
}
