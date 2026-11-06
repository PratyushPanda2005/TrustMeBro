// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {BaseTest} from "./utils/BaseTest.sol";
import {ITradeDeals} from "../src/interfaces/ITradeDeals.sol";
import {TradeDeals} from "../src/TradeDeals.sol";
import {TrustRegistry} from "../src/TrustRegistry.sol";
import {DealMath} from "../src/libraries/DealMath.sol";
import {FeeOnTransferUSDT} from "./mocks/MockUSDT.sol";

/// @notice Funding, NFT transfer rules, repayment, default and expiry. Numbers follow plan §6.5.
contract TradeDealsSettlementTest is BaseTest {
    function test_fund_demoDeal_feeSplitAndNft() public {
        uint256 id = _verified(100 * USDT);
        uint256 priya0 = usdt.balanceOf(priya);
        uint256 ravi0 = usdt.balanceOf(ravi);

        DealMath.Quote memory q = deals.quote(id);
        assertEq(q.advanceBps, 5_000);
        assertEq(q.yieldBps, 400);
        assertEq(q.advance, 50 * USDT);

        vm.expectEmit(address(deals));
        emit ITradeDeals.FeeSplit(id, 1 * USDT, 500_000, 100_000, 400_000);
        vm.expectEmit(address(deals));
        emit ITradeDeals.Funded(id, priya, 50 * USDT, 2 * USDT, 48 * USDT, 5_000, 400, 52 * USDT);
        vm.prank(priya);
        deals.fund(id, q.advance, q.yieldBps);

        assertEq(priya0 - usdt.balanceOf(priya), 50 * USDT, "investor pays the advance");
        assertEq(usdt.balanceOf(agentWallet), 1 * USDT, "agent wallet");
        assertEq(usdt.balanceOf(gasRelayer), 500_000, "gas");
        assertEq(usdt.balanceOf(reserveFund), 100_000, "reserve");
        assertEq(usdt.balanceOf(treasury), 400_000, "platform profit");
        assertEq(usdt.balanceOf(ravi) - ravi0, 48 * USDT, "exporter paid now");
        assertEq(usdt.balanceOf(address(deals)), 0, "contract holds nothing");

        assertEq(deals.ownerOf(id), priya, "receivable NFT minted to investor");
        ITradeDeals.Deal memory d = deals.getDeal(id);
        assertEq(uint8(d.state), uint8(ITradeDeals.State.Funded));
        assertEq(d.investor, priya);
        assertEq(d.advance, 50 * USDT);
        assertEq(d.fee, 2 * USDT);
        assertEq(d.investorDue, 52 * USDT);
        assertEq(d.advanceBps, 5_000);
        assertEq(d.yieldBps, 400);
        assertEq(d.fundedAt, block.timestamp);
    }

    function test_fund_onlyKycInvestor() public {
        uint256 id = _verified(100 * USDT);
        _giveUsdt(outsider, 1_000 * USDT);
        vm.expectRevert(abi.encodeWithSelector(ITradeDeals.NotKyced.selector, outsider, ITradeDeals.Role.Investor));
        vm.prank(outsider);
        deals.fund(id, type(uint256).max, 0);

        vm.expectRevert(abi.encodeWithSelector(ITradeDeals.NotKyced.selector, ahmed, ITradeDeals.Role.Investor));
        vm.prank(ahmed);
        deals.fund(id, type(uint256).max, 0);
    }

    function test_fund_onlyOneInvestor() public {
        uint256 id = _funded(100 * USDT);
        vm.expectRevert(abi.encodeWithSelector(ITradeDeals.WrongState.selector, id, ITradeDeals.State.Funded));
        vm.prank(kiran);
        deals.fund(id, type(uint256).max, 0);
    }

    function test_fund_requiresVerification() public {
        uint256 id = _create(100 * USDT);
        _approve(id);
        _claim(id, 10_000, LOADED, DOC_A);
        vm.expectRevert(abi.encodeWithSelector(ITradeDeals.WrongState.selector, id, ITradeDeals.State.Claimed));
        vm.prank(priya);
        deals.fund(id, type(uint256).max, 0);
    }

    function test_fund_slippageGuards() public {
        uint256 id = _verified(100 * USDT);
        vm.startPrank(priya);
        vm.expectRevert(ITradeDeals.SlippageExceeded.selector);
        deals.fund(id, 50 * USDT - 1, 0);
        vm.expectRevert(ITradeDeals.SlippageExceeded.selector);
        deals.fund(id, 50 * USDT, 401);
        vm.stopPrank();
    }

    function test_fund_blockedIfExporterCaughtLyingElsewhere() public {
        uint256 honest = _verified(100 * USDT);
        uint256 cheat = _create(100 * USDT);
        _approve(cheat);
        _claim(cheat, 10_000, LOADED, DOC_A);
        _check(cheat, 8_020, LOADED, DOC_A);

        assertEq(deals.quote(honest).advanceBps, 0);
        vm.expectRevert(abi.encodeWithSelector(ITradeDeals.ScoreTooLow.selector, 2_632));
        vm.prank(priya);
        deals.fund(honest, type(uint256).max, 0);
    }

    function test_fund_afterListingWindow_thenExpire() public {
        uint256 id = _verified(100 * USDT);
        bytes32 inv = deals.getDeal(id).invoiceHash;
        vm.warp(block.timestamp + LISTING_WINDOW + 1);

        vm.expectRevert(abi.encodeWithSelector(ITradeDeals.ListingClosed.selector, id));
        vm.prank(priya);
        deals.fund(id, type(uint256).max, 0);

        deals.expire(id);
        _assertState(id, ITradeDeals.State.Expired);
        assertEq(registry.trust(ravi), 5_000, "no score change");
        assertEq(deals.invoiceDeal(inv), 0, "unfinanced invoice can be listed again");
    }

    function test_expire_tooEarly() public {
        uint256 id = _verified(100 * USDT);
        vm.expectRevert(abi.encodeWithSelector(ITradeDeals.TooEarly.selector, id));
        deals.expire(id);
        _fund(id, priya);
        vm.expectRevert(abi.encodeWithSelector(ITradeDeals.WrongState.selector, id, ITradeDeals.State.Funded));
        deals.expire(id);
    }

    function test_fund_rejectsFeeOnTransferToken() public {
        FeeOnTransferUSDT taxed = new FeeOnTransferUSDT();
        (, TradeDeals td) = _deploy(IERC20(address(taxed)));
        vm.startPrank(admin);
        td.setKyc(ravi, ITradeDeals.Role.Exporter);
        td.setKyc(ahmed, ITradeDeals.Role.Importer);
        td.setKyc(priya, ITradeDeals.Role.Investor);
        vm.stopPrank();
        taxed.mint(priya, 1_000 * USDT);
        vm.prank(priya);
        taxed.approve(address(td), type(uint256).max);

        vm.prank(ravi);
        uint256 id = td.createDeal(100 * USDT, uint64(block.timestamp + TENOR), ahmed, _nextInvoice(), TERMS, _durations());
        vm.prank(ahmed);
        td.approveDeal(id, TERMS);
        vm.prank(ravi);
        td.declareClaims(id, 10_000, LOADED, DOC_A, "MSKU1234567", "");
        vm.warp(block.timestamp + 1);
        ITradeDeals.Verification memory v = _obs(id, 10_000, LOADED, DOC_A);
        td.submitVerification(v, _signWith(verifierPk, _digest(v, address(td), block.chainid)));

        vm.expectRevert(ITradeDeals.InvalidToken.selector);
        vm.prank(priya);
        td.fund(id, type(uint256).max, 0);
    }

    function test_nft_transferOnlyToKycInvestor() public {
        uint256 id = _funded(100 * USDT);
        vm.startPrank(priya);
        vm.expectRevert(abi.encodeWithSelector(ITradeDeals.TransferRestricted.selector, outsider));
        deals.transferFrom(priya, outsider, id);
        vm.expectRevert(abi.encodeWithSelector(ITradeDeals.TransferRestricted.selector, ravi));
        deals.transferFrom(priya, ravi, id);
        deals.transferFrom(priya, kiran, id);
        vm.stopPrank();
        assertEq(deals.ownerOf(id), kiran);
    }

    function test_nft_revokedInvestorCannotReceive() public {
        uint256 id = _funded(100 * USDT);
        vm.prank(admin);
        deals.revokeKyc(kiran);
        vm.expectRevert(abi.encodeWithSelector(ITradeDeals.TransferRestricted.selector, kiran));
        vm.prank(priya);
        deals.transferFrom(priya, kiran, id);
    }

    function test_nft_repaymentFollowsHolder() public {
        uint256 id = _funded(100 * USDT);
        vm.prank(priya);
        deals.transferFrom(priya, kiran, id);
        uint256 kiran0 = usdt.balanceOf(kiran);
        uint256 priya0 = usdt.balanceOf(priya);

        _payInFull(id);
        assertEq(usdt.balanceOf(kiran) - kiran0, 52 * USDT, "the current holder is paid");
        assertEq(usdt.balanceOf(priya), priya0);
    }

    function test_nft_frozenAfterSettlement() public {
        uint256 id = _honestCycle(100 * USDT);
        vm.expectRevert(abi.encodeWithSelector(ITradeDeals.ReceivableClosed.selector, id));
        vm.prank(priya);
        deals.transferFrom(priya, kiran, id);
    }

    function test_nft_tokenUri_isOnchainJson() public {
        uint256 id = _funded(100 * USDT);
        string memory uri = deals.tokenURI(id);
        assertEq(_prefix(uri, 29), "data:application/json;base64,");
    }

    function test_supportsInterfaces() public view {
        assertTrue(deals.supportsInterface(0x80ac58cd)); // ERC-721
        assertTrue(deals.supportsInterface(0x5b5e139f)); // ERC-721 metadata
        assertTrue(deals.supportsInterface(0x7965db0b)); // AccessControl
    }

    function test_pay_onTime_waterfallAndScores() public {
        uint256 id = _funded(100 * USDT);
        uint256 priya0 = usdt.balanceOf(priya);
        uint256 ravi0 = usdt.balanceOf(ravi);

        vm.expectEmit(address(deals));
        emit ITradeDeals.Paid(id, ahmed, 100 * USDT, 52 * USDT, 48 * USDT, priya, 100 * USDT);
        vm.expectEmit(address(deals));
        emit ITradeDeals.Settled(id, bytes32("PAID_ON_TIME"), 6_667, 7_778);
        vm.prank(ahmed);
        deals.pay(id, 100 * USDT);

        assertEq(usdt.balanceOf(priya) - priya0, 52 * USDT, "investor: 50 + 4%");
        assertEq(usdt.balanceOf(ravi) - ravi0, 48 * USDT, "exporter: the rest");
        assertEq(usdt.balanceOf(address(deals)), 0);
        _assertState(id, ITradeDeals.State.Settled);

        assertEq(registry.trust(ravi), 6_667);
        assertEq(registry.trust(ahmed), 7_778);
        assertEq(registry.riskBps(ahmed), 333);
        assertEq(deals.settledVolume(ravi), 100 * USDT);
        assertEq(deals.openExposure(ravi), 0);
    }

    function test_pay_partial_investorFirst() public {
        uint256 id = _funded(100 * USDT);
        uint256 priya0 = usdt.balanceOf(priya);
        uint256 ravi0 = usdt.balanceOf(ravi);
        vm.startPrank(ahmed);

        deals.pay(id, 30 * USDT);
        assertEq(usdt.balanceOf(priya) - priya0, 30 * USDT);
        assertEq(usdt.balanceOf(ravi), ravi0, "exporter waits until the investor is whole");

        deals.pay(id, 30 * USDT); // 22 completes the investor, 8 to the exporter
        assertEq(usdt.balanceOf(priya) - priya0, 52 * USDT);
        assertEq(usdt.balanceOf(ravi) - ravi0, 8 * USDT);
        _assertState(id, ITradeDeals.State.Funded);

        deals.pay(id, 40 * USDT);
        assertEq(usdt.balanceOf(ravi) - ravi0, 48 * USDT);
        vm.stopPrank();
        _assertState(id, ITradeDeals.State.Settled);
    }

    function test_pay_overpaymentCapped() public {
        uint256 id = _funded(100 * USDT);
        uint256 ahmed0 = usdt.balanceOf(ahmed);
        vm.prank(ahmed);
        uint256 accepted = deals.pay(id, 150 * USDT);
        assertEq(accepted, 100 * USDT);
        assertEq(ahmed0 - usdt.balanceOf(ahmed), 100 * USDT);
    }

    function test_pay_onlyImporter_onlyFunded() public {
        uint256 id = _verified(100 * USDT);
        vm.expectRevert(abi.encodeWithSelector(ITradeDeals.WrongState.selector, id, ITradeDeals.State.Verified));
        vm.prank(ahmed);
        deals.pay(id, 100 * USDT);

        _fund(id, priya);
        vm.expectRevert(abi.encodeWithSelector(ITradeDeals.NotParty.selector, priya));
        vm.prank(priya);
        deals.pay(id, 100 * USDT);

        vm.expectRevert(ITradeDeals.InvalidAmount.selector);
        vm.prank(ahmed);
        deals.pay(id, 0);

        _payInFull(id);
        vm.expectRevert(abi.encodeWithSelector(ITradeDeals.WrongState.selector, id, ITradeDeals.State.Settled));
        vm.prank(ahmed);
        deals.pay(id, 1);
    }

    function test_pay_late_withinGrace() public {
        uint256 id = _funded(100 * USDT);
        vm.warp(deals.getDeal(id).dueDate + 15 days);
        vm.expectEmit(address(deals));
        emit ITradeDeals.Settled(id, bytes32("PAID_LATE"), 6_667, 6_667);
        _payInFull(id);

        TrustRegistry.Rep memory r = registry.rep(ahmed);
        assertEq(r.r, 5_000, "late: r += 5,000");
        assertEq(r.s, 2_500, "late: s += 5,000 x 15/30");
        assertEq(registry.trust(ravi), 6_667, "importer late, the exporter still rises");
    }

    function test_pay_afterGrace_scoredAsDefault() public {
        uint256 id = _funded(100 * USDT);
        vm.warp(deals.getDeal(id).dueDate + GRACE + 1);
        _payInFull(id);
        _assertState(id, ITradeDeals.State.Settled);
        TrustRegistry.Rep memory r = registry.rep(ahmed);
        assertEq(r.r, 0);
        assertEq(r.s, 30_000);
    }

    function test_default_onlyImporterDrops() public {
        uint256 id = _funded(100 * USDT);
        uint256 graceEnd = uint256(deals.getDeal(id).dueDate) + GRACE;

        vm.warp(graceEnd);
        vm.expectRevert(abi.encodeWithSelector(ITradeDeals.TooEarly.selector, id));
        deals.markDefault(id);

        vm.warp(graceEnd + 1);
        vm.expectEmit(address(deals));
        emit ITradeDeals.Defaulted(id, 100 * USDT, 52 * USDT, 2_667);
        vm.prank(outsider);
        deals.markDefault(id);

        _assertState(id, ITradeDeals.State.Defaulted);
        assertEq(registry.trust(ahmed), 2_667, "importer 66.67% -> 26.67%");
        assertEq(registry.riskBps(ahmed), 440, "risk jumps to 6.40%");
        assertEq(registry.trust(ravi), 5_000, "exporter unchanged");
        assertEq(deals.openExposure(ravi), 0);
        assertEq(deals.settledVolume(ravi), 0, "no settlement credit");
    }

    function test_default_afterPartial_thenRecovery() public {
        uint256 id = _funded(100 * USDT);
        vm.prank(ahmed);
        deals.pay(id, 30 * USDT);

        vm.warp(uint256(deals.getDeal(id).dueDate) + GRACE + 1);
        vm.expectEmit(address(deals));
        emit ITradeDeals.Defaulted(id, 70 * USDT, 22 * USDT, 2_667);
        deals.markDefault(id);

        uint256 priya0 = usdt.balanceOf(priya);
        uint256 ravi0 = usdt.balanceOf(ravi);
        vm.prank(ahmed);
        deals.pay(id, 70 * USDT);
        assertEq(usdt.balanceOf(priya) - priya0, 22 * USDT);
        assertEq(usdt.balanceOf(ravi) - ravi0, 48 * USDT);
        _assertState(id, ITradeDeals.State.Defaulted);
        assertEq(registry.trust(ahmed), 2_667);

        vm.expectRevert(abi.encodeWithSelector(ITradeDeals.NothingOwed.selector, id));
        vm.prank(ahmed);
        deals.pay(id, 1);
    }

    function test_default_nftStillTransferableForRecovery() public {
        uint256 id = _funded(100 * USDT);
        vm.warp(uint256(deals.getDeal(id).dueDate) + GRACE + 1);
        deals.markDefault(id);
        vm.prank(priya);
        deals.transferFrom(priya, kiran, id);
        assertEq(deals.ownerOf(id), kiran);
    }

    function test_markDefault_onSettled_reverts() public {
        uint256 id = _honestCycle(100 * USDT);
        vm.warp(block.timestamp + TENOR + GRACE + 1);
        vm.expectRevert(abi.encodeWithSelector(ITradeDeals.WrongState.selector, id, ITradeDeals.State.Settled));
        deals.markDefault(id);
    }

    /// Plan §6.5 right column: exporter 80%, importer 2.80%.
    function test_seededDemo_threeHonestDeals() public {
        for (uint256 i; i < 3; ++i) {
            _honestCycle(100 * USDT);
        }
        assertEq(registry.trust(ravi), 8_000);
        assertEq(registry.riskBps(ahmed), 280);
        assertEq(deals.creditLimit(ravi), 800 * USDT);

        uint256 id = _verified(100 * USDT);
        DealMath.Quote memory q = deals.quote(id);
        assertEq(q.advance, 80 * USDT);
        assertEq(q.exporterNet, 78 * USDT);
        assertEq(q.investorDue, 82_240_000);

        _fund(id, priya);
        uint256 priya0 = usdt.balanceOf(priya);
        uint256 ravi0 = usdt.balanceOf(ravi);
        _payInFull(id);
        assertEq(usdt.balanceOf(priya) - priya0, 82_240_000, "investor 82.24");
        assertEq(usdt.balanceOf(ravi) - ravi0, 17_760_000, "exporter 17.76");
    }

    function test_termsFrozenAtFunding() public {
        uint256 id = _funded(100 * USDT);
        _honestCycle(50 * USDT);
        ITradeDeals.Deal memory d = deals.getDeal(id);
        assertEq(d.yieldBps, 400);
        assertEq(d.investorDue, 52 * USDT);
    }

    function testFuzz_repayment_conservesFunds_investorFirst(uint256 p1, uint256 p2, uint256 p3) public {
        uint256 id = _funded(100 * USDT);
        uint256[3] memory payments = [bound(p1, 1, 120 * USDT), bound(p2, 1, 120 * USDT), bound(p3, 1, 120 * USDT)];
        uint256 priya0 = usdt.balanceOf(priya);
        uint256 ravi0 = usdt.balanceOf(ravi);
        uint256 ahmed0 = usdt.balanceOf(ahmed);

        for (uint256 i; i < 3; ++i) {
            if (deals.getDeal(id).paid == 100 * USDT) break;
            vm.prank(ahmed);
            deals.pay(id, payments[i]);

            uint256 toInvestor = usdt.balanceOf(priya) - priya0;
            uint256 toExporter = usdt.balanceOf(ravi) - ravi0;
            assertEq(toInvestor + toExporter, ahmed0 - usdt.balanceOf(ahmed), "outflows = inflow");
            assertLe(toInvestor, 52 * USDT);
            if (toExporter > 0) assertEq(toInvestor, 52 * USDT, "investor whole before exporter");
            assertEq(usdt.balanceOf(address(deals)), 0, "nothing stuck in the contract");
        }
    }

    function test_setFeeRecipients() public {
        ITradeDeals.FeeRecipients memory r = _recipients();
        r.agentWallet = makeAddr("newAgentWallet");
        vm.prank(admin);
        deals.setFeeRecipients(r);
        assertEq(deals.feeRecipients().agentWallet, r.agentWallet);

        vm.expectRevert();
        vm.prank(outsider);
        deals.setFeeRecipients(r);

        r.reserveFund = address(0);
        vm.expectRevert(ITradeDeals.ZeroAddress.selector);
        vm.prank(admin);
        deals.setFeeRecipients(r);
    }

    function _prefix(string memory s, uint256 n) internal pure returns (string memory) {
        bytes memory b = bytes(s);
        bytes memory out = new bytes(n);
        for (uint256 i; i < n; ++i) {
            out[i] = b[i];
        }
        return string(out);
    }
}
