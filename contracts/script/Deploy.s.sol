// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console2} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import {TradeDeals} from "../src/TradeDeals.sol";
import {TrustRegistry} from "../src/TrustRegistry.sol";
import {ITradeDeals} from "../src/interfaces/ITradeDeals.sol";

/// @notice Deploys TrustRegistry + TradeDeals to Whitechain Sepolia (1874).
///   forge script script/Deploy.s.sol --rpc-url whitechain_sepolia --account deployer --broadcast \
///     --verify --verifier blockscout --verifier-url https://explorer.testnet.whitechain.io/api/
/// The registry is bound to TradeDeals' precomputed address, so only TradeDeals can write scores.
contract Deploy is Script {
    uint256 internal constant WHITECHAIN_SEPOLIA = 1874;
    /// @dev Required test USDT. Not the bridged USDT.e (0xaa79...8f46) in the docs token list.
    address internal constant WHITECHAIN_USDT = 0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7;

    function run() external returns (TrustRegistry registry, TradeDeals deals) {
        address usdt = block.chainid == WHITECHAIN_SEPOLIA ? WHITECHAIN_USDT : vm.envAddress("USDT_ADDRESS");
        address verifier = vm.envAddress("VERIFIER_ADDRESS");

        vm.startBroadcast();
        (, address deployer,) = vm.readCallers();

        ITradeDeals.FeeRecipients memory recipients = ITradeDeals.FeeRecipients({
            agentWallet: _envAddressOr("AGENT_WALLET", deployer),
            gasRelayer: _envAddressOr("GAS_RELAYER", deployer),
            reserveFund: _envAddressOr("RESERVE_FUND", deployer),
            platformTreasury: _envAddressOr("PLATFORM_TREASURY", deployer)
        });

        uint64 nonce = vm.getNonce(deployer);
        address predictedDeals = vm.computeCreateAddress(deployer, nonce + 1);
        registry = new TrustRegistry(predictedDeals);
        deals = new TradeDeals(deployer, IERC20(usdt), registry, verifier, recipients);
        require(address(deals) == predictedDeals, "Deploy: TradeDeals address prediction failed");
        vm.stopBroadcast();

        console2.log("chain id        ", block.chainid);
        console2.log("deployer/admin  ", deployer);
        console2.log("USDT            ", usdt, IERC20Metadata(usdt).symbol());
        console2.log("verifier signer ", verifier);
        console2.log("TrustRegistry   ", address(registry));
        console2.log("TradeDeals      ", address(deals));

        if (vm.isContext(VmSafe.ForgeContext.ScriptBroadcast) || vm.isContext(VmSafe.ForgeContext.ScriptResume)) {
            _writeDeployment(deployer, usdt, verifier, recipients, registry, deals);
        } else {
            console2.log("Dry run: deployments file not written (add --broadcast to deploy).");
        }
    }

    /// @dev An empty `NAME=` line in .env counts as unset.
    function _envAddressOr(string memory name, address defaultValue) internal view returns (address) {
        string memory raw = vm.envOr(name, string(""));
        return bytes(raw).length == 0 ? defaultValue : vm.parseAddress(raw);
    }

    function _writeDeployment(
        address deployer,
        address usdt,
        address verifier,
        ITradeDeals.FeeRecipients memory r,
        TrustRegistry registry,
        TradeDeals deals
    ) internal {
        string memory key = "deployment";
        vm.serializeUint(key, "chainId", block.chainid);
        vm.serializeUint(key, "deployedAtBlock", block.number);
        vm.serializeAddress(key, "admin", deployer);
        vm.serializeAddress(key, "usdt", usdt);
        vm.serializeAddress(key, "verifier", verifier);
        vm.serializeAddress(key, "agentWallet", r.agentWallet);
        vm.serializeAddress(key, "gasRelayer", r.gasRelayer);
        vm.serializeAddress(key, "reserveFund", r.reserveFund);
        vm.serializeAddress(key, "platformTreasury", r.platformTreasury);
        vm.serializeAddress(key, "trustRegistry", address(registry));
        string memory json = vm.serializeAddress(key, "tradeDeals", address(deals));
        string memory path = string.concat("./deployments/", vm.toString(block.chainid), ".json");
        vm.writeJson(json, path);
        console2.log("Wrote", path);
    }
}
