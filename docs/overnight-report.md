# Overnight report, Nov 19

**Live site: https://web-production-195a7b1c.up.railway.app**

Written at 10:45 UTC on Nov 19 (2:45 am Pacific). This is the second batch (11.0 to 11.8); the first one had already put the site on Railway.

| Step | Result |
|---|---|
| 11.0 Check | DONE. Typecheck, 30 tests and 20 contract tests pass. Preflight fails two lines on purpose: the hosted Stream is up, and no local server runs |
| 11.1 Cover pick, read count, real MCP | DONE |
| 11.2 Hosting prep | DONE, except the local Docker run: BLOCKED, `The command 'docker' could not be found in this WSL 2 distro. We recommend to activate the WSL integration in Docker Desktop settings.` Railway builds and runs the same Dockerfile |
| 11.3 Deploy to Railway | DONE |
| 11.4 Switch over | DONE |
| 11.5 Judge walkthrough | DONE: every check passes after three fixes |
| 11.6 README and docs | DONE |
| 11.7 Fallback video | DONE: `docs/video/fallback-demo.mp4`, 2:50, 5.5 MB |
| 11.8 Hand-off | DONE: `docs/handoff.md` |
| `git push`, every step | BLOCKED: `fatal: could not read Username for 'https://github.com': No such device or address`. This shell has no GitHub login. All commits are local on `main` |

## What you need to do

1. **Push.** On this computer, before you leave it: `git status`, then `git push`. Until then GitHub shows the old README, and a clone on the other computer gets none of this.
2. **Record or upload the video.** Upload `docs/video/fallback-demo.mp4` (silent, captioned) to YouTube or Drive, or record your own with a voice from `docs/video-script.md`. Put the link in the README (the line "Video: coming soon") and in `docs/submission.md`.
3. **Add the team members on Devpost.**
4. **Paste `docs/submission.md` into Devpost.** Its first table has every field: name, tagline, tracks, bounties, built with, repository, live site, video.
5. **Submit before Friday Nov 20, 12:00 pm CST (10:00 am Pacific).**
6. **Pause the Stream after Saturday:** `npm run stream:down -- 87b65c4a-937d-456c-90fc-576b50b127a9` (see `docs/handoff.md`).
7. **Delete the older Railway project `observant-upliftment`** in the dashboard. It is linked to the GitHub repository, so your push will make it build and then crash for lack of variables. The live project, `probability-oracle`, is not linked to GitHub.
8. **Do not run `npm run demo`, `npm run lab` or `npm run oracle`** on either computer while Railway is live. `LOOPS=off npm run lab` is safe.

## What changed

- **Cover pick.** The built-in agent takes the cheapest Nov 30 contract priced from $0.50 to $0.80; if none is in that range, the closest. On the live site it bought 4 contracts of "BTC ends below $65,000" at $0.60. "Why this amount" ends with the contract and the reason in one line.
- **Replay read count.** The page counted posts as reads. It now counts the real payments, each once.
- **Real MCP on the live site.** The desk's six tools are at `/mcp` over HTTP. "Connect your agent" gives the line `claude mcp add --transport http hedgehog-desk https://web-production-195a7b1c.up.railway.app/mcp`. A real MCP client (`npm run mcp:check`) signed up, paid for five reads and bought 2 contracts for a 1.20 USDC premium; it shows on the page as "Your agent". A sign-up from the page is always a demo agent.
- **Hosting.** `/health`, `LOOPS=off`, a 2-minute gap between replays, daily caps (200 agents, 60 replays), 5 MCP sign-ups an hour per address, a keep-alive on live updates every 20 s, one replica that never sleeps and restarts on failure.
- **Walkthrough fixes.**
  - The agent replay failed once: its top-up woke the live agent, which spent it on a live threat first. Fixed.
  - After that failure the Agents page drew nothing. Fixed.
  - BTC pools had no "Data provided by Gemini". Added.
- **README.** New order, two diagrams, 1,393 words; the detail moved to `docs/how-it-works.md`. Both diagrams render with mermaid-cli.
- **Screenshots.** `docs/screenshots/` holds 20 new ones from the live site.

## Balances and how long they last

At 10:40 UTC:

| Wallet | Testnet USDC | Lasts |
|---|---|---|
| Deployer (publisher, keeper, treasury) | 24.02 | About 0.14 an hour on posts: about 5 days until the 5 USDC pause, so past Sunday |
| Agent | 2.50 | The deployer tops it up before each replay |
| Desk wallets (4) | 0.15, 0.15, 1.00, 0.15 | The deployer tops one up at a sign-up when it is nearly empty |

None should run out before Sunday. The rate is measured (0.79 USDC over 5.6 hours overnight); the days are my arithmetic from it. Premiums go back to the deployer, so only gas leaves. If many judges create agents, top the deployer up at faucet.circle.com.

## The Stream and Railway

- **Stream:** `active`, delivering to the live site's `/stream` 1 to 2 seconds after each block, signature checked. It was created at 04:07 UTC with the token Railway holds, so it was not re-pointed in this batch. That token is now also in `.env` as `STREAM_TOKEN`.
- **Stream cost:** QuickNode's counter shows 1,233,750 credits used this billing period, of 80 million. At about 142,000 an hour it will have used about 11 million by Saturday midnight (my estimate).
- **Railway cost:** Railway's API gives usage, not dollars. The service averages 0.005 vCPU and 0.18 GB of memory. At Railway's listed prices as I remember them, that is about $0.07 a day; check the dashboard's own estimate.

## Transactions

- A post by the hosted publisher after the switch: https://explorer.testnet.arc.io/tx/0x8a364294c53a4a9558ab02ab531e138015f0b61b6d2664db4c4c4d033fd9f0ae
- A sync a Stream delivery triggered on the live site (to "No new borrowing"): https://explorer.testnet.arc.io/tx/0x90272ab450de0279ca7e1dddb7b600675ccd7eabf4c2abfcb5d26dd05e278e09
- The agent replay's premium: https://explorer.testnet.arc.io/tx/0x00cd325aa4377257b314f653565eb74d362da5061d23708eba90e3c5e74ba164
- The live agent's purchase that broke the first replay: https://explorer.testnet.arc.io/tx/0x98bc32648eb7649e10e5f053267a957878b31859e85de4d700fd74a019e7151f

## Things I was not sure about

- **The older BTC agent still buys at any price.** The $0.50 to $0.80 range is in the desk's agent, which is what you asked for. The older agent behind the replay bought 4 Fed-hike contracts at $0.93 on the live site (3.72 testnet USDC, which went to the deployer). It is covered now and will not buy that again. Say if you want the same range there.
- **Anyone can act as any agent id over `/mcp`.** The hosting plan suggested a per-agent token. You said no guardrails, so there is none; the caps above are the only limits.
- **Two agents named "MCP check"** are on the Agents page from my test. The first is from a run that stopped at a bug in my script.
- **No seed file for the first visit.** The candle cache is on the volume and the home page's data is read at boot. Pages loaded in 0.2 to 0.7 s and data within 1.7 s.
- **`docs/video/demo.mp4` was replaced** by `fallback-demo.mp4`, and the old screenshots were deleted, as asked.
- **`docs/plan-agent-desk.md` still mentions a guardrails phase.** It is a dated plan, left as written; `docs/hosting-plan.md` is marked superseded.
- **`.env` has a `RAILWAY_TOKEN` line** that was there before. I did not use or change it.
- **caffeinate:** this is Linux (WSL), so it was not started.
