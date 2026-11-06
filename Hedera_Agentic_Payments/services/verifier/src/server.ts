/**
 * TrustMeBro verification API: x402-protected POST /verify on Hedera testnet.
 *
 *   unpaid POST /verify  -> 402 + PAYMENT-REQUIRED (price, USDC 0.0.429274, payTo, Bazaar schema)
 *   paid retry           -> handler runs -> 200 + PAYMENT-RESPONSE (settled via facilitator)
 *   handler >= 400       -> not settled (agent not charged)
 *
 * Packages: @x402/* 2.30.0 (x402 v2). Facilitator: Blocky402 (fallback x402.org).
 * Run: pnpm verifier   (greedy demo merchant: VERIFY_PRICE='$5.00' VERIFIER_PORT=4022 pnpm verifier)
 */
import "@tmb/shared/env";
import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactHederaScheme } from "@x402/hedera/exact/server";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { HEDERA_NETWORK, VERIFY_PRICE, tradeDealsOrPlaceholder, type Hex } from "@tmb/shared";
import { signVerification } from "@tmb/shared/sign";
import { handleVerify } from "./handler.ts";
import { ScenarioBook, NonceSource, isScenario, SCENARIOS, priceFor, dealIdOf } from "./observe.ts";

const need = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`missing env ${k} (see .env.example)`);
  return v;
};

const FACILITATOR_URL = process.env.FACILITATOR_URL ?? "https://api.testnet.blocky402.com";
const PAY_TO = need("VERIFIER_PAYTO");
const SIGNER_KEY = need("VERIFIER_EVM_PRIVATE_KEY") as Hex;
const PRICE = process.env.VERIFY_PRICE ?? VERIFY_PRICE;
// Price under the "overcharge" demo scenario (greedy merchant, switchable from the dashboard).
const OVERCHARGE_PRICE = process.env.OVERCHARGE_PRICE ?? "$5.00";
const PORT = Number(process.env.VERIFIER_PORT ?? 4021);
const ADMIN_TOKEN = process.env.VERIFIER_ADMIN_TOKEN ?? "dev-admin";
const TTL_SEC = Number(process.env.VERIFY_TTL_SEC ?? 600);
// EIP-712 verifyingContract: the TradeDeals whose verifier() is this key (placeholder until lane C deploys).
const TRADE_DEALS = tradeDealsOrPlaceholder();

const book = new ScenarioBook((process.env.VERIFIER_SCENARIO as any) ?? "honest");
const nonces = new NonceSource();

// Bazaar discovery (plan v5 §8): body is {dealId, shipmentRef}; the claims stay on chain.
const bazaar = declareDiscoveryExtension({
  bodyType: "json",
  input: { dealId: "0x" + "00".repeat(31) + "01", shipmentRef: { containerNo: "MSKU1234567", blRef: "BL-001" } },
  inputSchema: {
    properties: {
      dealId: { type: "string", pattern: "^0x[0-9a-fA-F]{64}$", description: "TradeDeals uint256 deal id as bytes32" },
      shipmentRef: {
        type: "object",
        properties: { containerNo: { type: "string", maxLength: 32 }, blRef: { type: "string", maxLength: 64 } },
        required: ["containerNo"],
      },
    },
    required: ["dealId", "shipmentRef"],
  },
  output: {
    example: {
      verification: { dealId: "0x…", observedKg: 9850, statusCode: 4, docHash: "0x…", observedAt: "1800000000", nonce: "1", expiry: "1800000600" },
      signature: "0x…", signer: "0x…", chainId: 1874, verifyingContract: "0x…",
    },
  },
});

const routeConfig = {
  "POST /verify": {
    accepts: [{
      scheme: "exact", network: HEDERA_NETWORK, payTo: PAY_TO,
      // express.json() runs first, so the body (and its dealId) is available here.
      price: (ctx: { adapter: { getBody?(): unknown } }) => priceFor(book.for(dealIdOf(ctx.adapter.getBody?.())), PRICE, OVERCHARGE_PRICE),
    }],
    description: "Observed shipment facts (weighbridge kg, carrier status, eBL doc hash) for a TrustMeBro deal, EIP-712 signed for Whitechain 1874",
    mimeType: "application/json",
    serviceName: "TrustMeBro Verifier",
    tags: ["trade-finance", "verification", "rwa"],
    extensions: { ...bazaar },
  },
};

const resourceServer = new x402ResourceServer(new HTTPFacilitatorClient({ url: FACILITATOR_URL }))
  .register(HEDERA_NETWORK, new ExactHederaScheme());

const app = express();
app.use(express.json({ limit: "32kb" }));

// Discovery catalog (free): lets the agent find the paid endpoint and its terms.
app.get("/.well-known/x402.json", (_req, res) => {
  res.json({
    service: "TrustMeBro Verifier",
    endpoints: [{ method: "POST", path: "/verify", price: PRICE, network: HEDERA_NETWORK, payTo: PAY_TO, facilitator: FACILITATOR_URL }],
  });
});
app.get("/health", (_req, res) => res.json({ ok: true, price: PRICE, payTo: PAY_TO, tradeDeals: TRADE_DEALS }));

// Demo panel (dashboard → /api/scenario → here). Not paywalled; token-protected.
app.get("/admin/scenario", (_req, res) => res.json({ scenarios: SCENARIOS, ...book.snapshot() }));
app.post("/admin/scenario", (req, res) => {
  if (req.get("x-admin-token") !== ADMIN_TOKEN) return res.status(401).json({ error: "unauthorized" });
  const { scenario, dealId } = req.body ?? {};
  if (!isScenario(scenario)) return res.status(400).json({ error: "unknown scenario", scenarios: SCENARIOS });
  book.set(scenario, dealId);
  res.json(book.snapshot());
});

app.use(paymentMiddleware(routeConfig as any, resourceServer));

app.post("/verify", async (req, res) => {
  // Express 4 does not catch async errors: an unhandled rejection would crash the verifier.
  // A 500 is >= 400, so x402 does not settle and the agent is not charged.
  const r = await handleVerify(req.body, {
    book, nonces, ttlSec: TTL_SEC, tradeDeals: TRADE_DEALS,
    nowSec: () => Math.floor(Date.now() / 1000),
    sign: (tradeDeals, v) => signVerification(SIGNER_KEY, tradeDeals, v),
  }).catch((err: Error) => ({ status: 500, json: { error: "internal_error", message: err.message } }));
  console.log(`[verify] ${req.body?.dealId ?? "?"} scenario=${book.for(req.body?.dealId ?? "")} -> ${r.status}`);
  res.status(r.status).json(r.json);
});

app.listen(PORT, () => {
  console.log(`TrustMeBro verifier on :${PORT}  price=${PRICE}  payTo=${PAY_TO}  tradeDeals=${TRADE_DEALS}  facilitator=${FACILITATOR_URL}`);
});
