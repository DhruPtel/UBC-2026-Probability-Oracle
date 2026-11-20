// The agent insurance desk as an MCP server (unit 8.0g): bring your own agent.
// Each tool is one call to the desk's routes on the running server, so the Agents page shows
// every step. No keys here: the agent's wallet lives in the server. Two ways in:
//   stdio, next to a local copy (npm run lab):
//     claude mcp add hedgehog-desk -- <repo>/node_modules/.bin/tsx <repo>/src/desk/mcp.ts
//   HTTP, mounted by the server at /mcp (unit 11.1; the hosted copy):
//     claude mcp add --transport http hedgehog-desk https://<host>/mcp
import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// `headers` mark the server's own calls when it mounts these tools at /mcp.
export function deskServer(DESK: string, headers: Record<string, string> = {}) {
async function call(path: string, body: object = {}) {
  let text: string, failed = false;
  try {
    const res = await fetch(DESK + path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
    text = await res.text();
    failed = !res.ok;
  } catch {
    text = `the desk at ${DESK} did not answer: start the Lab server with "npm run lab"`;
    failed = true;
  }
  return { content: [{ type: "text" as const, text }], isError: failed };
}

const server = new McpServer({ name: "hedgehog-desk", version: "0.1.0" });
const agentId = z.string().describe("The agentId that sign_up returned");

server.registerTool(
  "sign_up",
  {
    description:
      "Sign up for insurance at the desk. You declare what you hold (BTC or ETH, in US dollars) and get an Arc testnet wallet with a little test USDC and a Circle Gateway balance for paid reads. The wallet starts small on purpose: at buy_cover the desk tops it up by exactly what the premium and gas need, so you never need to fund it. Returns your agentId. Call this first.",
    inputSchema: { name: z.string().describe("A short name for you, shown on the Agents page"), asset: z.enum(["BTC", "ETH"]), holding_usd: z.number().positive().describe("The value of the holding in US dollars, for example 40") },
  },
  ({ name, asset, holding_usd }) => call("/api/desk/sign-up", { kind: "yours", name, asset, holdingUsd: holding_usd }),
);

server.registerTool(
  "check_risks",
  {
    description:
      "Read the oracle's current chance of each threat to your holding: the asset ending below a strike that is below today's price (for example: BTC ends below $60,000 on Nov 30). Each read is paid: $0.001 in USDC over x402 from your wallet's Circle Gateway balance. Returns up to five risks, nearest strike first.",
    inputSchema: { agent_id: agentId },
  },
  ({ agent_id }) => call(`/api/desk/agents/${encodeURIComponent(agent_id)}/check-risks`),
);

server.registerTool(
  "list_contracts",
  {
    description:
      "List every live Gemini contract that is a threat to your holding (a strike below today's price), at Gemini's live prices: the chance, the price per contract, the loss if it happens (holding × (1 − strike / today's price)), the contracts that pay it back, the premium, Gemini's fee and the payout (each contract pays $1). Also the desk's recommendation: the nearest strike below today's price on the latest date, worth buying when its chance is 25% or more, with the reason in one line. Free.",
    inputSchema: { agent_id: agentId },
  },
  ({ agent_id }) => call(`/api/desk/agents/${encodeURIComponent(agent_id)}/contracts`),
);

server.registerTool(
  "quote_cover",
  {
    description: "Get a firm quote for cover on one contract, at Gemini's price read now. Returns a quoteId, the premium, the payout, Gemini's fee, the exact order, your wallet's balance and the top-up the desk will send at buy_cover if the wallet is short.",
    inputSchema: { agent_id: agentId, symbol: z.string().describe("A contract symbol from list_contracts"), share: z.number().gt(0).max(1).optional().describe("How much of the loss to cover: 1 (the default) is all of it, 0.5 is half") },
  },
  ({ agent_id, symbol, share }) => call(`/api/desk/agents/${encodeURIComponent(agent_id)}/quote`, { symbol, share }),
);

server.registerTool(
  "buy_cover",
  {
    description:
      "Buy the cover of a quote. Your wallet pays the premium in testnet USDC onchain (ProtectionBook on Arc). If the wallet holds less than the premium plus gas, the desk's treasury first sends it exactly the shortfall (the premium goes back to the treasury), so a small balance is not a reason to stop. The Gemini order is an order ticket, not sent to production; the same order is placed in Gemini's sandbox when the sandbox lists the contract. Returns the transaction link, the ticket and the sandbox result.",
    inputSchema: { agent_id: agentId, quote_id: z.string().describe("The quoteId that quote_cover returned") },
  },
  ({ agent_id, quote_id }) => call(`/api/desk/agents/${encodeURIComponent(agent_id)}/buy`, { quoteId: quote_id }),
);

server.registerTool(
  "my_cover",
  { description: "What you hold now: your declared holding, the cover you bought, what you paid, and what it pays if the bad outcome happens.", inputSchema: { agent_id: agentId } },
  ({ agent_id }) => call(`/api/desk/agents/${encodeURIComponent(agent_id)}/cover`),
);

return server;
}

// Started as a script: stdio.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await deskServer(process.env.DESK_URL || "http://127.0.0.1:8787").connect(new StdioServerTransport());
