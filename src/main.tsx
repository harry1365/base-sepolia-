import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserProvider, Contract, Interface, JsonRpcProvider } from "ethers";
import {
  BASE_SEPOLIA_CHAIN_ID,
  TYI_USD_PAYMENT_COIN,
  UGFClient,
} from "@tychilabs/ugf-testnet-js";
import "./styles.css";

const proofPassAbi = [
  "function claimBadge(uint256 badgeId,string claimCode) returns (uint256 tokenId)",
  "function hasClaimed(address user, uint256 badgeId) view returns (bool)",
];

const erc20Abi = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

const badges = [
  {
    id: 1,
    title: "Hackathon Builder Pass",
    issuer: "Base Builders Week",
    accent: "#25a18e",
    hint: "Demo code: BUILDER-2026",
    code: "BUILDER-2026",
    venue: "Main stage check-in",
    capacity: "100 seats",
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

function formatToken(rawBalance: bigint, decimals: bigint, displayDecimals = 6) {
  const divisor = 10n ** decimals;
  const whole = rawBalance / divisor;
  const displayDivisor = 10n ** BigInt(displayDecimals);
  const fraction = ((rawBalance % divisor) * displayDivisor) / divisor;

  return `${whole}.${fraction.toString().padStart(displayDecimals, "0")}`;
}

function App() {
  const [account, setAccount] = React.useState("");
  const [selectedBadgeId, setSelectedBadgeId] = React.useState(1);
  const [steps, setSteps] = React.useState<TxStep[]>([
    { label: "Authenticate", state: "idle" },
    { label: "Quote", state: "idle" },
    { label: "Settle Mock USD", state: "idle" },
    { label: "Execute Claim", state: "idle" },
    { label: "Confirm", state: "idle" },
  ]);
  const [txHash, setTxHash] = React.useState("");
  const [status, setStatus] = React.useState("Ready to claim without Base Sepolia ETH.");
  const [busy, setBusy] = React.useState(false);
  const [claimCode, setClaimCode] = React.useState("");
  const [mockUsdBalance, setMockUsdBalance] = React.useState("Not checked");
  const [mockUsdRawBalance, setMockUsdRawBalance] = React.useState<bigint | null>(null);
  const [mockUsdDecimals, setMockUsdDecimals] = React.useState<bigint>(6n);
  const [checkingBalance, setCheckingBalance] = React.useState(false);
  const [verifyAddress, setVerifyAddress] = React.useState("");
  const [verifyResult, setVerifyResult] = React.useState("Enter a wallet to verify this credential.");
  const [checkingVerify, setCheckingVerify] = React.useState(false);
  const [shareStatus, setShareStatus] = React.useState("Generate a check-in link for this campaign.");
  const [claimedStates, setClaimedStates] = React.useState<Record<number, boolean>>({});
  const [checkingClaims, setCheckingClaims] = React.useState(false);

  const selectedBadge = badges.find((badge) => badge.id === selectedBadgeId) || badges[0];

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const badgeParam = Number(params.get("badge"));
    const codeParam = params.get("code");
    const matchingBadge = badges.find((badge) => badge.id === badgeParam);

    if (matchingBadge) {
      setSelectedBadgeId(matchingBadge.id);
    }

    if (codeParam) {
      setClaimCode(codeParam);
      setStatus("Claim link loaded. Connect wallet and claim when ready.");
    }
  }, []);

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
    setStatus("Wallet connected. You can claim using Mock USD for gas.");
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
      setStatus("Mock USD balance checked. You do not need Base Sepolia ETH for the ProofPass claim itself.");
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

  async function claimWithUgf() {
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
        badges.map(async (badge) => [badge.id, await proofPass.hasClaimed(address, badge.id)] as const),
      );

      setClaimedStates(Object.fromEntries(results));
    } catch (error) {
      setStatus(getErrorMessage(error));
    } finally {
      setCheckingClaims(false);
    }
  }

  async function copyClaimLink() {
    const link = new URL(window.location.href);
    link.searchParams.set("badge", String(selectedBadge.id));
    link.searchParams.set("code", selectedBadge.code);

    try {
      await navigator.clipboard.writeText(link.toString());
      setShareStatus("Claim link copied. Turn this into a QR code for event check-in.");
    } catch {
      setShareStatus(link.toString());
    }
  }

  function useDemoCode() {
    setClaimCode(selectedBadge.code);
    setStatus("Demo claim code filled from the organizer campaign.");
  }

  async function verifyCredential() {
    if (!hasContractAddress) {
      setVerifyResult("Deploy the contract and set VITE_PROOFPASS_CONTRACT_ADDRESS before verification.");
      return;
    }

    if (!verifyAddress.trim()) {
      setVerifyResult("Enter the attendee wallet address to verify.");
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

  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">Gasless event credentials</p>
          <h1>Gasless ProofPass</h1>
        </div>
        <button className="secondary-button" onClick={connectWallet}>
          {account ? shortAddress(account) : "Connect Wallet"}
        </button>
      </section>

      <section className={`deploy-banner ${hasContractAddress ? "ready" : "missing"}`}>
        <div>
          <span>{hasContractAddress ? "Contract connected" : "Contract not deployed yet"}</span>
          <strong>
            {hasContractAddress
              ? `Base Sepolia: ${shortAddress(contractAddress)}`
              : "Level 1 UI works. Level 2 claim/verify needs VITE_PROOFPASS_CONTRACT_ADDRESS."}
          </strong>
        </div>
        {hasContractAddress && (
          <a className="secondary-button small" href={`https://sepolia.basescan.org/address/${contractAddress}`} target="_blank">
            BaseScan
          </a>
        )}
      </section>

      <section className="brief-strip">
        <article>
          <span>Organizer</span>
          <strong>Creates claim campaigns with limited seats and event codes.</strong>
        </article>
        <article>
          <span>Attendee</span>
          <strong>Claims the credential without holding Base Sepolia ETH.</strong>
        </article>
        <article>
          <span>Verifier</span>
          <strong>Checks a wallet's credential status from the same app.</strong>
        </article>
      </section>

      <section className="workspace">
        <div className="claim-panel">
          <div className="panel-heading">
            <p className="eyebrow">Attendee claim desk</p>
            <h2>Claim a verified event credential</h2>
          </div>

          <div className="badge-grid">
            {badges.map((badge) => (
              <button
                className={`badge-option ${badge.id === selectedBadgeId ? "selected" : ""}`}
                key={badge.id}
                onClick={() => setSelectedBadgeId(badge.id)}
                style={{ "--accent": badge.accent } as React.CSSProperties}
              >
                <span>{badge.title}</span>
                <small>{badge.issuer}</small>
                <em>{badge.venue} · {badge.capacity}</em>
              </button>
            ))}
          </div>

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
          <p className="field-hint">{selectedBadge.hint}</p>

          <div className="readiness-panel">
            <div>
              <span>Mock USD balance</span>
              <strong>{mockUsdBalance}</strong>
            </div>
            <div className="readiness-actions">
              <button className="secondary-button small" disabled={checkingBalance} onClick={checkMockUsdBalance}>
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

          <button className="primary-button" disabled={busy} onClick={claimWithUgf}>
            {busy ? "Claiming..." : "Claim Badge Gaslessly"}
          </button>
          <p className="status-line">{status}</p>
        </div>

        <div className="preview-panel">
          <div className="organizer-panel">
            <p className="eyebrow">Organizer campaign</p>
            <h2>{selectedBadge.title}</h2>
            <dl>
              <div>
                <dt>Issuer</dt>
                <dd>{selectedBadge.issuer}</dd>
              </div>
              <div>
                <dt>Gate</dt>
                <dd>Event claim code</dd>
              </div>
              <div>
                <dt>Gas mode</dt>
                <dd>UGF + Mock USD</dd>
              </div>
            </dl>
            <div className="organizer-actions">
              <button className="secondary-button small" onClick={useDemoCode}>
                Use Demo Code
              </button>
              <button className="secondary-button small" onClick={copyClaimLink}>
                Copy Claim Link
              </button>
            </div>
            <p className="field-hint">{shareStatus}</p>
          </div>

          <div className="badge-preview" style={{ "--accent": selectedBadge.accent } as React.CSSProperties}>
            <div className="badge-mark">P</div>
            <p>ProofPass</p>
            <h2>{selectedBadge.title}</h2>
            <span>{selectedBadge.issuer}</span>
          </div>

          <div className="timeline">
            {steps.map((step) => (
              <div className={`timeline-row ${step.state}`} key={step.label}>
                <span className="timeline-dot" />
                <span>{step.label}</span>
              </div>
            ))}
          </div>

          {txHash && (
            <a className="explorer-link" href={`https://sepolia.basescan.org/tx/${txHash}`} target="_blank">
              View transaction
            </a>
          )}

          <div className="verify-panel">
            <p className="eyebrow">Verifier</p>
            <h2>Check attendee credential</h2>
            <input
              className="text-input"
              onChange={(event) => setVerifyAddress(event.target.value)}
              placeholder="0x attendee wallet"
              value={verifyAddress}
            />
            <button className="secondary-button" disabled={checkingVerify} onClick={verifyCredential}>
              {checkingVerify ? "Checking..." : "Verify Wallet"}
            </button>
            <p>{verifyResult}</p>
          </div>

          <div className="verify-panel">
            <p className="eyebrow">My credentials</p>
            <h2>Connected wallet status</h2>
            <button className="secondary-button" disabled={checkingClaims || !account} onClick={() => refreshClaimedCredentials()}>
              {checkingClaims ? "Loading..." : "Refresh Credentials"}
            </button>
            <div className="credential-list">
              {badges.map((badge) => (
                <div className="credential-row" key={badge.id}>
                  <span style={{ "--accent": badge.accent } as React.CSSProperties} />
                  <div>
                    <strong>{badge.title}</strong>
                    <small>{claimedStates[badge.id] ? "Claimed" : "Not claimed"}</small>
                  </div>
                </div>
              ))}
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
