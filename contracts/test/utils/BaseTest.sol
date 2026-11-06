// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {TradeDeals} from "../../src/TradeDeals.sol";
import {TrustRegistry} from "../../src/TrustRegistry.sol";
import {ITradeDeals} from "../../src/interfaces/ITradeDeals.sol";
import {DealMath} from "../../src/libraries/DealMath.sol";
import {MockUSDT} from "../mocks/MockUSDT.sol";

/// @dev Shared setup: deploys the contracts, KYCs the parties, funds them with mock USDT.
abstract contract BaseTest is Test {
    uint256 internal constant USDT = 1e6; // 1 USDT in token units
    uint256 internal constant WHITECHAIN_SEPOLIA = 1874;

    // Written independently of TradeDeals so drift in the contract is caught.
    bytes32 internal constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 internal constant VERIFICATION_TYPEHASH = keccak256(
        "Verification(bytes32 dealId,uint32 observedKg,uint8 statusCode,bytes32 docHash,uint64 observedAt,uint256 nonce,uint256 expiry)"
    );

    uint8 internal constant BOOKED = 1;
    uint8 internal constant GATED_IN = 2;
    uint8 internal constant LOADED = 3;
    uint8 internal constant DEPARTED = 4;
    uint8 internal constant ARRIVED = 5;

    bytes32 internal constant DOC_A = keccak256("invoice + packing list + bill of lading: bundle A");
    bytes32 internal constant DOC_B = keccak256("invoice + packing list + bill of lading: bundle B");
    bytes32 internal constant TERMS = keccak256("TrustMeBro T&C v1: notice of assignment, pay to the contract");

    uint32 internal constant VERIFY_WINDOW = 1 hours;
    uint32 internal constant LISTING_WINDOW = 1 days;
    uint32 internal constant GRACE = 30 days;
    uint256 internal constant TENOR = 60 days;

    MockUSDT internal usdt;
    TrustRegistry internal registry;
    TradeDeals internal deals;

    address internal admin = makeAddr("admin");
    address internal ravi = makeAddr("ravi"); // exporter
    address internal ahmed = makeAddr("ahmed"); // importer
    address internal priya = makeAddr("priya"); // investor
    address internal kiran = makeAddr("kiran"); // second investor
    address internal outsider = makeAddr("outsider");
    address internal agent = makeAddr("agent"); // relays verifications

    address internal agentWallet = makeAddr("agentWallet");
    address internal gasRelayer = makeAddr("gasRelayer");
    address internal reserveFund = makeAddr("reserveFund");
    address internal treasury = makeAddr("treasury");

    uint256 internal verifierPk = 0xA11CE;
    address internal verifier;

    uint256 internal nextNonce = 1;
    uint256 internal invoiceCounter;

    function setUp() public virtual {
        vm.chainId(WHITECHAIN_SEPOLIA);
        vm.warp(1_780_000_000);
        verifier = vm.addr(verifierPk);

        usdt = new MockUSDT();
        (registry, deals) = _deploy(IERC20(address(usdt)));

        vm.startPrank(admin);
        deals.setKyc(ravi, ITradeDeals.Role.Exporter);
        deals.setKyc(ahmed, ITradeDeals.Role.Importer);
        deals.setKyc(priya, ITradeDeals.Role.Investor);
        deals.setKyc(kiran, ITradeDeals.Role.Investor);
        vm.stopPrank();

        _giveUsdt(ahmed, 1_000_000 * USDT);
        _giveUsdt(priya, 1_000_000 * USDT);
        _giveUsdt(kiran, 1_000_000 * USDT);
    }

    function _deploy(IERC20 token) internal returns (TrustRegistry reg, TradeDeals td) {
        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        reg = new TrustRegistry(predicted);
        td = new TradeDeals(admin, token, reg, verifier, _recipients());
        assertEq(address(td), predicted, "registry bound to TradeDeals");
    }

    function _recipients() internal view returns (ITradeDeals.FeeRecipients memory) {
        return ITradeDeals.FeeRecipients({
            agentWallet: agentWallet,
            gasRelayer: gasRelayer,
            reserveFund: reserveFund,
            platformTreasury: treasury
        });
    }

    function _giveUsdt(address who, uint256 amount) internal {
        usdt.mint(who, amount);
        vm.prank(who);
        usdt.approve(address(deals), type(uint256).max);
    }

    function _durations() internal pure returns (ITradeDeals.Durations memory) {
        return ITradeDeals.Durations({verifyWindow: VERIFY_WINDOW, listingWindow: LISTING_WINDOW, graceWindow: GRACE});
    }

    function _nextInvoice() internal returns (bytes32) {
        return keccak256(abi.encode("invoice", ++invoiceCounter));
    }

    function _create(uint256 amount) internal returns (uint256) {
        return _createWith(ravi, ahmed, amount, _nextInvoice());
    }

    function _createWith(address exporter, address importer, uint256 amount, bytes32 invoiceHash)
        internal
        returns (uint256 id)
    {
        vm.prank(exporter);
        id = deals.createDeal(amount, uint64(vm.getBlockTimestamp() + TENOR), importer, invoiceHash, TERMS, _durations());
    }

    function _approve(uint256 id) internal {
        address importer_ = deals.getDeal(id).importer;
        vm.prank(importer_);
        deals.approveDeal(id, TERMS);
    }

    function _claim(uint256 id, uint32 kg, uint8 status, bytes32 doc) internal {
        address exporter = deals.getDeal(id).exporter;
        vm.prank(exporter);
        deals.declareClaims(id, kg, status, doc, "MSKU1234567", "BL-001");
    }

    function _obs(uint256 id, uint32 kg, uint8 status, bytes32 doc)
        internal
        returns (ITradeDeals.Verification memory v)
    {
        v = ITradeDeals.Verification({
            dealId: bytes32(id),
            observedKg: kg,
            statusCode: status,
            docHash: doc,
            observedAt: uint64(vm.getBlockTimestamp()),
            nonce: nextNonce++,
            expiry: vm.getBlockTimestamp() + 10 minutes
        });
    }

    function _digest(ITradeDeals.Verification memory v, address verifyingContract, uint256 chainId)
        internal
        pure
        returns (bytes32)
    {
        bytes32 domainSeparator = keccak256(
            abi.encode(DOMAIN_TYPEHASH, keccak256("TrustMeBro"), keccak256("1"), chainId, verifyingContract)
        );
        bytes32 structHash = keccak256(
            abi.encode(
                VERIFICATION_TYPEHASH,
                v.dealId,
                v.observedKg,
                v.statusCode,
                v.docHash,
                v.observedAt,
                v.nonce,
                v.expiry
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
    }

    function _signWith(uint256 pk, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _sign(ITradeDeals.Verification memory v) internal view returns (bytes memory) {
        return _signWith(verifierPk, _digest(v, address(deals), block.chainid));
    }

    function _submit(ITradeDeals.Verification memory v) internal returns (ITradeDeals.Outcome) {
        bytes memory sig = _sign(v);
        vm.prank(agent);
        return deals.submitVerification(v, sig);
    }

    /// @dev Moves time forward 1s, then signs and submits an observation.
    function _check(uint256 id, uint32 kg, uint8 status, bytes32 doc) internal returns (ITradeDeals.Outcome) {
        vm.warp(vm.getBlockTimestamp() + 1);
        return _submit(_obs(id, kg, status, doc));
    }

    function _verified(uint256 amount) internal returns (uint256 id) {
        id = _create(amount);
        _approve(id);
        _claim(id, 10_000, LOADED, DOC_A);
        assertEq(uint8(_check(id, 9_850, DEPARTED, DOC_A)), uint8(ITradeDeals.Outcome.Verified));
    }

    function _fund(uint256 id, address investor) internal returns (DealMath.Quote memory q) {
        q = deals.quote(id);
        vm.prank(investor);
        deals.fund(id, q.advance, q.yieldBps);
    }

    function _funded(uint256 amount) internal returns (uint256 id) {
        id = _verified(amount);
        _fund(id, priya);
    }

    function _payInFull(uint256 id) internal {
        ITradeDeals.Deal memory d = deals.getDeal(id);
        vm.prank(d.importer);
        deals.pay(id, d.amount - d.paid);
    }

    function _honestCycle(uint256 amount) internal returns (uint256 id) {
        id = _funded(amount);
        _payInFull(id);
    }

    function _state(uint256 id) internal view returns (ITradeDeals.State) {
        return deals.getDeal(id).state;
    }

    function _assertState(uint256 id, ITradeDeals.State expected) internal view {
        assertEq(uint8(_state(id)), uint8(expected), "deal state");
    }
}
