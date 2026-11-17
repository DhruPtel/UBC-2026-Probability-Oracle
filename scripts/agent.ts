// npm run agent -- --once   one agent cycle: decide for each threat and buy protection where needed
// npm run agent             a cycle every AGENT_INTERVAL_S seconds (default 300)
// Each cycle pays for its odds reads over x402, so the Lab server must be running (npm run lab).
// Premiums are real testnet USDC paid onchain. Gemini fills are PAPER TRADEs at real production prices.
import "dotenv/config";
import { runOnce } from "../src/agent/agent.js";
import { EXPLORER } from "../src/shared/chain.js";

async function run(trigger: string) {
  for (const s of await runOnce(trigger)) {
    console.log(`${s.threat}  ${s.step}: ${s.detail}${s.txHash ? `\n    tx ${EXPLORER}/tx/${s.txHash}` : ""}`);
  }
}

if (process.argv.includes("--once")) {
  await run("manual");
} else {
  const seconds = Number(process.env.AGENT_INTERVAL_S || 300);
  console.log(`Agent loop: one cycle every ${seconds} s. Ctrl+C stops it.`);
  while (true) {
    console.log(`--- ${new Date().toISOString()}`);
    await run("timer");
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  }
}
