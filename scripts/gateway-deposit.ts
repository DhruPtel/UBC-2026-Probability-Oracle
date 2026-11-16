// npm run gateway:deposit -- <usdc>
// Deposits USDC from the agent's wallet into Circle Gateway on Arc testnet.
// This is the one onchain step a buyer needs; after it, paid reads are gasless.
import "dotenv/config";
import { GatewayClient } from "@circle-fin/x402-batching/client";
import { EXPLORER } from "../src/shared/chain.js";

const amount = process.argv[2];
if (!amount) throw new Error("usage: npm run gateway:deposit -- <usdc>");
if (!process.env.AGENT_KEY) throw new Error("AGENT_KEY is empty in .env. Run: npm run new-keys");

const client = new GatewayClient({
  chain: "arcTestnet",
  privateKey: process.env.AGENT_KEY as `0x${string}`,
  rpcUrl: process.env.ARC_RPC_URL,
});

const before = await client.getBalances();
console.log(`agent ${client.address}`);
console.log(`before   wallet ${before.wallet.formatted} USDC   Gateway ${before.gateway.formattedAvailable} USDC`);

const deposit = await client.deposit(amount);
if (deposit.approvalTxHash) console.log(`approve tx  ${EXPLORER}/tx/${deposit.approvalTxHash}`);
console.log(`deposit tx  ${EXPLORER}/tx/${deposit.depositTxHash}`);

// Gateway credits the deposit a few seconds after the transaction confirms.
let after = await client.getBalances();
for (let i = 0; i < 20 && after.gateway.available === before.gateway.available; i++) {
  await new Promise((resolve) => setTimeout(resolve, 3000));
  after = await client.getBalances();
}
console.log(`after    wallet ${after.wallet.formatted} USDC   Gateway ${after.gateway.formattedAvailable} USDC`);
