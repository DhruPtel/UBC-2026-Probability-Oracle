// Prints the Arc testnet chain ID, the latest block, and both wallets' balances.
import { erc20Abi, formatUnits } from "viem";
import { EXPLORER, USDC, account, publicClient } from "../src/shared/chain.js";

const chainId = await publicClient.getChainId();
const block = await publicClient.getBlockNumber();
console.log(`chain ID      ${chainId}${chainId === 5042002 ? "" : "  (expected 5042002!)"}`);
console.log(`latest block  ${block}`);

const wallets = [
  { label: "deployer (oracle, treasury, owner)", address: account("DEPLOYER_KEY").address },
  { label: "agent", address: account("AGENT_KEY").address },
];

const rows = [];
for (const { label, address } of wallets) {
  const usdc = await publicClient.readContract({
    address: USDC,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address],
  });
  const native = await publicClient.getBalance({ address });
  rows.push({
    label,
    address,
    "USDC (ERC-20, 6 dec)": formatUnits(usdc, 6),
    "native (18 dec)": formatUnits(native, 18),
    explorer: `${EXPLORER}/address/${address}`,
  });
}
console.table(rows);
console.log("On Arc the ERC-20 USDC balance and the native gas balance are one balance, so the two columns should match.");
