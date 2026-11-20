// The agent's real-world inputs: our oracle onchain, and Gemini's production public data.
import { readFileSync } from "node:fs";
import { GatewayClient } from "@circle-fin/x402-batching/client";
import { getEvent, getSpot } from "../oracle/gemini.js";
import { addressOf, loadArtifact } from "../shared/artifacts.js";
import { publicClient } from "../shared/chain.js";
import { demoPaperFile, paperPositions } from "./paper.js";
import { decide, pickStrike, strikeOf, type DecideInput } from "./policy.js";

// threats.json holds a rule per asset; the threat itself is picked from the live feed each time:
// "ends below $X", X the nearest strike below today's price on the latest date (unit 11.13).
type Rule = Pick<DecideInput, "harmfulOutcome" | "trigger" | "hedgeRatio" | "execution"> & { asset: string };
export type Threat = Rule & {
  symbol: string;
  eventTicker: string;
  label: string;
  expiry: string;
  strikeUsd: number;
  risk: string; // the threat in plain words, for the pages
  riskShort: string;
};
type Holding = { label: string; asset: string; amount: number; spotPair: string };
// A market of the server's live feed (GET /api/feed).
export type FeedRow = { symbol: string; eventTicker: string; label: string; expiry: string; asset: string | null; bad: { side: "YES" | "NO"; risk: string } | null; thin: string | null; stale?: boolean };

// The YES probability our oracle last published for this symbol. A free chain read.
export async function readYesBps(symbol: string) {
  const o = (await publicClient.readContract({
    address: addressOf("OddsFeed"),
    abi: loadArtifact("OddsFeed").abi,
    functionName: "latestBySymbol",
    args: [symbol],
  })) as { probBps: number; publishedAt: bigint; round: number };
  return { yesBps: o.probBps, publishedAt: Number(o.publishedAt), round: o.round };
}

// The same odds through the paid x402 read ($0.001 from the agent's Gateway balance). The
// oracle fetches Gemini live and refreshes OddsFeed if the value changed. Needs the Lab
// server running (npm run lab). `run` ties the payment to an agent run in logs/payments.jsonl.
export type PaidOdds = {
  probBps: number | null;
  prevProbBps: number;
  method: string;
  observedAt: string;
  sourceHash: string;
  round: number;
  txHash: string | null; // the oracle's publish, when the value had changed
  thin?: string | null; // why the oracle did not post this value: the book is too thin (unit 10.2)
};
export async function paidRead(symbol: string, run: string) {
  const client = new GatewayClient({
    chain: "arcTestnet",
    privateKey: process.env.AGENT_KEY as `0x${string}`,
    rpcUrl: process.env.ARC_RPC_URL,
  });
  const url = `http://127.0.0.1:${process.env.PORT || 8787}/odds/${encodeURIComponent(symbol)}?run=${encodeURIComponent(run)}`;
  const paid = await client.pay<PaidOdds>(url);
  return { ...paid.data, amount: paid.formattedAmount, transfer: paid.transaction, payer: client.address };
}

// What it costs to buy the harmful side on production Gemini right now.
// The real production price; paper trades fill here.
export async function readSidePrice(eventTicker: string, symbol: string, side: "YES" | "NO") {
  const { event } = await getEvent(eventTicker);
  const contract = event.contracts.find((c) => c.instrumentSymbol === symbol);
  const price = side === "YES" ? contract?.prices?.buy?.yes : contract?.prices?.buy?.no;
  return price === undefined ? null : Number(price);
}

export function loadRules(): Rule[] {
  return JSON.parse(readFileSync("src/agent/threats.json", "utf8"));
}

// The threat each rule picks from the feed's markets at today's prices. Pure.
export function threatsFrom(rows: FeedRow[], spots: Record<string, number>): Threat[] {
  return loadRules().flatMap((rule) => {
    const spot = spots[rule.asset];
    if (!spot) return [];
    const strikes = rows
      .filter((m) => m.asset === rule.asset && m.bad?.side === rule.harmfulOutcome && !m.thin && !m.stale)
      .map((m) => ({ m, strikeUsd: strikeOf(m.label) ?? Infinity, expiry: m.expiry }));
    const pick = pickStrike(strikes, spot);
    if (!pick) return [];
    const k = pick.strikeUsd >= 1000 ? `$${pick.strikeUsd / 1000}k` : `$${pick.strikeUsd}`;
    return [{ ...rule, symbol: pick.m.symbol, eventTicker: pick.m.eventTicker, label: pick.m.label, expiry: pick.m.expiry, strikeUsd: pick.strikeUsd, risk: pick.m.bad!.risk, riskShort: `${rule.asset} below ${k}` }];
  });
}

// The feed's markets. The server hands over its own (useFeedRows); a script run beside it asks
// the running server.
let feedRows = async (): Promise<FeedRow[]> => (await (await fetch(`http://127.0.0.1:${process.env.PORT || 8787}/api/feed`)).json()).markets;
export const useFeedRows = (read: () => Promise<FeedRow[]>) => void (feedRows = read);
export async function threatsFor(holding: { asset: string; spotUsd: number }) {
  return threatsFrom(await feedRows(), { [holding.asset]: holding.spotUsd });
}

// The DECLARED HOLDING, valued at Gemini's spot price.
export async function readHolding(holding: Holding = JSON.parse(readFileSync("src/agent/portfolio.json", "utf8"))) {
  const spotUsd = (await getSpot(holding.spotPair)).last;
  return { ...holding, spotUsd, valueUsd: Math.round(holding.amount * spotUsd * 100) / 100 };
}

// A demo run (unit 7.3): the agent watches only the replay symbol, with a smaller DECLARED
// HOLDING valued once when the demo starts, and its own paper positions for that run.
// `holdingAt` values the holding at the replayed hour of a round: the hour of the value the agent paid for.
export type DemoRun = { runId: string; holding: Awaited<ReturnType<typeof readHolding>>; holdingAt?: (round: number) => Awaited<ReturnType<typeof readHolding>> };
export function loadDemo(): { holding: Holding; threat: Threat } {
  return JSON.parse(readFileSync("src/agent/demo.json", "utf8"));
}

// One threat's real inputs and the decision they lead to. The Lab's view reads the feed for
// free; an agent run passes in the feed value it paid for and confirmed onchain.
// In a demo run the price to buy is the replayed chance itself (REPLAY), not a live Gemini price.
export async function readThreat(threat: Threat, holding: { valueUsd: number; spotUsd: number }, paidFeed?: Awaited<ReturnType<typeof readYesBps>>, demo?: DemoRun) {
  const market = demo ? { label: "REPLAY of " + threat.risk, eventTicker: "" } : threat;
  const feed = paidFeed ?? (await readYesBps(threat.symbol));
  const sidePrice = demo
    ? (threat.harmfulOutcome === "YES" ? feed.yesBps : 10000 - feed.yesBps) / 10000
    : await readSidePrice(market.eventTicker, threat.symbol, threat.harmfulOutcome);
  const alreadyCovered = paperPositions(demo ? demoPaperFile(demo.runId) : undefined)[`${threat.symbol} ${threat.harmfulOutcome}`] ?? 0;

  const input: DecideInput = {
    yesBps: feed.yesBps,
    harmfulOutcome: threat.harmfulOutcome,
    trigger: threat.trigger,
    exposureUsd: holding.valueUsd,
    spotUsd: holding.spotUsd,
    strikeUsd: threat.strikeUsd,
    hedgeRatio: threat.hedgeRatio,
    alreadyCovered, // PAPER TRADE fills from logs/paper.jsonl
    sidePrice: sidePrice ?? 0,
    execution: threat.execution,
  };
  return {
    symbol: threat.symbol,
    risk: threat.risk,
    riskShort: threat.riskShort,
    label: market.label,
    harmfulSide: threat.harmfulOutcome,
    yesBps: feed.yesBps,
    feedRound: feed.round,
    feedPublishedAt: feed.publishedAt,
    trigger: threat.trigger,
    strikeUsd: threat.strikeUsd,
    spotUsd: holding.spotUsd,
    execution: threat.execution,
    sidePrice,
    sidePriceNote: demo ? "REPLAY: the replayed chance" : "real production price; paper trades fill here",
    alreadyCovered,
    input,
    decision: decide(input),
  };
}

// Everything the Agent panel and `npm run agent:dry` show: the holding and one decision per threat.
export async function agentView() {
  const holding = await readHolding();
  const threats = [];
  for (const threat of await threatsFor(holding)) threats.push(await readThreat(threat, holding));
  return { holding, threats };
}
