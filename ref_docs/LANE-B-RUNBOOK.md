# Lane B runbook: agent · x402 · Hedera · Trust Code

Run these in order on a dev machine (Node ≥ 20, pnpm 10). Each step ends with a proof link → `docs/PROOFS.md`.

## 0. Install + unit tests (no network needed after install)
```bash
pnpm install
pnpm -r test          # shared 24 · verifier 9 · agent 30 · audit 8
pnpm --filter @tmb/shared fixtures   # viem-signed samples for lane C → packages/shared/fixtures/
```
If `@x402/*@2.30.0` isn't on npm, use the x402-foundation/x402 monorepo build (see the plan's risk table).

## 1. Hedera accounts (portal.hedera.com, **ECDSA**)
Create **agent**, **verifier** (payTo) and **audit operator** accounts. Then:
1. **Associate USDC `0.0.429274` on the agent and verifier accounts first** (the faucet won't send USDC to an account that isn't associated).
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

## 4. Agent in mock mode (before lane C deploys)
```bash
CHAIN_ADAPTER=mock pnpm agent   # emits one demo shipment → pays → "relayed" (mock) → HCS messages
pnpm --filter @tmb/audit verify # "✅ chain intact"
```
Guardrail demo, overcharging merchant:
```bash
VERIFY_PRICE='$5.00' VERIFIER_PORT=4022 pnpm verifier
VERIFIER_URL=http://localhost:4022 CHAIN_ADAPTER=mock pnpm agent   # → pending_human, nothing paid
curl localhost:4002/approvals                                       # dashboard shows this
```
Note: the overcharging merchant needs its own `VERIFIER_PAYTO` value in the agent's allowlist, otherwise it's refused outright (also a valid demo).

## 5. G2: real Whitechain relay (after lane C's v2)
Set `TRADE_DEALS_ADDRESS`, `RELAYER_PRIVATE_KEY` (holds WBT), `WHITECHAIN_FROM_BLOCK`, then:
```bash
CHAIN_ADAPTER=whitechain pnpm agent
```
Lane C (or the dashboard) declares a shipment → the agent pays on Hedera → relays → Released/Disputed on the explorer.
Scenario switch for the cheat run:
```bash
curl -X POST localhost:4021/admin/scenario -H 'x-admin-token: <VERIFIER_ADMIN_TOKEN>' -H 'content-type: application/json' \
  -d '{"scenario":"fake-weight","dealId":"0x…"}'
```

## Interfaces lane C must match (G0)
- `packages/shared/src/abi.ts`: `ShipmentDeclared`, `submitVerification(Verification, bytes)`, `verifier()`, `dealState()`. Lane C replaces it with the real ABI using the same names.
- `packages/shared/src/eip712.ts`: type string + domain `{TrustMeBro, 1, 1874, TradeDeals}`.
- `packages/shared/vectors/trust.json`: Trust Score / terms / waterfall golden values.

## What's verified where
| Check | Here (unit) | Live |
|---|---|---|
| Trust maths, terms, waterfall | ✅ 24 tests | parity vs `TrustRegistry` once deployed |
| Spending gate, ledger, approvals API | ✅ | approve button via dashboard |
| x402 header parsing, purchase pipeline (fakes) | ✅ | `agent:once` on Hedera testnet |
| Verifier handler (400/503/signed) | ✅ | x402 paywall via Blocky402 |
| Audit hash chain + mirror decoding | ✅ | `audit verify` on the real topic |
| EIP-712 viem sign/recover | skipped without viem | `pnpm -r test` after install |
| Whitechain adapter | — | G2 run |
