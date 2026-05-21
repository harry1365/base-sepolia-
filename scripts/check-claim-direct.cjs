require("dotenv/config");
const { ethers } = require("ethers");

const proofPassAbi = [
  "function hasClaimed(address user,uint256 badgeId) view returns (bool)",
];

async function main() {
  const address = process.argv[2];
  const badgeId = process.argv[3] || "1";
  const contractAddress = process.env.VITE_PROOFPASS_CONTRACT_ADDRESS;
  const rpcUrl = process.env.VITE_BASE_SEPOLIA_RPC_URL || process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";

  if (!contractAddress || !/^0x[a-fA-F0-9]{40}$/.test(contractAddress)) {
    throw new Error("Set VITE_PROOFPASS_CONTRACT_ADDRESS in .env first.");
  }

  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw new Error("Usage: npm run check:claim -- <walletAddress> [badgeId]");
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const proofPass = new ethers.Contract(contractAddress, proofPassAbi, provider);
  const claimed = await proofPass.hasClaimed(address, badgeId);

  console.log(`Contract: ${contractAddress}`);
  console.log(`Wallet:   ${address}`);
  console.log(`Badge:    ${badgeId}`);
  console.log(`Claimed:  ${claimed}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
