# TrustMeBro

**Investors replace the bank, and honesty sets the price.**

Small exporters get paid in minutes instead of 60 days. Investors fund the invoice in USDT on **Whitechain**. The money stays locked until an **AI agent pays (x402 on Hedera)** for an independent check of the exporter's shipment claims. Every check updates an onchain **Trust Score** that sets the next deal's advance and yield.

> Work in progress during ETHGlobal Mumbai 2026. Sections marked TODO are filled in as each part lands.

## Repo layout
| Path | What |
|---|---|
| `packages/shared` | Schemas, EIP-712 types, Trust Score + terms reference math, golden test vectors |
| `services/verifier` | x402-protected `POST /verify` (Hedera testnet, USDC) returning EIP-712-signed observations |
| `services/agent` | Autonomous verifier agent: spending gate, x402 client, relay to Whitechain, approvals API |
| `services/audit` | HCS audit log (hash-chained, tamper-evident) |
| `contracts/` | Whitechain contracts (lane C) |
| `apps/web` | Dashboard (lane A) |

## Setup
TODO

## Architecture
```
 Exporter ──createInvoice / declareShipment(claims)──▶ ┌──────────────────────────┐
 Importer ──approve / pay at maturity────────────────▶ │ TradeDeals + TrustRegistry│  Whitechain (1874), sponsor USDT
 Investors ─buy restricted deal tokens (USDT)────────▶ │ locked until verified     │
                                                       └───────▲──────────┬───────┘
                        submitVerification(v, sig)             │          │ ShipmentDeclared
                                                               │          ▼
                                            ┌────────────────────────────────────┐
                                            │ AI agent (services/agent)          │
                                            │ gate → x402 pay → check sig → relay│──▶ HCS audit topic
                                            └───────────────┬────────────────────┘
                              POST /verify (402 → pay 0.30 USDC on Hedera via Blocky402)
                                            ┌───────────────▼────────────────────┐
                                            │ Verifier (services/verifier)       │
                                            │ observed checks, EIP-712 signed    │
                                            └────────────────────────────────────┘
```

## Payment flow (x402 on Hedera)
1. The exporter declares shipment claims `{weight, status_code, document_verification}` on Whitechain.
2. The agent sends `POST /verify` unpaid and gets **402 Payment Required** with a `PAYMENT-REQUIRED` header: 0.30 USDC (`0.0.429274`) on `hedera:testnet`, `payTo`, and a Bazaar schema for discovery.
3. The **spending gate** checks allowlist, network, asset, per-call / per-deal / daily caps, and never paying twice. Over-cap prices wait for a human.
4. The x402 client re-sends the same POST with `PAYMENT-SIGNATURE`. The facilitator (Blocky402) settles on Hedera and pays the network fee.
5. `200` + `PAYMENT-RESPONSE`: the agent reads the Hedera tx ID, checks the EIP-712 signer, and relays to Whitechain, where the contract compares claims vs observed.
6. Every quote, payment, refusal and relay goes to an HCS topic as a hash chain (`pnpm --filter @tmb/audit verify`).

Settled payments (HashScan), all on Hedera testnet, more in `docs/PROOFS.md`:
- G1, first autonomous paid request: [`0.0.7162784@1793943996.436285753`](https://hashscan.io/testnet/transaction/0.0.7162784@1793943996.436285753)
- Agent runtime, pay → relay: [`0.0.7162784@1793944165.975195850`](https://hashscan.io/testnet/transaction/0.0.7162784@1793944165.975195850)
- Audit trail: HCS topic [`0.0.11334995`](https://hashscan.io/testnet/topic/0.0.11334995)

## Agent safety
- No LLM on the money path. The agent pays for evidence and delivers it; **the contract judges**.
- Deterministic spending gate before every signature, plus the x402 SDK's `setSpendControls` as a second cap.
- Responses are trusted only if they're signed by the approved verifier for this deal and contract (checked off-chain, then on-chain).
- A verifier outage is not charged and gives no verdict, so nobody is penalised.

## Trust Score
Per deal, a weighted average of the three checks (weight 40%, documents 35%, status 25%). Over time, `score = (r + a) / (r + s + a + b)`: honest deals add to `r`, falsified claims add `1 + 2·w` to `s`. So honest parties only rise and only the falsifier drops. The exporter's score sets the advance (60→90%) and the importer's sets the investor yield (5→2%). Reference maths and golden vectors: `packages/shared`.

## Limitations
TODO
