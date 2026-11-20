// The Lab server: a local dev page for watching the chain and playing with our contracts.
// Bound to 127.0.0.1, so it is reachable from this machine only. With PUBLIC_MODE=1 (the hosted
// copy, unit 11.2) it listens on every interface and answers only what a visitor's pages call.
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, statSync, watch, writeFileSync } from "node:fs";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { GatewayClient } from "@circle-fin/x402-batching/client";
import { createGatewayMiddleware } from "@circle-fin/x402-batching/server";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { createPublicClient, erc20Abi, formatUnits, getAddress, http, keccak256, parseAbi, stringToHex, zeroHash } from "viem";
import { runOnce, type Step } from "../agent/agent.js";
import { agentView, loadDemo, loadRules, readHolding, threatsFrom, useFeedRows, type DemoRun } from "../agent/inputs.js";
import { demoPaperFile, paperFills } from "../agent/paper.js";
import { decide, lossIfBelow, whyLine } from "../agent/policy.js";
import { getOrder } from "../agent/trade.js";
import { takerFee } from "../desk/cover.js";
import * as desk from "../desk/desk.js";
import { deskServer } from "../desk/mcp.js";
import { addressOf, loadArtifact } from "../shared/artifacts.js";
import { getCandles, getCategories, getEvent, getEvents, getSpot, type GeminiCandle, type GeminiContract, type GeminiEvent } from "../oracle/gemini.js";
import { CUTS, aaveLadder, lessUsd, levelOf, morphoLadder } from "../oracle/limits.js";
import { badOutcomeOf, chanceOfBad, probability, thin, toBps } from "../oracle/odds.js";
import { publishOnce, publishValue, refreshMarket } from "../oracle/publisher.js";
import { EXPLORER, USDC, account, asDeployer, publicClient, walletClient } from "../shared/chain.js";

const PORT = Number(process.env.PORT || 8787);
const PUBLIC = process.env.PUBLIC_MODE === "1";
// LOOPS=off (unit 11.2): the pages and their data only. Nothing is sent from the deployer: no
// posts, no keeper syncs, no agent runs, no new agents or replays. For a second copy beside the
// one that posts (two copies on one wallet collide on its nonce).
const LOOPS = process.env.LOOPS !== "off";
const INSIDE = randomUUID(); // marks the calls this server makes to itself (the MCP tools at /mcp)
const inside = (req: express.Request) => req.get("x-inside") === INSIDE;
const app = express();
if (PUBLIC) app.set("trust proxy", true); // req.ip is the visitor's address behind the host's proxy
// The Stream webhook reads its body as text (the signature is over the exact bytes).
app.use((req, res, next) => (req.path === "/stream" ? next() : express.json()(req, res, next)));

// PUBLIC_MODE=1: the pages, their data, the paid read, the webhook and the two things a visitor
// may start (a demo agent, a replay). The Lab and every admin or test route answer 404.
const OPEN = [
  /^\/$/, /^\/(overview|markets|use|insure|oracle|agents|pools)$/, /^\/site\//, /^\/api\/markets\/categories$/, /^\/api\/site\/markets$/, /^\/pools\/[^/]+$/, /^\/demo\/agent$/, /^\/static\//, /^\/events$/, /^\/odds\/[^/]+$/, /^\/stream$/,
  /^\/health$/, /^\/mcp$/, /^\/api\/(health|oracle|agent|defi|advisor|feed|feed\/history|history|pools|pools\/history|stream|desk)$/, /^\/api\/demo\/(agent|protocol)(\/start)?$/,
  /^\/api\/desk\/sign-up$/, /^\/api\/desk\/agents\/[^/]+\/(next|run)$/, /^\/api\/desk\/order\/[^/]+$/,
];
if (PUBLIC) app.use((req, res, next) => (OPEN.some((r) => r.test(req.path)) || inside(req) ? next() : void res.status(404).send("Not found")));
// 200 while the feed loop is alive: Gemini was read in the last 5 minutes (or the process has just
// started). With LOOPS=off it answers 200 and says so.
app.get(["/health", "/api/health"], (_req, res) => {
  const ok = !LOOPS || process.uptime() < 180 || (!!feed && Date.now() - Date.parse(feed.readAt) < 300000);
  res.status(ok ? 200 : 503).json({ ok, loops: LOOPS ? "on" : "off", feedReadAt: feed?.readAt ?? null });
});

// What a visitor may start in public mode: at most 20 demo agents and 10 replays in any hour
// (200 and 60 in a day), a replay at the earliest 2 minutes after the last one started, and
// nothing while the deployer (it lends premiums and pays the gas) holds under 5 USDC.
const started = { agents: [] as number[], replays: [] as number[] };
const HOURLY = { agents: 20, replays: 10 }, DAILY = { agents: 200, replays: 60 }, REPLAY_GAP_MS = 120000;
async function publicLimit(kind: "agents" | "replays" | null): Promise<string | null> {
  if (!LOOPS) return "This copy only shows the pages (LOOPS=off): it starts no agents and no replays.";
  if (!PUBLIC) return null;
  if (kind) {
    const what = kind === "agents" ? "new agents" : "replays", list = started[kind], now = Date.now();
    while (list.length && list[0] < now - 86400000) list.shift();
    const hour = list.filter((t) => t > now - 3600000);
    if (kind === "replays" && list.length && now - list.at(-1)! < REPLAY_GAP_MS) return `A replay ran a moment ago. The next one can start in ${Math.ceil((list.at(-1)! + REPLAY_GAP_MS - now) / 1000)} seconds.`;
    if (hour.length >= HOURLY[kind]) return `This demo allows ${HOURLY[kind]} ${what} an hour and that many have run. Try again in ${Math.ceil((hour[0] + 3600000 - now) / 60000)} minutes.`;
    if (list.length >= DAILY[kind]) return `This demo allows ${DAILY[kind]} ${what} a day and that many have run.`;
  }
  const usdc = await cached("deployer-usdc", 30000, async () => Number(formatUnits(await publicClient.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [account("DEPLOYER_KEY").address] }), 6)));
  if (usdc < 5) return "Paused: the demo treasury is low on test USDC. The pages and the oracle still run.";
  if (kind) started[kind].push(Date.now());
  return null;
}

// The pages: the home page, the Oracle and BTC pools tabs, the agent demo, and the Lab as
// the behind-the-scenes view. The old /demo page is gone.
const page = (file: string) => (_req: express.Request, res: express.Response) => {
  res.sendFile(file, { root: process.cwd() });
};
// The product site (unit 11.10): the home page, the market list, how to use the oracle, and
// insuring an agent. The app's own pages are the live demo; its Overview moved to /overview.
app.get("/", page("site/home.html"));
app.get("/markets", page("site/markets.html"));
app.get("/use", page("site/use.html"));
app.get("/insure", page("site/insure.html"));
app.use("/site", express.static("site"));
app.get("/overview", page("demo/home.html"));
app.get("/lab", page("lab/index.html"));
app.get("/oracle", page("demo/oracle.html"));
app.get("/pools", page("demo/pools.html"));
app.get("/pools/:id", page("demo/pools.html")); // one pool, linked directly (unit 7.19)
app.get("/demo/agent", (_req, res) => res.redirect("/agents#replay")); // the replay is a mode of the Agents page (unit 8.0j)
app.get("/agents", page("demo/agents.html")); // the agent insurance desk (unit 8.0h)
app.use("/static", express.static("demo")); // demo.css and demo.js, shared by the judges' pages

// --- A small cache (unit 7.10) for the reads a page should not wait for: the last value is
// returned at once and, when it is older than ttlMs, read again in the background. The first
// read, and the first one after stale(), is awaited. A failed background read keeps the old value.
type Cached = { value: unknown; at: number; pending: Promise<unknown> | null };
const cache = new Map<string, Cached>();
function cached<T>(key: string, ttlMs: number, read: () => Promise<T>): Promise<T> {
  const entry = cache.get(key) ?? { value: undefined, at: 0, pending: null };
  cache.set(key, entry);
  const refresh = () =>
    (entry.pending ??= read()
      .then((value) => {
        entry.value = value;
        entry.at = Date.now();
        return value;
      })
      .finally(() => {
        entry.pending = null;
      })) as Promise<T>;
  if (entry.at === 0) return refresh();
  if (Date.now() - entry.at > ttlMs) refresh().catch(() => {});
  return Promise.resolve(entry.value as T);
}
const stale = (prefix: string) => {
  for (const [key, entry] of cache) if (key.startsWith(prefix)) entry.at = 0;
};

// --- Live updates (unit 7.1): GET /events is a Server-Sent Events stream. Every record this
// project writes is a line in a logs/*.jsonl file, so the server watches those files and pushes
// each new line as one typed event. That also covers lines written by other processes
// (`npm run oracle`, `npm run agent`). The browser's EventSource reconnects by itself.

const TAILED: Record<string, string> = {
  "oracle.jsonl": "oracle", // an oracle publish
  "agent.jsonl": "agent", // an agent step
  "payments.jsonl": "payment", // a paid read
  "defi.jsonl": "defi", // a DeFi sync
  "stream.jsonl": "stream", // a Stream delivery: one event per decoded event in it
  "demo.jsonl": "demo", // a demo-run step
  "desk.jsonl": "desk", // a step of an agent at the insurance desk
};
const clients = new Set<express.Response>();
function push(type: string, data: unknown) {
  for (const client of clients) client.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
}

app.get("/events", (req, res) => {
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  res.flushHeaders();
  res.write("retry: 2000\n\n");
  clients.add(res);
  req.on("close", () => clients.delete(res));
});
// A comment line every 20 s keeps a quiet connection open through the host's proxy.
setInterval(() => {
  for (const client of clients) client.write(": keep-alive\n\n");
}, 20000);

mkdirSync("logs", { recursive: true });
const tailedTo = new Map<string, number>();
for (const file of Object.keys(TAILED)) tailedTo.set(file, existsSync(`logs/${file}`) ? statSync(`logs/${file}`).size : 0);
watch("logs", (_change, file) => {
  if (!file || !TAILED[file] || !existsSync(`logs/${file}`)) return;
  const from = tailedTo.get(file)!;
  const size = statSync(`logs/${file}`).size;
  if (size <= from) return;
  const bytes = Buffer.alloc(size - from);
  const fd = openSync(`logs/${file}`, "r");
  readSync(fd, bytes, 0, bytes.length, from);
  closeSync(fd);
  tailedTo.set(file, size);
  for (const text of bytes.toString("utf8").split("\n").filter(Boolean)) {
    for (const [type, data] of toEvents(file, JSON.parse(text))) push(type, data);
  }
});

// One log line as the events the pages receive. A Stream delivery becomes one event per
// decoded event in it.
function toEvents(file: string, line: any): [string, unknown][] {
  if (line.txHash) line.txUrl = `${EXPLORER}/tx/${line.txHash}`;
  // A post or a sync changes what the advisor and the pools page would say.
  if (file === "oracle.jsonl" || file === "defi.jsonl") stale("advisor:");
  if (file === "oracle.jsonl" && line.txHash) notePost(line);
  if (file === "oracle.jsonl" && line.txHash) lastPost.set(line.symbol, { yesBps: line.probBps, round: line.round, at: line.publishedAt ?? new Date().toISOString(), txUrl: line.txUrl });
  // A post is written into the cached market list, so /api/oracle stays current without asking Gemini again.
  if (file === "oracle.jsonl" && line.txHash) {
    const m = (cache.get("oracle")?.value as { markets: any[] } | undefined)?.markets.find((x) => x.symbol === line.symbol);
    if (m) {
      m.onchain = { ...m.onchain, prevProbBps: m.onchain.probBps, probBps: line.probBps, round: line.round, txUrl: line.txUrl, publishedAt: Math.floor(Date.now() / 1000) };
      m.last = line;
    }
  }
  if (file !== "stream.jsonl") return [[TAILED[file], line]];
  return (Array.isArray(line.body) ? line.body : [])
    .filter((e: StreamEvent) => e.type)
    .map((e: StreamEvent) => ["stream", { ...e, receivedAt: line.receivedAt, via: line.via ?? "stream", txUrl: `${EXPLORER}/tx/${e.tx}` }]);
}

// The page's status pills: the latest block and whether a Stream is up. Sent every 5 seconds,
// and only while a page is connected.
const STREAM_PORT = Number(process.env.STREAM_PORT || 8788);
// Up: stream:up left its id here; or, on the hosted copy, a signed delivery arrived in the last 5 minutes.
const streamUp = () => existsSync("logs/stream-id.txt") || (!!process.env.STREAM_TOKEN && !!lastDelivery && Date.now() - Date.parse(lastDelivery) < 300000);
// When the Stream last delivered (a signed delivery that was accepted), for the top bar.
let lastDelivery: string | null = null;
const poolMarkets = new Set<string>(); // the markets the keeper syncs a pool for, as it meets them
const rechecked = new Set<string>(); // "symbol round" of each post a covered agent re-checked on
try {
  lastDelivery = readFileSync("logs/stream.jsonl", "utf8").trim().split("\n").slice(-200).map((l) => JSON.parse(l)).filter((l) => l.via === "stream" && !l.rejected).at(-1)?.receivedAt ?? null;
} catch {}
setInterval(async () => {
  if (clients.size === 0) return;
  try {
    push("status", { block: Number(await publicClient.getBlockNumber()), streamUp: streamUp(), lastDelivery });
  } catch {}
}, 5000);

app.get("/api/status", async (_req, res) => {
  try {
    const chainId = await publicClient.getChainId();
    const block = await publicClient.getBlockNumber();

    const wallets = [];
    for (const [label, name] of [
      ["deployer (oracle, treasury, owner)", "DEPLOYER_KEY"],
      ["agent", "AGENT_KEY"],
    ] as const) {
      const { address } = account(name);
      const balance = await publicClient.readContract({
        address: USDC,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address],
      });
      wallets.push({
        label,
        address,
        usdc: formatUnits(balance, 6),
        explorerUrl: `${EXPLORER}/address/${address}`,
      });
    }

    const deployments: Record<string, { address: string; txHash: string; block: number }> =
      JSON.parse(readFileSync("deployments/arc-testnet.json", "utf8"));
    const contracts = Object.entries(deployments).map(([name, d]) => ({
      name,
      address: d.address,
      block: d.block,
      explorerUrl: `${EXPLORER}/address/${d.address}`,
      txUrl: `${EXPLORER}/tx/${d.txHash}`,
    }));

    const message = await publicClient.readContract({
      address: addressOf("Hello"),
      abi: loadArtifact("Hello").abi,
      functionName: "message",
    });

    res.json({
      chainId,
      block: Number(block),
      wallets,
      contracts,
      hello: { message },
      explorer: EXPLORER,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/api/ping", async (req, res) => {
  try {
    const text = String(req.body?.text ?? "");
    const address = addressOf("Hello");
    const { abi } = loadArtifact("Hello");

    const { txHash, receipt } = await asDeployer(async () => {
      const txHash = await walletClient("DEPLOYER_KEY").writeContract({ address, abi, functionName: "ping", args: [text] });
      return { txHash, receipt: await publicClient.waitForTransactionReceipt({ hash: txHash }) };
    });
    const message = await publicClient.readContract({ address, abi, functionName: "message" });

    res.json({
      txHash,
      txUrl: `${EXPLORER}/tx/${txHash}`,
      message,
      block: Number(receipt.blockNumber),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// --- Markets (unit 2.1): live Gemini prediction markets. Fetched on request only, never on a timer.

app.get("/api/markets/categories", async (_req, res) => {
  try {
    const { apiUrl, categories } = await cached("categories", 3600000, getCategories);
    res.json({ categories, apiUrl });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.get("/api/markets", async (req, res) => {
  try {
    const { apiUrl, events, pagination } = await getEvents({
      status: "active",
      category: req.query.category ? String(req.query.category) : undefined,
      limit: 50,
      offset: Number(req.query.offset || 0),
    });

    // The symbols we picked for the demo, once config/markets.json exists.
    let chosen: string[] = [];
    try {
      const config = JSON.parse(readFileSync("config/markets.json", "utf8"));
      chosen = config.markets.map((m: { symbol: string }) => m.symbol);
      for (const r of Object.values(config.replays ?? {}) as { source: string }[]) chosen.push(r.source);
    } catch {}

    res.json({
      apiUrl,
      fetchedAt: new Date().toISOString(),
      total: pagination.total,
      offset: pagination.offset,
      chosen,
      events: events.map((e) => ({
        ticker: e.ticker,
        title: e.title,
        expiry: e.expiryDate,
        volume: e.volume,
        contracts: e.contracts.map((c) => {
          const { prob, method } = probability(c);
          return {
            symbol: c.instrumentSymbol,
            label: c.label,
            yesBid: c.prices?.bestBid ?? null,
            yesAsk: c.prices?.bestAsk ?? null,
            last: c.prices?.lastTradePrice ?? null,
            volume: e.volume, // Gemini reports volume per event, not per contract
            prob,
            method,
          };
        }),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.get("/api/markets/inspect", async (req, res) => {
  try {
    const symbol = String(req.query.symbol);
    const { apiUrl, event } = await getEvent(String(req.query.event));
    const rawContract = event.contracts.find((c) => c.instrumentSymbol === symbol);
    if (!rawContract) throw new Error(`${symbol} is not a contract of event ${event.ticker}`);

    // What history exists for this contract: daily candles, summarized.
    let history;
    try {
      const { apiUrl: historyUrl, candles } = await getCandles(symbol, "1day");
      const oldest = candles[candles.length - 1];
      const newest = candles[0];
      history = {
        apiUrl: historyUrl,
        timeFrame: "1day",
        candles: candles.length,
        from: oldest ? new Date(oldest[0]).toISOString() : null,
        to: newest ? new Date(newest[0]).toISOString() : null,
        firstClose: oldest ? oldest[4] : null,
        lastClose: newest ? newest[4] : null,
        low: candles.length ? Math.min(...candles.map((c) => c[3])) : null,
        high: candles.length ? Math.max(...candles.map((c) => c[2])) : null,
      };
    } catch (err) {
      history = { error: err instanceof Error ? err.message : String(err) };
    }

    res.json({
      apiUrl,
      rawContract,
      used: {
        "prices.bestBid": rawContract.prices?.bestBid ?? null,
        "prices.bestAsk": rawContract.prices?.bestAsk ?? null,
        "prices.lastTradePrice": rawContract.prices?.lastTradePrice ?? null,
      },
      result: probability(rawContract),
      history,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// --- Oracle (unit 2.3): Gemini now next to the onchain feed, and the feed's history.

type FeedEvent = {
  symbol: string;
  time: string;
  block: number;
  probBps: number;
  prevProbBps: number;
  round: number;
  txHash: string;
  txUrl: string;
};

// Every OddsUpdated event since the feed was deployed. The public RPC allows at most
// 10,000 blocks per getLogs call, so we read in chunks and remember where we stopped:
// the first request after a start scans from the deploy block, later ones only new blocks.
const feedEvents: FeedEvent[] = [];
let scannedTo: bigint | null = null;
let scanQueue: Promise<void> = Promise.resolve();

function scanFeed() {
  scanQueue = scanQueue.catch(() => {}).then(async () => {
    const deployments = JSON.parse(readFileSync("deployments/arc-testnet.json", "utf8"));
    // Both feeds: the first one (v1, open to any sender) holds the posts made before unit 10.1.
    const first = deployments.OddsFeedV1 ?? deployments.OddsFeed;
    const address = [first.address, deployments.OddsFeed.address];
    const { abi } = loadArtifact("OddsFeed");
    const latest = await publicClient.getBlockNumber();

    let from = scannedTo === null ? BigInt(first.block) : scannedTo + 1n;
    while (from <= latest) {
      const to = from + 9999n < latest ? from + 9999n : latest;
      const logs = await publicClient.getContractEvents({
        address,
        abi,
        eventName: "OddsUpdated",
        fromBlock: from,
        toBlock: to,
      });
      for (const log of logs) {
        const a = (log as unknown as { args: Record<string, any> }).args;
        feedEvents.push({
          symbol: a.symbol,
          time: new Date(Number(a.observedAt) * 1000).toISOString(),
          block: Number(log.blockNumber),
          probBps: Number(a.probBps),
          prevProbBps: Number(a.prevProbBps),
          round: Number(a.round),
          txHash: log.transactionHash,
          txUrl: `${EXPLORER}/tx/${log.transactionHash}`,
        });
      }
      scannedTo = to;
      from = to + 1n;
    }
  });
  return scanQueue;
}

async function oracleView() {
  {
    const config = JSON.parse(readFileSync("config/markets.json", "utf8"));
    const address = addressOf("OddsFeed");
    const { abi } = loadArtifact("OddsFeed");
    await scanFeed();

    let logLines: { symbol: string }[] = [];
    try {
      logLines = readFileSync("logs/oracle.jsonl", "utf8").trim().split("\n").map((l) => JSON.parse(l));
    } catch {}

    const markets = [];
    // One Gemini call per event: several of our markets are contracts of the same event.
    const eventsRead = new Map<string, Awaited<ReturnType<typeof getEvent>>>();
    for (const m of config.markets as ConfigMarket[]) {
      if (!eventsRead.has(m.eventTicker)) eventsRead.set(m.eventTicker, await getEvent(m.eventTicker));
      const { apiUrl, event } = eventsRead.get(m.eventTicker)!;
      const contract = event.contracts.find((c) => c.instrumentSymbol === m.symbol);
      const odds = probability(contract ?? {});

      const o = (await publicClient.readContract({
        address,
        abi,
        functionName: "latestBySymbol",
        args: [m.symbol],
      })) as { probBps: number; round: number; observedAt: bigint; publishedAt: bigint; sourceHash: string };

      const lastEvent = feedEvents.filter((e) => e.symbol === m.symbol).at(-1);

      markets.push({
        symbol: m.symbol,
        label: m.label,
        risk: riskOf(m), // the event a page names the chance by
        featured: !!m.featured, // the Overview shows these two
        harmfulOutcome: m.harmfulOutcome,
        gemini: {
          prob: odds.prob,
          method: odds.method,
          bid: contract?.prices?.bestBid ?? null,
          ask: contract?.prices?.bestAsk ?? null,
          last: contract?.prices?.lastTradePrice ?? null,
          fetchedAt: new Date().toISOString(),
          apiUrl,
        },
        onchain: {
          probBps: o.probBps,
          round: o.round,
          observedAt: Number(o.observedAt),
          publishedAt: Number(o.publishedAt),
          sourceHash: o.sourceHash,
          prevProbBps: lastEvent?.prevProbBps ?? null,
          txUrl: lastEvent?.txUrl ?? null,
        },
        gapPts: odds.prob === null || o.round === 0 ? null : odds.prob * 100 - o.probBps / 100,
        last: logLines.filter((l) => l.symbol === m.symbol).at(-1) ?? null,
      });
    }
    return { markets, feed: address, explorer: EXPLORER };
  }
}
// Read once at boot (again every 5 s until it works), so the first visitor neither waits for the
// nine chain reads nor meets an RPC error.
const warmOracle = (): unknown => cached("oracle", 30000, oracleView).catch(() => setTimeout(warmOracle, 5000));
warmOracle();
app.get("/api/oracle", async (_req, res) => {
  try {
    const view = await cached("oracle", 30000, oracleView);
    res.json({ ...view, markets: view.markets.map((m) => ({ ...m, stale: staleOf(m.symbol) })) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.get("/api/oracle/history", async (req, res) => {
  try {
    const symbol = String(req.query.symbol);
    await scanFeed();
    const onchain = feedEvents
      .filter((e) => e.symbol === symbol)
      .map(({ time, block, probBps, prevProbBps, round, txHash, txUrl }) => ({ time, block, probBps, prevProbBps, round, txHash, txUrl }));

    const { apiUrl, candles } = await getCandles(symbol, "1hr");
    const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
    const gemini = candles
      .filter((c) => c[0] >= weekAgo)
      .map((c) => ({ time: new Date(c[0]).toISOString(), prob: c[4] }))
      .reverse(); // oldest first

    res.json({ symbol, onchain, gemini, geminiApiUrl: apiUrl });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// The oracle value over the last 7 days (units 7.7, 7.11): Gemini's hourly closes for one of
// our markets, each converted to the chance of its bad outcome. Oldest first. Hourly data, so
// it is cached for 10 minutes.
async function historyView(m: ConfigMarket) {
  const { candles } = await getCandles(m.symbol, "1hr");
  const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
  const points = candles
    .filter((c) => c[0] >= weekAgo)
    .map((c) => ({ time: new Date(c[0]).toISOString(), chanceBps: Math.round((m.harmfulOutcome === "YES" ? c[4] : 1 - c[4]) * 10000) }))
    .reverse();
  return { symbol: m.symbol, risk: riskOf(m), points };
}
app.get("/api/history", async (req, res) => {
  try {
    const m = configMarkets().find((x) => x.symbol === req.query.symbol);
    if (!m) return void res.status(404).json({ error: `${req.query.symbol} is not in config/markets.json` });
    res.json(await cached("history:" + m.symbol, 600000, () => historyView(m)));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// The pools' longer history (unit 9.2). Gemini lists one monthly BTC market at a time, and no
// earlier one exists in 2026 (before Oct 31 its month-end markets were listed on their last
// day), so this is one month, not a year: of the month's "$X or above" contracts, the one whose
// first daily close was nearest 50%, then all its hourly closes as the chance BTC ends below X.
async function monthView(m: ConfigMarket) {
  const { event } = await getEvent(m.eventTicker);
  const strikes: { symbol: string; label: string; firstAt: number; firstClose: number }[] = [];
  for (const c of event.contracts) {
    if (!/ or above$/.test(c.label)) continue;
    const first = (await getCandles(c.instrumentSymbol, "1day").catch(() => ({ candles: [] as GeminiCandle[] }))).candles.at(-1);
    if (first) strikes.push({ symbol: c.instrumentSymbol, label: c.label, firstAt: first[0], firstClose: first[4] });
  }
  if (!strikes.length) throw new Error(`Gemini has no candles for ${m.eventTicker}`);
  // Only contracts that traded in the market's first two days count as "there at the listing".
  const listedAt = Math.min(...strikes.map((s) => s.firstAt));
  const pick = strikes.filter((s) => s.firstAt <= listedAt + 2 * 864e5).sort((a, b) => Math.abs(a.firstClose - 0.5) - Math.abs(b.firstClose - 0.5))[0];
  const { candles } = await getCandles(pick.symbol, "1hr");
  const points = candles.map((c) => ({ time: new Date(c[0]).toISOString(), chanceBps: chanceOfBad(toBps(c[4]), "NO") })).reverse();
  return { symbol: pick.symbol, risk: badOutcomeOf(event.title, pick.label)?.risk ?? pick.label, firstYes: pick.firstClose, strikes: strikes.length, points };
}
app.get("/api/pools/history", async (req, res) => {
  try {
    const m = configMarkets().find((x) => x.symbol === req.query.symbol);
    if (!m) return void res.status(404).json({ error: `${req.query.symbol} is not in config/markets.json` });
    res.json(await cached("month:" + m.eventTicker, 3600000, () => monthView(m)));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/api/oracle/publish", async (_req, res) => {
  try {
    res.json({ results: await publishOnce() });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// --- Paid reads (unit 3.1): x402 with Circle Gateway Nanopayments on Arc testnet.
// /odds is the product endpoint, so it sits outside /api (the Lab's internal routes).

const PRICE = "$0.001";
const ARC_TESTNET = "eip155:5042002";
const seller = account("DEPLOYER_KEY").address;
const gateway = createGatewayMiddleware({
  sellerAddress: seller,
  facilitatorUrl: "https://gateway-api-testnet.circle.com",
  networks: ARC_TESTNET,
});

type ConfigMarket = { symbol: string; eventTicker: string; label: string; harmfulOutcome: string; risk?: string; featured?: boolean };
// The bad outcome in words, from the config.
function riskOf(m: ConfigMarket) {
  return m.risk ?? m.label;
}
// The demo replays (config/markets.json "replays") publish under their own symbols, so real
// odds are never overwritten.
type DemoKind = "agent" | "protocol";
type ReplayConfig = { symbol: string; source: string; risk: string; from: string; to: string; pool: string };
const replays = (): Record<DemoKind, ReplayConfig> => JSON.parse(readFileSync("config/markets.json", "utf8")).replays;
const isReplaySymbol = (symbol: string) => Object.values(replays()).some((r) => r.symbol === symbol);
async function replayRead(symbol: string) {
  const o = (await publicClient.readContract({ address: addressOf("OddsFeed"), abi: loadArtifact("OddsFeed").abi, functionName: "latestBySymbol", args: [symbol] })) as { probBps: number; round: number; sourceHash: string };
  return { ts: new Date().toISOString(), probBps: o.probBps, prevProbBps: o.probBps, method: "replay", sourceHash: o.sourceHash, round: o.round, txHash: null };
}
const configMarkets = (): ConfigMarket[] => JSON.parse(readFileSync("config/markets.json", "utf8")).markets;

app.get(
  "/odds/:symbol",
  // An unknown symbol is a 404 before any payment is asked for.
  (req, res, next) => {
    if (isReplaySymbol(req.params.symbol) || configMarkets().some((m) => m.symbol === req.params.symbol) || feed?.markets.some((m) => m.symbol === req.params.symbol)) return next();
    res.status(404).json({ error: `unknown symbol ${req.params.symbol}` });
  },
  gateway.require(PRICE),
  async (req, res) => {
    try {
      const symbol = String(req.params.symbol);
      // The paid read refreshes the feed (unit 5.1): fetch live from Gemini, and publish to
      // OddsFeed if the value differs from the onchain one. txHash is null when it doesn't.
      // A replay symbol has no live source: its paid read returns the value the demo replay
      // last published (REPLAY).
      // Any other market of the live feed (unit 8.0d) answers with the feed's own value, read
      // from Gemini within the last minute, and the round of its last post.
      const config = configMarkets().find((m) => m.symbol === symbol), live = feed?.markets.find((m) => m.symbol === symbol);
      const r = isReplaySymbol(symbol)
        ? await replayRead(symbol)
        : config && req.query.source !== "feed" // the desk asks for the feed's value: no wait behind Gemini's one call a second
          ? await refreshMarket(config, true)
          : { ts: feed!.readAt, probBps: live!.yesBps, prevProbBps: lastPost.get(symbol)?.yesBps ?? 0, method: "feed", sourceHash: live!.sourceHash, round: lastPost.get(symbol)?.round ?? 0, txHash: null, thin: live!.thin };
      const body = {
        symbol,
        probBps: r.probBps,
        prevProbBps: r.prevProbBps,
        method: r.method,
        observedAt: r.ts,
        sourceHash: r.sourceHash,
        round: r.round,
        txHash: r.txHash,
        thin: "thin" in r ? r.thin : null, // why the oracle would not post this value (unit 10.2)
      };

      // The middleware has verified and settled the payment with Gateway by now.
      const payment = (req as unknown as { payment?: { payer: string; amount: string; network: string; transaction?: string } }).payment;
      mkdirSync("logs", { recursive: true });
      appendFileSync("logs/payments.jsonl", JSON.stringify({
        ts: body.observedAt,
        symbol,
        amount: payment ? formatUnits(BigInt(payment.amount), 6) : null,
        payer: payment?.payer ?? null,
        network: payment?.network ?? null,
        transaction: payment?.transaction ?? null, // Gateway's transfer id, not an onchain tx hash
        probBps: body.probBps,
        round: body.round,
        txHash: body.txHash, // the publish this read caused, if the value had changed
        run: req.query.run ? String(req.query.run) : null, // the agent run that paid, if any
      }) + "\n");

      res.json(body);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  },
);

// The buyer: the agent's key paying through Circle's Gateway client.
function agentGateway() {
  return new GatewayClient({
    chain: "arcTestnet",
    privateKey: process.env.AGENT_KEY as `0x${string}`,
    rpcUrl: process.env.ARC_RPC_URL,
  });
}

app.get("/api/payments", async (_req, res) => {
  try {
    const client = agentGateway();
    const agent = await client.getBalances();
    const sellerGateway = await client.getBalance(seller);

    let reads: { transaction?: string; settlement?: unknown }[] = [];
    try {
      reads = readFileSync("logs/payments.jsonl", "utf8").trim().split("\n").map((l) => JSON.parse(l)).reverse().slice(0, 50);
    } catch {}
    // Ask Gateway where the 5 newest payments are on their way to onchain settlement.
    for (const read of reads.slice(0, 5)) {
      if (!read.transaction) continue;
      try {
        const t = (await client.getTransferById(read.transaction)) as { status: string; txHash?: string | null };
        read.settlement = { status: t.status, txUrl: t.txHash ? `${EXPLORER}/tx/${t.txHash}` : null };
      } catch {}
    }

    res.json({
      price: PRICE,
      network: ARC_TESTNET,
      agent: {
        address: client.address,
        walletUsdc: agent.wallet.formatted,
        gatewayUsdc: agent.gateway.formattedAvailable,
      },
      seller: {
        address: seller,
        gatewayUsdc: sellerGateway.formattedAvailable,
        gatewayTotalUsdc: sellerGateway.formattedTotal,
      },
      symbols: configMarkets().map((m) => ({ symbol: m.symbol, label: m.label })),
      reads,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/api/pay-read", async (req, res) => {
  try {
    const client = agentGateway();
    const before = await client.getBalances();
    const result = await client.pay(`http://127.0.0.1:${PORT}/odds/${encodeURIComponent(String(req.body?.symbol))}`);
    const after = await client.getBalances();
    res.json({
      status: result.status,
      data: result.data,
      amount: result.formattedAmount,
      transaction: result.transaction,
      gatewayBefore: before.gateway.formattedAvailable,
      gatewayAfter: after.gateway.formattedAvailable,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// --- Agent (units 4.1 and 4.2): the holding, the decision for each threat, and what it has bought.

// The agent's runs from the last 300 lines of logs/agent.jsonl, newest first: what triggered each, and its steps.
function agentRuns() {
  let lines: Step[] = [];
  try {
    lines = readFileSync("logs/agent.jsonl", "utf8").trim().split("\n").slice(-300).map((l) => JSON.parse(l));
  } catch {}
  const runs = new Map<string, Step[]>();
  for (const line of lines) {
    if (!line.run) continue; // lines from before unit 5.1 carry no run
    runs.set(line.run, [...(runs.get(line.run) ?? []), line]);
  }
  return [...runs.entries()].reverse().map(([run, steps]) => ({
    run,
    demo: steps.some((s) => s.demo), // a run of the demo replay (REPLAY), on the replay symbol
    trigger: steps.find((s) => s.trigger)?.trigger ?? null,
    skipped: steps[0].step === "skipped",
    steps: steps.map((s) => (s.txHash ? { ...s, txUrl: `${EXPLORER}/tx/${s.txHash}` } : s)),
  }));
}

app.get("/api/agent", async (_req, res) => {
  try {
    const { address } = account("AGENT_KEY");
    const balance = await cached("agent-usdc", 15000, () => publicClient.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [address] }));
    res.json({
      ...(await agentView()),
      runs: agentRuns().slice(0, 5),
      // The newest run on the real threats: replay runs are left out.
      lastLive: agentRuns().find((r) => !r.demo && !r.skipped) ?? null,
      readPrice: PRICE,
      wallet: { address, usdc: formatUnits(balance, 6), explorerUrl: `${EXPLORER}/address/${address}` },
      fills: paperFills().reverse().map((f) => ({ ...f, txUrl: `${EXPLORER}/tx/${f.txHash}` })),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// One agent cycle. Spends the agent's testnet USDC when a threat needs cover.
app.post("/api/agent/run", async (_req, res) => {
  try {
    const steps = await runOnce("button");
    res.json({ steps: steps.map((s) => (s.txHash ? { ...s, txUrl: `${EXPLORER}/tx/${s.txHash}` } : s)) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// The what-if slider: decide() on whatever inputs the page sends. No chain, no Gemini.
app.post("/api/agent/whatif", (req, res) => {
  res.json(decide(req.body));
});

// --- DeFi (Phase 6): the RiskSwitch and the DEMO lending pool that opted into it.

// Deployment keys of the pools the keeper syncs. TestLendingPool exists only for tests on
// test:demo; ReplayLendingPool and ReplayEthPool watch the two demo replays' symbols.
const POOL_NAMES = ["DemoLendingPool", "TestLendingPool", "ReplayLendingPool", "ReplayEthPool"];
const deployed = (): Record<string, { address: `0x${string}`; block: number }> => JSON.parse(readFileSync("deployments/arc-testnet.json", "utf8"));
const pools = () => POOL_NAMES.filter((name) => deployed()[name]).map((name) => ({ name, address: deployed()[name].address, test: name !== "DemoLendingPool", tag: name === "TestLendingPool" ? "TEST" : name.startsWith("Replay") ? "REPLAY" : null }));

// What a pool opted in with. It never changes for our pools, so it is read once.
const poolConfigs = new Map<string, { symbol: string; harmfulSide: "YES" | "NO" }>();
async function poolConfig(pool: `0x${string}`) {
  if (!poolConfigs.has(pool)) {
    const c = (await publicClient.readContract({ address: addressOf("RiskSwitch"), abi: loadArtifact("RiskSwitch").abi, functionName: "configs", args: [pool] })) as [string, number];
    poolConfigs.set(pool, { symbol: c[0], harmfulSide: c[1] === 0 ? "YES" : "NO" });
  }
  return poolConfigs.get(pool)!;
}

async function poolParams(pool: `0x${string}`) {
  const [level, maxLtvBps, paused, harmBps, syncedAt] = (await publicClient.readContract({
    address: addressOf("RiskSwitch"),
    abi: loadArtifact("RiskSwitch").abi,
    functionName: "paramsOf",
    args: [pool],
  })) as [number, number, boolean, number, bigint];
  return { level, maxLtvBps, paused, harmBps, syncedAt: Number(syncedAt) };
}

type SyncLine = {
  ts: string;
  pool: string;
  trigger: string; // "button", or "stream: oddsUpdated <symbol> <prev>% → <now>% YES"
  note?: string; // "skipped, sync in progress" or an error
  txHash?: string;
  levelBefore?: number;
  levelAfter?: number;
  harmBps?: number;
  maxLtvBps?: number; // the limit after the sync
  paused?: boolean;
};

// The keeper: calls RiskSwitch.sync(pool) as the deployer and records it in logs/defi.jsonl.
// One sync at a time: a second one is skipped and logged. asDeployer also keeps it from
// colliding with a publish on the deployer's nonce.
let syncing = false;
async function syncPool(pool: { name: string; address: `0x${string}` }, trigger: string): Promise<SyncLine> {
  const record = (rest: Partial<SyncLine>) => {
    const line: SyncLine = { ts: new Date().toISOString(), pool: pool.name, trigger, ...rest };
    mkdirSync("logs", { recursive: true });
    appendFileSync("logs/defi.jsonl", JSON.stringify(line) + "\n");
    console.log(`sync ${pool.name} (${trigger}): ${line.note ?? `level ${line.levelBefore} → ${line.levelAfter}`}`);
    return line;
  };
  if (syncing) return record({ note: "skipped, sync in progress" });
  syncing = true;
  try {
    const before = await poolParams(pool.address);
    const txHash = await asDeployer(async () => {
      const hash = await walletClient("DEPLOYER_KEY").writeContract({
        address: addressOf("RiskSwitch"),
        abi: loadArtifact("RiskSwitch").abi,
        functionName: "sync",
        args: [pool.address],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error(`sync reverted: ${hash}`);
      return hash;
    });
    const after = await poolParams(pool.address);
    return record({ txHash, levelBefore: before.level, levelAfter: after.level, harmBps: after.harmBps, maxLtvBps: after.maxLtvBps, paused: after.paused });
  } catch (err) {
    return record({ note: "failed: " + (err instanceof Error ? err.message : String(err)).split("\n")[0] });
  } finally {
    syncing = false;
  }
}

const syncLines = (): SyncLine[] => {
  try {
    return readFileSync("logs/defi.jsonl", "utf8").trim().split("\n").map((l) => JSON.parse(l));
  } catch {
    return [];
  }
};

// Every RiskLevelChanged since the RiskSwitch was deployed, read in 10,000-block chunks like the feed.
type LevelChange = { protocol: string; symbol: string; oldLevel: number; newLevel: number; harmBps: number; block: number; time: string; txHash: string };
const levelChanges: LevelChange[] = [];
let riskScannedTo: bigint | null = null;
let riskScanQueue: Promise<void> = Promise.resolve();

function scanRisk() {
  riskScanQueue = riskScanQueue.catch(() => {}).then(async () => {
    const latest = await publicClient.getBlockNumber();
    let from = riskScannedTo === null ? BigInt(deployed().RiskSwitch.block) : riskScannedTo + 1n;
    while (from <= latest) {
      const to = from + 9999n < latest ? from + 9999n : latest;
      const logs = await publicClient.getContractEvents({
        address: addressOf("RiskSwitch"),
        abi: loadArtifact("RiskSwitch").abi,
        eventName: "RiskLevelChanged",
        fromBlock: from,
        toBlock: to,
      });
      for (const log of logs) {
        const a = (log as unknown as { args: Record<string, any> }).args;
        const block = await publicClient.getBlock({ blockNumber: log.blockNumber });
        levelChanges.push({
          protocol: a.protocol,
          symbol: a.symbol,
          oldLevel: Number(a.oldLevel),
          newLevel: Number(a.newLevel),
          harmBps: Number(a.harmBps),
          block: Number(log.blockNumber),
          time: new Date(Number(block.timestamp) * 1000).toISOString(),
          txHash: log.transactionHash,
        });
      }
      riskScannedTo = to;
      from = to + 1n;
    }
  });
  return riskScanQueue;
}

// A pool's tiers never change for our pools either, so they are read once too.
type Tier = { thresholdBps: number; maxLtvBps: number; paused: boolean };
const poolTiers = new Map<string, Tier[]>();
async function tiersOf(pool: `0x${string}`) {
  if (!poolTiers.has(pool)) {
    poolTiers.set(pool, (await publicClient.readContract({ address: addressOf("RiskSwitch"), abi: loadArtifact("RiskSwitch").abi, functionName: "tiersOf", args: [pool] })) as Tier[]);
  }
  return poolTiers.get(pool)!;
}

// The harm probability the feed holds right now, which can be newer than the pool's last sync.
async function liveHarm(symbol: string, harmfulSide: "YES" | "NO") {
  const o = (await publicClient.readContract({ address: addressOf("OddsFeed"), abi: loadArtifact("OddsFeed").abi, functionName: "latestBySymbol", args: [symbol] })) as { probBps: number; round: number };
  return { yesBps: o.probBps, round: o.round, harmBps: harmfulSide === "YES" ? o.probBps : 10000 - o.probBps };
}

app.get("/api/defi", async (req, res) => {
  try {
    // ?pool=ReplayLendingPool shows another pool; the default is the DEMO pool.
    const pool = pools().find((p) => p.name === req.query.pool) ?? pools()[0];
    const { symbol, harmfulSide } = await poolConfig(pool.address);
    await scanRisk();
    const lines = syncLines();
    const names = Object.fromEntries(pools().map((p) => [p.address.toLowerCase(), p]));
    res.json({
      label: "DEMO",
      pool: { name: pool.name, address: pool.address, explorerUrl: `${EXPLORER}/address/${pool.address}` },
      riskSwitch: { address: addressOf("RiskSwitch"), explorerUrl: `${EXPLORER}/address/${addressOf("RiskSwitch")}` },
      symbol,
      harmfulSide,
      params: await poolParams(pool.address),
      tiers: await tiersOf(pool.address),
      feed: await liveHarm(symbol, harmfulSide),
      syncs: lines.slice(-8).reverse().map((l) => (l.txHash ? { ...l, txUrl: `${EXPLORER}/tx/${l.txHash}` } : l)),
      history: [...levelChanges].reverse().slice(0, 20).map((c) => ({
        ...c,
        pool: names[c.protocol.toLowerCase()]?.name ?? c.protocol,
        test: names[c.protocol.toLowerCase()]?.test ?? true,
        tag: names[c.protocol.toLowerCase()]?.tag ?? "TEST",
        trigger: lines.find((l) => l.txHash === c.txHash)?.trigger ?? "a sync outside the Lab",
        txUrl: `${EXPLORER}/tx/${c.txHash}`,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/api/defi/sync", async (_req, res) => {
  const line = await syncPool(pools()[0], "button");
  res.json(line.txHash ? { ...line, txUrl: `${EXPLORER}/tx/${line.txHash}` } : line);
});

// "Can I borrow $X against $Y?" A free view call to the pool's canBorrow.
app.post("/api/defi/check", async (req, res) => {
  try {
    const [ok, maxLoanUsd, reason] = (await publicClient.readContract({
      address: pools()[0].address,
      abi: loadArtifact("DemoLendingPool").abi,
      functionName: "canBorrow",
      args: [BigInt(Math.round(Number(req.body?.collateralUsd))), BigInt(Math.round(Number(req.body?.loanUsd)))],
    })) as [boolean, bigint, string];
    res.json({ ok, maxLoanUsd: Number(maxLoanUsd), reason });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// --- Live advisor (unit 6.4). LIVE ADVISOR: read-only. Changes to this protocol require its
// governance or approved risk stewards. We only read Aave V4 on Arc mainnet; nothing is sent there.
// Addresses are from Aave's official address book (aave-dao/aave-address-book, src/AaveV4Arc.sol);
// every risk value is read live from the chain on each request.

const ADVISOR_LABEL = "LIVE ADVISOR: read-only. Changes to this protocol require its governance or approved risk stewards.";
const ARC_MAINNET_EXPLORER = "https://explorer.arc.io";
const AAVE = {
  mainSpoke: "0xB843bdC3a87A05E77E07Df9FE48928b3A34b134d",
  cirBTC: "0x171A4217b86A807A64eB94757Db6849fb4bDbAA0",
  addressBookUrl: "https://github.com/aave-dao/aave-address-book/blob/main/src/AaveV4Arc.sol",
} as const;
const arcMainnet = createPublicClient({ transport: http("https://rpc.mainnet.arc.io") });
const spokeAbi = parseAbi([
  "struct Reserve { address underlying; address hub; uint16 assetId; uint8 decimals; uint24 collateralRisk; uint8 flags; uint32 dynamicConfigKey; }",
  "struct ReserveConfig { uint24 collateralRisk; bool paused; bool frozen; bool borrowable; bool receiveSharesEnabled; }",
  "struct DynamicReserveConfig { uint16 collateralFactor; uint32 maxLiquidationBonus; uint16 liquidationFee; }",
  "function getReserveCount() view returns (uint256)",
  "function getReserve(uint256 reserveId) view returns (Reserve)",
  "function getReserveConfig(uint256 reserveId) view returns (ReserveConfig)",
  "function getDynamicReserveConfig(uint256 reserveId, uint32 dynamicConfigKey) view returns (DynamicReserveConfig)",
  "function getReserveSuppliedAssets(uint256 reserveId) view returns (uint256)",
  "function getReserveTotalDebt(uint256 reserveId) view returns (uint256)",
]);
const hubAbi = parseAbi([
  "struct SpokeConfig { uint40 addCap; uint40 drawCap; uint24 riskPremiumThreshold; bool active; bool halted; }",
  "function getSpokeConfig(uint256 assetId, address spoke) view returns (SpokeConfig)",
  "function MAX_ALLOWED_SPOKE_CAP() view returns (uint40)",
]);

// The same tiers for a real protocol. Aave: level 1 = the limit 10 points lower, level 2 = 25
// points lower, level 3 = no new borrowing beyond today's level: the 25-point cut stays and the
// reserve's borrow cap is held at what is borrowed today. Open loans, repayments, deposits and
// withdrawals carry on. Morpho, whose limit cannot change, has its own steps in /api/pools.
const NO_NEW_RULE = "85%+: no new borrowing beyond today's level.";

async function advisorView() {
  {
    const token = AAVE.cirBTC;
    const spoke = { address: AAVE.mainSpoke, abi: spokeAbi } as const;
    if ((await arcMainnet.getChainId()) !== 5042) throw new Error("the RPC is not Arc mainnet (chain 5042)");

    // Find the reserve by its token address instead of trusting a reserve number.
    const count = Number(await arcMainnet.readContract({ ...spoke, functionName: "getReserveCount" }));
    let reserveId = -1n;
    let reserve;
    for (let i = 0n; i < BigInt(count); i++) {
      const r = await arcMainnet.readContract({ ...spoke, functionName: "getReserve", args: [i] });
      if (r.underlying.toLowerCase() === token.toLowerCase()) {
        reserveId = i;
        reserve = r;
      }
    }
    if (!reserve) throw new Error(`the Main Spoke lists no reserve for ${token}`);

    const config = await arcMainnet.readContract({ ...spoke, functionName: "getReserveConfig", args: [reserveId] });
    const dynamic = await arcMainnet.readContract({ ...spoke, functionName: "getDynamicReserveConfig", args: [reserveId, reserve.dynamicConfigKey] });
    const supplied = await arcMainnet.readContract({ ...spoke, functionName: "getReserveSuppliedAssets", args: [reserveId] });
    const debt = await arcMainnet.readContract({ ...spoke, functionName: "getReserveTotalDebt", args: [reserveId] });
    const hub = { address: reserve.hub, abi: hubAbi } as const;
    const caps = await arcMainnet.readContract({ ...hub, functionName: "getSpokeConfig", args: [BigInt(reserve.assetId), AAVE.mainSpoke] });
    const noCap = await arcMainnet.readContract({ ...hub, functionName: "MAX_ALLOWED_SPOKE_CAP" });
    const symbol = await arcMainnet.readContract({ address: token, abi: erc20Abi, functionName: "symbol" });

    const current = {
      collateralFactorBps: dynamic.collateralFactor,
      maxLiquidationBonusBps: dynamic.maxLiquidationBonus - 10000, // 100_00 means no bonus
      liquidationFeeBps: dynamic.liquidationFee,
      supplyCap: caps.addCap === noCap ? null : caps.addCap, // whole tokens; null = no cap
      borrowCap: caps.drawCap === noCap ? null : caps.drawCap,
      paused: config.paused,
      frozen: config.frozen,
      borrowable: config.borrowable,
      supplied: Number(formatUnits(supplied, reserve.decimals)),
      debt: Number(formatUnits(debt, reserve.decimals)),
    };

    // The harm probability our feed holds for the pool's market, placed on the pool's tiers.
    const pool = pools()[0];
    const { symbol: market, harmfulSide } = await poolConfig(pool.address);
    const harm = await liveHarm(market, harmfulSide);
    const tiers = await tiersOf(pool.address);
    const level = levelOf(tiers, harm.harmBps);

    const cuts = CUTS;
    const cutBps = cuts[level] ?? 0;
    const noNew = level >= 3;
    const heldCap = Math.ceil(current.debt); // whole tokens: the borrow cap held at what is borrowed today
    // The recommendation at every level, so a page can follow a pool's level without asking again.
    const ladder = tiers.map((_, i) => ({ collateralFactorBps: Math.max(0, current.collateralFactorBps - (cuts[i] ?? 0)), noNewBorrowing: i >= 3 }));
    const recommended = {
      ...ladder[level],
      supplyCap: current.supplyCap,
      borrowCap: noNew ? heldCap : current.borrowCap,
    };
    const pc = (bps: number) => (bps / 100).toFixed(2) + "%";
    const chance = `${harm.harmBps / 100}%`;
    const risk = Object.values(replays()).find((r) => r.symbol === market)?.risk ?? configMarkets().find((m) => m.symbol === market)?.risk ?? market;
    const reason =
      level === 0 ? `The chance that ${risk} is ${chance}, below 50%, so no change is recommended.`
      : noNew ? `The chance that ${risk} is ${chance}, at or above 85%, so the recommendation is no new borrowing beyond today's level: keep the collateral factor ${cutBps / 100} points lower and hold the ${symbol} borrow cap at what is borrowed today, until it falls. Open loans, repayments, deposits and withdrawals carry on.`
      : `The chance that ${risk} is ${chance}, at or above ${tiers[level].thresholdBps / 100}%, so the recommendation is to lower the ${symbol} collateral factor by ${cutBps / 100} points.`;

    const sourceUrl = `${ARC_MAINNET_EXPLORER}/address/${AAVE.mainSpoke}`;
    const readAt = new Date().toISOString();
    const cap = (n: number | null) => (n === null ? "none" : n.toLocaleString("en-US") + " " + symbol);
    const rowText = (name: string, a: string, b: string) => `${name.padEnd(20)}${a.padEnd(18)}${b}`;
    const proposal = [
      "Proposed risk parameter update (not submitted)",
      "",
      `Protocol:  Aave V4, Main Spoke, Arc mainnet (chain 5042)`,
      `Reserve:   ${symbol} (reserve ${reserveId}, ${token})`,
      "",
      rowText("Parameter", "Current", "Proposed"),
      rowText("Collateral factor", pc(current.collateralFactorBps), recommended.collateralFactorBps === current.collateralFactorBps ? "no change" : pc(recommended.collateralFactorBps)),
      rowText("Supply cap", cap(current.supplyCap), "no change"),
      rowText("Borrow cap", cap(current.borrowCap), noNew ? `${cap(heldCap)} (today's borrowing)` : "no change"),
      "",
      `Motivation: ${reason}`,
      `Signal: Gemini prediction market ${market}: the chance that ${risk} is ${chance} (OddsFeed round ${harm.round} on Arc testnet), risk level ${level} of ${tiers.length - 1}.`,
      `Current values read from ${sourceUrl} at ${readAt}.`,
      "",
      ADVISOR_LABEL,
    ].join("\n");

    return {
      label: ADVISOR_LABEL,
      protocol: "Aave V4",
      market: `Main Spoke, ${symbol} reserve`,
      chain: "Arc mainnet (chain 5042)",
      sourceUrl,
      addressBookUrl: AAVE.addressBookUrl,
      readAt,
      current,
      harm: { ...harm, symbol: market },
      level,
      recommended,
      ladder,
      tiers,
      risk,
      reason,
      proposal,
    };
  }
}
// Cached for 60 s and read again in the background, so a page never waits for Arc mainnet.
const advisorCached = () => cached("advisor", 60000, advisorView);
app.get("/api/advisor", async (_req, res) => {
  try {
    res.json(await advisorCached());
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
// The default advisor (cirBTC, the DEMO pool's market) is kept warm: read at the start and every 60 s.
advisorCached().catch(() => {});
setInterval(() => advisorCached().catch(() => {}), 60000);

// --- The live feed (unit 7.14): about 100 open Gemini contracts in crypto and economics, read
// every FEED_SECONDS. The nine markets of config/markets.json stay on the 5-minute loop
// (`npm run oracle`). The rest are posted from here: when a value has moved 0.5 points or more
// since its last post, and once an hour as a heartbeat. To keep the whole oracle under about
// 0.30 USDC an hour, this poster sends at most FEED_POSTS_PER_HOUR posts in any hour (moves
// first, then markets never posted, then the oldest heartbeats) and waits while a replay runs.

const FEED_CATEGORIES = ["Crypto", "Economics", "Economy", "Finance"];
const FEED_SECONDS = 60;
const FEED_SIZE = 100;
const FEED_PER_EVENT = 10; // of one event's contracts, the ones nearest 50%
const FEED_POSTS_PER_HOUR = 120; // about 0.13 USDC at the measured 0.0011 a post; the 5-minute loop spends about 0.11
const FEED_MOVE_BPS = 50;
// The hour's posts are spread evenly, two a minute. Without this the whole hour's budget went in
// one burst and nothing was posted for the next half hour, whatever moved (audit, unit 9.1).
const FEED_POSTS_PER_TICK = Math.ceil(FEED_POSTS_PER_HOUR / (3600 / FEED_SECONDS));

type FeedMarket = {
  symbol: string;
  eventTicker: string;
  buyYes: number | null; // what one contract of each side costs now
  buyNo: number | null;
  category: string;
  title: string; // the event: "BTC price on November 30"
  label: string; // the contract: "$67,500 or above"
  expiry: string;
  asset: string | null; // for "BTC price on November 30" markets: BTC
  bid: number;
  ask: number;
  yesBps: number; // the middle of bid and ask
  thin: string | null; // why this book is too thin to post (unit 10.2), or null
  bad: { side: "YES" | "NO"; risk: string } | null; // null: no clear bad outcome, so we post the chance of YES
  outputBps: number; // what a reader gets from us: the chance of the bad outcome, or of YES
  onLoop: boolean; // one of the nine markets `npm run oracle` posts every 5 minutes
  sourceHash: `0x${string}`;
};
// markets: the feed itself (about 100, the ones we post). more: every other open, quoted contract
// in the same order, for the page's "Load more" (never posted).
let feed: { readAt: string; markets: FeedMarket[]; more: FeedMarket[]; counts: { events: number; contracts: number; quoted: number; closingSoon: number } } | null = null;
// Lending results on the Oracle tab apply to price markets of these assets only: the ones a pool
// here takes as collateral (the BTC demo pool and Aave's cirBTC; the ETH replay pool and Aave's WETH).
const LENDING_ASSETS = ["BTC", "ETH"];
// The newest post of every symbol: from logs/oracle.jsonl at the start, then from each new line.
const lastPost = new Map<string, { yesBps: number; round: number; at: string; txUrl: string }>();
const feedPosts: number[] = []; // when the feed's posts of the last hour were made (kept across restarts by the log)
// Every post of every symbol, oldest first, for the charts' dots: read from the log once, then kept up by each new line.
const posts = new Map<string, { time: string; yesBps: number }[]>();
const notePost = (l: { symbol: string; probBps: number; publishedAt?: string; ts: string }) => void (posts.get(l.symbol) ?? posts.set(l.symbol, []).get(l.symbol)!).push({ time: l.publishedAt ?? l.ts, yesBps: l.probBps });
try {
  // A post made before today's feed was deployed went to the old feed (v1): this one has not seen it.
  const feedSince = Date.parse(JSON.parse(readFileSync("deployments/arc-testnet.json", "utf8")).OddsFeed.deployedAt);
  for (const text of readFileSync("logs/oracle.jsonl", "utf8").trim().split("\n")) {
    const l = JSON.parse(text);
    if (l.txHash) notePost(l);
    if (l.txHash && Date.parse(l.publishedAt ?? l.ts) >= feedSince) lastPost.set(l.symbol, { yesBps: l.probBps, round: l.round, at: l.publishedAt ?? l.ts, txUrl: `${EXPLORER}/tx/${l.txHash}` });
    if (l.method === "feed" && Date.parse(l.publishedAt) > Date.now() - 3600000) feedPosts.push(Date.parse(l.publishedAt));
  }
} catch {}

// Is one outcome clearly bad for someone who holds the asset or borrows money? Only a few plain
// patterns count; everything else is shown as the chance of YES.
function badOutcome(e: { title: string }, label: string, config?: ConfigMarket): FeedMarket["bad"] {
  if (config) return { side: config.harmfulOutcome as "YES" | "NO", risk: riskOf(config) };
  return badOutcomeOf(e.title, label);
}

async function readFeed() {
  const events = new Map<string, GeminiEvent>();
  for (const category of FEED_CATEGORIES) {
    for (let offset = 0; ; offset += 50) {
      const page = await getEvents({ status: "active", category, limit: 50, offset });
      for (const e of page.events) events.set(e.ticker, e);
      if (offset + 50 >= page.pagination.total) break;
    }
  }
  const config = configMarkets();
  const tomorrow = Date.now() + 24 * 3600 * 1000; // the 5-minute and same-day markets are left out
  const markets: FeedMarket[] = [];
  const row = (e: GeminiEvent, c: GeminiContract): FeedMarket => {
    const bid = Number(c.prices!.bestBid), ask = Number(c.prices!.bestAsk), yesBps = toBps((bid + ask) / 2);
    const bad = badOutcome(e, c.label, config.find((m) => m.symbol === c.instrumentSymbol));
    return {
      symbol: c.instrumentSymbol, eventTicker: e.ticker, buyYes: c.prices!.buy?.yes ? Number(c.prices!.buy.yes) : null, buyNo: c.prices!.buy?.no ? Number(c.prices!.buy.no) : null, category: e.category, title: e.title, label: c.label, expiry: e.expiryDate, asset: e.title.match(/^(\w+) price on /)?.[1] ?? null, bid, ask, yesBps, thin: thin(c), bad,
      outputBps: bad ? chanceOfBad(yesBps, bad.side) : yesBps,
      onLoop: config.some((m) => m.symbol === c.instrumentSymbol),
      sourceHash: keccak256(stringToHex(JSON.stringify(c))),
    };
  };
  const twoSided = (c: GeminiContract) => !!c.prices?.bestBid && !!c.prices?.bestAsk;
  // The busiest events first; of each, the contracts nearest 50% (and always our nine). Whatever
  // does not fit the feed goes to `more`, in the same order.
  const more: FeedMarket[] = [];
  let quoted = 0, closingSoon = 0;
  for (const e of [...events.values()].sort((a, b) => Number(b.volume) - Number(a.volume))) {
    quoted += e.contracts.filter(twoSided).length;
    const soon = Date.parse(e.expiryDate) < tomorrow;
    if (soon) closingSoon += e.contracts.filter(twoSided).length;
    const ours = e.contracts.filter((c) => twoSided(c) && config.some((m) => m.symbol === c.instrumentSymbol));
    const others = soon ? [] : e.contracts
      .filter((c) => twoSided(c) && !ours.includes(c))
      .sort((a, b) => Math.abs(Number(a.prices!.bestBid) + Number(a.prices!.bestAsk) - 1) - Math.abs(Number(b.prices!.bestBid) + Number(b.prices!.bestAsk) - 1));
    const top = others.slice(0, Math.max(0, FEED_PER_EVENT - ours.length));
    for (const c of [...ours, ...top]) (markets.length < FEED_SIZE || ours.includes(c) ? markets : more).push(row(e, c));
    for (const c of others.slice(top.length)) more.push(row(e, c));
  }
  feed = { readAt: new Date().toISOString(), markets, more, counts: { events: events.size, contracts: [...events.values()].reduce((n, e) => n + e.contracts.length, 0), quoted, closingSoon } };
}

// Stale (unit 10.2): the posted value is more than 15 minutes old and Gemini's middle has since
// moved the posting distance away from it (or left the feed), so it is a value waiting for a post
// it has not had: a thin book, the hourly budget, a stopped loop. Or Gemini itself has not been
// read for 15 minutes. A value that is old but still equal to Gemini's is a heartbeat away, not stale.
const STALE_MS = 15 * 60 * 1000;
function staleOf(symbol: string) {
  if (!feed) return false;
  if (Date.now() - Date.parse(feed.readAt) > STALE_MS) return true;
  const last = lastPost.get(symbol), live = feed.markets.find((m) => m.symbol === symbol);
  if (!last || Date.now() - Date.parse(last.at) <= STALE_MS) return false;
  return !live || Math.abs(live.yesBps - last.yesBps) >= FEED_MOVE_BPS;
}

// --- Unit 10b.8: a market's last 7 days of hourly closes, kept on disk (logs/candles/) and in
// memory, so a chart never waits for Gemini. One market is read again every 6 seconds, the
// oldest first: about 100 markets in 10 minutes, a sixth of Gemini's one call a second.
type Week = { at: number; points: { time: string; yesBps: number }[] };
const weeks = new Map<string, Week>();
const weekFile = (symbol: string) => `logs/candles/${symbol.replace(/[^\w-]/g, "_")}.json`;
try {
  for (const name of readdirSync("logs/candles")) {
    const w = JSON.parse(readFileSync(`logs/candles/${name}`, "utf8"));
    weeks.set(w.symbol, { at: w.at, points: w.points });
  }
} catch {}
const weekReads = new Map<string, Promise<Week>>();
function readWeek(symbol: string) {
  if (!weekReads.has(symbol)) {
    weekReads.set(symbol, (async () => {
      try {
        const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
        const points = (await getCandles(symbol, "1hr")).candles.filter((c) => c[0] >= weekAgo).map((c) => ({ time: new Date(c[0]).toISOString(), yesBps: toBps(c[4]) })).reverse();
        const week = { at: Date.now(), points };
        weeks.set(symbol, week);
        mkdirSync("logs/candles", { recursive: true });
        writeFileSync(weekFile(symbol), JSON.stringify({ symbol, ...week }));
        return week;
      } finally {
        weekReads.delete(symbol);
      }
    })());
  }
  return weekReads.get(symbol)!;
}
// From the cache at once; only a market never read before waits for Gemini.
const weekOf = async (symbol: string) => weeks.get(symbol) ?? (await readWeek(symbol));
setInterval(() => {
  if (!feed || weekReads.size) return;
  const next = feed.markets.map((m) => ({ symbol: m.symbol, at: weeks.get(m.symbol)?.at ?? 0 })).sort((a, b) => a.at - b.at)[0];
  if (next && Date.now() - next.at > 600000) readWeek(next.symbol).catch(() => {});
}, 2000); // a market never read goes first, so a new disk is warm in about 4 minutes; after that each is read again every 10 minutes

let feedPosting = false;
async function postFeed() {
  if (feedPosting || !feed || !LOOPS) return;
  feedPosting = true;
  try {
    const due = feed.markets
      .filter((m) => (PUBLIC || !m.onLoop) && !m.thin) // a thin book is not posted: the feed keeps its last value. The hosted copy has no `npm run oracle`, so it posts the loop's nine markets too
      .map((m) => {
        const last = lastPost.get(m.symbol), moved = last ? Math.abs(m.yesBps - last.yesBps) : 0, age = last ? Date.now() - Date.parse(last.at) : Infinity;
        // Moves first (the largest first), then markets never posted, then the oldest heartbeats.
        return { m, last, rank: moved >= FEED_MOVE_BPS ? 3e9 + moved : !last ? 2e9 : age >= 3600000 ? 1e9 + age / 1000 : 0 };
      })
      .filter((x) => x.rank > 0)
      .sort((a, b) => b.rank - a.rank);
    let sent = 0;
    for (const { m, last } of due) {
      while (feedPosts.length && feedPosts[0] < Date.now() - 3600000) feedPosts.shift();
      if (sent >= FEED_POSTS_PER_TICK || feedPosts.length >= FEED_POSTS_PER_HOUR || (demo && demo.status !== "done")) break;
      try {
        // The first post of a symbol reads its round from the chain; later ones count up from our own.
        const round = last?.round ?? ((await publicClient.readContract({ address: addressOf("OddsFeed"), abi: loadArtifact("OddsFeed").abi, functionName: "latestBySymbol", args: [m.symbol] })) as { round: number }).round;
        await publishValue({ ts: feed.readAt, symbol: m.symbol, probBps: m.yesBps, prevProbBps: last?.yesBps ?? 0, method: "feed", bid: m.bid, ask: m.ask, sourceHash: m.sourceHash }, round);
        feedPosts.push(Date.now());
        sent++;
      } catch (err) {
        console.log(`feed post ${m.symbol} failed: ${(err instanceof Error ? err.message : String(err)).split("\n")[0]}`);
      }
    }
  } finally {
    feedPosting = false;
  }
}
async function feedTick() {
  try {
    await readFeed();
    postFeed();
  } catch (err) {
    console.log(`feed read failed: ${(err instanceof Error ? err.message : String(err)).split("\n")[0]}`);
  }
}
feedTick();
setInterval(feedTick, FEED_SECONDS * 1000);

// The older agent's threats (unit 11.13) come from this feed: "ends below $X", X the nearest
// strike below today's price on the latest date. Today's price is read with each feed read.
const spotNow: Record<string, number> = {};
const feedRowsNow = () => (feed?.markets ?? []).map((m) => ({ ...m, stale: staleOf(m.symbol) }));
useFeedRows(async () => {
  if (!feed) await readFeed();
  return feedRowsNow();
});
async function readSpots() {
  for (const { asset } of loadRules()) spotNow[asset] = (await getSpot(asset.toLowerCase() + "usd")).last;
}
const threatsNow = () => threatsFrom(feedRowsNow(), spotNow);
readSpots().catch(() => {});
setInterval(() => readSpots().catch(() => {}), FEED_SECONDS * 1000);

// ?shown=N gives the first N markets: the feed, then as many of the others as asked for.
app.get("/api/feed", async (req, res) => {
  try {
    if (!feed) await readFeed();
    const tiers = await tiersOf(pools()[0].address);
    const shown = Math.max(feed!.markets.length, Number(req.query.shown) || 0);
    res.json({
      readAt: feed!.readAt,
      everySeconds: FEED_SECONDS,
      postsThisHour: feedPosts.filter((t) => t > Date.now() - 3600000).length,
      postsPerHour: FEED_POSTS_PER_HOUR,
      inFeed: feed!.markets.length,
      total: feed!.markets.length + feed!.more.length,
      counts: feed!.counts,
      tiers: tiers.map((t) => ({ thresholdBps: t.thresholdBps, maxLtvBps: t.maxLtvBps, paused: t.paused })), // the charts' dashed lines and the lending results
      triggerBps: loadRules()[0].trigger * 10000, // the insurance results
      lendingAssets: LENDING_ASSETS,
      markets: [...feed!.markets, ...feed!.more.slice(0, shown - feed!.markets.length)].map(({ sourceHash, ...m }) => {
        const last = lastPost.get(m.symbol);
        return { ...m, stale: staleOf(m.symbol), posted: last ? { yesBps: last.yesBps, outputBps: m.bad ? chanceOfBad(last.yesBps, m.bad.side) : last.yesBps, at: last.at, txUrl: last.txUrl } : null };
      }),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// One market's last 7 days: Gemini's hourly YES (cached 10 minutes), the same hours as our
// output (the chance of the bad outcome where there is one), and every value we really posted.
app.get("/api/feed/history", async (req, res) => {
  try {
    const m = feed && [...feed.markets, ...feed.more].find((x) => x.symbol === req.query.symbol);
    if (!m) return void res.status(404).json({ error: `${req.query.symbol} is not in the feed` });
    const weekAgo = Date.now() - 7 * 24 * 3600 * 1000, out = (yesBps: number) => (m.bad?.side === "NO" ? 10000 - yesBps : yesBps);
    const week = await weekOf(m.symbol);
    // A market outside the feed is not on the 6-second round: an old copy is read again behind this answer.
    if (Date.now() - week.at > 600000) readWeek(m.symbol).catch(() => {});
    const gemini = week.points.filter((c) => Date.parse(c.time) >= weekAgo);
    const posted = (posts.get(m.symbol) ?? []).filter((p) => Date.parse(p.time) >= weekAgo).map((p) => ({ time: p.time, bps: out(p.yesBps) }));
    res.json({ symbol: m.symbol, gemini, ours: gemini.map((c) => ({ time: c.time, bps: out(c.yesBps) })), posted });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// The product site's market list (unit 11.10): every feed market in one answer, with its last
// post, its change over 24 hours and a small 7-day line from the candle cache. Each value is the
// chance of the bad outcome where one is clear, else the chance of YES. Newest post first.
app.get("/api/site/markets", (_req, res) => {
  if (!feed) return void res.status(503).json({ error: "the feed is still being read" });
  const dayAgo = Date.now() - 86400000, weekAgo = Date.now() - 7 * 86400000;
  const markets = feed.markets
    .map((m) => {
      const out = (yesBps: number) => (m.bad?.side === "NO" ? 10000 - yesBps : yesBps);
      const points = (weeks.get(m.symbol)?.points ?? []).filter((p) => Date.parse(p.time) >= weekAgo), last = lastPost.get(m.symbol);
      const before = points.filter((p) => Date.parse(p.time) <= dayAgo).at(-1), every = Math.max(1, Math.ceil(points.length / 42));
      return {
        symbol: m.symbol,
        feedId: keccak256(stringToHex(m.symbol)),
        question: m.bad ? m.bad.risk[0].toUpperCase() + m.bad.risk.slice(1) : `${m.title} ${m.label}`,
        of: m.bad ? "bad" : "yes",
        category: m.category,
        expiry: m.expiry,
        bid: m.bid,
        ask: m.ask,
        chanceBps: last ? out(last.yesBps) : null,
        change24Bps: last && before ? out(last.yesBps) - out(before.yesBps) : null,
        posted: last ? { at: last.at, txUrl: last.txUrl } : null,
        spark: points.filter((_, i) => i % every === 0 || i === points.length - 1).map((p) => out(p.yesBps)),
      };
    })
    .sort((a, b) => (b.posted?.at ?? "").localeCompare(a.posted?.at ?? ""));
  res.json({ readAt: feed.readAt, feedAddress: getAddress(addressOf("OddsFeed")), main: configMarkets()[0].symbol, markets });
});

// --- BTC pools (unit 7.12). Read only: every BTC-collateral market worth showing, with its
// limit today and what the same tiers would suggest for it. Nothing is sent anywhere.
// Aave V4 comes from the advisor above (onchain, Arc mainnet); Aave V3 from Aave's public API;
// Morpho from Morpho's public API. Each source is cached for 60 s and fails on its own.

type PoolCard = {
  id: string;
  title: string; // "Aave V3 Ethereum: WBTC"
  protocol: "Aave V4" | "Aave V3" | "Morpho";
  source: string; // where the numbers were read
  readAt: string;
  limitName: string; // "Collateral factor", "LTV", "LLTV"
  limitBps: number; // today's limit: the most that can be lent against the collateral
  liquidationBps?: number; // Aave V3: the liquidation threshold, which the suggestion leaves alone
  collateralUsd: number; // BTC collateral deposited
  borrowedUsd: number | null; // borrowed against it, where the pool's own borrowing is known (Morpho)
  supplyUsd: number | null; // Morpho: what lenders have supplied to the market
  frozen: boolean; // already frozen today
  // Their other live settings (unit 7.15); null where the protocol has no such thing or does not report it.
  supplyCapUsd: number | null;
  borrowCapUsd: number | null;
  lentOutUsd: number | null; // Aave: this asset lent out of the reserve (not what is borrowed against it)
  utilizationBps: number | null;
};
type PoolSource = { cards: PoolCard[] } | { error: string; title: string; protocol: PoolCard["protocol"] };

const AAVE_V3_API = "https://api.v3.aave.com/graphql";
const AAVE_V3_RESERVES = [
  { chainId: 1, chain: "Ethereum", symbol: "WBTC" },
  { chainId: 1, chain: "Ethereum", symbol: "cbBTC" },
  { chainId: 8453, chain: "Base", symbol: "cbBTC" },
  { chainId: 42161, chain: "Arbitrum", symbol: "WBTC" },
];
const MORPHO_API = "https://api.morpho.org/graphql";
const MORPHO_COLLATERAL = ["WBTC", "cbBTC", "LBTC", "tBTC"];

async function graphql(url: string, query: string) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query }) });
  const json = (await res.json().catch(() => ({}))) as { data?: any; errors?: { message: string }[] }; // an error page is not JSON
  if (!res.ok || json.errors?.length || !json.data) throw new Error(json.errors?.[0]?.message ?? `${new URL(url).host} answered HTTP ${res.status}`);
  return json.data;
}

async function aaveV3Cards(): Promise<PoolCard[]> {
  const data = await graphql(
    AAVE_V3_API,
    `{ markets(request: { chainIds: [${[...new Set(AAVE_V3_RESERVES.map((r) => r.chainId))].join(", ")}] }) { name chain { chainId } reserves { underlyingToken { symbol } isFrozen size { usd } supplyInfo { maxLTV { value } liquidationThreshold { value } supplyCap { usd } } borrowInfo { total { usd } utilizationRate { value } borrowCap { usd } } } } }`,
  );
  const readAt = new Date().toISOString();
  return AAVE_V3_RESERVES.map((want) => {
    // The main market of each chain is named "AaveV3<Chain>"; others (Prime, EtherFi) are left out.
    const market = data.markets.find((m: any) => m.chain.chainId === want.chainId && m.name === "AaveV3" + want.chain);
    const r = market?.reserves.find((x: any) => x.underlyingToken.symbol === want.symbol);
    if (!r) throw new Error(`Aave's API lists no ${want.symbol} reserve on ${want.chain}`);
    return {
      id: `aave-v3-${want.chainId}-${want.symbol}`,
      title: `Aave V3 ${want.chain}: ${want.symbol}`,
      protocol: "Aave V3" as const,
      source: "Aave’s API",
      readAt,
      limitName: "LTV",
      limitBps: Math.round(Number(r.supplyInfo.maxLTV.value) * 10000),
      liquidationBps: Math.round(Number(r.supplyInfo.liquidationThreshold.value) * 10000),
      collateralUsd: Number(r.size.usd),
      borrowedUsd: null, // Aave pools every asset together, so what is borrowed against WBTC alone is not known
      supplyUsd: null,
      frozen: r.isFrozen,
      supplyCapUsd: Number(r.supplyInfo.supplyCap?.usd) || null,
      borrowCapUsd: Number(r.borrowInfo?.borrowCap?.usd) || null,
      lentOutUsd: r.borrowInfo ? Number(r.borrowInfo.total.usd) : null,
      utilizationBps: r.borrowInfo ? Math.round(Number(r.borrowInfo.utilizationRate.value) * 10000) : null,
    };
  });
}

async function morphoCards(): Promise<PoolCard[]> {
  const data = await graphql(
    MORPHO_API,
    `{ markets(first: 100, orderBy: BorrowAssetsUsd, orderDirection: Desc, where: { chainId_in: [1, 8453], listed: true, search: "BTC" }) { items { marketId lltv chain { network } collateralAsset { symbol } loanAsset { symbol } state { supplyAssetsUsd borrowAssetsUsd collateralAssetsUsd } } } }`,
  );
  const readAt = new Date().toISOString();
  return (data.markets.items as any[])
    .filter((m) => m.collateralAsset && MORPHO_COLLATERAL.includes(m.collateralAsset.symbol) && m.state?.collateralAssetsUsd > 0)
    .sort((a, b) => b.state.collateralAssetsUsd - a.state.collateralAssetsUsd)
    .slice(0, 3) // the three largest, to make eight cards with Aave's five
    .map((m) => ({
      id: `morpho-${m.marketId.slice(0, 10)}`,
      title: `Morpho ${m.chain.network}: ${m.collateralAsset.symbol} / ${m.loanAsset.symbol}`,
      protocol: "Morpho" as const,
      source: "Morpho’s API",
      readAt,
      limitName: "LLTV",
      limitBps: Math.round(Number(m.lltv) / 1e14),
      collateralUsd: m.state.collateralAssetsUsd,
      borrowedUsd: m.state.borrowAssetsUsd ?? 0,
      supplyUsd: m.state.supplyAssetsUsd ?? 0,
      frozen: false,
      supplyCapUsd: null, // caps are set per vault by its curator, not on the market
      borrowCapUsd: null,
      lentOutUsd: null,
      utilizationBps: m.state.supplyAssetsUsd ? Math.round(((m.state.borrowAssetsUsd ?? 0) / m.state.supplyAssetsUsd) * 10000) : null,
    }));
}

app.get("/api/pools", async (_req, res) => {
  try {
    // The chance, the tiers and the Aave V4 reserve all come from the advisor's read.
    const advisor = await advisorCached();
    const token = advisor.market.split(", ").pop()!.replace(" reserve", "");
    const spot = await cached("spot:btcusd", 60000, async () => ({ ...(await getSpot("btcusd")), readAt: new Date().toISOString() }));
    const v4: PoolCard = {
      id: "aave-v4-arc-" + token,
      title: `Aave V4 on Arc: ${token}`,
      protocol: "Aave V4",
      source: "Aave’s Main Spoke on Arc mainnet",
      readAt: advisor.readAt,
      limitName: "Collateral factor",
      limitBps: advisor.current.collateralFactorBps,
      collateralUsd: advisor.current.supplied * spot.last, // the reserve holds BTC; valued at Gemini's spot price
      borrowedUsd: null,
      supplyUsd: null,
      frozen: advisor.current.frozen,
      supplyCapUsd: advisor.current.supplyCap === null ? null : advisor.current.supplyCap * spot.last,
      borrowCapUsd: advisor.current.borrowCap === null ? null : advisor.current.borrowCap * spot.last,
      lentOutUsd: advisor.current.debt * spot.last,
      utilizationBps: advisor.current.supplied ? Math.round((advisor.current.debt / advisor.current.supplied) * 10000) : null,
    };
    const source = async (protocol: PoolCard["protocol"], title: string, key: string, read: () => Promise<PoolCard[]>): Promise<PoolSource> => {
      try {
        return { cards: await cached(key, 60000, read) };
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err), title, protocol };
      }
    };
    const sources = [{ cards: [v4] } as PoolSource, await source("Aave V3", "Aave V3: BTC reserves", "pools:aave-v3", aaveV3Cards), await source("Morpho", "Morpho: BTC markets", "pools:morpho", morphoCards)];

    const level = advisor.level;
    const pools = sources.flatMap((s): Record<string, unknown>[] => {
      if ("error" in s) return [{ id: "failed-" + s.protocol, title: s.title, protocol: s.protocol, error: s.error }];
      return s.cards.map((c) => {
        // The most that could be lent under the suggestion at every level, as a share of the
        // collateral. The page picks the level (the live one, or its "what if" slider).
        let ladder: number[];
        if (c.protocol === "Morpho") {
          // The LLTV cannot change, and nothing here touches open loans: the suggestion only
          // limits new lending, so it never goes below what is supplied and borrowed now.
          // 50%+: hold the vault cap at today's supply. 70%+: no new borrowing room beyond
          // today's. 85%+: the same, no new borrowing beyond today's level (supply carries on).
          ladder = morphoLadder({ limitBps: c.limitBps, collateralUsd: c.collateralUsd, borrowedUsd: c.borrowedUsd!, supplyUsd: c.supplyUsd! });
        } else {
          ladder = aaveLadder(c.limitBps);
        }
        const suggestedBps = ladder[level];
        return { ...c, ladder, suggestedBps, lessUsd: lessUsd(c.collateralUsd, c.limitBps, suggestedBps) };
      });
    });
    res.json({
      label: "READ ONLY: nothing is sent to any protocol.",
      chance: { symbol: advisor.harm.symbol, risk: advisor.risk, harmBps: advisor.harm.harmBps, round: advisor.harm.round, stale: staleOf(advisor.harm.symbol), level, tiers: advisor.tiers },
      steps: advisor.tiers.map((_, i) => ({ points: CUTS[i] / 100, noNewBorrowing: i >= 3 })),
      rule: NO_NEW_RULE,
      btcUsd: spot.last,
      ...followable(spot.last),
      pools,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Unit 10b.6: the BTC markets a pool can follow (every "$X or above" market in the feed, as the
// chance BTC ends below X), and the one automatic mode picks: of the markets that end last, the
// strike nearest 10% below today's BTC price. A market that has ended is no longer in the feed,
// so automatic mode moves on to the next end date by itself.
function followable(btcUsd: number) {
  const markets = (feed?.markets ?? [])
    .filter((m) => m.asset === "BTC" && m.bad?.side === "NO" && !m.thin)
    .map((m) => ({ symbol: m.symbol, risk: m.bad!.risk, strike: Number(m.label.replace(/[^\d.]/g, "")), expiry: m.expiry, harmBps: m.outputBps, stale: staleOf(m.symbol) }))
    .sort((a, b) => b.expiry.localeCompare(a.expiry) || b.strike - a.strike);
  const latest = markets[0]?.expiry, target = btcUsd * 0.9;
  const pick = markets.filter((m) => m.expiry === latest).sort((a, b) => Math.abs(a.strike - target) - Math.abs(b.strike - target))[0] ?? null;
  return { markets, auto: pick && { symbol: pick.symbol, targetUsd: Math.round(target), rule: "The strike nearest 10% below today’s BTC price, among the markets that end last." } };
}

// --- Stream (units 3.2, 5.2, 5.3): what the QuickNode Stream has delivered. Reads local files only.

// One decoded event, exactly as src/stream/filter.js returns it.
type StreamEvent = {
  type: "oddsUpdated" | "bigMove" | "protectionBought" | "walletChange" | "riskLevelChanged";
  block: number;
  time: number; // block timestamp, unix seconds
  tx: string;
  symbol?: string;
  probBps?: number;
  prevProbBps?: number;
  round?: number;
  side?: string;
  contracts?: number;
  premium?: number;
  direction?: "in" | "out";
  from?: string;
  to?: string;
  amount?: number;
  protocol?: string;
  oldLevel?: number;
  newLevel?: number;
  harmBps?: number;
};

app.get("/api/stream", (_req, res) => {
  const streamId = existsSync("logs/stream-id.txt") ? readFileSync("logs/stream-id.txt", "utf8").trim() : streamUp() ? "hosted" : null;
  // The 20 newest typed events, newest first. Lines from before unit 5.2 hold raw logs and are left out.
  const events: (StreamEvent & { receivedAt: string; via: string; txUrl: string; agentRun?: string })[] = [];
  try {
    for (const line of readFileSync("logs/stream.jsonl", "utf8").trim().split("\n").slice(-60)) {
      const d = JSON.parse(line);
      (Array.isArray(d.body) ? d.body : []).forEach((e: StreamEvent, i: number) => {
        // agentRun marks the one event that made the agent check again.
        if (e.type) events.push({ ...e, receivedAt: d.receivedAt, via: d.via ?? "stream", txUrl: `${EXPLORER}/tx/${e.tx}`, ...(d.agentRunEvent === i ? { agentRun: d.agentRun } : {}) });
      });
    }
  } catch {}
  // For the top bar's panel (unit 10b.7): what the Stream watches, and its last 10 deliveries
  // with the time from the block to our webhook.
  const deliveries: { receivedAt: string; delayMs: number | null; events: string[]; did: string[] }[] = [];
  try {
    for (const text of readFileSync("logs/stream.jsonl", "utf8").trim().split("\n").slice(-80).reverse()) {
      const d = JSON.parse(text);
      if (d.via !== "stream" || d.rejected || !Array.isArray(d.body) || !d.body.length) continue;
      const body: StreamEvent[] = d.body, time = Math.max(...body.map((e) => e.time ?? 0));
      const did: string[] = [...new Set(body.map((e) => (e.type === "riskLevelChanged" ? "pool level changed" : e.type === "protectionBought" ? "purchase shown" : e.type === "walletChange" ? "agent run" : poolMarkets.has(e.symbol ?? "") ? "pool sync" : "page update")))];
      if (body.some((e) => e.symbol && rechecked.has(`${e.symbol} ${e.round}`))) did.push("agent re-check");
      if (d.agentRun && !did.includes("agent run")) did.push("agent run");
      deliveries.push({ receivedAt: d.receivedAt, delayMs: time ? Math.max(0, Date.parse(d.receivedAt) - time * 1000) : null, events: body.map((e) => `${e.type}${e.symbol ? " " + e.symbol : ""}`), did });
      if (deliveries.length === 10) break;
    }
  } catch {}
  const at = (name: string) => ({ name, address: addressOf(name), url: `${EXPLORER}/address/${addressOf(name)}` });
  res.json({
    streamId,
    lastDelivery,
    watches: {
      network: "Arc testnet, logs dataset",
      contracts: [at("OddsFeed"), at("ProtectionBook"), at("RiskSwitch")],
      events: ["OddsFeed.OddsUpdated: every post (a move of 5 points or more is marked as a big move)", "RiskSwitch.RiskLevelChanged: a pool’s limit moved", "ProtectionBook.ProtectionBought: an agent paid a premium", "USDC transfers to or from the agent’s wallet"],
    },
    filter: { file: "src/stream/filter.js", url: "https://github.com/DhruPtel/UBC-2026-Probability-Oracle/blob/main/src/stream/filter.js", note: "Runs on QuickNode. It keeps only these logs, decodes them, and sends small typed events; a block with none of them is not delivered." },
    destination: (PUBLIC ? "A webhook on this server (/stream). " : "A webhook on this server (port " + STREAM_PORT + "), reached through a tunnel. ") + "QuickNode signs every delivery (HMAC-SHA256); anything unsigned is rejected.",
    triggers: ["The keeper calls RiskSwitch.sync for the pool whose market was posted", "A covered demo agent re-checks its cover; a big move starts an agent run", "Every open page updates at once"],
    deliveries,
    events: events.reverse().slice(0, 20),
  });
});

// "Send test move" (unit 5.2): publishes test:demo 7 points away from its last value, as the
// deployer, so a bigMove comes through the Stream. test: symbols never look like Gemini data.
app.post("/api/test-move", async (_req, res) => {
  try {
    const symbol = "test:demo";
    const address = addressOf("OddsFeed");
    const { abi } = loadArtifact("OddsFeed");
    const current = (await publicClient.readContract({ address, abi, functionName: "latestBySymbol", args: [symbol] })) as { probBps: number };
    const probBps = current.probBps <= 5000 ? current.probBps + 700 : current.probBps - 700;
    const { txHash, receipt } = await asDeployer(async () => {
      const txHash = await walletClient("DEPLOYER_KEY").writeContract({ address, abi, functionName: "publish", args: [symbol, probBps, BigInt(Math.floor(Date.now() / 1000)), zeroHash] });
      return { txHash, receipt: await publicClient.waitForTransactionReceipt({ hash: txHash }) };
    });
    res.json({ symbol, probBps, prevProbBps: current.probBps, txHash, txUrl: `${EXPLORER}/tx/${txHash}`, block: Number(receipt.blockNumber) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// What a delivery sets off: an agent run and the keeper. The Stream webhook calls this with
// `via` "stream". When the Stream is down, a demo replay calls it itself with the same event
// shape and `via` "direct": a deliberate demo fallback, labeled "direct trigger" on the pages.
// When a replay last topped the agent's wallet up. That transfer is a wallet change too, and the
// live agent it started once spent the top-up on a live threat before the replay could buy
// (unit 11.5): wallet changes in the minute after it start no run.
let replayTopUpAt = 0;
function handleEvents(events: StreamEvent[], via: "stream" | "direct", body: unknown = events, contentType: string | null = null) {
  const pc = (bps?: number) => `${(bps ?? 0) / 100}%`;

  // Unit 5.3: the agent re-checks on a big move of a symbol it watches, or when its wallet
  // changes. One run per delivery. The run is started here, in this process, and not awaited;
  // if one is already going, runOnce logs "skipped, run in progress".
  // While a demo replay runs, the only thing that starts a run is a changed value of the agent
  // demo's symbol (a run of the demo threat). The protocol demo never involves the agent.
  const running = demo && demo.status !== "done" ? demo : null;
  const watched = threatsNow().map((t) => t.symbol);
  const isOdds = (e: StreamEvent) => e.type === "oddsUpdated" || e.type === "bigMove";
  const replayed = running ? events.find((e) => isOdds(e) && e.symbol === running.symbol) : undefined;
  const cause = !LOOPS ? undefined : running
    ? running.kind === "agent" && replayed && replayed.probBps !== replayed.prevProbBps ? replayed : undefined
    : events.find((e) => (e.type === "bigMove" && watched.includes(e.symbol ?? "")) || (e.type === "walletChange" && Date.now() - replayTopUpAt > 60000));
  let trigger: string | null = null;
  if (cause && isOdds(cause)) {
    trigger = `${via}: ${cause.type} ${cause.symbol} ${pc(cause.prevProbBps)} → ${pc(cause.probBps)} YES`;
  } else if (cause) {
    trigger = `${via}: walletChange ${cause.direction === "in" ? "+" : "−"}${formatUnits(BigInt(cause.amount!), 6)} USDC`;
  }

  const receivedAt = new Date().toISOString();
  if (via === "stream") lastDelivery = receivedAt;
  mkdirSync("logs", { recursive: true });
  appendFileSync("logs/stream.jsonl", JSON.stringify({ receivedAt, via, contentType, body, ...(cause && trigger ? { agentRun: trigger, agentRunEvent: events.indexOf(cause) } : {}) }) + "\n");
  console.log(`${via} delivery ${receivedAt}  ${events.map((e) => e.type).join(", ") || "no typed events"}${trigger ? `  → agent run (${trigger})` : ""}`);

  if (!LOOPS) return; // recorded and shown, nothing triggered
  // Unit 10b.5: a covered demo agent re-checks on every post for its market that the Stream delivers.
  if (via === "stream") for (const e of events) if (isOdds(e) && e.symbol && e.probBps !== undefined && desk.recheck(e.symbol, e.probBps, e.round, e.tx)) rechecked.add(`${e.symbol} ${e.round}`);

  const work: Promise<unknown>[] = [];
  if (trigger) {
    const run: DemoRun | undefined = running?.holding ? { runId: running.runId, holding: holdingAt(running, running.published.at(-1)?.time), holdingAt: (round) => holdingAt(running, running.published.find((p) => p.round === round)?.time) } : undefined;
    work.push(runOnce(trigger, run).catch((err) => console.log(`agent run failed: ${err instanceof Error ? err.message : err}`)));
  }

  // Unit 6.3, the keeper: any odds update for a pool's market syncs that pool. Pools are
  // synced one after another, so they don't skip each other.
  work.push(
    (async () => {
      for (const pool of pools()) {
        const { symbol } = await poolConfig(pool.address);
        poolMarkets.add(symbol);
        const update = events.find((e) => isOdds(e) && e.symbol === symbol);
        if (update) await syncPool(pool, `${via}: ${update.type} ${symbol} ${pc(update.prevProbBps)} → ${pc(update.probBps)} YES`);
      }
    })().catch((err) => console.log(`keeper failed: ${err instanceof Error ? err.message : err}`)),
  );

  // The replay waits for this work before its next publish, so transactions never overlap.
  if (running && replayed) {
    running.work.push(...work);
    running.handledRound = Math.max(running.handledRound, replayed.round ?? 0);
  }
}

// --- Demo replays (units 7.3, 7.5, 7.6). REPLAY: the real Gemini hourly history of a market
// (config/markets.json "replays"), published again on a short clock under its own replay
// symbol through the real publisher. Two kinds:
//   agent     BTC, Nov 12 to 15. The demo agent watches the symbol: it pays for reads and buys
//             protection when the chance reaches 25% while BTC is above the strike
//             (its holding valued at each replayed hour's real BTC price).
//   protocol  ETH, Nov 9 to 15. ReplayEthPool watches the symbol: the keeper's syncs take it
//             through every tier. Spends deployer gas only.
// The paid reads, the premium, the syncs and the Stream deliveries are all real.

const DEMO_SECONDS = 22; // the least a replay takes: its publishes are spread evenly over this, and each one
// also waits for the work it set off, which brings a run to about 65 s

type Balances = { agentWallet: number; agentGateway: number; deployer: number };
type DemoState = {
  kind: DemoKind;
  runId: string;
  status: "starting" | "running" | "done"; // "starting" until the first value is onchain and synced
  via: "stream" | "direct"; // "direct" when no Stream was up at the start
  startedAt: string;
  endedAt?: string;
  symbol: string;
  pool: string;
  total: number; // how many values this run publishes
  path: { time: string; yesBps: number }[]; // every hourly candle in the window, for the chart
  plan: string[]; // the hour of every post this run will make, so the page's playhead can glide toward the next one
  published: { time: string; at: string; yesBps: number; round: number; txHash: string; txUrl: string }[]; // time: the candle's hour; at: when it went onchain
  holding?: DemoRun["holding"]; // the agent demo's DECLARED HOLDING, valued at the first replayed hour
  spots?: { time: string; usd: number }[]; // the agent demo: BTC's real hourly price over the window
  handledRound: number; // the newest round handleEvents has seen for this run
  work: Promise<unknown>[]; // what that set off and has not been waited for yet
  balances: { start: Balances; end?: Balances };
  errors: number;
};
let demo: DemoState | null = null;
// The newest run of each kind, kept through the other replay and through a restart
// (logs/demo-last.json), so a replay's page always has its last run to show (unit 10b.1).
const lastRuns: Partial<Record<DemoKind, DemoState>> = {};
try {
  for (const d of Object.values(JSON.parse(readFileSync("logs/demo-last.json", "utf8"))) as DemoState[]) lastRuns[d.kind] = { ...d, status: "done", work: [] };
} catch {}
const keepRuns = () => writeFileSync("logs/demo-last.json", JSON.stringify(lastRuns, (key, value) => (key === "work" ? [] : value)));
const loanChecks = new Map<string, boolean>(); // "<runId>:<level>" → canBorrow(100, 50)

function demoLog(d: DemoState, step: string, detail: string, extra: Record<string, unknown> = {}) {
  appendFileSync("logs/demo.jsonl", JSON.stringify({ ts: new Date().toISOString(), runId: d.runId, kind: d.kind, step, detail, ...extra }) + "\n");
  console.log(`demo ${d.kind} ${d.runId}  ${step}: ${detail}`);
}

async function balances(): Promise<Balances> {
  const usdc = async (address: `0x${string}`) => Number(formatUnits(await publicClient.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [address] }), 6));
  const gatewayNow = await agentGateway().getBalances();
  return { agentWallet: await usdc(account("AGENT_KEY").address), agentGateway: Number(gatewayNow.gateway.formattedAvailable), deployer: await usdc(seller) };
}

// The real hourly candles of a replay's market inside its window, oldest first.
// A candle is [time, open, high, low, close, volume]; the close is the YES price.
async function replayWindow(cfg: ReplayConfig) {
  const { candles } = await getCandles(cfg.source, "1hr");
  const from = Date.parse(cfg.from + "T00:00:00Z");
  const to = Date.parse(cfg.to + "T00:00:00Z") + 24 * 3600 * 1000;
  return candles.filter((c) => c[0] >= from && c[0] < to).reverse();
}

app.post("/api/demo/:kind/start", async (req, res) => {
  try {
    const kind = req.params.kind as DemoKind;
    const cfg = replays()[kind];
    if (!cfg) {
      res.status(404).json({ error: `unknown demo ${kind}` });
      return;
    }
    if (demo && demo.status !== "done") {
      res.status(409).json({ error: `the ${demo.kind} demo is running` });
      return;
    }
    const limit = await publicLimit("replays");
    if (limit) {
      res.status(429).json({ error: limit });
      return;
    }
    const window = await replayWindow(cfg);
    if (window.length === 0) throw new Error(`Gemini returned no hourly candles for ${cfg.source}, ${cfg.from} to ${cfg.to}`);
    // The agent replay values its holding at each replayed hour's real BTC price (unit 11.13):
    // the strike is a threat only while BTC is above it, and the loss is holding × (1 − strike / price).
    const spots = kind === "agent" ? await replaySpots(cfg, window) : undefined;
    // The agent replay buys cover with real testnet USDC. A wallet short of the premium made
    // buyProtection revert at the crossing (unit 8.0j), so the treasury, which receives every
    // premium, tops the agent up first: enough for the most contracts any hour needs at $1, and gas.
    if (kind === "agent") {
      const { threat, holding } = loadDemo(), agent = account("AGENT_KEY").address;
      const most = Math.max(0, ...spots!.map((p) => Math.ceil(threat.hedgeRatio * lossIfBelow(holding.amount * p.usd, p.usd, threat.strikeUsd))));
      const want = BigInt(most * 1e6 + 500000);
      const has = await publicClient.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [agent] });
      if (has < want) {
        replayTopUpAt = Date.now();
        await asDeployer(async () => {
          const txHash = await walletClient("DEPLOYER_KEY").writeContract({ address: USDC, abi: erc20Abi, functionName: "transfer", args: [agent, want - has] });
          await publicClient.waitForTransactionReceipt({ hash: txHash });
        });
      }
    }
    // The history moves in steps and holds each value for hours, so the replay publishes the
    // first candle and every candle whose value differs from the one before it.
    // Of those changes it posts about 8 (unit 7.10): the first, the last, the first one inside each
    // tier (the pool's thresholds and the agent's trigger), and others spread evenly between them.
    const changes = window.filter((c, i) => i === 0 || c[4] !== window[i - 1][4]);
    const thresholds = [...(await tiersOf(pools().find((p) => p.name === cfg.pool)!.address)).slice(1).map((t) => t.thresholdBps), loadDemo().threat.trigger * 10000];
    const picks = pickPosts(changes, thresholds, 8);

    const d: DemoState = {
      kind,
      runId: new Date().toISOString().replace(/[-:]/g, "").slice(0, 15),
      status: "starting",
      via: streamUp() ? "stream" : "direct",
      startedAt: new Date().toISOString(),
      symbol: cfg.symbol,
      pool: cfg.pool,
      total: picks.length,
      plan: picks.map((c) => new Date(c[0]).toISOString()),
      path: window.map((c) => ({ time: new Date(c[0]).toISOString(), yesBps: toBps(c[4]) })),
      published: [],
      holding: kind === "agent" ? valued(loadDemo().holding, spots![0].usd) : undefined,
      spots,
      handledRound: 0,
      work: [],
      balances: { start: await balances() },
      errors: 0,
    };
    demo = d;
    lastRuns[kind] = d;
    demoLog(d, "start", `replaying ${picks.length} of the ${changes.length} changes in ${window.length} real hourly candles of ${cfg.source}, ${cfg.from} to ${cfg.to}; ${d.via === "stream" ? "triggers come through the Stream" : "Stream is down: triggers run directly"}`, { via: d.via });
    res.json(await demoView(kind));

    runDemo(d, picks).catch((err) => {
      demoLog(d, "error", err instanceof Error ? err.message : String(err));
      d.status = "done";
      d.endedAt = new Date().toISOString();
      keepRuns();
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// BTC's real hourly price over a replay's window, one per candle of the market (the last one
// at or before its hour), from Gemini's btcusd candles.
async function replaySpots(cfg: ReplayConfig, window: number[][]) {
  const pair = (cfg.source.match(/^GEMI-([A-Z]+)\d/)?.[1] ?? "BTC").toLowerCase() + "usd";
  const { candles } = await getCandles(pair, "1hr"); // newest first
  return window.map((c) => {
    const at = candles.find((k) => k[0] <= c[0]);
    if (!at) throw new Error(`Gemini has no ${pair} price for ${new Date(c[0]).toISOString()}`);
    return { time: new Date(c[0]).toISOString(), usd: at[4] };
  });
}
const valued = (h: { label: string; asset: string; amount: number; spotPair: string }, usd: number) => ({ ...h, spotUsd: usd, valueUsd: Math.round(h.amount * usd * 100) / 100 });
// The replay's holding at one replayed hour (an ISO time): its coins at that hour's price.
function holdingAt(d: DemoState, time?: string) {
  const p = d.spots && time ? d.spots.filter((x) => x.time <= time).at(-1) : undefined;
  return p ? valued(d.holding!, p.usd) : d.holding!;
}

// Which of a replay's changed candles to post. A candle's level is how many thresholds the
// chance of the bad outcome (100% minus YES) has reached.
function pickPosts(changes: number[][], thresholds: number[], want: number) {
  if (changes.length <= want) return changes;
  const level = (c: number[]) => thresholds.filter((t) => 10000 - toBps(c[4]) >= t).length;
  const keep = new Set([0, changes.length - 1]);
  let top = level(changes[0]);
  changes.forEach((c, i) => {
    if (level(c) > top) {
      top = level(c);
      keep.add(i);
    }
  });
  // Fill up with the candle farthest from any kept one, until there are enough.
  while (keep.size < want) {
    let best = -1, bestGap = 0;
    changes.forEach((_, i) => {
      const gap = Math.min(...[...keep].map((k) => Math.abs(k - i)));
      if (gap > bestGap) [best, bestGap] = [i, gap];
    });
    keep.add(best);
  }
  return changes.filter((_, i) => keep.has(i));
}

async function runDemo(d: DemoState, picks: number[][]) {
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
  const interval = (DEMO_SECONDS * 1000) / picks.length;
  for (let i = 0; i < picks.length; i++) {
    const started = Date.now();
    const candle = picks[i];
    try {
      const current = await replayRead(d.symbol);
      // Each publish carries the candle's time and the hash of the candle it came from.
      const line = await publishValue(
        { ts: new Date(candle[0]).toISOString(), symbol: d.symbol, probBps: toBps(candle[4]), prevProbBps: current.probBps, method: "replay", sourceHash: keccak256(stringToHex(JSON.stringify(candle))) },
        current.round,
      );
      d.published.push({ time: line.ts, at: new Date().toISOString(), yesBps: line.probBps, round: line.round, txHash: line.txHash, txUrl: `${EXPLORER}/tx/${line.txHash}` });
      demoLog(d, "publish", `${i + 1} of ${picks.length}: ${line.ts.slice(0, 13)}h was ${line.probBps / 100}% YES`, { txHash: line.txHash });
      if (d.via === "direct") {
        const type = Math.abs(line.probBps - current.probBps) >= 500 ? "bigMove" : "oddsUpdated";
        handleEvents([{ type, symbol: d.symbol, probBps: line.probBps, prevProbBps: current.probBps, round: line.round, block: line.block, time: Math.floor(Date.now() / 1000), tx: line.txHash }], "direct");
      }
      // Wait for what this publish set off (the agent's run, the pool's sync) before the next
      // one. Through the Stream that starts when the delivery arrives; give it 10 s at most.
      const giveUpAt = Date.now() + 10000;
      while (d.handledRound < line.round && Date.now() < giveUpAt) await sleep(100);
      await Promise.allSettled(d.work.splice(0));
    } catch (err) {
      d.errors++;
      demoLog(d, "error", `publish ${i + 1} failed: ${(err instanceof Error ? err.message : String(err)).split("\n")[0]}`);
    }
    // The first value puts the symbol and its pool back to the start; the story begins after it.
    if (i === 0) {
      d.status = "running";
      demoLog(d, "running", "the first value is onchain");
    }
    await sleep(interval - (Date.now() - started));
  }
  await sleep(2500); // the last step stays on screen a moment, and the last Stream deliveries land
  d.balances.end = await balances();
  d.status = "done";
  d.endedAt = new Date().toISOString();
  keepRuns();
  demoLog(d, "end", "the replay finished");
}

type PaymentLine = { ts: string; symbol: string; amount: string | null; round?: number; probBps: number | null; run: string | null; transaction: string | null };
const paymentLines = (): PaymentLine[] => {
  try {
    return readFileSync("logs/payments.jsonl", "utf8").trim().split("\n").map((l) => JSON.parse(l));
  } catch {
    return [];
  }
};

// Everything a demo page shows, as one object: the chart's history, and the newest run of
// this kind with its step and summary. Derived from the run's state and the log files
// on every call, so the page can simply draw whatever this returns.
async function demoView(kind: DemoKind) {
  const cfg = replays()[kind];
  const d = demo?.kind === kind ? demo : lastRuns[kind] ?? null;
  const harm = (yesBps: number) => 10000 - yesBps; // both replays watch the NO side
  const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
  const path = d ? d.path : (await replayWindow(cfg)).map((c) => ({ time: new Date(c[0]).toISOString(), yesBps: toBps(c[4]) }));

  // What the Stream (or the direct fallback) delivered for this run's symbol.
  const delivered: (StreamEvent & { via: string; receivedAt: string })[] = [];
  if (d) {
    try {
      for (const text of readFileSync("logs/stream.jsonl", "utf8").trim().split("\n").slice(-200)) {
        const line = JSON.parse(text);
        if (line.receivedAt < d.startedAt || !Array.isArray(line.body)) continue;
        for (const e of line.body as StreamEvent[]) if (e.symbol === d.symbol) delivered.push({ ...e, via: line.via ?? "stream", receivedAt: line.receivedAt });
      }
    } catch {}
  }
  const lastDelivered = delivered.at(-1);
  const b = d?.balances;

  const view = {
    kind,
    symbol: cfg.symbol,
    source: cfg.source,
    risk: cfg.risk,
    label: (JSON.parse(readFileSync("config/markets.json", "utf8")).markets as { symbol: string; label: string }[]).find((m) => m.symbol === cfg.source)?.label ?? null, // the Gemini contract's name, when we list it
    asset: cfg.source.match(/^GEMI-([A-Z]+)\d/)?.[1] ?? "the asset", // "BTC", from the Gemini symbol
    from: cfg.from,
    to: cfg.to,
    expectedSeconds: DEMO_SECONDS + 8, // the publishes, plus the start and the pause at the end
    intervalMs: (DEMO_SECONDS * 1000) / (d?.total ?? 8), // the least time between two posts
    busy: demo && demo.status !== "done" && demo.kind !== kind ? demo.kind : null, // the other demo is running
    path: path.map((p) => ({ time: p.time, harmBps: harm(p.yesBps) })),
    run: d && {
      runId: d.runId,
      status: d.status,
      via: d.via,
      startedAt: d.startedAt,
      endedAt: d.endedAt ?? null,
      plan: d.plan,
      // Each post as it reached the server: through the Stream, with the time from its block
      // to the delivery (block times are whole seconds), or by the direct trigger.
      deliveries: delivered.filter((e) => e.type === "oddsUpdated" || e.type === "bigMove").map((e) => ({ round: e.round, via: e.via, at: e.receivedAt, delayMs: Math.max(0, Date.parse(e.receivedAt) - e.time * 1000) })),
      total: d.total,
      errors: d.errors,
      seconds: d.endedAt ? Math.round((Date.parse(d.endedAt) - Date.parse(d.startedAt)) / 1000) : null,
      published: d.published.map((p) => ({ time: p.time, at: p.at, yesBps: p.yesBps, harmBps: harm(p.yesBps), round: p.round, txUrl: p.txUrl })),
      stream: { count: delivered.length, last: lastDelivered ? { type: lastDelivered.type, txUrl: `${EXPLORER}/tx/${lastDelivered.tx}` } : null },
    },
  };

  if (kind === "agent") {
    const { threat, holding: declared } = loadDemo();
    const triggerBps = threat.trigger * 10000;
    // Its numbers at the hour it bought (the first post at or above the trigger while BTC was
    // above the strike), else at the newest post.
    const buyAt = d?.published.find((p) => harm(p.yesBps) >= triggerBps && holdingAt(d, p.time).spotUsd > threat.strikeUsd) ?? d?.published.at(-1);
    const holding = d?.holding ? holdingAt(d, buyAt?.time) : await readHolding(declared);
    const lossUsd = Math.round(lossIfBelow(holding.valueUsd, holding.spotUsd, threat.strikeUsd) * 100) / 100;
    const needed = Math.ceil(Math.round(threat.hedgeRatio * lossUsd * 1e6) / 1e6);
    const why = buyAt ? whyLine({ asset: holding.asset, spotUsd: holding.spotUsd, strikeUsd: threat.strikeUsd, by: "Nov 30", chanceBps: harm(buyAt.yesBps), lossUsd, contracts: needed, trigger: threat.trigger }) : null;
    let steps: Step[] = [];
    try {
      if (d) steps = readFileSync("logs/agent.jsonl", "utf8").trim().split("\n").slice(-400).map((l) => JSON.parse(l)).filter((s: Step) => s.demo === d.runId);
    } catch {}
    const reads = d ? paymentLines().filter((p) => p.symbol === d.symbol && p.ts >= d.startedAt && (!d.endedAt || p.ts <= d.endedAt)) : [];
    const fills = d ? paperFills(demoPaperFile(d.runId)) : [];
    const covered = fills.reduce((sum, f) => sum + f.contracts, 0);
    const premium = round6(fills.reduce((sum, f) => sum + f.premiumUsdc, 0));
    // "buying" from the decision to buy until the purchase is done (or fails).
    const lastMark = steps.filter((s) => s.action === "buy" || s.step === "done" || s.step === "error").at(-1);
    const status = covered > 0 ? "insured" : lastMark?.action === "buy" ? "buying" : "watching";
    const crossed = !!d && d.published.some((p) => harm(p.yesBps) >= triggerBps);
    const readAbove = reads.some((r) => r.probBps !== null && harm(r.probBps) >= triggerBps);
    return {
      ...view,
      triggerBps,
      step: !d ? 0 : status === "insured" ? 5 : status === "buying" ? 4 : readAbove ? 3 : crossed ? 2 : 1,
      agent: { holding: { label: holding.label, amount: holding.amount, asset: holding.asset, valueUsd: holding.valueUsd }, risk: threat.riskShort, strikeUsd: threat.strikeUsd, spotUsd: holding.spotUsd, lossUsd, why, needed, covered, status, wallet: account("AGENT_KEY").address, walletUrl: `${EXPLORER}/address/${account("AGENT_KEY").address}`, walletUsdc: b ? (b.end ?? b.start).agentWallet : null },
      error: status === "insured" ? null : (steps.filter((s) => s.step === "error").at(-1)?.detail ?? null), // a purchase that failed, in the agent's own words
      tiers: (await tiersOf(pools()[0].address)).map((t) => ({ thresholdBps: t.thresholdBps, paused: t.paused })),
      // Every paid read of this run, and the real fill.
      reads: reads.map((r) => ({ at: r.ts, harmBps: r.probBps === null ? null : harm(r.probBps), usdc: Number(r.amount ?? 0), round: r.round ?? null, payment: r.transaction ?? null })),
      fill: fills.length ? { at: fills.at(-1)!.ts, side: fills.at(-1)!.side, contracts: covered, price: fills.at(-1)!.price, premiumUsdc: premium, feeUsd: takerFee(covered, fills.at(-1)!.price), txUrl: `${EXPLORER}/tx/${fills.at(-1)!.txHash}` } : null,
      summary: b?.end
        ? {
            startHarmBps: harm(d!.published[0]?.yesBps ?? 10000),
            endHarmBps: harm(d!.published.at(-1)?.yesBps ?? 10000),
            contracts: covered,
            premiumUsdc: premium,
            reads: reads.length,
            readsUsdc: round6(b.start.agentGateway - b.end.agentGateway),
            agentGasUsdc: round6(b.start.agentWallet - b.end.agentWallet - premium),
            // The deployer receives the premium (it is the treasury) and pays for publishes and syncs.
            deployerGasUsdc: round6(b.start.deployer + premium - b.end.deployer),
          }
        : null,
    };
  }

  const pool = pools().find((p) => p.name === cfg.pool)!;
  const tiers = await tiersOf(pool.address);
  // The pool's state comes from this run's newest sync record when there is one, so a page
  // refresh costs no RPC call (Arc's public RPC answers 429 when a replay asks too often).
  const syncs = d ? syncLines().filter((l) => l.pool === cfg.pool && l.ts >= d.startedAt && l.txHash) : [];
  const synced = syncs.at(-1);
  const params = synced ? { level: synced.levelAfter!, maxLtvBps: synced.maxLtvBps!, paused: synced.paused! } : await poolParams(pool.address);
  // The automatic check: would the pool lend $50 against $100 right now? A free view call,
  // made once per level of a run.
  const checkKey = `${d?.runId}:${params.level}`;
  if (!loanChecks.has(checkKey)) {
    const [allowed] = (await publicClient.readContract({ address: pool.address, abi: loadArtifact("DemoLendingPool").abi, functionName: "canBorrow", args: [100n, 50n] })) as [boolean, bigint, string];
    loanChecks.set(checkKey, allowed);
  }
  const ok = loanChecks.get(checkKey)!;
  // The syncs of this run that raised the pool's level, oldest first.
  const changes = syncs.filter((l) => l.levelAfter! > l.levelBefore!);
  return {
    ...view,
    step: !d || d.status === "starting" ? 0 : 1 + params.level,
    pool: { name: pool.name, explorerUrl: `${EXPLORER}/address/${pool.address}`, level: params.level, maxLtvBps: params.maxLtvBps, paused: params.paused, tiers, check: { collateralUsd: 100, loanUsd: 50, ok } },
    changes: changes.map((l) => ({ at: l.ts, level: l.levelAfter, levelBefore: l.levelBefore, harmBps: l.harmBps, maxLtvBps: l.maxLtvBps, paused: l.paused, via: l.trigger.startsWith("stream") ? "stream" : "direct", txUrl: `${EXPLORER}/tx/${l.txHash}` })),
    // Every sync of this run, for the 7.9 page's flow: what the pool did after each post.
    syncs: syncs.map((l) => ({ at: l.ts, levelBefore: l.levelBefore, level: l.levelAfter, harmBps: l.harmBps, maxLtvBps: l.maxLtvBps, paused: l.paused, txUrl: `${EXPLORER}/tx/${l.txHash}` })),
    summary: b?.end
      ? {
          startHarmBps: harm(d!.published[0]?.yesBps ?? 10000),
          endHarmBps: harm(d!.published.at(-1)?.yesBps ?? 10000),
          limits: [{ maxLtvBps: tiers[0].maxLtvBps, paused: tiers[0].paused }, ...changes.map((l) => ({ maxLtvBps: l.maxLtvBps, paused: l.paused }))],
          updates: changes.length,
          deployerGasUsdc: round6(b.start.deployer - b.end.deployer),
        }
      : null,
  };
}

app.get("/api/demo/:kind", async (req, res) => {
  try {
    if (!replays()[req.params.kind as DemoKind]) {
      res.status(404).json({ error: `unknown demo ${req.params.kind}` });
      return;
    }
    res.json(await demoView(req.params.kind as DemoKind));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// --- The agent insurance desk (units 8.0d to 8.0f): src/desk/desk.ts behind plain routes.
// The Agents page and the MCP server (src/desk/mcp.ts) both call these.

desk.useFeed(() => (feed?.markets ?? []).map((m) => ({ ...m, stale: staleOf(m.symbol) })));
const deskRoute = (work: (req: express.Request) => unknown) => async (req: express.Request, res: express.Response) => {
  try {
    res.json(await work(req));
  } catch (err) {
    res.status(400).json({ error: (err instanceof Error ? err.message : String(err)).split("\n")[0] });
  }
};
const agentId = (req: express.Request) => String(req.params.id);
// The hosted copy offers the MCP tools over HTTP at /mcp; a local copy offers the stdio line.
const hostOf = (req: express.Request) => (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : `${req.protocol}://${req.get("host")}`);
app.get("/api/desk", deskRoute((req) => {
  const url = `${hostOf(req)}/mcp`;
  return { ...desk.deskView(), ...(PUBLIC ? { hosted: true, mcp: { add: `claude mcp add --transport http hedgehog-desk ${url}`, config: { mcpServers: { "hedgehog-desk": { type: "http", url } } } } } : {}) };
}));
app.get("/api/desk/wallets", deskRoute(() => desk.poolBalances()));
app.post("/api/desk/reset", deskRoute(() => {
  const done = desk.reset();
  tailedTo.set("desk.jsonl", 0); // the next desk.jsonl is a new file, read from its start
  return done;
}));
// In public mode "Your agent" exists only through a real MCP connection (/mcp below): a sign-up
// from a page is always a demo agent. MCP sign-ups are limited to 5 an hour per address.
const mcpSignUps = new Map<string, number[]>();
app.post("/api/desk/sign-up", deskRoute(async (req) => {
  const viaMcp = inside(req);
  if (PUBLIC && viaMcp) {
    const ip = req.get("x-mcp-ip") ?? "", recent = (mcpSignUps.get(ip) ?? []).filter((t) => t > Date.now() - 3600000);
    if (recent.length >= 5) throw new Error("This demo allows 5 sign-ups an hour from one address. Use the agentId you already have, or try again later.");
    mcpSignUps.set(ip, [...recent, Date.now()]);
  }
  const limit = await publicLimit("agents");
  if (limit) throw new Error(limit);
  return desk.signUp(PUBLIC && !viaMcp ? { ...(req.body ?? {}), kind: "demo" } : req.body ?? {});
}));

// The desk's six tools over MCP's Streamable HTTP transport (unit 11.1), without sessions: each
// request gets its own server, and each tool is one call to the desk's routes above.
app.post("/mcp", async (req, res) => {
  try {
    const server = deskServer(`http://127.0.0.1:${PORT}`, { "x-inside": INSIDE, "x-mcp-ip": req.ip ?? "" });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
  }
});
const noSession = (_req: express.Request, res: express.Response) => void res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null });
app.get("/mcp", noSession);
app.delete("/mcp", noSession);
app.post("/api/desk/agents/:id/check-risks", deskRoute((req) => desk.recorded(agentId(req), () => desk.checkRisks(agentId(req)))));
app.post("/api/desk/agents/:id/contracts", deskRoute((req) => desk.recorded(agentId(req), () => desk.listContracts(agentId(req)))));
app.post("/api/desk/agents/:id/quote", deskRoute((req) => desk.recorded(agentId(req), () => desk.quoteCover(agentId(req), String(req.body?.symbol), req.body?.share))));
app.post("/api/desk/agents/:id/buy", deskRoute(async (req) => {
  const limit = await publicLimit(null);
  if (limit) throw new Error(limit);
  return desk.recorded(agentId(req), () => desk.buyCover(agentId(req), String(req.body?.quoteId)));
}));
app.post("/api/desk/agents/:id/cover", deskRoute((req) => desk.recorded(agentId(req), () => desk.myCover(agentId(req)))));
// The built-in demo agent: one step ("Next"), or every step that is left ("Run"; it answers at once).
app.post("/api/desk/agents/:id/next", deskRoute(async (req) => {
  const limit = await publicLimit(null);
  if (limit) throw new Error(limit);
  return { did: await desk.runStep(agentId(req)) };
}));
app.post("/api/desk/agents/:id/run", deskRoute(async (req) => {
  const limit = await publicLimit(null);
  if (limit) throw new Error(limit);
  desk.runAll(agentId(req)).catch(() => {}); // a failed step is already on the agent's timeline
  return { started: true };
}));
// One order as a judge can open it: the ticket, and the sandbox order as Gemini's sandbox reports it now.
app.get("/api/desk/order/:quoteId", deskRoute(async (req) => {
  const order = desk.orderOf(String(req.params.quoteId));
  if (!order) throw new Error(`no order for quote ${req.params.quoteId}`);
  const now = order.sandbox.orderId ? await getOrder(order.sandbox.orderId).catch(() => null) : null;
  return { ...order, sandbox: { ...order.sandbox, ...(now ? { now } : {}) } };
}));

app.post("/stream", express.text({ type: () => true, limit: "5mb" }), streamDelivery); // the webhook on the main port (unit 11.2)
app.listen(PORT, PUBLIC ? "0.0.0.0" : "127.0.0.1", (err) => {
  // Express 5 calls this with the error when the port is taken, instead of crashing.
  if (err) throw err;
  console.log(PUBLIC ? `Public mode: listening on port ${PORT}` : `Lab running at http://localhost:${PORT}`);
});

// --- The Stream webhook: a second, separate app on its own port, with this one route.
// cloudflared tunnels only this port, so the Lab and its buttons above are never public.

const webhook = express();
// Read the body as text whatever Content-Type QuickNode sends, then parse it ourselves.
webhook.use(express.text({ type: () => true, limit: "5mb" }));

// Unit 10.3: only QuickNode's deliveries are handled. QuickNode signs each one with the Stream's
// security token (STREAM_TOKEN in the environment, else the file stream:up keeps in
// logs/stream-token.txt; never printed): the header
// X-QN-Signature is HMAC-SHA256 over nonce + timestamp + body, in hex. Returns what is wrong, or null.
function deliveryProblem(req: express.Request, payload: string) {
  let token = (process.env.STREAM_TOKEN ?? "").trim();
  try {
    if (!token) token = readFileSync("logs/stream-token.txt", "utf8").trim();
  } catch {}
  if (!token) return "no Stream is up: there is no security token to check against";
  const nonce = req.get("x-qn-nonce"), timestamp = req.get("x-qn-timestamp"), signature = req.get("x-qn-signature");
  if (!nonce || !timestamp || !signature) return "no signature headers";
  const expected = Buffer.from(createHmac("sha256", token).update(nonce + timestamp + payload).digest("hex"));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given) ? null : "bad signature";
}

webhook.post("/stream", streamDelivery);
function streamDelivery(req: express.Request, res: express.Response) {
  const payload = typeof req.body === "string" ? req.body : "";
  const problem = deliveryProblem(req, payload);
  if (problem) {
    // Rejected and recorded (the size, not the body), and nothing is acted on.
    res.sendStatus(401);
    console.log(`stream delivery rejected: ${problem}`);
    mkdirSync("logs", { recursive: true });
    appendFileSync("logs/stream.jsonl", JSON.stringify({ receivedAt: new Date().toISOString(), via: "stream", rejected: problem, bytes: payload.length }) + "\n");
    return;
  }
  res.sendStatus(200);
  let body: unknown = req.body;
  try {
    body = JSON.parse(req.body);
  } catch {}

  // The body is whatever src/stream/filter.js returned: an array of typed events.
  handleEvents(Array.isArray(body) ? body : [], "stream", body, req.get("content-type") ?? null);
}

// The hosted copy has one port: its webhook is /stream above.
if (!PUBLIC) webhook.listen(STREAM_PORT, "127.0.0.1", (err) => {
  if (err) throw err;
  console.log(`Stream webhook listening at http://localhost:${STREAM_PORT}/stream`);
});
