// npm run oracle -- --once   publish every configured market once
// npm run oracle             publish every ORACLE_INTERVAL_S seconds (default 300)
import "dotenv/config";
import { publishOnce } from "../src/oracle/publisher.js";

const pct = (bps: number) => `${bps / 100}%`;

async function run() {
  for (const r of await publishOnce()) {
    if (!r.ok || r.probBps === undefined || r.prevProbBps === undefined) continue; // publisher.ts already logged why
    const change = (r.probBps - r.prevProbBps) / 100;
    const sign = change >= 0 ? "+" : "";
    console.log(`${r.symbol}  ${pct(r.probBps)}  (prev ${pct(r.prevProbBps)} → ${sign}${change} pts)  tx ${r.txUrl}`);
  }
}

if (process.argv.includes("--once")) {
  await run();
} else {
  const seconds = Number(process.env.ORACLE_INTERVAL_S || 300);
  console.log(`Oracle loop: publishing every ${seconds} s. Ctrl+C stops it.`);
  while (true) {
    console.log(`--- ${new Date().toISOString()}`);
    await run();
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  }
}
