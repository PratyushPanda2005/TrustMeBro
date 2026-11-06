# TrustMeBro contracts (Whitechain Sepolia, chain 1874)

Quick start: `FILES.txt` says what each file does, and `REQUIREMENTS.txt` says what to install and which commands to run. `WHY_ONCHAIN.md` explains what is onchain vs. backend.

Export-invoice financing settled in **USDT `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`** on Whitechain.
An exporter tokenizes an invoice, an AI agent pays (x402, Hedera) for an independent shipment check, the
contract compares the signed observation with the exporter's claims, and one KYC'd investor funds the
advance. On the due date the importer pays the contract: investor first, exporter the rest. Onchain
Trust Scores price every deal and remember every lie.

> **Why onchain stablecoin settlement:** investor USDT moves only after a signed shipment check matches the
> exporter's claims. The fee split and the exporter payout happen in the same atomic transaction, and
> repayment follows an enforced investor-first waterfall, 24/7 and publicly auditable. A bank wire can't
> release money only when a cryptographic proof checks out, or split one payment atomically between
> investor, platform and exporter.

## Contracts

| File | What it is |
|---|---|
| `src/TradeDeals.sol` | Deal lifecycle, KYC allowlist, EIP-712 verification, USDT funding + fee split, repayment waterfall, ERC-721 receivable with transfer restrictions |
| `src/TrustRegistry.sol` | Beta-reputation Trust Scores `(r + a) / (r + s + a + b)`. Only TradeDeals can write; **no admin, no `setScore`** |
| `src/libraries/DealMath.sol` | Pure money maths (advance, 1% fee + split, yield, waterfall, late penalty) |
| `src/interfaces/ITradeDeals.sol` | Enums, structs, events, errors: the API surface |

### Rules enforced onchain (Whitechain "Tokenize" requirements)

- **Allowlist:** one KYC = one address = one role (exporter / importer / investor), for life. Revocation suspends an address but never frees it for another role, and never resets its score.
- **Issuance rules:** a unique invoice hash (the same invoice can't be financed twice), exporter score ≥ 40%, and a credit limit: total open invoices ≤ 200 USDT + 2 × the exporter's settled volume.
- **Evidence-gated funding:** money can't move until a verifier-signed observation matches the claims. Weight must be within ±3%, document hash equal, and status reached by the deadline.
- **Atomic delivery-versus-payment:** in one `fund()` the investor pays → the fee is split into 4 buckets → the exporter is paid → the receivable NFT is minted to the investor → the terms are frozen.
- **Transfer restriction:** the receivable NFT is minted to, and transferable only between, KYC'd investors, and only while it is outstanding (Funded) or in recovery (Defaulted).
- **Settlement conditions:** investor-first waterfall (partial payments included), due date + grace, `markDefault` by anyone after grace, and expiry of unfunded listings.
- **Score-priced terms:** advance % = exporter score (cap 90%), investor yield = importer risk 2–8%.

## Lifecycle

```
            setKyc (admin)
                 │
 exporter ── createDeal ──► Created ──approveDeal (importer)──► Approved ──declareClaims (exporter)──► Claimed
                              │ cancel                            │ cancel (exporter)                    │
                              ▼                                   ▼                                      ▼
                          Cancelled                           Cancelled         submitVerification (anyone, signed by verifier)
                                                                                │        │          │           │
                                                                           Verified   Pending ↺   Rejected    Mismatch
                                                                                │    (lag, recheck) (lie: exporter s↑)  (no penalty)
                                            fund (KYC investor, USDT) ◄─────────┘
                                                     │                    expire (no investor in time) → Expired
                                                     ▼
                                                  Funded ──pay (importer, USDT, waterfall)──► Settled (scores ↑)
                                                     │
                                                     └─ markDefault (anyone, after due + grace) ─► Defaulted (importer s↑)
```

`State` values (uint8): `0 None · 1 Created · 2 Approved · 3 Claimed · 4 Pending · 5 Verified · 6 Funded · 7 Settled · 8 Rejected · 9 Mismatch · 10 Defaulted · 11 Expired · 12 Cancelled`.

## Integration guide

All addresses and ABIs end up in `packages/shared` (`deployments`, `tradeDealsAbi`, `trustRegistryAbi`, `erc20Abi`,
`whitechainTestnet`, `verificationTypes`, enums). Regenerate after every build or deploy with `node script/export.mjs`.
Amounts are USDT units (6 decimals). Rates are bps (10,000 = 100%).

### Dashboard (frontend)

| Step | Who | Call | Notes |
|---|---|---|---|
| KYC | admin | `setKyc(addr, role)` / `setKycImporter(addr, startTrustBps)` | role: 1 Exporter, 2 Importer, 3 Investor |
| Create | exporter | `createDeal(amount, dueDate, importer, invoiceHash, termsHash, {verifyWindow, listingWindow, graceWindow})` | read `availableCredit(exporter)`, `registry.profile(exporter)` first |
| Approve | importer | `approveDeal(dealId, termsHash)` | termsHash must equal the deal's |
| Claim | exporter | `declareClaims(dealId, declaredKg, claimedStatus, docHash, containerNo, blRef)` | status 3–5, containerNo 1–32 bytes |
| Fund | investor | `usdt.approve(TradeDeals, advance)` then `fund(dealId, maxAdvance, minYieldBps)` | take both from `quote(dealId)` |
| Pay | importer | `usdt.approve(TradeDeals, amount)` then `pay(dealId, amount)` | partial is fine, overpayment is capped |
| Default | anyone | `markDefault(dealId)` | after `dueDate + graceWindow` |
| Expire | anyone | `expire(dealId)` | unfunded after the listing window, or stuck verification |
| Cancel | exporter (Created/Approved), importer (Created) | `cancel(dealId)` | |

Read: `getDeal(id)` (everything, including the latest observation and frozen terms), `getShipment(id)`,
`quote(id)` (live terms; `advanceBps == 0` means the exporter is blocked), `deadlines(id)`, `ownerOf(id)` (current
receivable holder), `tokenURI(id)`, `kycRole(addr)`, `creditLimit` / `availableCredit`, `registry.profile(addr)` →
`{onboarded, r, s, a, b, trustBps, advanceBps, riskBps}`.

### Agent (x402 relayer)

1. Watch `Claimed(dealId, exporter, declaredKg, claimedStatus, docHash, containerNo, blRef, verifyDeadline)`.
   The verifier needs `containerNo` / `blRef` for `POST /verify`; they are also in `getShipment(dealId)`.
2. Only pay for deals whose state is `Claimed` (3) or `Pending` (4).
3. Relay with `submitVerification(v, signature)`. Pre-check off-chain: `hashVerification(v)`, recover the signer,
   compare with `verifier()`, then `simulateContract`. The verifier must sign with chainId **1874** and
   verifyingContract = TradeDeals, using `verificationTypes` from `packages/shared/src/eip712.ts` (the only definition).
   `dealId` is the uint256 id as bytes32 (`dealIdToBytes32`). `observedAt` must be newer than `claimTime` and than the
   previous observation. Small clock skew (≤ 5 min ahead of the chain) is accepted.
4. Outcomes come back as events: `Verified`, `Pending` (recheck later), `Rejected`, `Mismatch`. There is also
   `VerificationSubmitted(dealId, submitter, nonce, sigHash, outcome)`, where `sigHash = keccak256(signature)`. Put the
   same sigHash in the HCS audit message to bind the Hedera payment to the Whitechain tx.
5. **Keep one paid check for after `verifyDeadline` on a Pending deal.** A status that is still behind after the
   deadline is the only way a status lie gets penalised. If no check comes in by `verifyDeadline + listingWindow`,
   the deal can be expired with no penalty.

## The maths (plan §5–§6, all covered by tests)

- Exporter prior `a = b = 10,000` → 50%. Settled honest deal: `r += 10,000` → 66.67%, 75%, 80%, 83.33%, 85.71% … 90% (cap) after 8.
- Falsified at verification: `s += 10,000 + 2 × weights` (weight 4,000 · docs 3,500 · status 2,500) → 26.32% / 27.03% / 28.57% / 20% (all three). Below 40% the exporter is blocked.
- Importer prior strength 20,000. Default start 66.67% (`a = 13,334, b = 6,666`) → risk 4.00%. On time `r += 10,000`. Late within grace `r += 5,000, s += 5,000 × late/grace`. Default `s += 30,000`.
- Risk = `2% + 6% × (s + b) / total`. Trust is rounded to the nearest bps.
- Fee = `max(1% of advance, 2 USDT)` → agent 1 USDT, gas 0.50 USDT, reserve 20% of the rest, platform the remainder.
- Demo (100 USDT, new parties): investor pays 50 → agent 1 / gas 0.50 / reserve 0.10 / platform 0.40 → exporter gets 48. Importer pays 100 → investor 52, exporter 48.

## Changes from the v5 plan (and why)

| Plan | Implemented | Why |
|---|---|---|
| `approve(dealId)` | `approveDeal(dealId, termsHash)` | ERC-721 already has `approve(address,uint256)`; the hash makes the importer confirm the exact T&C |
| `fund(dealId)` | `fund(dealId, maxAdvance, minYieldBps)` + `quote(dealId)` | a score change between click and mining could otherwise change what the investor pays |
| `declareClaims(id, kg, status, docHash)` | adds `containerNo, blRef` | the agent's `/verify` body needs a `shipmentRef`, and there is no other shared store |
| `registry.onboardImporter(addr, trust)` (admin) | `setKyc` / `setKycImporter` onboard into the registry once | the registry has **no admin at all**. It is bound to TradeDeals at deploy, and only TradeDeals can write |
| status falsified if `block.timestamp > verifyDeadline` | if `observedAt > verifyDeadline` | relay delay can't turn an in-window observation into a penalty |
| credit limit per invoice | on **total open exposure** | otherwise many parallel max-size deals bypass it |
| — | exporter < 40% also can't be **funded** on other verified deals | a caught liar's open listings shouldn't attract money |
| — | `Cancelled` state; stuck `Claimed/Pending` can `expire` after `verifyDeadline + listingWindow` | frees credit and the invoice hash when the flow stalls |
| — | full payment after grace (before anyone calls `markDefault`) settles but scores the importer as a default | late is late |
| — | recovery payments into `Defaulted` deals (same waterfall, no score change) | the investor still wants the money |
| — | invoice hash freed on Mismatch / Expired / Cancelled; locked forever on Rejected / Funded / Settled / Defaulted | "re-create correctly" after a mismatch, but no re-financing |
| — | minimum invoice 10 USDT; fee-on-transfer tokens rejected | the advance must exceed the 2 USDT minimum fee; exact accounting |

## Setup (Windows)

Foundry runs natively on Windows from **Git Bash** (the Whitechain docs say WSL; Git Bash works too):

```bash
curl -L https://foundry.paradigm.xyz | bash   # then open a new Git Bash
foundryup
forge --version
```

Then:

```bash
cd contracts
npm install            # OpenZeppelin 5.4.0 + forge-std v1.9.7 into node_modules/
forge build --sizes    # TradeDeals must stay under the 24,576-byte limit
forge test -vv
```

EIP-712 round trip (TypeScript signs, Solidity verifies):

```bash
cd packages/shared && npm install && npm run fixture
cd ../../contracts && forge test --match-contract Eip712RoundTrip -vv
```

## Deploy + verify (when the wallet is ready, not yet)

```bash
cd contracts
cp .env.example .env                  # set VERIFIER_ADDRESS (+ fee wallets, optional)
cast wallet import deployer --interactive   # paste the deployer key once; it's stored encrypted
cast chain-id --rpc-url whitechain_sepolia  # must print 1874

# dry run first (no --broadcast = nothing is sent)
forge script script/Deploy.s.sol --rpc-url whitechain_sepolia --account deployer

# deploy + verify on Blockscout (note the trailing /api/)
forge script script/Deploy.s.sol --rpc-url whitechain_sepolia --account deployer --broadcast \
  --verify --verifier blockscout --verifier-url https://explorer.testnet.whitechain.io/api/

node script/export.mjs                # ABIs + deployments/1874.json → packages/shared

# KYC the demo wallets (set TRADEDEALS_ADDRESS, EXPORTER_ADDRESS, IMPORTER_ADDRESS, INVESTOR_ADDRESS in .env)
forge script script/Kyc.s.sol --rpc-url whitechain_sepolia --account deployer --broadcast
```

If verification during deploy fails, run it again per contract. The registry's constructor argument is the TradeDeals address:

```bash
forge verify-contract <REGISTRY> src/TrustRegistry.sol:TrustRegistry --rpc-url whitechain_sepolia \
  --verifier blockscout --verifier-url https://explorer.testnet.whitechain.io/api/ \
  --constructor-args $(cast abi-encode "constructor(address)" <TRADEDEALS>)
forge verify-contract <TRADEDEALS> src/TradeDeals.sol:TradeDeals --rpc-url whitechain_sepolia \
  --verifier blockscout --verifier-url https://explorer.testnet.whitechain.io/api/ --guess-constructor-args
```

The deployer pays WBT gas. Each demo wallet needs a little WBT, and the investor and importer need USDT.

## Limitations

- The verifier is a trusted attestor with one fixed key (immutable in TradeDeals; a new key means redeploying).
- If the importer defaults, the investor carries the loss. The reserve fund only collects; there is no claim function yet.
- KYC is an admin allowlist; related companies could still collude (the credit limit and fees make it costly).
- Only hashes and the numbers the contract must compare are onchain; documents stay off-chain.
