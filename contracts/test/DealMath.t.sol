// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {DealMath} from "../src/libraries/DealMath.sol";

/// @notice Plan §6 money tables.
contract DealMathTest is Test {
    uint256 internal constant U = 1e6; // 1 USDT

    function _cfg() internal pure returns (DealMath.FeeConfig memory) {
        return DealMath.FeeConfig({minFee: 2 * U, agentFee: U, gasFee: U / 2});
    }

    /// §6.3: 100,000 USDT invoice, exporter score 70%, importer risk 4%
    function test_workedExample_100k_70pct_4pct() public pure {
        DealMath.Quote memory q = DealMath.quote(100_000 * U, 7_000, 400, _cfg());
        assertEq(q.advance, 70_000 * U, "investor pays");
        assertEq(q.fee, 700 * U, "fee 1%");
        assertEq(q.agentFee, 1 * U, "agent wallet");
        assertEq(q.gasFee, U / 2, "gas");
        assertEq(q.reserveFee, 139_700_000, "reserve 139.70");
        assertEq(q.platformFee, 558_800_000, "platform profit 558.80");
        assertEq(q.exporterNet, 69_300 * U, "exporter receives now");
        assertEq(q.investorDue, 72_800 * U, "investor gets back");

        (uint256 toInvestor, uint256 toExporter) = DealMath.waterfall(100_000 * U, q.investorDue);
        assertEq(toInvestor, 72_800 * U);
        assertEq(toExporter, 27_200 * U);
        assertEq(q.exporterNet + toExporter, 96_500 * U, "exporter total");
    }

    /// §6.4 row 1: new exporter (50%) + new importer (4%)
    function test_newExporter_newImporter_100k() public pure {
        DealMath.Quote memory q = DealMath.quote(100_000 * U, 5_000, 400, _cfg());
        assertEq(q.advance, 50_000 * U);
        assertEq(q.fee, 500 * U);
        assertEq(q.reserveFee, 99_700_000); // 99.70
        assertEq(q.platformFee, 398_800_000); // 398.80
        assertEq(q.exporterNet, 49_500 * U);
        assertEq(q.investorDue, 52_000 * U);
        (, uint256 toExporter) = DealMath.waterfall(100_000 * U, q.investorDue);
        assertEq(toExporter, 48_000 * U);
        assertEq(q.exporterNet + toExporter, 97_500 * U);
    }

    /// §6.4 row 2: veteran exporter (90% cap) + importer with 3 on-time payments (2.80%)
    function test_veteranExporter_100k() public pure {
        DealMath.Quote memory q = DealMath.quote(100_000 * U, 9_000, 280, _cfg());
        assertEq(q.advance, 90_000 * U);
        assertEq(q.fee, 900 * U);
        assertEq(q.exporterNet, 89_100 * U);
        assertEq(q.investorDue, 92_520 * U);
        (, uint256 toExporter) = DealMath.waterfall(100_000 * U, q.investorDue);
        assertEq(toExporter, 7_480 * U);
        assertEq(q.exporterNet + toExporter, 96_580 * U);
    }

    /// §6.4 row 6: importer pays only 60,000 → investor gets all of it, exporter nothing
    function test_partialPayment_investorFirst() public pure {
        (uint256 toInvestor, uint256 toExporter) = DealMath.waterfall(60_000 * U, 72_800 * U);
        assertEq(toInvestor, 60_000 * U);
        assertEq(toExporter, 0);
    }

    /// §6.5 demo size, new exporter 50% / importer 4%: minimum fee kicks in
    function test_demo100_new() public pure {
        DealMath.Quote memory q = DealMath.quote(100 * U, 5_000, 400, _cfg());
        assertEq(q.advance, 50 * U);
        assertEq(q.fee, 2 * U, "min fee");
        assertEq(q.agentFee, 1 * U);
        assertEq(q.gasFee, 500_000);
        assertEq(q.reserveFee, 100_000); // 0.10
        assertEq(q.platformFee, 400_000); // 0.40
        assertEq(q.exporterNet, 48 * U);
        assertEq(q.investorDue, 52 * U);
        (, uint256 toExporter) = DealMath.waterfall(100 * U, q.investorDue);
        assertEq(toExporter, 48 * U);
    }

    /// §6.5 demo size after 3 seeded honest deals: exporter 80% / importer 2.80%
    function test_demo100_seeded() public pure {
        DealMath.Quote memory q = DealMath.quote(100 * U, 8_000, 280, _cfg());
        assertEq(q.advance, 80 * U);
        assertEq(q.fee, 2 * U);
        assertEq(q.exporterNet, 78 * U);
        assertEq(q.investorDue, 82_240_000); // 82.24
        (, uint256 toExporter) = DealMath.waterfall(100 * U, q.investorDue);
        assertEq(toExporter, 17_760_000); // 17.76
    }

    function test_latePenalty() public pure {
        assertEq(DealMath.latePenalty(15 days, 30 days, 5_000), 2_500); // §6.4: 15 days late of 30
        assertEq(DealMath.latePenalty(30 days, 30 days, 5_000), 5_000);
        assertEq(DealMath.latePenalty(45 days, 30 days, 5_000), 5_000);
        assertEq(DealMath.latePenalty(0, 30 days, 5_000), 0);
    }

    function testFuzz_quote_conservation(uint128 amount, uint16 advanceBps, uint16 yieldBps) public pure {
        amount = uint128(bound(amount, 10 * U, type(uint128).max / 2));
        advanceBps = uint16(bound(advanceBps, 4_000, 9_000));
        yieldBps = uint16(bound(yieldBps, 200, 800));
        DealMath.Quote memory q = DealMath.quote(amount, advanceBps, yieldBps, _cfg());

        assertEq(q.agentFee + q.gasFee + q.reserveFee + q.platformFee, q.fee, "fee buckets add up");
        if (q.advance > q.fee) assertEq(q.exporterNet + q.fee, q.advance, "advance = fee + exporter net");
        assertGe(q.fee, 2 * U, "minimum fee");
        assertLt(q.investorDue, amount, "investor due always below face value");
    }

    function testFuzz_waterfall_investorFirst(uint256 payment, uint256 owed) public pure {
        payment = bound(payment, 0, type(uint128).max);
        owed = bound(owed, 0, type(uint128).max);
        (uint256 toInvestor, uint256 toExporter) = DealMath.waterfall(payment, owed);
        assertEq(toInvestor + toExporter, payment, "outflows = inflow");
        assertLe(toInvestor, owed);
        if (toExporter > 0) assertEq(toInvestor, owed, "exporter paid only after investor is whole");
    }
}
