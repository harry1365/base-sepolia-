require("dotenv/config");
const { ethers } = require("ethers");

async function main() {
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) {
    console.log("No DEPLOYER_PRIVATE_KEY found in .env");
    return;
  }
  const provider = new ethers.JsonRpcProvider(process.env.VITE_BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org");
  const wallet = new ethers.Wallet(privateKey, provider);
  const balance = await provider.getBalance(wallet.address);
  console.log("Deployer Address:", wallet.address);
  console.log("Deployer ETH Balance:", ethers.formatEther(balance), "ETH");
}

main().catch(console.error);
