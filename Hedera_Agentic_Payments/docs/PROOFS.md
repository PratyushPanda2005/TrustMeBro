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

### Integration with lane C, step 1: the agent pays lane C's verifier (`CHAIN_ADAPTER=local pnpm agent:once <dealId>`)
Lane C's own stack (`npm run local` in `services/verifier` at the repo root, `PAYMENTS=on VERIFIER_PAYTO=0.0.11331478`): anvil 31337, their TradeDeals `0x9fE4…a6e0`, their verifier reading the deal from the chain. `npm run claim -- MSKU1234567 honest` made deal 1 (10,000 kg, LOADED). The agent read the claim from TradeDeals, sent only `{dealId, shipmentRef}`, paid over x402, and accepted the response only after checking it was signed by `0xa0Ee…9720` for chain 31337, that TradeDeals and that deal, with `sigHash = keccak256(signature)`. Lane C's verifier logged the same tx as settled with payer `0.0.11331527`; the Mirror Node shows `CRYPTOTRANSFER SUCCESS`, `0.0.11331527` −300000, `0.0.11331478` +300000.

| What | Hedera tx | Result |
|---|---|---|
| deal 1, honest | [`0.0.7162784@1793962630.360869930`](https://hashscan.io/testnet/transaction/0.0.7162784@1793962630.360869930) | PASS: observed 9,850 kg, status 4 (DEPARTED), signed for chain 31337; the verifier's forecast "Verified" is shown but ignored (the contract decides) |

### Integration with lane C, step 2: checks before paying (`getDeal`, `verifier()`), deals scoped per deployment
Same stack. Before each paid check the agent reads `getDeal` (still Claimed or Pending?) and `verifier()` (is it the key we pay for?). The spending ledger keys a deal by (chain, TradeDeals, deal id), plus the genesis hash on anvil, which redeploys at the same address on every restart. Agent USDC 30.7 → 29.5 over steps 1–2: exactly the four 0.30 payments listed (step 1's two runs, against lane C's verifier and the regression run against ours, plus the two below).

| Run | Hedera tx | Result |
|---|---|---|
| deal 99 (doesn't exist) | none | PASS: `getDeal` state None → skipped, nothing paid |
| configured verifier `0x76b4…` ≠ `verifier()` `0xa0Ee…` | none | PASS: refused before paying (answers would revert `InvalidSigner`) |
| deal 1, Claimed, `verifier()` matches | [`0.0.7162784@1793963616.056418327`](https://hashscan.io/testnet/transaction/0.0.7162784@1793963616.056418327) | PASS: paid, signed answer accepted |
| deal 1 after an anvil restart (same address, new genesis) | [`0.0.7162784@1793963709.696072576`](https://hashscan.io/testnet/transaction/0.0.7162784@1793963709.696072576) | PASS: a new deal, paid. Before the fix it was refused as "already paid" |
| the same deal 1 again | none | PASS: "already paid for check 1 of this deal", nothing paid |

### Plan v5 e2e (`pnpm e2e`): value claims, contract outcomes, rechecks, Option A records
Plan v5 §3 steps 4–6 and §4 examples. Each case: a fresh exporter declares 10,000 kg / LOADED / docHash A → the agent pays `POST /verify` with `{dealId, shipmentRef}` only → the mock TradeDeals (TS mirror of lane C's `_judge` + `TrustRegistry`) decides → HCS via Agent Kit. All 7 cases + the HCS check passed, exit 0. Re-checked independently on the Mirror Node: six `CRYPTOTRANSFER SUCCESS` of 300000 each, agent USDC 34.9 → 33.1 (exactly 1.80); each relay message on topic `0.0.11336190` carries `hederaTxId`, `payer` `0.0.11331527`, `sigHash`, `whitechainTx` and the judged outcome.

| Case | Hedera tx | Result |
|---|---|---|
| honest | [`0.0.7162784@1793957339.087885327`](https://hashscan.io/testnet/transaction/0.0.7162784@1793957339.087885327) | PASS: 9,850 kg / DEPARTED / hash A → Verified; score stays 50.00% until settlement, then 66.67% (mock settlement) |
| lag | [`0.0.7162784@1793957353.389240010`](https://hashscan.io/testnet/transaction/0.0.7162784@1793957353.389240010)<br>[`0.0.7162784@1793957365.680173072`](https://hashscan.io/testnet/transaction/0.0.7162784@1793957365.680173072) | PASS: GATED_IN → Pending, recheck DEPARTED → Verified; two checks (0.60), no penalty |
| short-weight | [`0.0.7162784@1793957378.179920972`](https://hashscan.io/testnet/transaction/0.0.7162784@1793957378.179920972) | PASS: 8,020 of 10,000 kg → Rejected; only the exporter drops 50.00% → 26.32% |
| fake-docs | [`0.0.7162784@1793957393.422252673`](https://hashscan.io/testnet/transaction/0.0.7162784@1793957393.422252673) | PASS: doc hash B ≠ A → Rejected; only the exporter drops 50.00% → 27.03% |
| under-declared | [`0.0.7162784@1793957403.924508502`](https://hashscan.io/testnet/transaction/0.0.7162784@1793957403.924508502) | PASS: 9,000 claimed, 9,850 observed → Mismatch; no penalty |
| overcharge | none | PASS: 5.00 quote held for a human; nothing paid, nothing relayed |
| outage | none | PASS: 503, nothing paid, no penalty |
| HCS audit | [`0.0.11336190`](https://hashscan.io/testnet/topic/0.0.11336190) | PASS: 23/23 messages of the run on the topic via Agent Kit (#20–#42), chain intact |

`pnpm agent:once` with the v5 request: [`0.0.7162784@1793957467.785080332`](https://hashscan.io/testnet/transaction/0.0.7162784@1793957467.785080332) (observed 9,850 kg, status 4, signed `observedAt`).

The sections below are earlier runs under plan v4 (true/false claims), kept as history.

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

### Plan v4: `pnpm e2e` Hedera e2e cases (B7), one live verifier, scenario switched per deal
4/4 PASS. Each case checked the agent's USDC balance on the Mirror Node.

| Case | Hedera tx | Result |
|---|---|---|
| e2e:happy | [`0.0.7162784@1793947218.558655089`](https://hashscan.io/testnet/transaction/0.0.7162784@1793947218.558655089) | PASS: paid 0.30, verified, all checks true |
| e2e:cheat | [`0.0.7162784@1793947221.285301856`](https://hashscan.io/testnet/transaction/0.0.7162784@1793947221.285301856) | PASS: paid 0.30, verifier reports the falsified weight |
| e2e:overcharge | none | PASS: 5.00 quote held for a human, nothing paid |
| e2e:outage | none | PASS: data source down: 503, not settled, nothing paid |

### Plan v4: `pnpm e2e` v2, full agent flow + Trust Scores + HCS via Hedera Agent Kit
Plan §3 steps 5–7: a fresh exporter declares all-true claims → the agent pays `POST /verify` over x402 → relays → the contract (mock TradeDeals, shared TS mirror of the Solidity maths) judges → Trust Score moves (§4.2) → every step goes to HCS through **Hedera Agent Kit** `submit_topic_message_tool`. All passed, exit 0. Re-checked independently on the Mirror Node: both payments `CRYPTOTRANSFER SUCCESS` (agent −300000, verifier +300000); every topic message paid by the audit operator `0.0.11331562`; the relay messages carry the score move.

| Case | Hedera tx | Result |
|---|---|---|
| e2e:happy | [`0.0.7162784@1793952840.027565805`](https://hashscan.io/testnet/transaction/0.0.7162784@1793952840.027565805) | PASS: paid 0.30, verified, released; exporter 50.00% → 66.66% (HCS #13: `trust released 5000→6666`) |
| e2e:cheat | [`0.0.7162784@1793952848.799216642`](https://hashscan.io/testnet/transaction/0.0.7162784@1793952848.799216642) | PASS: paid 0.30, weight falsified, disputed; only the exporter drops 50.00% → 26.31% (HCS #16: `trust disputed 5000→2631`) |
| e2e:overcharge | none | PASS: 5.00 quote held for a human, nothing paid, score unchanged |
| e2e:outage | none | PASS: 503, nothing paid, no penalty (score unchanged) |
| HCS audit | [`0.0.11336190`](https://hashscan.io/testnet/topic/0.0.11336190) | PASS: 10/10 messages of the run on the topic via Agent Kit, 20 in total, chain intact |

An earlier identical run (txs `…1793952163.815017350`, `…1793952177.410338143`, HCS #1–#10) also passed.

## HCS audit topic
| Topic ID | Created by | HashScan |
|---|---|---|
| `0.0.11336190` (current; submit key = audit operator, memo "TrustMeBro agent spend audit") | **Hedera Agent Kit** `create_topic_tool`, tx [`0.0.11331562@1793951843.444750109`](https://hashscan.io/testnet/transaction/0.0.11331562@1793951843.444750109) | [view](https://hashscan.io/testnet/topic/0.0.11336190) |
| `0.0.11334995` (first topic, plain `@hiero-ledger/sdk`) | `pnpm --filter @tmb/audit create-topic` before Agent Kit | [view](https://hashscan.io/testnet/topic/0.0.11334995) |

First topic, `pnpm audit:verify` → `10 messages on 0.0.11334995: ✅ chain intact` (rows 8–10: mock agent run with the audit outbox, after the e2e cases):

| Seq (HashScan) | Kind | Note |
|---|---|---|
| 1–2 | quote, error | verifier returned 400 for the placeholder `TRADE_DEALS_ADDRESS`; not settled, no charge (fixed, see `config.ts`) |
| 3–5 | quote, paid, relayed | the runtime row above |
| 6–7 | quote, pending_human | guardrail demo |
| 8–10 | quote, paid, relayed | mock agent run through the new audit outbox; Hedera tx `0.0.7162784@1793947255.599388219` |

## Whitechain (chain 1874)
| What | Tx / address | Explorer |
|---|---|---|
