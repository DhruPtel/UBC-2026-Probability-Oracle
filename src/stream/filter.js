// QuickNode Streams filter for the logs dataset on Arc testnet. It runs on QuickNode, not here;
// scripts/stream-up.ts sends this file base64-encoded.
// Keeps only logs from our contracts. No decoding (that comes in unit 5.2).
// stream.data is nested: blocks → transactions → logs.
function main(stream) {
  // Lowercase addresses from deployments/arc-testnet.json.
  const ODDS_FEED = "0xe83a5a53dd68bf395337343cd25a0432a1acc50d";
  const HELLO = "0xc06b4ee36f838bb1f6ca95caa25ed9d6f2d45e67";

  const matches = [];
  for (const block of stream.data) {
    for (const transaction of block) {
      for (const log of transaction) {
        const address = log.address.toLowerCase();
        if (address === ODDS_FEED || address === HELLO) matches.push(log);
      }
    }
  }
  return matches.length > 0 ? matches : null;
}
