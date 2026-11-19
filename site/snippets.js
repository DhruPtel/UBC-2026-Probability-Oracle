// The three ways to read the oracle, as text (unit 11.10). No DOM here: the pages show these,
// and scripts/site-snippets.ts writes the same text to files so each one is run before it ships.
const snippets = {
  // A contract on Arc reads the feed for free.
  contract: ({ symbol, feed }) => `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IOddsFeed {
    struct Odds {
        uint16 probBps;     // chance of YES, 0 to 10000
        uint64 observedAt;  // when Gemini was read, unix seconds
        uint64 publishedAt; // block time of the post
        bytes32 sourceHash; // hash of the source data
        uint32 round;       // 0 means never posted
    }

    function latestBySymbol(string calldata symbol) external view returns (Odds memory);
}

contract OddsReader {
    // OddsFeed on Arc testnet, chain 5042002
    IOddsFeed public constant FEED = IOddsFeed(${feed});
    string public constant MARKET = "${symbol}";

    // The feed stores the chance of YES. This returns the chance of NO, in basis points.
    // If YES is the bad outcome for you, use probBps as it is.
    function chanceOfNo() external view returns (uint256) {
        IOddsFeed.Odds memory o = FEED.latestBySymbol(MARKET);
        require(o.round > 0, "never posted");
        return 10000 - o.probBps;
    }
}
`,
  // Any program pays $0.001 USDC per read over x402, through Circle Gateway.
  api: ({ symbol, site }) => `// npm install @circle-fin/x402-batching viem
// PRIVATE_KEY is an Arc testnet wallet holding testnet USDC (https://faucet.circle.com).
import { GatewayClient } from "@circle-fin/x402-batching/client";

const client = new GatewayClient({ chain: "arcTestnet", privateKey: process.env.PRIVATE_KEY });

// Once per wallet: move testnet USDC into Circle Gateway to pay reads from.
// await client.deposit("1");

const read = await client.pay("${site}/odds/${symbol}"); // $0.001 USDC
console.log(read.data.probBps / 100 + "% chance of YES, round " + read.data.round);
`,
  // An agent connects to the desk's MCP server.
  agent: ({ site }) => ({
    "Claude Code": `claude mcp add --transport http hedgehog-desk ${site}/mcp`,
    "Claude desktop": JSON.stringify({ mcpServers: { "hedgehog-desk": { command: "npx", args: ["-y", "mcp-remote", `${site}/mcp`] } } }, null, 2),
    Cursor: JSON.stringify({ mcpServers: { "hedgehog-desk": { url: `${site}/mcp` } } }, null, 2),
  }),
};
const AGENT_FILES = { "Claude Code": "Run once in a terminal", "Claude desktop": "claude_desktop_config.json", Cursor: ".cursor/mcp.json" };
const TOOLS = [
  ["sign_up", "Declare what the agent holds; it gets a wallet on Arc testnet."],
  ["check_risks", "Read the chance of each bad outcome. $0.001 USDC a read."],
  ["list_contracts", "Every Gemini contract that matches the holding, with its price."],
  ["quote_cover", "A firm quote for cover on one contract."],
  ["buy_cover", "Pay the premium in USDC on Arc."],
  ["my_cover", "What the agent holds and what its cover pays."],
];
