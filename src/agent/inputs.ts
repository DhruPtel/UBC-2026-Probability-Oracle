// The agent's real-world inputs: our oracle onchain, and Gemini's production public data.
import { readFileSync } from "node:fs";
import { getEvent, getSpot } from "../oracle/gemini.js";
import { addressOf, loadArtifact } from "../shared/artifacts.js";
import { publicClient } from "../shared/chain.js";
import { decide, type DecideInput } from "./policy.js";

type Threat = Pick<DecideInput, "harmfulOutcome" | "shock" | "trigger" | "hedgeRatio" | "execution"> & { symbol: string };
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

// What it costs to buy the harmful side on production Gemini right now.
// The real production price; paper trades fill here.
export async function readSidePrice(eventTicker: string, symbol: string, side: "YES" | "NO") {
  const { event } = await getEvent(eventTicker);
  const contract = event.contracts.find((c) => c.instrumentSymbol === symbol);
  const price = side === "YES" ? contract?.prices?.buy?.yes : contract?.prices?.buy?.no;
  return price === undefined ? null : Number(price);
}

// Everything the Agent panel and `npm run agent:dry` show: the holding and one decision per threat.
export async function agentView() {
  const holding: Holding = JSON.parse(readFileSync("src/agent/portfolio.json", "utf8"));
  const threats: Threat[] = JSON.parse(readFileSync("src/agent/threats.json", "utf8"));
  const markets: Market[] = JSON.parse(readFileSync("config/markets.json", "utf8")).markets;

  const spot = (await getSpot(holding.spotPair)).last;
  const exposureUsd = Math.round(holding.amount * spot * 100) / 100;

  const rows = [];
  for (const threat of threats) {
    const market = markets.find((m) => m.symbol === threat.symbol);
    if (!market) throw new Error(`${threat.symbol} is in threats.json but not in config/markets.json`);
    const feed = await readYesBps(threat.symbol);
    const sidePrice = await readSidePrice(market.eventTicker, threat.symbol, threat.harmfulOutcome);

    const input: DecideInput = {
      yesBps: feed.yesBps,
      harmfulOutcome: threat.harmfulOutcome,
      trigger: threat.trigger,
      exposureUsd,
      shock: threat.shock,
      hedgeRatio: threat.hedgeRatio,
      alreadyCovered: 0, // unit 4.2 fills this in from real positions
      sidePrice: sidePrice ?? 0,
      execution: threat.execution,
    };
    rows.push({
      symbol: threat.symbol,
      label: market.label,
      harmfulSide: threat.harmfulOutcome,
      yesBps: feed.yesBps,
      feedRound: feed.round,
      feedPublishedAt: feed.publishedAt,
      trigger: threat.trigger,
      execution: threat.execution,
      sidePrice,
      sidePriceNote: "real production price; paper trades fill here",
      input,
      decision: decide(input),
    });
  }

  return { holding: { ...holding, spotUsd: spot, valueUsd: exposureUsd }, threats: rows };
}
