import "@nomicfoundation/hardhat-ethers";
import "dotenv/config";
import { HardhatUserConfig } from "hardhat/config";

const rawPrivateKey = process.env.DEPLOYER_PRIVATE_KEY?.trim();
const privateKey =
  rawPrivateKey && /^0x[a-fA-F0-9]{64}$/.test(rawPrivateKey)
    ? rawPrivateKey
    : undefined;

if (rawPrivateKey && !privateKey && rawPrivateKey !== "replace_with_a_test_wallet_private_key") {
  throw new Error(
    "Invalid DEPLOYER_PRIVATE_KEY. Use a burner wallet private key as 0x + 64 hex characters. Do not use a wallet address or seed phrase.",
  );
}

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      evmVersion: "cancun",
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    baseSepolia: {
      url: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
      chainId: 84532,
      accounts: privateKey ? [privateKey] : [],
    },
  },
};

export default config;
