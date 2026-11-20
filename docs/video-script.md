# Demo video script

About 2 minutes 40 seconds. Screen recording at 1920×1080 with a voice over it. The order is Overview → Oracle → Agents (live, then Connect your agent) → BTC pools (and our pool's replay).

## Before recording

The hosted live demo (https://web-production-195a7b1c.up.railway.app/overview) can be recorded as it is: its Stream is on, so skip steps 1 to 4 and 7. For shot 6, add the desk to Claude Code with the line under "Connect your agent" on the hosted site (`claude mcp add --transport http hedgehog-desk https://web-production-195a7b1c.up.railway.app/mcp`). A silent recording of the hosted site with captions is `docs/video/fallback-demo.mp4`.

1. `npm run demo` in its own terminal: the site and the QuickNode Stream together. Wait for "Stream on, press Ctrl+C to stop"; the top bar then says "QuickNode Stream: on". If it prints "The tunnel stopped", press Ctrl+C and run it again. `npm run oracle` in a second terminal. Wait a minute for the feed.
2. `npm run demo:reset`: the Agents page starts empty and the wallets are funded.
3. `npm run preflight`: every line PASS except Streams, which reports the one `npm run demo` started.
4. Open the top bar's "QuickNode Stream: on" once to check deliveries are arriving.
5. Browser at 100% zoom, one window, no bookmarks bar. Open `/`, `/oracle`, `/agents`, `/pools` once each so they are warm.
6. Have a Claude Code terminal ready with the desk's MCP server added (the line is under "Connect your agent"). Do one dry run of the whole script first; a replay costs about 0.75 testnet USDC, most of which returns to the deployer.
7. After recording: Ctrl+C in the `npm run demo` terminal, then `npm run preflight` to see `Streams 0 up` (the Lab line fails then, because the site stopped with it).

## Shot list

| # | Time | Screen | What to do | Say |
|---|---|---|---|---|
| 1 | 0:00–0:15 | Overview `/overview` | Hold on the page. Point at Gemini's price, then our output | "Blockchains know prices. They don't know what's likely to happen next. Prediction markets do. This is a probability oracle: it takes Gemini's prediction-market prices and puts them on Arc as chances that contracts and AI agents can act on." |
| 2 | 0:15–0:25 | Overview | Point at the agent's part, then the pool's | "Two users. An agent that holds Bitcoin and insures itself. And a lending pool that tightens before the price falls." |
| 3 | 0:25–0:45 | Oracle `/oracle` | Scroll a few rows. Open one market's 7-day history. Click a row's Arc link, show the explorer for two seconds, come back | "The feed is live: about a hundred Gemini markets. For each one, Gemini's bid and ask, our number, and its last post on Arc. Where one outcome is clearly bad for a holder, we show the chance of that outcome. Each post costs about a tenth of a cent, paid in USDC." |
| 4 | 0:45–1:15 | Agents `/agents`, Live | Create demo agent: BTC, $50. Press Run. Let the five steps play; the line follows the market it reads | "This is an insurance desk for agents. This one holds fifty dollars of Bitcoin. It signs up and gets a wallet. It pays a tenth of a cent per read, over x402, through Circle Gateway. It looks only at levels below today's price, takes the nearest one, and buys if the chance is a quarter or more. Bitcoin falling to sixty thousand would cost it about a dollar fifty, so it buys two contracts and pays the premium in USDC on Arc. Nobody approved anything." |
| 5 | 1:15–1:20 | Agents | Point at the "Order to Gemini" row and the bottom strip | "The order is the exact body Gemini's API takes, at the live price. Here it is a ticket and a sandbox order, not real money." |
| 6 | 1:20–1:45 | Agents → Connect your agent, then the Claude Code terminal, then back | Open "Connect your agent", show the one line. Cut to Claude Code: "Insure my 0.001 BTC at the Hedgehog desk." Cut back: a new agent appears and walks the same steps | "Any agent can do this. The desk is an MCP server, six tools. Here Claude Code signs up, pays for its own reads, and chooses a contract by its own reasoning. Same desk, same chain, a different agent." |
| 7 | 1:45–2:05 | BTC pools `/pools` | Hold on the grid. Drag the "What if" slider up through 50, 70, 85. Open one Aave pool; press "Since the market opened" | "The second user is a lending pool. One rule: as the chance of a drop rises, lend less against Bitcoin. These are live Aave and Morpho markets, read only. For each, what the rule would suggest today, and how it would have moved this month. At eighty-five percent: no new borrowing. Open loans carry on." |
| 8 | 2:05–2:30 | `/pools/ours` | Press "Run the replay". Let it play: 75% → 60% → 40% → no new borrowing | "And this pool enforces it onchain. A replay of one real week of Ethereum prices, in thirty seconds. Each post travels through a QuickNode Stream to a keeper, and the risk switch moves the limit in one transaction. Three updates, no person involved." |
| 9 | 2:30–2:40 | Overview, or the README's diagram | Hold | "Gemini's markets, Arc and USDC, x402 payments, QuickNode Streams. Everything you saw is a real testnet transaction, and the stand-ins are labelled. Probability Oracle." |

## If something goes wrong

- **A step shows an error.** The agent's timeline keeps it. Create another agent; the wallets are reused.
- **The replay button says a demo is running.** Wait for it to finish; one demo runs at a time.
- **"QuickNode Stream off: start with npm run demo" in the top bar.** The Stream is not up. The replays still run (the page says "direct trigger"), but say "the server triggers the keeper" instead of "through a QuickNode Stream", or restart the Stream.
- **Claude Code is slow.** Record shot 6 separately and cut it in; the page keeps the agent afterwards under "Agents".

## Lines to keep honest

- Say "testnet" at least once, and "paper trade" or "ticket" when the Gemini order is on screen.
- The pools tab is advice: say "suggest", never "set".
- "No new borrowing", never "freeze" or "pause".
