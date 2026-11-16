// npm run deploy -- <Name>
// Deploys contracts/out/<Name>.sol/<Name>.json to Arc testnet and records the address.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { loadArtifact } from "../src/shared/artifacts.js";
import { EXPLORER, publicClient, walletClient } from "../src/shared/chain.js";

const name = process.argv[2];
if (!name) throw new Error("usage: npm run deploy -- <Name>");

const { abi, bytecode } = loadArtifact(name);
const txHash = await walletClient("DEPLOYER_KEY").deployContract({ abi, bytecode });
const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
const address = receipt.contractAddress;
if (!address) throw new Error(`no contract address in receipt for ${txHash}`);

const file = "deployments/arc-testnet.json";
mkdirSync("deployments", { recursive: true });
const deployments = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
deployments[name] = {
  address,
  txHash,
  block: Number(receipt.blockNumber),
  deployedAt: new Date().toISOString(),
};
writeFileSync(file, JSON.stringify(deployments, null, 2) + "\n");

console.log(`${name} deployed at ${address}`);
console.log(`  ${EXPLORER}/address/${address}`);
console.log(`  ${EXPLORER}/tx/${txHash}`);
