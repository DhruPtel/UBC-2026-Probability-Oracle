// npm run agent -- --once   one agent cycle: decide for each threat and buy protection where needed
// npm run agent             a cycle every AGENT_INTERVAL_S seconds (default 300)
// Premiums are real testnet USDC paid onchain. Gemini fills are PAPER TRADEs at real production prices.
import "dotenv/config";
import { runOnce } from "../src/agent/agent.js";
import { EXPLORER } from "../src/shared/chain.js";

async function run() {
  for (const s of await runOnce()) {
    console.log(`${s.threat}  ${s.step}: ${s.detail}${s.txHash ? `\n    tx ${EXPLORER}/tx/${s.txHash}` : ""}`);
  }
}

if (process.argv.includes("--once")) {
  await run();
} else {
  const seconds = Number(process.env.AGENT_INTERVAL_S || 300);
  console.log(`Agent loop: one cycle every ${seconds} s. Ctrl+C stops it.`);
  while (true) {
    console.log(`--- ${new Date().toISOString()}`);
    await run();
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  }
}
