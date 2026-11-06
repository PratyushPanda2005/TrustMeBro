# Live proofs

Every live testnet transaction behind the demo, added as each part lands.

Accounts (Hedera testnet, ECDSA, USDC `0.0.429274` associated):
- agent (payer) [`0.0.11331527`](https://hashscan.io/testnet/account/0.0.11331527)
- verifier (payTo) [`0.0.11331478`](https://hashscan.io/testnet/account/0.0.11331478)
- audit operator [`0.0.11331562`](https://hashscan.io/testnet/account/0.0.11331562)
- facilitator: Blocky402, fee payer `0.0.7162784` (pays the network fee, so every x402 tx ID starts with it)

## Hedera (x402)
Each payment is a single `CRYPTOTRANSFER` of 300000 atomic units (0.30 USDC): `0.0.11331527` -300000, `0.0.11331478` +300000.

| What | Hedera tx ID | HashScan |
|---|---|---|
| G1: `pnpm agent:once`, first autonomous paid `POST /verify` (2026-11-06) | `0.0.7162784@1793943996.436285753` | [view](https://hashscan.io/testnet/transaction/0.0.7162784@1793943996.436285753) |
| Agent runtime, mock chain: shipment → pay → relay (match → release) | `0.0.7162784@1793944165.975195850` | [view](https://hashscan.io/testnet/transaction/0.0.7162784@1793944165.975195850) |
| Guardrail: $5.00 merchant, above the $1.00 per-call cap → `pending_human` | none (nothing paid; agent balance 39.4 → 38.8 USDC = the two rows above only) | n/a |

### G1 soak: repeated, concurrent and scenario runs (`pnpm agent:once`)
Agent USDC 38.8 → 37.0, verifier 41.2 → 43.0: exactly the six 0.30 transfers below, all `SUCCESS` on the mirror node. Nothing else moved.

| Run | Hedera tx ID | Result |
|---|---|---|
| A1 sequential | [`0.0.7162784@1793944882.013396188`](https://hashscan.io/testnet/transaction/0.0.7162784@1793944882.013396188) | paid, verified |
| A2 sequential | [`0.0.7162784@1793944898.490838303`](https://hashscan.io/testnet/transaction/0.0.7162784@1793944898.490838303) | paid, verified |
| A3 sequential | [`0.0.7162784@1793944909.364944099`](https://hashscan.io/testnet/transaction/0.0.7162784@1793944909.364944099) | paid, verified |
| B1 concurrent | [`0.0.7162784@1793944930.975798986`](https://hashscan.io/testnet/transaction/0.0.7162784@1793944930.975798986) | paid, verified |
| B2 concurrent | [`0.0.7162784@1793944932.099435603`](https://hashscan.io/testnet/transaction/0.0.7162784@1793944932.099435603) | paid, verified |
| C `fake-weight` scenario | [`0.0.7162784@1793945120.965165192`](https://hashscan.io/testnet/transaction/0.0.7162784@1793945120.965165192) | paid, signed verification has `weight: false` |
| D `outage` scenario | none | 503, not settled, not charged |
| E bait and switch: retry quotes 0.90 or another payTo | none | refused before signing (pin check in `payer.ts`) |
| F admin endpoint with a wrong token | none | 401 |

### `pnpm e2e`: Hedera e2e cases (B7), one live verifier, scenario switched per deal
4/4 PASS. Each case checked the agent's USDC balance on the Mirror Node.

| Case | Hedera tx | Result |
|---|---|---|
| e2e:happy | [`0.0.7162784@1793947218.558655089`](https://hashscan.io/testnet/transaction/0.0.7162784@1793947218.558655089) | PASS: paid 0.30, verified, all checks true |
| e2e:cheat | [`0.0.7162784@1793947221.285301856`](https://hashscan.io/testnet/transaction/0.0.7162784@1793947221.285301856) | PASS: paid 0.30, verifier reports the falsified weight |
| e2e:overcharge | none | PASS: 5.00 quote held for a human, nothing paid |
| e2e:outage | none | PASS: data source down: 503, not settled, nothing paid |

## HCS audit topic
| Topic ID | HashScan |
|---|---|
| `0.0.11334995` (submit key = audit operator) | [view](https://hashscan.io/testnet/topic/0.0.11334995) |

`pnpm audit:verify` → `10 messages on 0.0.11334995: ✅ chain intact` (rows 8–10: mock agent run with the audit outbox, after the e2e cases):

| Seq (HashScan) | Kind | Note |
|---|---|---|
| 1–2 | quote, error | verifier returned 400 for the placeholder `TRADE_DEALS_ADDRESS`; not settled, no charge (fixed, see `config.ts`) |
| 3–5 | quote, paid, relayed | the runtime row above |
| 6–7 | quote, pending_human | guardrail demo |
| 8–10 | quote, paid, relayed | mock agent run through the new audit outbox; Hedera tx `0.0.7162784@1793947255.599388219` |

## Whitechain (chain 1874)
| What | Tx / address | Explorer |
|---|---|---|
