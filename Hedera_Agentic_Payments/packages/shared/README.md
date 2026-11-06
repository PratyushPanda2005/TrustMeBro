# @tmb/shared: interfaces frozen at gate G0

Lanes A and C build against this package. Changes go through lane B and get a note in team chat.

| File | For | What |
|---|---|---|
| `src/trust.ts` | C, A | Trust Score, terms and waterfall reference maths (integer bps). **Source of truth** |
| `vectors/trust.json` | C | Golden vectors. `TrustRegistry` tests must reproduce every value exactly. Regenerate with `pnpm vectors` |
| `src/eip712.ts` | C, B | `Verification` struct, type string, domain `{TrustMeBro, 1, 1874, TradeDeals}` |
| `src/schemas.ts` | A, B | Zod: `Claims`, `VerifyRequest`, `VerifyResponse`, `HcsMessage`, `AgentLogEntry`, `Approval` |
| `src/sign.ts` | B | viem sign / recover / `verificationHash` |
| `fixtures/verifications.json` | C | viem-signed samples (valid, weight false, docs false, expired, wrong signer, wrong contract). Generate with `pnpm --filter @tmb/shared fixtures` |

## Solidity mapping for lane C
```solidity
bytes32 constant VERIFICATION_TYPEHASH = keccak256(
  "Verification(bytes32 dealId,bool weight,bool statusCode,bool documents,uint256 nonce,uint256 expiry)");
// EIP712("TrustMeBro", "1"); structHash = keccak256(abi.encode(TYPEHASH, dealId, weight, statusCode, documents, nonce, expiry))
uint256 constant W_WEIGHT = 4000; W_STATUS = 2500; W_DOCS = 3500; FRAUD_MULT = 2;
// match: r += w | claimed true & observed false: s += BPS + Σ 2w (no positive credit that deal) | understated: 0
// score = (r + a) * 10000 / (r + s + a + b); exporter a = b = 10000; importer a = 20000 * T0 / 10000, b = 20000 - a
// importer: onTime r += 10000 | late r += 5000, s += 2500 | default s += 30000
// terms: clamp score to [5000, 9000]; advance = 6000 + (e - 5000) * 3000 / 4000; yield = 500 - (i - 5000) * 300 / 4000
```
Use integer division in exactly this order. The vectors depend on it.

For Foundry unit tests, signing with `vm.sign` on a test key is fine. The fixtures file proves the viem ↔ Solidity round trip.
