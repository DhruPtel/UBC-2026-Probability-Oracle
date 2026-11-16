// npm run stream:down
// Deletes the Stream that stream:up created, then lists what is left on the account.
import "dotenv/config";
import { existsSync, readFileSync, rmSync } from "node:fs";

const API = "https://api.quicknode.com/streams/rest/v1/streams";
const key = process.env.QUICKNODE_API_KEY;
if (!key) throw new Error("QUICKNODE_API_KEY is empty in .env");
const headers = { accept: "application/json", "x-api-key": key };

if (existsSync("logs/stream-id.txt")) {
  const id = readFileSync("logs/stream-id.txt", "utf8").trim();
  const res = await fetch(`${API}/${id}`, { method: "DELETE", headers });
  console.log(`delete ${id}: HTTP ${res.status}`);
  if (!res.ok && res.status !== 404) throw new Error(`delete failed: ${await res.text()}`);
  rmSync("logs/stream-id.txt");
} else {
  console.log("no logs/stream-id.txt, so nothing to delete");
}

const list = await (await fetch(`${API}?limit=20&offset=0`, { headers })).json();
const streams: { id: string; name: string; status: string }[] = list.data ?? [];
console.log(`streams left on the account: ${streams.length}`);
for (const s of streams) console.log(`  ${s.id}  ${s.name}  ${s.status}`);
