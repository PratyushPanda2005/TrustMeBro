// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {BaseTest} from "./utils/BaseTest.sol";
import {ITradeDeals} from "../src/interfaces/ITradeDeals.sol";

/// @notice Signature checks and the claim-vs-observation rules (plan §4).
contract TradeDealsVerificationTest is BaseTest {
    uint256 internal id;

    function setUp() public override {
        super.setUp();
        id = _create(100 * USDT);
        _approve(id);
        _claim(id, 10_000, LOADED, DOC_A);
    }

    function test_honest_verified() public {
        vm.warp(block.timestamp + 1);
        ITradeDeals.Verification memory v = _obs(id, 9_850, DEPARTED, DOC_A);
        vm.expectEmit(address(deals));
        emit ITradeDeals.Verified(id, 9_850, DEPARTED, DOC_A, v.observedAt, uint64(block.timestamp + LISTING_WINDOW));
        assertEq(uint8(_submit(v)), uint8(ITradeDeals.Outcome.Verified));

        _assertState(id, ITradeDeals.State.Verified);
        ITradeDeals.Deal memory d = deals.getDeal(id);
        assertEq(d.observedKg, 9_850);
        assertEq(d.observedStatus, DEPARTED);
        assertEq(d.observedDocHash, DOC_A);
        assertEq(d.observedAt, v.observedAt);
        assertEq(d.verifiedAt, block.timestamp);
        assertEq(d.checks, 1);
        assertEq(registry.trust(ravi), 5_000, "no credit until settlement");
        assertTrue(deals.nonceUsed(v.nonce));
    }

    function test_trackingLag_pendingThenVerified() public {
        assertEq(uint8(_check(id, 10_020, GATED_IN, DOC_A)), uint8(ITradeDeals.Outcome.Pending));
        _assertState(id, ITradeDeals.State.Pending);
        assertEq(registry.trust(ravi), 5_000, "lag is not dishonesty");

        vm.warp(block.timestamp + 10 minutes);
        assertEq(uint8(_check(id, 10_020, DEPARTED, DOC_A)), uint8(ITradeDeals.Outcome.Verified));
        _assertState(id, ITradeDeals.State.Verified);
        assertEq(deals.getDeal(id).checks, 2);
    }

    function test_shortShipment_rejected_onlyExporterDrops() public {
        uint256 importerTrust = registry.trust(ahmed);
        uint256 raviBalance = usdt.balanceOf(ravi);
        uint256 priyaBalance = usdt.balanceOf(priya);

        vm.warp(block.timestamp + 1);
        ITradeDeals.Verification memory v = _obs(id, 8_020, LOADED, DOC_A);
        vm.expectEmit(address(deals));
        emit ITradeDeals.Rejected(id, ravi, 1, 18_000, 2_632);
        assertEq(uint8(_submit(v)), uint8(ITradeDeals.Outcome.Falsified));

        _assertState(id, ITradeDeals.State.Rejected);
        assertEq(deals.getDeal(id).falsifiedMask, 1, "weight falsified");
        assertEq(registry.trust(ravi), 2_632, "50% -> 26.32%");
        assertEq(registry.trust(ahmed), importerTrust, "only the liar drops");
        assertEq(usdt.balanceOf(ravi), raviBalance, "no money moved");
        assertEq(usdt.balanceOf(priya), priyaBalance, "no money moved");
        assertEq(deals.openExposure(ravi), 0, "credit released");
        assertEq(deals.invoiceDeal(deals.getDeal(id).invoiceHash), id, "lied-on invoice stays locked");
    }

    function test_fakeDocuments_rejected() public {
        assertEq(uint8(_check(id, 10_000, LOADED, DOC_B)), uint8(ITradeDeals.Outcome.Falsified));
        assertEq(deals.getDeal(id).falsifiedMask, 2);
        assertEq(registry.trust(ravi), 2_703);
    }

    function test_statusNeverReached_rejectedAfterDeadline() public {
        assertEq(uint8(_check(id, 10_000, GATED_IN, DOC_A)), uint8(ITradeDeals.Outcome.Pending));
        vm.warp(block.timestamp + VERIFY_WINDOW);
        assertEq(uint8(_check(id, 10_000, GATED_IN, DOC_A)), uint8(ITradeDeals.Outcome.Falsified));
        assertEq(deals.getDeal(id).falsifiedMask, 4);
        assertEq(registry.trust(ravi), 2_857);
    }

    function test_statusBehind_atDeadline_stillPending() public {
        // observedAt == verifyDeadline is still inside the window
        vm.warp(deals.getDeal(id).verifyDeadline);
        assertEq(uint8(_submit(_obs(id, 10_000, GATED_IN, DOC_A))), uint8(ITradeDeals.Outcome.Pending));
    }

    function test_allThreeFaked() public {
        vm.warp(block.timestamp + VERIFY_WINDOW + 1);
        assertEq(uint8(_submit(_obs(id, 8_020, GATED_IN, DOC_B))), uint8(ITradeDeals.Outcome.Falsified));
        assertEq(deals.getDeal(id).falsifiedMask, 7);
        assertEq(registry.trust(ravi), 2_000);
    }

    function test_underDeclared_mismatch_noPenalty() public {
        uint256 id2 = _create(100 * USDT);
        _approve(id2);
        _claim(id2, 9_000, LOADED, DOC_A);
        bytes32 inv = deals.getDeal(id2).invoiceHash;

        vm.expectEmit(address(deals));
        emit ITradeDeals.Mismatch(id2, 9_000, 10_000);
        assertEq(uint8(_check(id2, 10_000, LOADED, DOC_A)), uint8(ITradeDeals.Outcome.Mismatch));

        _assertState(id2, ITradeDeals.State.Mismatch);
        assertEq(registry.trust(ravi), 5_000, "no penalty");
        assertEq(deals.invoiceDeal(inv), 0, "invoice freed to re-create correctly");
        _createWith(ravi, ahmed, 100 * USDT, inv);
    }

    function test_weightTolerance_boundaries() public {
        // declared 10,000 → window [9,700, 10,300]
        uint256 a = _claimedDeal(10_000);
        assertEq(uint8(_check(a, 9_700, LOADED, DOC_A)), uint8(ITradeDeals.Outcome.Verified));
        uint256 b = _claimedDeal(10_000);
        assertEq(uint8(_check(b, 10_300, LOADED, DOC_A)), uint8(ITradeDeals.Outcome.Verified));
        uint256 c = _claimedDeal(10_000);
        assertEq(uint8(_check(c, 10_301, LOADED, DOC_A)), uint8(ITradeDeals.Outcome.Mismatch));
        uint256 d = _claimedDeal(10_000);
        assertEq(uint8(_check(d, 9_699, LOADED, DOC_A)), uint8(ITradeDeals.Outcome.Falsified));
    }

    function test_weightLie_caughtEvenDuringTrackingLag() public {
        assertEq(uint8(_check(id, 8_020, GATED_IN, DOC_A)), uint8(ITradeDeals.Outcome.Falsified));
        assertEq(deals.getDeal(id).falsifiedMask, 1, "status lag alone is not penalised");
    }

    function test_rejectedDeal_acceptsNoMoreChecks() public {
        _check(id, 8_020, LOADED, DOC_A);
        vm.warp(block.timestamp + 1);
        ITradeDeals.Verification memory v = _obs(id, 10_000, LOADED, DOC_A);
        bytes memory sig = _sign(v);
        vm.expectRevert(abi.encodeWithSelector(ITradeDeals.WrongState.selector, id, ITradeDeals.State.Rejected));
        deals.submitVerification(v, sig);
    }

    function test_anyoneCanRelay() public {
        vm.warp(block.timestamp + 1);
        ITradeDeals.Verification memory v = _obs(id, 9_850, DEPARTED, DOC_A);
        bytes memory sig = _sign(v);
        vm.expectEmit(address(deals));
        emit ITradeDeals.VerificationSubmitted(id, outsider, v.nonce, keccak256(sig), ITradeDeals.Outcome.Verified);
        vm.prank(outsider);
        deals.submitVerification(v, sig);
    }

    function test_forgedSignature_rejected() public {
        vm.warp(block.timestamp + 1);
        ITradeDeals.Verification memory v = _obs(id, 10_000, DEPARTED, DOC_A);
        uint256 mallory = 0xBAD;
        bytes memory sig = _signWith(mallory, _digest(v, address(deals), block.chainid));
        vm.expectRevert(abi.encodeWithSelector(ITradeDeals.InvalidSigner.selector, vm.addr(mallory)));
        deals.submitVerification(v, sig);
    }

    function test_tamperedValues_rejected() public {
        vm.warp(block.timestamp + 1);
        ITradeDeals.Verification memory v = _obs(id, 8_020, LOADED, DOC_A);
        bytes memory sig = _sign(v);
        v.observedKg = 10_000;
        vm.expectPartialRevert(ITradeDeals.InvalidSigner.selector);
        deals.submitVerification(v, sig);
    }

    function test_reusedNonce_rejected() public {
        vm.warp(block.timestamp + 1);
        ITradeDeals.Verification memory v = _obs(id, 10_000, GATED_IN, DOC_A);
        bytes memory sig = _sign(v);
        deals.submitVerification(v, sig);
        vm.warp(block.timestamp + 1);
        vm.expectRevert(abi.encodeWithSelector(ITradeDeals.NonceAlreadyUsed.selector, v.nonce));
        deals.submitVerification(v, sig);
    }

    function test_expiredSignature_rejected() public {
        vm.warp(block.timestamp + 1);
        ITradeDeals.Verification memory v = _obs(id, 9_850, DEPARTED, DOC_A);
        bytes memory sig = _sign(v);
        vm.warp(v.expiry + 1);
        vm.expectRevert(ITradeDeals.SignatureExpired.selector);
        deals.submitVerification(v, sig);
    }

    function test_observationBeforeClaim_rejected() public {
        ITradeDeals.Verification memory v = _obs(id, 9_850, DEPARTED, DOC_A);
        bytes memory sig = _sign(v);
        vm.expectRevert(ITradeDeals.StaleObservation.selector);
        deals.submitVerification(v, sig);
    }

    function test_olderObservationAfterNewer_rejected() public {
        vm.warp(block.timestamp + 5);
        ITradeDeals.Verification memory older = _obs(id, 10_000, GATED_IN, DOC_A);
        older.observedAt = uint64(block.timestamp - 2);
        ITradeDeals.Verification memory newer = _obs(id, 10_000, GATED_IN, DOC_A);
        bytes memory olderSig = _sign(older);
        _submit(newer);
        vm.expectRevert(ITradeDeals.StaleObservation.selector);
        deals.submitVerification(older, olderSig);
    }

    function test_futureObservation_rejected() public {
        vm.warp(block.timestamp + 1);
        ITradeDeals.Verification memory v = _obs(id, 9_850, DEPARTED, DOC_A);
        v.observedAt = uint64(block.timestamp + 6 minutes);
        bytes memory sig = _sign(v);
        vm.expectRevert(ITradeDeals.ObservationInFuture.selector);
        deals.submitVerification(v, sig);
    }

    function test_smallClockSkew_accepted() public {
        vm.warp(block.timestamp + 1);
        ITradeDeals.Verification memory v = _obs(id, 9_850, DEPARTED, DOC_A);
        v.observedAt = uint64(block.timestamp + 30); // verifier clock 30 s ahead
        assertEq(uint8(_submit(v)), uint8(ITradeDeals.Outcome.Verified));
    }

    function test_signatureForOtherDeal_rejected() public {
        uint256 other = _claimedDeal(10_000);
        vm.warp(block.timestamp + 1);
        ITradeDeals.Verification memory v = _obs(id, 9_850, DEPARTED, DOC_A);
        bytes memory sig = _sign(v);
        v.dealId = bytes32(other);
        vm.expectPartialRevert(ITradeDeals.InvalidSigner.selector);
        deals.submitVerification(v, sig);
    }

    function test_hederaChainIdSignature_rejected() public {
        vm.warp(block.timestamp + 1);
        ITradeDeals.Verification memory v = _obs(id, 9_850, DEPARTED, DOC_A);
        bytes memory sig = _signWith(verifierPk, _digest(v, address(deals), 296));
        vm.expectPartialRevert(ITradeDeals.InvalidSigner.selector);
        deals.submitVerification(v, sig);
    }

    function test_otherContractSignature_rejected() public {
        vm.warp(block.timestamp + 1);
        ITradeDeals.Verification memory v = _obs(id, 9_850, DEPARTED, DOC_A);
        bytes memory sig = _signWith(verifierPk, _digest(v, makeAddr("old deployment"), block.chainid));
        vm.expectPartialRevert(ITradeDeals.InvalidSigner.selector);
        deals.submitVerification(v, sig);
    }

    function test_invalidStatusCode_rejected() public {
        vm.warp(block.timestamp + 1);
        ITradeDeals.Verification memory v = _obs(id, 9_850, 6, DOC_A);
        bytes memory sig = _sign(v);
        vm.expectRevert(abi.encodeWithSelector(ITradeDeals.InvalidStatus.selector, 6));
        deals.submitVerification(v, sig);
    }

    function test_verificationBeforeClaims_rejected() public {
        uint256 fresh = _create(50 * USDT);
        _approve(fresh);
        vm.warp(block.timestamp + 1);
        ITradeDeals.Verification memory v = _obs(fresh, 9_850, DEPARTED, DOC_A);
        bytes memory sig = _sign(v);
        vm.expectRevert(abi.encodeWithSelector(ITradeDeals.WrongState.selector, fresh, ITradeDeals.State.Approved));
        deals.submitVerification(v, sig);
    }

    function test_hashVerification_matchesIndependentDigest() public {
        vm.warp(block.timestamp + 1);
        ITradeDeals.Verification memory v = _obs(id, 9_850, DEPARTED, DOC_A);
        assertEq(deals.hashVerification(v), _digest(v, address(deals), 1874));
    }

    function test_stuckVerification_expires_noScoreChange() public {
        _check(id, 10_000, GATED_IN, DOC_A);
        uint256 closesAt = uint256(deals.getDeal(id).verifyDeadline) + LISTING_WINDOW;

        vm.warp(closesAt);
        vm.expectRevert(abi.encodeWithSelector(ITradeDeals.TooEarly.selector, id));
        deals.expire(id);

        vm.warp(closesAt + 1);
        vm.expectEmit(address(deals));
        emit ITradeDeals.Expired(id, ITradeDeals.State.Pending);
        deals.expire(id);
        _assertState(id, ITradeDeals.State.Expired);
        assertEq(registry.trust(ravi), 5_000);
        assertEq(deals.openExposure(ravi), 0);
    }

    function _claimedDeal(uint32 kg) internal returns (uint256 dealId) {
        dealId = _create(10 * USDT);
        _approve(dealId);
        _claim(dealId, kg, LOADED, DOC_A);
    }
}
