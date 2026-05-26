const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("GaslessProofPass", function () {
  let proofPass;
  let owner;
  let addr1;
  let addr2;
  const claimCode = "BUILDER-2026";
  const claimCodeHash = ethers.keccak256(ethers.toUtf8Bytes(claimCode));

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();
    const GaslessProofPass = await ethers.getContractFactory("GaslessProofPass");
    proofPass = await GaslessProofPass.deploy(owner.address);
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await proofPass.owner()).to.equal(owner.address);
    });
  });

  describe("Badge Creation", function () {
    it("Should allow owner to create badge", async function () {
      await proofPass.createBadge("Test Badge", "ipfs://test", claimCodeHash, 100);
      const nextId = await proofPass.nextBadgeId();
      expect(nextId).to.equal(2n);

      const badge = await proofPass.badges(1);
      expect(badge.name).to.equal("Test Badge");
      expect(badge.metadataUri).to.equal("ipfs://test");
      expect(badge.claimCodeHash).to.equal(claimCodeHash);
      expect(badge.maxClaims).to.equal(100n);
      expect(badge.active).to.equal(true);
    });

    it("Should revert if non-owner tries to create badge", async function () {
      try {
        await proofPass.connect(addr1).createBadge("Test Badge", "ipfs://test", claimCodeHash, 100);
        expect.fail("Transaction did not revert");
      } catch (error) {
        expect(error.message).to.contain("OwnableUnauthorizedAccount");
      }
    });
  });

  describe("Badge Claiming", function () {
    beforeEach(async function () {
      await proofPass.createBadge("Test Badge", "ipfs://test", claimCodeHash, 100);
    });

    it("Should allow claiming with correct claim code", async function () {
      await proofPass.connect(addr1).claimBadge(1, claimCode);
      expect(await proofPass.hasClaimed(addr1.address, 1)).to.equal(true);
      
      const badge = await proofPass.badges(1);
      expect(badge.claimCount).to.equal(1n);
    });

    it("Should fail to claim if already claimed", async function () {
      await proofPass.connect(addr1).claimBadge(1, claimCode);
      try {
        await proofPass.connect(addr1).claimBadge(1, claimCode);
        expect.fail("Transaction did not revert");
      } catch (error) {
        expect(error.message).to.contain("Already claimed");
      }
    });

    it("Should fail to claim with incorrect claim code", async function () {
      try {
        await proofPass.connect(addr1).claimBadge(1, "WRONG-CODE");
        expect.fail("Transaction did not revert");
      } catch (error) {
        expect(error.message).to.contain("Invalid claim code");
      }
    });

    it("Should fail to claim if capacity is reached", async function () {
      // Create a badge with capacity of 1
      await proofPass.createBadge("Limited Badge", "ipfs://limited", claimCodeHash, 1);
      
      await proofPass.connect(addr1).claimBadge(2, claimCode);
      try {
        await proofPass.connect(addr2).claimBadge(2, claimCode);
        expect.fail("Transaction did not revert");
      } catch (error) {
        expect(error.message).to.contain("Badge fully claimed");
      }
    });
  });
});
