# Unit 0.4: the Solana option

Researched Mon Nov 16, 2026, about 12:00 Pacific. Research only: nothing was installed or changed.

How to read this file:

- Every factual claim carries a source number like [3]; the list is in section 10.
- **UNVERIFIED** means I could not confirm the claim from a primary source today. `solana.com` answered HTTP 429 (rate limited) to every request, so most Solana core facts are marked this way and come from general knowledge or search snippets.
- Hour figures are my estimates, not measurements.
- The guide file is `docs/Hackathon Guide UBC 26 (1).pdf` (there is no `docs/hackathon-guide.pdf`).

## 1. Summary

1. Moving to Solana is feasible but costs about 14 to 20 extra hours against about 17 hours of work still planned and 3.5 days left.
2. The prize difference is $500: Best use of Solana pays $1,500, Best use of Arc pays $1,000, and a team can win only one [1].
3. Everything paid for on Arc so far would be rebuilt: two contracts, the publisher, the x402 payment path, the Stream and parts of the Lab. The Gemini reader, odds math, Gemini trading and the UI shell survive.
4. Circle Nanopayments does not support Solana [2]. x402 still works on Solana devnet through the public `x402.org` facilitator with no API key [3][4], but each payment settles as its own onchain transfer.
5. QuickNode Streams supports Solana devnet with a "Programs + Logs" dataset [5][6], so that bounty survives a move.
6. Nothing Solana is installed on this machine: no Rust toolchain is selected, and the Solana CLI and Anchor are missing. WSL has 5 GB of RAM, which is tight for Rust builds.
7. A hybrid does not help: the chain awards are exclusive and each requires the core onchain functionality on its own chain [1].
8. Recommendation: stay on Arc (option A). The project already matches the Arc award's stated objectives almost line for line, and the switch risks the whole submission for $500.

## 2. Comparison

| | A: stay on Arc | B: switch to Solana devnet | C: hybrid |
|---|---|---|---|
| Chain award | Best use of Arc, $1,000 [1] | Best use of Solana, $1,500 [1] | Still only one of the two [1] |
| Other prizes | Track $2,000, Gemini up to $2,500, QuickNode $500, overall up to $2,500: unchanged [1] | Same list; all still reachable in principle | Same list |
| Extra hours | 0 | 14 to 20 (section 6) | 4 to 8 on top of A, or all of B plus more |
| Thrown away | Nothing | `OddsFeed.sol`, `Hello.sol`, Foundry tests, deploy script, viem chain code, Gateway deposit and pay scripts, the arc-testnet Stream and filter, verified contracts and onchain history | Depends on the split; usually the cross-chain glue is new work nobody asked for |
| Sponsor tools | Arc, Circle Gateway Nanopayments, x402, QuickNode Streams, Gemini | Solana, Anchor, SPL Token, x402 (`x402.org` facilitator), QuickNode Streams, Gemini. Circle only as the USDC issuer | Both sets, each used more thinly |
| Fit with the award text | Strong: "USDC as gas", "Foundry", "Combine Arc with Circle tools like ... Gateway" [1] | Partial today: needs Anchor programs, SPL tokens, an existing protocol and wallet UX to be competitive [1] | Weak for whichever award is picked |
| Biggest risks | A crowded Arc field (unknown) | New toolchain and language mid-week; 5 GB RAM builds; devnet faucet limits; no finished demo by Friday | Twice the surface, no extra prize |

## 3. Component-by-component mapping for (B)

### 3.1 OddsFeed as an Anchor program

- **Accounts.** One account per market at a program-derived address (PDA) with seeds such as `["market", sha256(symbol)]`, holding `prob_bps`, `observed_at`, `published_at`, `source_hash`, `round` and the symbol. Seeds are limited to 32 bytes each, so the symbol must be hashed. UNVERIFIED today (general knowledge; reference [7]).
- **Publish instruction.** `publish(symbol, prob_bps, observed_at, source_hash)` with `init_if_needed` for the first write. The payer funds the account's rent deposit once. Today's contract lets anyone publish; on Solana the same choice means anyone can pay to create market accounts. UNVERIFIED today [7].
- **Events.** Anchor's `emit!` writes a base64 "Program Data:" line into the transaction logs, and clients decode it with `addEventListener()`. Logs can be truncated by RPC providers. `emit_cpi!` stores the event in an inner instruction instead, which is less likely to be truncated, but cannot be subscribed to directly [8].
- **How other programs read it.** ProtectionBook would take the market account as an input, check that it is owned by the OddsFeed program, and deserialize it. No call into OddsFeed is needed. UNVERIFIED today [7].
- **What is lost.** `prevProbBps` in the event is easy to keep. Onchain history is not: the Lab's chart reads past `OddsUpdated` logs by block range, and Solana has no `getLogs` equivalent by range, so history would come from `getSignaturesForAddress` plus one `getTransaction` per publish, or from our own log file. UNVERIFIED today.

### 3.2 ProtectionBook as an Anchor program

- **Premium transfer.** `buy_protection(market, contracts, premium, order_ref)` moves USDC from the agent's token account to the treasury's with a cross-program call (CPI) to the SPL Token program. Anchor builds a CPI from a `CpiContext` and, when a PDA must sign, attaches seeds with `with_signer()` [9]. The token helper would be `anchor_spl`'s `transfer_checked`: UNVERIFIED today, the page I could read covers only System Program transfers [9].
- **Budget (later).** A config PDA holds `owner`, `budget` and `spent`. The program rejects a purchase that would exceed the budget. A second line of defence is the SPL "delegate" allowance: the owner approves the book's PDA for a fixed amount, which caps spending at the token level, like an ERC-20 allowance. UNVERIFIED today.
- **Owner approval (later).** Purchases above a threshold create a "pending" PDA; a second instruction signed by the owner executes it. This mirrors the Solidity design and adds one account type and one instruction. UNVERIFIED today.
- **Cost against Solidity.** Solidity `transferFrom` is one line. The Anchor version needs an accounts struct with mint, two token accounts, the token program and the PDAs, plus client code that derives all of them. Expect 1.5 to 2 times the planned time.

### 3.3 Publisher and scripts

- `src/shared/chain.ts`, `artifacts.ts`, `deploy.ts`, `feed.ts`, `hello.ts`, `check-arc.ts`, `new-keys.ts` and `publisher.ts` are all rewritten. viem is replaced by the Anchor TypeScript client and a Solana library.
- x402's own docs use `@solana/kit` to build the signer (`createKeyPairSignerFromBytes`) [10]. The Anchor TypeScript client is built on the older `@solana/web3.js`: UNVERIFIED today. The likely outcome is both libraries in one repo.
- Deploy becomes `anchor build` and `anchor deploy`, and the IDL file replaces the Foundry ABI artifact. UNVERIFIED today [11].

### 3.4 Wallets and funding

- Two keypairs replace the two EVM keys. Keys are base58 or a JSON byte array instead of hex. UNVERIFIED today.
- **SOL for fees.** The web faucet allows "2 requests every 8 hours", with a higher limit after GitHub sign-in [12]. The CLI airdrop is "currently" 5 SOL per request and is often rate limited [11]. The faucet page asks that AI agents not use it [12], so you would request funds yourself.
- **Program deploys need SOL.** The official figure in a search snippet is about 0.7 SOL of rent deposit per 100 KB of program, and a rent reduction is rolling out: UNVERIFIED [13]. Two Anchor programs of a few hundred KB each could need several SOL, which collides with the faucet limits.
- **USDC.** Circle's faucet lists Solana Devnet, 20 USDC per request, one request per asset and network every 2 hours [14]. The devnet USDC mint is `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` [15].
- Fees are paid in SOL, not USDC, so the "one balance for gas and payments" story from Arc is gone.

### 3.5 x402 on Solana devnet

- **Verified: Nanopayments is not available.** Circle's Gateway page says "Gateway supports USDC nanopayments on all blockchains except Solana" and that "the Nanopayments SDK supports only EVM blockchains" [2]. Circle's other facilitator, Facilitator Service, runs on Arc, Base and Polygon PoS only [16].
- **Scheme.** `exact`, where the transfer method is an SPL token transfer; any SPL or Token-2022 token works [4]. Network ID for devnet: `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` [4].
- **Facilitators that work on devnet without a key:**
  - `https://x402.org/facilitator`. I called its `/supported` endpoint with no key and it lists `exact` on Solana devnet with a fee payer address [3]. The docs call it the default, "requires no setup", testnet only [4].
  - `https://facilitator.payai.network`. Its `/supported` endpoint, also called with no key, lists `exact` and `batch-settlement` on Solana devnet [17]. The x402 docs describe it as "No API keys required" [18].
- **Packages.** Seller: `@x402/express`, `@x402/core`, `@x402/svm` with `ExactSvmScheme` [19]. Buyer: `@x402/fetch` or `@x402/axios` plus `@x402/svm` and `@solana/kit` [10]. We already have `@x402/core`.
- **What changes in behaviour.**
  - No deposit step, and the facilitator pays the SOL fee [3].
  - Every $0.001 read is its own onchain transaction instead of a batch. That is slower per read and visible on the explorer one by one. The Lab's "settlement" column loses its meaning.
  - `"$0.001"` price strings work because devnet USDC is a configured default [4].
- **A closer analogue exists but is riskier.** x402 has a `batch-settlement` scheme on Solana that uses an escrow "payment-channels program" [4], and PayAI lists it on devnet [17]. I did not test it and would not build on it this week.

### 3.6 QuickNode Streams on Solana devnet

- **Supported.** The Streams chain table lists Solana Devnet with two datasets: Block, and Logs "(with Programs)" [5].
- **Dataset.** "Programs + Logs": an array of transactions, each with `signature`, `slot`, `blockTime` and `programInvocations[]` carrying a `programId` [6]. Filtering by our program ID is a loop over `programInvocations`. The exact field names on devnet are UNVERIFIED until a test-filter call is run (our Arc run showed the docs can differ from reality).
- **The REST network name** for devnet is UNVERIFIED; `solana-devnet` is the likely value.
- **Free trial.** 10M API credits for one month; the Free plan allows 1 active stream and 1 Solana stream [20]. Free-trial Solana streams can only follow the chain tip; backfills need a paid plan [21]. One active stream total means the Arc stream and a Solana stream cannot run at the same time on the free plan.
- **Cost.** Streams bill per block processed [22]. The pricing page shows "30" API credits per matched block, but under the Webhooks table, so the Streams figure for Solana is UNVERIFIED [20]. Solana produces a slot about every 0.4 seconds (UNVERIFIED today), so a stream left running could use millions of credits a day. The stream:up and stream:down habit matters even more.

### 3.7 The Lab

- Explorer links change to `https://explorer.solana.com/tx/<signature>?cluster=devnet` (the address form is confirmed by Circle's link to the USDC mint [15]).
- Balances: SOL from `getBalance`, USDC from the wallet's token account. Contract rows become program IDs. UNVERIFIED today.
- The Oracle chart's "our onchain publishes" series needs the new history source from 3.1.
- The Payments panel loses the Gateway balance and gains per-payment transaction links. The Stream panel's table keeps its shape with new field names.
- The devnet RPC answered `getVersion` today with `solana-core 4.5.0-beta.0` [23].

### 3.8 What stays the same

- `src/oracle/gemini.ts`, `src/oracle/odds.ts` and its tests.
- `src/agent/trade.ts` and `scripts/gemini-order.ts` (Gemini sandbox trading).
- `config/markets.json`, the agent's rules (`policy.decide()`), the Express server shell, the Lab's layout and CSS, the Markets panel, and the docs process.
- The x402 idea (pay per read at `/odds/:symbol`) and the QuickNode idea (logs to a webhook).

## 4. What the Solana award would expect

The award text asks for four things, and requires the core onchain functionality on Solana, the program IDs in the README, and a README explanation of how the project uses Solana [1].

| Objective [1] | How we would meet it | Honest strength |
|---|---|---|
| "Use Anchor or native Rust for any programs you write, and take advantage of Solana's speed and low fees" | OddsFeed and ProtectionBook in Anchor; per-read onchain settlement | Good, if both programs get finished |
| "Use Solana-native primitives such as SPL tokens, Token Extensions, or Solana Pay" | USDC as an SPL token for premiums and x402 payments. Solana Pay could carry the owner's approval as a QR or link; I could not reach its docs today, so this is UNVERIFIED | Adequate with SPL only |
| "Integrate with existing Solana protocols and tooling rather than rebuilding from scratch" | This is the weak point. Our core is a new oracle, which is "rebuilding" next to Pyth and Switchboard. Pyth's programs are deployed on devnet [24], so ProtectionBook could read a Pyth BTC price as a sanity check next to our odds. Jupiter on devnet is UNVERIFIED; one third-party page says most devnet pairs return no route [25] | Weak unless we add a Pyth read (+1.5 to 2 h) |
| "Deliver a smooth end-user experience with Solana wallets" | A wallet-connect button so the owner approves a purchase from Phantom. This needs a wallet adapter and a browser bundle; the Lab has no build step and no npm frontend packages today | Weak, or +2 to 3 h |

**Solana Agent Kit** is one of the track's recommended tools [1]. It is an npm package that gives an LLM agent ready-made actions: token transfers, balance checks, Pyth price reads, and many DeFi protocols (Jupiter, Raydium, Orca, Drift and others), with LangChain and Vercel AI SDK adapters [26]. A search summary describes version 2 as plugin-based (UNVERIFIED) [27]. For us it offers little: our agent is rule-based with no LLM in the loop, most of the listed protocols are mainnet DeFi, and I found no official x402 plugin [27]. Using it would be a line in the README, not a capability we need.

Judging: within each track a Solana representative picks Best use of Solana and an Arc representative picks Best use of Arc [1]. On Arc, the same list reads in our favour: "use USDC as gas for predictable fees", "standard EVM tooling such as ... Foundry", "Combine Arc with Circle tools like Wallets, CCTP, Gateway, or Paymaster" [1]. We already do all three.

## 5. Tooling and setup

Checked on this machine today (read-only):

| Check | Result |
|---|---|
| `rustc --version` | rustup is installed, but no default toolchain is configured, so `rustc` and `cargo` do not run |
| `solana --version` | not installed |
| `anchor --version`, `avm --version` | not installed |
| Devnet RPC `getVersion` | OK: `solana-core 4.5.0-beta.0` [23] |
| Machine | WSL2, 6 cores, 5 GB RAM, 826 GB free disk, Node 22.23.1 |

Install steps, from the Anchor installation page [11]:

1. One command installs everything: `curl --proto '=https' --tlsv1.2 -sSfL https://solana-install.solana.workers.dev | bash`. Its sample output shows rustc 1.85.0, solana-cli 4.1.2, anchor-cli 1.2.2, Node 23.9.0 and Yarn.
2. Or step by step: Rust through rustup; the Solana CLI through `sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"`; AVM through `cargo install --git https://github.com/otter-sec/anchor avm --force`; then `avm install latest` and `avm use latest`.
3. `solana config set -ud` for devnet, `solana-keygen new`, then airdrop SOL.

Known problems, from the same page [11]:

- On Linux or WSL the Anchor install can fail with "could not exec the linker cc ... Permission denied (os error 13)"; the fix is to install the Linux build dependencies first.
- `anchor build` can fail with "lock file version 4 requires `-Znext-lockfile-bump`"; the page lists the error without a clear fix.
- `anchor test` on Linux or WSL fails without Node.js and Yarn.
- Devnet airdrops fail under rate limits.
- A search snippet warns that deploys through the public devnet RPC can expire before landing and suggests a dedicated RPC [13]: UNVERIFIED.

My estimates (UNVERIFIED, not measured): 20 to 40 minutes for a clean install, since AVM and Anchor compile from source; 5 to 10 minutes for the first `anchor build`; under a minute for later builds. With 5 GB of RAM, Rust linking may hit swap or fail; raising the WSL memory limit in `.wslconfig` would be the first fix. The repo sits on the Linux filesystem, which avoids the slow `/mnt/c` path.

The hackathon's network list in `CLAUDE.md` would need new hosts: `api.devnet.solana.com`, `release.anza.xyz`, `static.rust-lang.org`, `crates.io`, `x402.org`.

## 6. Effort and schedule

Hours for (B), my estimates:

| Work | Hours |
|---|---|
| Toolchain install, first build, keys, SOL and USDC funding | 1.5 to 2.5 |
| OddsFeed in Anchor, tests, deploy | 2.5 to 3.5 |
| Publisher, feed and deploy scripts, shared chain code | 1.5 to 2 |
| x402 on Solana (seller, buyer script, Lab route) | 1.5 to 2 |
| Stream on Solana devnet (filter, up and down scripts, webhook shape) | 1 to 1.5 |
| Lab changes (status, links, chart history, panels) | 1.5 to 2 |
| Docs (PLAN, CLAUDE, README) | 0.5 to 1 |
| **Redo subtotal** | **10 to 14.5** |
| ProtectionBook, budget and approval: extra over the Solidity plan | 2 to 3 |
| To be competitive for the award: Pyth read and wallet approval | 2 to 5 (optional) |
| **Total extra** | **14 to 20, without the optional items 12 to 17.5** |

Schedule: the plan had about 26 hours across four days, with about 8.5 done on Monday and about 17 left for Tuesday to Thursday, and Friday morning for submission (deadline 12:00 pm CST [1]). Option B roughly doubles the remaining work to 31 to 37 hours in three days. That fits only with 10 to 12 hour days and by cutting from the existing cut list: the LLM threat map, the dashboard polish, the oracle data checks and probably owner approval.

Thrown away: about 6 of Monday's 8.5 hours (units 1.2, 2.2, 2.3 onchain parts, 3.1, 3.2), two verified contracts, and the live history on Arc.

Biggest risks, in order:

1. **No finished demo.** A late toolchain or build failure on Wednesday leaves neither chain working. On Arc every integration is already proven.
2. **Memory.** 5 GB of RAM for Rust builds on WSL.
3. **Funding.** Faucet limits against the SOL needed to deploy and redeploy programs [12][13].
4. **Unproven pieces.** The Solana Streams payload and network name, the Anchor client and `@solana/kit` together, and x402 token-account requirements were not tested.
5. **A weaker award story.** A new oracle on Solana invites the question "why not Pyth or Switchboard", and the Circle Nanopayments story that fits the track text is gone.

## 7. Sketch of the plan under (B)

Units already done on Arc that carry over unchanged are not repeated. Numbers match build order.

- **Phase 1: Solana skeleton (Tue morning)**
  - 1.1 Toolchain: Rust, Solana CLI, Anchor; `anchor init`; keypairs; devnet SOL and USDC. See it: `anchor --version`, balances printed.
  - 1.2 Hello program in Anchor, deployed to devnet, called from a script. See it: explorer link.
  - 1.3 Lab status on Solana: slot, wallets (SOL and USDC), program IDs.
- **Phase 2: Oracle on Solana (Tue)**
  - 2.1 OddsFeed program: market PDA, `publish`, `emit!`; Rust or TypeScript test.
  - 2.2 Publisher writes Gemini odds to devnet; `feed` script; Oracle panel reads the accounts.
- **Phase 3: Re-prove the integrations (Tue evening, Wed morning)**
  - 3.1 x402 on Solana devnet with the `x402.org` facilitator; Payments panel shows per-read transactions.
  - 3.2 QuickNode Stream on Solana devnet, Programs + Logs, filtered by program ID; Stream panel.
  - (Gemini sandbox trading is already done.)
- **Phase 4: Agent (Wed)**
  - 4.1 Rules and Agent panel (unchanged from the current plan).
  - 4.2 ProtectionBook in Anchor with a USDC CPI; first protection buy plus Gemini order.
- **Phase 5: Live wiring (Wed evening, Thu morning)**
  - 5.1 Agent pays per read. 5.2 Real Stream filter. 5.3 Agent re-checks on Stream events.
- **Phase 6: Guardrails (Thu)**
  - 6.1 Budget in the program. 6.2 Owner approval (cut first if late).
- **Phase 7: Dashboard and demo (Thu)**
  - 7.1 Lab polish, minimal. 7.2 Scripted scenario. 7.3 README with program IDs and "how we use Solana".
- **Phase 8: Submit (Fri morning)**
  - 8.1 Video, written answers, Devpost with chain award = Solana.
- **Cut from the current plan:** the LLM threat map, Lab over SSE, oracle data checks, the optional deploy.

## 8. Recommendation

**Stay on Arc (option A).**

The case for A:

- The upside of switching is $500, and only if we win. To be worth it, our chance of winning Best use of Solana would have to be more than two thirds of our chance of winning Best use of Arc, after paying 14 to 20 hours.
- The project already matches the Arc award's objectives closely: USDC as gas, Foundry, and Circle Gateway [1]. On Solana we would be weakest on exactly the objective a Solana judge cares about most, composing with existing protocols.
- Circle Nanopayments is one of the three tools the track text recommends by name [1], it is already working here, and it does not exist on Solana [2].
- Every risky integration is proven on Arc as of today. The remaining 17 hours go into the agent and the demo, which is what the overall and track prizes judge.

The strongest case for B, stated fairly:

- $1,500 is the larger chain award, and Solana and Circle are both running workshops this week [1], so help is available.
- x402 on Solana needs no deposit and no API key [3][4], and per-read onchain settlement is a simple story to demo.
- If you already know Anchor well, the redo could land near the low end of the estimate.
- The Arc field's size is unknown to me. I assume it is smaller than Solana's, but I have no data.

Option C is dominated: it costs more than A and wins nothing A cannot win. One cheap variant is worth remembering as a stretch goal only: let the paid endpoint also accept x402 payments from Solana devnet buyers. It would not change the chain award and I would not start it before the demo works.

What would change my mind:

- You are fluent in Rust and Anchor and can give 10 or more hours a day through Thursday.
- The organizers or sponsors say the Arc field in our track is crowded and the Solana field thin.
- A Circle or Arc representative says Nanopayments or testnet-only work will not count for much.
- A Gemini bounty judge says the chain is irrelevant to them (then the chain award matters less either way, which still favours not spending the hours).

## 9. Open questions for you

1. How comfortable are you with Rust and Anchor? This moves the estimate more than anything else.
2. How many hours a day do you really have from Tuesday to Thursday?
3. Can you ask in the Telegram or at office hours how many teams in Agentic Payments and AI are on Arc versus Solana?
4. Are you attending in person on Nov 21? Every prize requires it [1].
5. Is the track choice final (Agentic Payments and AI), with the Gemini and QuickNode bounties?
6. If you want B anyway: may I install Rust, the Solana CLI and Anchor, and can you raise the WSL memory limit first?
7. Do you want the "also accept Solana x402 buyers" stretch goal kept on the list?

## 10. Sources

1. Organizers' guide, `docs/Hackathon Guide UBC 26 (1).pdf` (prizes, tracks, awards, judging, timeline).
2. Circle, Gateway supported blockchains: https://developers.circle.com/gateway/references/supported-blockchains
3. x402.org facilitator, live capabilities (fetched today, no key): https://x402.org/facilitator/supported
4. x402 docs, Networks and Token Support: https://docs.x402.org/core-concepts/network-and-token-support
5. QuickNode Streams, supported chains: https://www.quicknode.com/docs/streams/supported-chains
6. QuickNode Streams, Solana data source: https://www.quicknode.com/docs/streams/data-sources/solana
7. Solana docs, program-derived addresses (not readable today, HTTP 429): https://solana.com/docs/core/pda
8. Anchor docs, events: https://www.anchor-lang.com/docs/features/events
9. Anchor docs, CPI: https://www.anchor-lang.com/docs/basics/cpi
10. x402 docs, quickstart for buyers: https://docs.x402.org/getting-started/quickstart-for-buyers
11. Anchor docs, installation: https://www.anchor-lang.com/docs/installation
12. Solana faucet: https://faucet.solana.com/
13. Solana docs, deploying programs (search snippet only; page not readable today): https://solana.com/docs/programs/deploying
14. Circle faucet: https://faucet.circle.com/
15. Circle, USDC contract addresses: https://developers.circle.com/stablecoins/usdc-contract-addresses
16. Circle, x402 facilitators: https://developers.circle.com/x402-facilitators
17. PayAI facilitator, live capabilities (fetched today, no key): https://facilitator.payai.network/supported
18. x402 docs, facilitators: https://docs.x402.org/dev-tools/facilitators
19. x402 docs, quickstart for sellers: https://docs.x402.org/getting-started/quickstart-for-sellers
20. QuickNode pricing: https://www.quicknode.com/pricing
21. QuickNode guide, How to Stream Solana Program Data: https://www.quicknode.com/guides/quicknode-products/streams/how-to-stream-solana-program-data
22. QuickNode Streams billing: https://www.quicknode.com/docs/streams/billing
23. Solana devnet RPC, `getVersion` (called today): https://api.devnet.solana.com
24. Pyth, Solana contract addresses: https://docs.pyth.network/price-feeds/core/contract-addresses/solana
25. Cobo recipe mentioning Jupiter on devnet (third party): https://www.cobo.com/agentic-wallet/recipes/jupiter-swap-sol
26. Solana Agent Kit README: https://github.com/sendaifun/solana-agent-kit
27. Solana x402 guide (search snippet only; page not readable today): https://solana.com/docs/payments/agentic-payments/x402
