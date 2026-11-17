import "dotenv/config";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "viem/chains";

export const USDC = "0x3600000000000000000000000000000000000000";
export const EXPLORER = "https://explorer.testnet.arc.io";

// Arc makes a block about every 0.5 s, so receipts are polled every 800 ms (viem's default is 4 s).
// Faster polling, with a demo replay running, brought HTTP 429 from Arc's public RPC.
export const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(process.env.ARC_RPC_URL),
  pollingInterval: 800,
});

// One deployer transaction at a time in this process. Two sent in the same instant read the
// same nonce and one fails; the demo replay publishes and syncs every few seconds.
let deployerQueue: Promise<unknown> = Promise.resolve();
export function asDeployer<T>(send: () => Promise<T>): Promise<T> {
  const next = deployerQueue.then(send, send);
  deployerQueue = next.catch(() => {});
  return next;
}

export function account(name: "DEPLOYER_KEY" | "AGENT_KEY") {
  const key = process.env[name];
  if (!key) throw new Error(`${name} is empty in .env. Run: npm run new-keys`);
  return privateKeyToAccount(key as `0x${string}`);
}

export function walletClient(name: "DEPLOYER_KEY" | "AGENT_KEY") {
  return createWalletClient({
    account: account(name),
    chain: arcTestnet,
    transport: http(process.env.ARC_RPC_URL),
  });
}
