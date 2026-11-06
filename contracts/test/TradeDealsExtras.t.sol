// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

import {BaseTest} from "./utils/BaseTest.sol";
import {ITradeDeals} from "../src/interfaces/ITradeDeals.sol";

/// @notice Read helpers and inherited ERC-721 / AccessControl paths that must not bypass the deal rules.
contract TradeDealsExtrasTest is BaseTest {
    function test_deadlines_followTheDeal() public {
        uint256 id = _create(100 * USDT);
        uint256 due = deals.getDeal(id).dueDate;

        (uint256 verifyDeadline, uint256 listingDeadline, uint256 dueDate, uint256 graceEnd) = deals.deadlines(id);
        assertEq(verifyDeadline, 0, "no claim yet");
        assertEq(listingDeadline, 0, "not verified yet");
        assertEq(dueDate, due);
        assertEq(graceEnd, due + GRACE);

        _approve(id);
        _claim(id, 10_000, LOADED, DOC_A);
        uint256 claimTime = deals.getDeal(id).claimTime;
        (verifyDeadline, listingDeadline,,) = deals.deadlines(id);
        assertEq(verifyDeadline, claimTime + VERIFY_WINDOW);
        assertEq(listingDeadline, 0, "still not verified");

        _check(id, 9_850, DEPARTED, DOC_A);
        (, listingDeadline,,) = deals.deadlines(id);
        assertEq(listingDeadline, deals.getDeal(id).verifiedAt + LISTING_WINDOW);
    }

    function test_deadlines_unknownDealIsAllZero() public view {
        (uint256 a, uint256 b, uint256 c, uint256 d) = deals.deadlines(999);
        assertEq(a + b + c + d, 0);
    }

    function test_safeTransferFrom_isRestrictedToo() public {
        uint256 id = _funded(100 * USDT);
        vm.startPrank(priya);
        vm.expectRevert(abi.encodeWithSelector(ITradeDeals.TransferRestricted.selector, outsider));
        deals.safeTransferFrom(priya, outsider, id);
        vm.expectRevert(abi.encodeWithSelector(ITradeDeals.TransferRestricted.selector, outsider));
        deals.safeTransferFrom(priya, outsider, id, "");
        deals.safeTransferFrom(priya, kiran, id, "");
        vm.stopPrank();
        assertEq(deals.ownerOf(id), kiran);
    }

    function test_approvedOperator_cannotBypassKyc() public {
        uint256 id = _funded(100 * USDT);
        vm.prank(priya);
        deals.setApprovalForAll(outsider, true);
        assertTrue(deals.isApprovedForAll(priya, outsider));

        vm.startPrank(outsider);
        vm.expectRevert(abi.encodeWithSelector(ITradeDeals.TransferRestricted.selector, outsider));
        deals.transferFrom(priya, outsider, id);
        deals.transferFrom(priya, kiran, id);
        vm.stopPrank();
        assertEq(deals.ownerOf(id), kiran);
    }

    function test_tokenURI_isEmpty_noOnchainMetadata() public {
        uint256 id = _funded(100 * USDT);
        assertEq(deals.tokenURI(id), "");
    }

    function test_admin_canAddAndRemoveKycOperator() public {
        address operator = makeAddr("kycOperator");
        address newInvestor = makeAddr("newInvestor");
        bytes32 kycRole = deals.KYC_ROLE();

        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, outsider, deals.DEFAULT_ADMIN_ROLE()
            )
        );
        vm.prank(outsider);
        deals.grantRole(kycRole, operator);

        vm.prank(admin);
        deals.grantRole(kycRole, operator);
        vm.prank(operator);
        deals.setKyc(newInvestor, ITradeDeals.Role.Investor);
        assertEq(uint8(deals.kycRole(newInvestor)), uint8(ITradeDeals.Role.Investor));

        vm.prank(admin);
        deals.revokeRole(kycRole, operator);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, operator, kycRole)
        );
        vm.prank(operator);
        deals.setKyc(makeAddr("another"), ITradeDeals.Role.Investor);
    }

    function test_eip712Domain_matchesSharedDefinition() public view {
        (, string memory name, string memory version, uint256 chainId, address verifyingContract,,) =
            deals.eip712Domain();
        assertEq(name, "TrustMeBro");
        assertEq(version, "1");
        assertEq(chainId, WHITECHAIN_SEPOLIA);
        assertEq(verifyingContract, address(deals));
    }

    function test_boundRole_isRememberedAfterRevoke() public {
        vm.prank(admin);
        deals.revokeKyc(kiran);
        assertEq(uint8(deals.kycRole(kiran)), uint8(ITradeDeals.Role.None));
        assertEq(uint8(deals.boundRole(kiran)), uint8(ITradeDeals.Role.Investor));
    }
}
