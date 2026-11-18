// npm run feed [symbols...]                       read OddsFeed for our markets (plus any symbols given)
// npm run feed -- publish <test:symbol> <percent>  publish a manual value (test: symbols only)
import { readFileSync } from "node:fs";
import { zeroHash } from "viem";
import { addressOf, loadArtifact } from "../src/shared/artifacts.js";
import { EXPLORER, asDeployer, publicClient, walletClient } from "../src/shared/chain.js";

const address = addressOf("OddsFeed");
const { abi } = loadArtifact("OddsFeed");
const args = process.argv.slice(2);

if (args[0] === "publish") {
  const [, symbol, percent] = args;
  if (!symbol || percent === undefined) {
    throw new Error("usage: npm run feed -- publish <test:symbol> <percent>");
  }
  // A labeling rule: manual values must never look like real Gemini data.
  if (!symbol.startsWith("test:")) {
    console.log(`Refused: manual publishes are only for "test:" symbols. Real symbols are published by the oracle (unit 2.3).`);
    process.exit(1);
  }

  const probBps = Math.round(Number(percent) * 100);
  const observedAt = BigInt(Math.floor(Date.now() / 1000));
  // Through asDeployer, like every deployer send: it waits its turn behind the other processes.
  const txHash = await asDeployer(async () => {
    const hash = await walletClient("DEPLOYER_KEY").writeContract({ address, abi, functionName: "publish", args: [symbol, probBps, observedAt, zeroHash] });
    await publicClient.waitForTransactionReceipt({ hash });
    return hash;
  });
  console.log(`published ${symbol} = ${percent}% (${probBps} bps)`);
  console.log(`tx: ${EXPLORER}/tx/${txHash}`);
} else {
  const config = JSON.parse(readFileSync("config/markets.json", "utf8"));
  const symbols: string[] = [
    ...config.markets.map((m: { symbol: string }) => m.symbol),
    ...Object.values(config.replays ?? {}).map((r) => (r as { symbol: string }).symbol),
    ...args,
  ];

  type Odds = { probBps: number; observedAt: bigint; publishedAt: bigint; sourceHash: string; round: number };
  const iso = (seconds: bigint) => new Date(Number(seconds) * 1000).toISOString();

  const rows = [];
  for (const symbol of symbols) {
    const o = (await publicClient.readContract({
      address,
      abi,
      functionName: "latestBySymbol",
      args: [symbol],
    })) as Odds;

    rows.push(
      o.round === 0
        ? { symbol, "YES %": "never published" }
        : {
            symbol,
            "YES %": `${o.probBps / 100}%`,
            round: o.round,
            observedAt: iso(o.observedAt),
            publishedAt: iso(o.publishedAt),
            sourceHash: `${o.sourceHash.slice(0, 10)}…`,
          },
    );
  }
  console.log(`OddsFeed ${address}`);
  console.table(rows);
}
