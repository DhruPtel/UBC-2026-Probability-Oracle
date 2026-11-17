// npm run demo   starts the demo replay on the running Lab server and prints it as it happens.
// REPLAY: real Gemini hourly history of the BTC market, published again in about 3 minutes
// under its own symbol. The same run as the "Start demo" button on http://localhost:8787/demo.
// Needs the Lab running (npm run lab:dev). With a Stream up (npm run stream:up) the triggers
// come through it; without one the server triggers the agent and the pool directly.
// It spends the agent's testnet USDC: one premium (about 2 USDC) and a few $0.001 reads.
import "dotenv/config";

const base = `http://127.0.0.1:${process.env.PORT || 8787}`;
const time = () => new Date().toLocaleTimeString();

let events: Response, started: Response;
try {
  events = await fetch(`${base}/events`);
  started = await fetch(`${base}/api/demo/start`, { method: "POST" });
} catch {
  console.error(`The Lab is not running at ${base}. Start it first: npm run lab:dev`);
  process.exit(1);
}
const run = await started.json();
if (!started.ok) {
  console.error(`Could not start: ${run.error}`);
  process.exit(1);
}
console.log(`REPLAY ${run.runId}: real Gemini odds from ${run.from} to ${run.to}, at about ${run.speed}× speed, ${run.total} values.`);
console.log(run.via === "stream" ? "Triggers come through the Stream." : "Stream is down: triggers run directly.");

// Read the server's event stream until this run's "end".
const decoder = new TextDecoder();
let buffer = "";
reading: for await (const chunk of events.body as unknown as AsyncIterable<Uint8Array>) {
  buffer += decoder.decode(chunk, { stream: true });
  let cut;
  while ((cut = buffer.indexOf("\n\n")) >= 0) {
    const block = buffer.slice(0, cut);
    buffer = buffer.slice(cut + 2);
    const type = /^event: (.*)$/m.exec(block)?.[1];
    const data = /^data: (.*)$/m.exec(block)?.[1];
    if (!type || !data) continue;
    const d = JSON.parse(data);

    if (type === "demo" && d.runId === run.runId) {
      if (d.step === "caption") console.log(`\n${time()}  ▶ ${d.detail}\n`);
      else if (d.step !== "start") console.log(`${time()}  ${d.step}: ${d.detail}`);
      if (d.step === "end") break reading;
    } else if (type === "agent" && d.demo === run.runId && ["decision", "buyProtection", "error"].includes(d.step)) {
      console.log(`${time()}  agent ${d.step}: ${d.detail}${d.txUrl ? `\n            ${d.txUrl}` : ""}`);
    } else if (type === "defi" && d.pool === "ReplayLendingPool" && d.txHash && d.levelBefore !== d.levelAfter) {
      console.log(`${time()}  pool: level ${d.levelBefore} → ${d.levelAfter}, loan limit ${d.paused ? "paused" : d.maxLtvBps / 100 + "%"}\n            ${d.txUrl}`);
    }
  }
}

const { replay } = await (await fetch(`${base}/api/demo`)).json();
const s = replay.summary;
const limit = (p: { paused: boolean; maxLtvBps: number }) => (p.paused ? "paused" : p.maxLtvBps / 100 + "%");
console.log(`\nSummary (REPLAY)`);
console.log(`  Crash odds: ${(10000 - s.startYesBps) / 100}% → ${(10000 - s.endYesBps) / 100}%`);
console.log(`  Agent: bought ${replay.covered} of ${replay.needed} contracts for ${s.premiumUsdc} USDC, and paid ${s.readsUsdc} USDC for ${replay.reads} reads`);
console.log(`  Pool: loan limit ${limit(replay.poolStart)} → ${limit(replay.pool)}`);
console.log(`  Cost: premium ${s.premiumUsdc} + reads ${s.readsUsdc} + agent gas ${s.agentGasUsdc} + deployer gas ${s.deployerGasUsdc} = ${Math.round((s.premiumUsdc + s.readsUsdc + s.agentGasUsdc + s.deployerGasUsdc) * 1e6) / 1e6} USDC`);
process.exit(0);
