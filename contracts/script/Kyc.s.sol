// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console2} from "forge-std/Script.sol";

import {TradeDeals} from "../src/TradeDeals.sol";
import {ITradeDeals} from "../src/interfaces/ITradeDeals.sol";

/// @notice KYCs EXPORTER_ADDRESS / IMPORTER_ADDRESS / INVESTOR_ADDRESS from .env (empty ones are skipped).
///   forge script script/Kyc.s.sol --rpc-url whitechain_sepolia --account deployer --broadcast
contract Kyc is Script {
    function run() external {
        TradeDeals deals = TradeDeals(vm.envAddress("TRADEDEALS_ADDRESS"));
        address exporter = _envAddressOr("EXPORTER_ADDRESS");
        address importer = _envAddressOr("IMPORTER_ADDRESS");
        address investor = _envAddressOr("INVESTOR_ADDRESS");

        vm.startBroadcast();
        _kyc(deals, exporter, ITradeDeals.Role.Exporter, "exporter");
        _kyc(deals, importer, ITradeDeals.Role.Importer, "importer");
        _kyc(deals, investor, ITradeDeals.Role.Investor, "investor");
        vm.stopBroadcast();
    }

    function _envAddressOr(string memory name) internal view returns (address) {
        string memory raw = vm.envOr(name, string(""));
        return bytes(raw).length == 0 ? address(0) : vm.parseAddress(raw);
    }

    function _kyc(TradeDeals deals, address account, ITradeDeals.Role role, string memory label) internal {
        if (account == address(0)) return;
        if (deals.kycRole(account) == role) {
            console2.log("already KYC'd  ", label, account);
            return;
        }
        deals.setKyc(account, role);
        console2.log("KYC'd          ", label, account);
    }
}
