# Backend guide: how the agent talks to the verifier and the contract

Simple guide for the teammates building the agent. The smart contracts and the verifier (the x402 API provider)
are **built and tested**. Everything you import (ABIs, addresses, EIP-712 types, enums, the judge rules) is in
`packages/shared`.

## The big picture

```
Exporter claims shipment ──> Claimed event on Whitechain
                                   │
                         Agent sees it, pays 0.30 USDC on Hedera (x402)   ← you build this
                                   │
                         Verifier checks the shipment, SIGNS the result    ← services/verifier (done)
                                   │
                         Agent sends the signed result to the contract     ← you build this
                                   │
                         Contract decides: Verified / Pending / Rejected / Mismatch   (done)
                                   │
                         Investor sees the result in the dashboard, then funds
```

The agent never decides if the exporter lied, and neither does the verifier. The contract decides.

## Start here: the local stack (no Hedera or Whitechain needed)

```bash
cd contracts && forge build
cd ../services/verifier && npm install
npm run local                                   # chain on :8545 + contracts + verifier on :4021
npm run claim -- MSKU0000666 short-weight       # 2nd terminal: a Claimed deal for your agent
```

Keys and addresses are in `services/verifier/local-deployment.json`. Use the `agent` wallet to send
`submitVerification`. Payments are off locally, so `/verify` answers without x402 until you turn it on.
`npm run e2e` shows the whole flow working (it also contains a tiny reference relay: `verifyAndRelay`).

## What the agent does, step by step

1. **Watch** the `Claimed` event on TradeDeals:
   `Claimed(dealId, exporter, declaredKg, claimedStatus, docHash, containerNo, blRef, verifyDeadline)`
2. **Check the state** with `getDeal(dealId)`. Only continue if it is **3 Claimed** or **4 Pending**.
3. **Spending gate** before paying: `payTo` on the allowlist, asset `0.0.429274`, network `hedera:testnet`,
   ≤ 1 USDC per call, ≤ 3 checks per deal, ≤ 10 USDC per day. Anything else → stop and ask a human.
4. **Pay and call** `POST /verify` with `wrapFetchWithPayment` from `@x402/fetch`:
   ```json
   { "dealId": "12", "shipmentRef": { "containerNo": "<from the event>", "blRef": "<from the event>" } }
   ```
   The first answer is `402` with the price. The wrapper pays and retries. Read the Hedera tx ID from the
   `PAYMENT-RESPONSE` header (`transaction`, also accept `transactionId`).
5. **Check before sending**:
   - `signer` in the answer must equal `verifier()` on TradeDeals
   - `simulateContract` the `submitVerification` call
6. **Send** `submitVerification(verification, signature)` from the agent wallet. Turn `observedAt`, `nonce` and
   `expiry` from strings back into `BigInt` first.
7. **Read the result** (also in the answer's `expected.outcome`, but the contract's event is the truth):

| Event | Meaning | What the agent does next |
|---|---|---|
| `Verified` | Claim is true | Done. Investors can fund now |
| `Pending` | Status not reached yet (tracking lag) | **Check again later** (max 3 checks per deal) |
| `Rejected` | Exporter lied | Done. No money moved |
| `Mismatch` | More goods than claimed | Done. No penalty |

8. **Log to HCS**: `{ dealId, hederaTxId, payer, sigHash, whitechainTx }`. `sigHash` is in the verifier's answer,
   and the contract emits the same value in `VerificationSubmitted(dealId, submitter, nonce, sigHash, outcome)`.
   That links the Hedera payment to the Whitechain transaction.

**Pending rule:** keep one paid check for **after `verifyDeadline`**. That is the only way a fake status gets
punished. If nobody checks, the deal just expires later with no penalty.

## What the verifier answers

Full format and all routes: `services/verifier/README.md`. The short version:

| Field | Use |
|---|---|
| `verification` + `signature` | Send these to `submitVerification` |
| `signer` | Must equal `verifier()` on TradeDeals |
| `sigHash` | Put in the HCS audit message |
| `expected.outcome` | What the contract will decide (`Verified` / `Pending` / `Falsified` / `Mismatch`) |
| `evidence` | Weighbridge ticket, carrier status, eBL hash: show it in the dashboard and the HCS log |

**Errors are free** (the payment only settles on `200`): `400` bad body or wrong container, `404` no such deal,
`409` deal not Claimed/Pending, `502` chain unreachable.

## Demo scenarios

Set the scenario for a container **before** the exporter claims (`PUT /demo/scenarios/<containerNo>` with the
`x-demo-token` header): `honest`, `lag`, `short-weight`, `fake-docs`, `over-weight`, `stuck`.
The default is `honest`. Table of what each one does: `services/verifier/README.md`.

## Small jobs anyone can do (optional, free except gas)

| Call | When | Why |
|---|---|---|
| `markDefault(dealId)` | after `dueDate + graceWindow` and the importer hasn't paid | marks the importer as defaulted |
| `expire(dealId)` | verified but nobody funded in time, or stuck in Pending | frees the exporter's credit |

`deadlines(dealId)` gives all the times you need for both.

## Common contract errors

| Error | Cause |
|---|---|
| `InvalidSigner` | Wrong verifier key, wrong chainId, or wrong contract address |
| `StaleObservation` | The answer is older than the claim or the last check. Ask the verifier again |
| `NonceAlreadyUsed` | The same answer was already sent |
| `SignatureExpired` | `expiry` passed (10 minutes). Ask the verifier again |
| `WrongState` | The deal is not Claimed / Pending any more |

## Where things are

| Need | Import from `@trustmebro/shared` |
|---|---|
| Contract ABIs | `tradeDealsAbi`, `trustRegistryAbi`, `erc20Abi` |
| Contract addresses (after deploy) | `deployments` |
| Whitechain chain config for viem | `whitechainTestnet` |
| The contract's decision rule in TypeScript | `judge`, `weightWindow`, `OUTCOME_NAMES` |
| Numbers for states / statuses | `DealState`, `ShipmentStatus`, `Outcome`, `SHIPMENT_STATUS_NAMES` |

USDT has **6 decimals**: 100 USDT = `100_000_000`.
