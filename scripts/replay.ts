// npm run replay -- agent | protocol   starts a demo replay on the running Lab server and prints
// it as it happens. The same runs as "Start replay" on http://localhost:8787/agents#replay and
// /pools/ours. Default: agent.
// REPLAY: real Gemini hourly history, published again in about a minute under a replay symbol.
//   agent     BTC, Nov 12 to 15. Spends the agent's testnet USDC: one premium (about 2 USDC,
//             which goes to the deployer) and a few $0.001 reads.
//   protocol  ETH, Nov 9 to 15. Spends deployer gas only.
// Needs the Lab running (npm run demo, or npm run lab:dev). With a Stream up (npm run demo) the triggers
// come through it; without one the server triggers the agent and the pool directly.
import "dotenv/config";

const kind = process.argv[2] === "protocol" ? "protocol" : "agent";
const base = `http://127.0.0.1:${process.env.PORT || 8787}`;
const time = () => new Date().toLocaleTimeString();
const pc = (bps: number) => bps / 100 + "%";
const limit = (p: { paused: boolean; maxLtvBps: number }) => (p.paused ? "no new borrowing" : "loans up to " + pc(p.maxLtvBps));
const AGENT_STEPS = ["", "Odds rising", "Crosses 50%", "Agent pays $0.001 for fresh odds", "Agent buys insurance", "Insured"];
const POOL_STEPS = ["", "Risk rising", "Past 50%: limit 60%", "Past 70%: limit 40%", "Past 85%: no new borrowing"];

let started: Response;
try {
  started = await fetch(`${base}/api/demo/${kind}/start`, { method: "POST" });
} catch {
  console.error(`The Lab is not running at ${base}. Start it first: npm run lab:dev`);
  process.exit(1);
}
let view = await started.json();
if (!started.ok) {
  console.error(`Could not start: ${view.error}`);
  process.exit(1);
}
console.log(`REPLAY of ${view.source} (${view.risk}), ${view.run.total} values. ${view.run.via === "stream" ? "Triggers come through the Stream." : "Stream is down: triggers run directly."}`);

// Ask the server for the run's state once a second and print what changed.
let printed = 0;
let step = 0;
while (view.run.status !== "done") {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  view = await (await fetch(`${base}/api/demo/${kind}`)).json();
  for (const p of view.run.published.slice(printed)) console.log(`${time()}  oracle update, round ${p.round}: ${pc(p.harmBps)}  ${p.txUrl}`);
  printed = view.run.published.length;
  if (view.step > step) {
    step = view.step;
    console.log(`\n${time()}  ▶ ${step}. ${(kind === "agent" ? AGENT_STEPS : POOL_STEPS)[step]}\n`);
  }
}

const s = view.summary;
const sum = (...n: number[]) => Math.round(n.reduce((a, b) => a + b, 0) * 1e6) / 1e6;
console.log(`\nSummary (REPLAY, ${view.run.seconds} s)`);
console.log(`  Chance: ${pc(s.startHarmBps)} → ${pc(s.endHarmBps)}`);
if (kind === "agent") {
  console.log(`  Agent: bought ${s.contracts} contracts for ${s.premiumUsdc} USDC, and paid ${s.readsUsdc} USDC for ${s.reads} reads`);
  console.log(`  Cost: premium ${s.premiumUsdc} + reads ${s.readsUsdc} + agent gas ${s.agentGasUsdc} + deployer gas ${s.deployerGasUsdc} = ${sum(s.premiumUsdc, s.readsUsdc, s.agentGasUsdc, s.deployerGasUsdc)} USDC`);
} else {
  console.log(`  Pool: ${s.limits.map(limit).join(" → ")}, ${s.updates} automatic updates`);
  console.log(`  Cost: deployer gas ${s.deployerGasUsdc} USDC`);
}
if (view.run.errors) console.log(`  ${view.run.errors} publish(es) failed; see the Lab's terminal`);
