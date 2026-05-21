// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract GaslessProofPass is ERC721, Ownable {
    struct Badge {
        string name;
        string metadataUri;
        bytes32 claimCodeHash;
        uint256 maxClaims;
        uint256 claimCount;
        bool active;
    }

    uint256 public nextTokenId = 1;
    uint256 public nextBadgeId = 1;

    mapping(uint256 => Badge) public badges;
    mapping(address => mapping(uint256 => bool)) public hasClaimed;
    mapping(uint256 => uint256) public tokenBadge;

    event BadgeCreated(uint256 indexed badgeId, string name, string metadataUri, uint256 maxClaims);
    event BadgeClaimed(address indexed recipient, uint256 indexed badgeId, uint256 indexed tokenId);

    constructor(address initialOwner) ERC721("Gasless ProofPass", "PROOF") Ownable(initialOwner) {}

    function createBadge(
        string calldata name,
        string calldata metadataUri,
        bytes32 claimCodeHash,
        uint256 maxClaims
    ) external onlyOwner returns (uint256 badgeId) {
        require(bytes(name).length != 0, "Name is required");
        require(bytes(metadataUri).length != 0, "Metadata URI is required");

        badgeId = nextBadgeId++;
        badges[badgeId] = Badge({
            name: name,
            metadataUri: metadataUri,
            claimCodeHash: claimCodeHash,
            maxClaims: maxClaims,
            claimCount: 0,
            active: true
        });

        emit BadgeCreated(badgeId, name, metadataUri, maxClaims);
    }

    function setBadgeActive(uint256 badgeId, bool active) external onlyOwner {
        require(bytes(badges[badgeId].name).length != 0, "Badge does not exist");
        badges[badgeId].active = active;
    }

    function setBadgeRules(uint256 badgeId, bytes32 claimCodeHash, uint256 maxClaims) external onlyOwner {
        require(bytes(badges[badgeId].name).length != 0, "Badge does not exist");
        require(maxClaims == 0 || maxClaims >= badges[badgeId].claimCount, "Max below existing claims");

        badges[badgeId].claimCodeHash = claimCodeHash;
        badges[badgeId].maxClaims = maxClaims;
    }

    function claimBadge(uint256 badgeId, string calldata claimCode) external returns (uint256 tokenId) {
        Badge storage badge = badges[badgeId];
        require(badge.active, "Badge is not active");
        require(!hasClaimed[msg.sender][badgeId], "Already claimed");
        require(badge.maxClaims == 0 || badge.claimCount < badge.maxClaims, "Badge fully claimed");

        if (badge.claimCodeHash != bytes32(0)) {
            require(keccak256(bytes(claimCode)) == badge.claimCodeHash, "Invalid claim code");
        }

        hasClaimed[msg.sender][badgeId] = true;
        badge.claimCount += 1;
        tokenId = nextTokenId++;
        tokenBadge[tokenId] = badgeId;

        _safeMint(msg.sender, tokenId);
        emit BadgeClaimed(msg.sender, badgeId, tokenId);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return badges[tokenBadge[tokenId]].metadataUri;
    }
}
