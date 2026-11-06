# Lane B runbook: agent · x402 · Hedera · Trust Code (plan v5)

Run these in order on a dev machine (Node ≥ 20, pnpm 10). Each step ends with a proof link → `docs/PROOFS.md`.

## 0. Install + unit tests (no network needed after install)
```bash
pnpm install
pnpm -r test          # shared 29 · verifier 16 · audit 19 · agent 68
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

## 4. Agent in mock mode (no chain; our demo verifier)
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

## 4b. Hedera e2e with guardrails (no chain; our demo verifier)
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

## 4c. Against lane C's verifier and local chain
Lane C's verifier reads each deal's claim from TradeDeals and signs in their response format (`domain` nested, `sigHash`, `expected`, `evidence`). The agent accepts exactly that format and checks deal, chain, contract, `sigHash = keccak256(signature)` and signer; it ignores `expected` (the contract decides) and never forwards `evidence` to HCS. Needs Foundry (`forge build` in `contracts/`).
```bash
cd services/verifier            # at the repo root (lane C)
npm ci && PAYMENTS=on VERIFIER_PAYTO=0.0.11331478 npm run local     # anvil 31337 + contracts + verifier on :4021
npm run claim -- MSKU1234567 honest                                  # → "Deal 1 claimed"
cd ../../Hedera_Agentic_Payments
CHAIN_ADAPTER=local pnpm agent:once 1                                # reads deal 1, pays on Hedera, checks the signed answer
CHAIN_ADAPTER=local RECHECK_DELAY_SEC=5 pnpm agent                   # the runtime: watches Claimed, pays, sends submitVerification
npm run claim -- MSKU1000002 lag                                     # (in services/verifier) → Pending, then Verified on the recheck
npm run claim -- MSKU1000003 short-weight                            # → Rejected, TrustRegistry 50.00% → 26.32%
```
Each relay prints the local-chain tx hash, the contract's events and the exporter's TrustRegistry score before and after. Restart the agent whenever you restart lane C's stack (new genesis, new deal ids). A new exporter's open exposure is capped at 200 USDT by the contract, so a third unsettled 100 USDT deal reverts `CreditLimitExceeded`: restart the stack for more cases.
Before paying, the agent reads `getDeal` (only Claimed or Pending deals are checked) and `verifier()` (it must be the key the agent pays for, or every answer would revert `InvalidSigner`). Rechecks happen only on Pending, at most 3 paid checks per deal; the last one waits until just after `verifyDeadline`, so a stuck shipment gets a verdict from the contract. The spending ledger keys a deal by (chain, TradeDeals, deal id), plus anvil's genesis hash locally, because anvil redeploys at the same address on every restart.

`CHAIN_ADAPTER=local` takes TradeDeals, chain id, verifier address and the relayer key from `services/verifier/local-deployment.json` (`LOCAL_DEPLOYMENT` overrides the path). Stop our own verifier first: both use port 4021.

## 4d. Full-loop e2e on lane C's contracts (`pnpm e2e:local`)
```bash
cd services/verifier && PAYMENTS=on VERIFIER_PAYTO=0.0.11331478 npm run local     # repo root, terminal 1
pnpm e2e:local            # terminal 2: all 6 cases (~4 min, 2.70 USDC), or `pnpm e2e:local stuck`
```
Each case KYCs a fresh exporter (TrustRegistry onboards it at 50%), creates, approves and claims a 100 USDT deal (10,000 kg / LOADED, `verifyWindow` 60 s, the contract's minimum), then runs the agent's own code per check: pre-checks → x402 payment on Hedera → signed answer → `submitVerification` from the agent's relayer → the contract decides → recheck on Pending, the last one after `verifyDeadline`. It prints each Hedera tx, local-chain tx and contract event, then checks the agent's USDC on the Mirror Node, `getDeal` state and `falsifiedMask`, `TrustRegistry.trust(exporter)` and the HCS topic.

| Case | lane C scenario | Contract | Paid | TrustRegistry |
|---|---|---|---|---|
| `honest` | 9,850 kg, DEPARTED, same docs | Verified → funded, repaid → Settled | 0.30 | 50.00% → 66.67% at settlement |
| `lag` | GATED_IN, then DEPARTED | Pending → Verified | 0.60 | 50.00% |
| `short-weight` | 8,020 kg | Rejected (weight) | 0.30 | 26.32% |
| `fake-docs` | other eBL hash | Rejected (documents) | 0.30 | 27.03% |
| `over-weight` | 11,111 kg | Mismatch | 0.30 | 50.00% |
| `stuck` | GATED_IN forever | Pending, Pending, Rejected (status) after the deadline | 0.90 | 28.57% |

The overcharge and outage guardrails need a verifier whose price and availability can be switched. Lane C's can't do that, so they stay in `pnpm e2e` (4b) against our demo verifier. Today's runs count against `POLICY_MAX_PER_DAY` (10.00); raise it for a long test session, not in production.

## 5. G2: Whitechain testnet (after lane C deploys)
The flow is the one `pnpm e2e:local` proves, on chain 1874. Lane C deploys TradeDeals with their verifier's address as `verifier_` and runs their verifier against it (`TRADEDEALS_ADDRESS`, `VERIFIER_SIGNER_PK`, `PAYMENTS=on`, `VERIFIER_PAYTO=0.0.11331478`). Then in `.env` here:
```bash
CHAIN_ADAPTER=whitechain
TRADE_DEALS_ADDRESS=0x…        # lane C's deployment
VERIFIER_ADDRESS=0x…           # verifier_ from that deployment; the agent pays only if verifier() equals it
RELAYER_PRIVATE_KEY=0x…        # holds WBT for gas
WHITECHAIN_FROM_BLOCK=…        # TradeDeals deployment block
VERIFIER_URL=https://…         # lane C's verifier
```
```bash
pnpm agent:once <dealId>       # one paid check of a real Claimed deal (pre-checks first)
pnpm agent                     # the runtime: WS for Claimed, pays, relays; explorer links per relay
```
Scenarios are set on lane C's verifier per container: `PUT /demo/scenarios/<containerNo>` with `x-demo-token` and `{"scenario":"short-weight"}`.

## Interfaces with lane C (plan v5 is binding; lane C's contracts are the reference)
- `packages/shared/src/abi.ts`: subset extracted from lane C's generated ABI (`Claimed`, `submitVerification(Verification, bytes) → Outcome`, `getDeal`, `verifier`, events, all custom errors). Re-extract when the contract changes.
- `packages/shared/src/eip712.ts`: `Verification(bytes32 dealId,uint32 observedKg,uint8 statusCode,bytes32 docHash,uint64 observedAt,uint256 nonce,uint256 expiry)`, domain `{TrustMeBro, 1, 1874, TradeDeals}`. `test/sign.test.ts` reproduces lane C's own signed fixture byte for byte.
- `packages/shared/src/trust.ts`: TS mirror of `TrustRegistry`, `_judge`, `_scoreSettlement`, `DealMath`; `vectors/trust.json` has the plan v5 §4–6 values.
- `packages/shared/src/demo.ts`: the demo container's doc hash A / forged hash B, shared by the exporter side and the verifier.

Found while integrating, for lane C (their code, not changed here):
- If the verifier's first call to the facilitator fails at startup ("Failed to fetch supported kinds"), every `POST /verify` returns 500 until restart. Nobody is charged, but it needs a retry or a lazy init.
- `npm run claim` crashes on Windows with a libuv assertion (`UV_HANDLE_CLOSING`) when it calls `process.exit()` with sockets still closing; setting `process.exitCode` and returning avoids it (fixed the same way in our `agent:once`).

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
