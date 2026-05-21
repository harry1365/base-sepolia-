const fs = require("node:fs");
const path = require("node:path");

function escapeXml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  })[character]);
}

function dataUri(value, mimeType) {
  return `data:${mimeType};base64,${Buffer.from(value).toString("base64")}`;
}

function makeBadgeImage(badge) {
  const title = escapeXml(badge.name);
  const subtitle = escapeXml(badge.issuer);
  const venue = escapeXml(badge.venue);

  return dataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="760" viewBox="0 0 1200 760">
      <defs>
        <linearGradient id="surface" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="${badge.accent}" />
          <stop offset="1" stop-color="#13233f" />
        </linearGradient>
        <pattern id="grid" width="56" height="56" patternUnits="userSpaceOnUse">
          <path d="M56 0H0V56" fill="none" stroke="#ffffff" stroke-opacity=".12" />
        </pattern>
      </defs>
      <rect width="1200" height="760" rx="56" fill="url(#surface)" />
      <rect width="1200" height="760" rx="56" fill="url(#grid)" />
      <rect x="56" y="56" width="1088" height="648" rx="40" fill="none" stroke="#ffffff" stroke-opacity=".36" stroke-width="2" />
      <rect x="88" y="88" width="118" height="118" rx="28" fill="#ffffff" />
      <text x="147" y="171" text-anchor="middle" font-family="Arial, sans-serif" font-size="74" font-weight="800" fill="#13233f">P</text>
      <text x="88" y="284" font-family="Arial, sans-serif" font-size="30" font-weight="700" fill="#ffffff" fill-opacity=".82">Gasless ProofPass</text>
      <text x="88" y="392" font-family="Arial, sans-serif" font-size="78" font-weight="800" fill="#ffffff">${title}</text>
      <text x="88" y="474" font-family="Arial, sans-serif" font-size="38" font-weight="700" fill="#ffffff" fill-opacity=".92">${subtitle}</text>
      <text x="88" y="548" font-family="Arial, sans-serif" font-size="28" font-weight="700" fill="#ffffff" fill-opacity=".72">${venue}</text>
      <rect x="834" y="122" width="254" height="254" rx="28" fill="#ffffff" fill-opacity=".12" stroke="#ffffff" stroke-opacity=".28" />
      <path d="M892 182h56v56h-56zM973 182h56v56h-56zM892 263h56v56h-56zM973 263h24v24h32v32h-56z" fill="#ffffff" />
      <rect x="824" y="584" width="264" height="58" rx="29" fill="#ffffff" fill-opacity=".14" />
      <text x="956" y="622" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="#ffffff">Base Sepolia Credential</text>
    </svg>`,
    "image/svg+xml",
  );
}

function makeMetadataUri(badge) {
  return dataUri(
    JSON.stringify({
      name: badge.name,
      description:
        "A gasless event credential claimed on Base Sepolia through UGF with TYI_MOCK_USD settlement.",
      image: makeBadgeImage(badge),
      attributes: [
        { trait_type: "Issuer", value: badge.issuer },
        { trait_type: "Venue", value: badge.venue },
        { trait_type: "Gas Mode", value: "UGF + TYI_MOCK_USD" },
        { trait_type: "Network", value: "Base Sepolia" },
      ],
    }),
    "application/json",
  );
}

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
      issuer: "Base Builders Week",
      venue: "Main stage check-in",
      accent: "#25a18e",
      code: "BUILDER-2026",
      maxClaims: 100,
    },
    {
      name: "Workshop Completion Badge",
      issuer: "ProofPass Academy",
      venue: "Smart contract lab",
      accent: "#ffb703",
      code: "WORKSHOP-2026",
      maxClaims: 80,
    },
    {
      name: "Community Contributor Badge",
      issuer: "Open Builders Guild",
      venue: "Contributor desk",
      accent: "#e76f51",
      code: "COMMUNITY-2026",
      maxClaims: 150,
    },
  ];

  for (const badge of seedBadges) {
    const tx = await proofPass.createBadge(
      badge.name,
      makeMetadataUri(badge),
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
      metadataUri: "data:application/json;base64,...",
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
