# Hosting plan: the Lab for judges

Unit 9.5, Nov 18 2026. A plan only: nothing here is deployed. Testnet only.

## What has to be hosted

One Node process (`npm run lab`) that:

- serves the pages and `/api/*`, and holds an open `GET /events` connection (server-sent events) per visitor;
- keeps state in memory (the feed, the caches, a running replay, the desk's agents) and in `logs/*.jsonl` on disk;
- runs timers: the feed every 60 s, the advisor every 60 s;
- signs transactions with three secrets: `DEPLOYER_KEY`, `AGENT_KEY`, `DESK_SEED`;
- makes outbound calls to Gemini, the Arc RPC, Circle Gateway, Aave's and Morpho's APIs;
- listens on a second port for the QuickNode Stream webhook.

So it needs a long-running server with a disk. It does not fit serverless functions or a static host: there is no build step to export, the process must stay up between requests, and two instances would post twice and collide on the deployer's nonce.

## Options

Prices are rough, from memory, for the smallest instance that fits (1 shared CPU, 512 MB to 1 GB). Check each provider's current pricing before choosing.

| Option | What it is | Cost for a judging week | For | Against |
|---|---|---|---|---|
| **A. A small VM** (Hetzner, DigitalOcean, Lightsail) | Ubuntu, Node 22, `git clone`, a systemd unit, Caddy in front for HTTPS | about $5 a month | Full control, a real disk, both ports, nothing sleeps | We patch and watch it ourselves; a domain or a free subdomain is needed for HTTPS |
| **B. A container platform** (Fly.io, Railway, Render) | A Dockerfile or buildpack, secrets in the platform's store, a volume for `logs/` | about $5 to $10 a month; free tiers sleep when idle | HTTPS and deploys handled; secrets never touch a shell history | Needs a Dockerfile (not in the repo today); must be pinned to exactly one instance, with no sleep; the volume costs extra |
| **C. This laptop and a named Cloudflare tunnel** | What `stream:demo` already does for the webhook, for port 8787 too | $0 | Nothing new to build; keys stay where they are | The laptop must stay on and online for the whole judging window; a quick tunnel's address changes on restart, so it needs a named tunnel on a domain we control |
| **D. No hosting: the video and the README** | Judges watch the recording and read the transactions | $0 | No risk | Nobody can try it |

**Recommendation: A for the judging window, with D as the fallback that already exists.** One VM is the closest thing to the machine the project was built and tested on, and the only option that needs no change to how the process runs. C is the fallback if the window is a day or two. B is the better long-term home but costs a Dockerfile and a volume we would be writing during submission week.

## What must change in the code first

Today the server listens on `127.0.0.1` only, and that is the whole of its access control. Hosting it means choosing what the public may call. None of this is built.

1. **Listen address.** Keep `127.0.0.1` and put a reverse proxy in front (Caddy or nginx). The proxy is where HTTPS and the allow-list live.
2. **An allow-list at the proxy.** Public: the pages, `/static`, `GET /api/*`, `GET /events`, `GET /odds/:symbol` (it is paid), the desk's `POST /api/desk/sign-up` and `/api/desk/agents/*`, and `POST /api/demo/:kind/start`. Blocked from outside: `/lab`, `POST /api/ping`, `/api/test-move`, `/api/oracle/publish`, `/api/pay-read`, `/api/agent/run`, `/api/defi/sync`, `/api/desk/reset`. Each of those spends the deployer's or the agent's USDC on request.
3. **Limits on what stays public** (this is unit 10.3, pulled forward): one replay at a time is already true; add a pause between replays, a cap on desk sign-ups per hour, and a cap on what the treasury lends for premiums per day.
4. **A health route** for the host's checks: `GET /api/desk` already answers quickly without touching the chain.

## How the keys stay server-side

- The three secrets live only in the server's environment: a root-owned `EnvironmentFile` for systemd (mode 600), or the platform's secret store. Never in the repository, the image, a build log or a page. `.env` stays gitignored.
- **Use new keys for the hosted copy.** `npm run new-keys` on the server, then fund the new deployer from the faucet. The laptop's keys never leave the laptop, and a leak of the hosted ones costs only what the faucet gave them.
- The hosted deployer would then be a different publisher from the one that owns today's contracts. `OddsFeed.publish` is open to any sender, so it can post; `ProtectionBook`'s treasury and the pools' opt-ins belong to the old deployer. Simplest: deploy a fresh set of contracts from the hosted deployer (`npm run deploy`, about eight transactions) so the hosted copy is self-contained.
- The browser never needs a key. Pages call `/api/*`; the server signs. The desk's agents use the server's four pool wallets; an agent brings no key and is given none. Responses carry addresses and transaction hashes, never keys.
- The QuickNode key and the Gemini sandbox key are optional and the same rule applies.
- Keep the balances small: about 10 testnet USDC on the deployer, 3 on the agent, 1 on each desk wallet. `npm run preflight` reports them.

## What "Connect your agent" needs to work remotely

Today the desk's MCP server (`src/desk/mcp.ts`) speaks stdio: Claude Code starts it as a local process, and each tool is one call to `http://localhost:8787/api/desk/…`. A judge has neither our repository nor our server on their machine.

Two ways, the first already in the code:

1. **Stdio server, remote desk (works today).** `mcp.ts` already reads the desk's address from `DESK_URL` (default `http://127.0.0.1:8787`). A judge clones the repository, runs `npm install`, and adds the server with that variable set: `claude mcp add hedgehog-desk -e DESK_URL=https://<host> -- <repo>/node_modules/.bin/tsx <repo>/src/desk/mcp.ts`. No new transport; the tools already are plain HTTP calls. The cost is that the judge needs Node and a clone. Not yet tried against a remote address.
2. **An HTTP MCP endpoint (about half a day).** Mount the same six tools on the hosted server at `/mcp` with the SDK's Streamable HTTP transport (`StreamableHTTPServerTransport` in `@modelcontextprotocol/sdk`, which the project already depends on; check the installed version's README for the exact Express wiring). A judge then needs one line and nothing else: `claude mcp add --transport http hedgehog-desk https://<host>/mcp`. The Agents page's "Connect your agent" panel would print that line instead of the local one.

What option 2 needs beyond the mount:

- **Sessions.** The tools are stateless apart from the agent id that `sign_up` returns and the client passes back, so the transport can run without session state.
- **Who is calling.** Today anyone who reaches the desk can act as any agent id (`a1`, `a2`, …). On one machine that is fine. Remotely, `sign_up` should return a random token that the other five tools require. That is a small piece of the guardrails phase, not optional once the endpoint is public.
- **The same limits as the pages:** sign-ups per hour and premium lent per day.
- **HTTPS**, which the proxy provides.

## The Stream when hosted

The webhook needs a public HTTPS address. On a VM that is a second proxy route (`/stream` → port 8788) and no tunnel at all, which is simpler than today. `STREAM_WEBHOOK_URL` is set to it and `npm run stream:up` works as it is. The Stream bills per block, about two a second, so it should still run only around demos, or be left off: without it the replays fall back to direct triggers and say so on the page.

## Running cost in testnet USDC

- The feed and the loop: up to about 0.24 USDC an hour, so about 6 a day and 40 for a week. The faucet's daily limit decides whether that is practical. Cheaper: raise the move threshold, lower `FEED_POSTS_PER_HOUR`, or stop the 5-minute loop and let the feed carry all markets.
- A replay: about 0.02 of gas (the premium returns to the deployer). A desk agent: about 0.01.
- Paid reads move $0.001 from the agent's or a desk wallet's Gateway balance to the deployer; the money cycles.

## Risks

| Risk | How likely | What limits it |
|---|---|---|
| Someone drains the deployer's testnet USDC through a public route | Likely within days if the spending routes are open | The allow-list; the limits in step 3; small balances; a new key |
| A key leaks | Low if the secrets stay in the environment | New keys for the hosted copy; testnet only; rotate with `new-keys` and redeploy |
| Anyone can publish to `OddsFeed` or call `sync` | Already true today, hosted or not | Unit 10.3; until then the pages show the publisher's address and the audit states it |
| The process restarts | Certain, sooner or later | systemd restarts it; agents and posts are read back from `logs/`; a replay in progress is lost and can be run again |
| The disk fills with logs | Slow: `logs/` grew to 4.8 MB in two days | A week is fine; rotate if it stays up |
| Two copies post at once (the laptop and the host) | Easy to do by accident | Separate keys and separate contracts for the hosted copy |
| The Arc RPC rate-limits a busy site | Possible with many visitors | The caches already keep chain reads per request few; `/api/demo/agent` reads the chain on each call and should be cached before going public |
| Republishing Gemini's data to the public | A question of terms, not code | "Data provided by Gemini" is on every page; the user reads and accepts Gemini's terms before a public launch |
| A left-on Stream bills QuickNode | Easy to forget | `npm run preflight` fails while one is up; `stream:demo` deletes its Stream on exit |
| A judge's agent is told to buy and it does, with no limit | By design today | Testnet only, the desk's wallets and the treasury's lending are capped in step 3 |

## Steps, if we go ahead with option A

1. Create the VM; install Node 22, Foundry and Caddy; create a user without sudo for the app.
2. `git clone`, `npm install`, `forge build --root contracts`, `npm run new-keys`; fund the two addresses at the faucet.
3. Deploy a fresh set of contracts from the hosted deployer; `npm run gateway:deposit -- 1`.
4. Make the code changes above (allow-list in the Caddyfile; the limits; the desk token; the HTTP MCP endpoint if there is time).
5. A systemd unit for `npm run lab` with the environment file; Caddy for HTTPS.
6. `npm run preflight` on the server; open the site from another network; run one agent and both replays.
7. After judging: stop the unit, sweep the testnet USDC back, delete the VM.

Estimated work: half a day with the stdio route for agents, a day with the HTTP MCP endpoint.
