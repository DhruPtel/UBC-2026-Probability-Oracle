// npm run deploy -- <Name> [constructor args…] [--as <Key>]
// Deploys contracts/out/<Name>.sol/<Name>.json to Arc testnet and records the address.
// An argument written as @Other becomes Other's address from deployments/arc-testnet.json.
// --as records the deployment under another key, for a second copy of the same contract.
// Example: npm run deploy -- RiskSwitch @OddsFeed
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { addressOf, loadArtifact } from "../src/shared/artifacts.js";
import { EXPLORER, publicClient, walletClient } from "../src/shared/chain.js";

const words = process.argv.slice(2);
const asAt = words.indexOf("--as");
const key = asAt === -1 ? words[0] : words[asAt + 1];
const [name, ...rawArgs] = asAt === -1 ? words : words.slice(0, asAt);
if (!name || !key) throw new Error("usage: npm run deploy -- <Name> [constructor args…] [--as <Key>]");

const { abi, bytecode } = loadArtifact(name);
const ctor = abi.find((item) => item.type === "constructor");
const inputs = ctor?.type === "constructor" ? ctor.inputs : [];
if (inputs.length !== rawArgs.length) throw new Error(`${name}'s constructor takes ${inputs.length} argument(s), got ${rawArgs.length}`);
const args = rawArgs.map((arg, i) => {
  if (arg.startsWith("@")) return addressOf(arg.slice(1));
  return inputs[i].type.startsWith("uint") ? BigInt(arg) : arg;
});

const txHash = await walletClient("DEPLOYER_KEY").deployContract({ abi, bytecode, args });
const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
const address = receipt.contractAddress;
if (!address) throw new Error(`no contract address in receipt for ${txHash}`);

const file = "deployments/arc-testnet.json";
mkdirSync("deployments", { recursive: true });
const deployments = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
deployments[key] = {
  address,
  txHash,
  block: Number(receipt.blockNumber),
  deployedAt: new Date().toISOString(),
};
writeFileSync(file, JSON.stringify(deployments, null, 2) + "\n");

console.log(`${key} deployed at ${address}${args.length ? `  (constructor: ${args.join(", ")})` : ""}`);
console.log(`  ${EXPLORER}/address/${address}`);
console.log(`  ${EXPLORER}/tx/${txHash}`);
