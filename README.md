# Gasless ProofPass

Gasless ProofPass is a gasless event credential system for Base Sepolia. Organizers create claim-gated credential campaigns, attendees claim certificates without holding ETH, and verifiers can check whether a wallet actually holds a credential.

UGF handles the gas side and lets the user settle gas with `TYI_MOCK_USD`.

## Product Thesis

Onchain credentials already have strong real-world examples:

- POAP proves that event memories and attendance badges are a real user behavior.
- Ethereum Attestation Service proves that attestations are a serious identity and reputation primitive.
- Galxe proves that credential campaigns can be useful for communities, growth, and rewards.

The gap ProofPass targets is narrower:

```text
How do we make onchain event credentials usable for first-time attendees who have no ETH?
```

ProofPass is not trying to beat POAP, EAS, or Galxe on ecosystem size. It is using the hackathon's UGF requirement to solve one concrete onboarding problem: the attendee should not need destination-chain gas before claiming a credential.

## Problem Statement Fit

The hackathon asks for a beginner-friendly dApp on Base Sepolia where a user performs a real onchain action without needing ETH for gas. The user should pay gas with Mock USD through UGF.

ProofPass fits that requirement directly:

- Chain: Base Sepolia
- User action: claim an event-code-gated onchain badge or certificate NFT
- Gas abstraction: UGF handles quote, settlement, execution, and confirmation
- Settlement asset: `TYI_MOCK_USD`
- UX goal: the user does not need destination-chain ETH before claiming

## Why It Exists

New Web3 users often get stuck before their first transaction because they need the correct native gas token on the correct network. Even a "free" NFT badge is not really free if the user first has to understand faucets, network switching, gas fees, and failed transactions.

ProofPass focuses on a familiar real-world action: claiming a participation badge or completion certificate. Events, hackathons, workshops, and colleges already issue certificates. Putting those credentials onchain makes them verifiable, but the claim flow should not force beginners to learn gas mechanics first.

The value of the credential is proving participation, not teaching the user how Base Sepolia ETH works.

UGF is useful here because it separates the destination action from the destination gas requirement. The user can settle gas with Mock USD while UGF completes the badge claim on Base Sepolia.

## Real-World Use Case

ProofPass is designed for events and learning programs where credentials are useful but the audience may not be crypto-native:

- Hackathon check-ins
- Workshop completion certificates
- College club participation records
- Sponsor booth visit credentials
- DAO contributor proof
- Community reward eligibility

The organizer creates a credential campaign with a claim code or QR code. The attendee enters the code and claims without Base Sepolia ETH. A verifier can later check that the attendee wallet claimed the credential.

## Why This Is Worth Considering

ProofPass is not just a generic NFT minter. It is a gasless credential operations flow for first-time Web3 users.

Strong reasons to consider it:

- It solves the exact UX failure described by the problem statement: useful onchain actions should not break because the user has no ETH.
- It uses a real scenario: attendance badges, course certificates, workshop completion proofs, and hackathon participation credentials.
- It makes UGF central to the product instead of adding it as a hidden backend detail.
- It gives judges a clear demo: a wallet with no Base Sepolia ETH can still claim a badge.
- It can grow beyond the MVP into QR-based check-ins, organizer-issued certificates, contributor badges, and event reward claims.

Short pitch:

```text
Gasless ProofPass lets event organizers issue verifiable onchain certificates without forcing attendees to understand gas. A beginner can claim a badge on Base Sepolia with zero ETH, while UGF handles gas payment through Mock USD.
```

## User Roles

Organizer:

- Creates a credential campaign.
- Shares a claim code or QR code with real attendees.
- Sets claim limits for scarcity and abuse control.
- Copies a claim link like `/?badge=1&code=BUILDER-2026` and turns it into an event QR code.

Attendee:

- Connects wallet.
- Enters the event code.
- Checks Mock USD readiness.
- Claims the credential through UGF without Base Sepolia ETH.

Verifier:

- Enters an attendee wallet.
- Checks whether that wallet has claimed the selected credential.
- Uses the result for access, rewards, attendance proof, or completion validation.

## QR / Check-In Flow

The current app supports QR-style check-ins through claim links. The organizer copies a prefilled claim URL for a campaign and can convert it into a QR code for event display.

Example:

```text
http://127.0.0.1:5173/?badge=1&code=BUILDER-2026
```

When an attendee opens the link, ProofPass preselects the campaign and fills the event code. The attendee still signs the UGF flow with their own wallet, so the credential is claimed by the attendee, not by the organizer.

## Demo Flow

1. Connect a wallet on Base Sepolia.
2. Pick a badge.
3. Enter the event claim code from the organizer.
4. Check that the wallet has Mock USD from the UGF faucet.
5. Click `Claim Badge Gaslessly`.
6. UGF authenticates the wallet, quotes gas in Mock USD, settles the payment, executes the claim, and returns a Base Sepolia transaction hash.
7. The user receives the badge NFT without manually holding ETH for gas.

Important faucet detail:

The UGF faucet currently works by locking a tiny amount of Base Sepolia ETH and minting `TYI_MOCK_USD`. This means a tester may need Base Sepolia ETH once to prepare Mock USD. The ProofPass claim itself should then run through UGF using `TYI_MOCK_USD` instead of requiring destination-chain ETH for that claim.

Demo claim codes from the deploy script:

- Hackathon Builder Pass: `BUILDER-2026`
- Workshop Completion Badge: `WORKSHOP-2026`
- Community Contributor Badge: `COMMUNITY-2026`

## Stack

- React + Vite
- Solidity + Hardhat
- Ethers v6
- QRCode claim-link generation
- Base Sepolia
- UGF Testnet SDK
- `TYI_MOCK_USD` for gas settlement

## Resource Notes

UGF testnet SDK confirms this integration model:

- Testnet target is Base Sepolia.
- Settlement coin is `TYI_MOCK_USD`.
- The lifecycle is authenticate, quote, settle, execute, confirm.
- `quote.get()` defaults to Base Sepolia and `TYI_MOCK_USD`.
- `sponsorAndExecute()` should receive a transaction request without manual gas fields.

Primary resources:

- SDK: https://www.npmjs.com/package/@tychilabs/ugf-testnet-js
- GitHub: https://github.com/TychiWallet/ugf-testnet-js
- Testnet docs: https://universalgasframework.com/docs/testnet
- Faucet: https://universalgasframework.com/faucets

Faucet notes from manual inspection:

- Asset out: `TYI_MOCK_USD`
- Network: Base Sepolia
- Use case: x402 tests
- Token shown by faucet: `0x27DC...727e`
- The faucet asks MetaMask to sign gateway login.
- It switches to chain `84532`, reads balances, quotes `TYI_MOCK_USD` per Base Sepolia ETH, and mints test TYI after lock/authorization.

## Setup

Install dependencies:

```bash
npm install
```

Create an env file:

```bash
cp .env.example .env
```

Compile the contract:

```bash
npm run compile
```

Deploy to Base Sepolia:

```bash
npm run deploy:base-sepolia
```

The deploy script saves the address and campaign seed data to:

```text
deployments/base-sepolia.json
```

Then sync the deployed address into `.env`:

```bash
npm run sync:address
```

This fills:

```bash
VITE_PROOFPASS_CONTRACT_ADDRESS=0xYourDeployedContract
```

Run the app:

```bash
npm run dev
```

## Level 2 Checklist

Use this once the Level 1 UI is working.

1. Install MetaMask in the browser you will use for the demo.
2. Create a burner deployer wallet. Do not use a main wallet private key.
3. Fund the deployer with Base Sepolia ETH for contract deployment.
4. Create `.env` from `.env.example`.
5. Add `DEPLOYER_PRIVATE_KEY` to `.env`.
6. Run `npm run deploy:base-sepolia`.
7. Run `npm run sync:address`.
8. Restart `npm run dev`.
9. Use the UGF faucet to prepare `TYI_MOCK_USD` for the attendee wallet.
10. Open `/?badge=1&code=BUILDER-2026` and run one full claim.

The app shows a deployment banner near the top:

- Orange means the contract address is not configured yet.
- Green means `VITE_PROOFPASS_CONTRACT_ADDRESS` is a valid deployed-looking address and Level 2 reads/writes can be tested.

## Contract

The contract stores badge types and lets each wallet claim each badge once. Each badge can have a claim-code hash and max claim count, which makes the flow closer to a real event credential instead of a public free mint.

Fresh deployments seed self-contained NFT metadata. Each seeded badge stores a `data:application/json;base64,...` metadata URI with an embedded SVG credential image, so the demo does not depend on IPFS hosting tonight.

Main functions:

```solidity
createBadge(string name, string metadataUri, bytes32 claimCodeHash, uint256 maxClaims)
claimBadge(uint256 badgeId, string claimCode)
hasClaimed(address user, uint256 badgeId)
setBadgeRules(uint256 badgeId, bytes32 claimCodeHash, uint256 maxClaims)
```

## UGF Integration Point

The frontend builds the contract call data for:

```solidity
claimBadge(uint256 badgeId, string claimCode)
```

Then it passes that transaction object through the UGF lifecycle:

```text
Authenticate -> Quote -> Settle Mock USD -> Execute Claim -> Confirm
```

## Hackathon Pitch

Gasless ProofPass turns onchain credential claims into a normal event check-in interaction. Event organizers can issue verifiable attendance or completion credentials, attendees can claim them without Base Sepolia ETH, and verifiers can check credential ownership from the same app.

Compared with a normal badge/NFT minter, the important difference is the transaction outcome: a beginner completes a real contract interaction even when they do not hold the destination chain's gas token.

## Verified Demo

The current demo path has been tested end to end on Base Sepolia:

- Deployed contract: `0x707A6177BE3cb757B856Ed768480813ddf2189AE`
- Claimed credential: Hackathon Builder Pass, badge ID `1`
- Test wallet: `0xc59880D050DD8C2c6Df83ed152A9c098cE9F4038`
- Claim transaction: `0xcdb1b68fcba32590afedfa5f1a50bcc539467529ec91271d77068951b4459093`
- Observed result: UGF auth, quote, TYI Mock USD settlement, execution, and confirmation all completed; BaseScan shows an ERC-721 token transfer from the zero address to the attendee wallet.
- Contract read result: `hasClaimed(wallet, 1)` returned `true`.
- Duplicate claim behavior: a second Hackathon Builder Pass claim from the same wallet is blocked as already claimed.

## Current Weaknesses

This first version is intentionally focused, but these are the main gaps before a strong final demo:

- Users still need `TYI_MOCK_USD`. The faucet itself may require first getting Base Sepolia ETH, so the final pitch must be precise: ProofPass removes ETH from the credential claim flow, not necessarily from initial testnet token preparation.
- Eligibility is currently based on a shared event code or prefilled claim link. Stronger production versions should use rotating QR codes, per-user invite codes, or organizer signatures.
- The already deployed contract from the first test run still has placeholder metadata. Redeploy with the current script before the final claim demo to seed the new embedded metadata.
- There is no organizer dashboard yet; badges are seeded during deployment.
- The UGF flow compiles, but the final proof requires a real Base Sepolia deployment and successful end-to-end claim.

## Next Improvements

Priority order:

1. Deploy the contract to Base Sepolia and test one complete UGF claim.
2. Verify the UGF faucet flow and confirm Mock USD balance display.
3. Claim one badge from the QR-generated claim link on the current deployment.
4. Add camera scanning only if time remains.
5. Add a simple organizer page for creating badge campaigns if time remains.
