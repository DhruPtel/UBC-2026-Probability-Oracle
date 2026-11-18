// The agent's real-world inputs: our oracle onchain, and Gemini's production public data.
import { readFileSync } from "node:fs";
import { GatewayClient } from "@circle-fin/x402-batching/client";
import { getEvent, getSpot } from "../oracle/gemini.js";
import { addressOf, loadArtifact } from "../shared/artifacts.js";
import { publicClient } from "../shared/chain.js";
import { demoPaperFile, paperPositions } from "./paper.js";
import { decide, type DecideInput } from "./policy.js";

type Threat = Pick<DecideInput, "harmfulOutcome" | "shock" | "trigger" | "hedgeRatio" | "execution"> & {
  symbol: string;
  risk: string; // the threat in plain words, for the Lab
  riskShort: string;
};
type Holding = { label: string; asset: string; amount: number; spotPair: string };
type Market = { symbol: string; eventTicker: string; label: string };

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

export function loadThreats(): Threat[] {
  return JSON.parse(readFileSync("src/agent/threats.json", "utf8"));
}

// The DECLARED HOLDING, valued at Gemini's spot price.
export async function readHolding(holding: Holding = JSON.parse(readFileSync("src/agent/portfolio.json", "utf8"))) {
  const spotUsd = (await getSpot(holding.spotPair)).last;
  return { ...holding, spotUsd, valueUsd: Math.round(holding.amount * spotUsd * 100) / 100 };
}

// A demo run (unit 7.3): the agent watches only the replay symbol, with a smaller DECLARED
// HOLDING valued once when the demo starts, and its own paper positions for that run.
export type DemoRun = { runId: string; holding: Awaited<ReturnType<typeof readHolding>> };
export function loadDemo(): { holding: Holding; threat: Threat } {
  return JSON.parse(readFileSync("src/agent/demo.json", "utf8"));
}

// One threat's real inputs and the decision they lead to. The Lab's view reads the feed for
// free; an agent run passes in the feed value it paid for and confirmed onchain.
// In a demo run the price to buy is the replayed chance itself (REPLAY), not a live Gemini price.
export async function readThreat(threat: Threat, exposureUsd: number, paidFeed?: Awaited<ReturnType<typeof readYesBps>>, demo?: DemoRun) {
  const markets: Market[] = JSON.parse(readFileSync("config/markets.json", "utf8")).markets;
  const market = demo ? { label: "REPLAY of " + threat.risk, eventTicker: "" } : markets.find((m) => m.symbol === threat.symbol);
  if (!market) throw new Error(`${threat.symbol} is in threats.json but not in config/markets.json`);
  const feed = paidFeed ?? (await readYesBps(threat.symbol));
  const sidePrice = demo
    ? (threat.harmfulOutcome === "YES" ? feed.yesBps : 10000 - feed.yesBps) / 10000
    : await readSidePrice(market.eventTicker, threat.symbol, threat.harmfulOutcome);
  const alreadyCovered = paperPositions(demo ? demoPaperFile(demo.runId) : undefined)[`${threat.symbol} ${threat.harmfulOutcome}`] ?? 0;

  const input: DecideInput = {
    yesBps: feed.yesBps,
    harmfulOutcome: threat.harmfulOutcome,
    trigger: threat.trigger,
    exposureUsd,
    shock: threat.shock,
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
  for (const threat of loadThreats()) threats.push(await readThreat(threat, holding.valueUsd));
  return { holding, threats };
}
