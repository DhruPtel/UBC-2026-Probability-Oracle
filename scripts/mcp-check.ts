// A real MCP client against the desk's HTTP endpoint (unit 11.1): lists the tools, then walks
// sign_up → check_risks → list_contracts → quote_cover → buy_cover → my_cover.
//   npm run mcp:check -- https://<host>/mcp          the whole walk (spends a little testnet USDC there)
//   npm run mcp:check -- https://<host>/mcp --list   the tools only
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const url = process.argv[2] ?? "http://127.0.0.1:8787/mcp";
const client = new Client({ name: "mcp-check", version: "0.1.0" });
await client.connect(new StreamableHTTPClientTransport(new URL(url)));

const tools = (await client.listTools()).tools.map((t) => t.name);
console.log(`${url}: ${tools.length} tools: ${tools.join(", ")}`);
if (process.argv.includes("--list")) process.exit(0);

async function tool(name: string, args: Record<string, unknown>) {
  const res = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] };
  const text = res.content[0]?.text ?? "";
  if (res.isError) {
    console.log(`FAIL  ${name}: ${text.slice(0, 200)}`);
    process.exit(1);
  }
  return JSON.parse(text);
}

const me = await tool("sign_up", { name: "MCP check", asset: "BTC", holding_usd: 20 });
console.log(`PASS  sign_up      ${me.agentId}, wallet ${me.wallet}`);
const risks = await tool("check_risks", { agent_id: me.agentId });
console.log(`PASS  check_risks  ${risks.risks.length} paid reads, ${risks.paidUsdc} USDC`);
const list = await tool("list_contracts", { agent_id: me.agentId });
const rows: { symbol: string; price: number; expiry: string; risk: string }[] = list.rows;
// This client's own choice: among the contracts that end last, the price nearest $0.60.
const latest = rows.map((r) => r.expiry).sort().at(-1);
const pick = rows.filter((r) => r.expiry === latest).sort((a, b) => Math.abs(a.price - 0.6) - Math.abs(b.price - 0.6))[0];
console.log(`PASS  list_contracts ${rows.length} contracts; choosing "${pick.risk}" at $${pick.price}`);
const quote = await tool("quote_cover", { agent_id: me.agentId, symbol: pick.symbol });
console.log(`PASS  quote_cover  ${quote.contracts} contracts, premium ${quote.premiumUsdc} USDC`);
const bought = await tool("buy_cover", { agent_id: me.agentId, quote_id: quote.quoteId ?? quote.id });
console.log(`PASS  buy_cover    ${bought.txUrl}`);
const cover = await tool("my_cover", { agent_id: me.agentId });
console.log(`PASS  my_cover     ${JSON.stringify(cover).slice(0, 200)}`);
await client.close();
