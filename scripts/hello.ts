// npm run hello -- <text>
// Sends Hello.ping(text) as the deployer, then reads message() back from the chain.
import { addressOf, loadArtifact } from "../src/shared/artifacts.js";
import { EXPLORER, asDeployer, publicClient, walletClient } from "../src/shared/chain.js";

const text = process.argv[2];
if (!text) throw new Error("usage: npm run hello -- <text>");

const address = addressOf("Hello");
const { abi } = loadArtifact("Hello");

// Through asDeployer, like every deployer send: it waits its turn behind the other processes.
const txHash = await asDeployer(async () => {
  const hash = await walletClient("DEPLOYER_KEY").writeContract({ address, abi, functionName: "ping", args: [text] });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
});

const message = await publicClient.readContract({ address, abi, functionName: "message" });
console.log(`tx: ${EXPLORER}/tx/${txHash}`);
console.log(`message = ${message}`);
