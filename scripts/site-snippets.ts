// Writes the product site's code snippets (site/snippets.js) to files, so each one is run
// before it ships: npm run site:snippets -- <site url> [symbol]
// The contract goes to contracts/test/OddsReader.sol (forge test runs it against the real feed
// on a fork), the API read to logs/snippet-api.mjs.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { getAddress } from "viem";
import { addressOf } from "../src/shared/artifacts.js";

const [site, symbol = "GEMI-BTC2611302200-HI67500"] = process.argv.slice(2);
if (!site) throw new Error("usage: npm run site:snippets -- <site url> [symbol]");
const snippets = new Function(readFileSync("site/snippets.js", "utf8") + "; return snippets;")();
const ctx = { site: site.replace(/\/$/, ""), symbol, feed: getAddress(addressOf("OddsFeed")) };
mkdirSync("logs", { recursive: true });
writeFileSync("contracts/test/OddsReader.sol", snippets.contract(ctx));
writeFileSync("logs/snippet-api.mjs", snippets.api(ctx));
console.log(`contracts/test/OddsReader.sol and logs/snippet-api.mjs written for ${symbol} on ${ctx.site}`);
console.log(JSON.stringify(snippets.agent(ctx), null, 2));
