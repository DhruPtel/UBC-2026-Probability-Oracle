# Chain award: Best use of Arc

What the award asks for, how the project meets it, and where to check. The requirements are the hackathon guide's, in our words.

| Requirement | How we meet it | Proof |
|---|---|---|
| Core onchain functionality on Arc (testnet is fine) | The oracle's feed, the premium book, the risk switch and the demo pools are all contracts on Arc testnet, chain 5042002 | [`contracts/src`](../../contracts/src) · [a post](https://explorer.testnet.arc.io/tx/0xfc51ab1cb85157f068924d884fc4a4774d34de267c40031dee32286185fc66a0) · [a premium](https://explorer.testnet.arc.io/tx/0xebff2e19c4487122ba65bd9b3f056c2641f9689defc0c4761ddea6f81998dcc9) · [a sync](https://explorer.testnet.arc.io/tx/0x1be0c1a3f87dbc35eaeffa28fd983c905a1a35ee89ae3912b2757af21544562c) |
| Contract addresses in the README | The table below; the same table is in the [README](../../README.md#arc-contracts) | [`deployments/arc-testnet.json`](../../deployments/arc-testnet.json) |
| An explanation of how the project uses Arc | [How Arc is used](#how-arc-is-used) below | |
| Objective: USDC as gas for predictable fees | Every post, sync and purchase pays gas in USDC: about 0.0011 USDC a post | [The post's receipt](https://explorer.testnet.arc.io/tx/0xfc51ab1cb85157f068924d884fc4a4774d34de267c40031dee32286185fc66a0): 45,274 gas |
| Objective: standard EVM tooling | Solidity 0.8.28 with Foundry: 20 contract tests | [`contracts/test`](../../contracts/test), `forge test --root contracts` |
| Objective: combine Arc with Circle tools | Circle Gateway Nanopayments: every odds read is an x402 payment settled on Arc | [Circle's record of one read](https://gateway-api-testnet.circle.com/v1/x402/transfers/92fc7c71-d798-4058-aa53-35d95d601769) |

## Every contract

| Contract | Address | Purpose |
|---|---|---|
| [`OddsFeed`](../../contracts/src/OddsFeed.sol) | [`0x1857639d8e6b3db0c04aa1288afb278f848d7f6a`](https://explorer.testnet.arc.io/address/0x1857639d8e6b3db0c04aa1288afb278f848d7f6a) | The latest chance per market. Free to read; only our publisher can post, and never above 100% |
| [`ProtectionBook`](../../contracts/src/ProtectionBook.sol) | [`0x31f88462ddb390cfe8484674509fe83514110692`](https://explorer.testnet.arc.io/address/0x31f88462ddb390cfe8484674509fe83514110692) | Takes an agent's USDC premium and records each purchase |
| [`RiskSwitch`](../../contracts/src/RiskSwitch.sol) | [`0x900f9f4406884c75ba124e661f858d6a38e9e620`](https://explorer.testnet.arc.io/address/0x900f9f4406884c75ba124e661f858d6a38e9e620) | `sync` reads the feed and sets an opted-in pool's level |
| [`DemoLendingPool`](../../contracts/src/DemoLendingPool.sol), BTC market | [`0xc23095a7f8932c8947b0f898ec57ee30a12c6e1e`](https://explorer.testnet.arc.io/address/0xc23095a7f8932c8947b0f898ec57ee30a12c6e1e) | The demo pool: its loan limit follows the switch |
| The same pool, ETH replay | [`0xbfe83bbb52e808121b936ef63bf68e1ba371c132`](https://explorer.testnet.arc.io/address/0xbfe83bbb52e808121b936ef63bf68e1ba371c132) | "Our pool on Arc" on the BTC pools tab |
| The same pool, BTC replay | [`0x201cb68496959ccf555be97df91dff46d1c82289`](https://explorer.testnet.arc.io/address/0x201cb68496959ccf555be97df91dff46d1c82289) | A replay copy, on the agent replay's BTC market |
| The same pool, tests | [`0xac1a328fafede307c34981997e5a86a949f2a742`](https://explorer.testnet.arc.io/address/0xac1a328fafede307c34981997e5a86a949f2a742) | Walked through every tier boundary in the audit |
| USDC (Arc's own) | `0x3600000000000000000000000000000000000000` | The money and the gas |
| Circle Gateway Wallet | [`0x0077777d7eba4688bdef3e311b846f25870a19b9`](https://explorer.testnet.arc.io/address/0x0077777d7eba4688bdef3e311b846f25870a19b9) | Holds the agents' balances for x402 payments |

The first set of contracts (Nov 16 to 18, replaced when the feed was closed to other senders) is in the README's collapsed "v1 addresses".

## How Arc is used

- **USDC is the gas.** The oracle, the keeper and the agents pay fees in the same USDC the product moves. A post costs a tenth of a cent, which is what makes posting about 100 markets, one transaction each, practical.
- **One feed, two users, one chain.** The agent, the risk switch and the Stream all read the same rounds of `OddsFeed`.
- **Circle Gateway for x402.** A paid read is accepted at once and settled on Arc later in a batch.
- **Foundry.** The contracts are built and tested with `forge`; `npm run deploy` deploys with viem and records each address.
- **Fast blocks.** About two a second, so a post reaches the pool's keeper 1 to 2 seconds later through the Stream.

## The Aave V4 read on Arc mainnet

The BTC pools tab reads Aave V4's cirBTC reserve on Arc mainnet (chain 5042), straight from the Main Spoke [`0xB843bdC3a87A05E77E07Df9FE48928b3A34b134d`](https://explorer.arc.io/address/0xB843bdC3a87A05E77E07Df9FE48928b3A34b134d): collateral factor, caps, supplied, borrowed (`advisorView` in [`src/server/index.ts`](../../src/server/index.ts)). It is read only: nothing is sent to Aave.

## One example

On Nov 18 the oracle posted a 15% chance of YES for "BTC at or above $67,500". The risk switch reads that as an 85% chance of the bad outcome for a BTC pool. At that level the page suggests, for the cirBTC reserve: collateral factor 78% → 53% for new positions and no new borrowing beyond today's level, about $20 million less new lending against $80 million of collateral ([screenshot](../screenshots/pool-1440.png)).

More: [architecture](../architecture.md#the-risk-switch-and-the-pools-onchain).
