// The Lab server: a local dev page for watching the chain and playing with our contracts.
// Bound to 127.0.0.1, so it is reachable from this machine only.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { GatewayClient } from "@circle-fin/x402-batching/client";
import { createGatewayMiddleware } from "@circle-fin/x402-batching/server";
import express from "express";
import { erc20Abi, formatUnits } from "viem";
import { runOnce } from "../agent/agent.js";
import { agentView } from "../agent/inputs.js";
import { paperFills } from "../agent/paper.js";
import { decide } from "../agent/policy.js";
import { addressOf, loadArtifact } from "../shared/artifacts.js";
import { getCandles, getCategories, getEvent, getEvents } from "../oracle/gemini.js";
import { probability, toBps } from "../oracle/odds.js";
import { publishOnce } from "../oracle/publisher.js";
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
      const { event } = await getEvent(market.eventTicker);
      const contract = event.contracts.find((c) => c.instrumentSymbol === symbol);
      const odds = probability(contract ?? {});
      const body = {
        symbol,
        prob: odds.prob,
        probBps: odds.prob === null ? null : toBps(odds.prob),
        method: odds.method,
        bid: contract?.prices?.bestBid ?? null,
        ask: contract?.prices?.bestAsk ?? null,
        observedAt: new Date().toISOString(),
        source: "Gemini (live)",
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

app.get("/api/agent", async (_req, res) => {
  try {
    const { address } = account("AGENT_KEY");
    const balance = await publicClient.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [address] });
    res.json({
      ...(await agentView()),
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
    const steps = await runOnce();
    res.json({ steps: steps.map((s) => (s.txHash ? { ...s, txUrl: `${EXPLORER}/tx/${s.txHash}` } : s)) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// The what-if slider: decide() on whatever inputs the page sends. No chain, no Gemini.
app.post("/api/agent/whatif", (req, res) => {
  res.json(decide(req.body));
});

// --- Stream (unit 3.2): what the QuickNode Stream has delivered. Reads local files only.

app.get("/api/stream", (_req, res) => {
  const streamId = existsSync("logs/stream-id.txt") ? readFileSync("logs/stream-id.txt", "utf8").trim() : null;
  let deliveries: unknown[] = [];
  try {
    deliveries = readFileSync("logs/stream.jsonl", "utf8").trim().split("\n").slice(-20).reverse().map((l) => JSON.parse(l));
  } catch {}
  res.json({
    streamId,
    deliveries,
    contracts: { [addressOf("OddsFeed").toLowerCase()]: "OddsFeed", [addressOf("Hello").toLowerCase()]: "Hello" },
  });
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
  mkdirSync("logs", { recursive: true });
  appendFileSync("logs/stream.jsonl", JSON.stringify({ receivedAt, contentType: req.get("content-type") ?? null, body }) + "\n");

  // The body is whatever src/stream/filter.js returned: a flat array of logs.
  const logs: { blockNumber?: string }[] = Array.isArray(body) ? body : [];
  const blocks = [...new Set(logs.map((log) => Number(log.blockNumber)))];
  console.log(`stream delivery ${receivedAt}  block ${blocks.join(", ") || "?"}  ${logs.length} log(s)`);
});

webhook.listen(STREAM_PORT, "127.0.0.1", (err) => {
  if (err) throw err;
  console.log(`Stream webhook listening at http://localhost:${STREAM_PORT}/stream`);
});
