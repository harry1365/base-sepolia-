const fs = require("node:fs");
const path = require("node:path");

async function main() {
  const hre = require("hardhat");
  const { ethers } = hre;

  const [deployer] = await ethers.getSigners();
  const ProofPass = await ethers.getContractFactory("GaslessProofPass");
  const proofPass = await ProofPass.deploy(deployer.address);

  await proofPass.waitForDeployment();
  const address = await proofPass.getAddress();

  const seedBadges = [
    {
      name: "Hackathon Builder Pass",
      uri: "ipfs://replace-with-builder-badge-metadata",
      code: "BUILDER-2026",
      maxClaims: 100,
    },
    {
      name: "Workshop Completion Badge",
      uri: "ipfs://replace-with-workshop-badge-metadata",
      code: "WORKSHOP-2026",
      maxClaims: 80,
    },
    {
      name: "Community Contributor Badge",
      uri: "ipfs://replace-with-community-badge-metadata",
      code: "COMMUNITY-2026",
      maxClaims: 150,
    },
  ];

  for (const badge of seedBadges) {
    const tx = await proofPass.createBadge(
      badge.name,
      badge.uri,
      ethers.keccak256(ethers.toUtf8Bytes(badge.code)),
      badge.maxClaims,
    );
    await tx.wait();
  }

  const deployment = {
    network: "baseSepolia",
    chainId: 84532,
    contract: "GaslessProofPass",
    address,
    deployedAt: new Date().toISOString(),
    badges: seedBadges.map((badge, index) => ({
      id: index + 1,
      name: badge.name,
      demoCode: badge.code,
      maxClaims: badge.maxClaims,
      metadataUri: badge.uri,
    })),
  };
  const deploymentsDir = path.join(process.cwd(), "deployments");
  fs.mkdirSync(deploymentsDir, { recursive: true });
  fs.writeFileSync(
    path.join(deploymentsDir, "base-sepolia.json"),
    `${JSON.stringify(deployment, null, 2)}\n`,
  );

  console.log(`GaslessProofPass deployed to ${address}`);
  console.log("Deployment saved to deployments/base-sepolia.json");
  console.log("Set VITE_PROOFPASS_CONTRACT_ADDRESS to this address in .env");
  console.log("Demo claim codes:");
  for (const badge of seedBadges) {
    console.log(`- ${badge.name}: ${badge.code}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
