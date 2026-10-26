// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

// Contract imports
import {ERC721} from "@solidstate/contracts/token/ERC721/ERC721.sol";
import {ERC721BaseStorage} from "@solidstate/contracts/token/ERC721/base/ERC721BaseStorage.sol";

import {DFVerifierFacet} from "./DFVerifierFacet.sol";
import {DFWhitelistFacet} from "./DFWhitelistFacet.sol";

// Library Imports
import {LibDiamond} from "../vendor/libraries/LibDiamond.sol";
import {LibGameUtils} from "../libraries/LibGameUtils.sol";
import {LibArtifactUtils} from "../libraries/LibArtifactUtils.sol";
import {LibArtifactExtendUtils} from "../libraries/LibArtifactExtendUtils.sol";

import {LibPlanet} from "../libraries/LibPlanet.sol";

// Storage imports
import {WithStorage} from "../libraries/LibStorage.sol";

// Type imports
import {Artifact, ArtifactType, Biome, ArtifactRarity, DFTCreateArtifactArgs, DFPFindArtifactArgs, Planet} from "../DFTypes.sol";

contract DFArtifactFacet is WithStorage, ERC721 {
    using ERC721BaseStorage for ERC721BaseStorage.Layout;

    event ArtifactFound(address player, uint256 artifactId, uint256 loc);

    modifier onlyWhitelisted() {
        require(
            DFWhitelistFacet(address(this)).isWhitelisted(msg.sender) ||
                msg.sender == LibDiamond.contractOwner(),
            "Player is not whitelisted"
        );
        _;
    }

    modifier notPaused() {
        require(!gs().paused, "Game is paused");
        _;
    }

    modifier notTokenEnded() {
        require(
            block.timestamp < gameConstants().TOKEN_MINT_END_TIMESTAMP,
            "Token mint period has ended"
        );
        _;
    }

    modifier onlyAdminOrCore() {
        require(
            msg.sender == gs().diamondAddress || msg.sender == LibDiamond.contractOwner(),
            "Only the Core or Admin addresses can fiddle with artifacts."
        );
        _;
    }

    modifier onlyAdmin() {
        require(
            msg.sender == LibDiamond.contractOwner(),
            "Only Admin address can perform this action."
        );
        _;
    }

    modifier disabled() {
        require(false, "This functionality is disabled for the current round.");
        _;
    }

    function createArtifact(DFTCreateArtifactArgs memory args)
        public
        onlyAdminOrCore
        returns (Artifact memory)
    {
        require(args.tokenId >= 1, "artifact id must be positive");

        _mint(args.owner, args.tokenId);

        Artifact memory newArtifact = Artifact(
            true,
            args.tokenId,
            args.planetId,
            args.rarity,
            args.biome,
            block.timestamp,
            args.discoverer,
            args.artifactType,
            0,
            0,
            0,
            0,
            args.controller,
            0
        );

        gs().artifacts[args.tokenId] = newArtifact;

        return newArtifact;
    }

    function createArtifactToSell(DFTCreateArtifactArgs memory args)
        private
        returns (Artifact memory)
    {
        require(args.tokenId >= 1, "artifact id must be positive");

        _mint(args.owner, args.tokenId);

        Artifact memory newArtifact = Artifact(
            true,
            args.tokenId,
            args.planetId,
            args.rarity,
            args.biome,
            block.timestamp,
            args.discoverer,
            args.artifactType,
            0,
            0,
            0,
            0,
            args.controller,
            0
        );

        gs().artifacts[args.tokenId] = newArtifact;

        return newArtifact;
    }

    function getArtifact(uint256 tokenId) public view returns (Artifact memory) {
        return gs().artifacts[tokenId];
    }

    function getArtifactAtIndex(uint256 idx) public view returns (Artifact memory) {
        return gs().artifacts[tokenByIndex(idx)];
    }

    function getPlayerArtifactIds(address playerId) public view returns (uint256[] memory) {
        uint256 balance = balanceOf(playerId);
        uint256[] memory results = new uint256[](balance);

        for (uint256 idx = 0; idx < balance; idx++) {
            results[idx] = tokenOfOwnerByIndex(playerId, idx);
        }

        return results;
    }

    function transferArtifact(uint256 tokenId, address newOwner) public onlyAdminOrCore {
        if (newOwner == address(0)) {
            _burn(tokenId);
        } else {
            _transfer(ownerOf(tokenId), newOwner, tokenId);
        }
    }

    function transferArtifactToSell(uint256 tokenId, address newOwner) private {
        if (newOwner == address(0)) {
            _burn(tokenId);
        } else {
            _transfer(ownerOf(tokenId), newOwner, tokenId);
        }
    }

    function updateArtifact(Artifact memory updatedArtifact) public onlyAdminOrCore {
        require(
            ERC721BaseStorage.layout().exists(updatedArtifact.id),
            "you cannot update an artifact that doesn't exist"
        );

        gs().artifacts[updatedArtifact.id] = updatedArtifact;
    }

    function doesArtifactExist(uint256 tokenId) public view returns (bool) {
        return ERC721BaseStorage.layout().exists(tokenId);
    }

    function adminGiveArtifact(DFTCreateArtifactArgs memory args) public onlyAdmin {
        Artifact memory artifact = createArtifact(args);
        transferArtifact(artifact.id, address(this));
        LibGameUtils._putArtifactOnPlanet(artifact.id, args.planetId);

        emit ArtifactFound(args.owner, artifact.id, args.planetId);
    }

    // activates the given artifact on the given planet. the artifact must have
    // been previously deposited on this planet. the artifact cannot be activated
    // within a certain cooldown period, depending on the artifact type
    function activateArtifact(
        uint256 locationId,
        uint256 artifactId,
        uint256 linkTo
    ) public notPaused {
        LibPlanet.refreshPlanet(locationId);

        if (linkTo != 0) {
            LibPlanet.refreshPlanet(linkTo);
        }

        LibArtifactUtils.activateArtifact(locationId, artifactId, linkTo);
        // event is emitted in the above library function
    }

    function buyArtifact(DFTCreateArtifactArgs memory args) public payable notPaused disabled {
        // NOTE: only use args.planetId
        uint256 _location = args.planetId;
        require(gs().planets[_location].isInitialized == true, "Planet is not initialized");
        LibPlanet.refreshPlanet(_location);

        require(
            gs().planets[_location].owner == msg.sender,
            "Only owner account can perform that operation on planet."
        );

        require(
            block.timestamp - gs().lastBuyArtifactTimestamp[msg.sender] >
                gameConstants().BUY_ARTIFACT_COOLDOWN,
            "wait for cooldown before buying artifact again"
        );
        gs().lastBuyArtifactTimestamp[msg.sender] = block.timestamp;

        uint256 cost = 0.001 ether;
        if (gs().halfPrice) cost /= 2;
        require(msg.value == cost, "Wrong value sent");

        uint256 id = uint256(
            keccak256(abi.encodePacked(args.planetId, blockhash(block.number), gs().miscNonce++))
        );

        args.tokenId = id;
        args.discoverer = msg.sender;
        //planetId;
        //biome;
        args.owner = gs().diamondAddress;
        args.controller = address(0);
        args.imageType = 0;

        (Biome biome, ArtifactType artifactType, ArtifactRarity rarity) = LibArtifactUtils
            ._randomBuyArtifactTypeAndRarity(id);
        args.biome = biome;
        args.artifactType = artifactType;
        args.rarity = rarity;

        Artifact memory artifact = createArtifactToSell(args);
        transferArtifactToSell(artifact.id, address(this));
        LibGameUtils._putArtifactOnPlanet(artifact.id, args.planetId);

        emit ArtifactFound(args.owner, artifact.id, args.planetId);
        gs().players[msg.sender].buyArtifactAmount++;
    }

    function tokenURI(uint256 tokenId) public view virtual override returns (string memory) {
        require(
            ERC721BaseStorage.layout().exists(tokenId),
            "ERC721Metadata: URI query for nonexistent token"
        );

        Artifact memory artifact = getArtifact(tokenId);

        // ArtifactType
        // ArtifactRarity
        // planetBiome
        // mintedAtTimestamp
        // lastActivated
        // lastDeactivated

        string[17] memory parts;

        parts[
            0
        ] = '<svg xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMinYMin meet" viewBox="0 0 350 350"><style>.base { fill: white; font-family: serif; font-size: 14px; }</style><rect width="100%" height="100%" fill="black" /><text x="10" y="20" class="base">';

        parts[1] = LibArtifactExtendUtils.getArtifactTypeNames(artifact.artifactType);

        parts[2] = '</text><text x="10" y="40" class="base">';

        parts[3] = LibArtifactExtendUtils.getArtifactRarityNames(artifact.rarity);

        parts[4] = '</text><text x="10" y="60" class="base">';

        parts[5] = LibArtifactExtendUtils.getBiomeNames(artifact.planetBiome);

        parts[6] = '</text><text x="10" y="80" class="base">';

        parts[7] = string(
            abi.encodePacked(
                "mintedAt ",
                LibArtifactExtendUtils.toString(artifact.mintedAtTimestamp)
            )
        );

        parts[8] = '</text><text x="10" y="100" class="base">';

        parts[9] = artifact.lastActivated != 0
            ? string(
                abi.encodePacked(
                    "lastActivated ",
                    LibArtifactExtendUtils.toString(artifact.lastActivated)
                )
            )
            : "";

        parts[10] = '</text><text x="10" y="120" class="base">';

        parts[11] = artifact.lastDeactivated != 0
            ? string(
                abi.encodePacked(
                    "lastDeactivated ",
                    LibArtifactExtendUtils.toString(artifact.lastDeactivated)
                )
            )
            : "";

        parts[12] = '</text><text x="10" y="140" class="base">';

        parts[13] = "";

        parts[14] = '</text><text x="10" y="160" class="base">';

        parts[15] = "";

        parts[16] = "</text></svg>";

        string memory output = string(
            abi.encodePacked(
                parts[0],
                parts[1],
                parts[2],
                parts[3],
                parts[4],
                parts[5],
                parts[6],
                parts[7],
                parts[8]
            )
        );
        output = string(
            abi.encodePacked(
                output,
                parts[9],
                parts[10],
                parts[11],
                parts[12],
                parts[13],
                parts[14],
                parts[15],
                parts[16]
            )
        );

        string memory json = LibArtifactExtendUtils.encode(
            bytes(
                string(
                    abi.encodePacked(
                        '{"name": "Artifact #',
                        LibArtifactExtendUtils.toHexString(tokenId),
                        '", "description": "The artifacts are gifts from Dark Forest Punk universe.", "image": "data:image/svg+xml;base64,',
                        LibArtifactExtendUtils.encode(bytes(output)),
                        '"}'
                    )
                )
            )
        );
        output = string(abi.encodePacked("data:application/json;base64,", json));

        return output;
    }
}
