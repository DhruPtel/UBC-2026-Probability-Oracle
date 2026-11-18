// Gemini prediction-market trading, SANDBOX ONLY (test funds).
// The host is hardcoded. There is no environment switch and no production client in this file.
// Sandbox prices run independently of production; our odds still come from production.
import "dotenv/config";
import { createHmac } from "node:crypto";

const SANDBOX = "https://api.sandbox.gemini.com";
// The API key is a master key, so Gemini wants the account named on every private call.
const ACCOUNT = "primary";

// A signed private call: the fields go base64-encoded in X-GEMINI-PAYLOAD, signed with
// HMAC-SHA384, and the HTTP body stays empty.
async function signed(method: "GET" | "POST", path: string, fields: object = {}) {
  const payload = Buffer.from(
    JSON.stringify({ request: path, nonce: Math.floor(Date.now() / 1000), account: ACCOUNT, ...fields }),
  ).toString("base64");
  const signature = createHmac("sha384", process.env.GEMINI_SANDBOX_API_SECRET!).update(payload).digest("hex");
  const res = await fetch(SANDBOX + path, {
    method,
    headers: {
      "X-GEMINI-APIKEY": process.env.GEMINI_SANDBOX_API_KEY!,
      "X-GEMINI-PAYLOAD": payload,
      "X-GEMINI-SIGNATURE": signature,
      "Content-Type": "text/plain",
      "Cache-Control": "no-cache",
    },
  });
  // Order IDs are 18-digit integers, too big for a JavaScript number, so keep them as strings.
  const text = (await res.text()).replace(/"orderId":\s*(\d+)/g, '"orderId":"$1"');
  const body = JSON.parse(text);
  if (!res.ok) throw new Error(`Gemini sandbox ${path}: HTTP ${res.status} ${text}`);
  return body;
}

export type SandboxContract = {
  instrumentSymbol: string;
  label: string;
  marketState?: string;
  prices?: { buy?: { yes?: string; no?: string } };
  priceIncrement?: string;
  priceMinimum?: string;
  quantityMinimum?: string;
};
export type SandboxEvent = { ticker: string; title: string; category: string; contracts: SandboxContract[] };
export type SandboxOrder = {
  orderId: string;
  clientOrderId?: string | null;
  status: string;
  symbol: string;
  side: string;
  outcome: string;
  quantity: string;
  filledQuantity?: string;
  remainingQuantity?: string;
  price: string;
  avgExecutionPrice?: string | null;
};
export type SandboxPosition = { symbol: string; outcome: string; totalQuantity: string; avgPrice: string };

// Whether the Prediction Markets terms are accepted. The user accepts them in the sandbox UI;
// this file never calls the accept endpoint.
export function termsStatus(): Promise<{ hasAcceptedLatest: boolean; acceptedVersion?: number; latestVersion?: number }> {
  return signed("GET", "/v1/prediction-markets/terms/status");
}

export function balances(): Promise<{ currency: string; amount: string; available: string }[]> {
  return signed("POST", "/v1/balances");
}

// Every active sandbox event with its contracts. Public, no key.
export async function listEvents(): Promise<SandboxEvent[]> {
  const events: SandboxEvent[] = [];
  for (;;) {
    const res = await fetch(`${SANDBOX}/v1/prediction-markets/events?status=active&limit=100&offset=${events.length}`);
    const page = await res.json();
    if (!res.ok) throw new Error(`Gemini sandbox events: HTTP ${res.status} ${JSON.stringify(page)}`);
    events.push(...page.data);
    if (page.data.length === 0 || events.length >= page.pagination.total) return events;
    await new Promise((resolve) => setTimeout(resolve, 1000)); // public calls: at most 1 per second
  }
}

export function placeLimitBuy(order: {
  symbol: string;
  outcome: "yes" | "no";
  price: string;
  quantity: string;
  clientOrderId: string;
  timeInForce?: "good-til-cancel" | "immediate-or-cancel";
}): Promise<SandboxOrder> {
  return signed("POST", "/v1/prediction-markets/order", {
    symbol: order.symbol,
    orderType: "limit",
    side: "buy",
    outcome: order.outcome,
    price: order.price,
    quantity: order.quantity,
    timeInForce: order.timeInForce ?? "good-til-cancel",
    clientOrderId: order.clientOrderId,
  });
}

// There is no get-one-order endpoint, so look in the open orders, then in the history.
export async function getOrder(orderId: string): Promise<SandboxOrder | null> {
  for (const path of ["/v1/prediction-markets/orders/active", "/v1/prediction-markets/orders/history"]) {
    const { orders } = (await signed("POST", path, { limit: 100 })) as { orders: SandboxOrder[] };
    const found = orders.find((order) => String(order.orderId) === orderId);
    if (found) return found;
  }
  return null;
}

export async function positions(): Promise<SandboxPosition[]> {
  return (await signed("POST", "/v1/prediction-markets/positions")).positions;
}
