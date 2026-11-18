import "dotenv/config";
import { mkdirSync, rmdirSync, statSync } from "node:fs";
import { createPublicClient, createWalletClient, http, keccak256, toHex } from "viem";
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

// One deployer transaction at a time, in this process and across processes. Two sent in the
// same instant read the same nonce and one fails; the demo replay publishes and syncs every few
// seconds while `npm run oracle` loops in another terminal. Inside a process the sends queue;
// between processes a lock directory (logs/deployer.lock) is held from the send until its
// receipt. A lock older than 30 s was left by a process that died, and is taken over.
const LOCK = "logs/deployer.lock";
async function withLock<T>(send: () => Promise<T>): Promise<T> {
  mkdirSync("logs", { recursive: true });
  for (;;) {
    try {
      mkdirSync(LOCK);
      break;
    } catch {
      try {
        if (Date.now() - statSync(LOCK).mtimeMs > 30000) rmdirSync(LOCK);
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  try {
    return await send();
  } finally {
    try {
      rmdirSync(LOCK);
    } catch {}
  }
}
let deployerQueue: Promise<unknown> = Promise.resolve();
export function asDeployer<T>(send: () => Promise<T>): Promise<T> {
  const next = deployerQueue.then(() => withLock(send), () => withLock(send));
  deployerQueue = next.catch(() => {});
  return next;
}

export function account(name: "DEPLOYER_KEY" | "AGENT_KEY") {
  const key = process.env[name];
  if (!key) throw new Error(`${name} is empty in .env. Run: npm run new-keys`);
  return privateKeyToAccount(key as `0x${string}`);
}

// The agent desk's demo wallets (unit 8.0d): a small pool, each key derived from DESK_SEED and
// its index. Reused by one agent after another, so test funds are not burned.
export function deskKey(index: number) {
  const seed = process.env.DESK_SEED;
  if (!seed) throw new Error("DESK_SEED is empty in .env. Run: npm run new-keys");
  return keccak256(`${seed as `0x${string}`}${toHex(index, { size: 32 }).slice(2)}`);
}

export function walletClient(name: "DEPLOYER_KEY" | "AGENT_KEY") {
  return createWalletClient({
    account: account(name),
    chain: arcTestnet,
    transport: http(process.env.ARC_RPC_URL),
  });
}
