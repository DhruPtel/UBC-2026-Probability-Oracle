// Creates .env from .env.example if needed, and fills in any empty wallet key.
// Prints addresses only. Never prints a key or .env.
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { EXPLORER, deskKey } from "../src/shared/chain.js";

if (!existsSync(".env")) copyFileSync(".env.example", ".env");

const labels = {
  DEPLOYER_KEY: "deployer (oracle, treasury, owner)",
  AGENT_KEY: "agent",
};

let env = readFileSync(".env", "utf8");

for (const [name, label] of Object.entries(labels)) {
  let key = env.match(new RegExp(`^${name}=(.*)$`, "m"))?.[1].trim();
  if (!key) {
    key = generatePrivateKey();
    const line = new RegExp(`^${name}=.*$`, "m");
    env = line.test(env) ? env.replace(line, `${name}=${key}`) : `${env.trimEnd()}\n${name}=${key}\n`;
    writeFileSync(".env", env);
  }
  const { address } = privateKeyToAccount(key as `0x${string}`);
  console.log(`${label}\n  ${address}\n  ${EXPLORER}/address/${address}`);
}

// The agent desk's pool of demo wallets comes from one seed (unit 8.0d).
if (!env.match(/^DESK_SEED=(.+)$/m)) {
  const line = /^DESK_SEED=.*$/m, seed = generatePrivateKey();
  env = line.test(env) ? env.replace(line, `DESK_SEED=${seed}`) : `${env.trimEnd()}\nDESK_SEED=${seed}\n`;
  writeFileSync(".env", env);
}
process.env.DESK_SEED = env.match(/^DESK_SEED=(.+)$/m)![1].trim();
const { poolSize } = JSON.parse(readFileSync("src/desk/desk.json", "utf8"));
for (let i = 0; i < poolSize; i++) console.log(`desk wallet ${i + 1} of ${poolSize}\n  ${privateKeyToAccount(deskKey(i)).address}`);
