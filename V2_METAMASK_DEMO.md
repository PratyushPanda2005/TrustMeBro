# V2 demo with your existing MetaMask

This is a **manually approved MetaMask relay**. Hedera purchasing and service signing stay in the backend; Whitechain sends require your wallet approval. The existing automated relayer is unchanged. No Admin private key or new relayer is needed. Evidence is **DEMO_SIMULATION**, never independently authenticated shipping evidence.

## Trade 3 paid-report recovery: do not purchase again

The first real x402 payment succeeded: `0.0.7162784@1793991560.801698510`, 300000 atomic USDC from `0.0.11331527` to `0.0.11331478`, independently confirmed by Mirror Node. The purchased report correctly failed `observationFresh`: it contained demo observation `1793990883` (681 seconds before purchase start), despite the refreshed file containing `1793991533` (31 seconds before purchase). The merchant had retained an in-memory startup snapshot. The provider now reloads the file when observing; it does not silently restamp observations or relax the 300-second window. Restart the existing merchant once to load this code change; existing report-cache entries intentionally remain unchanged.

The original insufficient-evidence job and merchant cache are preserved. The old report cannot be signed as though it were fresh. A separate demo-only correction can explicitly generate a new simulated observation and signed report against the original confirmed payment, without buying again. It uses the canonical merchant's shared issuance/validation code locally, not a new service. No real-world shipment assertion is made.

Inspect first (public reads only, no signing or file mutation):

```powershell
Set-Location D:\ETHHack\TrustMeBro\Hedera_Agentic_Payments\services\agent
npm.cmd run recover:demo:v2 -- --trade-id=3
```

When ready to create the fresh, 300-second attestation locally, explicitly acknowledge the new simulated observation:

```powershell
$env:V2_DEMO_ACK = 'I_UNDERSTAND_SHIPMENT_EVIDENCE_IS_SIMULATED'
try {
  npm.cmd run recover:demo:v2 -- --trade-id=3 --reissue-demo --ack-new-simulated-observation
} finally {
  Remove-Item Env:V2_DEMO_ACK -ErrorAction SilentlyContinue
}
```

This checks original paid report/cache integrity, exact metadata/deployment binding, current trade state, the dedicated signer role and independent Mirror confirmation again. It accepts only a stale-observation failure in explicitly simulated mode. It generates a new nonce/report hash, checks deployed attestationDigest parity and persists a separate recovery job and PUBLIC payload under `.state/v2/recovery/`. Original files, old observation timestamps and spending reservations remain untouched. It refuses a second reissue if a recovery already exists. It requires no relayer private key and never imports the payment sender or submits a relay/HCS message. It does not change the source fixture file.

Expected result: `state: awaiting_metamask`, `paidAgain: false`, `whitechainSubmitted: false`, `originalJobPreserved: true`. PUBLIC payload: `.state/v2/recovery/metamask/v2-attestation-trade-3.json`. Use this separate file for a later manually approved Remix relay; do not use an older payload. The original report remains insufficient; the replacement explicitly records its lineage and new simulated observation.

After a separately approved future MetaMask relay, reconcile the recovery explicitly:

```powershell
# Later only: use the real approved relay hash. This command itself sends no transaction.
npm.cmd run metamask:v2 -- reconcile --recovery --trade-id=3 --tx-hash=ACTUAL_RELAY_HASH
```

The original job remains a historical insufficient-evidence record; the separate recovery becomes verified only after the matching onchain receipt/event/state checks. Do not delete an expired recovery, reset the paid job, or purchase again. Explicit expired recovery renewal is available below.

### Renew an expired, unsubmitted demo recovery without another payment

The normal reissue command still refuses existing history. First inspect renewal eligibility (no signing, locks, history writes or transactions):

```powershell
Set-Location D:\ETHHack\TrustMeBro\Hedera_Agentic_Payments\services\agent
npm.cmd run recover:demo:v2 -- --trade-id=3 --check-renewal
```

It revalidates the original payment/report, current signer permissions, and every historical recovery's signature, Solidity digest, exact shipment/terms/payment binding, expiry, unused nonce and absence of matching onchain ShipmentChecked events. It requires the trade to remain Created, importer-confirmed and Pending verification. A recorded transaction hash, ambiguous submitted state, unexpired signature, consumed nonce or malformed history stops renewal. No pending-wallet submission is inferred to be safe merely from a missing local hash; prior signatures must be expired and the onchain checks must also pass.

When ready to use a fresh 300-second attestation, explicitly renew:

```powershell
$env:V2_DEMO_ACK = 'I_UNDERSTAND_SHIPMENT_EVIDENCE_IS_SIMULATED'
try {
  npm.cmd run recover:demo:v2 -- --trade-id=3 --reissue-demo --ack-new-simulated-observation --renew-expired
} finally {
  Remove-Item Env:V2_DEMO_ACK -ErrorAction SilentlyContinue
}
```

No merchant restart, new payment or backend relayer key is needed. Version 1 remains unchanged under `.state/v2/recovery/`. The first renewal saves its job and public payload exclusively under `.state/v2/recovery/versions/2/`, with payload `metamask/v2-attestation-trade-3.json`. Later explicit eligible renewals use version 3, 4, etc. The command prints the exact version, path and expiry. It generates a new simulated observation and nonce; it never restamps or overwrites a prior signed report. All versions and the original payment job remain available. Concurrent writers are serialized; incomplete history fails closed for inspection.

Use the new version's JSON in the existing Remix relay script only after reviewing it. For a separately approved future version-2 relay, select that version explicitly when reconciling:

```powershell
npm.cmd run metamask:v2 -- reconcile --recovery --recovery-version=2 --trade-id=3 --tx-hash=ACTUAL_RELAY_HASH
```

`--recovery-version` applies only to export/reconcile with `--recovery`; the backend never sends this Whitechain transaction. Plain `--recovery` still selects version 1, preventing silent selection of a different signed payload.

## Current stopping point: exporter invoice creation (no transaction sent by this tooling)

Fresh public checks confirm that signer `0x76b4B8FFaa84901d5b2aDFB5c6a3592E4e63B1E8` now has VERIFIER_ROLE. The supplied grant transaction `0x4a807b4e14d158a9e5b6be28ff0f1cfe416bb2695c9ece24dd38186d771dd186` succeeded with the matching Finance RoleGranted event. Do not grant again. The prepared invoice still needs creation and importer confirmation. Admin currently has neither EXPORTER_ROLE nor IMPORTER_ROLE.

The preparation command below now also writes `create-demo-invoice.js` and `confirm-demo-agreement.js`. Both start in preflight mode and embed the exact prepared invoice and actual ABI; no manual hash entry or private key is needed. Follow the invoice instructions below. No Hedera payment is authorized.

### Earlier verifier-role procedure (reference only; already completed)

The earlier readiness check found the signer unauthorized. That grant has now been completed manually; the remaining procedure here is retained for reference. Rerun this public-only preparation to refresh current roles, wallet balances, commitments and invoice simulation:

```powershell
Set-Location D:\ETHHack\TrustMeBro\services\verifier
npm.cmd run prepare:metamask
```

Generated public files:

- `.state/v2-demo/metamask/grant-verifier.js`
- `.state/v2-demo/metamask/relay-attestation.js`
- `.state/v2-demo/metamask/readiness.json`

In Remix, select **Browser Extension / MetaMask**. Select Whitechain Sepolia (1874) and Admin `0xB758E119133050305520E2F47362cfDd9E55A325`. Copy `grant-verifier.js` into a Remix JavaScript file. Run it with the default `ACTION = 'preflight'`. This performs reads, simulation and estimation only. Review the destination, calldata, role, signer and fee estimate.

Only when you decide to grant, set these two constants and run again:

```javascript
const ACTION = 'send';
const CONFIRM = 'GRANT VERIFIER 0x76b4B8FFaa84901d5b2aDFB5c6a3592E4e63B1E8';
```

MetaMask then asks for transaction approval. The script waits for two confirmations and checks `hasRole`. Review MetaMask's total fees, including any data fees, before approving. Preserve any submitted hash if execution is interrupted; rerun preflight to check role before considering another grant. No transaction is initiated by the preparation command.

Exact grant: Finance `0x71e3c6aE367A0D8517A0DA7cC480cBa9e954DfC7`, `grantRole(0x0ce23c3e399818cfee81a7ab0880f714e53d7672b08df0fa62f2843416e1ea09, 0x76b4B8FFaa84901d5b2aDFB5c6a3592E4e63B1E8)`; value zero.

## After authorization: create and confirm the existing invoice

The existing `.state/v2-demo/pending-trade.json` and `unsigned-transactions.json` contain the exact draft and create calldata. `prepare:metamask` checks metadata commitments, simulated fixture consistency and performs a read-only `createTrade` simulation from the exporter. It does not create a trade. ID 3 is only a simulation prediction.

The draft uses these existing trade-party wallets, each with its own transaction approval:

1. Exporter `0x4DCdA2a3b4b8c8aC71d3e9224e5a80FBF9a4219C` sends the prepared `createTrade` call to Finance. Inspect the actual successful creation event/receipt for its ID.
2. Importer `0xEd450f58f5287d37Ca9200930F14EbcaFa44CFF4` calls `confirmAgreement(actualId)`. Wait for a successful receipt and read `importerApproved`.
3. Bind that actual ID, with no manually entered hashes:

```powershell
Set-Location D:\ETHHack\TrustMeBro\services\verifier
$tradeId = Read-Host 'Actual confirmed trade ID'
npm.cmd run setup:v2-demo -- "--bind-trade=$tradeId"
npm.cmd run setup:v2-demo -- "--check-trade=$tradeId"
```

Exact Remix procedure:

1. Select **Browser Extension / MetaMask**, Whitechain Sepolia chain **1874**. Select existing Exporter **`0x4DCdA2a3b4b8c8aC71d3e9224e5a80FBF9a4219C`**. Copy `.state/v2-demo/metamask/create-demo-invoice.js` into a Remix JavaScript file and run with default `ACTION='preflight'`. Review the zero-value Finance call, 100 USDT face amount, 1,000 kg, simulated shipment/record and fee estimate. This does not transfer USDT or create a trade.
2. Only after reviewing and choosing to send, set `ACTION='send'` and `CONFIRM='CREATE DEMO INVOICE SIMULATED-TMB-V2-DEMO-001'`. Run again and approve the single `createTrade` transaction in MetaMask. The script waits for two confirmations, validates the mined calldata and matching TradeCreated event, compares all onchain terms, and prints `actualTradeId` plus `creationTransaction`. Save both. If interrupted after submission, set `CREATION_TX_HASH` to the actual creation hash in the creation script and rerun: this is recovery/read-only, even if ACTION was send. Do not retry creation or alter hashes when invoiceUsed is true.
3. Switch MetaMask to existing Importer **`0xEd450f58f5287d37Ca9200930F14EbcaFa44CFF4`**. Copy `.state/v2-demo/metamask/confirm-demo-agreement.js` into Remix. Set only `CREATION_TX_HASH` to the actual creation transaction hash; keep `ACTION='preflight'`. The script derives the ID from that receipt and validates its sender, calldata, event and every invoice term. It never assumes ID 3.
4. Review the printed confirmation preflight. Only when choosing to confirm, set `ACTION='send'` and `CONFIRM` to the exact printed `CONFIRM DEMO TRADE ACTUAL_ID` phrase. Run and approve in MetaMask. The script requires the matching importer AgreementConfirmed event and reads importerApproved=true in Created state. An already-confirmed agreement returns without another transaction request.
5. Run the binding commands above using that actual confirmed ID. Binding verifies exact parties and terms, writes the agent's metadata entry and refreshes the simulated observation. It does not pay or relay. Until confirmation exists, no metadata is bound. Do not start the payment stage yet; it requires separate authorization. Refresh binding shortly before the later demo if needed because evidence freshness is enforced.

Both party wallets currently have their required business roles and WBT. Admin has neither role and is intentionally rejected by these scripts. If the required account is absent from your MetaMask, stop and have its existing wallet owner approve the transaction. Do not export keys or grant new business roles just to bypass this requirement. A role/read-only gas simulation does not establish that you control the account.

Do not use Admin as a substitute exporter/importer. If these existing party wallets cannot approve transactions, that remains a blocker. Their private keys must not be pasted into commands or backend configuration.

The draft is 100 test USDT, 1,000 kg of explicitly simulated cargo, shipment `SIMULATED-TMB-V2-001`, minimum stage InTransit. Its document is a defined simulated carrier record, not a fabricated claim of real evidence. The helper generates invoice/commercial/shipment/document commitments internally. A real invoice would require a stable invoice number and an actual provider-backed document record in addition to the business fields. Changing agreed facts requires a new matching draft; do not patch hashes in isolation. The pending funding expiry is checked by the preparation command.

## Later, only after separate explicit payment approval

Do not run the purchase command during role-grant preparation. Keep `V2_EXECUTE` disabled. The new CLI ignores automated relay keys and processes only the supplied trade ID.

Start the canonical merchant in one terminal after role authorization and metadata binding (binding refreshes the demo observation):

```powershell
Set-Location D:\ETHHack\TrustMeBro\services\verifier
npm.cmd run start:v2
```

In another terminal, inspect an **unpaid** quote:

```powershell
Set-Location D:\ETHHack\TrustMeBro\Hedera_Agentic_Payments\services\agent
$tradeId = Read-Host 'Actual confirmed trade ID'
npm.cmd run metamask:v2 -- quote "--trade-id=$tradeId"
```

Review the printed exact amount, merchant, network, token and spending-policy result. Configured price is currently 300000 atomic USDC = **0.3 test USDC**. No payment is signed by `quote`. Future authorization is limited to the reviewed exact amount and existing merchant/network/token; changed quotes stop before paying.

Only after separately approving that single real Hedera test payment:

```powershell
$env:V2_MANUAL_PAYMENT_ACK = 'I_AUTHORIZE_ONE_HEDERA_X402_TEST'
$env:V2_DEMO_ACK = 'I_UNDERSTAND_SHIPMENT_EVIDENCE_IS_SIMULATED'
# Use the exact atomic amount from the reviewed quote:
try {
  npm.cmd run metamask:v2 -- purchase "--trade-id=$tradeId" --approve-payment=300000
} finally {
  Remove-Item Env:V2_MANUAL_PAYMENT_ACK -ErrorAction SilentlyContinue
  Remove-Item Env:V2_DEMO_ACK -ErrorAction SilentlyContinue
}
```

The existing payer/facilitator/policy/HCS path is reused. A payment reservation prevents duplicate purchases; uncertainty blocks progress. Mirror Node must independently confirm exact token, payer, merchant, amount, time and success. Payment/report/signature are saved before wallet handoff. No Whitechain private key is used. Do not delete uncertain or paid jobs to retry. Insufficient/mismatched evidence never produces an approved relay.

The exported PUBLIC payload is `.state/v2/metamask/v2-attestation-trade-ID.json` in the agent directory. It includes trade/terms/report bindings, Hedera transaction ID, attestation, public service signature and exact zero-value calldata. It contains no private key or raw signed wallet transaction. Saved attestations expire after 300 seconds; complete wallet review promptly. Expiry stops submission/export; it never triggers an automatic repurchase.

## Later: manually approve the Whitechain relay and reconcile

Upload only that PUBLIC JSON into Remix. In `relay-attestation.js`, set `PAYLOAD_FILE` to its Remix path. Keep `ACTION='preflight'` initially. It checks Admin/chain, service role, saved calldata, Solidity digest parity, recovered signature, terms, shipment facts, unused nonce, expiry and an `eth_call` simulation. It shows a confirmation phrase tied to DEMO_SIMULATION, trade ID and report hash.

After reviewing, set `ACTION='send'` and `CONFIRM` to that exact printed phrase. MetaMask must approve the transaction. The script waits for two confirmations, requires the matching Finance `ShipmentChecked` event with `Valid`, reads current state and calls `quote` to establish funding eligibility. A successful receipt by itself is insufficient.

Copy the submitted Whitechain transaction hash and reconcile locally:

```powershell
Set-Location D:\ETHHack\TrustMeBro\Hedera_Agentic_Payments\services\agent
$tradeId = Read-Host 'Actual confirmed trade ID'
$txHash = Read-Host 'MetaMask Whitechain verification transaction hash'
npm.cmd run metamask:v2 -- reconcile "--trade-id=$tradeId" "--tx-hash=$txHash"
```

Reconciliation makes public RPC reads and updates local job state only. It checks chain, Admin sender, Finance destination, exact saved calldata/value, confirmations, event and current verification/funding state. It prints both payment and verification references for the same trade. Pending/nonpassing/reverted results never become verified. To optionally publish the final relay reference to HCS, use `--publish-audit` with the separate single-test acknowledgment; that is a Hedera write and requires explicit approval. Existing payment/report HCS audit remains in the purchasing path.

Automatic key-based relay continues through the existing `start:v2` entry point. Do not enable it for this MetaMask demonstration. The automated diagnostic's missing relayer key is expected; manual mode does not require one.

## Local tests (no live payments or public-chain writes)

```powershell
Set-Location D:\ETHHack\TrustMeBro\services\verifier
npm.cmd run typecheck
npm.cmd test
npm.cmd run test:v2
Set-Location D:\ETHHack\TrustMeBro\Hedera_Agentic_Payments
npm.cmd run test:unit
Set-Location services\agent
npm.cmd run typecheck
```

The EVM integration test uses an isolated in-memory Hardhat chain and mock Hedera settlement, including a local impersonated Admin only in that isolated test. It does not unlock, impersonate or transact against public Whitechain. Live behavior remains untested until your approved demonstration.
