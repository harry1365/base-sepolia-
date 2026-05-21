require("dotenv/config");
const { ethers } = require("ethers");

const erc20Abi = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

const TYI_TOKEN = "0x27DC1C167AeF232bb1e21073304B526726a8727e";

async function main() {
  const address = process.argv[2];
  const rpcUrl = process.env.VITE_BASE_SEPOLIA_RPC_URL || process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";

  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw new Error("Usage: npm run check:tyi -- <walletAddress>");
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const token = new ethers.Contract(TYI_TOKEN, erc20Abi, provider);
  const [rawBalance, decimals, symbol] = await Promise.all([
    token.balanceOf(address),
    token.decimals(),
    token.symbol(),
  ]);

  console.log(`Token:   ${TYI_TOKEN}`);
  console.log(`Wallet:  ${address}`);
  console.log(`Balance: ${ethers.formatUnits(rawBalance, decimals)} ${symbol}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
