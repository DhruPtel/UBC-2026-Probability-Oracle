// npm run demo
// Everything a demo needs, in one terminal: the Lab (the site at http://localhost:8787) and the
// QuickNode Stream (stream:demo: its own tunnel, the Stream, and stream:down at the end).
// Ctrl+C stops both and leaves 0 Streams. If a Lab is already running, it is used as it is and
// only the Stream is started and stopped here.
// The Stream bills per block while it is up (about 144,000 QuickNode API credits an hour on Arc
// testnet), which is why it runs with the demo and not all day.
import "dotenv/config";
import { spawn, type ChildProcess } from "node:child_process";

const base = `http://127.0.0.1:${process.env.PORT || 8787}`;
const labUp = async () => {
  try {
    return (await fetch(`${base}/api/desk`)).ok;
  } catch {
    return false;
  }
};

let lab: ChildProcess | null = null;
let stream: ChildProcess | null = null;
let stopping = false;
// The Stream goes first and is waited for: it deletes itself on QuickNode. Then the Lab.
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  const end = () => {
    if (lab?.pid) try { process.kill(-lab.pid, "SIGTERM"); } catch {}
    process.exit(code);
  };
  if (!stream || stream.exitCode !== null) return end();
  stream.on("exit", end);
  process.kill(-stream.pid!, "SIGINT"); // the whole group: tsx, the script, its tunnel
}
process.on("SIGINT", () => stop(0)); // Ctrl+C
process.on("SIGTERM", () => stop(0));

if (await labUp()) {
  console.log(`The Lab is already running at ${base}: using it. Ctrl+C here stops only the Stream.`);
} else {
  // detached (its own process group): Ctrl+C reaches this script alone, which then stops the two in order.
  lab = spawn("node_modules/.bin/tsx", ["src/server/index.ts"], { stdio: "inherit", detached: true });
  lab.on("exit", () => {
    if (!stopping) console.log("The Lab stopped.");
    stop(1);
  });
  for (let i = 0; i < 60 && !(await labUp()) && !stopping; i++) await new Promise((resolve) => setTimeout(resolve, 500));
  if (!(await labUp())) {
    console.error("The Lab did not start.");
    stop(1);
  }
}
if (!stopping) {
  stream = spawn("node_modules/.bin/tsx", ["scripts/stream-demo.ts"], { stdio: "inherit", detached: true });
  stream.on("exit", (code) => {
    if (stopping) return;
    console.log(`The Stream is off (stream:demo ended${code ? ` with code ${code}` : ""}). The site keeps running; Ctrl+C stops it.`);
    stream = null;
  });
}
