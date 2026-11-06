# TMB-01 · Work split into 3 lanes (no-blocker plan)

Companion to `TMB-00-master-plan.md` (v4). Time: **Fri Nov 6, 04:00 IST → Sat Nov 7, 07:30 submit** (hard deadline 09:00).

| Lane | Name | Owns | Person |
|---|---|---|---|
| **A** | Frontend + Backend | `apps/web` (UI + API routes), README assembly, demo panel, video | **Pratyush** |
| **B** | AI agent · x402 · Hedera · Trust Code workflow | `services/verifier`, `services/agent`, `packages/shared`, HCS audit, trust-score reference + golden vectors, e2e scripts | TBD |
| **C** | Whitechain · smart contracts | `contracts/`, deployments, verification on the explorer, sponsor-USDT flow | TBD |

> Put the person who is strongest in Solidity on **C**. C sits on the critical path for three of the gates below.

---

## 1. How the lanes avoid blocking each other

**Rule 1: interfaces first, in 90 minutes.** Before anyone builds, the shared contracts between lanes are frozen (Gate G0). Everything after that builds against them.

| Frozen at G0 (Fri 05:30) | Written by | Used by |
|---|---|---|
| `ITradeDeals` / `ITrustRegistry` (functions, events, errors, enums) + ABI JSON in `packages/shared/abi/` | C | A (hooks), B (relay) |
| EIP-712 `Verification` type + domain: `{name:"TrustMeBro", version:"1", chainId:1874, verifyingContract}` and struct `{bytes32 dealId; bool weight; bool statusCode; bool documents; uint256 nonce; uint256 expiry}` | B | C, B |
| Zod schemas: `Claims`, `VerifyRequest`, `VerifyResponse`, `DealView`, `AgentLogEntry`, `HcsMessage` | B | A, C scripts |
| Trust-score + terms **TS reference implementation** and **golden vectors** `packages/shared/vectors/trust.json` | B | C (Solidity tests), A (UI numbers) |
| Signed sample responses `packages/shared/fixtures/verification-*.json` (valid, forged, expired, reused, wrong chain) | B | C |
| `deployments/1874.json` (addresses) + `deployments/hedera-testnet.json` (accounts, topic id) | C / B | all |
| Agent HTTP API: `GET /approvals`, `POST /approvals/:id/approve|reject`; Verifier admin: `POST /admin/scenario` | B | A |

**Rule 2: everything has a mock until the real thing ships.**
- A uses fixtures + a mock `useDeals()` adapter until C's first deploy; switching to real is one flag.
- B's agent uses a `ChainAdapter` interface with a mock implementation until C's first deploy.
- C tests against B's signed fixtures, so C never waits for B's live service.
- Hedera work (B) needs nothing from Whitechain, and Whitechain work (C) needs nothing from Hedera.

**Rule 3: only the owner edits their directory.** `CODEOWNERS` enforces it. Changes to `packages/shared` go through B and need a note in chat. Small PRs, squashed to `main`, pushed at least hourly (also satisfies the "steady commits" rule).

**Rule 4: contract versions are announced.** Redeploys are v1 09:00, v2 12:00, v3 15:30, **v4 FINAL 18:30**. After v4 only critical fixes, and no redeploy after **Fri 22:00**, because every redeploy changes addresses and forces a re-seed.

**Rule 5: if USDT hasn't arrived**, v1–v3 use a clearly labelled `MockUSDT` (dev only). **v4 and every proof transaction use the sponsor USDT `0xcedf…55a7`**, which is a constructor parameter.

---

## 2. Gates (the sync points)

| Gate | Time | What must be true | Demonstrates |
|---|---|---|---|
| **G0** Interfaces frozen | Fri 05:30 | Table in §1 committed | — |
| **G1** Skeleton live | Fri 09:00 | C: v1 deployed + **verified** (create / approve / buy); B: x402 `POST /verify` paid on Hedera, tx on HashScan; A: dashboard running in mock mode, all three roles | **Hedera core ✔, Whitechain core ✔** |
| **G2** Evidence loop | Fri 15:00 | Agent sees `ShipmentDeclared` → pays → relays → contract Released / Disputed on testnet; score updates match vectors | the heart of the product |
| **G3** Money loop | Fri 19:00 | v4 FINAL deployed; settle / redeem / default work; HCS audit live; dashboard in real mode end to end | full lifecycle |
| **G4** Feature freeze | Fri 23:00 | Seeded Trust history; all e2e scripts green on v4; PROOFS.md complete | demo-ready |
| **G5** Code freeze | Sat 03:30 | Rehearsal done | — |
| **Submit** | Sat 07:30 | Video + README + feedback file in | — |

---

## 3. Lane A: Frontend + Backend (Pratyush)

Stack: Next.js, wagmi + viem + RainbowKit, API route handlers (the "backend"), Tailwind. Client-side GSAP only for the score-change animation.

| ID | Window | Task | Depends on | Tests | Done when |
|---|---|---|---|---|---|
| **A1** | Fri 04:00–06:00 | Scaffold, chain 1874 config, role switcher shell, design tokens, fixtures from shared Zod, `useDeals()` mock adapter, `.github` CI (`pnpm -r test`) | G0 types (stub until 05:30) | build, type-check, lint | each role route renders in mock mode |
| **A2** | 06:00–09:00 | **Exporter:** create-invoice form. **Importer:** approve. **Investor:** deal list with **both Trust Score cards + resulting advance/yield** (using the shared terms math) + buy flow (approve USDT → buy) | A1 | Playwright mock-mode click-through per role | G1 demo in mock |
| **A3** | 09:00–12:00 | **Real mode v1** with C's v1 addresses: read deals, send `createInvoice` / `approve` / `buy`, tx states (pending / confirmed / reverted reason), error states: wrong network, not allowlisted, low USDT / allowance. Explorer links on every tx | C v1 (G1), ABI | e2e with wagmi mock connector (test key, `E2E` flag only) | invoice → approve → buy on the live testnet from the UI |
| **A4** | 12:00–15:00 | **API routes:** `/api/agent-log` (Mirror Node HCS read → decoded `HcsMessage`), `/api/approvals` (proxy to agent), `/api/scenario` (proxy to verifier). **Agent log page** + human-approve button + HashScan links | B6 endpoints (mock until ready), B4 topic id | route tests with recorded fixtures | log renders live HCS messages |
| **A5** | 15:00–19:00 | **Exporter claims form** (3 booleans) → `declareShipment`; result view (Released / Disputed / Cancelled) with **score delta animation**; settle / redeem / refund screens; deal timeline | C v3 (declare/verify), G2 | Playwright full flow in mock; manual on testnet | full lifecycle clickable |
| **A6** | 19:00–23:00 | Real mode on **v4**; demo control panel (verifier scenario switch: honest / fake-weight / fake-docs / fake-status / overcharge / outage); loading / empty / error states; responsive; accessibility basics | v4 (G3) | Playwright smoke on testnet | G4 |
| **A7** | Sat 00:00–03:30 | Rehearsal driver; preload explorer / HashScan tabs; screen layout; script timing | G4 | — | clean 3:45 run |
| **A8** | Sat 03:30–07:30 | Record video (720p+, real voice, no speed-up); assemble README from B and C sections; screenshots; submit | all | checklist in TMB-00 §11 | submitted |

**Mock-first fallback:** if C is late, A keeps demoing in mock mode and records against real data only for the final 3 hours; A is never blocked.

---

## 4. Lane B: AI agent · x402 · Hedera · Trust Code workflow

| ID | Window | Task | Depends on | Tests | Done when |
|---|---|---|---|---|---|
| **B1** | Fri 04:00–05:30 | **`packages/shared`**: Zod schemas, EIP-712 types, **trust-score + terms TS reference** (§4 of TMB-00), golden vectors JSON, `pnpm fixtures:sign` → signed sample responses (valid / forged / expired / reused nonce / wrong chain). **Handoff to C at 05:30** | — | vector self-tests | C can run signature tests with no live service |
| **B2** | 05:30–08:00 | Hedera setup (ECDSA accounts, associate USDC `0.0.429274`, Circle faucet), `services/verifier`: Express + `POST /verify` via `@x402/express`, Blocky402, Bazaar schema; scenarios (honest / fake-weight / fake-docs / fake-status / overcharge 5.00 / outage); EIP-712 signing; `/admin/scenario` | I0 Hedera accounts | unit: scenarios + signature round-trip | verifier answers an unpaid POST with 402 |
| **B3** | 07:00–09:00 | Minimal paying client (`wrapFetchWithPayment`, `setSpendControls`) → decode `PAYMENT-RESPONSE` → HashScan link | B2 | live: `pnpm agent:once` | **HashScan tx ID in README → G1 / Hedera core** |
| **B4** | 09:00–11:00 | **Spending gate** (pure function: `payTo` allowlist, ≤ 1.00 / call, ≤ 2.00 / deal, ≤ 10.00 / day, idempotency, `PENDING_HUMAN`) + persistent store | B3 | gate unit tests (every rule, human queue, never-pays-twice) | green |
| **B5** | 11:00–13:00 | **HCS audit** (Agent Kit `HcsAuditTrailHook` + consensus tools, **90-minute time-box**, fallback `@hiero-ledger/sdk`): topic with submit key, hash-chained messages; `pnpm audit:verify` re-checks the chain | B4 | audit-chain tests | topic visible on HashScan |
| **B6** | 13:00–15:00 | **Watcher + relay:** `ChainAdapter` (mock + real viem), WS subscription to `ShipmentDeclared`, discovery from the unpaid 402, gate → pay → Zod-check → `recoverTypedDataAddress` pre-check → `simulateContract` → `submitVerification`; 429 backoff; **approvals HTTP API** | C v2 (verify fn), B4, B5 | against mock adapter, then live | **G2:** one full happy run on testnet |
| **B7** | 15:00–17:30 | Negative runs: `e2e:cheat` (only exporter drops), `e2e:overcharge` (refused + logged), `e2e:outage` (**no penalty**, refund), `e2e:both-honest` (both rise); parity test: TS reference vs onchain score on the vectors | C v3 | e2e on testnet | script prints PASS + proof links into `docs/PROOFS.md` |
| **B8** | 19:00–21:00 | Re-run all e2e on **v4**; collect final proof links | C v4 (G3) | e2e | PROOFS.md final |
| **B9** | 21:00–23:00 | **Seed script:** onboard importer (fixed Trust Code 80%), 3 quick honest deals so the exporter reaches 80% "High"; leave one fresh wallet pair "Low" for contrast | v4 + C scripts | seed dry-run | G4 |
| **B10** | Sat 00:00–03:30 | Hardening (retry / backoff, logs), rehearsal support; write README sections: payment flow, agent safety, Hedera tx IDs | — | full suite | — |

**Never blocked by C:** B1–B5 need only Hedera. B6 runs on the mock adapter until v2 lands.

---

## 5. Lane C: Whitechain · smart contracts

| ID | Window | Task | Depends on | Tests | Done when |
|---|---|---|---|---|---|
| **C1** | Fri 04:00–04:45 | Foundry scaffold per Whitechain's guide (`solc 0.8.30`, `evm_version prague`, OZ 5.6.x), `ITradeDeals` + `ITrustRegistry` interfaces → **ABI to `packages/shared/abi/` by 04:45**. In parallel: WBT from the faucet, **sponsor USDT from the booth** (`cast call … decimals()`), install `whitechain-dev` skill | — | `forge build` | ABI committed → **unblocks A and B6** |
| **C2** | 04:45–07:00 | `TrustRegistry` (r / s counters, priors, `score()`, `terms()`, importer fixed Trust Code onboarding) | B1 vectors (05:30; write from the spec before that) | golden-vector tests, exact | all vectors pass |
| **C3** | 07:00–09:00 | `TradeDeals` part 1: `createInvoice` (hash uniqueness, terms snapshot), `approve`, ERC-1155 allowlist restrictions in `_update`, `buy()` in USDT (`SafeERC20`), funds locked. **Deploy v1 + verify** on the explorer; `deployments/1874.json` | C2 | double invoice, non-allowlisted buy / transfer, terms by tier, lock | **G1:** verified badge + a real `buy()` tx |
| **C4** | 09:00–12:00 | `declareShipment(claims)` (own `false` claim → cancel, no penalty), `submitVerification(v, sig)` (central EIP-712 verifier: signer, nonce, expiry, chain), compare claims vs response → **Released / Disputed**, call registry updates, `expire()`. **Deploy v2** | B1 fixtures | forged / reused / expired / wrong-chain rejected; only-the-falsifier-drops; all-honest-both-rise; both-falsify-both-drop | v2 deployed, ABI refreshed |
| **C5** | 12:00–15:30 | `settle()` waterfall (investors → fee → exporter), `redeem()` / `refund()` (pull, `nonReentrant`), late / `markDefault()`, importer score updates. **Deploy v3** | C4 | waterfall fuzz (outflows = inflow, no stuck dust), §4.4 cases, default path | v3 deployed |
| **C6** | 15:30–18:00 | Admin scripts: allowlist investors, onboard importer, fund wallets, USDT approvals; security pass (access control, reentrancy, rounding, griefing on `buy` / `refund`); invariants (see TMB-00 A.5) | C5 | invariant suite, coverage report | clean |
| **C7** | 18:00–19:00 | **Deploy v4 FINAL + verify** all contracts; announce addresses; **contract freeze 19:00** | C6 | verified | G3 |
| **C8** | 19:00–23:00 | Proof transactions with the sponsor USDT: buy, release, dispute + refund, settle (in step with B8); draft `WHITECHAIN_FEEDBACK.md` (token missing from the public list, `/api/` suffix, prague pin, faucet limits…) and the "why onchain stablecoin" README line | v4 | explorer links verified | Whitechain proofs complete |
| **C9** | Sat 00:00–03:30 | Support rehearsal; contracts README section (architecture, state machine, limitations) | — | — | — |

---

## 6. Dependency map (critical path)

```
C1 ABI ───────────────▶ A1/A2 (mock UI)      B6 (adapter)
B1 vectors+fixtures ──▶ C2, C4 tests          A2 (terms math)
C3 v1 deploy (09:00) ─▶ A3 real mode          B6 real adapter
C4 v2 (12:00) ────────▶ B6 relay, A5
C5 v3 (15:30) ────────▶ B7 negatives, A5 settle screens
C7 v4 FINAL (18:30) ──▶ B8 proofs, B9 seed, A6 real mode
B4 + B5 + B2 (Hedera) ─▶ independent of C
```
Longest chain: **B1 → C2 → C3 → C4 → C5 → C7 → B8/B9 → rehearsal**. Anything on that chain that slips more than 2 hours triggers the cut list.

## 7. If a lane falls behind (cut list, in order)

| Lane | Cut first → last |
|---|---|
| **A** | score-delta animation → demo panel polish → responsive layout → approve-button UI (keep the API) |
| **B** | Agent Kit hooks (use plain SDK for HCS) → `e2e:outage` → seed beyond 1 deal → Bazaar metadata (keep the 402 price / schema) |
| **C** | `markDefault` UI path (keep the code) → ERC-1155 secondary transfers (keep allowlist) → invariants beyond waterfall + signature |

**Never cut:** x402 payment with the HashScan tx · verified contracts on 1874 · sponsor-USDT buy / release / settle · only-the-falsifier-drops logic · spending gate · HCS log · 2–4 min video · `WHITECHAIN_FEEDBACK.md`.
**Rescue rule:** if a lane is more than 2 hours behind at a gate, the lane that is ahead pairs with it. B is the natural helper for C (shared EIP-712 knowledge), and A is the natural helper for B's dashboard-facing endpoints.

## 8. Sponsor-track ownership

| Requirement | Lane | Task | Proof |
|---|---|---|---|
| **Hedera:** x402 endpoint settling via a listed facilitator | B | B2–B3 | HashScan tx |
| **Hedera:** agent pays with no human | B | B6 | e2e log + HashScan |
| **Hedera:** README (setup, architecture, payment flow, tx ID) | B → A assembles | B10, A8 | README |
| **Hedera:** video with settlement + HashScan link | A | A8 | video step 4 |
| **Hedera extras:** spending controls / allowlist / human approval | B (+A button) | B4, B6, A4 | gate tests, UI |
| **Hedera extras:** HCS audit log · USDC · Agent Kit | B | B5, B3 | topic on HashScan |
| **Whitechain:** contracts deployed on 1874 + verified | C | C3, C7 | explorer badges |
| **Whitechain:** sponsor-USDT payment in the main flow | C (+B e2e) | C3, C8 | buy / release / settle txs |
| **Whitechain:** real transfer rules in the contract | C | C3–C5 | revert tests, txs |
| **Whitechain:** README line "why onchain stablecoin" | C → A | C8, A8 | README |
| **Whitechain:** steady commits, README, limitations | all | every task | commit history |
| **Whitechain:** 2–4 min video showing each party | A | A8 | video |
| **Whitechain:** `WHITECHAIN_FEEDBACK.md` | C | C8 | file |
| **ETHGlobal:** AI use disclosed, plan files in repo | A | A1 | `AI_USAGE.md`, `docs/plans/` |

## 9. Test strategy by lane

| Lane | Unit | Integration | Live (testnet) |
|---|---|---|---|
| **A** | component + hook tests | Playwright (mock mode) | Playwright smoke with wagmi mock connector + manual run |
| **B** | gate, scenarios, vectors, audit chain | agent ↔ mock adapter | `agent:once`, `e2e:happy / cheat / overcharge / outage / both-honest` |
| **C** | golden vectors, per-function | fuzz + invariants, TS-signed fixtures | verify on explorer, proof txs |

"Done" for every task: tests green → committed → pushed → proof link (if any) pasted into `docs/PROOFS.md`.

## 10. Open items
1. **Names for lanes B and C.** The Solidity-strongest person takes C.
2. **Where code runs.** This workspace can't run Foundry or reach testnets. Each lane runs its own commands on its own computer. I can also draft and review code through the desktop app, with the repo folder connected.
3. **Sponsor USDT** from the Whitechain booth is the one external dependency. Without it v4 can't be finalised, so assign someone to get it first.
