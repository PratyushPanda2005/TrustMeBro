> For the current existing-MetaMask demo, follow [V2_METAMASK_DEMO.md](V2_METAMASK_DEMO.md). Its separate manual relay mode requires no backend relayer key. The key-based automated workflow below remains available; do not enable it for this demo.

# TrustMeBro: first Hedera-to-Whitechain testnet demo

Current progress: the existing service signer is now authorized by the manually approved grant `0x4a807b4e14d158a9e5b6be28ff0f1cfe416bb2695c9ece24dd38186d771dd186`. Fresh read-only checks confirm the role. The next transaction is creation by the prepared Exporter wallet, followed by confirmation by the prepared Importer wallet; Admin has neither business role. Use the generated preflight scripts and exact steps in [V2_METAMASK_DEMO.md](V2_METAMASK_DEMO.md). Historical readiness snapshots below describe the earlier setup. No new invoice ID has been confirmed or bound, and no Hedera payment is authorized.

This runbook uses the existing Hedera accounts and deployed V2 contracts. No account/key creation or contract deployment is needed. **Shipment evidence is a simulated hackathon fixture, not authenticated shipping data.** A future run may make real testnet payments/transactions only after explicit approval.

## Current local setup

Prepared, gitignored files:

- `services/verifier/.env`: canonical merchant, existing payTo, testnet USDC/facilitator, `EVIDENCE_MODE=demo`.
- `Hedera_Agentic_Payments/services/agent/.env`: existing payer/HCS settings, signer public address, deployment block `12365020`, demo mode, both execution gates blank.
- `services/verifier/.state/v2-demo/pending-trade.json`: explicit simulated invoice/record and exact V2 terms; not an onchain trade.
- `services/verifier/.state/v2-demo/shipment-evidence.demo.json`: explicitly simulated terminal/carrier evidence.
- `services/verifier/.state/v2-demo/unsigned-transactions.json`: exact unsigned grant/create calldata and confirmation instructions. Nothing was signed or broadcast.
- `Hedera_Agentic_Payments/services/agent/.state/v2/trade-metadata.json`: currently `{}`. No eligible confirmed trade exists to bind.

The supplied teammate credential file has now been imported locally. The legacy test verifier key, Hedera payer credential and HCS operator credential are mapped into the gitignored service files; secret values were not logged or added to tracked files. `RELAYER_PRIVATE_KEY` in the supplied file is an example placeholder, so it is deliberately left unset. Setup succeeds with a safe notice instead of passing that placeholder to EVM key derivation. Live execution remains disabled. Signer authorization, a funded relayer and a matching new confirmed trade are still required.

Verified public accounts:

| Purpose | Existing identity |
|---|---|
| Hedera payer | `0.0.11331527` |
| Hedera merchant | `0.0.11331478` |
| HCS operator | `0.0.11331562` |
| HCS topic | `0.0.11336190` |
| HTS USDC, six decimals | `0.0.429274` |
| Facilitator | `https://api.testnet.blocky402.com` |
| Recorded test EVM signer | `0x76b4B8FFaa84901d5b2aDFB5c6a3592E4e63B1E8` |

Read-only checks found payer 25.3 USDC, merchant 54.7 USDC, active accounts/topic and facilitator Hedera-testnet support. The EVM signer address was re-derived from the supplied verifier key and matches the manifest. It lacks `VERIFIER_ROLE` and has no Admin role. No relayer key/address is configured. Mirror Node reads confirm the supplied payer, merchant and HCS credentials match their existing public account keys. Trades 1 and 2 were settled at preparation; next ID 3 was a prediction, not a reservation. Both trade-party wallets retained their business roles and WBT. The prepared unsigned `createTrade` passed an `eth_call` simulation without changing chain state.

## 1. Import the existing teammate credentials privately

Provide the file's local path, not its contents. The setup helper accepts that path and never prints secret values:

```powershell
Set-Location D:\ETHHack\TrustMeBro\services\verifier
npm.cmd run setup:v2-demo -- "--credentials=D:\ETHHack\teammate.env"
```

It maps:

| Source name | V2 destination |
|---|---|
| `VERIFIER_EVM_PRIVATE_KEY` (or `VERIFIER_SIGNER_PK`) | Merchant `SERVICE_SIGNER_PRIVATE_KEY` |
| Public address derived from that key | Merchant/agent `VERIFIER_ADDRESS` |
| `AGENT_HEDERA_ACCOUNT_ID`, `AGENT_HEDERA_PRIVATE_KEY` | Existing agent payer |
| `VERIFIER_PAYTO` | Merchant recipient and agent allowlist |
| `HEDERA_USDC_TOKEN_ID` | Agent token and merchant `HEDERA_USDC` |
| `FACILITATOR_URL`, `VERIFY_PRICE`/`PRICE` | Existing facilitator and merchant price |
| `AUDIT_OPERATOR_ID`, `AUDIT_OPERATOR_KEY`, `AUDIT_TOPIC_ID`, `AUDIT_SINK` | Existing HCS audit |
| `RELAYER_PRIVATE_KEY` | Existing non-Admin EVM relayer, if supplied |
| `POLICY_*` | Existing agent spend policy |

The existing EVM key can sign the V2 EIP-712 format; old V1 signatures cannot be reused. The runtime uses the exact V2 domain/types and validates contract digest parity. The helper derives only a public address for reporting, rejects Admin accounts, reads role/balance and leaves execution gates disabled. It does not sign, grant roles or fund accounts. It does not copy the service signer key into the agent. Legacy `TRADE_DEALS_ADDRESS` and adapter settings are intentionally ignored in favor of the fixed V2 deployment and block 12365020.

Setup diagnostics now distinguish optional example credentials (`OPTIONAL_CREDENTIAL_PLACEHOLDER`), malformed EVM keys (`EVM_KEY_FORMAT_INVALID`), invalid scalars (`EVM_KEY_SCALAR_INVALID`), invalid Hedera setting names (`HEDERA_CONFIG_INVALID`), RPC failures and local-file/commitment failures. No diagnostic dumps raw key values or SDK errors. A placeholder source relayer never overwrites an existing valid local relayer credential.

If no `RELAYER_PRIVATE_KEY` is available, obtain access to an existing team test EOA and check/fund its public address with WBT. Do not invent a key, use the Admin key or silently reuse a Hedera private key as a relayer. The current lack of a relayer is a blocker.

## 2. Review and approve the missing verifier grant

First require the helper output `signerDerivedFromAvailableKey: true`. If the address differs from the manifest, use the newly generated unsigned instructions for the derived address.

For the recorded address, the exact Admin transaction is:

```text
Chain ID: 1874
From: 0xB758E119133050305520E2F47362cfDd9E55A325
To: 0x71e3c6aE367A0D8517A0DA7cC480cBa9e954DfC7
Value: 0
Method: grantRole(bytes32,address)
Role: 0x0ce23c3e399818cfee81a7ab0880f714e53d7672b08df0fa62f2843416e1ea09
Account: 0x76b4B8FFaa84901d5b2aDFB5c6a3592E4e63B1E8
Data: 0x2f2ff15d0ce23c3e399818cfee81a7ab0880f714e53d7672b08df0fa62f2843416e1ea0900000000000000000000000076b4b8ffaa84901d5b2adfb5c6a3592e4e63b1e8
```

Submit only through the Admin-controlled wallet after human review. Skip if `hasRole` is already true. This document/helper does not broadcast it. Rerun both diagnostic commands to confirm authorization.

## 3. Create and importer-confirm the prepared demo invoice

No suitable trade currently exists. Review `pending-trade.json`: 100 test USDT face value, 1,000 kg, stage InTransit, and text/reference/issuer clearly labeled SIMULATED. Review its expiry before approving.

1. Existing registered exporter `0x4DCdA2a3b4b8c8aC71d3e9224e5a80FBF9a4219C` approves the unsigned `createTrade` transaction in `unsigned-transactions.json` through its own wallet.
2. Read the **actual** `TradeCreated.id` from the successful receipt. Do not assume it is 3.
3. Existing importer `0xEd450f58f5287d37Ca9200930F14EbcaFa44CFF4` approves `confirmAgreement(actualId)` on Finance through its own wallet.

No private keys for these wallets are requested or copied into the backend. These creation/confirmation transactions have not been submitted. If either wallet no longer has its business role or sufficient WBT, that must be resolved by its owner/Admin before proceeding.

Bind and validate only after those two confirmed transactions (replace 3 with the actual ID):

```powershell
Set-Location D:\ETHHack\TrustMeBro\services\verifier
npm.cmd run setup:v2-demo -- --bind-trade=3
```

This performs public reads, compares parties and **all exact prepared terms/commitments**, writes the metadata entry for that actual ID, and refreshes only the simulated observation timestamp. It neither creates a trade nor changes jobs. Run it before starting the merchant; start the approved demonstration within 300 seconds so evidence is fresh. It refuses settled, unconfirmed or mismatched trades.

## 4. Read-only readiness checks

```powershell
Set-Location D:\ETHHack\TrustMeBro\services\verifier
npm.cmd run diagnose:v2
npm.cmd run check:v2

Set-Location D:\ETHHack\TrustMeBro\Hedera_Agentic_Payments\services\agent
npm.cmd run diagnose:v2
npm.cmd run start:v2 -- --read-only --once
```

Before approval, require the dedicated signer role, funded matching relayer, existing Hedera credentials, correct merchant/token/price, HCS operator credentials and matching importer-confirmed metadata. No existing blocked or uncertain job should be deleted to obtain another paid attempt.

## 5. One real payment and one real verification — AFTER explicit approval only

No commands in this section have been executed. They spend testnet funds and submit a Whitechain transaction; do not run them until the user approves that exact demonstration.

Merchant terminal, after binding/refreshing the fixture:

```powershell
Set-Location D:\ETHHack\TrustMeBro\services\verifier
npm.cmd run start:v2
```

Agent terminal, only after explicit approval:

```powershell
Set-Location D:\ETHHack\TrustMeBro\Hedera_Agentic_Payments\services\agent
$env:V2_DEMO_ACK = 'I_UNDERSTAND_SHIPMENT_EVIDENCE_IS_SIMULATED'
$env:V2_EXECUTE = 'I_AUTHORIZE_LIVE_HEDERA_PAYMENTS_AND_WHITECHAIN_RELAYS'
npm.cmd run start:v2 -- --once
Remove-Item Env:V2_EXECUTE, Env:V2_DEMO_ACK -ErrorAction SilentlyContinue
```

The separate demo acknowledgment is required because this is **real testnet payment/relay with simulated evidence**. Real mode still requires authenticated provider evidence. No simulation is labeled real-world verification.

The agent buys once, corroborates settlement using Mirror Node, validates the V2 report/signature, and submits `verifyAttestation`. The existing HCS audit also submits consensus messages using its operator's HBAR; include those audit writes in the live demonstration approval. A receipt may initially be pending two confirmations; that is not a fake success. Do not buy again. The saved job retains the payment transaction, report hash and signed relay hash.

Read-only result check after confirmation:

```powershell
Set-Location D:\ETHHack\TrustMeBro\services\verifier
npm.cmd run setup:v2-demo -- --check-trade=3
```

It reports the same job's public Hedera transaction, Whitechain transaction, report hash and evidence mode. For an unfunded invoice, `verification=1` plus successful `quote()` establishes financing eligibility. It does not fund the trade. A later approved agent run reconciles a saved submitted relay without purchasing again.

## Local tests

```powershell
Set-Location D:\ETHHack\TrustMeBro\services\verifier
npm.cmd test
npm.cmd run test:v2
npm.cmd run typecheck

Set-Location D:\ETHHack\TrustMeBro\Hedera_Agentic_Payments
npm.cmd run test:unit
Set-Location services\agent
npm.cmd run typecheck
```

These use simulated responses/in-memory EVM execution, not real Hedera payments. No key generation, role grant, live relay, frontend change or Solidity deployment is part of setup or tests.

Configuration-import follow-up: the supplied credential file was parsed successfully and setup completed. The root verifier's 30 existing and 19 V2/setup-validation tests passed; type checking passed. Read-only diagnostics confirm a configured service signer with missing Verifier role, an unset relayer and zero bound trade-metadata entries. No job, payment or signed relay was created by setup or diagnostics. The supplied file was read only; credentials remain in ignored local configuration. Remaining blockers are signer authorization, an existing funded relayer and a matching importer-confirmed trade.
