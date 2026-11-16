// Reads Foundry build output and our recorded deployments.
import { readFileSync } from "node:fs";
import type { Abi, Address, Hex } from "viem";

export function loadArtifact(name: string): { abi: Abi; bytecode: Hex } {
  const json = JSON.parse(readFileSync(`contracts/out/${name}.sol/${name}.json`, "utf8"));
  return { abi: json.abi, bytecode: json.bytecode.object };
}

export function addressOf(name: string): Address {
  let deployments: Record<string, { address: Address }> = {};
  try {
    deployments = JSON.parse(readFileSync("deployments/arc-testnet.json", "utf8"));
  } catch {}
  const address = deployments[name]?.address;
  if (!address) throw new Error(`deploy ${name} first: npm run deploy -- ${name}`);
  return address;
}
