// npm run fund:agent -- <usdc>   sends testnet USDC from the deployer to the agent.
// The deployer is the treasury, so it receives every premium the agent pays; this sends some
// back, instead of going to the faucet. Stop a running demo replay first: both use the
// deployer's key.
import { erc20Abi, formatUnits, parseUnits } from "viem";
import { EXPLORER, USDC, account, publicClient, walletClient, asDeployer } from "../src/shared/chain.js";

const usdc = process.argv[2];
if (!usdc || !(Number(usdc) > 0)) throw new Error("usage: npm run fund:agent -- <usdc>, for example: npm run fund:agent -- 5");

const agent = account("AGENT_KEY").address;
const deployer = account("DEPLOYER_KEY").address;
const balance = async (address: `0x${string}`) => formatUnits(await publicClient.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [address] }), 6);

// Through asDeployer, so it waits its turn behind a replay's or the oracle loop's send.
const { txHash, receipt } = await asDeployer(async () => {
  const txHash = await walletClient("DEPLOYER_KEY").writeContract({ address: USDC, abi: erc20Abi, functionName: "transfer", args: [agent, parseUnits(usdc, 6)] });
  return { txHash, receipt: await publicClient.waitForTransactionReceipt({ hash: txHash }) };
});
if (receipt.status !== "success") throw new Error(`the transfer reverted: ${txHash}`);

console.log(`sent ${usdc} USDC from the deployer to the agent`);
console.log(`  agent    ${agent}  now ${await balance(agent)} USDC`);
console.log(`  deployer ${deployer}  now ${await balance(deployer)} USDC`);
console.log(`  ${EXPLORER}/tx/${txHash}`);
