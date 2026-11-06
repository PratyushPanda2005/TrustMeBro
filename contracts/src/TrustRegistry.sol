// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

/// @title TrustRegistry
/// @notice Beta-reputation Trust Scores: trust = (r + a) / (r + s + a + b), where r/s are good/bad
///         evidence and a/b the starting prior. Only TradeDeals can write; there is no admin.
contract TrustRegistry {
    using SafeCast for uint256;

    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_ADVANCE_BPS = 9_000;
    uint256 public constant MIN_SCORE_BPS = 4_000; // below this an exporter is blocked
    uint256 public constant RISK_MIN_BPS = 200; // risk = 2% + 6% x (1 - trust)
    uint256 public constant RISK_SPAN_BPS = 600;

    struct Rep {
        uint128 r; // good evidence
        uint128 s; // bad evidence
        uint128 a; // prior good
        uint128 b; // prior bad
    }

    struct Profile {
        bool onboarded;
        uint256 r;
        uint256 s;
        uint256 a;
        uint256 b;
        uint256 trustBps;
        uint256 advanceBps;
        uint256 riskBps;
    }

    address public immutable deals;

    mapping(address => Rep) private _rep;

    event Onboarded(address indexed subject, uint256 priorGood, uint256 priorBad, uint256 scoreBps);
    event EvidenceAdded(address indexed subject, uint256 indexed dealId, uint256 good, uint256 bad);
    /// @notice ERC-8004-style feedback on every score change.
    event Feedback(address indexed subject, uint256 indexed dealId, uint256 scoreBps, bytes32 tag);

    error ZeroAddress();
    error OnlyDeals();
    error AlreadyOnboarded(address subject);
    error NotOnboarded(address subject);
    error InvalidPrior();
    error NoEvidence();

    constructor(address deals_) {
        if (deals_ == address(0)) revert ZeroAddress();
        deals = deals_;
    }

    modifier onlyDeals() {
        if (msg.sender != deals) revert OnlyDeals();
        _;
    }

    /// @notice Starting prior, once per address.
    function onboard(address subject, uint256 priorGood, uint256 priorBad) external onlyDeals {
        if (subject == address(0)) revert ZeroAddress();
        if (priorGood == 0 || priorBad == 0) revert InvalidPrior();
        Rep storage rep_ = _rep[subject];
        if (rep_.a != 0 || rep_.b != 0) revert AlreadyOnboarded(subject);
        rep_.a = priorGood.toUint128();
        rep_.b = priorBad.toUint128();
        emit Onboarded(subject, priorGood, priorBad, trust(subject));
    }

    function addEvidence(address subject, uint256 dealId, uint256 good, uint256 bad, bytes32 tag)
        external
        onlyDeals
        returns (uint256 scoreBps)
    {
        if (good == 0 && bad == 0) revert NoEvidence();
        Rep storage rep_ = _rep[subject];
        if (rep_.a == 0 && rep_.b == 0) revert NotOnboarded(subject);
        if (good != 0) rep_.r = (uint256(rep_.r) + good).toUint128();
        if (bad != 0) rep_.s = (uint256(rep_.s) + bad).toUint128();
        scoreBps = trust(subject);
        emit EvidenceAdded(subject, dealId, good, bad);
        emit Feedback(subject, dealId, scoreBps, tag);
    }

    function rep(address subject) external view returns (Rep memory) {
        return _rep[subject];
    }

    function isOnboarded(address subject) public view returns (bool) {
        Rep storage rep_ = _rep[subject];
        return rep_.a != 0 || rep_.b != 0;
    }

    /// @notice Rounded to the nearest bps. 0 if never onboarded.
    function trust(address subject) public view returns (uint256) {
        Rep memory rep_ = _rep[subject];
        uint256 total = uint256(rep_.r) + rep_.s + rep_.a + rep_.b;
        if (total == 0) return 0;
        return _divRound((uint256(rep_.r) + rep_.a) * BPS, total);
    }

    /// @notice Score capped at 90%, or 0 if below 40%.
    function advanceBps(address exporter) public view returns (uint256) {
        uint256 t = trust(exporter);
        if (t < MIN_SCORE_BPS) return 0;
        return t > MAX_ADVANCE_BPS ? MAX_ADVANCE_BPS : t;
    }

    /// @notice Investor yield on the deal, 200-800 bps. Uses raw counters, not the rounded score.
    function riskBps(address importer) public view returns (uint256) {
        Rep memory rep_ = _rep[importer];
        uint256 total = uint256(rep_.r) + rep_.s + rep_.a + rep_.b;
        if (total == 0) return RISK_MIN_BPS + RISK_SPAN_BPS;
        return RISK_MIN_BPS + _divRound(RISK_SPAN_BPS * (uint256(rep_.s) + rep_.b), total);
    }

    function profile(address subject) external view returns (Profile memory p) {
        Rep memory rep_ = _rep[subject];
        p.onboarded = rep_.a != 0 || rep_.b != 0;
        p.r = rep_.r;
        p.s = rep_.s;
        p.a = rep_.a;
        p.b = rep_.b;
        p.trustBps = trust(subject);
        p.advanceBps = advanceBps(subject);
        p.riskBps = riskBps(subject);
    }

    function _divRound(uint256 x, uint256 y) private pure returns (uint256) {
        return (x + y / 2) / y;
    }
}
