// QuickNode Streams filter for the logs dataset on Arc testnet. It runs on QuickNode, not here;
// scripts/stream-up.ts sends this file base64-encoded, so it uses plain JavaScript only.
// It decodes the logs we care about into small typed events and drops everything else:
//   OddsFeed.OddsUpdated            → { type: "oddsUpdated" }, or "bigMove" when the odds moved 5 points or more
//   ProtectionBook.ProtectionBought → { type: "protectionBought" }
//   USDC Transfer to or from the agent → { type: "walletChange" }
//   RiskSwitch.RiskLevelChanged     → { type: "riskLevelChanged" }
// The webhook body is the array this returns. Returning null means no delivery.
// stream.data is nested: blocks → transactions → logs.
function main(stream) {
  // Lowercase addresses. The contracts are from deployments/arc-testnet.json; the agent is
  // the AGENT_KEY address that `npm run check:arc` prints.
  const ODDS_FEED = "0x1857639d8e6b3db0c04aa1288afb278f848d7f6a";
  const PROTECTION_BOOK = "0x31f88462ddb390cfe8484674509fe83514110692";
  const RISK_SWITCH = "0x900f9f4406884c75ba124e661f858d6a38e9e620";
  const USDC = "0x3600000000000000000000000000000000000000";
  const AGENT = "0xffc1a84e7050fd8f6648483b79b18074d0cacbcf";

  // keccak256 of each event signature.
  const ODDS_UPDATED = "0x473376416e521b9b6b91bb930b17560ee714ad4e3582bf542b0da6eaae7bfd12";
  const PROTECTION_BOUGHT = "0x6c0d6f007a677ad2dd4089e230b4329ddee4ef586b6210d008c0736ff779b58f";
  const RISK_LEVEL_CHANGED = "0x2e5ca94bbbe35576ab346853113ed4c576366db717baf646fee52d9bdca9ff1f";
  const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

  const BIG_MOVE_BPS = 500;

  // ABI decoding by hand: the data is 32-byte words, 64 hex characters each.
  const word = (data, i) => data.slice(2 + 64 * i, 2 + 64 * (i + 1));
  const number = (hex) => parseInt(hex, 16);
  const address = (topic) => "0x" + topic.slice(26).toLowerCase();
  // A string sits at the byte offset held in word `i`: one word of length, then the bytes.
  const text = (data, i) => {
    const start = 2 + 2 * number(word(data, i));
    const length = number(data.slice(start, start + 64));
    let out = "";
    for (let k = 0; k < length; k++) out += String.fromCharCode(parseInt(data.slice(start + 64 + 2 * k, start + 66 + 2 * k), 16));
    return out;
  };

  const events = [];
  for (const block of stream.data) {
    for (const transaction of block) {
      for (const log of transaction) {
        const from = log.address.toLowerCase();
        const topic = log.topics[0];
        const where = { block: number(log.blockNumber), time: number(log.blockTimestamp), tx: log.transactionHash };

        if (from === ODDS_FEED && topic === ODDS_UPDATED) {
          // OddsUpdated(marketId indexed, symbol, probBps, prevProbBps, observedAt, sourceHash, round, publisher indexed)
          const probBps = number(word(log.data, 1));
          const prevProbBps = number(word(log.data, 2));
          events.push({
            type: Math.abs(probBps - prevProbBps) >= BIG_MOVE_BPS ? "bigMove" : "oddsUpdated",
            symbol: text(log.data, 0),
            probBps,
            prevProbBps,
            round: number(word(log.data, 5)),
            ...where,
          });
        } else if (from === PROTECTION_BOOK && topic === PROTECTION_BOUGHT) {
          // ProtectionBought(id indexed, marketId indexed, symbol, buyer indexed, side, contracts, premium, orderRef)
          events.push({
            type: "protectionBought",
            id: number(log.topics[1]),
            symbol: text(log.data, 0),
            buyer: address(log.topics[3]),
            side: number(word(log.data, 1)) === 0 ? "YES" : "NO",
            contracts: number(word(log.data, 2)),
            premium: number(word(log.data, 3)), // USDC base units, 6 decimals
            ...where,
          });
        } else if (from === RISK_SWITCH && topic === RISK_LEVEL_CHANGED) {
          // RiskLevelChanged(protocol indexed, symbol, oldLevel, newLevel, harmBps)
          events.push({
            type: "riskLevelChanged",
            protocol: address(log.topics[1]),
            symbol: text(log.data, 0),
            oldLevel: number(word(log.data, 1)),
            newLevel: number(word(log.data, 2)),
            harmBps: number(word(log.data, 3)),
            ...where,
          });
        } else if (from === USDC && topic === TRANSFER && log.topics.length === 3) {
          // Transfer(from indexed, to indexed, value)
          const sender = address(log.topics[1]);
          const receiver = address(log.topics[2]);
          if (sender === AGENT || receiver === AGENT) {
            events.push({
              type: "walletChange",
              direction: receiver === AGENT ? "in" : "out",
              from: sender,
              to: receiver,
              amount: number(word(log.data, 0)), // USDC base units, 6 decimals
              ...where,
            });
          }
        }
      }
    }
  }
  return events.length > 0 ? events : null;
}
