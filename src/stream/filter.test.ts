// The Stream filter runs on QuickNode, so it is plain JavaScript with hand-written decoding.
// These tests build each log with viem from the event's signature and check what it decodes to.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { encodeAbiParameters, encodeEventTopics, keccak256, parseAbi, stringToHex } from "viem";

const source = readFileSync(new URL("./filter.js", import.meta.url), "utf8");
const main = new Function(source + "; return main;")() as (stream: { data: unknown }) => Record<string, unknown>[] | null;
const deployments = JSON.parse(readFileSync(new URL("../../deployments/arc-testnet.json", import.meta.url), "utf8"));
const at = (name: string) => (deployments[name].address as string).toLowerCase();
const AGENT = source.match(/const AGENT = "(0x[0-9a-f]{40})"/)![1];
const OTHER = "0x00000000000000000000000000000000000000aa";
const USDC = "0x3600000000000000000000000000000000000000";

const abi = parseAbi([
  "event OddsUpdated(bytes32 indexed marketId, string symbol, uint16 probBps, uint16 prevProbBps, uint64 observedAt, bytes32 sourceHash, uint32 round, address indexed publisher)",
  "event ProtectionBought(uint256 indexed id, bytes32 indexed marketId, string symbol, address indexed buyer, uint8 side, uint32 contracts, uint256 premium, bytes32 orderRef)",
  "event RiskLevelChanged(address indexed protocol, string symbol, uint8 oldLevel, uint8 newLevel, uint16 harmBps)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);
const hash = keccak256(stringToHex("x"));
const log = (address: string, topics: readonly unknown[], data: string) => ({ address, topics, data, blockNumber: "0x10", blockTimestamp: "0x20", transactionHash: hash });
const run = (...logs: unknown[]) => main({ data: [[logs]] });

function odds(symbol: string, probBps: number, prevProbBps: number) {
  const topics = encodeEventTopics({ abi, eventName: "OddsUpdated", args: { marketId: keccak256(stringToHex(symbol)), publisher: OTHER } });
  const data = encodeAbiParameters([{ type: "string" }, { type: "uint16" }, { type: "uint16" }, { type: "uint64" }, { type: "bytes32" }, { type: "uint32" }], [symbol, probBps, prevProbBps, 5n, hash, 7]);
  return log(at("OddsFeed"), topics, data);
}

test("the filter's contract addresses are the deployed ones", () => {
  for (const [name, constant] of [["OddsFeed", "ODDS_FEED"], ["ProtectionBook", "PROTECTION_BOOK"], ["RiskSwitch", "RISK_SWITCH"]]) {
    assert.equal(source.match(new RegExp(`const ${constant} = "(0x[0-9a-f]{40})"`))![1], at(name));
  }
});

test("OddsUpdated: a small move is oddsUpdated, 5 points or more is bigMove", () => {
  const where = { block: 16, time: 32, tx: hash };
  assert.deepEqual(run(odds("GEMI-BTC2611302200-HI67500", 5150, 5000)), [{ type: "oddsUpdated", symbol: "GEMI-BTC2611302200-HI67500", probBps: 5150, prevProbBps: 5000, round: 7, ...where }]);
  assert.equal(run(odds("a", 5499, 5000))![0].type, "oddsUpdated");
  assert.equal(run(odds("a", 5500, 5000))![0].type, "bigMove");
  assert.equal(run(odds("a", 4500, 5000))![0].type, "bigMove");
});

test("ProtectionBought decodes the buyer, side, contracts and premium", () => {
  const topics = encodeEventTopics({ abi, eventName: "ProtectionBought", args: { id: 32n, marketId: hash, buyer: AGENT as `0x${string}` } });
  const data = encodeAbiParameters([{ type: "string" }, { type: "uint8" }, { type: "uint32" }, { type: "uint256" }, { type: "bytes32" }], ["replay:x", 1, 4, 2000000n, hash]);
  assert.deepEqual(run(log(at("ProtectionBook"), topics, data)), [{ type: "protectionBought", id: 32, symbol: "replay:x", buyer: AGENT, side: "NO", contracts: 4, premium: 2000000, block: 16, time: 32, tx: hash }]);
});

test("RiskLevelChanged decodes the protocol and both levels", () => {
  const topics = encodeEventTopics({ abi, eventName: "RiskLevelChanged", args: { protocol: OTHER } });
  const data = encodeAbiParameters([{ type: "string" }, { type: "uint8" }, { type: "uint8" }, { type: "uint16" }], ["test:demo", 1, 2, 7000]);
  assert.deepEqual(run(log(at("RiskSwitch"), topics, data)), [{ type: "riskLevelChanged", protocol: OTHER, symbol: "test:demo", oldLevel: 1, newLevel: 2, harmBps: 7000, block: 16, time: 32, tx: hash }]);
});

test("USDC transfers: only the agent's, with a direction", () => {
  const transfer = (from: string, to: string) => log(USDC, encodeEventTopics({ abi, eventName: "Transfer", args: { from: from as `0x${string}`, to: to as `0x${string}` } }), encodeAbiParameters([{ type: "uint256" }], [1000n]));
  assert.deepEqual(run(transfer(AGENT, OTHER)), [{ type: "walletChange", direction: "out", from: AGENT, to: OTHER, amount: 1000, block: 16, time: 32, tx: hash }]);
  assert.equal(run(transfer(OTHER, AGENT))![0].direction, "in");
  assert.equal(run(transfer(OTHER, OTHER)), null);
});

test("anything else is dropped: the same event from another contract, and an empty block", () => {
  const stranger = { ...odds("a", 5000, 4000), address: OTHER };
  assert.equal(run(stranger), null);
  assert.equal(main({ data: [[[]]] }), null);
});
