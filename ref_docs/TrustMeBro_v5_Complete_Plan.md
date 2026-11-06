# TrustMeBro — Complete Plan (v5)

**ETHGlobal Mumbai 2026 · Whitechain "Tokenize · Real World Finance" + Hedera "AI Agents That Pay: x402"**
Written: Fri 6 Nov 2026. This file has *everything* agreed so far, so work can continue in a new folder / new chat.

> ⏰ **Submission closes Sat 7 Nov 2026, 09:00 IST. No late entries.** Our own cut-off: **07:30 IST**. Code freeze **03:30 IST**.

---

## 0. Decision log (how we got here)

| # | Decision | Status |
|---|---|---|
| 1 | Investors replace the bank as the financier of export invoices | Agreed |
| 2 | Two tracks together: Whitechain (USDT settlement, tokenized receivable) + Hedera (agent pays x402 API) | Agreed |
| 3 | Name changed from *TradePilot* to *TrustMeBro* | Agreed (repo name still open) |
| 4 | Only 5 actors: exporter, importer, investor, x402 verification API, AI agent | Agreed |
| 5 | Exporter claims are **values** (weight kg, status, document hash), not true/false | Agreed |
| 6 | Agent pays for the information; the **contract** compares claim vs observed | Agreed |
| 7 | **No product quality check** — importer makes no quality claim | Agreed |
| 8 | Trust Score uses the Beta formula `(r + A) / (r + s + A + B)` with weights 40/35/25 | Agreed |
| 9 | Odd events change the score **only through the formula** (no admin "set score") | Agreed |
| 10 | **One KYC = one address** | Agreed |
| 11 | **Advance = invoice × exporter Trust Score** (100,000 at 70% → 70,000), cap 90% | Agreed |
| 12 | **Only one investor per deal** (no fractions) | Agreed |
| 13 | Agent pays the check **right after the exporter's shipment claim**, before any investor. Investor sees the paid results, then funds | Agreed |
| 14 | Importer has a **risk score %** = investor's profit on the deal (e.g. 4%) — worse if paid late | Agreed |
| 15 | **Platform fee = 1% of what the investor pays**, taken at funding; the exporter gets the rest | Agreed |
| 16 | The 1% is split: AI agent wallet → transaction (gas) fee → other fee → remainder = platform profit | Agreed (amounts assumed, see §13) |
| 17 | At the due date: importer pays → investor gets principal + yield first → exporter gets the rest | Agreed |
| 18 | USDT for testing: get WBT → swap to USDT on Whitechain testnet → add token to wallet | Agreed (check address!) |

---

## 1. The idea in one breath

**"Investors replace the bank, and honesty sets the price."**

- A small exporter (Ravi, Indian textile exporter) ships goods to an importer (Ahmed, Dubai) who pays in 60 days. Ravi needs cash **now**.
- Ravi's claims about the shipment (weight, status, documents) are **checked by an AI agent that pays for independent data** through x402 on Hedera.
- If the claims are true, **one investor** can finance the invoice in **USDT on Whitechain**. How much Ravi gets depends on his **Trust Score** (like a CIBIL score for trade). How much the investor earns depends on the importer's **risk score**.
- On the due date Ahmed pays the contract; the contract pays the investor first and Ravi the rest.
- Lying is caught by the contract and **permanently lowers the liar's score**, which lowers the money they can get next time.

**One line for judges:** *"Your shipment claims are your collateral: an AI agent pays to check them, the contract decides if they're true, and your Trust Score remembers."*

**Why it matters:** the trade-finance gap for small exporters is about **US$2.5 trillion** (ADB). Banks find small deals too slow and costly. Real-world cousins: Drip Capital, TReDS, Centrifuge, Polytrade. Onchain prior art: **Facture** (ETHOnline 2026, invoice bonds + x402 as settlement) — we differ by checking the *shipment itself* before money moves, an agent *buying evidence*, and an onchain reputation that prices the deal. Name Facture in the README.

### Simple Indian analogies (for the video / pitch)
- **Trust Score** = CIBIL score: pay honestly → score up → bigger loan next time.
- **1% platform fee** = home-loan processing fee, cut from the loan amount at the start.
- **Agent paying x402** = paying ₹20 at a cyber café for a printout — tiny automatic payment for exactly one piece of information.
- **Verifier check** = RTO / weighbridge check before the truck is allowed through.

---

## 2. The five actors

| Actor | Example | What they do | Chain |
|---|---|---|---|
| **Exporter** | Ravi | Creates invoice; after shipping declares claims `{weight kg, status, document hash}`; receives advance and the remainder | Whitechain |
| **Importer** | Ahmed | Approves the invoice (accepts the debt, agrees T&C "pay to the contract"); pays on due date | Whitechain |
| **Investor** | Priya | Sees the deal, both scores and the paid evidence; funds the advance in USDT; holds the receivable NFT; gets principal + yield | Whitechain |
| **x402 verification API** | our `POST /verify` | Paid endpoint (0.30 USDC on Hedera). Returns **observed** weight, status, document hash, signed (EIP-712) | Hedera (payment) |
| **AI agent** | our TypeScript bot | Sees the claim → spending checks → pays `/verify` with no human → relays the signed answer to Whitechain → logs everything to HCS | Hedera + Whitechain |

Plus **Admin (us)**: KYC allowlist (one KYC = one address + role), sets importer's starting trust at onboarding. Admin **cannot** change scores directly.

The shipping company / carrier is a real-world third party, **not** an onchain actor. Their data reaches us only through the verifier.

---

## 3. End-to-end flow

1. **KYC.** Admin allowlists Ravi (exporter), Ahmed (importer), Priya (investor). One KYC = one address = one role.
2. **Create.** Ravi creates the invoice: amount (100,000 USDT), goods, due date, Ahmed's address, `termsHash` (hash of the T&C PDF). Contract stores `invoiceHash` → the same invoice can never be financed twice. Contract checks Ravi's **credit limit** (§5.4).
3. **Approve.** Ahmed approves onchain. T&C say: *"payment goes to the TrustMeBro contract address"* (notice of assignment). Nothing continues without this.
4. **Ship + claim.** Ravi hands the container to the carrier and declares onchain:
   `declaredKg = 10,000`, `status = LOADED (3)`, `docHash = keccak256(invoice + packing list + bill of lading)`.
   State → **Claimed**.
5. **Agent pays for the check (x402).** Agent sees the `Claimed` event → runs spending gate → `POST /verify` → gets **402 Payment Required** → pays **0.30 USDC on Hedera** via Blocky402 → gets observed facts signed by the verifier → logs Hedera tx ID to HCS → sends `submitVerification` to Whitechain.
6. **Contract decides.**
   - All match → **Verified**. The deal is listed for investors with the evidence.
   - Status not yet reached (tracking lag) → **Pending**, agent checks again later (max 3 checks per deal).
   - A value faked → **Rejected**, Ravi's score drops. **No investor money ever moved.**
7. **Investor funds.** Priya looks at the evidence (weight reading, status, document files in the dashboard; hashes onchain), both scores and the terms, then calls `fund()`:
   - Advance = 100,000 × Ravi's score (say 70%) = **70,000 USDT** from Priya.
   - 1% fee = **700** is split (agent wallet / gas / reserve / platform profit, §6).
   - Ravi receives **69,300 USDT** immediately.
   - Priya receives the **receivable NFT** (only transferable to other KYC'd investors).
   - Terms are frozen now (advance %, yield %).
8. **Due date.** Ahmed pays 100,000 USDT to the contract. Contract pays **Priya 72,800** (70,000 + 4%) first, then **Ravi 27,200**. Ahmed's score goes up; Ravi gets his positive credit for an honest, completed deal.
9. **Late / default.** Paid after due date but within grace → paid normally, Ahmed's score drops a little by days late. Not paid by end of grace → **Defaulted**, Ahmed's score drops a lot. (Investor carries the loss; reserve fund may help, §6.)
10. **Expire.** Verified but nobody funds within the listing window → **Expired**, no score change.

### Score rule (from the user, exact)
- Exporter honest + importer pays → **both rise**.
- Exporter lies → **only exporter drops**.
- Importer late/defaults → **only importer drops**.
- Both bad → **both drop**.

### State machine
```
Created → Approved → Claimed → (Pending ↺) → Verified → Funded → Settled
                         ↘ Rejected (lied, score down)      ↘ Defaulted (importer score down)
                         ↘ Mismatch (under-declared weight, no penalty)
             Verified → Expired (no investor in time, no score change)
```
All durations (verification deadline, listing window, due date, grace) are **deal parameters**, so the demo uses minutes ("compressed time" label on screen).

---

## 4. The three checks (claims are values)

| Check | Exporter claims | Verifier observes (simulated source) | Contract rule | Weight |
|---|---|---|---|---|
| **Weight** | `declaredKg` | `observedKg` — **terminal weighbridge** (NOT the exporter's own VGM, because under SOLAS the shipper declares VGM itself) | observed within **±3%** of declared = match. Observed **< declared − 3%** = **falsified** (overclaimed goods). Observed **> declared + 3%** = **mismatch**, deal rejected, no penalty (under-declaring isn't fraud on the collateral) | **40%** |
| **Documents** | `docHash` of invoice + packing list + BL | `docHash` of the carrier-issued eBL bundle | equal = match, different = **falsified** | **35%** |
| **Status** | `claimedStatus` (must be ≥ LOADED) | `statusCode` from carrier tracking | observed ≥ claimed = match. Observed behind → **Pending** (recheck). Still behind after the verification deadline = **falsified** | **25%** |

Status codes (ordinal): `0 NONE · 1 BOOKED · 2 GATED_IN · 3 LOADED · 4 DEPARTED · 5 ARRIVED`.
"Shipped and assigned to the third-party carrier" = status ≥ LOADED.

Why these weights: weight fraud = direct value fraud on the collateral (and weighing is mandatory under SOLAS VGM, since 1 July 2016). Documents carry legal weight in trade finance (UCP 600 "documents alone") but are often clerically wrong (ICC: 65–80% of LC presentations refused first time). Status is the most likely to be an innocent lag. The 40/35/25 split is our design choice; fallback if judges object: equal thirds.

**Rule against cheating with timing:** the signed answer carries `observedAt`; the contract requires `observedAt > claimTime`, so an old signature can't be reused.

### Example checks
| Case | Claim | Observed | Result |
|---|---|---|---|
| Honest | 10,000 kg, LOADED, hash A | 9,850 kg, DEPARTED, hash A | **Verified** (9,850 is within ±3%) |
| Tracking lag | 10,000 kg, LOADED, hash A | 10,020 kg, GATED_IN, hash A | **Pending** → agent rechecks → DEPARTED → Verified |
| Short shipment (cheat) | 10,000 kg, LOADED, hash A | **8,020 kg**, LOADED, hash A | **Rejected**, weight falsified |
| Fake documents | 10,000 kg, LOADED, hash A | 10,000 kg, LOADED, **hash B** | **Rejected**, documents falsified |
| Under-declared | 9,000 kg, LOADED, hash A | 10,000 kg, LOADED, hash A | **Mismatch**, rejected, no penalty, re-create correctly |

---

## 5. Scores — the maths

Everything onchain is in **basis points (bps)**: 10,000 = 100%. "1 deal of evidence" = 10,000.

### 5.1 The formula (Beta reputation, Jøsang & Ismail 2002)
Each address keeps two counters: **r** (good evidence), **s** (bad evidence), plus a starting prior **A, B**.

**Trust = (r + A) / (r + s + A + B)**

Why not a plain running average: a plain average can **lower** an honest party (one deal slightly below their average) or **raise** a cheater. Here honest events only add to r (score can only go up) and lies only add to s (score can only go down). So the score rule in §3 holds **by maths**, not by tuning.

### 5.2 Exporter Trust Score
- Start: **A = B = 10,000 → 50%**.
- Honest deal **completed (Settled)** → `r += 10,000`.
  *(Positive credit is given at settlement, not at verification — otherwise an exporter + friendly importer could pump the score with verified deals nobody funds.)*
- Falsified at verification (immediately) → `s += 10,000 + 2 × (weights of falsified checks)`.
  - weight faked: s += 10,000 + 8,000 = 18,000
  - documents faked: s += 10,000 + 7,000 = 17,000
  - status faked: s += 10,000 + 5,000 = 15,000
  - all three faked: s += 30,000
- Mismatch (under-declared), Pending, Expired, timeouts → **no change** (a technical failure isn't dishonesty).

**Exporter score table**
| Event | Score |
|---|---|
| New exporter | 50.00% |
| After 1 / 2 / 3 / 4 / 5 honest deals | 66.67% / 75.00% / 80.00% / 83.33% / 85.71% |
| After 8 honest deals | 90.00% (cap reached) |
| New, faked weight | **26.32%** (blocked: below 40%) |
| New, faked documents | 27.03% |
| New, faked status | 28.57% |
| New, faked all three | 20.00% |
| 5 honest deals, then faked weight | 85.71% → **68.18%** |

### 5.3 Advance from the exporter score
- **Advance % = exporter score**, capped at **90%**.
- Score **below 40% → cannot create new deals** (so lying really costs money).
- Terms frozen at funding.

| Exporter score | Advance on 100,000 invoice |
|---|---|
| 50% (new) | 50,000 |
| 66.67% (1 honest) | 66,670 |
| 70% (user's example, illustrative) | 70,000 |
| 75% (2 honest) | 75,000 |
| 80% (3 honest) | 80,000 |
| ≥ 90% | 90,000 (cap) |
| 26% (caught lying) | blocked |

### 5.4 Credit limit (stops "small-deal pumping")
Without it, Ravi could do 8 honest 1-USDT deals, reach 90%, then cheat on a huge one.
**Max invoice = 200 USDT + 2 × (total invoice value Ravi has already Settled).**
Example: new → max 200. After settling one 100-USDT deal → max 400. After settling 50,000 total → max 100,200.

### 5.5 Importer risk score
- Importer trust uses the same formula. Starting trust is set at onboarding by admin (fixed Trust Code). Default proposal: **T₀ = 66.67%** → **A = 13,333, B = 6,667**.
- **Risk % = 2% + 6% × (1 − importer trust)**, so always between 2% and 8%.
- **Investor yield on the deal = importer risk %** (per deal, not per year — show "per deal" on screen; 4% for 60 days ≈ 24%/year).

Importer evidence:
| Event | Counter change |
|---|---|
| Paid on time | r += 10,000 |
| Paid late, within grace | r += 5,000 and s += 5,000 × daysLate / graceDays |
| Defaulted (not paid by end of grace) | s += 30,000 |

**Importer table (start 66.67%)**
| Event | Trust | Risk = investor yield |
|---|---|---|
| New importer | 66.67% | **4.00%** |
| 1 on-time payment | 77.78% | 3.33% |
| 3 on-time payments | 86.67% | 2.80% |
| 1 payment, 30 days late (grace 30) | 61.11% | 4.33% |
| Default from the start | 26.67% | 6.40% |

### 5.6 Solidity sketch
```solidity
// TrustRegistry.sol — OZ 5.x, solc 0.8.30, evm_version prague
uint256 constant BPS = 10_000;
uint256 constant W_WEIGHT = 4_000; uint256 constant W_DOCS = 3_500; uint256 constant W_STATUS = 2_500;
uint256 constant MAX_ADVANCE = 9_000; uint256 constant MIN_SCORE = 4_000;
uint256 constant RISK_MIN = 200; uint256 constant RISK_SPAN = 600;      // 2% + 6% * (1 - trust)

struct Rep { uint128 r; uint128 s; uint128 a; uint128 b; }
mapping(address => Rep) public rep;                // only TradeDeals may write

function trust(address who) public view returns (uint256) {
    Rep memory R = rep[who];
    return (uint256(R.r) + R.a) * BPS / (uint256(R.r) + R.s + R.a + R.b);
}
function advanceBps(address exporter) public view returns (uint256) {
    uint256 t = trust(exporter);
    require(t >= MIN_SCORE, "score too low");
    return t > MAX_ADVANCE ? MAX_ADVANCE : t;
}
function riskBps(address importer) public view returns (uint256) {
    return RISK_MIN + RISK_SPAN * (BPS - trust(importer)) / BPS;   // 200..800
}
```
```solidity
// TradeDeals: judging the exporter's claims
enum Outcome { Verified, Pending, Falsified, Mismatch }
uint256 constant TOL = 300; // ±3%

function _judge(Deal storage d, Verification calldata v) internal returns (Outcome) {
    uint256 neg;
    uint256 lo = uint256(d.declaredKg) * (BPS - TOL) / BPS;
    uint256 hi = uint256(d.declaredKg) * (BPS + TOL) / BPS;
    if (v.observedKg < lo) neg += 2 * W_WEIGHT;                     // overclaimed goods
    if (v.docHash != d.docHash) neg += 2 * W_DOCS;                  // fake documents
    bool statusBehind = v.statusCode < d.claimedStatus;
    if (statusBehind && block.timestamp > d.verifyDeadline) neg += 2 * W_STATUS;

    if (neg > 0) { registry.addBad(d.exporter, BPS + neg); return Outcome.Falsified; }
    if (statusBehind) return Outcome.Pending;                       // tracking lag, recheck
    if (v.observedKg > hi) return Outcome.Mismatch;                 // under-declared, no penalty
    return Outcome.Verified;                                        // +r comes at settlement
}
```
Every score change emits an ERC-8004-style event `Feedback(subject, dealId, scoreBps, tag)` (cheap standards story for the Hedera agent-identity bonus).

---

## 6. Money rules

### 6.1 At funding (investor pays)
- Investor pays **advance = invoice × exporter score** (cap 90%).
- **Platform fee = 1% of the advance, minimum 2 USDT** (the minimum makes sure small deals still cover the agent's checks).
- **Exporter receives advance − fee**, in the same transaction.

The fee is split by the contract, in this order:
| # | Bucket | Amount | Purpose |
|---|---|---|---|
| 1 | **AI agent wallet** | 1 USDT fixed | Refills what the agent spends on x402 checks (≤ 3 × 0.30 USDC per deal) |
| 2 | **Transaction fee (gas)** | 0.50 USDT fixed | Pays back the agent's Whitechain relayer for the WBT gas of `submitVerification` |
| 3 | **Other fee = reserve fund** | 20% of what's left | Small pot that can partly cover investors if an importer defaults |
| 4 | **Platform profit** | the rest | Ours |

Note: each user still pays their own WBT gas for their own actions (create, claim, fund, pay). The fee only covers the agent's costs.
Note: the agent's bucket arrives as **USDT on Whitechain**, but the agent spends **USDC on Hedera** — moving it across is a manual top-up for now (say so in the README).

### 6.2 At the due date (importer pays)
Waterfall: **investor first** (principal + principal × risk%), **exporter gets the rest**. Partial payments follow the same order.

### 6.3 Full worked example — 100,000 USDT invoice, exporter score 70%, importer risk 4%

**Funding**
| Item | Amount (USDT) |
|---|---|
| Investor pays (70%) | 70,000.00 |
| Fee 1% | 700.00 |
| → AI agent wallet | 1.00 |
| → Gas | 0.50 |
| → Reserve fund (20% of 698.50) | 139.70 |
| → **Platform profit** | **558.80** |
| **Exporter receives now** | **69,300.00** |

**Due date**
| Item | Amount (USDT) |
|---|---|
| Importer pays | 100,000.00 |
| Investor gets 70,000 + 4% | 72,800.00 |
| **Exporter gets the rest** | **27,200.00** |

**Summary**
| Party | Gets | Note |
|---|---|---|
| Exporter | 69,300 + 27,200 = **96,500** | financing cost 3,500 (fee 700 + yield 2,800), but cash 60 days early |
| Investor | profit **2,800** on 70,000 | 4% for the deal |
| Platform | **558.80** profit | + 139.70 reserve, 1.50 costs |
| Importer | pays 100,000 | same as normal, score up |

### 6.4 Other cases (same 100,000 invoice)
| Case | What happens |
|---|---|
| New exporter (50%) + new importer (4%) | Investor pays 50,000 → fee 500 (agent 1, gas 0.50, reserve 99.70, profit 398.80) → exporter gets 49,500. Due date: investor 52,000, exporter 48,000. Exporter total 97,500 |
| Veteran exporter (≥90%) + importer with 3 on-time payments (2.80%) | Investor pays 90,000 → fee 900 → exporter gets 89,100. Due date: investor 92,520, exporter 7,480. Exporter total 96,580 |
| Exporter fakes weight (claims 10,000 kg, weighbridge 8,020 kg) | **Rejected** before any investor money moves. Score 50% → 26.32% → blocked. Only the agent's 0.30 USDC was spent |
| Importer pays 15 days late (grace 30) | Waterfall same as on time; importer: r += 5,000, s += 2,500 |
| Importer defaults | Investor loses the 70,000 (can claim from reserve fund if built, §11). Importer s += 30,000 → risk jumps. Exporter keeps the advance (in real life: recourse / ECGC insurance) |
| Importer pays only 60,000 | Investor gets 60,000 (investor first), exporter 0; deal marked Defaulted at end of grace |

### 6.5 Demo-size example (testnet USDT is scarce) — 100 USDT invoice
| | New exporter 50% / importer 4% | After 3 seeded honest deals: exporter 80% / importer 2.80% |
|---|---|---|
| Investor pays | 50 | 80 |
| Fee (1% < 2 → minimum 2) | 2 → agent 1, gas 0.50, reserve 0.10, profit 0.40 | same |
| Exporter receives now | 48 | 78 |
| Importer pays | 100 | 100 |
| Investor gets | 52.00 | 82.24 |
| Exporter gets rest | 48.00 | 17.76 |

Total test USDT needed: ~300–500 (live demo + 3 seeded deals + a cheat run, which costs no USDT).

---

## 7. Contracts (Whitechain Sepolia, chain 1874, all verified on the explorer)

### `TrustRegistry`
- `Rep` per address; `trust()`, `advanceBps()`, `riskBps()`.
- `onboardImporter(addr, startTrustBps)` (admin, once; sets A/B with prior strength 20,000).
- `addGood / addBad` — **only callable by TradeDeals**. No `setScore`.

### `TradeDeals` (ERC-721 receivable NFT + AccessControl + ReentrancyGuard + EIP712)
| Function | Who | Does |
|---|---|---|
| `setKyc(addr, role)` | admin | one KYC = one address = one role (EXPORTER / IMPORTER / INVESTOR) |
| `createDeal(amount, dueDate, importer, invoiceHash, termsHash, durations)` | exporter | checks invoice uniqueness, score ≥ 40%, credit limit |
| `approve(dealId)` | importer | accepts the debt + T&C |
| `declareClaims(dealId, declaredKg, claimedStatus, docHash)` | exporter | stores claims + `claimTime` → Claimed |
| `submitVerification(Verification v, bytes sig)` | anyone (agent) | EIP-712 check (signer = fixed verifier, unused nonce, not expired, `observedAt > claimTime`) → `_judge` |
| `fund(dealId)` | KYC'd investor | pays advance (`SafeERC20`), fee split, exporter paid, NFT minted, terms frozen |
| `pay(dealId, amount)` | importer | waterfall: NFT holder first, exporter rest; on full payment → Settled, scores updated |
| `markDefault(dealId)` | anyone | after due + grace if not fully paid → Defaulted, importer s += 30,000 |
| `expire(dealId)` | anyone | Verified but not funded in time → Expired |
| `_update` override | — | NFT transfers only between KYC'd investors |

Constructor params: `usdt` (0xcedf…55a7), `verifier` (fixed EVM address), `agentWallet`, `gasRelayer`, `reserveFund`, `platformTreasury`.

Events: `DealCreated, Approved, Claimed, Verified, Pending, Rejected, Mismatch, Funded, FeeSplit, Paid, Settled, Defaulted, Expired, Feedback`.

---

## 8. The x402 check (Hedera)

**Endpoint:** `POST /verify` (Express + `@x402/express` `paymentMiddleware`, route key `"POST /verify"`)
- price `"$0.30"` = 300000 units of testnet **USDC `0.0.429274`** (6 decimals)
- network `hedera:testnet`
- `payTo` = verifier's Hedera account (plain `0.0.x`, USDC-associated)
- facilitator **Blocky402** `https://api.testnet.blocky402.com` (fee payer `0.0.7162784`); fallback `https://x402.org/facilitator`
- Bazaar discovery extension so the agent learns price + schema from the unpaid 402

**Request body:** `{ "dealId": "0x…", "shipmentRef": { "containerNo": "MSKU1234567", "blRef": "BL-001" } }`
(Claims are already onchain — the agent never sends claims, so it can't launder a lie.)

**Signed response (EIP-712):**
```
Domain: { name: "TrustMeBro", version: "1", chainId: 1874, verifyingContract: <TradeDeals> }
Verification(bytes32 dealId,uint32 observedKg,uint8 statusCode,bytes32 docHash,uint64 observedAt,uint256 nonce,uint256 expiry)
```
- chainId is **Whitechain's 1874, NOT Hedera's 296**.
- Type string defined in ONE place (`packages/shared`) — one character different = silent "bad sig".
- uint values as `bigint` before signing; never `abi.encodePacked`.
- Pin with a **round-trip test**: sign in TypeScript (viem `signTypedData`) → fixture → `forge test` verifies with OZ `ECDSA.recover`.

**On the wire:**
1. Agent: unpaid POST → `402` + `PAYMENT-REQUIRED` (accepts: exact / hedera:testnet / 300000 / 0.0.429274 / payTo).
2. Agent: spending gate (§9).
3. `wrapFetchWithPayment` resends the same POST with `PAYMENT-SIGNATURE` (partly signed Hedera transfer; facilitator pays the HBAR fee). Never set that header by hand.
4. Server verifies payment → runs handler (signs observed facts) → settles **only if status < 400** (bad request = not charged).
5. `200` + `PAYMENT-RESPONSE` header → decode; tx ID is in `transaction` (also accept `transactionId`). Looks like `0.0.7162784@1762…`; link `https://hashscan.io/testnet/transaction/<id>`. The account in the ID is the facilitator; the agent is in `payer`.

**Tx ID binding (Option A, chosen):** the tx ID arrives after the signature, so the agent writes `{dealId, hederaTxId, payer, sigHash: keccak256(signature), whitechainTx}` to the **HCS audit topic**. (Option B "upfront" flow only if time permits.)

**Server sketch (check API names against x402 repo in I0):**
```ts
const resourceServer = new x402ResourceServer(new HTTPFacilitatorClient({ url: process.env.FACILITATOR_URL }))
  .register("hedera:testnet", new ExactHederaScheme());
app.use(express.json({ limit: "32kb" }));
app.use(paymentMiddleware({
  "POST /verify": {
    accepts: [{ scheme: "exact", network: "hedera:testnet", price: "$0.30", payTo: process.env.VERIFIER_PAYTO! }],
    description: "Observed shipment facts for a TrustMeBro deal, EIP-712 signed for Whitechain 1874",
    mimeType: "application/json",
    extensions: { ...declareDiscoveryExtension({ bodyType: "json", input: exampleBody, inputSchema, output: { example } }) },
  },
}, resourceServer));
app.post("/verify", async (req, res) => {
  const p = VerifyRequest.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "bad_request" });   // not charged
  const o = await observe(p.data);            // simulated weighbridge / carrier / eBL scenario
  res.json(await signVerification(p.data.dealId, o));   // { verification, signature, signer }
});
```
Demo scenarios in the verifier: `honest`, `lag` (GATED_IN first), `short-weight` (8,020 kg), `fake-docs`.

---

## 9. Agent safety (mistakes, hallucination, overspending)
- **No LLM on the money path.** Plain TypeScript with fixed rules. It pays and relays; it never judges. The contract judges.
- **Spending gate before every payment:** `payTo` allowlist · asset must be `0.0.429274` · network `hedera:testnet` · ≤ 1.00 USDC per call · ≤ 1.00 per deal (3 checks) · ≤ 10.00 per day · ≤ 5 checks per exporter per day · only for deals in state Claimed/Pending with importer approval · anything outside → `PENDING_HUMAN` (approve button in dashboard). Plus `client.setSpendControls({ maxAmountPerPayment: "$1" })`.
- **Checked twice:** off-chain (Zod-validate quote + response, recover signer locally, `simulateContract`) and onchain (contract re-checks all).
- **Failures:** timeout / no data → no verdict, no penalty; deadline passes → no score change.
- **Audit:** every quote, payment, refusal and relay → **HCS topic with a submit key**, each message includes hash of the previous one. Created via **Hedera Agent Kit** (90-minute time-box), fallback plain `@hiero-ledger/sdk`. Agent Kit has no x402 / spend-limit support, so our gate is the real control.
- Spam guard: only KYC'd exporters, importer approval required before any paid check, per-exporter daily cap, failed checks lower the score.

---

## 10. Stack and exact values

| Area | Values |
|---|---|
| Whitechain | Chain **1874** · RPC `https://rpc.testnet.whitechain.io` · WS `wss://rpc.testnet.whitechain.io/ws` · explorer `https://explorer.testnet.whitechain.io` (Blockscout) · gas in WBT · 50 req/s per IP |
| Foundry | `solc = "0.8.30"`, `evm_version = "prague"` · OpenZeppelin 5.x · verify: `--verifier blockscout --verifier-url https://explorer.testnet.whitechain.io/api/` (**trailing `/api/`**) |
| WBT faucet | `https://faucet.testnet.whitechain.io/` — 0.5 WBT / 24 h, GitHub ≥ 30 days, per-IP; or the booth |
| **USDT (required)** | **`0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`**. Sponsor says: get WBT → swap to USDT on the Whitechain testnet swap → add token in MetaMask. **After swapping, confirm the token address is exactly this one** (a bridged "USDT.e" or self-minted token does NOT count). Check `decimals()` with `cast call <addr> "decimals()(uint8)" --rpc-url …` |
| Whitechain AI helper | `npx skills add whitechain-labs/skills --skill whitechain-dev` |
| x402 | `@x402/core @x402/hedera @x402/express @x402/fetch @x402/extensions` (2.30.x — confirm with `npm view` in I0) · import `PrivateKey` from `@x402/hedera` (two SDK copies crash) · ECDSA keys |
| Hedera accounts | agent (payer) · verifier payTo · HCS operator — separate keys. **Associate USDC `0.0.429274` before** using the Circle faucet (`https://faucet.circle.com/`); HBAR from `https://portal.hedera.com/` |
| Verifier signing key | separate EVM key; its address is fixed in `TradeDeals` at deploy |
| Agent Kit | `@hashgraph/hedera-agent-kit` v4 (hooks, policies, plugins) |
| Dashboard | Next.js + wagmi + viem + RainbowKit, custom chain 1874; HCS read via `https://testnet.mirrornode.hedera.com/api/v1/topics/<id>/messages` |

### Wallets needed
| Wallet | WBT (gas) | USDT | Hedera |
|---|---|---|---|
| Admin / deployer | ✓ | — | — |
| Exporter (Ravi) | ✓ | — (receives) | — |
| Importer (Ahmed) | ✓ | ✓ (~200+) | — |
| Investor (Priya) | ✓ | ✓ (~200+) | — |
| Agent relayer | ✓ | — | agent account with USDC + small HBAR |
| Verifier | — | — | payTo account (USDC-associated) + EVM signing key |
| Treasury / reserve / agent wallet | — | receives | — |

### `.env` keys
```
WHITECHAIN_RPC=https://rpc.testnet.whitechain.io
USDT_ADDRESS=0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7
DEPLOYER_PK= / RELAYER_PK= / VERIFIER_SIGNER_PK=
TRADEDEALS_ADDRESS= / REGISTRY_ADDRESS=
HEDERA_AGENT_ID= / HEDERA_AGENT_KEY= / VERIFIER_PAYTO= / HCS_TOPIC_ID= / HCS_OPERATOR_ID= / HCS_OPERATOR_KEY=
FACILITATOR_URL=https://api.testnet.blocky402.com
USDC_TOKEN_ID=0.0.429274
VERIFY_URL=http://localhost:4021/verify
```

---

## 11. Repo layout
```
trustmebro/
  contracts/          Foundry: TrustRegistry.sol, TradeDeals.sol, test/, script/Deploy.s.sol
  services/verifier/  x402 POST /verify + EIP-712 signer + demo scenarios
  services/agent/     watcher (WS), spending gate, x402 client, relay, HCS audit
  apps/web/           dashboard: role switcher Exporter · Importer · Investor · Agent log
  packages/shared/    EIP-712 types, Zod schemas, ABIs, chain config, score/fee maths (TS mirror of Solidity)
  docs/               plans/ (this file), PROOFS.md (every live tx link)
  README.md  WHITECHAIN_FEEDBACK.md  AI_USAGE.md
```
Stretch (only if core is done): reserve-fund claim on default (investor can claim up to 10% of principal while the reserve has money); `upfront` x402 flow to sign the tx ID; ENS names.

---

## 12. Build iterations
Each: **goal → tasks → tests → live onchain proof → commit + push** (steady commit history is judged). Lanes: **SC** contracts, **BE** verifier + agent, **FE** dashboard (Pratyush).

| # | Lane | Goal | Tests | Live proof |
|---|---|---|---|---|
| **I0** | all | Public repo; this plan + `AI_USAGE.md` committed; WBT; **swap to USDT, confirm `0xcedf…55a7` + decimals**; Hedera accounts + USDC association + Circle USDC; `curl` Blocky402 `/supported`; `npm view @x402/hedera`; `cast chain-id` = 1874 | — | balances, chain id |
| **I1** | BE | `POST /verify` with x402 + minimal agent paying it once | Zod schemas; `pnpm agent:once` | **HashScan tx ID → README** (Hedera core met) |
| **I2** | SC | TrustRegistry + TradeDeals: KYC, create, approve, credit limit, `fund` with fee split + NFT; deploy + **verify** | score tables §5 exact; fee split §6 exact; double invoice rejected; non-KYC fund/transfer rejected; score < 40% blocked | verified contracts + **USDT `fund()` tx** (Whitechain core met) |
| **I3** | SC+BE | `declareClaims`, EIP-712 `submitVerification`, `_judge` → Verified / Pending / Rejected / Mismatch | **TS-sign → Solidity-verify round trip**; forged / reused / expired / old-`observedAt` sig rejected; each §4 example; "only the liar drops" | Verified tx + Rejected tx |
| **I4** | BE | Autonomous agent: WS watcher, gate, human queue, rechecks for Pending, pre-checks, relay, HCS (Agent Kit time-box) | gate rules; never pays over cap; timeout = no penalty | full run: Whitechain event → Hedera payment → Whitechain Verified + **HCS topic on HashScan**; a 5.00 quote refused |
| **I5** | SC | `pay()` waterfall (incl. partial), late, `markDefault`, `expire`, importer risk updates, exporter +r at settlement | waterfall fuzz (outflows = inflow, investor first); §6 cases | settlement split tx; importer risk change |
| **I6** | FE | Dashboard: role switcher, invoice form, approve, claims form, **evidence view** (weight / status / docs + HashScan link), both scores + terms, fund, pay, deal timeline with explorer links, agent log, approve button, error states (wrong network, not KYC'd, low USDT) | Playwright happy path | click through live testnet deals |
| **I7** | all | Seed 3 honest settled deals (exporter → 80%, importer → 2.80%); bug fixes; README; `PROOFS.md` | full suite green | all links |
| **I8** | all | Rehearse → **code freeze 03:30** → record video → README + `WHITECHAIN_FEEDBACK.md` → **submit 07:30** | — | submitted |

### Video (2–4 min, aim 3:45, real voice, no speed-up, 720p+)
1. Problem: Ravi waits 60 days for money (15 s)
2. Ravi creates invoice, Ahmed approves (25 s)
3. Ravi claims; agent hits 402, pays 0.30 USDC, **HashScan settlement on screen** (40 s)
4. Contract: Verified; investor sees evidence + Ravi's Trust Score + Ahmed's risk score (25 s)
5. Priya funds with USDT → fee split + Ravi gets 69,300 (demo: small numbers) (25 s)
6. Cheat run: weight 8,020 vs 10,000 → Rejected, only Ravi's score drops, no money moved (30 s)
7. Ahmed pays → investor first, Ravi rest; both scores up (25 s)
8. Guardrail refuses a 5.00 quote + HCS audit log (20 s)
9. Close: "Your claims are your collateral" (15 s)

---

## 13. Qualification checklist

**Hedera "AI Agents That Pay: x402"** ($6,500: 3,000 / 2,000 / 1,500)
| Requirement | Where | Proof |
|---|---|---|
| x402 endpoint settling on Hedera testnet via a listed facilitator | I1 | `/verify` via Blocky402, HashScan |
| Agent finds endpoint + completes paid request with no human | I1, I4 | 402/Bazaar discovery, watcher run |
| README with setup, architecture, payment flow + **Hedera tx ID** | I8 | README "Payment flow" |
| Video showing settlement + HashScan link | I8 | video step 3 |
| *Extra:* spending controls / allowlist / human approval above limit | I4 | gate + approve button |
| *Extra:* HCS tamper-evident audit log | I4 | topic link |
| *Extra:* HTS token (USDC) | I1 | `0.0.429274` |
| *Extra:* Hedera Agent Kit | I4 | HCS via Agent Kit |
| *Extra:* agent identity / reputation | §5.6 | ERC-8004-style Feedback events |

**Whitechain "Tokenize · Real World Finance"** ($4,000: 2,500 / 1,500)
| Requirement | Where | Proof |
|---|---|---|
| Deployed on chain 1874 **and verified** | I2 | verified badges |
| ≥ 1 payment in **USDT `0xcedf…55a7`** in the main flow, explorer link in README | I2, I5 | fund + pay txs |
| README line: why onchain stablecoin settlement | I8 | *"Investor USDT moves only after a signed shipment check matches the exporter's claims, the fee is split and the exporter paid in one atomic transaction, and repayment follows an enforced investor-first waterfall — 24/7 and publicly auditable. A bank wire can't release money conditionally on a cryptographic proof or split it atomically between investor, platform and exporter."* |
| Public repo, steady commits, README with setup / architecture / limitations | every step | commit history |
| 2–4 min video showing each party | I8 | exporter, importer, investor, agent on screen |
| `WHITECHAIN_FEEDBACK.md` | I8 (notes from I0, e.g. the USDT swap experience) | file |
| Real rules, not "a token with a mint button" | I2–I5 | KYC, restricted NFT transfers, invoice uniqueness, evidence-gated funding, credit limit, score-priced terms, waterfall, default |

**ETHGlobal rules:** fresh code (repo created during the event) · commit + push every task · AI usage + plan files in repo · Whitechain + Hedera = 2 of the 3 partner-prize slots · one 2–4 min video.

---

## 14. Risks
| Risk | Mitigation |
|---|---|
| Swap gives a different USDT, or USDT scarce | Check address after swap; ask at booth; small demo amounts; USDT address is a constructor param |
| Contract verification fails | exact solc 0.8.30 / prague; `/api/` suffix; `forge verify-contract`; Standard-JSON upload |
| EIP-712 mismatch ("bad sig") | round-trip test in I3 first; types only in `packages/shared` |
| `@x402/*` not on npm / Blocky402 down | check in I0; git dependency; x402.org facilitator (one env var) |
| Agent Kit without LLM doesn't work | 90-min time-box → plain SDK |
| Testnet flaky on recording day | record from the 02:00 rehearsal; all links in `PROOFS.md` |
| Time | cut stretch items first; core = I0–I5 + basic FE |

## 15. README "What this does not solve" (be honest)
- The verifier is **ours** — a trusted attestor with one fixed key; data is **simulated** (labelled terminal weighbridge / carrier tracking / eBL). Real feeds (DCSA track & trace, terminal weighbridge, ICEGATE, eBL like CargoX) don't accept x402 today; we built the x402 gateway they could adopt.
- If the importer **defaults, the investor carries the loss** (reserve fund only partly helps). Real world: recourse to exporter or credit insurance (ECGC).
- Importer could pay the exporter off-platform; T&C notice of assignment is the legal fix.
- KYC is an admin allowlist; related companies could still collude (credit limit + fees reduce it).
- Agent wallet is topped up manually across chains (USDT on Whitechain → USDC on Hedera).
- Production needs a regulated entity (FEMA; e.g. IFSC GIFT City / ADGM).
- Privacy: only hashes and the numbers the contract must compare go onchain.

---

## 16. Still open (decide before / during I0)
1. **"Other fee" = reserve fund for defaults** — OK? (assumed yes)
2. **Agent wallet 1 USDT + gas 0.50 USDT per deal**, min fee 2 USDT — OK? (assumed yes)
3. **Importer starting trust 66.67% (= 4% risk)** — OK? (assumed yes)
4. Repo name; who owns SC and BE lanes (FE = Pratyush).
5. Exact swap URL for WBT → USDT (ask at Whitechain booth).

---

## 17. Sources (checked 6 Nov 2026)
- Event: https://ethglobal.com/events/mumbai/prizes · https://ethglobal.com/events/mumbai/info/details
- Whitechain: https://docs.whitechain.io/ · network reference https://docs.whitechain.io/learn/network/reference.md · faucet https://docs.whitechain.io/learn/get-started/get-testnet-wbt.md · Foundry https://docs.whitechain.io/build/deploy/deploy-with-foundry.md · explorer https://explorer.testnet.whitechain.io/ · token list https://docs.whitechain.io/build/block-explorer/token-list.md · Claude skill https://docs.whitechain.io/build-with-ai/claude-skills.md
- Hedera x402: https://docs.hedera.com/solutions/ai/x402 · merchant https://docs.hedera.com/solutions/ai/x402/merchant-integration · facilitators https://docs.hedera.com/solutions/ai/x402/facilitators · exact scheme https://docs.hedera.com/solutions/ai/x402/exact-scheme · repo https://github.com/x402-foundation/x402 · Agent Kit https://docs.hedera.com/solutions/ai/agent-kit · faucets https://portal.hedera.com/ · https://faucet.circle.com/
- Trust Score: Jøsang & Ismail, "The Beta Reputation System" (2002) https://mn.uio.no/ifi/english/people/aca/josang/publications/ji2002-bled.pdf · ERC-8004 https://eips.ethereum.org/EIPS/eip-8004
- Trade facts: ICC UCP 600 / discrepancy briefing https://library.iccwbo.org//content//tfb//BRIEFINGS//20220627_TA_Briefing_No3_reducing_discrepancy_rates.pdf · SOLAS VGM https://www.traficom.fi/en/transport/maritime/verified-gross-mass-vgm-regulations · factoring advance rates https://resolvepay.com/blog/13-statistics-revealing-average-advance-rate-ceilings-in-invoice-finance · ADB gap survey https://www.adb.org/publications/adb-global-trade-finance-gap-survey
- Prior art: Facture https://github.com/jagnani73/facture
- Libraries: OpenZeppelin 5.x https://docs.openzeppelin.com/contracts/5.x/ · forge verify https://getfoundry.sh/forge/reference/forge-verify-contract · viem signTypedData https://viem.sh/docs/accounts/signTypedData
