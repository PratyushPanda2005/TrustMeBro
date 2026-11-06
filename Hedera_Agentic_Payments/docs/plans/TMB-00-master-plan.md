# TrustMeBro: final build plan (v4, simplified)

**ETHGlobal Mumbai 2026 · Whitechain "Tokenize · Real World Finance" + Hedera "AI Agents That Pay: x402"**
Status: **FINAL, waiting for approval.** v4 has five actors only (investor, exporter, importer, x402, agent), a claims-based check, a weighted Trust Score, and the shipping `/info` and extra data sources removed.
Research behind it: `reports/TrustMeBro track and docs research.md`, `reports/TrustMeBro trust score and x402 claims.md`.

> ⏰ **Submission closes Sat Nov 7, 09:00 IST, and late entries aren't accepted** [ETH-INFO]. Hacking is live, so code starts now. Our own cut-off is **07:30 IST**.

---

## 1. Selling point

**"Investors replace the bank, and honesty sets the price."**

- **Exporters are paid in minutes, not 60 days.** Investors fund the invoice in USDT on Whitechain. The money is locked by code and released the moment an AI agent has **paid for** an independent check that the exporter's shipment claims are true.
- **Lying is unprofitable and permanent.** Every claim is checked, and the result changes an **onchain Trust Score**. An honest exporter climbs toward a **90% advance**; a cheat drops to 60% and gets refunded nothing. A reliable importer brings investor yield down toward **2%**; a defaulter pushes it up to 5%.
- **The AI can't cheat either.** The agent only pays for the check and delivers the result. The answer is signed by the verifier, and the **contract** compares it to the claims. Spending limits and a public Hedera audit log keep the agent on a leash.
- **Why it matters:** the trade-finance gap for small exporters is about **US$2.5 trillion** (ADB). Banks find small deals too slow and expensive to bother with. TrustMeBro makes them worth financing.

One line for judges: **"Your shipment claims are your collateral: an AI agent pays to check them, the contract releases the money only if they're true, and your Trust Score remembers."**

## 2. The five actors

| Actor | What they do | Where |
|---|---|---|
| **Exporter** (Ravi) | Creates the invoice; after shipping, declares **claims** `{weight, status_code, document_verification}` (all booleans) | Whitechain |
| **Importer** (Ahmed) | Approves the invoice onchain (accepts the debt); pays on the due date. Starts with a **fixed Trust Code** set at onboarding | Whitechain |
| **Investor** | Sees the deal plus both Trust Scores and the terms they set; buys restricted fractional tokens with **sponsor USDT**; gets principal + yield | Whitechain |
| **x402 verification API** | `POST /verify`: a paid endpoint (0.30 USDC on Hedera) that returns the **observed** `{weight, status_code, document_verification}`, EIP-712-signed | Hedera (payment) |
| **AI agent** | Sees the claims onchain → pays `/verify` via x402 with no human → checks the answer → relays it to Whitechain → logs everything to HCS | Hedera + Whitechain |

> The `/verify` endpoint is the only paid service. It has to stay because the Hedera track requires at least one x402-protected endpoint [ETH-PRIZES]. Our team runs it with simulated shipment data, and the README says so honestly.

## 3. End-to-end flow

1. **Create.** Ravi creates an invoice: amount (e.g. 30,000 USDT), goods, due date, importer address. The contract stores a hash of the invoice, so the same invoice can never be financed twice.
2. **Approve.** Ahmed approves it onchain. Nothing continues without this.
3. **Price.** The contract reads both Trust Scores and **fixes the terms**: advance % (from the exporter's score) and investor yield (from the importer's score).
4. **Fund.** Allowlisted investors buy fractional deal tokens with sponsor USDT. The money is **locked** in the contract. State: Funded.
5. **Ship + claim.** Ravi ships and submits his claims `{weight: true, status_code: true, document_verification: true}` onchain.
   - If Ravi himself claims any `false`, the deal is cancelled and investors are refunded. **No penalty**, because he told the truth.
6. **402 is triggered.** The agent sees "all claims true + shipped" → runs its spending checks → calls `POST /verify` → gets **402 Payment Required** → pays 0.30 USDC on Hedera through the facilitator → receives the signed observed result.
7. **Match → release.** The agent relays the signed result to Whitechain. The contract checks the signature, then compares **response vs claims**:
   - **All three match** → **Released**: the advance in USDT goes to Ravi's wallet, and Ravi's Trust Score rises.
   - **Any claim true but observed false** → **Disputed**: investors get 100% back, and **only Ravi's** score drops (weighted by which claim he faked).
8. **Settle.** On the due date Ahmed pays the full invoice in USDT. The contract splits it: **investors (principal + yield) → platform fee → Ravi (the rest)**. Ahmed's score rises.
   - Ahmed doesn't pay by due date + grace → **Defaulted**, and **only Ahmed's** score drops.

**Score rule (yours, exactly):** both honest → both rise · one falsified → only that one drops · both falsified → both drop.

## 4. Trust Score: the maths

### 4.1 Each deal: weighted average of the three checks
For each factor *i* ∈ {weight, status_code, document_verification}, with weight **wᵢ**:

| Factor | Weight wᵢ | Why |
|---|---|---|
| weight | **0.40** | A weight/quantity mismatch is the clearest sign of short-shipment fraud. Weighing containers is mandatory by law (SOLAS VGM) |
| document_verification | **0.35** | Trade finance pays on documents (UCP 600), but many document mismatches are clerical |
| status_code | **0.25** | Status/timing mismatches are the most common and often innocent (tracking lag) |

Each factor is scored by comparing the **claim cᵢ** with the **observed result vᵢ**:
- **Match** (cᵢ = vᵢ) → earns wᵢ
- **Falsified** (claimed true, observed false) → penalty **2 × wᵢ**
- **Understated** (claimed false, observed true) → 0, neutral

**Deal score:** `d = Σ wᵢ · matchᵢ` (a weighted average between 0 and 1). An all-match deal gives d = 1.0.

### 4.2 Over time: a smoothed weighted average (so the rule always holds)
Each party keeps two counters: **r** (good evidence) and **s** (bad evidence).

- Honest deal → `r += d`
- Falsified deal → `s += 1 + Σ 2·wᵢ` (over the falsified factors only)

**Trust Score = (r + A) / (r + s + A + B)**

**A** and **B** are the starting point:
- **Exporter:** A = B = 1, so a new exporter starts at **50%**.
- **Importer:** the **fixed Trust Code** T₀ from onboarding becomes the starting point: A = 2·T₀, B = 2·(1 − T₀). For example, T₀ = 80% gives A = 1.6, B = 0.4.

Importer evidence:
- Paid on time → r += 1
- Paid late, within grace → r += 0.5, s += 0.25
- Defaulted → s += 3

Why this shape and not a plain running average: a plain average can **lower** an honest party's score (an imperfect deal below their average) or **raise** a cheater's. Here honest deals only add to r and lies only add to s, so the rule holds mathematically (Beta reputation model, Jøsang & Ismail 2002).

**Exporter numbers:**
- New exporter: 50.00%.
- Honest deals 1→5: 66.66 → 75.00 → 80.00 → 83.33 → 85.71%.
- One faked weight from new: 26.31%. After 5 honest deals: 68.18%.

### 4.3 Score → deal terms (linear, clamped to scores 50–90%)
- **Advance %** (from the exporter's score) = 60% + (score − 50%) × 0.75 → **60% … 90%**
- **Investor yield** (from the importer's score) = 5% − (score − 50%) × 0.075 → **5% … 2%**

| Score | Advance | Yield | UI badge |
|---|---|---|---|
| ≤ 50% (new or caught lying) | 60.0% | 5.00% | Low |
| 66.7% (1 honest deal) | 72.5% | 3.75% | Medium |
| 80% (3 honest deals) | 82.5% | 2.75% | High |
| ≥ 90% | 90.0% | 2.00% | High |

**Terms are fixed when the deal is created**, so a score change never reprices money that's already funded. The badge shows **High from 75%**.

### 4.4 Worked deal (30,000 USDT invoice, 150 USDT platform fee)

| Case | Advance → Ravi | Investors get back | Fee | Ravi at settlement | Ravi total |
|---|---|---|---|---|---|
| New exporter (50%) + importer T₀ = 80% | 60% = 18,000 | 18,000 + 2.75% = 18,495 | 150 | 11,355 | 29,355 |
| Veteran exporter (≥90%) + reliable importer (≥90%) | 90% = 27,000 | 27,000 + 2% = 27,540 | 150 | 2,310 | 29,310 |
| Cheat: claims weight true, observed false | 0 (locked funds refunded) | 18,000 refund | 0 | 0 | 0, and the score drops 50% → 26.31% |

### 4.5 Solidity (integer basis points; 10,000 = 100%)
```solidity
uint256 constant BPS = 10_000;
uint256 constant W_WEIGHT = 4_000; uint256 constant W_STATUS = 2_500; uint256 constant W_DOCS = 3_500;
struct Rep { uint128 r; uint128 s; uint128 a; uint128 b; } // a,b = prior (bps)

function _factor(bool c, bool v, uint256 w) pure returns (uint256 pos, uint256 neg) {
    if (c == v) return (w, 0);              // match
    if (c && !v) return (0, 2 * w);         // falsified
    return (0, 0);                          // understated
}
function score(Rep memory R) pure returns (uint256) {          // bps
    return (uint256(R.r) + R.a) * BPS / (uint256(R.r) + R.s + R.a + R.b);
}
function terms(uint256 expScore, uint256 impScore) pure returns (uint256 advBps, uint256 yieldBps) {
    uint256 e = clamp(expScore, 5_000, 9_000); uint256 i = clamp(impScore, 5_000, 9_000);
    advBps   = 6_000 + (e - 5_000) * 3_000 / 4_000;
    yieldBps =   500 - (i - 5_000) *   300 / 4_000;
}
// honest deal: r += Σpos ; falsified: s += BPS + Σneg
```
Each update also emits an ERC-8004-style `Feedback(subject, dealId, scoreBps, tag)` event, which gives us a standards story at no extra cost.

## 5. The x402 claims check

**Endpoint:** `POST /verify` on Express, with `@x402/express` `paymentMiddleware` and the route key `"POST /verify"` [HX-MERCHANT] [HX-REPO]:
- price: `"$0.30"` → testnet USDC `0.0.429274` (6 dp)
- network: `hedera:testnet`
- payTo: the verifier's Hedera account
- facilitator: **Blocky402** `https://api.testnet.blocky402.com` (fallback `https://x402.org/facilitator`) [HX-FAC]

**Request body:** `{ dealId, claims: {weight, status_code, document_verification}, shipmentRef }`
**Discovery:** the Bazaar extension `declareDiscoveryExtension({ bodyType: "json", input, inputSchema, output })`, so the agent learns the price and schema from the unpaid 402.

**What happens on the wire:**
1. The agent sends the unpaid POST and gets back `402` + `PAYMENT-REQUIRED`.
2. The agent runs its own **spending checks** (§7).
3. `wrapFetchWithPayment` re-sends the **same POST body** with `PAYMENT-SIGNATURE` (a partly signed Hedera transfer; the facilitator pays the fee).
4. The server returns `200` + `PAYMENT-RESPONSE`.
5. The settled Hedera tx ID is in `transaction` (also accept `transactionId`). HashScan: `https://hashscan.io/testnet/transaction/<id>`.

A bad request (400 or above) is **not charged**, because settlement happens only on success.

**Signed response (EIP-712, checked on Whitechain):**
`Verification { bytes32 dealId; bool weight; bool statusCode; bool documents; uint256 nonce; uint256 expiry }`
- Domain: `{ name: "TrustMeBro", version: "1", chainId: 1874, verifyingContract: TradeDeals }`. The chainId is Whitechain's 1874, **not** Hedera's 296.
- Field names must match exactly (`statusCode`, not `status_code`). Map them in one place in `packages/shared`.
- viem `signTypedData` (server) ↔ OpenZeppelin `EIP712` + `ECDSA` (contract). The contract checks the signer is the approved verifier, the nonce is unused, and the expiry hasn't passed.

**Hedera tx ID:** settlement happens after the handler signs, so the tx ID can't sit inside the signed struct. The agent writes `{dealId, hederaTxId, payer, verificationHash, whitechainTx}` to the **HCS audit topic**, which links the two chains publicly.

## 6. Contracts (Whitechain, two only)

| Contract | Holds |
|---|---|
| `TrustRegistry` | `Rep` per party; `score()`, `terms()`; importer onboarding with a fixed Trust Code (admin); writable only by `TradeDeals` |
| `TradeDeals` (ERC-1155, one token id per deal) | Invoice hash uniqueness; importer approval; **investor allowlist enforced in `_update`** (restricted transfers); `buy()` in sponsor USDT (`SafeERC20`); `declareShipment(claims)`; `submitVerification(v, sig)`; `settle()`; `redeem()`/`refund()` (pull, `nonReentrant`); `markDefault()`; `expire()` (no verification by the deadline → refund, no score change) |

**States:** Created → Approved → Funding → Funded → Shipped → Released → Settled, plus Cancelled, Disputed, Expired, Defaulted.
**Durations** are deal parameters, so the demo uses minutes (labelled "compressed time"). The **USDT address is a constructor parameter.**

## 7. Agent safety (mistakes, hallucination, overspending)

- **No LLM on the money path.** The agent is plain TypeScript with fixed rules. It pays for data and delivers it; it never judges. The **contract** judges.
- **Spending gate before every payment:** `payTo` allowlist · ≤ 1.00 USDC per call · ≤ 2.00 per deal · ≤ 10.00 per day · never pays twice for the same deal · anything above the cap → `PENDING_HUMAN` (approve button in the dashboard). Plus `client.setSpendControls({ maxAmountPerPayment: "$1" })`.
- **Checked twice:**
  - Off-chain: Zod-validate the 402 quote and the response, recover the signer, and `simulateContract` before sending.
  - Onchain: the contract re-checks everything.
- **Failure handling:** a timeout or missing data means no verdict and no penalty. The deadline passes → Expired → refund.
- **Audit:** every quote, payment, refusal and relay goes to an **HCS topic with a submit key**, including a hash of the previous message. The topic is created and written through **Hedera Agent Kit** (`HcsAuditTrailHook` + consensus tools, no LLM; 90-minute time-box), falling back to plain `@hiero-ledger/sdk`. Agent Kit has no spending-limit or x402 support, so our gate is the real control [HX-KIT].

## 8. Stack and exact values

| Area | Values |
|---|---|
| Whitechain [WC-REF] | Chain **1874** · RPC `https://rpc.testnet.whitechain.io` · WS `wss://rpc.testnet.whitechain.io/ws` · explorer `https://explorer.testnet.whitechain.io` (Blockscout) · WBT gas · 50 req/s per IP |
| Foundry [WC-FOUNDRY] | `solc = "0.8.30"`, `evm_version = "prague"` · verify `--verifier blockscout --verifier-url https://explorer.testnet.whitechain.io/api/` (**trailing `/api/`**) · OpenZeppelin 5.6.x |
| Faucet [WC-FAUCET] | 0.5 WBT / 24 h, GitHub ≥30 days, per-IP limit, so claim from different networks |
| USDT [ETH-PRIZES] | **`0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`** (required). It's not on Whitechain's public token list [WC-TOKENS], so get it from the Whitechain booth and check `decimals()` |
| Whitechain helper [WC-SKILL] | `npx skills add whitechain-labs/skills --skill whitechain-dev` |
| x402 [HX-REPO] | `@x402/core` `@x402/hedera` `@x402/express` `@x402/fetch` `@x402/extensions` (2.30.0) · import `PrivateKey` **from `@x402/hedera`** (a second SDK copy crashes) · ECDSA keys |
| Hedera accounts | agent + verifier + audit operator; **associate USDC `0.0.429274` before** the Circle faucet; `payTo` = plain `0.0.x` |
| Agent Kit [HX-KIT] | `@hashgraph/hedera-agent-kit` v4 (`/hooks`, `/policies`, `/plugins`) |
| Dashboard | Next.js + wagmi + viem + RainbowKit; custom chain 1874; HCS via Mirror Node `testnet.mirrornode.hedera.com/api/v1/topics/<id>/messages` |

## 9. Repo

```
trustmebro/
  contracts/          Foundry: TrustRegistry, TradeDeals, tests, Deploy script
  services/verifier/  x402 POST /verify (Express) + EIP-712 signer + demo scenarios (honest / fake-weight / fake-docs)
  services/agent/     watcher, spending gate, x402 client, relay, HCS audit
  apps/web/           dashboard: Exporter · Importer · Investor · Agent log
  packages/shared/    EIP-712 types, Zod schemas, ABIs, chain config, terms math (TS mirror of Solidity)
  docs/               plans/, PROOFS.md (every live tx link)
  README.md  WHITECHAIN_FEEDBACK.md  AI_USAGE.md
```

## 10. Iterations
Each one is **goal → tasks → tests → live onchain proof → commit + push**. Three lanes: **SC** (contracts), **BE** (verifier + agent), **FE** (dashboard, Pratyush).

| # | When (IST) | Lane | Goal | Tests | Live proof |
|---|---|---|---|---|---|
| **I0** | Fri 03:00–04:00 | all | Public repo, plan + `AI_USAGE.md` committed; WBT from the faucet; sponsor USDT from the booth (`cast call … decimals()`); Hedera accounts + USDC association + Circle USDC; `curl` Blocky402 `/supported`; `npm view @x402/hedera`; check `cast chain-id` = 1874 | — | chain-id, balances |
| **I1** | 04:00–07:00 | BE | `POST /verify` with x402 + a minimal agent paying it | Zod schemas; live `pnpm agent:once` | **HashScan tx ID** → README. *Hedera core met* |
| **I2** | 04:00–09:00 | SC | `TrustRegistry` (formula §4) + `TradeDeals` create/approve/terms/allowlist/buy; deploy + **verify** | Score table §4.2 exact; terms table §4.3; double invoice rejected; non-allowlisted buy/transfer rejected | Verified contracts + **sponsor-USDT `buy()` tx**. *Whitechain core met* |
| **I3** | 09:00–13:00 | SC + BE | Claims + verification: `declareShipment`, EIP-712 `submitVerification`, Released / Disputed / Cancelled / Expired, score updates | **TS-signs → Solidity-verifies** round trip; forged/reused/expired sig rejected; each claim-mismatch case §4.1; "only the falsifier drops" | **Release tx** + **Disputed + refund tx** |
| **I4** | 13:00–17:00 | BE | Autonomous agent: watcher (WS), spending gate, human queue, pre-checks, relay, HCS audit (Agent Kit time-box) | Gate rules; never pays twice; timeout = no penalty | One full run: Whitechain event → Hedera payment → Whitechain release, plus **HCS topic on HashScan**; a 5.00 quote refused |
| **I5** | 17:00–20:00 | SC | `settle()` waterfall, `redeem()`, late/default, importer score | Waterfall fuzz (outflows = inflow, investors first); §4.4 cases | **Settlement split tx**; importer score change |
| **I6** | 04:00–22:00 | FE | Dashboard: role switcher; invoice form; approve; **investor list with both Trust Scores + terms**; buy; claims form; deal timeline with explorer/HashScan links; agent log; approve button; error states (wrong network, not allowlisted, low USDT) | Playwright happy-path smoke test | Clicking through the live testnet deals |
| **I7** | 20:00–00:00 | all | Buffer: fix bugs, polish, README draft, **seed real history** (3 quick honest deals → exporter 80%, "High") | full test suite green | `PROOFS.md` complete |
| **I8** | Sat 00:00–07:30 | all | Rehearse → **code freeze 03:30** → record video → README, `WHITECHAIN_FEEDBACK.md` → **submit 07:30** | — | Submission done |

**Video (≤ 3:45, 720p+, real voice, no speed-up)** [ETH-INFO]:
1. Problem (15 s)
2. Ravi creates, Ahmed approves (30 s)
3. Investor sees both Trust Scores and terms, buys with USDT (30 s)
4. Ravi claims; the agent pays the 402 and the **HashScan settlement** shows on screen (40 s)
5. Match → USDT released and score up (20 s)
6. Cheat run: weight faked → Disputed, refund, only Ravi's score drops (35 s)
7. Ahmed pays → waterfall split (25 s)
8. Guardrail refuses the 5.00 quote, plus the HCS log (20 s)
9. Close (15 s)

## 11. Qualification checklist (each item → where it's met)

**Hedera x402** [ETH-PRIZES]
| Requirement | Met in | Proof |
|---|---|---|
| x402 endpoint settling on Hedera testnet through a listed facilitator | I1 | `POST /verify` via Blocky402, on HashScan |
| Agent finds the endpoint and completes a paid request with no human | I1, I4 | discovery from the 402/Bazaar; watcher run |
| Public repo, README with setup, architecture, payment flow + Hedera tx ID | I0, I8 | README "Payment flow" |
| Demo video ≤ 5 min with settlement + HashScan link | I8 | video step 4 |
| *Extra:* spending controls / allowlist / human approval above a limit | I4 | gate + approve button |
| *Extra:* HCS topic as a tamper-evident spend log | I4 | topic link |
| *Extra:* settles in an HTS token (USDC) | I1 | USDC `0.0.429274` |
| *Extra:* Hedera Agent Kit | I4 | audit hook / consensus tools |
| *Extra:* agent identity / reputation | §4.5 | ERC-8004-style feedback events (bonus, not the main pitch) |

**Whitechain Tokenize** [ETH-PRIZES]
| Requirement | Met in | Proof |
|---|---|---|
| Deployed on chain 1874 **and verified** on the explorer | I2 | verified badges |
| ≥1 payment in **USDT `0xcedf…55a7`** in the main flow, explorer link in README | I2, I3, I5 | buy / release / settle txs |
| README line: why onchain stablecoin settlement | I8 | *"Investor USDT is held by code and released only when a signed shipment check matches the exporter's claims, then repaid in one atomic waterfall, 24/7 and publicly auditable. A bank wire can't hold money conditionally on a cryptographic proof or split it atomically between investors, platform and exporter."* |
| Public repo with steady progress; README with setup, architecture, limitations | every task | commit history |
| 2–4 min video showing each party | I8 | exporter, importer, investor, agent, all on screen |
| `WHITECHAIN_FEEDBACK.md` | I8 (notes from I0) | file |
| Real rules in the contract (not a token with a mint button) | I2–I5 | allowlist, restricted transfers, lock-until-verified, maturity, waterfall, default |

**ETHGlobal rules** [ETH-INFO]: fresh code (repo created during the event) · commit + push every task · AI use + plan files in the repo · Whitechain + Hedera = 2 of the 3 partner-prize slots · one 2–4 min video.

## 12. Risks

| Risk | Mitigation |
|---|---|
| Sponsor USDT scarce, or it behaves unlike the official USDT.e | Booth in I0; check it with `cast`; amounts scale down (e.g. a 30 USDT invoice); the address is a constructor param |
| Contract verification fails | Exact solc 0.8.30 / prague; `/api/` suffix; then `forge verify-contract`; then Standard-JSON upload on the explorer |
| EIP-712 mismatch ("bad sig") | Round-trip test in I3 before anything else uses it; types live in `packages/shared` |
| `@x402/*` not on npm / Blocky402 down | Check in I0; git dependency; x402.org facilitator (one env var) |
| Agent Kit without an LLM doesn't work | 90-minute time-box, then plain SDK for HCS |
| Testnet flakiness on recording day | Record from the 02:00 rehearsal; all links kept in `PROOFS.md` |
| This workspace can't run Foundry or reach testnets | Build on your computer via the Claude desktop app, or teammates run the commands |

## 13. Need from you to start
1. Approve v4.
2. The importer's fixed Trust Code at onboarding: **80%** OK?
3. Repo name + who owns the SC and BE lanes.
4. Build on your computer through the desktop app (open this chat there with the repo folder connected)?

---

## Sources (checked Nov 6, 2026)

**Event:** [ETH-PRIZES] https://ethglobal.com/events/mumbai/prizes · [ETH-INFO] https://ethglobal.com/events/mumbai/info/details

**Whitechain**
- [WC-DOCS] https://docs.whitechain.io/
- [WC-REF] network reference: https://docs.whitechain.io/learn/network/reference.md
- [WC-FAUCET] https://docs.whitechain.io/learn/get-started/get-testnet-wbt.md · https://faucet.testnet.whitechain.io/
- [WC-FOUNDRY] https://docs.whitechain.io/build/deploy/deploy-with-foundry.md · Hardhat: https://docs.whitechain.io/build/deploy/deploy-with-hardhat.md
- [WC-EXPLORER] https://docs.whitechain.io/build/block-explorer/overview.md · https://explorer.testnet.whitechain.io/ · API: https://explorer.testnet.whitechain.io/api-docs
- [WC-TOKENS] https://docs.whitechain.io/build/block-explorer/token-list.md · [WC-BRIDGE] https://docs.whitechain.io/build/bridge/portal-bridge.md
- [WC-WALLET] https://docs.whitechain.io/learn/get-started/connect-wallet.md · [WC-SKILL] https://docs.whitechain.io/build-with-ai/claude-skills.md
- OP Stack: https://docs.optimism.io/ · Ankr RPC (backup): https://www.ankr.com/rpc/?utm_referral=Whitechain2026

**Hedera**
- [HX-DOCS] https://docs.hedera.com/solutions/ai/x402 · how it works: https://docs.hedera.com/solutions/ai/x402/how-it-works · pay: https://docs.hedera.com/solutions/ai/x402/pay-with-x402
- [HX-MERCHANT] https://docs.hedera.com/solutions/ai/x402/merchant-integration · [HX-FAC] https://docs.hedera.com/solutions/ai/x402/facilitators · exact scheme: https://docs.hedera.com/solutions/ai/x402/exact-scheme
- [HX-REPO] https://github.com/x402-foundation/x402 · blog: https://hedera.com/blog/hedera-and-the-x402-payment-standard/
- [HX-KIT] https://docs.hedera.com/solutions/ai/agent-kit · MCP: https://docs.hedera.com/solutions/ai/hosted-mcp-server · Scaffold HBAR: https://docs.hedera.com/solutions/tools/scaffold-hbar
- Faucets: https://portal.hedera.com/ · https://faucet.circle.com/

**Trust Score**
- Jøsang & Ismail, "The Beta Reputation System" (2002)
- ERC-8004 (Trustless Agents, reputation registry): https://eips.ethereum.org/EIPS/eip-8004
- ICC UCP 600 / document refusal statistics; IMO SOLAS VGM container weighing rule
- Factoring advance rates 70–90%: https://resolvepay.com/blog/13-statistics-revealing-average-advance-rate-ceilings-in-invoice-finance
- ADB Trade Finance Gap Survey: https://www.adb.org/publications/adb-global-trade-finance-gap-survey

**Libraries:** OpenZeppelin 5.x https://docs.openzeppelin.com/contracts/5.x/ · Foundry verify https://getfoundry.sh/forge/reference/forge-verify-contract · viem typed data https://viem.sh/docs/actions/wallet/signTypedData
