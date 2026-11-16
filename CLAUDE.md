# CLAUDE.md — Hedgehog

Hackathon project for UBC 2026: a probability oracle that lets AI agents insure themselves.
**Read `PLAN.md` first.** It holds the design, the units, the schedule and the cut list. This file holds the working rules. They apply to every session.

## Working rules

1. **One unit at a time.** Build only the unit you were asked to build, as defined in `PLAN.md`. Don't start the next unit until the user says go.
2. **Every unit ends the same way:**
   - (a) it runs end to end;
   - (b) `npm run typecheck` passes, plus `forge test` / `npm test` if core logic changed;
   - (c) a commit whose message explains the progress (see Git below);
   - (d) a short report (template below);
   - (e) tick the unit in `PLAN.md`.
3. **No extras.** No features, files, dependencies or abstractions the unit doesn't list. If something seems missing, ask; don't add it.
4. **Bottom up: the plain path first.** Before Phase 7, add none of these:
   - limits, caps or allowlists;
   - rate limits or retries;
   - validation layers or security hardening.

   The agent's budget, owner approval and the oracle's data checks are product features, built in Phase 7 and kept simple.
5. **Secrets are the one exception to rule 4.** Never commit or print private keys, API secrets or `.env` contents.
   - Keys live only in `.env`, which is gitignored.
   - Scripts print addresses, never keys.
   - Deploy scripts read keys from env, never from command-line arguments.
   - Never ask the user to paste a key in chat; they fill in `.env`.
6. **Real integrations over mocks.** If a real service is blocked, say so and propose the simplest stand-in. Label every stand-in in code, logs, the UI and the README. Labels in use: `PAPER TRADE`, `REPLAY`, `DECLARED HOLDING`.
7. **Testing** means it runs end to end, plus a typecheck. Write small tests only for core logic: `policy.decide()`, odds math, and contract budget and approval math.
8. **When you need the user** (keys, faucet funds, accounts, a decision), start the message with `BLOCKED:`. Say exactly what you need and why.
9. **Keep spend low.**
   - No LLM calls inside loops.
   - Use small models for the optional one-shot calls.
   - Run the QuickNode Stream only while it's in use (`npm run stream:down` afterwards); it bills per block, at about 2 blocks/s.
   - Default intervals are 5 min for the oracle and the agent, to save faucet USDC.
10. **Real money and terms belong to the user.**
    - Never place a production (real-money) Gemini order without the user's explicit OK for that specific order. Sandbox orders are fine.
    - The user accepts terms of service (Gemini, Circle, QuickNode) themselves.
11. **Hackathon rules.**
    - Code must be substantially built during the hackathon (Nov 12–20, 2026), in this fresh repo.
    - Copy no code from the user's other project, Vivarium; ideas are fine.
    - Credit every open-source inspiration in the README's Credits section.

## End-of-unit report template

```
Unit: <id> <name>
Runs: <command> → <short output excerpt>
Commit: <hash> <message>
Stand-ins: <labels used, or "none">
Notes: <anything surprising, one or two lines>
Next: <next unit id>, waiting for go
Push: run `git push` when you're ready
```

## Git

- **Remote:** `https://github.com/DhruPtel/UBC-2026-Probability-Oracle` (public), branch `main`.
- **Commit regularly:** at the end of every unit, and at any working checkpoint inside a long unit.
- **Message:** a subject line `<unit id>: <what changed>`, then a 1–3 line body saying what works now and what's next. Example:

  ```
  2.3: publish Gemini odds to OddsFeed

  Oracle fetches live Gemini odds and writes them to OddsFeed on Arc testnet;
  `npm run feed` reads them back. Next: 3.1 Gemini sandbox order.
  ```
- **Never push.** The user pushes every commit themselves. End each report with the reminder to `git push`.
- **Never commit** `.env`, keys or `logs/`.

## Project facts

| | |
|---|---|
| Arc testnet | chain `5042002` · RPC `$ARC_RPC_URL` (QuickNode), fallback `https://rpc.testnet.arc.io` · explorer `https://explorer.testnet.arc.io` · faucet `https://faucet.circle.com` |
| USDC on Arc | ERC-20 `0x3600000000000000000000000000000000000000`, **6 decimals**. Native gas is the same balance at **18 decimals**. Use the ERC-20 interface for app logic |
| Arc quirks | About 0.5 s blocks, no reorgs. `block.timestamp` can repeat (order by block number). `PREVRANDAO` = 0. viem has `arcTestnet` built in |
| Gemini | Public data at `https://api.gemini.com/v1/prediction-markets/...`, no key. Sandbox trading at `https://api.sandbox.gemini.com`. Take `instrumentSymbol` from the API. Prices 0.01–0.99 ≈ probability, $1 payout. Public calls ≤ 1/s. Attribute: "Data provided by Gemini" |
| x402 | Circle Gateway Nanopayments. Facilitator `https://gateway-api-testnet.circle.com`, network `eip155:5042002`. Packages `@circle-fin/x402-batching`, `@x402/core`, `@x402/evm`. The buyer must be an EOA |
| Streams | QuickNode, Arc testnet, Logs dataset, `function main(stream)` filter, webhook destination |

## Commands

These are added unit by unit. Keep this list current.

- `npm run typecheck`: TypeScript check, no emit.
- `npm test`: unit tests for core logic.
- `cd contracts && forge test`: contract tests.

## Network access the build needs

`api.gemini.com`, `api.sandbox.gemini.com`, `ws.gemini.com`, `ws.sandbox.gemini.com`, the Arc RPC hosts above, `api.quicknode.com`, `gateway-api-testnet.circle.com`, and Foundry install hosts.

If a host is refused, report it with `BLOCKED:`. Don't route around it.
