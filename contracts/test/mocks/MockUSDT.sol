// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Test-only 6-decimal USDT.
contract MockUSDT is ERC20 {
    constructor() ERC20("Tether USD", "USDT") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @dev Takes 1% on every transfer, to test that fee-on-transfer tokens are rejected.
contract FeeOnTransferUSDT is ERC20 {
    constructor() ERC20("Taxed USD", "TAX") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from == address(0) || to == address(0)) {
            super._update(from, to, value);
        } else {
            uint256 cut = value / 100;
            super._update(from, address(0xdead), cut);
            super._update(from, to, value - cut);
        }
    }
}
