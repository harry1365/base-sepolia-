const fs = require("node:fs");
const path = require("node:path");

const deploymentPath = path.join(process.cwd(), "deployments", "base-sepolia.json");
const envPath = path.join(process.cwd(), ".env");

if (!fs.existsSync(deploymentPath)) {
  console.error("Missing deployments/base-sepolia.json. Run npm run deploy:base-sepolia first.");
  process.exit(1);
}

const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
const address = deployment.address;

if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
  console.error("Deployment file does not contain a valid contract address.");
  process.exit(1);
}

let env = "";

if (fs.existsSync(envPath)) {
  env = fs.readFileSync(envPath, "utf8");
} else if (fs.existsSync(path.join(process.cwd(), ".env.example"))) {
  env = fs.readFileSync(path.join(process.cwd(), ".env.example"), "utf8");
}

const key = "VITE_PROOFPASS_CONTRACT_ADDRESS";
const line = `${key}=${address}`;

if (env.match(new RegExp(`^${key}=.*$`, "m"))) {
  env = env.replace(new RegExp(`^${key}=.*$`, "m"), line);
} else {
  env = `${env.trim()}\n${line}\n`;
}

fs.writeFileSync(envPath, env.endsWith("\n") ? env : `${env}\n`);
console.log(`Synced ${key}=${address} into .env`);
