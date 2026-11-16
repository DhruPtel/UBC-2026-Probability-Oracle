// SANDBOX ONLY: Gemini prediction-market orders with test funds.
//   npm run gemini:order -- list
//   npm run gemini:order -- buy <symbol> <yes|no> <price>
//   npm run gemini:order -- status <orderId>
//   npm run gemini:order -- positions
import { balances, getOrder, listEvents, placeLimitBuy, positions, termsStatus, type SandboxOrder } from "../src/agent/trade.js";

const [mode, ...args] = process.argv.slice(2);
if (!process.env.GEMINI_SANDBOX_API_KEY || !process.env.GEMINI_SANDBOX_API_SECRET) {
  throw new Error("GEMINI_SANDBOX_API_KEY and GEMINI_SANDBOX_API_SECRET must be set in .env");
}

function printOrder(order: SandboxOrder) {
  console.log(`SANDBOX order ${order.orderId}  ${order.side} ${order.quantity} ${order.outcome.toUpperCase()} ${order.symbol} @ ${order.price}`);
  console.log(`  status ${order.status}, filled ${order.filledQuantity ?? "0"} at avg ${order.avgExecutionPrice ?? "-"}, client id ${order.clientOrderId ?? "(none returned)"}`);
}

if (mode === "list") {
  const terms = await termsStatus();
  console.log(`terms accepted: ${terms.hasAcceptedLatest} (accepted v${terms.acceptedVersion}, latest v${terms.latestVersion})`);
  const usd = (await balances()).find((b) => b.currency === "USD");
  console.log(`USD balance: ${usd?.available ?? "0"} (SANDBOX test funds)`);

  const events = await listEvents();
  console.log(`\n${events.length} SANDBOX prediction-market events (prices are sandbox prices, not production):`);
  for (const event of events) {
    console.log(`\n${event.title}  [${event.category}, ${event.ticker}]`);
    for (const c of event.contracts) {
      console.log(`  ${c.instrumentSymbol.padEnd(34)} buy YES ${c.prices?.buy?.yes ?? "-"}  buy NO ${c.prices?.buy?.no ?? "-"}  ${c.label}`);
    }
  }
} else if (mode === "buy") {
  const [symbol, outcome, priceArg] = args;
  if (!symbol || (outcome !== "yes" && outcome !== "no") || !priceArg) {
    throw new Error("usage: npm run gemini:order -- buy <symbol> <yes|no> <price>");
  }
  const contract = (await listEvents()).flatMap((e) => e.contracts).find((c) => c.instrumentSymbol === symbol);
  if (!contract) throw new Error(`${symbol} is not an active SANDBOX contract. Run: npm run gemini:order -- list`);

  // Round the price to the contract's tick, and buy 1 contract (or the minimum, if larger).
  const increment = Number(contract.priceIncrement ?? "0.01");
  const price = (Math.round(Number(priceArg) / increment) * increment).toFixed(2);
  const quantity = String(Math.max(1, Number(contract.quantityMinimum ?? "1")));

  const order = await placeLimitBuy({ symbol, outcome, price, quantity, clientOrderId: `test-${Date.now()}` });
  printOrder(order);
} else if (mode === "status") {
  if (!args[0]) throw new Error("usage: npm run gemini:order -- status <orderId>");
  const order = await getOrder(args[0]);
  if (order) printOrder(order);
  else console.log(`order ${args[0]} not found in the sandbox's open orders or history`);
} else if (mode === "positions") {
  const all = await positions();
  console.log(`${all.length} SANDBOX position(s)`);
  for (const p of all) console.log(`  ${p.symbol}  ${p.outcome.toUpperCase()}  quantity ${p.totalQuantity}  avg price ${p.avgPrice}`);
} else {
  throw new Error("usage: npm run gemini:order -- list | buy <symbol> <yes|no> <price> | status <orderId> | positions");
}
