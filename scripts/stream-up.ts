// npm run stream:up
// Tests the filter on QuickNode, then creates a Stream on Arc testnet that sends our
// contracts' events and the agent's USDC transfers, decoded, to the webhook. The Stream bills per block: run stream:down afterwards.
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { publicClient } from "../src/shared/chain.js";

const API = "https://api.quicknode.com/streams/rest/v1/streams";
const key = process.env.QUICKNODE_API_KEY;
const webhook = process.env.STREAM_WEBHOOK_URL;
if (!key) throw new Error("QUICKNODE_API_KEY is empty in .env");
if (!webhook) throw new Error("STREAM_WEBHOOK_URL is empty in .env (the https URL that cloudflared prints)");

const headers = { accept: "application/json", "content-type": "application/json", "x-api-key": key };
const filter = readFileSync("src/stream/filter.js").toString("base64");

// 1. Test the filter against the block of our most recent OddsFeed publish.
const lastPublish = JSON.parse(readFileSync("logs/oracle.jsonl", "utf8").trim().split("\n").at(-1)!);
const testRes = await fetch(`${API}/test_filter`, {
  method: "POST",
  headers,
  body: JSON.stringify({ network: "arc-testnet", dataset: "logs", filter_function: filter, block: String(lastPublish.block) }),
});
const test = await testRes.json();
console.log(`filter test on block ${lastPublish.block}: HTTP ${testRes.status}`);
if (!testRes.ok || !Array.isArray(test.result)) throw new Error(`filter test failed: ${JSON.stringify(test)}`);
for (const event of test.result) console.log(`  ${event.type}  ${event.symbol ?? ""}  tx ${event.tx}`);

// 2. Create the Stream, starting at the current block and running until it is deleted.
const startBlock = Number(await publicClient.getBlockNumber());
const createRes = await fetch(API, {
  method: "POST",
  headers,
  body: JSON.stringify({
    name: "ubc-oracle-test",
    network: "arc-testnet",
    dataset: "logs",
    region: "usa_east",
    filter_function: filter,
    start_range: startBlock,
    dataset_batch_size: 5, // QuickNode's minimum for chains with sub-second blocks
    elastic_batch_enabled: true, // deliver what is ready instead of waiting for 5 blocks
    destination: "webhook",
    destination_attributes: {
      url: `${webhook.replace(/\/$/, "")}/stream`,
      compression: "none",
      max_retry: 3,
      retry_interval_sec: 1,
      post_timeout_sec: 10,
    },
    status: "active",
  }),
});
const stream = await createRes.json();
if (!createRes.ok || !stream.id) throw new Error(`create failed: HTTP ${createRes.status} ${JSON.stringify(stream)}`);

writeFileSync("logs/stream-id.txt", stream.id + "\n");
console.log(`stream created: ${stream.id}`);
console.log(`  status ${stream.status}, from block ${startBlock}, to ${webhook.replace(/\/$/, "")}/stream`);
console.log("  run `npm run stream:down` when you are done; it bills per block");
