// npm run stream:demo
// The Stream for a demo, in one command: starts a cloudflared tunnel to the webhook port,
// passes the tunnel's address to stream:up for this run only (.env is not changed), and on
// Ctrl+C, or if the tunnel dies, runs stream:down and stops the tunnel. Needs the Lab running.
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

if (existsSync("logs/stream-id.txt")) {
  console.error("A Stream is already up. Run `npm run stream:down` first.");
  process.exit(1);
}

const port = process.env.STREAM_PORT || "8788";
const tunnel = spawn("cloudflared", ["tunnel", "--url", `http://localhost:${port}`], { stdio: ["ignore", "pipe", "pipe"] });
let url: string | null = null;
let up = false;
let stopping = false;

function stop(code: number) {
  if (stopping) return;
  stopping = true;
  if (up) spawnSync("npx", ["tsx", "scripts/stream-down.ts"], { stdio: "inherit" });
  tunnel.kill();
  process.exit(code);
}
process.on("SIGINT", () => stop(0)); // Ctrl+C
process.on("SIGTERM", () => stop(0));
tunnel.on("error", (err) => {
  console.error(`cloudflared did not start: ${err.message}`);
  process.exit(1);
});
tunnel.on("exit", () => {
  if (!stopping) console.log("The tunnel stopped.");
  stop(1);
});

// cloudflared prints the tunnel's address once, in its log.
const read = (chunk: Buffer) => {
  const found = String(chunk).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (found && !url) {
    url = found[0];
    start(url);
  }
};
tunnel.stdout.on("data", read);
tunnel.stderr.on("data", read);

async function start(address: string) {
  console.log(`tunnel: ${address}`);
  // A new tunnel's name takes a few seconds to answer. The webhook app has only POST /stream,
  // so a 404 to this GET means our own server replied through the tunnel.
  let reached = false;
  for (let i = 0; i < 40 && !reached && !stopping; i++) {
    try {
      reached = (await fetch(`${address}/stream`)).status === 404;
    } catch {}
    if (!reached) await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (stopping) return;
  if (!reached) {
    console.error(`The tunnel does not reach http://localhost:${port}. Is the Lab running (npm run lab:dev)?`);
    return stop(1);
  }
  const created = spawnSync("npx", ["tsx", "scripts/stream-up.ts"], { stdio: "inherit", env: { ...process.env, STREAM_WEBHOOK_URL: address } });
  if (created.status !== 0) return stop(1);
  up = true;
  console.log("Stream on, press Ctrl+C to stop");
}
