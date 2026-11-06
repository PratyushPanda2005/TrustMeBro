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
| `services/audit` | HCS audit log (hash-chained, tamper-evident), created and written through Hedera Agent Kit |
| `contracts/` | Whitechain contracts (lane C) |
| `apps/web` | Dashboard (lane A) |

## Setup
TODO

## Architecture
```
 Exporter ──createDeal / declareClaims(kg, status, docHash)─▶ ┌───────────────────────────┐
 Importer ──approveDeal / pay at the due date──────────────▶  │ TradeDeals + TrustRegistry│  Whitechain (1874), sponsor USDT
 Investor ──fund() after Verified: one investor, NFT (USDT)─▶ │ judges claims vs observed │
                                                              └───────▲───────────┬───────┘
                          submitVerification(v, sig) → Outcome        │           │ Claimed
                                                                      │           ▼
                                            ┌────────────────────────────────────────────┐
                                            │ AI agent (services/agent)                  │
                                            │ gate → x402 pay → check sig → relay        │──▶ HCS audit topic (Agent Kit)
                                            │ Pending → recheck (max 3)                  │
                                            └───────────────┬────────────────────────────┘
                   POST /verify {dealId, shipmentRef} (402 → pay 0.30 USDC on Hedera via Blocky402)
                                            ┌───────────────▼────────────────────────────┐
                                            │ Verifier (services/verifier)               │
                                            │ weighbridge kg, carrier status, eBL hash,  │
                                            │ observedAt — EIP-712 signed                │
                                            └────────────────────────────────────────────┘
```

## Payment flow (x402 on Hedera, plan v5 §8)
1. The exporter declares **values** on Whitechain with `declareClaims`: weight in kg, carrier status (≥ LOADED) and the hash of the invoice + packing list + bill of lading. The contract emits `Claimed`.
2. The agent sends `POST /verify` unpaid with only `{dealId, shipmentRef}` (the claims stay on chain, so the agent can't launder a lie) and gets **402 Payment Required**: 0.30 USDC (`0.0.429274`) on `hedera:testnet`, `payTo`, and a Bazaar schema for discovery.
3. The **spending gate** checks allowlist, network and asset; ≤ 1.00 per call, ≤ 3 checks / 1.00 per deal, ≤ 10.00 per day, ≤ 5 checks per exporter per day; never pays twice for the same check. Over-cap prices wait for a human.
4. The x402 client re-sends the same POST with `PAYMENT-SIGNATURE`, pinned to exactly the approved quote. The facilitator (Blocky402) settles on Hedera and pays the network fee.
5. `200` + `PAYMENT-RESPONSE`: the verifier's signed facts (weighbridge kg, carrier status, eBL doc hash, `observedAt`). The agent checks the EIP-712 signer and contract, then relays to TradeDeals, which **decides**: within ±3%, same hash and status reached → **Verified** (listed for investors); status behind → **Pending**, the agent rechecks (max 3 checks); fewer kg or a different hash → **Rejected** and only the exporter's score drops (50.00% → 26.32% for a short weight); more kg than declared → **Mismatch**, no penalty. The exporter's positive credit comes only when the deal settles (50.00% → 66.67%).
6. Every quote, payment, refusal, recheck and relay goes to an HCS topic as a hash chain (`pnpm audit:verify`), with `{dealId, hederaTxId, payer, sigHash, whitechainTx}` linking the Hedera payment to the Whitechain verdict. The topic is created and written through **Hedera Agent Kit** consensus tools, run from code with no LLM.

Settled payments (HashScan), all on Hedera testnet, more in `docs/PROOFS.md`:
- G1, first autonomous paid request: [`0.0.7162784@1793943996.436285753`](https://hashscan.io/testnet/transaction/0.0.7162784@1793943996.436285753)
- Plan v5 e2e (`pnpm e2e`, all 7 cases): Verified [`0.0.7162784@1793957339.087885327`](https://hashscan.io/testnet/transaction/0.0.7162784@1793957339.087885327), Rejected for short weight [`0.0.7162784@1793957378.179920972`](https://hashscan.io/testnet/transaction/0.0.7162784@1793957378.179920972)
- Audit trail: HCS topic [`0.0.11336190`](https://hashscan.io/testnet/topic/0.0.11336190), created by Hedera Agent Kit

## Agent safety (plan v5 §9)
- No LLM on the money path. The agent pays for evidence and delivers it; **the contract judges**.
- Deterministic spending gate before every signature, the payment pinned to the approved quote, plus the x402 SDK's spend control as a second cap.
- Responses are trusted only if they're signed by the approved verifier for this deal and this TradeDeals (checked off-chain, then on-chain), and every relay is simulated before it is sent.
- A verifier outage or timeout is not charged and gives no verdict, so nobody is penalised.

## Trust Score (plan v5 §5)
`score = (r + A) / (r + s + A + B)`, rounded to the nearest basis point. A settled honest deal adds 10,000 to `r`; a falsified claim adds 10,000 + 2 × the weights of the falsified checks (weight 40%, documents 35%, status 25%) to `s`. So honest parties only rise and only the liar drops. Advance = the exporter's score, capped at 90% and blocked below 40%; investor yield = the importer's risk, 2% + 6% × (1 − trust). The TS mirror of lane C's contracts and the golden vectors are in `packages/shared`.

## Limitations
TODO
