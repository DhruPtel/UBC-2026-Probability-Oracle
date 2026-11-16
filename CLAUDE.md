# CLAUDE.md — Hedgehog

Hackathon project for UBC 2026: a probability oracle that lets AI agents insure themselves.
**Every session, read in this order:** this file (the rules), `PLAN.md` (design, units, schedule, cut list), `LESSONS.md` (what has already cost us time).

## How we build

Bottom up, in small sections. This is not a production-grade, one-shot build. Each unit is the smallest proof of concept that runs end to end: the plain working path first, layers on top in later units. If you catch yourself designing for a later phase, stop.

Do **not** add any of these unless the unit explicitly lists it:

- abstractions, interfaces or classes for a single implementation; plugin or config systems; generic helpers "for later";
- retries, caching, rate limiting, validation or schema layers, error-handling frameworks, security hardening;
- monorepo tooling, Docker, CI, logging libraries, env-schema libraries, extra dependencies;
- files the unit doesn't list.

Prefer plain scripts, one file until it hurts, and hardcoded values in a small config. **When unsure, ask. Don't add.**

## Working rules

1. **One unit at a time.** Build only the unit you were asked to build, as defined in `PLAN.md`. Don't start the next unit until the user says go.
   - **Unit numbers always match build order.** If the order needs to change, stop and renumber `PLAN.md` first (as a docs-only unit), before building.
2. **Every unit ends the same way:**
   - (a) it runs end to end;
   - (b) `npm run typecheck` passes, plus `forge test` / `npm test` if core logic changed;
   - (c) `LOG.md` is up to date, and `LESSONS.md` if anything surprised you;
   - (d) the unit is ticked in `PLAN.md`;
   - (e) the git check and the git commands for the user (see Git below);
   - (f) a short report (template below).
3. **Every unit ends with its See it check:** tell me exactly what to open, what to click and what I should see. The checks are the "See it" lines in `PLAN.md`.
4. **Guardrails wait for Phase 7.** Before then: no limits, caps, allowlists, rate limits, retries, validation layers or security hardening. The agent's budget, owner approval and the oracle's data checks are product features, built in Phase 7 and kept simple.
5. **Secrets are the one early exception.** Never commit or print private keys, API secrets or `.env` contents.
   - Keys live only in `.env`, which is gitignored. `.gitignore` exists before any key is generated.
   - Scripts print addresses, never keys.
   - Deploy scripts read keys from env, never from command-line arguments.
   - Never ask the user to paste a key in chat; they fill in `.env`.
6. **Real integrations over mocks.** If a real service is blocked, say so and propose the simplest stand-in. Label every stand-in in code, logs, the UI and the README. Labels in use: `PAPER TRADE`, `REPLAY`, `DECLARED HOLDING`.
7. **Testing** means it runs end to end, plus a typecheck. Write small tests only for core logic: `policy.decide()`, odds math, and contract budget and approval math.
8. **When you need the user** (keys, faucet funds, accounts, a decision), start the message with `BLOCKED:`. Say exactly what you need and why.
9. **Keep spend low.**
   - No LLM calls inside loops. Small models for the optional one-shot calls.
   - Run the QuickNode Stream only while it's in use (`npm run stream:down` afterwards); it bills per block, at about 2 blocks/s.
   - Default intervals are 5 min for the oracle and the agent, to save faucet USDC.
10. **Real money and terms belong to the user.**
    - Never place a production (real-money) Gemini order without the user's explicit OK for that specific order. Sandbox orders are fine.
    - The user accepts terms of service (Gemini, Circle, QuickNode) themselves.
11. **Hackathon rules.**
    - Code must be substantially built during the hackathon (Nov 12–20, 2026), in this fresh repo.
    - Copy no code from the user's other project, Vivarium; ideas are fine.
    - Credit every open-source inspiration in the README's Credits section.

## Lab and dashboard UI

For Lab and dashboard UI, use the frontend-design skill. The Lab is a workbench: one consistent, restrained, readable look across panels. Save the bold design pass for 6.2. New panels reuse the CSS variables at the top of `lab/index.html`.

## Records

- **`LOG.md`**: after every change (each edit or step), append an entry under `## YYYY-MM-DD HH:MM · <unit id>`. At most 2–3 sentences: what you did, which files changed, and why. Append only.
- **`LESSONS.md`**: whenever something surprises you or costs time (an API quirk, wrong docs, a failed approach, a setup gotcha), add a short entry: what happened → the lesson → what to do next time.
- **`PLAN.md`**: tick units as they finish. Log any change to the plan in `LOG.md`.

## Git

- **Remote:** `https://github.com/DhruPtel/UBC-2026-Probability-Oracle` (public), branch `main`.
- **Claude never commits or pushes.** The user does both.
- **At the end of each unit, give me exactly:** `git status`, `git add .`, `git commit -m "<one-line summary>"`, `git push`. Before that, check that `git status` lists no `.env`, keys or `logs/`.
- **Message:** one line, `<unit id>: <what works now>`. Example: `1.1: repo setup, Arc connection works`.

## End-of-unit report template

```
Unit: <id> <name>
Runs: <command> → <short output excerpt>
Stand-ins: <labels used, or "none">
Notes: <anything surprising, one or two lines>
Git: <git status check result>, then the add / commit / push commands
Next: <next unit id>, waiting for go
```

## Project facts

| | |
|---|---|
| Arc testnet | chain `5042002` (`0x4cef52`) · RPC `$ARC_RPC_URL` (QuickNode), fallback `https://rpc.testnet.arc.io` (`rpc.testnet.arc.network` also answers) · explorer `https://explorer.testnet.arc.io` · faucet `https://faucet.circle.com` |
| USDC on Arc | ERC-20 `0x3600000000000000000000000000000000000000`, **6 decimals**. Native gas is the same balance at **18 decimals**. Use the ERC-20 interface for app logic |
| Arc quirks | The public RPC allows at most 10,000 blocks per `getLogs` call. About 0.5 s blocks, no reorgs. `block.timestamp` can repeat (order by block number). `PREVRANDAO` = 0. viem has `arcTestnet` built in |
| Gemini | Public data at `https://api.gemini.com/v1/prediction-markets/...`, no key. Sandbox trading at `https://api.sandbox.gemini.com`. Take `instrumentSymbol` from the API. Prices 0.01–0.99 ≈ probability, $1 payout. Public calls ≤ 1/s. Responses are large: filter by category, keep `limit` small, never print raw JSON. Prices are at `contract.prices.bestBid` / `bestAsk` / `lastTradePrice` (strings, any can be missing). Volume is per event. History: `https://api.gemini.com/v2/candles/<instrumentSymbol>/<1hr|1day>`. Attribute: "Data provided by Gemini" |
| x402 | Circle Gateway Nanopayments. Facilitator `https://gateway-api-testnet.circle.com`, network `eip155:5042002`. Packages `@circle-fin/x402-batching`, `@x402/core`, `@x402/evm`. The buyer must be an EOA. No Circle API key needed. Paid endpoint: `GET /odds/:symbol` at $0.001. A payment is accepted at once and settles onchain later in a batch |
| Streams | QuickNode, Arc testnet, Logs dataset, `function main(stream)` filter, webhook destination |
| Wallets | Two keys only. `DEPLOYER_KEY`: deployer, oracle publisher, x402 seller, book owner, treasury. `AGENT_KEY`: the agent |

## Commands

These are added unit by unit. Keep this list current.

- `npm run typecheck`: TypeScript check, no emit.
- `npm test`: unit tests for core logic (Node's built-in runner through `tsx --test`).
- `npm run new-keys`: creates `.env` if missing and fills in empty wallet keys. Prints addresses only.
- `npm run check:arc`: chain ID, latest block, and both wallets' USDC and native balances.
- `npm run deploy -- <Name>`: builds the contracts, deploys `<Name>` to Arc testnet and records it in `deployments/arc-testnet.json`.
- `npm run hello -- <text>`: sends `Hello.ping(text)` and reads the message back.
- `npm run feed [symbols…]`: reads OddsFeed for our markets. `npm run feed -- publish <test:symbol> <percent>` publishes a manual test value.
- `npm run oracle -- --once`: publishes each configured market's live Gemini YES probability to OddsFeed once. `npm run oracle` loops every `ORACLE_INTERVAL_S` seconds (default 300). Stop the loop when it isn't needed; it spends gas.
- `npm run gateway:deposit -- <usdc>`: deposits USDC from the agent's wallet into Circle Gateway (needed once before paid reads).
- `npm run pay-read -- <symbol>`: pays $0.001 as the agent for one odds read from the running Lab server.
- `forge build --root contracts`: compile the contracts.
- `forge test --root contracts`: contract tests.
- `npm run lab`: starts the Lab at `http://localhost:8787` (this machine only). Ctrl+C stops it.

## Network access the build needs

`api.gemini.com`, `api.sandbox.gemini.com`, `ws.gemini.com`, `ws.sandbox.gemini.com`, the Arc RPC hosts above, `api.quicknode.com`, `gateway-api-testnet.circle.com`, `registry.npmjs.org`, `binaries.soliditylang.org`, and Foundry install hosts.

If a host is refused, report it with `BLOCKED:`. Don't route around it.
