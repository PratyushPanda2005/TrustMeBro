// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {BaseTest} from "./utils/BaseTest.sol";
import {ITradeDeals} from "../src/interfaces/ITradeDeals.sol";
import {TradeDeals} from "../src/TradeDeals.sol";
import {TrustRegistry} from "../src/TrustRegistry.sol";

/// @notice Checks a signature made in TypeScript (viem) verifies in Solidity.
///         Generate the fixture with: cd packages/shared && npm install && npm run fixture
contract Eip712RoundTripTest is BaseTest {
    string internal constant FIXTURE = "./test/fixtures/eip712.json";

    function test_viemSignature_verifiesOnchain() public {
        if (!vm.exists(FIXTURE)) {
            vm.skip(true);
            return;
        }
        string memory json = vm.readFile(FIXTURE);
        address signer = vm.parseJsonAddress(json, ".signer");
        address verifyingContract = vm.parseJsonAddress(json, ".domain.verifyingContract");
        uint256 chainId = vm.parseUint(vm.parseJsonString(json, ".domain.chainId"));
        bytes32 digest = vm.parseJsonBytes32(json, ".digest");
        bytes memory signature = vm.parseJsonBytes(json, ".signature");
        ITradeDeals.Verification memory v = ITradeDeals.Verification({
            dealId: vm.parseJsonBytes32(json, ".message.dealId"),
            observedKg: uint32(vm.parseUint(vm.parseJsonString(json, ".message.observedKg"))),
            statusCode: uint8(vm.parseUint(vm.parseJsonString(json, ".message.statusCode"))),
            docHash: vm.parseJsonBytes32(json, ".message.docHash"),
            observedAt: uint64(vm.parseUint(vm.parseJsonString(json, ".message.observedAt"))),
            nonce: vm.parseUint(vm.parseJsonString(json, ".message.nonce")),
            expiry: vm.parseUint(vm.parseJsonString(json, ".message.expiry"))
        });
        assertEq(chainId, WHITECHAIN_SEPOLIA, "fixture must sign for Whitechain 1874");

        assertEq(_digest(v, verifyingContract, chainId), digest, "solidity digest == viem digest");
        assertEq(ECDSA.recover(digest, signature), signer, "recover viem signature");

        // Deploy the real contract at the fixture's address and run the signature end to end.
        TrustRegistry reg = new TrustRegistry(verifyingContract);
        deployCodeTo(
            "TradeDeals.sol:TradeDeals",
            abi.encode(admin, IERC20(address(usdt)), reg, signer, _recipients()),
            verifyingContract
        );
        TradeDeals td = TradeDeals(verifyingContract);
        assertEq(td.hashVerification(v), digest, "TradeDeals digest == viem digest");

        vm.startPrank(admin);
        td.setKyc(ravi, ITradeDeals.Role.Exporter);
        td.setKyc(ahmed, ITradeDeals.Role.Importer);
        vm.stopPrank();

        vm.warp(v.observedAt - 100);
        vm.prank(ravi);
        uint256 id = td.createDeal(
            100 * USDT, uint64(vm.getBlockTimestamp() + TENOR), ahmed, keccak256("fixture invoice"), TERMS, _durations()
        );
        assertEq(bytes32(id), v.dealId, "fixture is for deal #1");
        vm.prank(ahmed);
        td.approveDeal(id, TERMS);
        vm.prank(ravi);
        td.declareClaims(id, 10_000, LOADED, v.docHash, "MSKU1234567", "BL-001");

        vm.warp(v.observedAt);
        assertEq(uint8(td.submitVerification(v, signature)), uint8(ITradeDeals.Outcome.Verified));
    }
}
