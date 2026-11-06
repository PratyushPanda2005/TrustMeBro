# Score claims weighted, settle proofs on Hedera

TrustMeBro should score each deal as a **weighted average of claim matches (weight 40%, document_verification 35%, status_code 25%)**, but it should not average those deal scores over time. Feed each deal's result into **two counters per party: positive evidence `r` and negative evidence `s`**. The Trust Code is then `(r + A) / (r + s + A + B)`, where the prior `A, B` encodes the starting score. That gives the exporter 50% and the importer its fixed starting code, for example 60%. This is the Beta reputation system ([Jøsang & Ismail 2002](https://mn.uio.no/ifi/english/people/aca/josang/publications/ji2002-bled.pdf)). It is the only simple structure that *guarantees* your rule: an honest deal adds only to `r`, so the score always rises, and a falsified claim adds only to `s` at double weight, so only the falsifying party drops. A plain running weighted average cannot promise this. The score maps linearly to an **advance of 60%→90%** (from the exporter's score) and an **investor yield of 5%→2%** (from the importer's score), clamped between scores of 50% and 90%. In Solidity it fits in one storage slot per party. Each judgement arrives through an **x402-protected `POST /verify` on Hedera testnet**. The agent sends a JSON body carrying the deal ID and claims and pays 0.30 USDC (`0.0.429274`) through Blocky402. The verifier returns an **EIP-712 signature over the observed facts, bound to Whitechain chain 1874**. The agent relays that to a Whitechain contract that checks signer, nonce and expiry, compares the facts with the claims stored onchain, and updates both scores. The Hedera transaction ID comes back only in the `PAYMENT-RESPONSE` header *after* the handler has signed. So either log it to HCS next to the signature hash, or switch to the `upfront` payment flow to sign it into the struct. Both prize tracks need real testnet settlement with links in the README: verified contracts plus a sponsor-USDT payment on Whitechain, and a HashScan-linked x402 payment made by an agent with no human approval on Hedera ([ETHGlobal Mumbai prizes](https://ethglobal.com/events/mumbai/prizes/)).

## Both tracks pay only for settlement a judge can click

The scoring design has to serve two sponsor checklists, so they come first. Whitechain's **"Tokenize · Real World Finance"** track ($4,000: $2,500 / $1,500) wants real-world-asset lifecycles and compliance modeled onchain, with every payment in USDT. It lists **"trade finance with multi-party confirmation"** among its example ideas. Its hard requirements are three. First, contracts deployed and **verified on Whitechain Sepolia, chain ID 1874**. Second, **at least one USDT payment settled in the main flow**, with an explorer link in the README. **Self-minted test tokens do not count**, so the sponsor USDT at `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7` is mandatory. Third, a README line on why onchain stablecoin settlement beats a regular rail, steady commit history, a demo video showing each party, and a `WHITECHAIN_FEEDBACK.md`. The judging language also rules out a token "with a mint button and no rules". And it says that paying an invoice belongs in a different track, while *financing* one belongs here ([ETHGlobal Mumbai prizes](https://ethglobal.com/events/mumbai/prizes/)). A Trust Code that changes the advance rate and yield onchain is exactly the kind of enforced rule this brief rewards.

Hedera's **"AI Agents That Pay: x402 on Hedera"** track ($6,500: $3,000 / $2,000 / $1,500) has four hard requirements. First, at least one **x402-protected endpoint settling on Hedera testnet or mainnet through a facilitator listed in Hedera's docs**, or one the team runs itself. Second, an **agent that finds the endpoint and completes at least one paid request end to end with no human approval**. Third, a README containing a **Hedera transaction ID** of a settled payment. Fourth, a video showing the payment **linked on HashScan**. Extra points go to spending controls, an HCS audit log, HTS tokens such as USDC, agent identity (HCS-14 or ERC-8004), and Agent Kit ([ETHGlobal Mumbai prizes](https://ethglobal.com/events/mumbai/prizes/)). The prize page names Official x402, Ax402 and Blocky402 as facilitators. Hedera's facilitator doc lists x402.org, Launa and **Blocky402 (testnet fee payer `0.0.7162784`)** ([Hedera facilitators](https://docs.hedera.com/solutions/ai/x402/facilitators)). Blocky402 is on both lists, so it is the safe choice. ETHGlobal's own rules cap videos at **2–4 minutes**, which overrides Hedera's "≤5 min". The submission deadline is **Saturday 7 November 2026, 09:00 IST**, with no late entries ([ETHGlobal Mumbai info](https://ethglobal.com/events/mumbai/info/details)).

The team running its own paid verifier is legitimate. The rule about a "listed facilitator or one you run yourself" governs *settlement*, not who owns the paid service. Every official x402 example has the builder operating the resource server ([x402 server examples](https://github.com/x402-foundation/x402/tree/main/examples/typescript/servers)). The honest framing is the one in the project's own research: the verifier is an **explicitly trusted attestor**, and the design is an attested cross-system workflow, not a trustless bridge. Make it visibly separate. Use different keys for the Hedera `payTo` account, the agent account and the verifier's EVM signing key. Fix the verifier address in the contract at deployment. Keep an HCS audit trail. One caveat: the newest research pass could not re-fetch the Mumbai prize page itself. Confirm the Hedera wording at the booth.

## A weighted match score feeds counters, not a running average

The user's intuition, a weighted average of the three claim matches, is right *within a single deal*. Each factor gets a weight in basis points, summing to 10,000. The weights are risk-ranked. **Weight gets 4,000** because misdeclared mass is direct value fraud on the collateral, and the shipper carries a hard legal duty for it. Under SOLAS, in force since 1 July 2016, the shipper must provide the verified gross mass, and a container without one "should not be loaded" ([Traficom VGM](https://www.traficom.fi/en/transport/maritime/verified-gross-mass-vgm-regulations)). **document_verification gets 3,500**, and **status_code gets 2,500**. The ICC estimates that **65–80% of letter-of-credit presentations are refused on first presentation**. The most common causes are *timing* discrepancies, followed by poorly prepared documents with conflicting data. Yet under UCP 600, banks still decide "on the basis of the documents alone" ([ICC Trade Finance Briefing No. 3](https://library.iccwbo.org//content//tfb//BRIEFINGS//20220627_TA_Briefing_No3_reducing_discrepancy_rates.pdf)). So documents carry the legal weight but are noisy, and status is the factor most likely to be an honest lag. No industry source assigns numbers to these three factors. The 40/35/25 split is a design choice defended by that ordering. Equal thirds (3,334/3,333/3,333) is the fallback if judges push back.

Each factor then lands in one of three outcomes, and the asymmetry is the heart of the design. If the claim matches the observation, the party earns credit `wᵢ`. If the party **understated** (claimed false, observed true), it earns nothing and loses nothing, so being conservative is never punished. If the party **falsified** (claimed true, observed false), it takes negative evidence of `2·wᵢ`. Any falsification makes the whole deal dishonest for that party. It gets **zero positive credit** and a base penalty of one full deal (10,000) plus the doubled factor weights. The doubling follows "slow to build, fast to lose". The multiplier λ = 2 is a design choice with no cited industry precedent. Factoring practice does support the direction: disputes and dilution cut advance rates rather than averaging out ([Resolve](https://resolvepay.com/blog/13-statistics-revealing-average-advance-rate-ceilings-in-invoice-finance)).

The reason not to carry a running weighted mean across deals is mathematical, not stylistic. With `avg = Σq / n`, a new deal raises the score only if its quality beats the current average. So an honest-but-imperfect deal can *lower* a good party's score, and a falsified deal can *raise* a poor one. That breaks the rule "honest parties rise, only the falsifier drops". The Beta reputation system keeps positive and negative evidence in separate counters `r` and `s`. Its expected value is `(r+1)/(r+s+2)` under a uniform prior, and evidence from several sources combines by simple addition, in any order ([Jøsang & Ismail 2002](https://mn.uio.no/ifi/english/people/aca/josang/publications/ji2002-bled.pdf)). Adding to `r` alone always raises `(r+A)/(r+s+A+B)`, because the prior `B` keeps the denominator above the numerator. Adding to `s` alone always lowers it. The rule therefore holds by construction. If both parties are honest, both scores rise, or stay flat in the edge case where every claim was understated. If one falsifies, only that one drops. If both falsify, both drop. The prior also solves cold start. With `A = B = 10,000` (one deal's worth of evidence), a new exporter starts at 50%, and each early deal moves the score smoothly instead of jumping to 0% or 100%. This is the Bayesian-average family used widely in rating systems ([Algolia Bayesian average](https://www.algolia.com/doc/guides/managing-results/must-do/custom-ranking/how-to/bayesian-average)).

The importer's "fixed trust code" is simply a different prior. A starting code of **60% is `A = 12,000, B = 8,000`**, and any other starting code `c` with prior strength 20,000 is `A = 20,000·c, B = 20,000·(1−c)`. The importer's claims (for example at arrival, whether the goods matched on weight, status and documents) run through the same three-way judgement. Payment behaviour adds evidence in the same currency. Paid on time is `r += 10,000`. Paid late is `r += 5,000; s += 2,500`. Default is fraud-level, `s += 30,000`. This replaces the engineering plan's additive "50 + 10·settled − 30·lies" counters. Those counters cannot express partial credit, and they can hit the 0/100 clamps after a handful of events.

A Python run of the same integer math gives these numbers, which are worth putting on a slide:

| Event (exporter, prior 50%) | Trust Code |
|---|---|
| Start | 50.00% |
| 1 / 2 / 3 / 5 fully honest deals | 66.66% / 75.00% / 80.00% / 85.71% |
| 1 honest deal that understated status only (credit 7,500) | 63.63% |
| From start, falsified weight | **26.31%** |
| From start, falsified status only | 28.57% |
| After 5 honest deals, one falsified weight | 85.71% → **68.18%** |
| Importer (prior 60%), 1 clean deal | 73.33% |

History cushions a single lie but does not hide it. A five-deal veteran who falsifies weight loses about 17.5 points, and its advance rate falls sharply as a result, as the next section shows. Jøsang's model also offers a forgetting factor λ that multiplies `r` and `s` before each update ([Jøsang & Ismail 2002](https://mn.uio.no/ifi/english/people/aca/josang/publications/ji2002-bled.pdf)). Leave it out for the hackathon, because order-dependent decay is hard to explain in a four-minute demo.

## Scores price the deal: 60–90% advance and 5–2% yield

Compute terms continuously and show tiers only as labels. Clamp the score to 50–90%. The advance is then `6,000 + (score − 5,000)·3,000/4,000` bps, which runs from 60% to 90%. The yield is `500 − (score − 5,000)·300/4,000` bps, which runs from 5% to 2%. The 60–90% band sits on top of the **70–90% advance rates typical in invoice factoring**, with a lower floor for unproven parties. Factors also cut rates for weaker debtor credit, disputes and dilution ([Resolve](https://resolvepay.com/blog/13-statistics-revealing-average-advance-rate-ceilings-in-invoice-finance)). That gives judges a real-world anchor. No published onchain trade-finance protocol was found mapping a reputation score linearly to an advance rate, so this mapping is a design choice.

Each score should drive the term that matches the risk it measures. The **exporter's score sets the advance**, because the advance is the exporter's financing and delivery risk is the exporter's. The **importer's score sets the investor yield**, because investors are repaid from the importer's payment. This matches the engineering plan's `exporterTerms()` / `importerYield()` split. It also makes the "only the falsifier drops" story visible in money: a lying importer raises the investor's yield and leaves the exporter's advance untouched. A more conservative alternative is `min(exporter, importer)` for the advance. Use it only if judges ask about weakest-link risk.

| Score | Advance | Yield | UI label |
|---|---|---|---|
| ≤ 50.00% (new or caught lying) | 60.00% | 5.00% | Low |
| 60.00% (importer's fixed start) | 67.50% | 4.25% | Low |
| 66.66% (1 honest deal) | 72.49% | 3.76% | Medium |
| 75.00% (2 honest) | 78.75% | 3.13% | High |
| 80.00% (3 honest) | 82.50% | 2.75% | High |
| 85.71% (5 honest) | 86.78% | 2.33% | High |
| ≥ 90.00% | 90.00% | 2.00% | High |

One timing trap matters. With a prior of one deal's weight, a party needs **eight clean deals to reach the 90% cap**, because `(n+1)/(n+2)` first passes 0.9 at n = 8. The plan's three seeded deals land an exporter at 82.5% advance, which shows the effect well. Keep the High label at ≥ 75% so two or three seeded deals already show "High". Lowering the clamp to 85% speeds things up. A weaker prior (`A = B = 5,000`) does too, but it makes single deals swing the score much harder. **Snapshot the terms when the deal is created.** A later score change must never reprice a funded deal.

## Solidity: two packed counters and a signed gate

Store `uint128 r; uint128 s;` in one slot per party, and do all arithmetic in `uint256` under Solidity ≥0.8 checked math. At about 30,000 bps of evidence per deal, `uint128` overflows only after roughly 5×10³³ deals. Each update is one storage read and one write, plus a three-step pure loop. Gas on Hedera's EVM was not measured, but it is irrelevant here, because the scoring contract lives on Whitechain. Integer division rounds down (66.66%, not 66.67%). Use `(num·BPS + den/2)/den` if the UI needs round-half-up.

```solidity
// TrustRegistry.sol  (OZ v5.x, solc 0.8.28, evm_version = cancun)
uint256 constant BPS = 10_000;
uint256 constant W_WEIGHT = 4_000; uint256 constant W_DOCS = 3_500; uint256 constant W_STATUS = 2_500;
uint256 constant FRAUD_MULT = 2;

struct Rep { uint128 r; uint128 s; }
struct Prior { uint128 a; uint128 b; }          // exporter 10_000/10_000 (50%), importer 12_000/8_000 (60%)
mapping(address => Rep) public rep;
mapping(address => Prior) public prior;          // set once on first deal from role default

function _factor(bool claimed, bool observed, uint256 w) private pure returns (uint256 pos, uint256 neg) {
    if (claimed == observed) return (w, 0);                 // match
    if (claimed && !observed) return (0, w * FRAUD_MULT);   // falsified
    return (0, 0);                                          // understated: neutral
}

function _record(address who, bool[3] memory claim, bool[3] memory obs) internal returns (bool lied) {
    uint256[3] memory W = [W_WEIGHT, W_STATUS, W_DOCS];
    uint256 pos; uint256 neg;
    for (uint256 i; i < 3; ++i) { (uint256 p, uint256 n) = _factor(claim[i], obs[i], W[i]); pos += p; neg += n; }
    Rep storage R = rep[who];
    if (neg > 0) { R.s += uint128(BPS + neg); lied = true; }   // dishonest: no positive credit
    else         { R.r += uint128(pos); }                     // honest: pos in [0, 10_000]
    emit Feedback(who, currentDealId, uint16(scoreBps(who)), lied ? bytes32("falsified") : bytes32("honest"));
}

function scoreBps(address who) public view returns (uint256) {
    Rep memory R = rep[who]; Prior memory P = prior[who];
    return (uint256(R.r) + P.a) * BPS / (uint256(R.r) + R.s + P.a + P.b);
}

function terms(uint256 sc) public pure returns (uint256 advBps, uint256 yieldBps) {
    if (sc < 5_000) sc = 5_000; if (sc > 9_000) sc = 9_000;
    advBps   = 6_000 + (sc - 5_000) * 3_000 / 4_000;
    yieldBps =   500 - (sc - 5_000) *   300 / 4_000;
}
```

Three rules make this trustworthy rather than decorative. First, **only factory-created deal contracts may call `_record`**. Second, **claims are committed onchain before verification**: the exporter's at shipment declaration, the importer's at arrival. The relayed proof then carries only *observed* facts, and the contract does the comparison. If the agent relayed claims as well, it could launder a lie. Third, `_record` runs **only after the EIP-712 check below succeeds**, so an unsigned or forged response can never move a score. A missing or expired verification should time out to a refund with **no score change**, because a technical failure is not dishonesty. The `Feedback` event mirrors the shape of ERC-8004's `NewFeedback`, a value with decimals plus tags. ERC-8004 itself stores raw feedback onchain and leaves aggregation to offchain indexers, and it has no stake or wallet-age gate ([QuickNode ERC-8004 docs](https://erc-8004.quicknode.com/learn/registries/reputation)). Computing the score *onchain* is therefore a genuine differentiator. Emitting compatible events gives a cheap standards story for the Hedera agent-identity bonus. Whether an ERC-8004 registry is deployed anywhere reachable was not verified.

The verification gate inherits OpenZeppelin's `EIP712("TrustMeBro Verifier", "1")`. It hashes the struct with `_hashTypedDataV4`, then compares `ECDSA.recover` against an immutable `verifier` address. In OZ 5.x, `recover` rejects high-s signatures, signatures that aren't 65 bytes, and malformed `v`. OZ also warns against using signatures as unique IDs, so use nonces instead ([OZ 5.x cryptography](https://docs.openzeppelin.com/contracts/5.x/api/utils/cryptography)). Put the gate in **one central contract**, not in each deal clone. The EIP-712 domain's `verifyingContract` is then a single fixed address the verifier service can know in advance.

```solidity
bytes32 constant VERIFICATION_TYPEHASH = keccak256(
  "Verification(bytes32 dealId,uint8 stage,bool weight,bool statusCode,bool documents,bytes32 paymentRef,uint256 nonce,uint256 expiry)");

function submitVerification(Verification calldata v, bytes calldata sig) external {
    require(block.timestamp <= v.expiry, "expired");
    require(!usedNonce[v.nonce], "nonce");
    usedNonce[v.nonce] = true;                                   // before any external call
    bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(VERIFICATION_TYPEHASH,
        v.dealId, v.stage, v.weight, v.statusCode, v.documents, v.paymentRef, v.nonce, v.expiry)));
    require(ECDSA.recover(digest, sig) == verifier, "bad sig");
    ITradeDeal(dealOf[v.dealId]).applyVerification(v.stage, [v.weight, v.statusCode, v.documents]);
    // deal: compare with stored claims -> registry._record(exporter|importer, ...) -> Released or Disputed
}
```

## POST /verify: one paid request, one signature, two chains

The end-to-end flow runs in eight hops, and each hop has one failure mode worth designing for.

**1. Claims go onchain.** On Whitechain, the exporter declares `{weight, status_code, document_verification}` for the deal. The importer confirms or contests at arrival. Investors have already funded the escrow with sponsor USDT, so that payment satisfies the Whitechain W2 requirement.

**2. The agent discovers the service.** It sends an unpaid `POST /verify`. The `402` response's `PAYMENT-REQUIRED` header carries `accepts[]` (scheme `exact`, network `hedera:testnet`, amount `300000` of USDC `0.0.429274`, `payTo`) plus `extensions.bazaar`, describing the JSON input and output ([bazaar spec](https://github.com/x402-foundation/x402/blob/main/specs/extensions/bazaar.md)). This probe *is* the "finds the endpoint" step for the Hedera track.

**3. Spending controls run.** A deterministic `SpendGuard` checks `payTo` against an allowlist, the amount against per-call and daily caps, and the asset ID. Only then does it allow signing. `client.setSpendControls` acts as the backstop. Hedera Agent Kit has no x402 hook, so these controls must be the team's own code ([Agent Kit hooks & policies](https://docs.hedera.com/solutions/ai/agent-kit/js/create-hooks-and-policies.md)).

**4. The agent pays.** `wrapFetchWithPayment` clones the original `Request`. The paid retry therefore resends the **same POST method, JSON body and `Content-Type` header**, with `PAYMENT-SIGNATURE` added. The library's tests assert the body survives even a third recovery retry. Never set `PAYMENT-SIGNATURE` yourself, or the wrapper throws "Payment already attempted" ([fetch wrapper](https://github.com/x402-foundation/x402/blob/main/typescript/packages/http/fetch/src/index.ts); [tests](https://github.com/x402-foundation/x402/blob/main/typescript/packages/http/fetch/src/index.test.ts)). The payment is a partially signed Hedera `TransferTransaction`. Its transaction-ID account is the **facilitator's fee payer**, so the agent needs USDC and a token association but no HBAR for fees ([Hedera exact scheme](https://github.com/x402-foundation/x402/blob/main/specs/schemes/exact/scheme_exact_hedera.md)).

**5. The server verifies, runs the handler, then settles.** `@x402/express` 2.30.x matches the route key `"POST /verify"`. Under the default `authorization` flow, it verifies the payment and then **buffers your handler's response**. It **settles only if the status is below 400**, and it replaces the body with a 402 if settlement fails ([express middleware](https://github.com/x402-foundation/x402/blob/main/typescript/packages/http/express/src/index.ts)). A malformed claims body that returns 400 therefore costs the agent nothing.

**6. The verifier signs observed facts.** The handler validates with Zod, looks up the observed weight, status and documents, and signs a `Verification` struct with viem's `privateKeyToAccount(...).signTypedData` ([viem signTypedData](https://viem.sh/docs/accounts/signTypedData)). The domain is `{name, version, chainId: 1874, verifyingContract}`. **The chain ID must be Whitechain's 1874, not Hedera's 296**, because the signature is consumed on Whitechain.

**7. The agent relays to Whitechain.** It first pre-checks the signer locally with `recoverTypedDataAddress`, then simulates, then sends `submitVerification`. The contract re-checks everything and updates the Trust Codes.

**8. Both receipts are published.** The HashScan link and the Whitechain explorer link go into the README and HCS.

```ts
// services/verifier/src/server.ts  (@x402/* 2.30.0; not run in research sandbox)
const resourceServer = new x402ResourceServer(new HTTPFacilitatorClient({ url: "https://api.testnet.blocky402.com" }))
  .register("hedera:testnet", new ExactHederaScheme());
app.use(express.json({ limit: "32kb" }));
app.use(paymentMiddleware({
  "POST /verify": {
    accepts: [{ scheme: "exact", network: "hedera:testnet", price: "$0.30",       // = 300000 of 0.0.429274
                payTo: process.env.VERIFIER_PAYTO! }],                            // plain 0.0.x, USDC-associated
    description: "Observed shipment facts for a TrustMeBro deal, EIP-712 signed for Whitechain 1874",
    mimeType: "application/json", serviceName: "TrustMeBro Verifier",
    extensions: { ...declareDiscoveryExtension({ bodyType: "json", input: exampleBody, inputSchema, output: { example } }) },
  },
}, resourceServer));

app.post("/verify", async (req, res) => {
  const p = VerifyRequest.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "bad_request" });   // >= 400 => not settled, not charged
  const o = await observe(p.data);                                          // weighbridge / tracking / doc hash
  res.json(await signVerification(p.data, o, ZERO_REF));                    // Option A: paymentRef = 0x0
});
```

The request payload should look like `{ "dealId": "0x…64 hex", "stage": 1, "claims": { "weight": true, "status_code": true, "document_verification": true }, "shipment": { "containerNo": "MSKU1234567", "blRef": "BL-001", "docHash": "0x…" } }`. Send integers as decimal strings. The JSON keys use snake_case, but the EIP-712 struct uses `statusCode` and `documents`. Map them in one shared module, because **any drift in the type string's names, order or casing produces a different digest and a silent `bad sig`**. The same holds for adding a `salt`, or leaving `verifyingContract` out of the viem domain. Booleans must be real booleans, and `uint256` values must be `bigint`, before signing. Never use `abi.encodePacked`. These encoding rules come from the EIP-712 standard and were not re-fetched this session, so pin them with a **round-trip test**: a signature generated in TypeScript, written as a fixture, and asserted in `forge test`. The response body returns `{ verification: {...}, signature, signer }`.

### The Hedera transaction ID arrives after the signature

This is the subtle part. The v2 `SettleResponse` carries the ID in a field named **`transaction`** ([facilitator types](https://github.com/x402-foundation/x402/blob/main/typescript/packages/core/src/types/facilitator.ts)). The Hedera scheme spec's example calls it `transactionId`, so read it defensively with `settle.transaction ?? settle.transactionId`. Under the default flow, settlement happens **after** the handler has already signed. The handler therefore cannot include the ID in its signature. There are two clean options.

**Option A is the right default for the deadline.** The agent decodes `PAYMENT-RESPONSE`, takes the transaction ID and `payer`, and writes one HCS message: `{dealId, stage, txId, payer, sigHash: keccak256(signature)}`. It then relays the struct with `paymentRef = 0x0`. Invalid bodies stay free, and HCS binds payment to proof by consensus timestamp.

**Option B makes the binding cryptographic.** Hedera's exact scheme supports `paymentFlows: ["authorization", "upfront"]` ([Hedera server scheme](https://github.com/x402-foundation/x402/blob/main/typescript/packages/mechanisms/hedera/src/exact/server/scheme.ts)). Setting `extra: { paymentFlow: "upfront" }` settles *before* the handler runs ([payment flows](https://github.com/x402-foundation/x402/blob/main/typescript/packages/core/src/server/paymentFlow.ts)). An `onAfterSettle` hook in phase `"before-handler"` then captures `result.transaction`, as the official upfront example does ([upfront example](https://github.com/x402-foundation/x402/blob/main/examples/typescript/servers/upfront/index.ts)). The handler signs `paymentRef = keccak256(toBytes(txId))` and returns the plaintext ID alongside it. The cost is that the agent is charged even for a bad body. The handoff from hook to handler, keyed by the raw `PAYMENT-SIGNATURE` header, is untested glue code. Blocky402's `upfront` support is also unverified.

Either way, keep three facts about the ID straight. It looks like `0.0.7162784@1762…` and links as `https://hashscan.io/testnet/transaction/<id>`. Its account part is **the facilitator's fee payer, not the agent**: the agent appears in `payer`. And it should reach Whitechain only as a `bytes32` hash, never as a `string` struct field, which would force asymmetric `keccak256(bytes(...))` handling on the Solidity side.

Several items remain unverified because the research sandbox had no network access. These are: that `@x402/*` 2.30.0 is published on npm; that Blocky402's `/supported` lists `hedera:testnet` with fee payer `0.0.7162784`; the actual settle-field name; and Blocky402's behaviour under `upfront`. Each takes one command or one paid call to settle, and each has a configuration-level fallback. If Blocky402 fails, x402.org's facilitator (fee payer `0.0.9185802`) is also on Hedera's list ([Hedera facilitators](https://docs.hedera.com/solutions/ai/x402/facilitators)).

## Conclusion

The shift from a running average to two counters is small in code but large in what it lets TrustMeBro *claim*. "Honest parties never lose score, and liars always do" becomes a property provable on a whiteboard, not a hope tuned with constants. Judges in a tokenization track respond to exactly that kind of enforced invariant. It also makes the cross-chain proof chain coherent. Claims are committed on Whitechain. Facts are bought and signed through Hedera x402. The contract alone decides who lied. The agent carries data and money but never judgement, which is the honest answer to "who verifies the verifier".

The practical risks sit at the seams, not in the formula. Three are most likely to break a live demo: an EIP-712 type string that differs by one character between viem and Solidity, a chain ID of 296 where 1874 belongs, and a transaction ID read from the wrong field. All three are caught by one fixture-based round-trip test and one real paid call made early on. Ship Option A with HCS first. Upgrade to the upfront flow only once both rails have produced a clickable receipt.
