# What is onchain, what is backend, and why

## Why the core is in Solidity, not the backend

1. **The Whitechain prize requires it.** The rules ask for *"real transfer rules enforced in the contract … not just a token with a UI on top"* and say *"Won't place: … ownership NFTs where nothing is enforced onchain."*
2. **Trust.** If the backend held the investor's USDT and decided who gets paid, everyone would have to trust our server. With the contract, nobody can take the money, edit a Trust Score, or fund a deal that failed the check, not even us.

## What it costs

- **Reading is free.** View functions (`quote`, `getDeal`, `profile`, `creditLimit`, ...) need no transaction and cost no gas.
- **Only transactions cost gas.** A deal has about 6–7 of them (create, approve, claim, verify, fund, pay, plus USDT approvals), and each person pays for their own.
- **On testnet, gas is free test WBT.** The minimum gas price is 5 gwei. A whole deal is roughly 1M gas, so about 0.005 WBT. The faucet gives 0.5 WBT a day. These are estimates; `forge test --gas-report` gives the exact numbers.

## Already in the backend (no gas)

| Backend / agent / verifier (teammates) | Contract |
|---|---|
| Checking the shipment data | Checking the verifier's **signature**, so a fake answer can't get in |
| Paying x402 on Hedera | Comparing the claim with the observed values and deciding pass or fail |
| Storing PDFs and documents | Storing only their **hashes** |
| Dashboard, notifications, rechecks, HCS log | Moving USDT: fund, fee split, investor-first payout |
| Showing scores and fees on screen | Trust Scores, KYC list, NFT transfer rules |

## ✅ Must be in Solidity

Without these, the project doesn't qualify for the prize or users have to trust our server.

| Feature | Why |
|---|---|
| USDT movement: `fund()` and `pay()` | Prize rule: USDT must settle on Whitechain |
| KYC allowlist | Prize asks for allowlists enforced in the contract |
| Receivable NFT only KYC'd investors can hold | Prize: NFTs with no onchain rules won't place |
| Deal order (fund only after Verified, pay only after Funded) | Settlement conditions must be enforced |
| Verifier signature check + claim vs. observed comparison | Otherwise the backend could approve a fake shipment |
| Replay protection (nonce, expiry, time check) | Otherwise an old signature could be reused |
| Investor paid first, exporter gets the rest | Core settlement rule |
| Due date and default | Maturity rule |
| Same invoice can't be financed twice | Core rule for invoice financing |
| Trust Score registry | Nobody (not even admin) can edit scores; scores set the advance % and yield |

## 👍 Should stay

Cheap, and they protect money or keep deals from getting stuck.

| Feature | Why |
|---|---|
| Credit limit | Stops pumping a score with many small deals |
| 1% fee split inside `fund()` | The atomic split is part of the pitch to judges |
| `expire()` / `cancel()` | Otherwise a stuck deal locks the invoice and the exporter's credit forever |
| Late-payment scoring | Part of the score formula |
| `maxAdvance` / `minYieldBps` in `fund()`, reentrancy guard | Investor protection; no storage, almost free |

## ⚪ Optional (could move to the backend or be removed)

| Feature | Backend option |
|---|---|
| Container no. / BL ref stored in the contract | Keep in the event only, or in the backend database |
| Latest verifier reading stored in the deal | Keep in the event only; the frontend reads the event |
| NFT metadata built in the contract (`tokenURI`) | A metadata link served by the backend |
| `revokeKyc`, custom importer starting trust, changing fee wallets | Admin extras, not needed for the demo |
| Recovery payments after a default | Nice to have |
| Fee-on-transfer check | Real USDT doesn't need it |
| Helper reads (`quote`, `profile`, `deadlines`, `availableCredit`) | The frontend could calculate these. They cost zero gas; they only make the contract bigger |
| Extra events (`Feedback`, `FeeSplit`, `VerificationSubmitted`) | Very cheap. `Feedback` helps the Hedera agent-reputation bonus |

Tests, scripts and `packages/shared` never go onchain and cost no gas.

## Recommendation

Keep everything in **Must** and **Should**. From **Optional**, the first candidates to remove are `tokenURI` (it also shrinks the contract, which matters if it's over the 24 KB deploy limit) and the stored container no. / BL ref. Decide after `forge build --sizes` and `forge test --gas-report` show the real size and gas numbers.
