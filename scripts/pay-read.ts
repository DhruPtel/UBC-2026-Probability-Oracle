// npm run pay-read -- <symbol>
// Pays for one odds read as the agent, over x402 with Circle Gateway Nanopayments.
// The Lab server must be running (npm run lab).
import "dotenv/config";
import { GatewayClient } from "@circle-fin/x402-batching/client";

const symbol = process.argv[2];
if (!symbol) throw new Error("usage: npm run pay-read -- <symbol>");
if (!process.env.AGENT_KEY) throw new Error("AGENT_KEY is empty in .env. Run: npm run new-keys");

const client = new GatewayClient({
  chain: "arcTestnet",
  privateKey: process.env.AGENT_KEY as `0x${string}`,
  rpcUrl: process.env.ARC_RPC_URL,
});
const url = `http://127.0.0.1:${process.env.PORT || 8787}/odds/${symbol}`;

const before = await client.getBalances();
const result = await client.pay(url);
const after = await client.getBalances();

console.log(`GET ${url}`);
console.log(`status   ${result.status}`);
console.log(`body     ${JSON.stringify(result.data)}`);
console.log(`paid     ${result.formattedAmount} USDC, Gateway transfer id ${result.transaction}`);
console.log(`Gateway  ${before.gateway.formattedAvailable} → ${after.gateway.formattedAvailable} USDC`);
