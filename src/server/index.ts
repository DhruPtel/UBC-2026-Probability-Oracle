// The Lab server: a local dev page for watching the chain and playing with our contracts.
// Bound to 127.0.0.1, so it is reachable from this machine only.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { GatewayClient } from "@circle-fin/x402-batching/client";
import { createGatewayMiddleware } from "@circle-fin/x402-batching/server";
import express from "express";
import { erc20Abi, formatUnits, zeroHash } from "viem";
import { runOnce, type Step } from "../agent/agent.js";
import { agentView, loadThreats } from "../agent/inputs.js";
import { paperFills } from "../agent/paper.js";
import { decide } from "../agent/policy.js";
import { addressOf, loadArtifact } from "../shared/artifacts.js";
import { getCandles, getCategories, getEvent, getEvents } from "../oracle/gemini.js";
import { probability } from "../oracle/odds.js";
import { publishOnce, refreshMarket } from "../oracle/publisher.js";
import { EXPLORER, USDC, account, publicClient, walletClient } from "../shared/chain.js";

const PORT = Number(process.env.PORT || 8787);
const app = express();
app.use(express.json());

app.get("/", (_req, res) => {
  res.sendFile("lab/index.html", { root: process.cwd() });
});

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
const configMarkets = (): ConfigMarket[] => JSON.parse(readFileSync("config/markets.json", "utf8")).markets;

app.get(
  "/odds/:symbol",
  // An unknown symbol is a 404 before any payment is asked for.
  (req, res, next) => {
    if (configMarkets().some((m) => m.symbol === req.params.symbol)) return next();
    res.status(404).json({ error: `unknown symbol ${req.params.symbol}` });
  },
  gateway.require(PRICE),
  async (req, res) => {
    try {
      const symbol = String(req.params.symbol);
      const market = configMarkets().find((m) => m.symbol === symbol)!;
      // The paid read refreshes the feed (unit 5.1): fetch live from Gemini, and publish to
      // OddsFeed if the value differs from the onchain one. txHash is null when it doesn't.
      const r = await refreshMarket(market, true);
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

// The 5 newest agent runs from logs/agent.jsonl, newest first: what triggered each, and its steps.
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
  return [...runs.entries()].slice(-5).reverse().map(([run, steps]) => ({
    run,
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
      runs: agentRuns(),
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

// --- Stream (units 3.2, 5.2, 5.3): what the QuickNode Stream has delivered. Reads local files only.

// One decoded event, exactly as src/stream/filter.js returns it.
type StreamEvent = {
  type: "oddsUpdated" | "bigMove" | "protectionBought" | "walletChange";
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
};

app.get("/api/stream", (_req, res) => {
  const streamId = existsSync("logs/stream-id.txt") ? readFileSync("logs/stream-id.txt", "utf8").trim() : null;
  // The 20 newest typed events, newest first. Lines from before unit 5.2 hold raw logs and are left out.
  const events: (StreamEvent & { receivedAt: string; txUrl: string; agentRun?: string })[] = [];
  try {
    for (const line of readFileSync("logs/stream.jsonl", "utf8").trim().split("\n").slice(-60)) {
      const d = JSON.parse(line);
      (Array.isArray(d.body) ? d.body : []).forEach((e: StreamEvent, i: number) => {
        // agentRun marks the one event that made the agent check again.
        if (e.type) events.push({ ...e, receivedAt: d.receivedAt, txUrl: `${EXPLORER}/tx/${e.tx}`, ...(d.agentRunEvent === i ? { agentRun: d.agentRun } : {}) });
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
  const events: StreamEvent[] = Array.isArray(body) ? body : [];

  // Unit 5.3: the agent re-checks on a big move of a symbol it watches, or when its wallet
  // changes. One run per delivery. The run is started here, in this process, and not awaited;
  // if one is already going, runOnce logs "skipped, run in progress".
  const watched = loadThreats().map((t) => t.symbol);
  const cause = events.find((e) => (e.type === "bigMove" && watched.includes(e.symbol ?? "")) || e.type === "walletChange");
  let trigger: string | null = null;
  if (cause?.type === "bigMove") {
    trigger = `stream: bigMove ${cause.symbol} ${cause.prevProbBps! / 100}% → ${cause.probBps! / 100}% YES`;
  } else if (cause) {
    trigger = `stream: walletChange ${cause.direction === "in" ? "+" : "−"}${formatUnits(BigInt(cause.amount!), 6)} USDC`;
  }

  mkdirSync("logs", { recursive: true });
  appendFileSync("logs/stream.jsonl", JSON.stringify({ receivedAt, contentType: req.get("content-type") ?? null, body, ...(cause && trigger ? { agentRun: trigger, agentRunEvent: events.indexOf(cause) } : {}) }) + "\n");
  console.log(`stream delivery ${receivedAt}  ${events.map((e) => e.type).join(", ") || "no typed events"}${trigger ? `  → agent run (${trigger})` : ""}`);

  if (trigger) runOnce(trigger).catch((err) => console.log(`agent run failed: ${err instanceof Error ? err.message : err}`));
});

webhook.listen(STREAM_PORT, "127.0.0.1", (err) => {
  if (err) throw err;
  console.log(`Stream webhook listening at http://localhost:${STREAM_PORT}/stream`);
});
