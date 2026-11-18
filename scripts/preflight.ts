// npm run preflight
// The checks before a demo, each a PASS or FAIL line: the Arc RPC, Gemini, our contracts,
// the balances, the Stream count and the Lab. Reads only. Exits 1 if anything failed.
import { readFileSync } from "node:fs";
import { erc20Abi, formatUnits } from "viem";
import { USDC, account, publicClient } from "../src/shared/chain.js";

const LAB = `http://localhost:${process.env.PORT || 8787}`;
const DEPLOYER_MIN = 5, AGENT_MIN = 0.5; // USDC: two replays and an hour of posts; one replay's reads and gas
let failed = 0;
async function check(name: string, run: () => Promise<string>) {
  try {
    console.log(`PASS  ${name.padEnd(10)} ${await run()}`);
  } catch (err) {
    failed++;
    console.log(`FAIL  ${name.padEnd(10)} ${(err instanceof Error ? err.message : String(err)).split("\n")[0]}`);
  }
}
const usdc = async (address: `0x${string}`) => Number(formatUnits(await publicClient.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [address] }), 6));

await check("RPC", async () => {
  const id = await publicClient.getChainId();
  if (id !== 5042002) throw new Error(`chain ${id}, expected 5042002 (Arc testnet)`);
  return `Arc testnet, block ${await publicClient.getBlockNumber()}`;
});
await check("Gemini", async () => {
  const res = await fetch("https://api.gemini.com/v1/prediction-markets/events?status=active&category=Crypto&limit=1");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return `reachable, ${json.pagination.total} open crypto events`;
});
await check("contracts", async () => {
  const deployed: Record<string, { address: `0x${string}` }> = JSON.parse(readFileSync("deployments/arc-testnet.json", "utf8"));
  const missing = [];
  for (const [name, d] of Object.entries(deployed)) if (!(await publicClient.getCode({ address: d.address }))) missing.push(name);
  if (missing.length) throw new Error(`no code at ${missing.join(", ")}`);
  return `${Object.keys(deployed).length} deployed: ${Object.keys(deployed).join(", ")}`;
});
await check("deployer", async () => {
  const has = await usdc(account("DEPLOYER_KEY").address);
  if (has < DEPLOYER_MIN) throw new Error(`${has} USDC, below ${DEPLOYER_MIN}: use the faucet, https://faucet.circle.com`);
  return `${has} USDC`;
});
await check("agent", async () => {
  const has = await usdc(account("AGENT_KEY").address);
  if (has < AGENT_MIN) throw new Error(`${has} USDC, below ${AGENT_MIN}: run npm run demo:reset`);
  return `${has} USDC`;
});
await check("Streams", async () => {
  const key = process.env.QUICKNODE_API_KEY;
  if (!key) throw new Error("QUICKNODE_API_KEY is empty in .env");
  const res = await fetch("https://api.quicknode.com/streams/rest/v1/streams?limit=20&offset=0", { headers: { accept: "application/json", "x-api-key": key } });
  if (!res.ok) throw new Error(`QuickNode answered HTTP ${res.status}`);
  const n = ((await res.json()).data ?? []).length;
  if (n) throw new Error(`${n} up and billing: run npm run stream:down (or this is your demo's Stream)`);
  return "0 up (start one with npm run stream:demo)";
});
await check("Lab", async () => {
  const res = await fetch(`${LAB}/api/desk`).catch(() => null);
  if (!res?.ok) throw new Error(`nothing at ${LAB}: run npm run lab`);
  const feed = await (await fetch(`${LAB}/api/feed`)).json();
  if (!feed.markets?.length) throw new Error("up, but the feed has no markets yet: wait a minute");
  return `up at ${LAB}, ${feed.markets.length} feed markets, ${(await res.json()).agents.length} desk agents`;
});
process.exit(failed ? 1 : 0);
