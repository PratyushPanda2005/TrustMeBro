# TrustMeBro verifier (the x402 API provider)

The paid API the AI agent buys shipment facts from. The agent pays 0.30 USDC on Hedera (x402), and the
verifier answers with what the "real world" saw, signed with EIP-712 so TradeDeals on Whitechain can check it.

The verifier never decides if the exporter lied. It only reports facts. The contract compares them with the claim.

## What each file does

| File | Job |
|---|---|
| `src/index.ts` | Starts the server. Refuses to start if the signing key isn't the one TradeDeals trusts |
| `src/server.ts` | The HTTP routes: `POST /verify`, `GET /health`, `/demo/scenarios` |
| `src/x402.ts` | The x402 payment wall for `POST /verify` (Hedera, USDC, Blocky402, Bazaar discovery) |
| `src/scenarios.ts` | The simulated weighbridge / carrier tracking / eBL data, one scenario per container |
| `src/signer.ts` | Signs the answer (EIP-712, using the shared types) |
| `src/chain.ts` | Reads the exporter's claim from TradeDeals |
| `src/config.ts` | Reads and checks `.env` |
| `scripts/local.ts` | `npm run local`: local chain + contracts + verifier in one command |
| `scripts/claim.ts` | `npm run claim`: makes a claimed deal on the local chain |
| `scripts/e2e.ts` | `npm run e2e`: the whole flow on a local chain, with checks |
| `test/` | Unit tests (`npm test`) |

## Run it

```bash
cd contracts && forge build              # the local scripts deploy from contracts/out
cd ../services/verifier && npm install

npm test                                 # unit tests
npm run e2e                              # full flow on a local chain: honest, lag, cheat

npm run local                            # local chain (8545) + verifier (4021), payments off
npm run claim -- MSKU0000666 short-weight   # in a 2nd terminal: a claimed deal the agent can check
```

For the real demo (Whitechain + Hedera): copy `.env.example` to `.env`, fill it in, then `npm start`.

## The API

### `POST /verify` (paid)

Body:
```json
{ "dealId": "0x…bytes32 or \"12\"", "shipmentRef": { "containerNo": "MSKU1234567", "blRef": "BL-001" } }
```

Without payment: `402 Payment Required` with a `PAYMENT-REQUIRED` header (price, asset, payTo, Bazaar info).
Use `wrapFetchWithPayment` from `@x402/fetch` to pay and retry.

After payment, `200`:
```json
{
  "dealId": "12",
  "verification": { "dealId": "0x…", "observedKg": 9850, "statusCode": 4, "docHash": "0x…",
                    "observedAt": "1762400000", "nonce": "…", "expiry": "1762400600" },
  "signature": "0x…",
  "signer": "0x…",
  "sigHash": "0x…  (keccak256 of the signature; put it in the HCS audit message)",
  "domain": { "name": "TrustMeBro", "version": "1", "chainId": 1874, "verifyingContract": "0x…" },
  "expected": { "outcome": "Verified", "falsifiedMask": 0 },
  "evidence": { "weighbridge": {…}, "tracking": {…}, "documents": {…} },
  "check": 1,
  "demo": { "scenario": "honest" }
}
```

To relay it, turn `observedAt`, `nonce` and `expiry` back into `BigInt` and call
`submitVerification(verification, signature)` on TradeDeals. `expected` is the verifier's prediction of the
contract's answer, made with the same rules (`judge` in `packages/shared`).

**Errors are free.** The payment is only settled when the answer is `200`:

| Code | Error | Meaning |
|---|---|---|
| 400 | `bad_request` | Body is wrong |
| 400 | `shipment_ref_mismatch` | Container / BL is not what the exporter claimed on-chain |
| 404 | `deal_not_found` | No such deal |
| 409 | `wrong_state` | Deal is not Claimed (3) or Pending (4), so a check is useless |
| 502 | `chain_unavailable` | Could not read Whitechain; try again |

### `GET /health`

`ok: true` when the chain is reachable and the signing key matches `verifier()` on TradeDeals.

### Demo scenarios

Set the scenario for a container **before** the exporter claims, because the agent checks right after the claim.

```bash
curl -X PUT localhost:4021/demo/scenarios/MSKU0000666 -H "content-type: application/json" \
  -H "x-demo-token: $DEMO_TOKEN" -d '{"scenario":"short-weight"}'
curl localhost:4021/demo/scenarios       # list
```

| Scenario | What the "world" reports | Contract result |
|---|---|---|
| `honest` (default) | 98.5% of the weight, same documents, DEPARTED | Verified |
| `lag` | First check GATED_IN, next check DEPARTED | Pending, then Verified |
| `short-weight` | 80.2% of the weight (8,020 of 10,000 kg) | Rejected, exporter score drops |
| `fake-docs` | Different document hash | Rejected, exporter score drops |
| `over-weight` | 111% of the weight (10,000 of 9,000 kg) | Mismatch, no penalty |
| `stuck` | Status stays GATED_IN | Pending; a check after the deadline → Rejected |

## Local stack for the agent and frontend teams

`npm run local` gives you a chain on `http://127.0.0.1:8545` (chain id 31337) with TradeDeals, TrustRegistry and a
mock USDT, plus the verifier on `http://localhost:4021`. Wallets, keys and addresses are written to
`local-deployment.json`: `exporter`, `importer`, `investor` are KYC'd, the importer and investor have 10,000 test USDT,
and `agent` has gas for `submitVerification`. These are anvil's public test keys: never use them on a real network.

Payments are off locally, so the agent can be built before the Hedera accounts exist. To test x402 locally:
`PAYMENTS=on VERIFIER_PAYTO=0.0.x npm run local`.

## Not real (say so in the demo)

The data sources are simulated. Real weighbridge, carrier and eBL feeds don't accept x402 today. In production
the verifier would be an independent data provider with its own key: only `VERIFIER_ADDRESS` changes, not the contract.
