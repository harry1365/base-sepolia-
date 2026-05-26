import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserProvider, Contract, Interface, JsonRpcProvider } from "ethers";
import {
  BASE_SEPOLIA_CHAIN_ID,
  TYI_USD_PAYMENT_COIN,
  UGFClient,
} from "@tychilabs/ugf-testnet-js";
import jsQR from "jsqr";
import "./styles.css";

const proofPassAbi = [
  "function claimBadge(uint256 badgeId,string claimCode) returns (uint256 tokenId)",
  "function hasClaimed(address user, uint256 badgeId) view returns (bool)",
  "function owner() view returns (address)",
  "function nextBadgeId() view returns (uint256)",
  "function badges(uint256) view returns (string name, string metadataUri, bytes32 claimCodeHash, uint256 maxClaims, uint256 claimCount, bool active)",
  "function createBadge(string name, string metadataUri, bytes32 claimCodeHash, uint256 maxClaims) returns (uint256)",
];

const erc20Abi = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

// Fallback seed badges if contract fails to load
const defaultBadges = [
  {
    id: 1,
    title: "Hackathon Builder Pass",
    issuer: "Base Builders Week",
    accent: "#25a18e",
    hint: "Demo code: BUILDER-2026",
    code: "BUILDER-2026",
    venue: "Main stage check-in",
    capacity: "100 seats",
    maxClaims: 100,
    claimCount: 0,
    active: true,
    isMock: false,
    image: "",
  },
  {
    id: 2,
    title: "Workshop Completion Certificate",
    issuer: "ProofPass Academy",
    accent: "#ffb703",
    hint: "Demo code: WORKSHOP-2026",
    code: "WORKSHOP-2026",
    venue: "Smart contract lab",
    capacity: "80 seats",
    maxClaims: 80,
    claimCount: 0,
    active: true,
    isMock: false,
    image: "",
  },
  {
    id: 3,
    title: "Community Contributor Credential",
    issuer: "Open Builders Guild",
    accent: "#e76f51",
    hint: "Demo code: COMMUNITY-2026",
    code: "COMMUNITY-2026",
    venue: "Contributor desk",
    capacity: "150 seats",
    maxClaims: 150,
    claimCount: 0,
    active: true,
    isMock: false,
    image: "",
  },
];

type StepState = "idle" | "active" | "done" | "error";

type TxStep = {
  label: string;
  state: StepState;
};

const baseSepoliaHex = "0x14a34";
const contractAddress = import.meta.env.VITE_PROOFPASS_CONTRACT_ADDRESS || "";
const faucetUrl = "https://universalgasframework.com/faucets";
const tyiTokenFallback = "0x27DC1C167AeF232bb1e21073304B526726a8727e";
const hasContractAddress = /^0x[a-fA-F0-9]{40}$/.test(contractAddress);

// Utilities
function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    const maybeCode = (error as Error & { code?: string }).code;
    return maybeCode ? `${maybeCode}: ${error.message}` : error.message;
  }
  return "Something went wrong while claiming the badge.";
}

function formatToken(rawBalance: bigint, decimals: bigint, displayDecimals = 4) {
  const divisor = 10n ** decimals;
  const whole = rawBalance / divisor;
  const displayDivisor = 10n ** BigInt(displayDecimals);
  const fraction = ((rawBalance % divisor) * displayDivisor) / divisor;
  return `${whole}.${fraction.toString().padStart(displayDecimals, "0")}`;
}

function parseMetadataUri(uri: string) {
  try {
    if (uri.startsWith("data:application/json;base64,")) {
      const base64Str = uri.split(",")[1];
      const jsonStr = atob(base64Str);
      return JSON.parse(jsonStr);
    }
  } catch (err) {
    console.error("Failed to parse metadata URI:", err);
  }
  return null;
}

function getAccentColor(id: number) {
  const colors = ["#25a18e", "#ffb703", "#e76f51", "#818cf8", "#ec4899", "#10b981", "#3b82f6"];
  return colors[(id - 1) % colors.length];
}

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  })[character as never] || character);
}

function makeBadgeSvg(name: string, issuer: string, venue: string, accent: string) {
  const title = escapeXml(name);
  const subtitle = escapeXml(issuer);
  const v = escapeXml(venue);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="760" viewBox="0 0 1200 760">
      <defs>
        <linearGradient id="surface" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="${accent}" />
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
      <text x="88" y="548" font-family="Arial, sans-serif" font-size="28" font-weight="700" fill="#ffffff" fill-opacity=".72">${v}</text>
      <rect x="834" y="122" width="254" height="254" rx="28" fill="#ffffff" fill-opacity=".12" stroke="#ffffff" stroke-opacity=".28" />
      <path d="M892 182h56v56h-56zM973 182h56v56h-56zM892 263h56v56h-56zM973 263h24v24h32v32h-56z" fill="#ffffff" />
      <rect x="824" y="584" width="264" height="58" rx="29" fill="#ffffff" fill-opacity=".14" />
      <text x="956" y="622" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="#ffffff">Base Sepolia Credential</text>
    </svg>`;
}

function safeBtoa(str: string) {
  return btoa(unescape(encodeURIComponent(str)));
}

function makeMetadataUri(name: string, issuer: string, venue: string, accent: string) {
  const svg = makeBadgeSvg(name, issuer, venue, accent);
  const metadata = {
    name,
    description: "A gasless event credential claimed on Base Sepolia through UGF with TYI_MOCK_USD settlement.",
    image: `data:image/svg+xml;base64,${safeBtoa(svg)}`,
    attributes: [
      { trait_type: "Issuer", value: issuer },
      { trait_type: "Venue", value: venue },
      { trait_type: "Gas Mode", value: "UGF + TYI_MOCK_USD" },
      { trait_type: "Network", value: "Base Sepolia" },
    ],
  };
  return `data:application/json;base64,${safeBtoa(JSON.stringify(metadata))}`;
}

// Confetti Component
function ConfettiEffect() {
  const particles = Array.from({ length: 70 });
  return (
    <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", overflow: "hidden", pointerEvents: "none", zIndex: 1100 }}>
      {particles.map((_, i) => {
        const left = Math.random() * 100;
        const delay = Math.random() * 5;
        const duration = 2 + Math.random() * 3;
        const size = 5 + Math.random() * 8;
        const colors = ["#ffb703", "#25a18e", "#e76f51", "#818cf8", "#ec4899", "#10b981", "#3b82f6"];
        const color = colors[Math.floor(Math.random() * colors.length)];
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              top: "-20px",
              left: `${left}%`,
              width: `${size}px`,
              height: `${size}px`,
              backgroundColor: color,
              borderRadius: Math.random() > 0.5 ? "50%" : "2px",
              opacity: 0.8,
              transform: `rotate(${Math.random() * 360}deg)`,
              animation: `fall ${duration}s linear infinite`,
              animationDelay: `${delay}s`,
            }}
          />
        );
      })}
    </div>
  );
}

function App() {
  const [activeTab, setActiveTab] = React.useState<"claim" | "organizer" | "verifier" | "scanner">("claim");
  
  // Wallet & Owner States
  const [account, setAccount] = React.useState("");
  const [contractOwner, setContractOwner] = React.useState("");
  const isOwner = account.toLowerCase() === contractOwner.toLowerCase();

  // Badges lists
  const [contractBadges, setContractBadges] = React.useState<any[]>([]);
  const [localBadges, setLocalBadges] = React.useState<any[]>(() => {
    try {
      const saved = localStorage.getItem("proofpass_local_badges");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const allBadges = contractBadges.length > 0 ? [...contractBadges, ...localBadges] : [...defaultBadges, ...localBadges];

  // Attendee Portal states
  const [selectedBadgeId, setSelectedBadgeId] = React.useState(1);
  const [claimCode, setClaimCode] = React.useState("");
  const [mockUsdBalance, setMockUsdBalance] = React.useState("Not checked");
  const [mockUsdRawBalance, setMockUsdRawBalance] = React.useState<bigint | null>(null);
  const [mockUsdDecimals, setMockUsdDecimals] = React.useState<bigint>(6n);
  const [checkingBalance, setCheckingBalance] = React.useState(false);
  const [steps, setSteps] = React.useState<TxStep[]>([
    { label: "Authenticate", state: "idle" },
    { label: "Quote", state: "idle" },
    { label: "Settle Mock USD", state: "idle" },
    { label: "Execute Claim", state: "idle" },
    { label: "Confirm", state: "idle" },
  ]);
  const [txHash, setTxHash] = React.useState("");
  const [status, setStatus] = React.useState("Ready to claim gaslessly.");
  const [busy, setBusy] = React.useState(false);
  const [claimedStates, setClaimedStates] = React.useState<Record<number, boolean>>({});
  const [mockClaimedStates, setMockClaimedStates] = React.useState<Record<number, boolean>>(() => {
    try {
      const saved = localStorage.getItem("proofpass_mock_claimed");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [checkingClaims, setCheckingClaims] = React.useState(false);

  // Success Celebration states
  const [showSuccessOverlay, setShowSuccessOverlay] = React.useState(false);
  const [successBadgeTitle, setSuccessBadgeTitle] = React.useState("");
  const [successBadgeImage, setSuccessBadgeImage] = React.useState("");

  // Organizer Dashboard Form states
  const [newBadgeName, setNewBadgeName] = React.useState("");
  const [newBadgeIssuer, setNewBadgeIssuer] = React.useState("");
  const [newBadgeVenue, setNewBadgeVenue] = React.useState("");
  const [newBadgeAccent, setNewBadgeAccent] = React.useState("#25a18e");
  const [newBadgeCapacity, setNewBadgeCapacity] = React.useState("100");
  const [newBadgeCode, setNewBadgeCode] = React.useState("");
  const [creatingCampaign, setCreatingCampaign] = React.useState(false);
  const [useLocalMockMode, setUseLocalMockMode] = React.useState(false);

  // Verifier states
  const [verifyAddress, setVerifyAddress] = React.useState("");
  const [verifyResult, setVerifyResult] = React.useState("Enter a wallet to check status.");
  const [checkingVerify, setCheckingVerify] = React.useState(false);

  // Sharing states
  const [shareStatus, setShareStatus] = React.useState("Generate a check-in link for this campaign.");
  const [claimQr, setClaimQr] = React.useState("");

  // QR Camera Scanner states
  const [scannerActive, setScannerActive] = React.useState(false);
  const [scannerStatus, setScannerStatus] = React.useState("Click start to open webcam");
  const [scannerError, setScannerError] = React.useState("");
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);

  const selectedBadge = allBadges.find((badge) => badge.id === selectedBadgeId) || allBadges[0];

  // Load contract owner and badges on load
  React.useEffect(() => {
    loadContractState();
  }, []);

  // Sync local badges to localStorage
  React.useEffect(() => {
    localStorage.setItem("proofpass_local_badges", JSON.stringify(localBadges));
  }, [localBadges]);

  // Sync mock claims to localStorage
  React.useEffect(() => {
    localStorage.setItem("proofpass_mock_claimed", JSON.stringify(mockClaimedStates));
  }, [mockClaimedStates]);

  // Detect query params on load
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const badgeParam = Number(params.get("badge"));
    const codeParam = params.get("code");
    const matchingBadge = allBadges.find((badge) => badge.id === badgeParam);

    if (matchingBadge) {
      setSelectedBadgeId(matchingBadge.id);
    }
    if (codeParam) {
      setClaimCode(codeParam);
      setStatus("Claim link prefilled! Connect wallet and click claim.");
    }
  }, [allBadges.length]);

  // Generate QR code for the sharing link
  React.useEffect(() => {
    const link = makeClaimLink(selectedBadge.id, selectedBadge.code || "DEMO");
    let active = true;

    import("qrcode")
      .then(({ default: QRCode }) =>
        QRCode.toDataURL(link, {
          color: { dark: "#060913", light: "#ffffff" },
          margin: 1,
          width: 280,
        }),
      )
      .then((qr) => {
        if (active) setClaimQr(qr);
      })
      .catch(() => setClaimQr(""));

    return () => {
      active = false;
    };
  }, [selectedBadge.id, selectedBadge.code]);

  const loadContractState = async () => {
    if (!hasContractAddress) return;
    try {
      const readProvider = new JsonRpcProvider(
        import.meta.env.VITE_BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
      );
      const proofPass = new Contract(contractAddress, [
        "function owner() view returns (address)",
        "function nextBadgeId() view returns (uint256)",
        "function badges(uint256) view returns (string name, string metadataUri, bytes32 claimCodeHash, uint256 maxClaims, uint256 claimCount, bool active)"
      ], readProvider);

      const ownerAddr = await proofPass.owner();
      setContractOwner(ownerAddr);

      const count = Number(await proofPass.nextBadgeId());
      const list = [];
      for (let i = 1; i < count; i++) {
        try {
          const badgeData = await proofPass.badges(i);
          const metadata = parseMetadataUri(badgeData[1]);
          
          let issuer = "Base Builders Week";
          let venue = "Main stage check-in";
          let image = "";
          
          if (metadata) {
            image = metadata.image || "";
            if (metadata.attributes) {
              const issuerAttr = metadata.attributes.find((a: any) => a.trait_type === "Issuer");
              if (issuerAttr) issuer = issuerAttr.value;
              const venueAttr = metadata.attributes.find((a: any) => a.trait_type === "Venue");
              if (venueAttr) venue = venueAttr.value;
            }
          }

          // Preseeded codes mapping
          const codeMap: Record<number, string> = {
            1: "BUILDER-2026",
            2: "WORKSHOP-2026",
            3: "COMMUNITY-2026",
          };

          list.push({
            id: i,
            title: badgeData[0] || metadata?.name || `Badge #${i}`,
            issuer,
            venue,
            capacity: badgeData[3] > 0n ? `${badgeData[3]} seats` : "Unlimited",
            maxClaims: Number(badgeData[3]),
            claimCount: Number(badgeData[4]),
            active: badgeData[5],
            metadataUri: badgeData[1],
            image,
            accent: getAccentColor(i),
            code: codeMap[i] || "",
            isMock: false,
          });
        } catch (e) {
          console.error(`Failed to fetch badge ${i} details:`, e);
        }
      }
      setContractBadges(list);
    } catch (err) {
      console.error("Failed to load contract state:", err);
    }
  };

  function markStep(index: number, state: StepState) {
    setSteps((current) =>
      current.map((step, stepIndex) => (stepIndex === index ? { ...step, state } : step)),
    );
  }

  function resetSteps() {
    setTxHash("");
    setSteps((current) => current.map((step) => ({ ...step, state: "idle" })));
  }

  async function connectWallet() {
    if (!window.ethereum) {
      setStatus("Install MetaMask or another injected wallet to continue.");
      return;
    }

    const provider = new BrowserProvider(window.ethereum);
    await window.ethereum.request({ method: "eth_requestAccounts" });
    await ensureBaseSepolia();
    const signer = await provider.getSigner();
    const userAddress = await signer.getAddress();
    setAccount(userAddress);
    setStatus("Wallet connected! Ready to claim gaslessly using Mock USD.");
    await refreshClaimedCredentials(userAddress);
  }

  async function checkMockUsdBalance() {
    if (!window.ethereum) {
      setStatus("Install MetaMask or another injected wallet to continue.");
      return;
    }

    setCheckingBalance(true);

    try {
      await ensureBaseSepolia();
      const browserProvider = new BrowserProvider(window.ethereum);
      const signer = await browserProvider.getSigner();
      const userAddress = await signer.getAddress();
      const client = new UGFClient();
      let tokenAddress = tyiTokenFallback;

      try {
        const chainEntry = await client.registry.getChainEntry(TYI_USD_PAYMENT_COIN, BASE_SEPOLIA_CHAIN_ID);
        tokenAddress = chainEntry.address;
      } catch {
        tokenAddress = tyiTokenFallback;
      }

      const token = new Contract(tokenAddress, erc20Abi, browserProvider);
      const [rawBalance, decimals, symbol] = await Promise.all([
        token.balanceOf(userAddress),
        token.decimals(),
        token.symbol(),
      ]);

      setAccount(userAddress);
      setMockUsdRawBalance(rawBalance);
      setMockUsdDecimals(BigInt(decimals));
      setMockUsdBalance(`${formatToken(rawBalance, BigInt(decimals))} ${symbol}`);
      setStatus("Mock USD balance refreshed.");
      await refreshClaimedCredentials(userAddress);
    } catch (error) {
      setMockUsdBalance("Could not check");
      setStatus(getErrorMessage(error));
    } finally {
      setCheckingBalance(false);
    }
  }

  async function ensureBaseSepolia() {
    if (!window.ethereum) return;

    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: baseSepoliaHex }],
      });
    } catch (error) {
      const maybeCode = (error as { code?: number }).code;
      if (maybeCode !== 4902) throw error;

      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: baseSepoliaHex,
            chainName: "Base Sepolia",
            nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
            rpcUrls: ["https://sepolia.base.org"],
            blockExplorerUrls: ["https://sepolia.basescan.org"],
          },
        ],
      });
    }
  }

  // Claim process supporting simulated mock claim and real contract claim
  async function claimWithUgf() {
    if (selectedBadge.isMock) {
      // Execute Simulated Mock Claim
      setBusy(true);
      resetSteps();
      setStatus("Simulating gasless claim for Mock Campaign.");
      
      try {
        markStep(0, "active");
        await new Promise((r) => setTimeout(r, 1000));
        markStep(0, "done");
        
        setStatus("Simulating gas quote in Mock USD.");
        markStep(1, "active");
        await new Promise((r) => setTimeout(r, 1000));
        markStep(1, "done");
        
        setStatus("Simulating gas settlement with Mock USD.");
        markStep(2, "active");
        await new Promise((r) => setTimeout(r, 1200));
        markStep(2, "done");
        
        setStatus("Simulating contract execution.");
        markStep(3, "active");
        await new Promise((r) => setTimeout(r, 1500));
        markStep(3, "done");
        
        setStatus("Confirming transaction block receipt.");
        markStep(4, "active");
        await new Promise((r) => setTimeout(r, 1000));
        markStep(4, "done");

        setMockClaimedStates((prev) => ({ ...prev, [selectedBadge.id]: true }));
        setTxHash("0xmock_hash_" + Math.random().toString(16).substring(2, 10));
        setStatus("Mock Badge claimed successfully!");

        // Show celebration
        setSuccessBadgeTitle(selectedBadge.title);
        setSuccessBadgeImage(selectedBadge.image || "");
        setShowSuccessOverlay(true);
      } catch (err) {
        setStatus("Mock claim failed.");
      } finally {
        setBusy(false);
      }
      return;
    }

    // Real Onchain Claim Flow
    if (!window.ethereum) {
      setStatus("Install MetaMask or another injected wallet to continue.");
      return;
    }

    if (!hasContractAddress) {
      setStatus("Add your deployed contract address to VITE_PROOFPASS_CONTRACT_ADDRESS first.");
      return;
    }

    setBusy(true);
    resetSteps();

    try {
      await ensureBaseSepolia();
      const browserProvider = new BrowserProvider(window.ethereum);
      const signer = await browserProvider.getSigner();
      const userAddress = await signer.getAddress();
      setAccount(userAddress);

      const readProvider = new JsonRpcProvider(
        import.meta.env.VITE_BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
      );
      const proofPass = new Contract(contractAddress, proofPassAbi, readProvider);
      const alreadyClaimed = await proofPass.hasClaimed(userAddress, selectedBadge.id);

      if (alreadyClaimed) {
        setStatus("This wallet already claimed that badge. Pick another badge for the demo.");
        return;
      }

      if (!claimCode.trim()) {
        setStatus("Enter the event claim code before starting the gasless claim.");
        return;
      }

      if (mockUsdRawBalance === null) {
        setStatus("Click Check to load your TYI_MOCK_USD balance before claiming.");
        return;
      }

      if (mockUsdRawBalance === 0n) {
        setStatus("You have 0 TYI_MOCK_USD. Use the UGF faucet first, then click Check again.");
        return;
      }

      const iface = new Interface(proofPassAbi);
      const data = iface.encodeFunctionData("claimBadge", [selectedBadge.id, claimCode.trim()]);
      const client = new UGFClient();

      setStatus("Authenticating wallet with UGF.");
      markStep(0, "active");
      await client.auth.login(signer as never);
      markStep(0, "done");

      setStatus("Getting a Mock USD gas quote.");
      markStep(1, "active");
      const quote = await client.quote.get({
        payer_address: userAddress,
        tx_object: JSON.stringify({
          from: userAddress,
          to: contractAddress,
          data,
          value: "0",
        }),
      });
      markStep(1, "done");

      const paymentAmount = BigInt(quote.payment_amount);
      setStatus(`Quote received: ${formatToken(paymentAmount, mockUsdDecimals)} TYI_MOCK_USD needed.`);

      if (mockUsdRawBalance !== null && mockUsdRawBalance < paymentAmount) {
        setStatus(
          `Not enough TYI_MOCK_USD. Need ${formatToken(paymentAmount, mockUsdDecimals)}, have ${formatToken(
            mockUsdRawBalance,
            mockUsdDecimals,
          )}.`,
        );
        return;
      }

      setStatus("Settling gas payment with Mock USD.");
      markStep(2, "active");
      await client.payment.x402.execute({ quote, signer: signer as never });
      markStep(2, "done");

      setStatus("UGF is sponsoring and sending the badge claim.");
      markStep(3, "active");
      const result = await client.chains.evm.sponsorAndExecute(
        quote.digest,
        signer as never,
        async () => ({
          to: contractAddress,
          data,
          value: 0n,
        }),
        {
          maxAttempts: 40,
          intervalMs: 3000,
          onTick: (routeStatus, attempt) => {
            setStatus(`UGF route status ${attempt}/40: ${routeStatus.status}.`);
          },
        },
      );
      markStep(3, "done");

      setStatus("Badge claim confirmed on Base Sepolia.");
      markStep(4, "done");
      setTxHash(result.userTxHash);
      
      // Load SVG image for overlay representation
      setSuccessBadgeTitle(selectedBadge.title);
      setSuccessBadgeImage(selectedBadge.image || "");
      setShowSuccessOverlay(true);

      await refreshClaimedCredentials(userAddress);
    } catch (error) {
      const activeIndex = steps.findIndex((step) => step.state === "active");
      if (activeIndex >= 0) markStep(activeIndex, "error");
      setStatus(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function refreshClaimedCredentials(address = account) {
    if (!address) {
      setStatus("Connect a wallet before loading credentials.");
      return;
    }

    if (!hasContractAddress) {
      setClaimedStates({});
      return;
    }

    setCheckingClaims(true);

    try {
      const readProvider = new JsonRpcProvider(
        import.meta.env.VITE_BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
      );
      const proofPass = new Contract(contractAddress, proofPassAbi, readProvider);
      const results = await Promise.all(
        contractBadges.map(async (badge) => [badge.id, await proofPass.hasClaimed(address, badge.id)] as const),
      );
      setClaimedStates(Object.fromEntries(results));
    } catch (error) {
      console.error(error);
    } finally {
      setCheckingClaims(false);
    }
  }

  // Create Campaign - Supports both onchain and local storage
  async function createCampaign(e: React.FormEvent) {
    e.preventDefault();
    if (!newBadgeName || !newBadgeIssuer || !newBadgeVenue || !newBadgeCode) {
      alert("All fields are required.");
      return;
    }

    setCreatingCampaign(true);

    try {
      if (useLocalMockMode || !isOwner) {
        // Create Mock Badge in local state/storage
        const nextId = 1000 + localBadges.length + 1;
        const newBadge = {
          id: nextId,
          title: newBadgeName,
          issuer: newBadgeIssuer,
          venue: newBadgeVenue,
          accent: newBadgeAccent,
          capacity: `${newBadgeCapacity} seats`,
          maxClaims: Number(newBadgeCapacity),
          claimCount: 0,
          active: true,
          isMock: true,
          code: newBadgeCode,
          image: `data:image/svg+xml;base64,${safeBtoa(makeBadgeSvg(newBadgeName, newBadgeIssuer, newBadgeVenue, newBadgeAccent))}`,
        };

        setLocalBadges((prev) => [...prev, newBadge]);
        setSelectedBadgeId(newBadge.id);
        alert(`Mock Campaign "${newBadgeName}" created successfully! Check it in the Claim Desk.`);
        setActiveTab("claim");
        
        // Reset form
        setNewBadgeName("");
        setNewBadgeIssuer("");
        setNewBadgeVenue("");
        setNewBadgeCode("");
      } else {
        // Onchain Campaign Write (Owner only)
        if (!window.ethereum) {
          alert("Wallet not connected.");
          return;
        }

        await ensureBaseSepolia();
        const provider = new BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const proofPass = new Contract(contractAddress, proofPassAbi, signer);

        const metadata = makeMetadataUri(newBadgeName, newBadgeIssuer, newBadgeVenue, newBadgeAccent);
        
        // Use ethers Keccak256
        const providerForUtils = new JsonRpcProvider(
          import.meta.env.VITE_BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
        );
        const encoder = new Interface(proofPassAbi);
        // Ethers hash
        const { keccak256, toUtf8Bytes } = await import("ethers");
        const claimCodeHash = keccak256(toUtf8Bytes(newBadgeCode));

        const tx = await proofPass.createBadge(
          newBadgeName,
          metadata,
          claimCodeHash,
          BigInt(newBadgeCapacity),
        );
        
        setStatus("Deploying campaign transaction to Base Sepolia...");
        await tx.wait();
        
        alert(`Onchain Campaign "${newBadgeName}" deployed successfully!`);
        await loadContractState();
        setActiveTab("claim");

        // Reset Form
        setNewBadgeName("");
        setNewBadgeIssuer("");
        setNewBadgeVenue("");
        setNewBadgeCode("");
      }
    } catch (error) {
      alert("Failed to create campaign: " + getErrorMessage(error));
    } finally {
      setCreatingCampaign(false);
    }
  }

  async function copyClaimLink() {
    const link = makeClaimLink(selectedBadge.id, selectedBadge.code || "DEMO");
    try {
      await navigator.clipboard.writeText(link);
      setShareStatus("Claim link copied! Turn it into a QR code for check-ins.");
    } catch {
      setShareStatus(link);
    }
  }

  function makeClaimLink(badgeId: number, code: string) {
    const link = new URL(window.location.href);
    link.search = "";
    link.searchParams.set("badge", String(badgeId));
    link.searchParams.set("code", code);
    return link.toString();
  }

  function useDemoCode() {
    if (selectedBadge.code) {
      setClaimCode(selectedBadge.code);
      setStatus("Demo claim code loaded from QR config.");
    }
  }

  async function verifyCredential() {
    if (!verifyAddress.trim()) {
      setVerifyResult("Please enter an attendee wallet address.");
      return;
    }

    if (selectedBadge.isMock) {
      // Mock Verify Check
      const hasMockBadge = mockClaimedStates[selectedBadge.id] === true;
      setVerifyResult(
        hasMockBadge
          ? `${shortAddress(verifyAddress.trim())} holds this Mock credential.`
          : `${shortAddress(verifyAddress.trim())} does not hold this Mock credential.`
      );
      return;
    }

    if (!hasContractAddress) {
      setVerifyResult("Deploy contract and set VITE_PROOFPASS_CONTRACT_ADDRESS first.");
      return;
    }

    setCheckingVerify(true);

    try {
      const readProvider = new JsonRpcProvider(
        import.meta.env.VITE_BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
      );
      const proofPass = new Contract(contractAddress, proofPassAbi, readProvider);
      const claimed = await proofPass.hasClaimed(verifyAddress.trim(), selectedBadge.id);
      setVerifyResult(
        claimed
          ? `${shortAddress(verifyAddress.trim())} holds this credential.`
          : `${shortAddress(verifyAddress.trim())} has not claimed this credential.`,
      );
    } catch (error) {
      setVerifyResult(getErrorMessage(error));
    } finally {
      setCheckingVerify(false);
    }
  }

  // Camera QR scanner integration
  const startCameraScanner = async () => {
    setScannerActive(true);
    setScannerError("");
    setScannerStatus("Accessing webcam...");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute("playsinline", "true");
        videoRef.current.play();
      }

      setScannerStatus("Scanning for event QR...");
      requestAnimationFrame(scanQrFrame);
    } catch (err) {
      setScannerError("Camera access denied or unavailable.");
      setScannerActive(false);
    }
  };

  const stopCameraScanner = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setScannerActive(false);
  };

  const scanQrFrame = () => {
    if (!streamRef.current || !videoRef.current) return;

    const video = videoRef.current;
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      // Create offscreen canvas to process pixels
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        if (code) {
          handleScannedResult(code.data);
          return;
        }
      }
    }
    if (streamRef.current) {
      requestAnimationFrame(scanQrFrame);
    }
  };

  // Image Upload Parser (Fallback/Testing QR Reader)
  const handleQrImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          if (code) {
            handleScannedResult(code.data);
          } else {
            alert("No QR code found in this image.");
          }
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleScannedResult = (text: string) => {
    stopCameraScanner();
    try {
      const url = new URL(text);
      const badgeId = url.searchParams.get("badge");
      const code = url.searchParams.get("code");

      if (badgeId && code) {
        const targetBadge = allBadges.find((b) => b.id === Number(badgeId));
        if (targetBadge) {
          setSelectedBadgeId(targetBadge.id);
          setClaimCode(code);
          setStatus(`QR Scanned: Prefilled "${targetBadge.title}" with claim code.`);
          setActiveTab("claim");
          alert(`Prefilled "${targetBadge.title}" from QR Check-In link!`);
        } else {
          alert(`Scanned Badge ID ${badgeId} not found in configured list.`);
        }
      } else {
        alert(`QR Code content read: "${text}". Please scan a valid ProofPass check-in link.`);
      }
    } catch {
      alert(`Scanned QR Code does not contain a valid URL: "${text}"`);
    }
  };

  return (
    <main className="app-shell">
      {/* Celebration overlay */}
      {showSuccessOverlay && (
        <div className="success-overlay">
          <ConfettiEffect />
          <div className="success-card">
            <div className="success-icon">✓</div>
            <h2 style={{ color: "#ffffff" }}>Credential Claimed!</h2>
            <p style={{ color: "var(--text-secondary)" }}>
              Congratulations! Your credential has been claimed gaslessly using Universal Gas Framework.
            </p>
            {successBadgeImage ? (
              <img 
                src={successBadgeImage} 
                alt={successBadgeTitle} 
                style={{ width: "80%", borderRadius: "10px", margin: "10px 0", border: "1px solid rgba(255,255,255,0.15)" }} 
              />
            ) : (
              <div className="badge-preview" style={{ "--accent": selectedBadge.accent } as React.CSSProperties}>
                <div className="badge-mark">P</div>
                <p>ProofPass</p>
                <h3>{successBadgeTitle}</h3>
                <span>{selectedBadge.issuer}</span>
              </div>
            )}
            <div style={{ display: "flex", gap: "10px", width: "100%", marginTop: "10px" }}>
              {txHash && !txHash.startsWith("0xmock") && (
                <a 
                  className="explorer-link" 
                  href={`https://sepolia.basescan.org/tx/${txHash}`} 
                  target="_blank"
                  style={{ flex: 1 }}
                >
                  View Transaction
                </a>
              )}
              <button 
                className="primary-button" 
                style={{ flex: 1 }}
                onClick={() => setShowSuccessOverlay(false)}
              >
                Awesome
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Top Header */}
      <section className="topbar">
        <div>
          <p className="eyebrow">Gasless event credentials</p>
          <h1>Gasless ProofPass</h1>
        </div>
        <button className="secondary-button" onClick={connectWallet} id="connect-wallet-btn">
          {account ? shortAddress(account) : "Connect Wallet"}
        </button>
      </section>

      {/* Contract deploy status banner */}
      <section className={`deploy-banner ${hasContractAddress ? "ready" : "missing"}`}>
        <div>
          <span>{hasContractAddress ? "Contract connected" : "Contract not configured"}</span>
          <strong>
            {hasContractAddress
              ? `Base Sepolia Address: ${shortAddress(contractAddress)}`
              : "Level 1 UX Active. Configure VITE_PROOFPASS_CONTRACT_ADDRESS in .env for live onchain operations."}
          </strong>
        </div>
        {hasContractAddress && (
          <a className="secondary-button small" href={`https://sepolia.basescan.org/address/${contractAddress}`} target="_blank">
            BaseScan
          </a>
        )}
      </section>

      {/* Global Tab Navigation */}
      <div className="tabs-navigation">
        <button className={`tab-btn ${activeTab === "claim" ? "active" : ""}`} onClick={() => setActiveTab("claim")} id="tab-claim">
          Claim Desk
        </button>
        <button className={`tab-btn ${activeTab === "organizer" ? "active" : ""}`} onClick={() => setActiveTab("organizer")} id="tab-organizer">
          Organizer Portal
        </button>
        <button className={`tab-btn ${activeTab === "verifier" ? "active" : ""}`} onClick={() => { setActiveTab("verifier"); stopCameraScanner(); }} id="tab-verifier">
          Verifier Portal
        </button>
        <button className={`tab-btn ${activeTab === "scanner" ? "active" : ""}`} onClick={() => setActiveTab("scanner")} id="tab-scanner">
          Scan QR Check-In
        </button>
      </div>

      {/* Info Strip */}
      <section className="brief-strip">
        <article>
          <span>Organizers</span>
          <strong>Publish claim campaigns with limited seats and event check-in codes.</strong>
        </article>
        <article>
          <span>Attendees</span>
          <strong>Claim credentials gaslessly. UGF settles gas with Mock USD.</strong>
        </article>
        <article>
          <span>Verifiers</span>
          <strong>Check check-in records and cryptographically verify wallet attendance.</strong>
        </article>
      </section>

      {/* Main Grid workspace */}
      <section className="workspace">
        
        {/* Left Side Active Panel */}
        <div className="claim-panel">
          
          {activeTab === "claim" && (
            <>
              <div className="panel-heading">
                <p className="eyebrow">Attendee claim desk</p>
                <h2>Claim a verified event credential</h2>
              </div>

              <div className="badge-grid">
                {allBadges.map((badge) => (
                  <button
                    className={`badge-option ${badge.id === selectedBadgeId ? "selected" : ""}`}
                    key={badge.id}
                    onClick={() => setSelectedBadgeId(badge.id)}
                    style={{ "--accent": badge.accent } as React.CSSProperties}
                  >
                    <span>{badge.title} {badge.isMock && <span style={{ fontSize: "0.75rem", background: "rgba(255,255,255,0.1)", padding: "2px 6px", borderRadius: "4px", color: "var(--warning)" }}>MOCK</span>}</span>
                    <small>{badge.issuer}</small>
                    <em>{badge.venue} · {badge.capacity}</em>
                  </button>
                ))}
              </div>

              <div className="input-group">
                <label className="input-label" htmlFor="claim-code">
                  Event claim code
                </label>
                <input
                  className="text-input"
                  id="claim-code"
                  onChange={(event) => setClaimCode(event.target.value)}
                  placeholder="Enter code from organizer"
                  value={claimCode}
                />
                <p className="field-hint">{selectedBadge.hint || "Ask event staff for code"}</p>
              </div>

              {!selectedBadge.isMock && (
                <>
                  <div className="readiness-panel">
                    <div>
                      <span>Mock USD balance</span>
                      <strong>{mockUsdBalance}</strong>
                    </div>
                    <div className="readiness-actions">
                      <button className="secondary-button small" disabled={checkingBalance} onClick={checkMockUsdBalance} id="check-balance-btn">
                        {checkingBalance ? "Checking..." : "Check"}
                      </button>
                      <a className="secondary-button small" href={faucetUrl} target="_blank">
                        Faucet
                      </a>
                    </div>
                  </div>
                  <p className="faucet-note">
                    UGF faucet mints TYI_MOCK_USD by locking a tiny amount of Base Sepolia ETH. After that, this claim flow
                    pays gas with TYI_MOCK_USD instead of requiring ETH.
                  </p>
                </>
              )}

              <button className="primary-button" disabled={busy} onClick={claimWithUgf} id="claim-badge-btn">
                {busy ? "Claiming..." : `Claim ${selectedBadge.isMock ? "Mock" : ""} Badge Gaslessly`}
              </button>
              <p className="status-line">{status}</p>
            </>
          )}

          {activeTab === "organizer" && (
            <>
              <div className="panel-heading">
                <p className="eyebrow">Organizer dashboard</p>
                <h2>Publish a new credential campaign</h2>
              </div>

              <form onSubmit={createCampaign} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
                <div className="input-group">
                  <label className="input-label">Campaign Name</label>
                  <input
                    className="text-input"
                    placeholder="e.g. Hackathon Finalist Pass"
                    value={newBadgeName}
                    onChange={(e) => setNewBadgeName(e.target.value)}
                  />
                </div>

                <div className="input-group">
                  <label className="input-label">Issuer / Organizer Name</label>
                  <input
                    className="text-input"
                    placeholder="e.g. Base Guild Academy"
                    value={newBadgeIssuer}
                    onChange={(e) => setNewBadgeIssuer(e.target.value)}
                  />
                </div>

                <div className="input-group">
                  <label className="input-label">Venue / Location Description</label>
                  <input
                    className="text-input"
                    placeholder="e.g. Room 404 & online livestream"
                    value={newBadgeVenue}
                    onChange={(e) => setNewBadgeVenue(e.target.value)}
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div className="input-group">
                    <label className="input-label">Accents Color</label>
                    <select 
                      className="text-input" 
                      style={{ background: "#0a0f1d" }}
                      value={newBadgeAccent}
                      onChange={(e) => setNewBadgeAccent(e.target.value)}
                    >
                      <option value="#25a18e">Teal Green</option>
                      <option value="#ffb703">Gold Yellow</option>
                      <option value="#e76f51">Coral Orange</option>
                      <option value="#818cf8">Indigo Violet</option>
                      <option value="#ec4899">Sweet Pink</option>
                      <option value="#3b82f6">Ocean Blue</option>
                    </select>
                  </div>
                  <div className="input-group">
                    <label className="input-label">Capacity (Max Claims)</label>
                    <input
                      className="text-input"
                      type="number"
                      placeholder="100"
                      value={newBadgeCapacity}
                      onChange={(e) => setNewBadgeCapacity(e.target.value)}
                    />
                  </div>
                </div>

                <div className="input-group">
                  <label className="input-label">Secret Event Claim Code (Attendees use this to claim)</label>
                  <input
                    className="text-input"
                    placeholder="e.g. HACK-MAIN-2026"
                    value={newBadgeCode}
                    onChange={(e) => setNewBadgeCode(e.target.value)}
                  />
                  <p className="field-hint">The app will store a cryptographically secure keccak256 hash of this code onchain.</p>
                </div>

                {hasContractAddress && (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", margin: "4px 0" }}>
                    <input 
                      type="checkbox" 
                      id="mock-check" 
                      checked={useLocalMockMode} 
                      onChange={(e) => setUseLocalMockMode(e.target.checked)} 
                    />
                    <label htmlFor="mock-check" className="input-label" style={{ margin: 0, cursor: "pointer" }}>
                      Create Local Mock Campaign (No owner wallet needed)
                    </label>
                  </div>
                )}

                {!isOwner && !useLocalMockMode && hasContractAddress && (
                  <p style={{ color: "var(--warning)", fontSize: "0.85rem", background: "rgba(245,158,11,0.08)", padding: "10px", borderRadius: "8px", border: "1px solid rgba(245,158,11,0.2)" }}>
                    <strong>Notice:</strong> Your connected wallet is not the owner of this contract. You must check "Create Local Mock Campaign" or switch to the contract owner key to deploy onchain.
                  </p>
                )}

                <button 
                  className="primary-button" 
                  type="submit" 
                  disabled={creatingCampaign || (!isOwner && !useLocalMockMode && hasContractAddress)}
                  id="create-campaign-btn"
                >
                  {creatingCampaign ? "Creating..." : `Create ${(!isOwner || useLocalMockMode) ? "Mock" : "Onchain"} Campaign`}
                </button>
              </form>
            </>
          )}

          {activeTab === "verifier" && (
            <>
              <div className="panel-heading">
                <p className="eyebrow">Verifier panel</p>
                <h2>Check attendee credential status</h2>
              </div>
              
              <div className="verify-panel">
                <label className="input-label">Selected Campaign</label>
                <div style={{ padding: "12px", border: "1px solid var(--border-color)", borderRadius: "8px", background: "rgba(255,255,255,0.02)" }}>
                  <strong>{selectedBadge.title}</strong>
                  <span style={{ display: "block", color: "var(--text-secondary)", fontSize: "0.85rem", marginTop: "2px" }}>{selectedBadge.issuer}</span>
                </div>
                
                <div className="input-group" style={{ marginTop: "10px" }}>
                  <label className="input-label">Attendee Wallet Address</label>
                  <input
                    className="text-input"
                    onChange={(event) => setVerifyAddress(event.target.value)}
                    placeholder="0x attendee wallet address"
                    value={verifyAddress}
                  />
                </div>

                <button className="primary-button" disabled={checkingVerify} onClick={verifyCredential} id="verify-wallet-btn">
                  {checkingVerify ? "Checking..." : "Verify Wallet"}
                </button>
                
                <div className="verify-result">
                  <strong>Result:</strong>
                  <p style={{ marginTop: "4px" }}>{verifyResult}</p>
                </div>
              </div>
            </>
          )}

          {activeTab === "scanner" && (
            <>
              <div className="panel-heading">
                <p className="eyebrow">QR scanner</p>
                <h2>Scan Check-In Code</h2>
              </div>

              {!scannerActive ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                  <div className="drag-drop-zone" onClick={() => document.getElementById("qr-file-input")?.click()}>
                    <input 
                      type="file" 
                      id="qr-file-input" 
                      accept="image/*" 
                      style={{ display: "none" }} 
                      onChange={handleQrImageUpload}
                    />
                    <div style={{ fontSize: "2rem", color: "#818cf8" }}>📷</div>
                    <strong>Drag & Drop QR Image or Click to Upload</strong>
                    <p>Ideal for scanning from screenshots or mobile check-in passes.</p>
                  </div>
                  
                  <button className="primary-button" onClick={startCameraScanner}>
                    Start Camera Scanner
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <div className="scanner-viewport">
                    <video ref={videoRef} className="scanner-video" />
                    <div className="scanner-overlay">
                      <div className="scanner-laser" />
                    </div>
                  </div>
                  <p style={{ color: "var(--text-secondary)", textAlign: "center" }}>{scannerStatus}</p>
                  <button className="secondary-button" onClick={stopCameraScanner}>
                    Cancel Scan
                  </button>
                </div>
              )}
              {scannerError && <p style={{ color: "var(--error)", fontSize: "0.88rem", textAlign: "center" }}>{scannerError}</p>}
            </>
          )}
        </div>

        {/* Right Side Info & Preview Panel */}
        <div className="preview-panel">
          
          {/* Badge Image Visualization */}
          {selectedBadge.image ? (
            <div className="credential-story">
              <img src={selectedBadge.image} alt={selectedBadge.title} />
            </div>
          ) : (
            <div className="badge-preview" style={{ "--accent": selectedBadge.accent } as React.CSSProperties}>
              <div className="badge-mark">P</div>
              <p>ProofPass Credential</p>
              <h3>{selectedBadge.title}</h3>
              <span>{selectedBadge.issuer}</span>
            </div>
          )}

          {/* Organizer details preview for selected badge */}
          <div className="organizer-panel">
            <p className="eyebrow">Selected campaign details</p>
            <h3>{selectedBadge.title}</h3>
            <dl>
              <div>
                <dt>Issuer</dt>
                <dd>{selectedBadge.issuer}</dd>
              </div>
              <div>
                <dt>Venue</dt>
                <dd>{selectedBadge.venue}</dd>
              </div>
              <div>
                <dt>Register Mode</dt>
                <dd>{selectedBadge.isMock ? "Mock / Sandbox Mode" : "UGF + Base Sepolia"}</dd>
              </div>
              {!selectedBadge.isMock && (
                <div>
                  <dt>Claim Status</dt>
                  <dd>{selectedBadge.claimCount} claimed / {selectedBadge.capacity}</dd>
                </div>
              )}
            </dl>
            <div className="organizer-actions">
              {selectedBadge.code && (
                <button className="secondary-button small" onClick={useDemoCode} id="fill-code-btn">
                  Use Demo Code
                </button>
              )}
              <button className="secondary-button small" onClick={copyClaimLink} id="copy-link-btn">
                Copy Link
              </button>
            </div>
            <p className="field-hint" style={{ fontSize: "0.8rem", textAlign: "center" }}>{shareStatus}</p>
            {claimQr && (
              <div className="qr-panel">
                <img src={claimQr} alt={`${selectedBadge.title} QR claim link`} />
                <span>Scan this QR code from another device to open the prefilled claim screen!</span>
              </div>
            )}
          </div>

          {/* UGF claiming progression timeline */}
          <div className="timeline">
            {steps.map((step) => (
              <div className={`timeline-row ${step.state}`} key={step.label}>
                <span className="timeline-dot" />
                <span>{step.label}</span>
              </div>
            ))}
          </div>

          {txHash && (
            txHash.startsWith("0xmock") ? (
              <p className="status-line">Mock Claim Hash: <code>{txHash}</code></p>
            ) : (
              <a className="explorer-link" href={`https://sepolia.basescan.org/tx/${txHash}`} target="_blank">
                View Transaction on BaseScan
              </a>
            )
          )}

          {/* Attendee Credentials List */}
          <div className="verify-panel">
            <p className="eyebrow">My credentials</p>
            <h2>Your Credential Status</h2>
            <button className="secondary-button" disabled={checkingClaims || !account} onClick={() => refreshClaimedCredentials()} id="refresh-credentials-btn">
              {checkingClaims ? "Loading..." : "Refresh Credentials"}
            </button>
            <div className="credential-list">
              {allBadges.map((badge) => {
                const isClaimed = badge.isMock ? mockClaimedStates[badge.id] : claimedStates[badge.id];
                return (
                  <div className="credential-row" key={badge.id}>
                    <span style={{ "--accent": badge.accent } as React.CSSProperties} />
                    <div>
                      <strong>{badge.title} {badge.isMock && <span style={{ fontSize: "0.7rem", color: "var(--warning)" }}>(Mock)</span>}</strong>
                      <small style={{ color: isClaimed ? "var(--success)" : "var(--text-secondary)" }}>
                        {isClaimed ? "Claimed ✓" : "Not claimed"}
                      </small>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    };
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
