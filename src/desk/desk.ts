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
// The cover rule (unit 11.13): a threat is "ends below $X" with X below today's price; the
// loss is holding × (1 − X / price), covered by that many $1 contracts, rounded up. The pick is
// the nearest strike below the price on the latest date, bought at a 25% chance or more.
// No budgets, maximum prices or approvals here: those are the agent guardrails (Phase 12, planned).
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { GatewayClient } from "@circle-fin/x402-batching/client";
import { createWalletClient, erc20Abi, formatUnits, http, keccak256, parseUnits, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "viem/chains";
import type { PaidOdds } from "../agent/inputs.js";
import { pickStrike, strikeOf, whyLine } from "../agent/policy.js";
import { listEvents, placeLimitBuy, type SandboxContract } from "../agent/trade.js";
import { getEvent, getSpot } from "../oracle/gemini.js";
import { probability, toBps } from "../oracle/odds.js";
import { addressOf, loadArtifact } from "../shared/artifacts.js";
import { EXPLORER, USDC, account, asDeployer, deskKey, publicClient, walletClient } from "../shared/chain.js";
import { coverFor, premiumUnits, type Terms } from "./cover.js";

const config: {
  poolSize: number;
  walletFloorUsdc: number;
  walletTopUpUsdc: number;
  gatewayFloorUsdc: number;
  gatewayDepositUsdc: number;
  gasUsdc: number;
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
  thin: string | null; // the book is too thin to post (unit 10.2)
  stale: boolean; // the posted value is old and Gemini has moved since
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
type StepName = "sign_up" | "check_risks" | "list_contracts" | "quote_cover" | "buy_cover" | "my_cover" | "recheck" | "error";
export type Line = { ts: string; agent: string; step: StepName; detail: string; txHash?: string; paymentId?: string; data?: any };
type Quote = {
  id: string;
  agent: string;
  symbol: string;
  risk: string;
  side: "YES" | "NO";
  chanceBps: number;
  contracts: number;
  spotUsd: number;
  strikeUsd: number;
  lossUsd: number;
  why: string;
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
let lines: Line[] = existsSync(FILE) ? readFileSync(FILE, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
// DESK_REMOVE=a3,a4 takes test agents off the record at start: the log is written again without
// their lines and the original is kept beside it. Set it for one start, then remove it.
const removed = (process.env.DESK_REMOVE ?? "").split(",").map((x) => x.trim()).filter(Boolean);
if (removed.length && lines.some((l) => removed.includes(l.agent))) {
  renameSync(FILE, `logs/desk-before-remove-${Date.now()}.jsonl`);
  lines = lines.filter((l) => !removed.includes(l.agent));
  writeFileSync(FILE, lines.map((l) => JSON.stringify(l) + "\n").join(""));
}
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

  // The next id follows the highest one, so an id is never reused after an agent is removed.
  const n = Math.max(0, ...agents.map((a) => Number(a.id.slice(1)))), walletIndex = n % config.poolSize, kind = input.kind === "yours" ? "yours" : "demo";
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
// Today's price of each asset, as last read from Gemini. A re-check uses it (it reads nothing).
const spotNow: Record<string, number> = {};
async function spotOf(asset: string) {
  return (spotNow[asset] = (await getSpot(config.assets[asset].spotPair)).last);
}
// The threats to a holding: "ends below $X" with X below today's price. A strike the price is
// already under has happened and is no threat. Thin and stale markets are left out without a
// word: an agent is only offered what it can act on.
const matching = (agent: Agent, spotUsd: number) =>
  feedMarkets()
    .filter((m) => m.asset === agent.asset && m.bad?.side === "NO" && !m.thin && !m.stale)
    .map((m) => ({ ...m, strikeUsd: strikeOf(m.label) ?? Infinity }))
    .filter((m) => m.strikeUsd < spotUsd);
const dayOf = (expiry: string) => new Date(expiry).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
// "below $65,000" in an older record's risk text, for a re-check of cover bought before strikes were kept.
const strikeIn = (risk: string) => Number(risk.match(/below \$([\d,]+)/)?.[1].replace(/,/g, "") ?? NaN);

export async function checkRisks(id: string) {
  const agent = of(id), spotUsd = await spotOf(agent.asset);
  // The markets that run longest (cover through month end), and of those the strikes nearest below the price.
  const latest = matching(agent, spotUsd).map((m) => m.expiry).sort().at(-1);
  const markets = matching(agent, spotUsd).filter((m) => m.expiry === latest).sort((a, b) => b.strikeUsd - a.strikeUsd).slice(0, config.risksPerCheck);
  if (!markets.length) throw new Error(`the live feed has no ${agent.asset} market with a strike below today's price ($${Math.round(spotUsd)}) right now`);
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

// --- 3. Browse: every live Gemini contract that is a threat to the holding (a strike below
// today's price), with what covering its loss would take, and the desk's recommendation.
// Free: Gemini's prices as the feed read them within the last minute.
export async function listContracts(id: string) {
  const agent = of(id), terms = config.assets[agent.asset], spotUsd = await spotOf(agent.asset);
  const rows = matching(agent, spotUsd)
    .flatMap((m) => {
      const price = m.buyNo;
      if (price === null) return [];
      const c = coverFor({ valueUsd: agent.valueUsd, terms, spotUsd, strikeUsd: m.strikeUsd, yesBps: m.yesBps, side: "NO", price, held: held(id, m.symbol) });
      const why = whyLine({ asset: agent.asset, spotUsd, strikeUsd: m.strikeUsd, by: dayOf(m.expiry), chanceBps: c.chanceBps, lossUsd: c.lossUsd, contracts: c.needed, trigger: terms.trigger });
      return [{ symbol: m.symbol, risk: m.bad!.risk, expiry: m.expiry.slice(0, 10), side: "NO" as const, strikeUsd: m.strikeUsd, price, ...c, why }];
    })
    .sort((a, b) => b.expiry.localeCompare(a.expiry) || b.strikeUsd - a.strikeUsd);
  if (!rows.length) throw new Error(`the live feed has no ${agent.asset} contract with a strike below today's price ($${Math.round(spotUsd)}) right now`);
  const pick = pickStrike(rows, spotUsd)!;
  const recommendation = { symbol: pick.symbol, risk: pick.risk, buy: pick.action === "buy", why: pick.why };
  log(id, "list_contracts", `Browsed ${rows.length} live ${agent.asset} contracts below today's price on Gemini. ${pick.why}`, { data: { rows, spotUsd, recommendation } });
  return {
    holdingUsd: agent.valueUsd,
    spotUsd,
    rule: `Each contract is "${agent.asset} ends below $X" with X below today's price. If it happens the holding loses holding × (1 − X / today's price); enough $1 contracts to pay that, rounded up. The desk recommends the nearest strike below today's price on the latest date, bought when its chance is ${terms.trigger * 100}% or more.`,
    recommendation,
    contracts: rows,
  };
}

// --- 4. Quote: one contract at Gemini's live price, read now, with the exact order it would be.
export async function quoteCover(id: string, symbol: string, share?: number) {
  const agent = of(id), terms = config.assets[agent.asset], spotUsd = await spotOf(agent.asset), m = matching(agent, spotUsd).find((x) => x.symbol === symbol);
  if (!m) throw new Error(`${symbol} is not a live contract that is a threat to a ${agent.asset} holding (a strike below today's price, $${Math.round(spotUsd)}): use list_contracts`);
  if (share !== undefined && !(share > 0 && share <= 1)) throw new Error("share is how much of the loss to cover: above 0, at most 1");
  const side = m.bad!.side;
  const contract = (await getEvent(m.eventTicker)).event.contracts.find((c) => c.instrumentSymbol === symbol);
  const text = side === "NO" ? contract?.prices?.buy?.no : contract?.prices?.buy?.yes, odds = contract ? probability(contract) : null;
  if (!contract || text === undefined || !odds || odds.prob === null) throw new Error(`Gemini has no price to buy ${side} on ${symbol} right now`);
  const price = Number(text);
  const c = coverFor({ valueUsd: agent.valueUsd, terms, spotUsd, strikeUsd: m.strikeUsd, yesBps: toBps(odds.prob), side, price, held: held(id, symbol), share });
  if (c.contracts <= 0) throw new Error(`already covered: this agent holds ${held(id, symbol)} ${side} on ${symbol}`);
  const why = whyLine({ asset: agent.asset, spotUsd, strikeUsd: m.strikeUsd, by: dayOf(m.expiry), chanceBps: c.chanceBps, lossUsd: c.lossUsd, contracts: c.contracts, trigger: terms.trigger });
  const quote: Quote = {
    id: `q${lines.filter((l) => l.step === "quote_cover").length + 1}`,
    agent: id,
    symbol,
    risk: m.bad!.risk,
    side,
    chanceBps: c.chanceBps,
    contracts: c.contracts,
    spotUsd,
    strikeUsd: m.strikeUsd,
    lossUsd: c.lossUsd,
    why,
    price,
    premiumUsdc: c.premiumUsdc,
    feeUsd: c.feeUsd,
    payoutUsd: c.payoutUsd,
    quotedAt: new Date().toISOString(),
    ticket: { symbol, orderType: "limit", side: "buy", outcome: side === "NO" ? "no" : "yes", quantity: String(c.contracts), price: price.toFixed(2), timeInForce: "good-til-cancel" },
  };
  log(id, "quote_cover", `Quote ${quote.id}: ${quote.contracts} ${side} on “${quote.risk}” at ${usd(price)} is a ${usd(quote.premiumUsdc)} premium and pays ${usd(quote.payoutUsd)} if it happens. Gemini's fee would be ${usd(quote.feeUsd)}`, { data: { quote } });
  // What the wallet holds, and what the desk adds at buy_cover if that is short.
  // Arc's public RPC answers 429 when busy: the quote stands without the balance.
  const balance = await usdcOf(agent.wallet).catch(() => null);
  const walletUsdc = balance === null ? null : Number(formatUnits(balance, 6)), topUpUsdc = balance === null ? null : Number(formatUnits(shortfall(premiumUnits(c.contracts, price), balance), 6));
  return {
    ...quote,
    quoteId: quote.id,
    costPerDollarOfPayout: price,
    ruleSays: c.action === "buy" ? `buy: the chance is ${terms.trigger * 100}% or more` : `hold: the chance is under ${terms.trigger * 100}%`,
    walletUsdc,
    topUpUsdc,
    funding: topUpUsdc
      ? `Your wallet holds ${walletUsdc} USDC. At buy_cover the desk's treasury sends it exactly the ${topUpUsdc} USDC it is short of the premium plus ${config.gasUsdc} for gas; the premium goes back to the treasury.`
      : topUpUsdc === 0 ? "Your wallet holds enough for the premium and gas."
      : `At buy_cover, if your wallet is short of the premium plus ${config.gasUsdc} for gas, the desk's treasury sends exactly the shortfall first.`,
  };
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

// What a wallet is short of a premium plus the gas for its two sends (approve, buyProtection).
const shortfall = (premium: bigint, balance: bigint) => {
  const need = premium + parseUnits(String(config.gasUsdc), 6);
  return balance < need ? need - balance : 0n;
};

export async function buyCover(id: string, quoteId: string) {
  const agent = of(id), q: Quote | undefined = mine(id, "quote_cover").find((l) => l.data?.quote?.id === quoteId)?.data.quote;
  if (!q) throw new Error(`no quote ${quoteId} for agent ${id}: call quote_cover first`);
  if (orders(id).some((o) => o.quoteId === quoteId)) throw new Error(`quote ${quoteId} is already bought`);
  return turn(agent.walletIndex, async () => {
    const premium = premiumUnits(q.contracts, q.price), wallet = walletOf(agent.walletIndex), book = addressOf("ProtectionBook");
    // The wallet needs the premium and gas. If it is short, the treasury sends exactly the
    // shortfall first; the premium goes back to the treasury, so the money cycles.
    const units = shortfall(premium, await usdcOf(agent.wallet));
    if (units > 0n) {
      const txHash = await topUp(agent.wallet, units);
      log(id, "buy_cover", `The wallet was ${formatUnits(units, 6)} test USDC short of the premium plus gas; the treasury sent exactly that. The premium returns to it.`, { txHash });
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
      spotUsd: q.spotUsd,
      strikeUsd: q.strikeUsd,
      lossUsd: q.lossUsd,
      why: q.why,
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

// --- A covered demo agent keeps watching (unit 10b.5). The server calls this for every oracle
// post the QuickNode Stream delivers. An agent that holds cover on that market works its rule
// out again at the new value and writes down what it found. Free: the value is the one in the
// delivered event, already onchain. It buys nothing here.
export function recheck(symbol: string, yesBps: number, round?: number, txHash?: string) {
  let did = 0; // how many agents re-checked
  for (const a of agents) {
    const bought = orders(a.id).filter((o) => o.symbol === symbol);
    if (a.kind !== "demo" || busy.has(a.id) || !bought.length || !mine(a.id, "my_cover").length) continue;
    if (mine(a.id, "recheck").some((l) => l.data.recheck.symbol === symbol && l.data.recheck.round === round)) continue;
    const strikeUsd = bought[0].strikeUsd ?? strikeIn(bought[0].risk), spotUsd = spotNow[a.asset] ?? bought[0].spotUsd ?? a.spotUsd;
    const c = coverFor({ valueUsd: a.valueUsd, terms: config.assets[a.asset], spotUsd, strikeUsd, yesBps, side: bought[0].side, price: bought[0].price, held: held(a.id, symbol) });
    const verdict = c.contracts <= 0 ? "still covered" : `${c.contracts} more ${c.contracts === 1 ? "contract" : "contracts"} would cover it`;
    log(a.id, "recheck", `Re-checked at ${pct(c.chanceBps)}: ${verdict}`, { ...(txHash ? { txHash } : {}), data: { recheck: { symbol, risk: bought[0].risk, chanceBps: c.chanceBps, round, covered: c.contracts <= 0 } } });
    did++;
  }
  return did;
}

// --- The built-in demo agent (unit 8.0f): the same steps, one at a time. It takes the desk's
// recommendation (the nearest strike below today's price on the latest date) and buys it when
// the chance is 25% or more.
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
    if (step === "list_contracts") await listContracts(id);
    if (step === "quote_cover") {
      // The desk's recommendation. A strike the price is already below is never offered: that
      // has happened, and its cover would cost nearly its whole payout.
      const pick: { symbol: string; buy: boolean; why: string } | undefined = mine(id, "list_contracts").at(-1)!.data.recommendation;
      if (pick?.buy) await quoteCover(id, pick.symbol);
      else log(id, "quote_cover", pick ? `${pick.why} The agent holds and buys nothing.` : "The feed has no contract for this holding right now: the agent holds and buys nothing", { data: pick ? { hold: pick } : undefined });
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
// Before a demo (npm run demo:reset): the log is put aside under a dated name, never deleted,
// and the desk starts again with no agents.
export function reset() {
  if (busy.size) throw new Error("an agent is in the middle of a step: try again in a few seconds");
  const archive = lines.length && existsSync(FILE) ? `logs/desk-${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}.jsonl` : null;
  if (archive) renameSync(FILE, archive);
  lines.length = 0;
  agents.length = 0;
  return { archive };
}

const withLinks = (l: Line) => ({ ...l, ...(l.txHash ? { txUrl: `${EXPLORER}/tx/${l.txHash}` } : {}), ...(l.paymentId ? { paymentUrl: `https://gateway-api-testnet.circle.com/v1/x402/transfers/${l.paymentId}` } : {}) });
export function deskView() {
  const tsx = `${process.cwd()}/node_modules/.bin/tsx`, server = `${process.cwd()}/src/desk/mcp.ts`;
  return {
    assets: Object.fromEntries(Object.entries(config.assets).map(([asset, t]) => [asset, { trigger: t.trigger, hedgeRatio: t.hedgeRatio }])),
    agents: agents.map((a) => ({ ...a, walletUrl: `${EXPLORER}/address/${a.wallet}`, busy: busy.has(a.id), next: a.kind === "demo" ? nextStep(a.id) : null, lines: lines.filter((l) => l.agent === a.id).map(withLinks) })).reverse(),
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
