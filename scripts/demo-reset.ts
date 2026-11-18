// npm run demo:reset
// Before a demo: puts the desk's log aside (kept as logs/desk-<time>.jsonl, never deleted), so
// the Agents page starts empty; tops the agent's wallet and the desk's four wallets up from the
// deployer; checks that no Stream is up; prints the balances. The money only moves between our
// own wallets (the deployer is the treasury and gets every premium back).
import { existsSync, readFileSync, renameSync } from "node:fs";
import { erc20Abi, formatUnits, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { EXPLORER, USDC, account, asDeployer, deskKey, publicClient, walletClient } from "../src/shared/chain.js";

const LAB = `http://localhost:${process.env.PORT || 8787}`;
const AGENT_USDC = 3; // a replay's premium is about 2
const desk: { poolSize: number; walletTopUpUsdc: number } = JSON.parse(readFileSync("src/desk/desk.json", "utf8"));
const balance = (address: `0x${string}`) => publicClient.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [address] });

// 1. The desk's log. A running Lab holds the agents in memory, so it does the move itself.
const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
const lab = await fetch(`${LAB}/api/desk/reset`, { method: "POST" }).catch(() => null);
if (lab?.ok) {
  const { archive } = await lab.json();
  console.log(archive ? `desk log   moved to ${archive} (the Lab now shows no agents)` : "desk log   already empty");
} else if (lab) {
  throw new Error(`the Lab refused the reset: ${(await lab.json()).error}`);
} else if (existsSync("logs/desk.jsonl")) {
  renameSync("logs/desk.jsonl", `logs/desk-${stamp}.jsonl`);
  console.log(`desk log   moved to logs/desk-${stamp}.jsonl (the Lab is not running)`);
} else {
  console.log("desk log   none");
}

// 2. Top-ups, one deployer send at a time, only where a wallet is below its amount.
const wallets = [
  { label: "agent", address: account("AGENT_KEY").address, target: AGENT_USDC },
  ...Array.from({ length: desk.poolSize }, (_, i) => ({ label: `desk wallet ${i + 1}`, address: privateKeyToAccount(deskKey(i)).address, target: desk.walletTopUpUsdc })),
];
for (const w of wallets) {
  const has = await balance(w.address), want = parseUnits(String(w.target), 6);
  if (has >= want) continue;
  const txHash = await asDeployer(async () => {
    const hash = await walletClient("DEPLOYER_KEY").writeContract({ address: USDC, abi: erc20Abi, functionName: "transfer", args: [w.address, want - has] });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`the top-up of ${w.label} reverted: ${hash}`);
    return hash;
  });
  console.log(`top-up     ${w.label} +${formatUnits(want - has, 6)} USDC  ${EXPLORER}/tx/${txHash}`);
}

// 3. Streams bill per block, so none should be up before a demo starts one.
const key = process.env.QUICKNODE_API_KEY;
if (key) {
  const list = await (await fetch("https://api.quicknode.com/streams/rest/v1/streams?limit=20&offset=0", { headers: { accept: "application/json", "x-api-key": key } })).json();
  const streams: { id: string; name: string; status: string }[] = list.data ?? [];
  console.log(`streams    ${streams.length} up${streams.length ? ": run `npm run stream:down`" : ""}`);
  for (const s of streams) console.log(`           ${s.id}  ${s.name}  ${s.status}`);
} else {
  console.log("streams    not checked: QUICKNODE_API_KEY is empty in .env");
}

// 4. Balances.
const deployer = account("DEPLOYER_KEY").address;
console.log(`balances   deployer ${deployer}  ${formatUnits(await balance(deployer), 6)} USDC`);
for (const w of wallets) console.log(`           ${w.label} ${w.address}  ${formatUnits(await balance(w.address), 6)} USDC`);
