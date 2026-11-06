> For the current existing-MetaMask demo, follow [V2_METAMASK_DEMO.md](V2_METAMASK_DEMO.md). Its separate manual relay mode requires no backend relayer key. The key-based automated workflow below remains available; do not enable it for this demo.

# Hedera x402 → Whitechain V2 backend

No frontend, financial model or Solidity changes. The root `services/verifier` is the canonical merchant. Normal `start` commands select V2; old tooling remains explicitly available under `start:legacy`.

## Startup diagnosis and configuration loading

Read-only commands work without credentials and override any live-execution environment setting:

```powershell
Set-Location D:\ETHHack\TrustMeBro\services\verifier
npm.cmd run diagnose:v2

Set-Location D:\ETHHack\TrustMeBro\Hedera_Agentic_Payments\services\agent
npm.cmd run diagnose:v2
```

They report loaded file paths, missing variable **names only**, public chain/domain/companion bindings and the configured signer's public address/roles. Agent diagnostics inspect existing job counts, blocked/uncertain states and lock presence without acquiring, deleting, resetting or replaying them. They do not import a provider module, construct a payer, flush HCS, sign or broadcast.

Initial startup diagnosis, before demo configuration preparation: neither service had a `.env`, the Hedera root `.env` was absent, and no required variables were inherited. The original verifier failed first on `SERVICE_SIGNER_PRIVATE_KEY`; the original agent failed first on `VERIFIER_ADDRESS`. Generic error handlers hid these failures. See [V2_TESTNET_DEMO.md](V2_TESTNET_DEMO.md) for current local files, remaining credentials/approvals and the exact first-demo procedure.

Configuration precedence is shell → package `.env` → Hedera workspace `.env` fallback (agent only). Set `V2_ENV_FILE` to explicitly select a different file instead of either default. File-defined metadata/provider/fixture paths resolve relative to their defining file. Relative `V2_STATE_DIR` and `V2_REPORT_DIR` deliberately retain package-relative semantics so an existing ledger/report directory is not silently relocated.

Each package now has a `v2.env.example` with empty credential fields. Copy it to `.env` only if no `.env` already exists; otherwise merge the named fields manually. Configure an existing dedicated service key privately, its matching public agent address and merchant account. Never copy the Admin key. Role authorization still requires a later reviewed Admin action and is not performed by diagnostics.

Normal verifier startup emits codes such as `CONFIG_MISSING`, `CONFIG_INVALID`, `RPC_UNREACHABLE`, `CHAIN_MISMATCH`, `ADMIN_SIGNER_FORBIDDEN`, `VERIFIER_ROLE_MISSING` or `PORT_IN_USE`, with safe corrective actions. Raw SDK errors and configuration values are not dumped. Irrelevant legacy `TRADEDEALS_ADDRESS`/scenario settings no longer invalidate V2 configuration.

Read-only agent discovery no longer requires a signer grant, metadata, payer, relayer or merchant credentials. `--read-only` explicitly overrides the live gate:

```powershell
npm.cmd run start:v2 -- --read-only --once
```

Without `WHITECHAIN_FROM_BLOCK`, read-only discovery scans from zero; set the actual deployment block for efficient log queries. Read-only discovery completes one scan. Live execution retains its polling loop and full configuration/role checks before locking state or initializing audit/payer infrastructure.

## What is implemented

1. The agent polls confirmed `AgreementConfirmed` logs, deduplicates trade IDs and reads `getDeal`. Exporter creation also emits this event, so `importerApproved` is authoritative.
2. Original shipment/record metadata is checked against immutable commitments. Missing or incompatible preimages never trigger a paid request.
3. A job is keyed by chain, Finance address, trade ID and terms hash. A filesystem lock serializes purchases/nonce preparation for the entire V2 ledger. Use one shared local state directory; this is a single-host worker, not a distributed queue.
4. Existing `policy.ts`, `payer.ts`, x402 SDK/facilitator and audit code execute the purchase. Approved spend is conservatively reserved before the paid request leaves the process.
5. The root merchant independently obtains evidence through a trusted provider module. It returns Insufficient Evidence without a signature when required facts are unavailable. A completed paid report can legitimately be insufficient; payment is not proof of shipment and there is no automatic refund.
6. A passing report is signed by a dedicated `VERIFIER_ROLE` service account, after comparing the exact EIP-712 digest with `attestationDigest` onchain. Admin accounts are rejected as operational service signers and relayers.
7. The agent checks the persisted response, evidence age, request/report commitments, signer role, signature, digest and nonce. It confirms the exact Hedera USDC transfer through the public testnet Mirror Node.
8. The relayer simulates `verifyAttestation`, signs a transaction and persists its raw bytes/hash **before broadcast**. It never uses `verifyManual`.
9. A successful receipt is insufficient: the adapter checks the Finance-address `ShipmentChecked` event, report hash, `TRUSTED_SERVICE_ATTESTATION` mode, result `Valid`, current state and `quote()` funding eligibility. Two block confirmations are required.

The contract retains manual Admin/verifier powers; this integration does not remove them. No financial actions are performed by this agent.

## Install and run local tests (PowerShell)

```powershell
Set-Location D:\ETHHack\TrustMeBro\packages\shared
npm.cmd ci --ignore-scripts

Set-Location D:\ETHHack\TrustMeBro\services\verifier
npm.cmd ci --ignore-scripts
npm.cmd run test:v2
npm.cmd test
npm.cmd run typecheck

Set-Location D:\ETHHack\TrustMeBro\Hedera_Agentic_Payments
npm.cmd exec --yes --package=pnpm@10.7.0 -- pnpm install --frozen-lockfile --ignore-scripts
Set-Location services\agent
$env:V2_PACKAGE_PATH = 'D:\TrustMeBroo\packages\contracts-v2'
npm.cmd run test:v2
npm.cmd test
npm.cmd run typecheck
```

The V2 test runner includes a real in-memory EVM execution of the supplied compiled V2 artifacts. It imports that package's installed Hardhat/ethers, sets the **local** chain ID to 1874, installs its existing MockUSDT bytecode locally at the sponsor address and deploys V2 into memory. It does not compile or modify that package. The production V2 adapter discovers the agreement, signs/relays locally and checks the actual event/state/quote. Hedera purchasing/settlement are injected mocks. This is **not** a real Hedera payment test or public-chain deployment.

The same suite covers missing evidence, payment uncertainty, wrong signer/signature/trade/terms, stale reports, duplicate jobs/concurrent workers, relay failure and receipt recovery. Real provider credentials and live approval are deliberately unnecessary for tests.

Read-only deployed-domain/digest check:

```powershell
Set-Location D:\ETHHack\TrustMeBro\services\verifier
npm.cmd run check:v2
```

This command reads public data only. It does not load `.env`, sign, pay or relay.

## Dedicated signer setup — later Admin action

Reuse the teammate's existing test EVM verifier key when available and compatible. The local setup helper maps it to the root verifier and derives its public address without printing the key. No replacement key/account is created. Never copy the Admin key into any backend environment.

The Admin must later authorize this **public address** against Finance:

```text
Finance: 0x71e3c6aE367A0D8517A0DA7cC480cBa9e954DfC7
role = Finance.VERIFIER_ROLE()
Finance.grantRole(role, SERVICE_SIGNER_ADDRESS)
Confirm Finance.hasRole(role, SERVICE_SIGNER_ADDRESS) == true
Confirm Finance.hasRole(0x00…00, SERVICE_SIGNER_ADDRESS) == false
```

No role-grant script is executed or submitted by this implementation. Use a separate non-Admin relayer EOA, funded with WBT. Only its key belongs in the agent. The agent receives the service signer's public address, never its key.

## Merchant configuration

Create a gitignored `services/verifier/.env` using the existing example and these V2 fields:

```dotenv
SERVICE_SIGNER_PRIVATE_KEY=DEDICATED_SERVICE_KEY_ONLY
RPC_URL=https://rpc.testnet.whitechain.io
PORT=4021
PAYMENTS=on
VERIFIER_PAYTO=YOUR_HEDERA_MERCHANT_ACCOUNT
HEDERA_NETWORK=hedera:testnet
HEDERA_USDC=0.0.429274
FACILITATOR_URL=https://api.testnet.blocky402.com
PRICE=$0.30
EVIDENCE_MODE=real
SHIPPING_PROVIDER_MODULE=D:/absolute/path/to/trusted-provider.mjs
V2_REPORT_DIR=.state/v2-reports
```

`VERIFIER_SIGNER_PK` and the old `TRADEDEALS_ADDRESS` do not select the V2 signer/contract. V2 always uses the approved Finance address. The runtime refuses `PAYMENTS=off`; automated tests inject a local mocked transport instead.

Run:

```powershell
Set-Location D:\ETHHack\TrustMeBro\services\verifier
npm.cmd run start:v2
```

It binds localhost. Put a trusted HTTPS proxy/tunnel in front if the agent runs on another host. Health returns the evidence mode and dedicated signer's authorization status. Starting the merchant does not itself pay or broadcast.

## Real provider boundary

No authenticated shipping provider is configured or claimed working. Omit `SHIPPING_PROVIDER_MODULE` to receive Insufficient Evidence. The configured module must be trusted server code and export:

```javascript
export default {
  mode: 'real',
  async observe(request) {
    // Authenticate/query actual upstream sources using server-only credentials.
    // Use request metadata for lookup, not as independent observed facts.
    // Return undefined if any mandatory fact cannot be established.
    return undefined;
  }
};
```

The returned `Evidence` type is defined in `packages/shared/src/v2.ts`. Requirements:

- Explicit real/demo label, original provider provenance in `raw` and a recent source observation time (maximum 300 seconds).
- Actual shipment event, not planned/estimated status. Map its business meaning explicitly to V2 Dispatched=1, InTransit=2 or Delivered=3; do not reuse old status codes.
- Two distinct authoritative source identities, not two URLs for the same source. The adapter must establish their real independence; unequal names alone cannot prove it.
- Authenticated shipment identity, document authenticity and exact integer quantity in the agreed unit. `documentHash` uses the same defined record encoding as the agreement.
- `identityAuthenticated`, `documentAuthenticated`, `quantityAuthenticated` and `actual` are conclusions made by your trusted adapter after validation, **not flags accepted directly from exporter input or an untrusted API response**.

The service checks these facts against the agreement. Cryptography cannot establish that a provider told the truth. No provider capability is fabricated here.

For simulations, `configuredProvider('demo', undefined, fixturePath)` reads a separately authored `Evidence` JSON fixture with `mode: 'demo'`. It never derives observations from the claim. A separately approved Whitechain testnet demonstration requires both the normal live gate and `V2_DEMO_ACK=I_UNDERSTAND_SHIPMENT_EVIDENCE_IS_SIMULATED`. Without both, no demo payment/relay is executed. See the testnet demo runbook; simulation is never described as authenticated shipping evidence.

## Business-input helper and commitment preimages

Import `prepareTrade` from `@trustmebro/shared/v2`. It accepts exporter/importer addresses, decimal USDT amount, description, shipment reference, positive integer quantity and unit. It also requires:

- A stable exporter invoice number. The minimum business inputs alone cannot identify whether two entries are the same real-world invoice.
- A defined source-backed shipment record: issuer, record ID, shipment reference, quantity, unit and goods description. A made-up nonzero hash is not acceptable.

It returns `{ok:false, missing:[...]}` if invoice identity/record is absent. Otherwise it returns `createTrade` arguments, canonical commitments and metadata. Defaults: minimum stage Dispatched and agreement/funding expiry seven days. The financing term remains the contract's fixed 60 days.

Preparation commits the supplied record; **it does not authenticate it**. The service must authenticate it independently. Preserve the helper's exact returned metadata in the operator-controlled metadata file keyed by the actual `TradeCreated.id`:

```json
{
  "3": {
    "shipmentReference": "ACTUAL_REFERENCE",
    "unit": "kg",
    "record": {"issuer":"ACTUAL_ISSUER","recordId":"ACTUAL_ID","shipmentReference":"ACTUAL_REFERENCE","quantity":"1000","unit":"kg","goodsDescription":"ACTUAL_DESCRIPTION"},
    "commercial": {"v":1,"goodsDescription":"ACTUAL_DESCRIPTION","quantity":"1000","unit":"kg","recordIssuer":"ACTUAL_ISSUER","recordId":"ACTUAL_ID"}
  }
}
```

This is a shape example, not actual shipping evidence. Do not use its values to approve a shipment.

Existing lab-created trades used different text/file hash encodings. Their terms cannot be edited. This adapter deliberately refuses incompatible preimages; do not replace them with helper-generated hashes. Such trades need their original precisely defined record/commitment encoding before a provider adapter can authenticate them. Existing settled trades are not candidates for verification.

## Agent configuration and safe discovery

Set these nonsecret values and keep credentials in your normal gitignored Hedera environment:

```dotenv
WHITECHAIN_RPC=https://rpc.testnet.whitechain.io
WHITECHAIN_FROM_BLOCK=ACTUAL_FINANCE_DEPLOYMENT_BLOCK
VERIFIER_ADDRESS=DEDICATED_SERVICE_PUBLIC_ADDRESS
VERIFIER_URL=http://localhost:4021
V2_METADATA_FILE=D:/absolute/path/to/trade-metadata.json
V2_STATE_DIR=.state/v2
V2_POLL_MS=15000
EVIDENCE_MODE=real
VERIFIER_PAYTO=YOUR_HEDERA_MERCHANT_ACCOUNT
AGENT_HEDERA_ACCOUNT_ID=YOUR_HEDERA_PAYER_ACCOUNT
```

Existing `POLICY_*`, `HEDERA_USDC_TOKEN_ID`, `AUDIT_TOPIC_ID`, `AUDIT_OPERATOR_ID`, `AUDIT_OPERATOR_KEY` and `AUDIT_SINK` retain their meanings. Missing HCS credentials produce the existing console-only sink; do not describe that as a published HCS trail. The ledger path for V2 is independent of old-contract demo state.

Safe discovery (no payer key required; no payment/relay):

```powershell
Set-Location D:\ETHHack\TrustMeBro\Hedera_Agentic_Payments\services\agent
npm.cmd run start:v2 -- --once
```

Use `--read-only --once` to explicitly force a single safe discovery pass even if a live execution setting exists in the environment.

Live execution additionally requires `AGENT_HEDERA_PRIVATE_KEY`, `RELAYER_PRIVATE_KEY` and the explicit gate `V2_EXECUTE=I_AUTHORIZE_LIVE_HEDERA_PAYMENTS_AND_WHITECHAIN_RELAYS`. **Do not set that gate until the user explicitly approves live transactions. It has not been set or executed in this implementation.**

## Recovery and limits

- Job/report JSON files use atomic replacement and fsync before external actions. Keep the state directories persistent and private; reports contain commercial data and raw signed relays must not be published before intended broadcast.
- Locks cover the shared ledger and nonce preparation. A dead worker PID can be recovered; an unreadable lock or crash while holding the tiny recovery gate fails closed. Stop all workers and confirm no live owner before manually recovering an orphan gate. Do not run different state directories against the same payer/relayer concurrently.
- A saved paid response can be recovered without repurchasing. Mirror indexing delay is `payment_unknown`; subsequent runs retry only the read-only confirmation if a successful settlement header and response were saved.
- Failed/absent settlement acknowledgement, lost response, or ambiguous transport without a receipt stays blocked for operator reconciliation. Never delete the job to force another purchase. No automatic refund or unsupported payment-status claim is made.
- A prepared/submitted raw transaction is checked by its saved hash and only the same bytes may be rebroadcast. If it has expired, reverted or conflicts with an externally consumed nonce, investigate rather than re-signing/paying automatically.
- Validity is short (300 seconds). Expired signed reports and insufficient evidence do not trigger another automatic paid attempt. This minimal integration uses one purchase per immutable job; a later paid recheck requires an explicit reviewed retry policy.
- Onchain signer revocation does not invalidate an already-accepted V2 verification; that is an existing contract limitation. No Solidity changes were made.

## Validation status

- Agent: **87/87** local regression tests passed, including read-only startup safety cases.
- Root verifier: **30/30** existing tests and **13/13** V2/startup tests passed.
- Type checks passed for the agent, root verifier and root shared package.
- Frozen backend lockfile installation passed using cached dependencies.
- Public read-only check against the deployed Finance contract passed for its domain and `attestationDigest` parity.
- Local EVM used the production V2 adapter and supplied compiled Solidity bytecode; its signature was accepted, verification became Valid, `quote()` succeeded and signature replay reverted.

No new real Hedera payment, role grant, Whitechain relay or production verification was executed. Authenticated provider access and a newly authorized dedicated signer/relayer remain operational setup dependencies.

Startup follow-up: both `diagnose:v2` commands passed their public chain-health checks without credentials. RPC chain 1874, Finance domain and token/companion bindings match the approved deployment. Admin holds Verifier role; no dedicated service key/address is configured in the inspected environment. The agent has zero saved jobs and zero locks; no existing job, ledger, lock or report was deleted, reset or replayed. New tests verify package/shell/workspace precedence, state-path preservation, redacted errors and read-only commands overriding a live execution setting.
