# Lane B runbook: agent · x402 · Hedera · Trust Code (plan v5)

Run these in order on a dev machine (Node ≥ 20, pnpm 10). Each step ends with a proof link → `docs/PROOFS.md`.

## 0. Install + unit tests (no network needed after install)
```bash
pnpm install
pnpm -r test          # shared 25 · verifier 16 · audit 18 · agent 50
pnpm -r typecheck
pnpm --filter @tmb/shared fixtures   # viem-signed samples for lane C → packages/shared/fixtures/
```
If `@x402/*@2.30.0` isn't on npm, use the x402-foundation/x402 monorepo build (see the plan's risk table).

## 1. Hedera accounts (portal.hedera.com, **ECDSA**)
Create **agent**, **verifier** (payTo) and **audit operator** accounts. Then:
1. **Associate USDC `0.0.429274` on the agent and verifier accounts first** (the faucet won't send USDC to an account that isn't associated): fill the four account vars in `.env` (`AGENT_HEDERA_*`, `VERIFIER_PAYTO`, `VERIFIER_HEDERA_PRIVATE_KEY`), then `pnpm associate-usdc`. It skips accounts that are already associated.
2. Get testnet USDC at faucet.circle.com → "Hedera Testnet" → the agent account.
3. Fill `.env` from `.env.example`. `VERIFIER_PAYTO` must be a plain `0.0.x`. Generate `VERIFIER_EVM_PRIVATE_KEY` with `cast wallet new`, and give its address to lane C as the approved verifier.
4. `curl https://api.testnet.blocky402.com/supported` → must list `hedera:testnet`. If not, switch `FACILITATOR_URL` to `https://x402.org/facilitator`.

## 2. G1: first paid x402 request (Hedera track core)
```bash
pnpm verifier          # terminal 1 → "TrustMeBro verifier on :4021 price=$0.30"
pnpm agent:once        # terminal 2 → "✅ paid and verified" + HashScan link
```
Paste the tx ID into README "Payment flow" and `docs/PROOFS.md`.

## 3. Audit topic (HCS)
```bash
pnpm --filter @tmb/audit create-topic   # prints AUDIT_TOPIC_ID + HashScan link → .env
```
The topic is created and written through **Hedera Agent Kit** v4 (`create_topic_tool`, `submit_topic_message_tool`, run from code, no LLM), with the submit key set to the operator key. The kit instance has only those two tools, so it can't move money. Set `AUDIT_SINK=sdk` to fall back to plain `@hiero-ledger/sdk`. Each topic keeps its own chain tail in `services/agent/.state/audit-tail-<topic>.json`, so a new topic starts at seq 0.

## 4. Agent in mock mode (before lane C deploys)
```bash
CHAIN_ADAPTER=mock pnpm agent   # the demo exporter claims 10,000 kg / LOADED / hash A → agent pays → mock TradeDeals: Verified → HCS
pnpm audit:verify               # "✅ chain intact"
```
If HCS is unreachable, audit messages wait in `services/agent/.state/audit-tail-outbox.json` and go out, in order, with the next write. The chain never gets a gap.

Guardrail demo, overcharging merchant: switch the running verifier to `overcharge` (no restart; the dashboard's demo panel does the same through `/api/scenario`):
```bash
curl -X POST localhost:4021/admin/scenario -H 'x-admin-token: <VERIFIER_ADMIN_TOKEN>' -H 'content-type: application/json' -d '{"scenario":"overcharge"}'
CHAIN_ADAPTER=mock pnpm agent      # → quote 5.00 → pending_human, nothing paid
curl localhost:4002/approvals      # dashboard shows this
```
Add `"dealId":"0x…"` to apply a scenario to one deal only. `OVERCHARGE_PRICE` changes the 5.00.

## 4b. Hedera e2e (B7, no Whitechain needed)
```bash
pnpm verifier      # terminal 1
pnpm e2e           # terminal 2: all 7 cases, or `pnpm e2e short-weight` for one
```
Each case runs the agent's whole flow (plan v5 §3 steps 4–6): a fresh exporter (50.00%) declares the demo claim 10,000 kg / LOADED / docHash A → the agent pays `POST /verify` with only `{dealId, shipmentRef}` → relays to the mock TradeDeals, which judges like lane C's contract → `Pending` is rechecked as the next check (max 3) → HCS via Agent Kit. It checks the agent's real USDC balance and the topic messages on the Mirror Node, and prints PASS/FAIL plus rows for `docs/PROOFS.md`.

| Case | Verifier observes (plan v5 §4) | Contract | Charged | Exporter score |
|---|---|---|---|---|
| `honest` | 9,850 kg, DEPARTED, hash A | Verified | 0.30 | 50.00% (66.67% once the deal settles) |
| `lag` | GATED_IN, then DEPARTED on the recheck | Pending → Verified | 0.60 | 50.00% |
| `short-weight` | 8,020 kg | Rejected | 0.30 | 26.32% |
| `fake-docs` | hash B | Rejected | 0.30 | 27.03% |
| `under-declared` | 9,850 kg vs a 9,000 kg claim | Mismatch | 0.30 | 50.00% |
| `overcharge` | 5.00 quote | — (pending_human) | 0 | 50.00% |
| `outage` | 503 | — | 0 | 50.00% |

The full run costs 1.80 USDC; the agent's daily cap is 10.00.

`deployments/hedera-testnet.json` holds the public Hedera side (accounts, topic, facilitator, verifier signer) for lane A. Update it if you recreate accounts or the topic.

## 5. G2: real Whitechain relay (lane C's TradeDeals deployed)
Lane C deploys with `verifier_ = <address of VERIFIER_EVM_PRIVATE_KEY>`. Then set `TRADE_DEALS_ADDRESS` (verifier and agent both read it: it is the EIP-712 `verifyingContract`), `RELAYER_PRIVATE_KEY` (holds WBT), `WHITECHAIN_FROM_BLOCK`, restart the verifier and run:
```bash
CHAIN_ADAPTER=whitechain pnpm agent
```
The exporter calls `declareClaims` → the agent sees `Claimed` → pays on Hedera → `submitVerification` (simulated first) → Verified / Pending / Rejected / Mismatch on the explorer. Rechecks wait `RECHECK_DELAY_SEC` (default 20).
Scenario switch for the cheat run:
```bash
curl -X POST localhost:4021/admin/scenario -H 'x-admin-token: <VERIFIER_ADMIN_TOKEN>' -H 'content-type: application/json' \
  -d '{"scenario":"short-weight","dealId":"0x<uint256 deal id as 32-byte hex>"}'
```
Scenarios: `honest`, `lag`, `short-weight`, `fake-docs`, `overcharge`, `outage`. Under-declared is the exporter's side: declare less than 9,850 kg / 1.03.

## Interfaces with lane C (plan v5 is binding; lane C's contracts are the reference)
- `packages/shared/src/abi.ts`: subset extracted from lane C's generated ABI (`Claimed`, `submitVerification(Verification, bytes) → Outcome`, `getDeal`, `verifier`, events, all custom errors). Re-extract when the contract changes.
- `packages/shared/src/eip712.ts`: `Verification(bytes32 dealId,uint32 observedKg,uint8 statusCode,bytes32 docHash,uint64 observedAt,uint256 nonce,uint256 expiry)`, domain `{TrustMeBro, 1, 1874, TradeDeals}`. `test/sign.test.ts` reproduces lane C's own signed fixture byte for byte.
- `packages/shared/src/trust.ts`: TS mirror of `TrustRegistry`, `_judge`, `_scoreSettlement`, `DealMath`; `vectors/trust.json` has the plan v5 §4–6 values.
- `packages/shared/src/demo.ts`: the demo container's doc hash A / forged hash B, shared by the exporter side and the verifier.

## What's verified where
| Check | Here (unit) | Live |
|---|---|---|
| Score / advance / risk / fee / waterfall (plan v5 §5–6 tables) | ✅ | parity vs `TrustRegistry` once deployed |
| EIP-712 v5 sign / recover | ✅ byte-identical to lane C's fixture | `forge test` on lane C's side |
| `_judge` mirror: §4 examples, ±3% edges, deadline | ✅ | G2 run |
| Spending gate v5 (3 checks / 1.00 per deal, 5 per exporter per day), ledger, approvals API | ✅ | approve button via dashboard |
| x402 header parsing, pinned payment, purchase pipeline | ✅ | `agent:once`, `pnpm e2e` on Hedera testnet |
| Verifier scenarios, 400 for a body with claims, 503 | ✅ | x402 paywall via Blocky402 |
| Audit hash chain, outbox, Agent Kit sink | ✅ | `pnpm audit:verify` on the real topic |
| Whitechain adapter | typecheck against lane C's ABI | G2 run |
