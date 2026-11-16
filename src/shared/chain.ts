import "dotenv/config";
import { createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "viem/chains";

export const USDC = "0x3600000000000000000000000000000000000000";
export const EXPLORER = "https://explorer.testnet.arc.io";

export const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(process.env.ARC_RPC_URL),
});

export function account(name: "DEPLOYER_KEY" | "AGENT_KEY") {
  const key = process.env[name];
  if (!key) throw new Error(`${name} is empty in .env. Run: npm run new-keys`);
  return privateKeyToAccount(key as `0x${string}`);
}
