// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @notice Money maths for a deal (plan §6). Amounts in token units, rates in bps.
library DealMath {
    uint256 internal constant BPS = 10_000;
    uint256 internal constant FEE_BPS = 100; // 1% of the advance
    uint256 internal constant RESERVE_BPS = 2_000; // 20% of the fee left after agent + gas

    struct FeeConfig {
        uint256 minFee;
        uint256 agentFee;
        uint256 gasFee;
    }

    struct Quote {
        uint256 advanceBps; // 0 = exporter blocked
        uint256 advance; // investor pays
        uint256 fee;
        uint256 agentFee;
        uint256 gasFee;
        uint256 reserveFee;
        uint256 platformFee;
        uint256 exporterNet; // advance - fee
        uint256 yieldBps;
        uint256 yieldAmount;
        uint256 investorDue; // advance + yield
    }

    /// @dev Assumes cfg.minFee >= cfg.agentFee + cfg.gasFee.
    function quote(uint256 amount, uint256 advanceBps, uint256 yieldBps, FeeConfig memory cfg)
        internal
        pure
        returns (Quote memory q)
    {
        q.advanceBps = advanceBps;
        q.yieldBps = yieldBps;
        q.advance = amount * advanceBps / BPS;

        uint256 fee = q.advance * FEE_BPS / BPS;
        if (fee < cfg.minFee) fee = cfg.minFee;
        q.fee = fee;

        q.agentFee = cfg.agentFee;
        q.gasFee = cfg.gasFee;
        uint256 rest = fee - cfg.agentFee - cfg.gasFee;
        q.reserveFee = rest * RESERVE_BPS / BPS;
        q.platformFee = rest - q.reserveFee;

        q.exporterNet = q.advance > fee ? q.advance - fee : 0;
        q.yieldAmount = q.advance * yieldBps / BPS;
        q.investorDue = q.advance + q.yieldAmount;
    }

    /// @notice Investor first, exporter the rest.
    function waterfall(uint256 payment, uint256 investorOwed)
        internal
        pure
        returns (uint256 toInvestor, uint256 toExporter)
    {
        toInvestor = payment < investorOwed ? payment : investorOwed;
        toExporter = payment - toInvestor;
    }

    /// @notice Pro rata to how far into the grace window the payment landed.
    function latePenalty(uint256 lateBy, uint256 grace, uint256 maxPenalty) internal pure returns (uint256) {
        if (lateBy >= grace) return maxPenalty;
        return maxPenalty * lateBy / grace;
    }
}
