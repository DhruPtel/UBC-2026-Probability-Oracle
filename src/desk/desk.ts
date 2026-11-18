// The agent insurance desk (units 8.0d to 8.0f). One desk, two ways in: a demo agent made on
// the Agents page (our built-in agent walks it through), or your own agent over MCP
// (src/desk/mcp.ts). Both call the same functions here, through the Lab server's /api/desk routes.
//
// An agent signs up with a DECLARED HOLDING in dollars and gets one of a small pool of reusable
// Arc testnet wallets (keys derived from DESK_SEED; they never leave this process). It pays
// $0.001 per odds read over x402, browses Gemini's live contracts, gets a quote and buys cover:
// the premium is real testnet USDC through ProtectionBook, the Gemini order is an ORDER TICKET
// (the exact body that would be sent, at the live production price; not sent), and the same
// order goes to Gemini's SANDBOX when the sandbox lists that contract.
// No budgets, maximum prices or approvals here: those are the guardrails phase (8.1 to 8.3).
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { GatewayClient } from "@circle-fin/x402-batching/client";
import { createWalletClient, erc20Abi, formatUnits, http, keccak256, parseUnits, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "viem/chains";
import type { PaidOdds } from "../agent/inputs.js";
import { listEvents, placeLimitBuy, type SandboxContract } from "../agent/trade.js";
import { getEvent, getSpot } from "../oracle/gemini.js";
import { probability, toBps } from "../oracle/odds.js";
import { addressOf, loadArtifact } from "../shared/artifacts.js";
import { EXPLORER, USDC, account, asDeployer, deskKey, publicClient, walletClient } from "../shared/chain.js";
import { coverFor, premiumUnits, takerFee, type Terms } from "./cover.js";

const config: {
  poolSize: number;
  walletFloorUsdc: number;
  walletTopUpUsdc: number;
  gatewayFloorUsdc: number;
  gatewayDepositUsdc: number;
  risksPerCheck: number;
  assets: Record<string, Terms & { spotPair: string }>;
} = JSON.parse(readFileSync("src/desk/desk.json", "utf8"));

// The live feed's markets, handed over by the server (it reads Gemini every minute).
export type DeskMarket = {
  symbol: string;
  eventTicker: string;
  label: string;
  expiry: string;
  asset: string | null;
  yesBps: number;
  buyYes: number | null;
  buyNo: number | null;
  bad: { side: "YES" | "NO"; risk: string } | null;
};
let feedMarkets: () => DeskMarket[] = () => [];
export const useFeed = (read: () => DeskMarket[]) => void (feedMarkets = read);

export type Agent = {
  id: string;
  kind: "demo" | "yours";
  name: string;
  asset: string;
  valueUsd: number; // the DECLARED HOLDING, in dollars
  amount: number; // the same in coins, at Gemini's spot price at sign-up
  spotUsd: number;
  walletIndex: number;
  wallet: `0x${string}`;
  createdAt: string;
};
type StepName = "sign_up" | "check_risks" | "list_contracts" | "quote_cover" | "buy_cover" | "my_cover" | "error";
export type Line = { ts: string; agent: string; step: StepName; detail: string; txHash?: string; paymentId?: string; data?: any };
type Quote = {
  id: string;
  agent: string;
  symbol: string;
  risk: string;
  side: "YES" | "NO";
  chanceBps: number;
  contracts: number;
  price: number;
  premiumUsdc: number;
  feeUsd: number;
  payoutUsd: number;
  quotedAt: string;
  ticket: Ticket;
};
// The body of POST /v1/prediction-markets/order, as Gemini's trading reference defines it.
type Ticket = { symbol: string; orderType: "limit"; side: "buy"; outcome: "yes" | "no"; quantity: string; price: string; timeInForce: "good-til-cancel" };

// --- The record: every step is a line in logs/desk.jsonl. The server pushes each new line to
// the pages as a `desk` event. Agents and quotes are read back from it after a restart.
const FILE = "logs/desk.jsonl";
const lines: Line[] = existsSync(FILE) ? readFileSync(FILE, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
const agents: Agent[] = lines.filter((l) => l.step === "sign_up" && l.data?.agent).map((l) => l.data.agent);

function log(agent: string, step: StepName, detail: string, extra: Partial<Line> = {}) {
  const line: Line = { ts: new Date().toISOString(), agent, step, detail, ...extra };
  lines.push(line);
  mkdirSync("logs", { recursive: true });
  appendFileSync(FILE, JSON.stringify(line) + "\n");
  return line;
}
const message = (err: unknown) => (err instanceof Error ? err.message : String(err)).split("\n")[0];
const usd = (n: number) => "$" + n.toFixed(2);
const pct = (bps: number) => bps / 100 + "%";
const of = (id: string) => {
  const agent = agents.find((a) => a.id === id);
  if (!agent) throw new Error(`no agent ${id}: sign up first`);
  return agent;
};
const mine = (id: string, step: StepName) => lines.filter((l) => l.agent === id && l.step === step);
const orders = (id?: string) => lines.filter((l) => l.step === "buy_cover" && l.data?.order && (!id || l.agent === id)).map((l) => ({ ...l.data.order, at: l.ts, agent: l.agent, txUrl: `${EXPLORER}/tx/${l.txHash}` }));
const held = (id: string, symbol: string) => orders(id).filter((o) => o.symbol === symbol).reduce((n, o) => n + o.contracts, 0);

// --- Wallets. One step at a time per wallet: two sends at once would collide on its nonce.
const turns = new Map<number, Promise<unknown>>();
function turn<T>(index: number, work: () => Promise<T>): Promise<T> {
  const next = (turns.get(index) ?? Promise.resolve()).then(work, work);
  turns.set(index, next.catch(() => {}));
  return next;
}
const gatewayOf = (index: number) => new GatewayClient({ chain: "arcTestnet", privateKey: deskKey(index), rpcUrl: process.env.ARC_RPC_URL });
const walletOf = (index: number) => createWalletClient({ account: privateKeyToAccount(deskKey(index)), chain: arcTestnet, transport: http(process.env.ARC_RPC_URL) });
const usdcOf = (address: `0x${string}`) => publicClient.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [address] });

// Test USDC from the deployer, which is also the treasury that receives every premium: the money cycles.
async function topUp(to: `0x${string}`, units: bigint) {
  const treasury = await usdcOf(account("DEPLOYER_KEY").address);
  if (treasury < units) throw new Error(`the desk's treasury holds ${formatUnits(treasury, 6)} test USDC, and this needs ${formatUnits(units, 6)}`);
  return asDeployer(async () => {
    const txHash = await walletClient("DEPLOYER_KEY").writeContract({ address: USDC, abi: erc20Abi, functionName: "transfer", args: [to, units] });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") throw new Error(`the top-up reverted: ${txHash}`);
    return txHash;
  });
}

// A pool wallet is ready when it holds some USDC for gas and a Gateway balance for paid reads.
// A wallet that was used before usually is, so signing up again costs nothing.
async function makeReady(agent: Agent) {
  const client = gatewayOf(agent.walletIndex);
  let b = await client.getBalances();
  const depositing = Number(b.gateway.formattedAvailable) < config.gatewayFloorUsdc;
  if (Number(b.wallet.formatted) < config.walletFloorUsdc + (depositing ? config.gatewayDepositUsdc : 0)) {
    const txHash = await topUp(agent.wallet, parseUnits(String(config.walletTopUpUsdc), 6));
    log(agent.id, "sign_up", `The treasury sent its wallet ${config.walletTopUpUsdc} test USDC.`, { txHash });
  }
  if (depositing) {
    const before = b.gateway.available;
    const deposit = await client.deposit(String(config.gatewayDepositUsdc));
    log(agent.id, "sign_up", `The wallet put ${config.gatewayDepositUsdc} USDC into Circle Gateway.`, { txHash: deposit.depositTxHash });
    // Gateway credits the deposit a few seconds after the transaction confirms.
    for (let i = 0; i < 30 && b.gateway.available === before; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      b = await client.getBalances();
    }
  }
  b = await client.getBalances();
  return { walletUsdc: Number(b.wallet.formatted), gatewayUsdc: Number(b.gateway.formattedAvailable) };
}

// --- 1. Sign up: a name, an asset and a holding in dollars.
export async function signUp(input: { kind?: string; name?: string; asset?: string; holdingUsd?: number }) {
  const asset = String(input.asset ?? "").toUpperCase(), terms = config.assets[asset];
  if (!terms) throw new Error(`asset must be one of: ${Object.keys(config.assets).join(", ")}`);
  const valueUsd = Math.round(Number(input.holdingUsd) * 100) / 100;
  if (!(valueUsd > 0)) throw new Error("holdingUsd must be a dollar amount above 0");
  const spotUsd = (await getSpot(terms.spotPair)).last;

  const n = agents.length, walletIndex = n % config.poolSize, kind = input.kind === "yours" ? "yours" : "demo";
  const agent: Agent = {
    id: `a${n + 1}`,
    kind,
    name: String(input.name || (kind === "demo" ? `Demo agent ${n + 1}` : `Agent ${n + 1}`)).slice(0, 40),
    asset,
    valueUsd,
    amount: Number((valueUsd / spotUsd).toPrecision(4)),
    spotUsd,
    walletIndex,
    wallet: privateKeyToAccount(deskKey(walletIndex)).address,
    createdAt: new Date().toISOString(),
  };
  agents.push(agent);
  log(agent.id, "sign_up", `Signed up holding ${usd(valueUsd)} of ${asset} (${agent.amount} ${asset}, declared)`, { data: { agent } });
  const balances = await turn(walletIndex, () => makeReady(agent));
  log(agent.id, "sign_up", `Wallet ready on Arc testnet: ${balances.walletUsdc.toFixed(2)} test USDC, ${balances.gatewayUsdc.toFixed(3)} in Gateway for paid reads`, { data: { balances } });
  return { agentId: agent.id, name: agent.name, holding: { asset, valueUsd, amount: agent.amount, label: "DECLARED HOLDING" }, wallet: agent.wallet, walletUrl: `${EXPLORER}/address/${agent.wallet}`, network: "Arc testnet", ...balances };
}

// --- 2. Check risks: a paid read ($0.001 over x402, from the agent's wallet) for each of the
// markets that match the holding, the most uncertain ones first.
const chanceOf = (m: DeskMarket, yesBps = m.yesBps) => (m.bad!.side === "NO" ? 10000 - yesBps : yesBps);
const matching = (agent: Agent) => feedMarkets().filter((m) => m.asset === agent.asset && m.bad);

export async function checkRisks(id: string) {
  const agent = of(id);
  // The markets that run longest (cover through month end), and of those the most uncertain.
  const latest = matching(agent).map((m) => m.expiry).sort().at(-1);
  const markets = matching(agent).filter((m) => m.expiry === latest).sort((a, b) => Math.abs(chanceOf(a) - 5000) - Math.abs(chanceOf(b) - 5000)).slice(0, config.risksPerCheck);
  if (!markets.length) throw new Error(`the live feed has no ${agent.asset} price market right now`);
  return turn(agent.walletIndex, async () => {
    const client = gatewayOf(agent.walletIndex), risks = [];
    for (const m of markets) {
      const paid = await client.pay<PaidOdds>(`http://127.0.0.1:${process.env.PORT || 8787}/odds/${encodeURIComponent(m.symbol)}?source=feed&run=${encodeURIComponent("desk:" + id)}`);
      if (paid.data.probBps === null) continue;
      const risk = { symbol: m.symbol, risk: m.bad!.risk, chanceBps: chanceOf(m, paid.data.probBps), round: paid.data.round, paidUsdc: paid.formattedAmount, paymentId: paid.transaction };
      risks.push(risk);
      log(id, "check_risks", `Paid ${paid.formattedAmount} USDC over x402: chance ${risk.risk} is ${pct(risk.chanceBps)}`, { paymentId: paid.transaction, data: { risk } });
    }
    return { paidUsdc: (risks.length * 0.001).toFixed(3), risks };
  });
}

// --- 3. Browse: every live Gemini contract that matches the holding, with what covering the
// expected loss on it would take. Free: Gemini's prices as the feed read them within the last minute.
export function listContracts(id: string) {
  const agent = of(id), terms = config.assets[agent.asset];
  const rows = matching(agent)
    .flatMap((m) => {
      const price = m.bad!.side === "NO" ? m.buyNo : m.buyYes;
      if (price === null) return [];
      const c = coverFor({ valueUsd: agent.valueUsd, terms, yesBps: m.yesBps, side: m.bad!.side, price, held: held(id, m.symbol) });
      return [{ symbol: m.symbol, risk: m.bad!.risk, expiry: m.expiry.slice(0, 10), side: m.bad!.side, price, ...c }];
    })
    .sort((a, b) => b.expiry.localeCompare(a.expiry) || b.chanceBps - a.chanceBps);
  if (!rows.length) throw new Error(`the live feed has no ${agent.asset} contract with a price right now`);
  const expectedLossUsd = Math.round(agent.valueUsd * terms.shock * 100) / 100;
  log(id, "list_contracts", `Browsed ${rows.length} live ${agent.asset} contracts on Gemini: ${rows[0].needed} contracts cover the expected loss of ${usd(expectedLossUsd)}`, { data: { rows } });
  return { holdingUsd: agent.valueUsd, expectedLossUsd, expectedLossRule: `${terms.shock * 100}% of the holding`, ruleTrigger: pct(terms.trigger * 10000), contracts: rows };
}

// --- 4. Quote: one contract at Gemini's live price, read now, with the exact order it would be.
export async function quoteCover(id: string, symbol: string, share?: number) {
  const agent = of(id), m = matching(agent).find((x) => x.symbol === symbol);
  if (!m) throw new Error(`${symbol} is not a live contract that matches a ${agent.asset} holding: use list_contracts`);
  if (share !== undefined && !(share > 0 && share <= 1)) throw new Error("share is how much of the expected loss to cover: above 0, at most 1");
  const side = m.bad!.side;
  const contract = (await getEvent(m.eventTicker)).event.contracts.find((c) => c.instrumentSymbol === symbol);
  const text = side === "NO" ? contract?.prices?.buy?.no : contract?.prices?.buy?.yes, odds = contract ? probability(contract) : null;
  if (!contract || text === undefined || !odds || odds.prob === null) throw new Error(`Gemini has no price to buy ${side} on ${symbol} right now`);
  const price = Number(text);
  const c = coverFor({ valueUsd: agent.valueUsd, terms: config.assets[agent.asset], yesBps: toBps(odds.prob), side, price, held: held(id, symbol), share });
  if (c.contracts <= 0) throw new Error(`already covered: this agent holds ${held(id, symbol)} ${side} on ${symbol}`);
  const quote: Quote = {
    id: `q${lines.filter((l) => l.step === "quote_cover").length + 1}`,
    agent: id,
    symbol,
    risk: m.bad!.risk,
    side,
    chanceBps: c.chanceBps,
    contracts: c.contracts,
    price,
    premiumUsdc: c.premiumUsdc,
    feeUsd: c.feeUsd,
    payoutUsd: c.payoutUsd,
    quotedAt: new Date().toISOString(),
    ticket: { symbol, orderType: "limit", side: "buy", outcome: side === "NO" ? "no" : "yes", quantity: String(c.contracts), price: price.toFixed(2), timeInForce: "good-til-cancel" },
  };
  log(id, "quote_cover", `Quote ${quote.id}: ${quote.contracts} ${side} on “${quote.risk}” at ${usd(price)} is a ${usd(quote.premiumUsdc)} premium and pays ${usd(quote.payoutUsd)} if it happens. Gemini's fee would be ${usd(quote.feeUsd)}`, { data: { quote } });
  return { ...quote, quoteId: quote.id, costPerDollarOfPayout: price, ruleSays: c.action === "buy" ? "buy: the chance is at or above the trigger" : "hold: the chance is below the trigger" };
}

// --- 5. Buy: the premium onchain, the order ticket, and the same order in Gemini's sandbox.
let sandbox: { at: number; contracts: Map<string, SandboxContract> } | null = null;
async function sandboxOrder(q: Quote) {
  if (!process.env.GEMINI_SANDBOX_API_KEY || !process.env.GEMINI_SANDBOX_API_SECRET) return { status: "not sent", note: "no sandbox key in .env" };
  try {
    // What the sandbox lists changes from day to day; the list is kept for 10 minutes.
    if (!sandbox || Date.now() - sandbox.at > 600000) sandbox = { at: Date.now(), contracts: new Map((await listEvents()).flatMap((e) => e.contracts).map((c) => [c.instrumentSymbol, c])) };
    if (!sandbox.contracts.has(q.symbol)) return { status: "not listed", note: "Gemini's sandbox does not list this contract today" };
    const o = await placeLimitBuy({ symbol: q.symbol, outcome: q.ticket.outcome, price: q.ticket.price, quantity: q.ticket.quantity, clientOrderId: `desk-${q.id}-${Date.now()}`, timeInForce: q.ticket.timeInForce });
    return { status: o.status, orderId: o.orderId, filledQuantity: o.filledQuantity ?? "0", avgExecutionPrice: o.avgExecutionPrice ?? null };
  } catch (err) {
    return { status: "refused", note: message(err) };
  }
}

export async function buyCover(id: string, quoteId: string) {
  const agent = of(id), q: Quote | undefined = mine(id, "quote_cover").find((l) => l.data?.quote?.id === quoteId)?.data.quote;
  if (!q) throw new Error(`no quote ${quoteId} for agent ${id}: call quote_cover first`);
  if (orders(id).some((o) => o.quoteId === quoteId)) throw new Error(`quote ${quoteId} is already bought`);
  return turn(agent.walletIndex, async () => {
    const premium = premiumUnits(q.contracts, q.price), wallet = walletOf(agent.walletIndex), book = addressOf("ProtectionBook");
    // The wallet needs the premium and a little for gas. The premium goes to the treasury, so
    // topping the wallet up from the treasury first spends only gas.
    const balance = await usdcOf(agent.wallet);
    if (balance < premium + 50000n) {
      const units = premium + 150000n - balance;
      const txHash = await topUp(agent.wallet, units);
      log(id, "buy_cover", `The treasury lent the wallet ${formatUnits(units, 6)} test USDC; the premium returns to it.`, { txHash });
    }
    const approveTx = await wallet.writeContract({ address: USDC, abi: erc20Abi, functionName: "approve", args: [book, premium] });
    if ((await publicClient.waitForTransactionReceipt({ hash: approveTx })).status !== "success") throw new Error(`approve reverted: ${approveTx}`);
    const orderRef = keccak256(toHex(`${q.symbol}:${id}:${Date.now()}`));
    const buyTx = await wallet.writeContract({ address: book, abi: loadArtifact("ProtectionBook").abi, functionName: "buyProtection", args: [q.symbol, q.side === "YES" ? 0 : 1, q.contracts, premium, orderRef] });
    if ((await publicClient.waitForTransactionReceipt({ hash: buyTx })).status !== "success") throw new Error(`buyProtection reverted: ${buyTx}`);

    const order = {
      quoteId,
      orderRef,
      symbol: q.symbol,
      risk: q.risk,
      side: q.side,
      contracts: q.contracts,
      price: q.price,
      premiumUsdc: q.premiumUsdc,
      feeUsd: q.feeUsd,
      payoutUsd: q.payoutUsd,
      ticket: { label: "ORDER TICKET: not sent. The body of POST https://api.gemini.com/v1/prediction-markets/order at Gemini's live price", body: q.ticket },
      sandbox: { label: "SANDBOX: the same order on api.sandbox.gemini.com, test funds, its own prices", ...(await sandboxOrder(q)) },
    };
    const walletUsdc = Number(formatUnits(await usdcOf(agent.wallet), 6));
    log(id, "buy_cover", `Paid a ${usd(q.premiumUsdc)} USDC premium through ProtectionBook for ${q.contracts} ${q.side} on “${q.risk}”.`, { txHash: buyTx, data: { order, balances: { walletUsdc } } });
    return { ...order, premiumTx: `${EXPLORER}/tx/${buyTx}`, orderUrl: `/api/desk/order/${quoteId}` };
  });
}

// --- 6. My cover: what the agent holds, from its purchases.
export function myCover(id: string) {
  const agent = of(id), bought = orders(id);
  const total = (pick: (o: any) => number) => Math.round(bought.reduce((n, o) => n + pick(o), 0) * 100) / 100;
  const cover = {
    holding: { asset: agent.asset, valueUsd: agent.valueUsd, amount: agent.amount, label: "DECLARED HOLDING" },
    contracts: total((o) => o.contracts),
    paidUsdc: total((o) => o.premiumUsdc),
    payoutUsd: total((o) => o.payoutUsd),
    positions: bought.map((o) => ({ symbol: o.symbol, risk: o.risk, side: o.side, contracts: o.contracts, price: o.price, premiumUsdc: o.premiumUsdc, paysUsd: o.payoutUsd, premiumTx: o.txUrl, sandbox: o.sandbox.status })),
  };
  log(id, "my_cover", bought.length ? `Holds ${cover.contracts} contracts: paid ${usd(cover.paidUsdc)}, receives ${usd(cover.payoutUsd)} if ${bought.map((o) => o.risk).join(", or if ")}` : "Holds no cover", { data: { cover } });
  return cover;
}

// --- The built-in demo agent (unit 8.0f): the same steps, one at a time. Its rule is the
// agent's own (policy.ts, through coverFor): only contracts whose chance is at or above the
// trigger count; of those it prefers the latest expiry (cover through month end), then the
// cheapest per $1 of payout.
const STEPS = ["check_risks", "list_contracts", "quote_cover", "buy_cover", "my_cover"] as const;
const busy = new Set<string>();
function nextStep(id: string) {
  const quotes = mine(id, "quote_cover");
  return STEPS.find((s) => (s === "buy_cover" ? quotes.length > 0 && quotes.at(-1)!.data?.quote && !orders(id).length : !mine(id, s).length)) ?? null;
}
export async function runStep(id: string) {
  of(id);
  const step = nextStep(id);
  if (!step) return null;
  if (busy.has(id)) throw new Error("this agent is in the middle of a step");
  busy.add(id);
  try {
    if (step === "check_risks") await checkRisks(id);
    if (step === "list_contracts") listContracts(id);
    if (step === "quote_cover") {
      const rows: { symbol: string; action: string; price: number; expiry: string }[] = mine(id, "list_contracts").at(-1)!.data.rows;
      const pick = rows.filter((r) => r.action === "buy").sort((a, b) => b.expiry.localeCompare(a.expiry) || a.price - b.price)[0];
      if (pick) await quoteCover(id, pick.symbol);
      else log(id, "quote_cover", `No contract's chance is at or above the ${pct(config.assets[of(id).asset].trigger * 10000)} trigger: the agent holds and buys nothing`);
    }
    if (step === "buy_cover") await buyCover(id, mine(id, "quote_cover").at(-1)!.data.quote.id);
    if (step === "my_cover") myCover(id);
    return step;
  } catch (err) {
    log(id, "error", message(err));
    throw err;
  } finally {
    busy.delete(id);
  }
}
export async function runAll(id: string) {
  while (await runStep(id)) {} // the page shows the steps one at a time, about 3 s each
}
// A step asked for by an outside agent: a failure is also written to its timeline.
export async function recorded<T>(id: string, work: () => T | Promise<T>) {
  try {
    return await work();
  } catch (err) {
    if (agents.some((a) => a.id === id)) log(id, "error", message(err));
    throw err;
  }
}

// --- What the Agents page shows.
const withLinks = (l: Line) => ({ ...l, ...(l.txHash ? { txUrl: `${EXPLORER}/tx/${l.txHash}` } : {}), ...(l.paymentId ? { paymentUrl: `https://gateway-api-testnet.circle.com/v1/x402/transfers/${l.paymentId}` } : {}) });
export function deskView() {
  const bought = orders(), contracts = bought.reduce((n, o) => n + o.contracts, 0), volume = bought.reduce((n, o) => n + o.contracts * o.price, 0);
  const tsx = `${process.cwd()}/node_modules/.bin/tsx`, server = `${process.cwd()}/src/desk/mcp.ts`;
  return {
    assets: Object.fromEntries(Object.entries(config.assets).map(([asset, t]) => [asset, { shock: t.shock, trigger: t.trigger }])),
    agents: agents.map((a) => ({ ...a, expectedLossUsd: Math.round(a.valueUsd * config.assets[a.asset].shock * 100) / 100, walletUrl: `${EXPLORER}/address/${a.wallet}`, busy: busy.has(a.id), next: a.kind === "demo" ? nextStep(a.id) : null, lines: lines.filter((l) => l.agent === a.id).map(withLinks) })).reverse(),
    // Real counts, from the desk's own record. Gemini's fee is its published taker fee on each order.
    stats: {
      agents: agents.length,
      paidReads: lines.filter((l) => l.paymentId).length,
      quotes: lines.filter((l) => l.data?.quote).length,
      orders: bought.length,
      contracts,
      volumeUsd: Math.round(volume * 100) / 100,
      feeUsd: Math.round(bought.reduce((n, o) => n + takerFee(o.contracts, o.price), 0) * 100) / 100,
      avgPrice: contracts ? Math.round((volume / contracts) * 100) / 100 : null,
      sandboxOrders: bought.filter((o) => o.sandbox.orderId).length,
    },
    mcp: { add: `claude mcp add hedgehog-desk -- ${tsx} ${server}`, config: { mcpServers: { "hedgehog-desk": { command: tsx, args: [server] } } } },
  };
}
export const orderOf = (quoteId: string) => orders().find((o) => o.quoteId === quoteId) ?? null;

// The pool's balances, for the end-of-unit report. Chain and Gateway reads: on request only.
export async function poolBalances() {
  const out = [];
  for (let i = 0; i < config.poolSize; i++) {
    const b = await gatewayOf(i).getBalances();
    out.push({ wallet: privateKeyToAccount(deskKey(i)).address, walletUsdc: b.wallet.formatted, gatewayUsdc: b.gateway.formattedAvailable });
  }
  return out;
}
