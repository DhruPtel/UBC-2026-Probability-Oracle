// Creates .env from .env.example if needed, and fills in any empty wallet key.
// Prints addresses only. Never prints a key or .env.
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { EXPLORER } from "../src/shared/chain.js";

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
