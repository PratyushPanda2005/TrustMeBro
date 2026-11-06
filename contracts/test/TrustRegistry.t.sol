// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {TrustRegistry} from "../src/TrustRegistry.sol";

/// @notice Plan §5 score tables. The test contract acts as TradeDeals.
contract TrustRegistryTest is Test {
    TrustRegistry internal reg;
    address internal exporter = makeAddr("exporter");
    address internal importer = makeAddr("importer");

    uint256 internal constant DEAL = 10_000; // one deal of evidence
    bytes32 internal constant TAG = "TEST";

    function setUp() public {
        reg = new TrustRegistry(address(this));
        reg.onboard(exporter, 10_000, 10_000); // exporter prior → 50%
        reg.onboard(importer, 13_334, 6_666); // importer starting at 66.67%
    }

    function test_newExporter_is50pct() public view {
        assertEq(reg.trust(exporter), 5_000);
        assertEq(reg.advanceBps(exporter), 5_000);
    }

    function test_exporter_honestDeals_table() public {
        uint256[5] memory expected = [uint256(6_667), 7_500, 8_000, 8_333, 8_571];
        for (uint256 i; i < 5; ++i) {
            reg.addEvidence(exporter, i + 1, DEAL, 0, TAG);
            assertEq(reg.trust(exporter), expected[i]);
        }
    }

    function test_exporter_reachesCapAfter8() public {
        for (uint256 i; i < 8; ++i) {
            reg.addEvidence(exporter, i + 1, DEAL, 0, TAG);
        }
        assertEq(reg.trust(exporter), 9_000);
        assertEq(reg.advanceBps(exporter), 9_000);
        reg.addEvidence(exporter, 9, DEAL, 0, TAG);
        assertGt(reg.trust(exporter), 9_000);
        assertEq(reg.advanceBps(exporter), 9_000, "advance capped at 90%");
    }

    function test_exporter_fakedWeight_isBlocked() public {
        reg.addEvidence(exporter, 1, 0, 18_000, TAG);
        assertEq(reg.trust(exporter), 2_632); // 26.32%
        assertEq(reg.advanceBps(exporter), 0, "blocked below 40%");
    }

    function test_exporter_fakedDocs() public {
        reg.addEvidence(exporter, 1, 0, 17_000, TAG);
        assertEq(reg.trust(exporter), 2_703); // 27.03%
    }

    function test_exporter_fakedStatus() public {
        reg.addEvidence(exporter, 1, 0, 15_000, TAG);
        assertEq(reg.trust(exporter), 2_857); // 28.57%
    }

    function test_exporter_fakedAllThree() public {
        reg.addEvidence(exporter, 1, 0, 30_000, TAG);
        assertEq(reg.trust(exporter), 2_000); // 20.00%
    }

    function test_exporter_fiveHonestThenFakedWeight() public {
        for (uint256 i; i < 5; ++i) {
            reg.addEvidence(exporter, i + 1, DEAL, 0, TAG);
        }
        assertEq(reg.trust(exporter), 8_571);
        reg.addEvidence(exporter, 6, 0, 18_000, TAG);
        assertEq(reg.trust(exporter), 6_818); // 68.18%
    }

    function test_advance_minScoreBoundary() public {
        // r = 0, s = 5,000 → 10,000 / 25,000 = 40.00% exactly: still allowed
        reg.addEvidence(exporter, 1, 0, 5_000, TAG);
        assertEq(reg.trust(exporter), 4_000);
        assertEq(reg.advanceBps(exporter), 4_000);
        // 10,000 / 25,100 = 39.84% → blocked
        reg.addEvidence(exporter, 2, 0, 100, TAG);
        assertEq(reg.trust(exporter), 3_984);
        assertEq(reg.advanceBps(exporter), 0);
    }

    function test_newImporter() public view {
        assertEq(reg.trust(importer), 6_667); // 66.67%
        assertEq(reg.riskBps(importer), 400); // 4.00%
    }

    function test_importer_oneOnTime() public {
        reg.addEvidence(importer, 1, DEAL, 0, TAG);
        assertEq(reg.trust(importer), 7_778); // 77.78%
        assertEq(reg.riskBps(importer), 333); // 3.33%
    }

    function test_importer_threeOnTime() public {
        for (uint256 i; i < 3; ++i) {
            reg.addEvidence(importer, i + 1, DEAL, 0, TAG);
        }
        assertEq(reg.trust(importer), 8_667); // 86.67%
        assertEq(reg.riskBps(importer), 280); // 2.80%
    }

    function test_importer_thirtyDaysLate_grace30() public {
        reg.addEvidence(importer, 1, 5_000, 5_000, TAG);
        assertEq(reg.trust(importer), 6_111); // 61.11%
        assertEq(reg.riskBps(importer), 433); // 4.33%
    }

    function test_importer_defaultFromStart() public {
        reg.addEvidence(importer, 1, 0, 30_000, TAG);
        assertEq(reg.trust(importer), 2_667); // 26.67%
        assertEq(reg.riskBps(importer), 440); // 6.40%
    }

    function test_onlyDealsCanWrite() public {
        vm.startPrank(makeAddr("admin"));
        vm.expectRevert(TrustRegistry.OnlyDeals.selector);
        reg.addEvidence(exporter, 1, DEAL, 0, TAG);
        vm.expectRevert(TrustRegistry.OnlyDeals.selector);
        reg.onboard(makeAddr("new"), 1, 1);
        vm.stopPrank();
    }

    function test_onboardOnlyOnce() public {
        vm.expectRevert(abi.encodeWithSelector(TrustRegistry.AlreadyOnboarded.selector, exporter));
        reg.onboard(exporter, 90_000, 1);
    }

    function test_onboard_rejectsZeroPrior() public {
        vm.expectRevert(TrustRegistry.InvalidPrior.selector);
        reg.onboard(makeAddr("x"), 0, 10_000);
        vm.expectRevert(TrustRegistry.InvalidPrior.selector);
        reg.onboard(makeAddr("y"), 10_000, 0);
    }

    function test_evidence_requiresOnboarding() public {
        address stranger = makeAddr("stranger");
        vm.expectRevert(abi.encodeWithSelector(TrustRegistry.NotOnboarded.selector, stranger));
        reg.addEvidence(stranger, 1, DEAL, 0, TAG);
    }

    function test_evidence_rejectsEmpty() public {
        vm.expectRevert(TrustRegistry.NoEvidence.selector);
        reg.addEvidence(exporter, 1, 0, 0, TAG);
    }

    function test_unknownAddress_views() public {
        address stranger = makeAddr("stranger");
        assertEq(reg.trust(stranger), 0);
        assertEq(reg.advanceBps(stranger), 0);
        assertEq(reg.riskBps(stranger), 800);
        assertFalse(reg.isOnboarded(stranger));
    }

    function test_feedbackEvent() public {
        vm.expectEmit(address(reg));
        emit TrustRegistry.Feedback(exporter, 7, 6_667, TAG);
        reg.addEvidence(exporter, 7, DEAL, 0, TAG);
    }

    function test_profile() public {
        reg.addEvidence(importer, 1, DEAL, 0, TAG);
        TrustRegistry.Profile memory p = reg.profile(importer);
        assertTrue(p.onboarded);
        assertEq(p.r, DEAL);
        assertEq(p.s, 0);
        assertEq(p.a, 13_334);
        assertEq(p.b, 6_666);
        assertEq(p.trustBps, 7_778);
        assertEq(p.riskBps, 333);
    }

    function testFuzz_goodNeverLowers_badNeverRaises(uint64 r0, uint64 s0, uint64 good, uint64 bad) public {
        address who = makeAddr("fuzz");
        reg.onboard(who, 10_000, 10_000);
        if (r0 > 0) reg.addEvidence(who, 1, r0, 0, TAG);
        if (s0 > 0) reg.addEvidence(who, 2, 0, s0, TAG);

        uint256 before = reg.trust(who);
        uint256 riskBefore = reg.riskBps(who);
        if (good > 0) {
            reg.addEvidence(who, 3, good, 0, TAG);
            assertGe(reg.trust(who), before);
            assertLe(reg.riskBps(who), riskBefore);
        }
        before = reg.trust(who);
        riskBefore = reg.riskBps(who);
        if (bad > 0) {
            reg.addEvidence(who, 4, 0, bad, TAG);
            assertLe(reg.trust(who), before);
            assertGe(reg.riskBps(who), riskBefore);
        }
    }

    function testFuzz_bounds(uint64 good, uint64 bad) public {
        vm.assume(good > 0 || bad > 0);
        reg.addEvidence(importer, 1, good, bad, TAG);
        assertLe(reg.trust(importer), 10_000);
        uint256 risk = reg.riskBps(importer);
        assertGe(risk, 200);
        assertLe(risk, 800);
        assertLe(reg.advanceBps(importer), 9_000);
    }
}
