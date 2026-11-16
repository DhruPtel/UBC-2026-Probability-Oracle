# LOG

A running record of every change. After each edit or step, append an entry under
`## YYYY-MM-DD HH:MM · <unit id>` with at most 2–3 sentences: what was done, which files
changed, and why. Append only; never rewrite old entries. Times are Pacific.

## 2026-11-16 00:45 · 0 (planning)

Re-checked the research with read-only commands: `node` v22.23.1, `forge` 1.8.3, Gemini events endpoint HTTP 200, and `eth_chainId` = `0x4cef52` (5042002) on both `rpc.testnet.arc.io` and `rpc.testnet.arc.network`. No files changed in this step. Results went into PLAN.md §0.7 in a later entry.

## 2026-11-16 00:47 · 0 (planning)

Rewrote `CLAUDE.md`: added the "How we build" and "Records" sections, and replaced the Git section so the user commits and pushes while Claude runs `git status` and hands over the commands. Also dropped the `Commit:` line from the report template, added a Wallets row to the project facts, and emptied the Commands list because no command exists yet.

## 2026-11-16 00:48 · 0 (planning)

Added `PLAN.md` §0.7 with the re-check results and what the Gemini response changes: a 1.3 MB response for 3 events, no `priceHistory` in the list response, and `lastTradePrice` sometimes missing. Marked §6 blocker 1 (where we build) and item 6 (cloudflared) as resolved, since the build runs locally on WSL2.

## 2026-11-16 00:48 · 0 (planning)

Simplified `PLAN.md` after the review, with five new rows in the §1 Decisions table. Changes: two keys only, both generated in 1.1 (4.1 needs the agent key on Day 1, before 3.3; treasury and owner are the deployer address); one viem `scripts/deploy.ts` instead of a `.s.sol` script per contract; hand-written `parseAbi` ABIs in `src/shared/abi.ts` instead of reading Foundry's `out/`; `logs/*.jsonl` by `appendFileSync`; `npm test` on Node's built-in runner. Dropped `src/shared/env.ts`, the README stub from 1.1 and `forge init` from 1.2.

## 2026-11-16 00:48 · 0 (planning)

Tightened unit text in `PLAN.md` so every "done when" names a command: 2.1 (category filter, `priceHistory` check on the single-event endpoint), 2.2 (deploy command, `forge-std` arrives here), 2.3 (no-publish case, `logs/odds.jsonl`), 3.3 (no key generation, a checkpoint after the onchain tx), 6.2 (dashboard typecheck command). Phases, schedule and cut list are unchanged.

## 2026-11-16 00:49 · 1.1, 1.2 (plan only)

Replaced the Phase 1 section of `PLAN.md` with the detailed plan for 1.1 and 1.2: exact files and contents, ordered steps, command-level "done when" checks, and what the user must provide. `.gitignore` is now step 1 of 1.1 and is verified with `git check-ignore .env` before any key exists.

## 2026-11-16 00:50 · 0 (planning)

Created `LOG.md` and `LESSONS.md` with headers, and recorded this session's surprises in `LESSONS.md`. No project code was written; unit 1.1 waits for go.
