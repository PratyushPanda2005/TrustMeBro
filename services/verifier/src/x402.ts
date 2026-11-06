import type { RequestHandler } from "express"
import { HTTPFacilitatorClient } from "@x402/core/server"
import { paymentMiddleware, x402ResourceServer } from "@x402/express"
import { bazaarResourceServerExtension, declareDiscoveryExtension } from "@x402/extensions/bazaar"
import { ExactHederaScheme } from "@x402/hedera/exact/server"

import type { Config } from "./config"
import type { Logger } from "./log"
import { usdcUnits } from "./price"

export const exampleRequest = {
  dealId: "0x0000000000000000000000000000000000000000000000000000000000000001",
  shipmentRef: { containerNo: "MSKU1234567", blRef: "BL-001" },
}

const requestSchema = {
  type: "object",
  required: ["dealId", "shipmentRef"],
  properties: {
    dealId: { type: "string", description: "TradeDeals deal id as bytes32 hex (or a decimal string)" },
    shipmentRef: {
      type: "object",
      required: ["containerNo"],
      properties: {
        containerNo: { type: "string", maxLength: 32 },
        blRef: { type: "string", maxLength: 64 },
      },
    },
  },
}

const exampleResponse = {
  verification: {
    dealId: exampleRequest.dealId,
    observedKg: 9850,
    statusCode: 4,
    docHash: "0x…",
    observedAt: "1762400000",
    nonce: "…",
    expiry: "1762400600",
  },
  signature: "0x…",
  signer: "0x…",
  sigHash: "0x…",
  expected: { outcome: "Verified", falsifiedMask: 0 },
}

export function createPaymentMiddleware(cfg: Config, log: Logger): RequestHandler {
  if (!cfg.VERIFIER_PAYTO) throw new Error("VERIFIER_PAYTO is required when PAYMENTS=on")

  const facilitator = new HTTPFacilitatorClient({ url: cfg.FACILITATOR_URL, timeoutMs: 60_000 })
  const server = new x402ResourceServer(facilitator).register(cfg.HEDERA_NETWORK, new ExactHederaScheme())
  server.registerExtension(bazaarResourceServerExtension)
  server.onAfterSettle(async (ctx) => {
    log.info("payment settled", {
      transaction: ctx.result.transaction,
      payer: ctx.result.payer,
      network: ctx.result.network,
    })
  })
  server.onSettleFailure(async (ctx) => {
    log.warn("payment settlement failed", { error: ctx.error.message })
  })

  return paymentMiddleware(
    {
      "POST /verify": {
        accepts: {
          scheme: "exact",
          network: cfg.HEDERA_NETWORK,
          price: { amount: usdcUnits(cfg.PRICE), asset: cfg.HEDERA_USDC },
          payTo: cfg.VERIFIER_PAYTO,
          maxTimeoutSeconds: 120,
        },
        description:
          "Observed shipment facts (terminal weighbridge weight, carrier status, eBL document hash) for a " +
          "TrustMeBro deal, EIP-712 signed for TradeDeals on Whitechain (chain 1874). Not charged on 4xx.",
        mimeType: "application/json",
        serviceName: "TrustMeBro Verifier",
        tags: ["trade-finance", "shipment", "verification", "eip712"],
        extensions: {
          ...declareDiscoveryExtension({
            bodyType: "json",
            input: exampleRequest,
            inputSchema: requestSchema,
            output: { example: exampleResponse },
          }),
        },
      },
    },
    server,
  ) as RequestHandler
}
