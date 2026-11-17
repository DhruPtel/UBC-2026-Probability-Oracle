// The Lab server: a local dev page for watching the chain and playing with our contracts.
// Bound to 127.0.0.1, so it is reachable from this machine only.
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, statSync, watch } from "node:fs";
import { GatewayClient } from "@circle-fin/x402-batching/client";
import { createGatewayMiddleware } from "@circle-fin/x402-batching/server";
import express from "express";
import { createPublicClient, erc20Abi, formatUnits, http, keccak256, parseAbi, stringToHex, zeroHash } from "viem";
import { runOnce, type Step } from "../agent/agent.js";
import { agentView, loadDemo, loadThreats, readHolding, type DemoRun } from "../agent/inputs.js";
import { demoPaperFile, paperFills, type PaperFill } from "../agent/paper.js";
import { decide } from "../agent/policy.js";
import { addressOf, loadArtifact } from "../shared/artifacts.js";
import { getCandles, getCategories, getEvent, getEvents } from "../oracle/gemini.js";
import { probability, toBps } from "../oracle/odds.js";
import { publishOnce, publishValue, refreshMarket } from "../oracle/publisher.js";
import { EXPLORER, USDC, account, asDeployer, publicClient, walletClient } from "../shared/chain.js";

const PORT = Number(process.env.PORT || 8787);
const app = express();
app.use(express.json());

app.get("/", (_req, res) => {
  res.sendFile("lab/index.html", { root: process.cwd() });
});

// The page judges watch (unit 7.2). The Lab above stays the behind-the-scenes view.
app.get("/demo", (_req, res) => {
  res.sendFile("demo/index.html", { root: process.cwd() });
});

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
  if (file !== "stream.jsonl") return [[TAILED[file], line]];
  return (Array.isArray(line.body) ? line.body : [])
    .filter((e: StreamEvent) => e.type)
    .map((e: StreamEvent) => ["stream", { ...e, receivedAt: line.receivedAt, via: line.via ?? "stream", txUrl: `${EXPLORER}/tx/${e.tx}` }]);
}

// The newest events from the logs, oldest first, in the same shape as /events sends them,
// so /demo can fill its timeline on load.
function recentEvents() {
  const all: { at: string; type: string; data: unknown }[] = [];
  for (const file of Object.keys(TAILED)) {
    if (!existsSync(`logs/${file}`)) continue;
    for (const text of readFileSync(`logs/${file}`, "utf8").trim().split("\n").filter(Boolean).slice(-40)) {
      const line = JSON.parse(text);
      const at = line.publishedAt ?? line.receivedAt ?? line.ts;
      for (const [type, data] of toEvents(file, line)) all.push({ at, type, data });
    }
  }
  return all.sort((a, b) => (a.at < b.at ? -1 : 1)).slice(-80);
}

// The page's status pills: the latest block and whether a Stream is up. Sent every 5 seconds,
// and only while a page is connected.
const streamUp = () => existsSync("logs/stream-id.txt");
setInterval(async () => {
  if (clients.size === 0) return;
  try {
    push("status", { block: Number(await publicClient.getBlockNumber()), streamUp: streamUp() });
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

    const txHash = await walletClient("DEPLOYER_KEY").writeContract({
      address,
      abi,
      functionName: "ping",
      args: [text],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
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
    const { apiUrl, categories } = await getCategories();
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
      if (config.replay?.symbol) chosen.push(config.replay.symbol);
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
    const address = addressOf("OddsFeed");
    const { abi } = loadArtifact("OddsFeed");
    const latest = await publicClient.getBlockNumber();

    let from = scannedTo === null ? BigInt(deployments.OddsFeed.block) : scannedTo + 1n;
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

app.get("/api/oracle", async (_req, res) => {
  try {
    const config = JSON.parse(readFileSync("config/markets.json", "utf8"));
    const address = addressOf("OddsFeed");
    const { abi } = loadArtifact("OddsFeed");
    await scanFeed();

    let logLines: { symbol: string }[] = [];
    try {
      logLines = readFileSync("logs/oracle.jsonl", "utf8").trim().split("\n").map((l) => JSON.parse(l));
    } catch {}

    const markets = [];
    for (const m of config.markets as { symbol: string; eventTicker: string; label: string; harmfulOutcome: string }[]) {
      const { apiUrl, event } = await getEvent(m.eventTicker);
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
    res.json({ markets, feed: address, explorer: EXPLORER });
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

type ConfigMarket = { symbol: string; eventTicker: string; label: string; harmfulOutcome: string };
// The demo replay publishes under its own symbol, so real odds are never overwritten.
const REPLAY_SYMBOL = "replay:GEMI-BTC2611302200-HI67500";
async function replayRead() {
  const o = (await publicClient.readContract({ address: addressOf("OddsFeed"), abi: loadArtifact("OddsFeed").abi, functionName: "latestBySymbol", args: [REPLAY_SYMBOL] })) as { probBps: number; round: number; sourceHash: string };
  return { ts: new Date().toISOString(), probBps: o.probBps, prevProbBps: o.probBps, method: "replay", sourceHash: o.sourceHash, round: o.round, txHash: null };
}
const configMarkets = (): ConfigMarket[] => JSON.parse(readFileSync("config/markets.json", "utf8")).markets;

app.get(
  "/odds/:symbol",
  // An unknown symbol is a 404 before any payment is asked for.
  (req, res, next) => {
    if (req.params.symbol === REPLAY_SYMBOL || configMarkets().some((m) => m.symbol === req.params.symbol)) return next();
    res.status(404).json({ error: `unknown symbol ${req.params.symbol}` });
  },
  gateway.require(PRICE),
  async (req, res) => {
    try {
      const symbol = String(req.params.symbol);
      // The paid read refreshes the feed (unit 5.1): fetch live from Gemini, and publish to
      // OddsFeed if the value differs from the onchain one. txHash is null when it doesn't.
      // The replay symbol has no live source: its paid read returns the value the demo replay
      // last published (REPLAY).
      const r = symbol === REPLAY_SYMBOL ? await replayRead() : await refreshMarket(configMarkets().find((m) => m.symbol === symbol)!, true);
      const body = {
        symbol,
        probBps: r.probBps,
        prevProbBps: r.prevProbBps,
        method: r.method,
        observedAt: r.ts,
        sourceHash: r.sourceHash,
        round: r.round,
        txHash: r.txHash,
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
    const balance = await publicClient.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [address] });
    res.json({
      ...(await agentView()),
      runs: agentRuns().slice(0, 5),
      // The newest run on the real threats, for /demo: replay runs are left out.
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
// test:demo; ReplayLendingPool watches the demo replay's symbol (unit 7.3).
const POOL_NAMES = ["DemoLendingPool", "TestLendingPool", "ReplayLendingPool"];
const deployed = (): Record<string, { address: `0x${string}`; block: number }> => JSON.parse(readFileSync("deployments/arc-testnet.json", "utf8"));
const pools = () => POOL_NAMES.filter((name) => deployed()[name]).map((name) => ({ name, address: deployed()[name].address, test: name !== "DemoLendingPool", tag: name === "TestLendingPool" ? "TEST" : name === "ReplayLendingPool" ? "REPLAY" : null }));

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
    if (demo?.status === "running" && pool.name === "ReplayLendingPool" && after.level > before.level) caption(demo, 3);
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

type Tier = { thresholdBps: number; maxLtvBps: number; paused: boolean };
const tiersOf = async (pool: `0x${string}`) =>
  (await publicClient.readContract({ address: addressOf("RiskSwitch"), abi: loadArtifact("RiskSwitch").abi, functionName: "tiersOf", args: [pool] })) as Tier[];

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

app.get("/api/advisor", async (_req, res) => {
  try {
    const spoke = { address: AAVE.mainSpoke, abi: spokeAbi } as const;
    if ((await arcMainnet.getChainId()) !== 5042) throw new Error("the RPC is not Arc mainnet (chain 5042)");

    // Find the cirBTC reserve by its token address instead of trusting a reserve number.
    const count = Number(await arcMainnet.readContract({ ...spoke, functionName: "getReserveCount" }));
    let reserveId = -1n;
    let reserve;
    for (let i = 0n; i < BigInt(count); i++) {
      const r = await arcMainnet.readContract({ ...spoke, functionName: "getReserve", args: [i] });
      if (r.underlying.toLowerCase() === AAVE.cirBTC.toLowerCase()) {
        reserveId = i;
        reserve = r;
      }
    }
    if (!reserve) throw new Error("the Main Spoke lists no cirBTC reserve");

    const config = await arcMainnet.readContract({ ...spoke, functionName: "getReserveConfig", args: [reserveId] });
    const dynamic = await arcMainnet.readContract({ ...spoke, functionName: "getDynamicReserveConfig", args: [reserveId, reserve.dynamicConfigKey] });
    const supplied = await arcMainnet.readContract({ ...spoke, functionName: "getReserveSuppliedAssets", args: [reserveId] });
    const debt = await arcMainnet.readContract({ ...spoke, functionName: "getReserveTotalDebt", args: [reserveId] });
    const hub = { address: reserve.hub, abi: hubAbi } as const;
    const caps = await arcMainnet.readContract({ ...hub, functionName: "getSpokeConfig", args: [BigInt(reserve.assetId), AAVE.mainSpoke] });
    const noCap = await arcMainnet.readContract({ ...hub, functionName: "MAX_ALLOWED_SPOKE_CAP" });
    const symbol = await arcMainnet.readContract({ address: AAVE.cirBTC, abi: erc20Abi, functionName: "symbol" });

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

    // Today's BTC harm probability from our feed, placed on the demo pool's tiers.
    const pool = pools()[0];
    const { symbol: market, harmfulSide } = await poolConfig(pool.address);
    const harm = await liveHarm(market, harmfulSide);
    const tiers = await tiersOf(pool.address);
    let level = 0;
    tiers.forEach((t, i) => { if (t.thresholdBps <= harm.harmBps) level = i; });

    // The tiers as changes to a live protocol: level 1 = −10 points, level 2 = −25 points, level 3 = freeze new borrows.
    const cutBps = [0, 1000, 2500, 0][level] ?? 0;
    const freeze = level >= 3;
    const recommended = {
      collateralFactorBps: Math.max(0, current.collateralFactorBps - cutBps),
      frozen: current.frozen || freeze,
      supplyCap: current.supplyCap,
      borrowCap: current.borrowCap,
    };
    const pc = (bps: number) => (bps / 100).toFixed(2) + "%";
    const chance = `${harm.harmBps / 100}%`;
    const reason =
      level === 0 ? `The chance that BTC ends below $67,500 on Nov 30 is ${chance}, below 50%, so no change is recommended.`
      : freeze ? `The chance that BTC ends below $67,500 on Nov 30 is ${chance}, at or above 85%, so the recommendation is to freeze new borrowing against ${symbol} until it falls.`
      : `The chance that BTC ends below $67,500 on Nov 30 is ${chance}, at or above ${tiers[level].thresholdBps / 100}%, so the recommendation is to lower the ${symbol} collateral factor by ${cutBps / 100} points.`;

    const sourceUrl = `${ARC_MAINNET_EXPLORER}/address/${AAVE.mainSpoke}`;
    const readAt = new Date().toISOString();
    const cap = (n: number | null) => (n === null ? "none" : n.toLocaleString("en-US") + " " + symbol);
    const rowText = (name: string, a: string, b: string) => `${name.padEnd(20)}${a.padEnd(18)}${b}`;
    const proposal = [
      "Proposed risk parameter update (not submitted)",
      "",
      `Protocol:  Aave V4, Main Spoke, Arc mainnet (chain 5042)`,
      `Reserve:   ${symbol} (reserve ${reserveId}, ${AAVE.cirBTC})`,
      "",
      rowText("Parameter", "Current", "Proposed"),
      rowText("Collateral factor", pc(current.collateralFactorBps), recommended.collateralFactorBps === current.collateralFactorBps ? "no change" : pc(recommended.collateralFactorBps)),
      rowText("New borrows", current.frozen ? "frozen" : "open", recommended.frozen === current.frozen ? "no change" : "frozen"),
      rowText("Supply cap", cap(current.supplyCap), "no change"),
      rowText("Borrow cap", cap(current.borrowCap), "no change"),
      "",
      `Motivation: ${reason}`,
      `Signal: Gemini prediction market ${market}, harm probability ${chance} (OddsFeed round ${harm.round} on Arc testnet), risk level ${level} of ${tiers.length - 1}.`,
      `Current values read from ${sourceUrl} at ${readAt}.`,
      "",
      ADVISOR_LABEL,
    ].join("\n");

    res.json({
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
      reason,
      proposal,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

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
  const streamId = existsSync("logs/stream-id.txt") ? readFileSync("logs/stream-id.txt", "utf8").trim() : null;
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
  res.json({ streamId, events: events.reverse().slice(0, 20) });
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
    const txHash = await walletClient("DEPLOYER_KEY").writeContract({
      address,
      abi,
      functionName: "publish",
      args: [symbol, probBps, BigInt(Math.floor(Date.now() / 1000)), zeroHash],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    res.json({ symbol, probBps, prevProbBps: current.probBps, txHash, txUrl: `${EXPLORER}/tx/${txHash}`, block: Number(receipt.blockNumber) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// What a delivery sets off: an agent run and the keeper. The Stream webhook calls this with
// `via` "stream". When the Stream is down, the demo replay calls it itself with the same event
// shape and `via` "direct": a deliberate demo fallback, labeled "direct trigger" on the pages.
function handleEvents(events: StreamEvent[], via: "stream" | "direct", body: unknown = events, contentType: string | null = null) {
  const receivedAt = new Date().toISOString();
  const pc = (bps?: number) => `${(bps ?? 0) / 100}%`;

  // Unit 5.3: the agent re-checks on a big move of a symbol it watches, or when its wallet
  // changes. One run per delivery. The run is started here, in this process, and not awaited;
  // if one is already going, runOnce logs "skipped, run in progress".
  // While a demo replay runs, only a changed replay value starts a run (of the demo threat).
  const running = demo?.status === "running" ? demo : null;
  const watched = loadThreats().map((t) => t.symbol);
  const isOdds = (e: StreamEvent) => e.type === "oddsUpdated" || e.type === "bigMove";
  const cause = running
    ? events.find((e) => isOdds(e) && e.symbol === REPLAY_SYMBOL && e.probBps !== e.prevProbBps)
    : events.find((e) => (e.type === "bigMove" && watched.includes(e.symbol ?? "")) || e.type === "walletChange");
  let trigger: string | null = null;
  if (cause && isOdds(cause)) {
    trigger = `${via}: ${cause.type} ${cause.symbol} ${pc(cause.prevProbBps)} → ${pc(cause.probBps)} YES`;
  } else if (cause) {
    trigger = `${via}: walletChange ${cause.direction === "in" ? "+" : "−"}${formatUnits(BigInt(cause.amount!), 6)} USDC`;
  }

  mkdirSync("logs", { recursive: true });
  appendFileSync("logs/stream.jsonl", JSON.stringify({ receivedAt, via, contentType, body, ...(cause && trigger ? { agentRun: trigger, agentRunEvent: events.indexOf(cause) } : {}) }) + "\n");
  console.log(`${via} delivery ${receivedAt}  ${events.map((e) => e.type).join(", ") || "no typed events"}${trigger ? `  → agent run (${trigger})` : ""}`);

  if (trigger) {
    const run: DemoRun | undefined = running ? { runId: running.runId, holding: running.holding } : undefined;
    runOnce(trigger, run)
      .then((steps) => {
        if (running && steps.some((s) => s.step === "buyProtection")) caption(running, 2);
      })
      .catch((err) => console.log(`agent run failed: ${err instanceof Error ? err.message : err}`));
  }

  // Unit 6.3, the keeper: any odds update for a pool's market syncs that pool. Pools are
  // synced one after another, so they don't skip each other.
  (async () => {
    for (const pool of pools()) {
      const { symbol } = await poolConfig(pool.address);
      const update = events.find((e) => isOdds(e) && e.symbol === symbol);
      if (update) await syncPool(pool, `${via}: ${update.type} ${symbol} ${pc(update.prevProbBps)} → ${pc(update.probBps)} YES`);
    }
  })().catch((err) => console.log(`keeper failed: ${err instanceof Error ? err.message : err}`));
}

// --- Demo replay (unit 7.3). REPLAY: the real Gemini hourly history of the BTC market
// (config/markets.json "replay"), published again on a short clock under REPLAY_SYMBOL through
// the real publisher. The demo agent and ReplayLendingPool watch that symbol, so the paid
// reads, the premium, the syncs and the Stream deliveries are all real.

const DEMO_PUBLISHES = 26; // about 3 minutes at one publish every 7 seconds
const DEMO_INTERVAL_MS = 7000;
const CAPTIONS: Record<number, string> = {
  1: "Crash odds are rising",
  2: "The odds passed 50%: the agent insures itself",
  3: "The pool tightened its loan limit",
};

type Balances = { agentWallet: number; agentGateway: number; deployer: number };
type DemoState = {
  runId: string;
  status: "running" | "done";
  via: "stream" | "direct"; // "direct" when no Stream was up at the start
  startedAt: string;
  endedAt?: string;
  from: string; // the replayed window
  to: string;
  speed: number; // how many times faster than real time
  total: number;
  path: { time: string; yesBps: number }[]; // every hourly candle in the window, for the chart
  published: { time: string; yesBps: number; txHash: string; txUrl: string }[];
  captions: { n: number; text: string; at: string }[];
  holding: DemoRun["holding"];
  needed: number; // contracts that cover the demo holding's expected loss
  poolStart?: { level: number; maxLtvBps: number; paused: boolean };
  balances: { start: Balances; end?: Balances };
  errors: number;
};
let demo: DemoState | null = null;

function demoLog(d: DemoState, step: string, detail: string, extra: Record<string, unknown> = {}) {
  appendFileSync("logs/demo.jsonl", JSON.stringify({ ts: new Date().toISOString(), runId: d.runId, step, detail, ...extra }) + "\n");
  console.log(`demo ${d.runId}  ${step}: ${detail}`);
}
function caption(d: DemoState, n: number, text = CAPTIONS[n]) {
  if (d.captions.some((c) => c.n === n)) return;
  d.captions.push({ n, text, at: new Date().toISOString() });
  demoLog(d, "caption", text, { n });
}

async function balances(): Promise<Balances> {
  const usdc = async (address: `0x${string}`) => Number(formatUnits(await publicClient.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [address] }), 6));
  const gatewayNow = await agentGateway().getBalances();
  return { agentWallet: await usdc(account("AGENT_KEY").address), agentGateway: Number(gatewayNow.gateway.formattedAvailable), deployer: await usdc(seller) };
}

app.post("/api/demo/start", async (_req, res) => {
  try {
    if (demo?.status === "running") {
      res.status(409).json({ error: "a demo run is already going" });
      return;
    }
    const cfg = JSON.parse(readFileSync("config/markets.json", "utf8")).replay as { symbol: string; from: string; to: string };
    const { candles } = await getCandles(cfg.symbol, "1hr"); // [time, open, high, low, close, volume], newest first
    const from = Date.parse(cfg.from + "T00:00:00Z");
    const to = Date.parse(cfg.to + "T00:00:00Z") + 24 * 3600 * 1000;
    const window = candles.filter((c) => c[0] >= from && c[0] < to).reverse();
    if (window.length < DEMO_PUBLISHES) throw new Error(`Gemini returned only ${window.length} hourly candles for ${cfg.from} to ${cfg.to}`);
    // Evenly spaced candles across the window, first and last included.
    const picks = Array.from({ length: DEMO_PUBLISHES }, (_, i) => window[Math.round((i * (window.length - 1)) / (DEMO_PUBLISHES - 1))]);

    const template = loadDemo();
    const holding = await readHolding(template.holding);
    const d: DemoState = {
      runId: new Date().toISOString().replace(/[-:]/g, "").slice(0, 15),
      status: "running",
      via: streamUp() ? "stream" : "direct",
      startedAt: new Date().toISOString(),
      from: cfg.from,
      to: cfg.to,
      speed: Math.round((window.at(-1)![0] - window[0][0]) / (DEMO_PUBLISHES * DEMO_INTERVAL_MS) / 100) * 100,
      total: picks.length,
      path: window.map((c) => ({ time: new Date(c[0]).toISOString(), yesBps: toBps(c[4]) })),
      published: [],
      captions: [],
      holding,
      needed: Math.ceil(Math.round(template.threat.hedgeRatio * holding.valueUsd * template.threat.shock * 1e6) / 1e6),
      balances: { start: await balances() },
      errors: 0,
    };
    demo = d;
    demoLog(d, "start", `replaying ${picks.length} of ${window.length} real hourly candles, ${cfg.from} to ${cfg.to}; ${d.via === "stream" ? "triggers come through the Stream" : "Stream is down: triggers run directly"}`, { via: d.via });
    res.json(await demoView());

    runDemo(d, picks).catch((err) => {
      demoLog(d, "error", err instanceof Error ? err.message : String(err));
      d.status = "done";
      d.endedAt = new Date().toISOString();
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

async function runDemo(d: DemoState, picks: number[][]) {
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
  for (let i = 0; i < picks.length; i++) {
    const started = Date.now();
    const candle = picks[i];
    // The pool's limit before the story starts: read once the first value has been synced.
    if (i === 1) d.poolStart = await poolParams(addressOf("ReplayLendingPool"));
    if (i === 1) caption(d, 1);
    try {
      const current = await replayRead();
      // Each publish carries the hash of the candle it came from.
      const line = await publishValue(
        { ts: new Date(candle[0]).toISOString(), symbol: REPLAY_SYMBOL, probBps: toBps(candle[4]), prevProbBps: current.probBps, method: "replay", sourceHash: keccak256(stringToHex(JSON.stringify(candle))) },
        current.round,
      );
      d.published.push({ time: line.ts, yesBps: line.probBps, txHash: line.txHash, txUrl: `${EXPLORER}/tx/${line.txHash}` });
      demoLog(d, "publish", `${i + 1} of ${picks.length}: ${line.ts.slice(0, 13)}h was ${line.probBps / 100}% YES`, { txHash: line.txHash });
      if (d.via === "direct") {
        const type = Math.abs(line.probBps - current.probBps) >= 500 ? "bigMove" : "oddsUpdated";
        handleEvents([{ type, symbol: REPLAY_SYMBOL, probBps: line.probBps, prevProbBps: current.probBps, round: line.round, block: line.block, time: Math.floor(Date.now() / 1000), tx: line.txHash }], "direct");
      }
    } catch (err) {
      d.errors++;
      demoLog(d, "error", `publish ${i + 1} failed: ${(err instanceof Error ? err.message : String(err)).split("\n")[0]}`);
    }
    await sleep(DEMO_INTERVAL_MS - (Date.now() - started));
  }
  await sleep(8000); // let the last agent run and sync finish
  const pool = await poolParams(addressOf("ReplayLendingPool"));
  if (d.captions.some((c) => c.n === 2) && d.captions.some((c) => c.n === 3)) {
    caption(d, 4, pool.paused ? "Fully insured; the pool has paused borrowing" : `Fully insured; the pool's loan limit is down to ${pool.maxLtvBps / 100}%`);
  }
  d.balances.end = await balances();
  d.status = "done";
  d.endedAt = new Date().toISOString();
  demoLog(d, "end", "the replay finished");
}

// Everything /demo needs about the replay: the run's state, the demo agent's cover, the
// replay pool, and a summary with the exact cost once the run is done.
async function demoView() {
  if (!demo) return null;
  const d = demo;
  const fills = paperFills(demoPaperFile(d.runId));
  const pool = await poolParams(addressOf("ReplayLendingPool"));
  const reads = paymentLines().filter((p) => p.symbol === REPLAY_SYMBOL && p.ts >= d.startedAt && (!d.endedAt || p.ts <= d.endedAt));
  const b = d.balances;
  const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
  const premium = round6(fills.reduce((sum, f) => sum + f.premiumUsdc, 0));
  return {
    ...d,
    symbol: REPLAY_SYMBOL,
    label: "REPLAY",
    threat: loadDemo().threat,
    covered: fills.reduce((sum, f) => sum + f.contracts, 0),
    fills: fills.map((f) => ({ ...f, txUrl: `${EXPLORER}/tx/${f.txHash}` })),
    pool,
    reads: reads.length,
    summary: b.end
      ? {
          startYesBps: d.published[0]?.yesBps ?? null,
          endYesBps: d.published.at(-1)?.yesBps ?? null,
          premiumUsdc: premium,
          readsUsdc: round6(b.start.agentGateway - b.end.agentGateway),
          agentGasUsdc: round6(b.start.agentWallet - b.end.agentWallet - premium),
          // The deployer receives the premium (it is the treasury) and pays for publishes and syncs.
          deployerGasUsdc: round6(b.start.deployer + premium - b.end.deployer),
        }
      : null,
  };
}

type PaymentLine = { ts: string; symbol: string; amount: string | null; probBps: number | null; run: string | null };
const paymentLines = (): PaymentLine[] => {
  try {
    return readFileSync("logs/payments.jsonl", "utf8").trim().split("\n").map((l) => JSON.parse(l));
  } catch {
    return [];
  }
};

// The first load of /demo: chain reads and local logs only (no Gemini), so it is quick.
app.get("/api/demo", async (_req, res) => {
  try {
    const feed = { address: addressOf("OddsFeed"), abi: loadArtifact("OddsFeed").abi } as const;
    const threats = loadThreats();
    const markets = [];
    for (const m of configMarkets()) {
      const o = (await publicClient.readContract({ ...feed, functionName: "latestBySymbol", args: [m.symbol] })) as { probBps: number; round: number; publishedAt: bigint };
      const threat = threats.find((t) => t.symbol === m.symbol);
      markets.push({
        symbol: m.symbol,
        label: m.label,
        risk: threat?.risk ?? m.label,
        harmfulOutcome: m.harmfulOutcome,
        trigger: threat?.trigger ?? null,
        yesBps: o.probBps,
        harmBps: m.harmfulOutcome === "YES" ? o.probBps : 10000 - o.probBps,
        round: o.round,
        publishedAt: Number(o.publishedAt),
      });
    }

    // Money: every paid read and every premium, from the logs. Demo runs keep their own fill files.
    const reads = paymentLines();
    const fills: (PaperFill & { label?: string })[] = [...paperFills()];
    for (const file of readdirSync("logs").filter((f) => f.startsWith("paper-demo-"))) fills.push(...paperFills(`logs/${file}`));
    const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
    const last = [
      ...reads.map((r) => ({ ts: r.ts, kind: "read", usdc: Number(r.amount ?? 0), replay: r.symbol === REPLAY_SYMBOL, txUrl: null as string | null, contracts: 0 })),
      ...fills.map((f) => ({ ts: f.ts, kind: "premium", usdc: f.premiumUsdc, replay: f.label === "REPLAY", txUrl: `${EXPLORER}/tx/${f.txHash}`, contracts: f.contracts })),
    ].sort((a, b) => (a.ts < b.ts ? 1 : -1)).slice(0, 6);

    const deployments = deployed();
    res.json({
      status: { block: Number(await publicClient.getBlockNumber()), streamUp: streamUp() },
      markets,
      money: {
        reads: { count: reads.length, usdc: round6(reads.reduce((sum, r) => sum + Number(r.amount ?? 0), 0)) },
        premiums: { count: fills.length, usdc: round6(fills.reduce((sum, f) => sum + f.premiumUsdc, 0)) },
        last,
      },
      contracts: Object.entries(deployments).map(([name, c]) => ({ name, address: c.address, explorerUrl: `${EXPLORER}/address/${c.address}` })),
      replay: await demoView(),
      recent: recentEvents(),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.listen(PORT, "127.0.0.1", (err) => {
  // Express 5 calls this with the error when the port is taken, instead of crashing.
  if (err) throw err;
  console.log(`Lab running at http://localhost:${PORT}`);
});

// --- The Stream webhook: a second, separate app on its own port, with this one route.
// cloudflared tunnels only this port, so the Lab and its buttons above are never public.

const STREAM_PORT = Number(process.env.STREAM_PORT || 8788);
const webhook = express();
// Read the body as text whatever Content-Type QuickNode sends, then parse it ourselves.
webhook.use(express.text({ type: () => true, limit: "5mb" }));

webhook.post("/stream", (req, res) => {
  res.sendStatus(200);
  const receivedAt = new Date().toISOString();
  let body: unknown = req.body;
  try {
    body = JSON.parse(req.body);
  } catch {}

  // The body is whatever src/stream/filter.js returned: an array of typed events.
  handleEvents(Array.isArray(body) ? body : [], "stream", body, req.get("content-type") ?? null);
});

webhook.listen(STREAM_PORT, "127.0.0.1", (err) => {
  if (err) throw err;
  console.log(`Stream webhook listening at http://localhost:${STREAM_PORT}/stream`);
});
