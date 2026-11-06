// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {BaseTest} from "./utils/BaseTest.sol";
import {ITradeDeals} from "../src/interfaces/ITradeDeals.sol";
import {TradeDeals} from "../src/TradeDeals.sol";
import {TrustRegistry} from "../src/TrustRegistry.sol";

/// @notice KYC, create, approve, claims, cancel.
contract TradeDealsOriginationTest is BaseTest {
    function test_deploy_wiring() public view {
        assertEq(address(deals.usdt()), address(usdt));
        assertEq(address(deals.registry()), address(registry));
        assertEq(registry.deals(), address(deals));
        assertEq(deals.verifier(), verifier);
        assertEq(deals.minInvoice(), 10 * USDT);
        assertEq(deals.minFee(), 2 * USDT);
        assertEq(deals.agentFee(), 1 * USDT);
        assertEq(deals.gasFee(), USDT / 2);
        assertEq(deals.creditBase(), 200 * USDT);
        assertTrue(deals.hasRole(deals.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(deals.hasRole(deals.KYC_ROLE(), admin));
        assertEq(deals.name(), "TrustMeBro Receivable");
        assertEq(deals.symbol(), "TMBR");
    }

    function test_deploy_rejectsUnboundRegistry() public {
        TrustRegistry wrong = new TrustRegistry(makeAddr("somewhere else"));
        vm.expectRevert(ITradeDeals.RegistryNotBound.selector);
        new TradeDeals(admin, IERC20(address(usdt)), wrong, verifier, _recipients());
    }

    function test_domainSeparator_isWhitechain1874() public view {
        bytes32 expected = keccak256(
            abi.encode(DOMAIN_TYPEHASH, keccak256("TrustMeBro"), keccak256("1"), uint256(1874), address(deals))
        );
        assertEq(deals.DOMAIN_SEPARATOR(), expected);
        assertEq(deals.VERIFICATION_TYPEHASH(), VERIFICATION_TYPEHASH);
    }

    function test_kyc_onboardsScores() public view {
        assertEq(uint8(deals.kycRole(ravi)), uint8(ITradeDeals.Role.Exporter));
        assertEq(uint8(deals.kycRole(ahmed)), uint8(ITradeDeals.Role.Importer));
        assertEq(uint8(deals.kycRole(priya)), uint8(ITradeDeals.Role.Investor));
        assertEq(registry.trust(ravi), 5_000, "exporter starts at 50%");
        assertEq(registry.trust(ahmed), 6_667, "importer starts at 66.67%");
        assertEq(registry.riskBps(ahmed), 400, "importer risk 4%");
        assertFalse(registry.isOnboarded(priya), "investors carry no score");
    }

    function test_kyc_onlyKycRole() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, outsider, deals.KYC_ROLE()
            )
        );
        vm.prank(outsider);
        deals.setKyc(outsider, ITradeDeals.Role.Investor);
    }

    function test_kyc_oneAddressOneRole() public {
        vm.startPrank(admin);
        vm.expectRevert(abi.encodeWithSelector(ITradeDeals.AlreadyKyced.selector, ravi));
        deals.setKyc(ravi, ITradeDeals.Role.Investor);

        deals.revokeKyc(ravi);
        vm.expectRevert(
            abi.encodeWithSelector(ITradeDeals.RoleLocked.selector, ravi, ITradeDeals.Role.Exporter)
        );
        deals.setKyc(ravi, ITradeDeals.Role.Investor);
        vm.stopPrank();
    }

    function test_kyc_revokeAndRestore_keepsScore() public {
        uint256 id = _create(100 * USDT);
        _approve(id);
        _claim(id, 10_000, LOADED, DOC_A);
        _check(id, 8_020, LOADED, DOC_A);
        assertEq(registry.trust(ravi), 2_632);

        vm.startPrank(admin);
        deals.revokeKyc(ravi);
        assertEq(uint8(deals.kycRole(ravi)), uint8(ITradeDeals.Role.None));
        deals.setKyc(ravi, ITradeDeals.Role.Exporter);
        vm.stopPrank();
        assertEq(registry.trust(ravi), 2_632, "score survives re-KYC");
    }

    function test_kyc_customImporterTrust() public {
        address bigBuyer = makeAddr("bigBuyer");
        vm.prank(admin);
        deals.setKycImporter(bigBuyer, 8_000);
        assertEq(registry.trust(bigBuyer), 8_000);
        assertEq(registry.riskBps(bigBuyer), 320); // 2% + 6% x 20%
    }

    function test_kyc_customImporterTrust_bounds() public {
        vm.startPrank(admin);
        vm.expectRevert(abi.encodeWithSelector(ITradeDeals.InvalidTrust.selector, 0));
        deals.setKycImporter(makeAddr("a"), 0);
        vm.expectRevert(abi.encodeWithSelector(ITradeDeals.InvalidTrust.selector, 10_000));
        deals.setKycImporter(makeAddr("b"), 10_000);
        vm.stopPrank();
    }

    function test_kyc_rejectsNoneAndZero() public {
        vm.startPrank(admin);
        vm.expectRevert(ITradeDeals.InvalidRole.selector);
        deals.setKyc(outsider, ITradeDeals.Role.None);
        vm.expectRevert(ITradeDeals.ZeroAddress.selector);
        deals.setKyc(address(0), ITradeDeals.Role.Investor);
        vm.expectRevert(abi.encodeWithSelector(ITradeDeals.NoKyc.selector, outsider));
        deals.revokeKyc(outsider);
        vm.stopPrank();
    }

    function test_create_storesDeal() public {
        bytes32 inv = keccak256("INV-2026-001");
        uint64 due = uint64(block.timestamp + TENOR);

        vm.expectEmit(address(deals));
        emit ITradeDeals.DealCreated(1, ravi, ahmed, 100 * USDT, due, inv, TERMS);
        vm.prank(ravi);
        uint256 id = deals.createDeal(100 * USDT, due, ahmed, inv, TERMS, _durations());

        assertEq(id, 1);
        assertEq(deals.dealCount(), 1);
        ITradeDeals.Deal memory d = deals.getDeal(id);
        assertEq(d.exporter, ravi);
        assertEq(d.importer, ahmed);
        assertEq(d.amount, 100 * USDT);
        assertEq(d.dueDate, due);
        assertEq(d.invoiceHash, inv);
        assertEq(d.termsHash, TERMS);
        assertEq(d.verifyWindow, VERIFY_WINDOW);
        assertEq(d.listingWindow, LISTING_WINDOW);
        assertEq(d.graceWindow, GRACE);
        _assertState(id, ITradeDeals.State.Created);
        assertEq(deals.invoiceDeal(inv), id);
        assertEq(deals.openExposure(ravi), 100 * USDT);
        assertEq(deals.availableCredit(ravi), 100 * USDT);
    }

    function test_create_sameInvoiceTwice_reverts() public {
        bytes32 inv = keccak256("INV-2026-001");
        uint256 id = _createWith(ravi, ahmed, 50 * USDT, inv);
        vm.expectRevert(abi.encodeWithSelector(ITradeDeals.InvoiceInUse.selector, inv, id));
        _createWith(ravi, ahmed, 50 * USDT, inv);
    }

    function test_create_requiresKycExporterAndImporter() public {
        vm.expectRevert(abi.encodeWithSelector(ITradeDeals.NotKyced.selector, outsider, ITradeDeals.Role.Exporter));
        _createWith(outsider, ahmed, 100 * USDT, _nextInvoice());

        vm.expectRevert(abi.encodeWithSelector(ITradeDeals.NotKyced.selector, priya, ITradeDeals.Role.Importer));
        _createWith(ravi, priya, 100 * USDT, _nextInvoice());
    }

    function test_create_creditLimit_newExporter200() public {
        vm.expectRevert(
            abi.encodeWithSelector(ITradeDeals.CreditLimitExceeded.selector, 201 * USDT, 200 * USDT)
        );
        _create(201 * USDT);

        // The limit covers all open deals together.
        _create(100 * USDT);
        _create(100 * USDT);
        vm.expectRevert(
            abi.encodeWithSelector(ITradeDeals.CreditLimitExceeded.selector, 210 * USDT, 200 * USDT)
        );
        _create(10 * USDT);
    }

    function test_create_creditLimit_growsWithSettledVolume() public {
        _honestCycle(100 * USDT);
        assertEq(deals.settledVolume(ravi), 100 * USDT);
        assertEq(deals.creditLimit(ravi), 400 * USDT, "200 + 2 x 100");
        _create(400 * USDT);
    }

    function test_create_closedDealsReleaseCredit() public {
        uint256 id = _create(200 * USDT);
        vm.prank(ravi);
        deals.cancel(id);
        assertEq(deals.openExposure(ravi), 0);
        _create(200 * USDT);
    }

    function test_create_blockedBelow40pct() public {
        uint256 id = _create(100 * USDT);
        _approve(id);
        _claim(id, 10_000, LOADED, DOC_A);
        _check(id, 8_020, LOADED, DOC_A);

        vm.expectRevert(abi.encodeWithSelector(ITradeDeals.ScoreTooLow.selector, 2_632));
        _create(100 * USDT);
    }

    function test_create_validation() public {
        vm.startPrank(ravi);
        uint64 due = uint64(block.timestamp + TENOR);

        vm.expectRevert(ITradeDeals.InvalidAmount.selector);
        deals.createDeal(9 * USDT, due, ahmed, _nextInvoice(), TERMS, _durations());

        vm.expectRevert(ITradeDeals.ZeroHash.selector);
        deals.createDeal(100 * USDT, due, ahmed, bytes32(0), TERMS, _durations());

        vm.expectRevert(ITradeDeals.ZeroHash.selector);
        deals.createDeal(100 * USDT, due, ahmed, _nextInvoice(), bytes32(0), _durations());

        vm.expectRevert(ITradeDeals.InvalidDueDate.selector);
        deals.createDeal(100 * USDT, uint64(block.timestamp), ahmed, _nextInvoice(), TERMS, _durations());

        vm.expectRevert(ITradeDeals.InvalidDueDate.selector);
        deals.createDeal(100 * USDT, uint64(block.timestamp + 731 days), ahmed, _nextInvoice(), TERMS, _durations());

        ITradeDeals.Durations memory bad = _durations();
        bad.verifyWindow = 59;
        vm.expectRevert(ITradeDeals.InvalidDuration.selector);
        deals.createDeal(100 * USDT, due, ahmed, _nextInvoice(), TERMS, bad);

        bad = _durations();
        bad.graceWindow = 0;
        vm.expectRevert(ITradeDeals.InvalidDuration.selector);
        deals.createDeal(100 * USDT, due, ahmed, _nextInvoice(), TERMS, bad);
        vm.stopPrank();
    }

    function test_approve() public {
        uint256 id = _create(100 * USDT);
        vm.expectEmit(address(deals));
        emit ITradeDeals.Approved(id, ahmed, TERMS);
        _approve(id);
        _assertState(id, ITradeDeals.State.Approved);
    }

    function test_approve_onlyImporter_exactTerms() public {
        uint256 id = _create(100 * USDT);
        vm.expectRevert(abi.encodeWithSelector(ITradeDeals.NotParty.selector, ravi));
        vm.prank(ravi);
        deals.approveDeal(id, TERMS);

        vm.expectRevert(ITradeDeals.TermsMismatch.selector);
        vm.prank(ahmed);
        deals.approveDeal(id, keccak256("other terms"));

        _approve(id);
        vm.expectRevert(abi.encodeWithSelector(ITradeDeals.WrongState.selector, id, ITradeDeals.State.Approved));
        vm.prank(ahmed);
        deals.approveDeal(id, TERMS);
    }

    function test_unknownDeal_reverts() public {
        vm.expectRevert(abi.encodeWithSelector(ITradeDeals.UnknownDeal.selector, 99));
        deals.approveDeal(99, TERMS);
    }

    function test_claims_stored() public {
        uint256 id = _create(100 * USDT);
        _approve(id);

        uint64 deadline = uint64(block.timestamp + VERIFY_WINDOW);
        vm.expectEmit(address(deals));
        emit ITradeDeals.Claimed(id, ravi, 10_000, LOADED, DOC_A, "MSKU1234567", "BL-001", deadline);
        _claim(id, 10_000, LOADED, DOC_A);

        ITradeDeals.Deal memory d = deals.getDeal(id);
        assertEq(d.declaredKg, 10_000);
        assertEq(d.claimedStatus, LOADED);
        assertEq(d.docHash, DOC_A);
        assertEq(d.claimTime, block.timestamp);
        assertEq(d.verifyDeadline, deadline);
        _assertState(id, ITradeDeals.State.Claimed);

        ITradeDeals.Shipment memory s = deals.getShipment(id);
        assertEq(s.containerNo, "MSKU1234567");
        assertEq(s.blRef, "BL-001");
    }

    function test_claims_requireApprovalFirst() public {
        uint256 id = _create(100 * USDT);
        vm.expectRevert(abi.encodeWithSelector(ITradeDeals.WrongState.selector, id, ITradeDeals.State.Created));
        _claim(id, 10_000, LOADED, DOC_A);
    }

    function test_claims_validation() public {
        uint256 id = _create(100 * USDT);
        _approve(id);
        vm.startPrank(ravi);

        vm.expectRevert(ITradeDeals.InvalidClaim.selector);
        deals.declareClaims(id, 10_000, GATED_IN, DOC_A, "MSKU1234567", ""); // must be at least LOADED

        vm.expectRevert(ITradeDeals.InvalidClaim.selector);
        deals.declareClaims(id, 10_000, 6, DOC_A, "MSKU1234567", "");

        vm.expectRevert(ITradeDeals.InvalidClaim.selector);
        deals.declareClaims(id, 0, LOADED, DOC_A, "MSKU1234567", "");

        vm.expectRevert(ITradeDeals.ZeroHash.selector);
        deals.declareClaims(id, 10_000, LOADED, bytes32(0), "MSKU1234567", "");

        vm.expectRevert(ITradeDeals.InvalidShipmentRef.selector);
        deals.declareClaims(id, 10_000, LOADED, DOC_A, "", "");

        vm.expectRevert(ITradeDeals.InvalidShipmentRef.selector);
        deals.declareClaims(id, 10_000, LOADED, DOC_A, "MSKU1234567-THIS-IS-WAY-TOO-LONG-REF", "");
        vm.stopPrank();

        vm.expectRevert(abi.encodeWithSelector(ITradeDeals.NotParty.selector, ahmed));
        vm.prank(ahmed);
        deals.declareClaims(id, 10_000, LOADED, DOC_A, "MSKU1234567", "");
    }

    function test_claims_afterDueDate_revert() public {
        uint256 id = _create(100 * USDT);
        _approve(id);
        vm.warp(block.timestamp + TENOR);
        vm.expectRevert(ITradeDeals.PastDueDate.selector);
        _claim(id, 10_000, LOADED, DOC_A);
    }

    function test_cancel_importerDeclines() public {
        bytes32 inv = _nextInvoice();
        uint256 id = _createWith(ravi, ahmed, 100 * USDT, inv);
        vm.prank(ahmed);
        deals.cancel(id);
        _assertState(id, ITradeDeals.State.Cancelled);
        assertEq(deals.invoiceDeal(inv), 0, "invoice freed");
        _createWith(ravi, ahmed, 100 * USDT, inv);
    }

    function test_cancel_rules() public {
        uint256 id = _create(100 * USDT);
        vm.expectRevert(abi.encodeWithSelector(ITradeDeals.NotParty.selector, outsider));
        vm.prank(outsider);
        deals.cancel(id);

        _approve(id);
        vm.expectRevert(abi.encodeWithSelector(ITradeDeals.NotParty.selector, ahmed));
        vm.prank(ahmed);
        deals.cancel(id);

        _claim(id, 10_000, LOADED, DOC_A);
        vm.expectRevert(abi.encodeWithSelector(ITradeDeals.WrongState.selector, id, ITradeDeals.State.Claimed));
        vm.prank(ravi);
        deals.cancel(id);
    }
}
