import express, { type NextFunction, type Request, type RequestHandler, type Response } from "express"
import type { Address } from "viem"
import { z } from "zod"

import {
  DealState,
  OUTCOME_NAMES,
  dealIdToBytes32,
  judge,
  verificationDomain,
  type VerificationMessage,
} from "@trustmebro/shared"

import type { DealReader } from "./chain"
import type { Logger } from "./log"
import { SCENARIOS, SCENARIO_INFO, evidenceFor, observe, type ScenarioBook } from "./scenarios"
import { randomNonce, sigHash, toWire, type VerificationSigner } from "./signer"

export type AppDeps = {
  reader: DealReader
  signer: VerificationSigner
  scenarios: ScenarioBook
  tradeDeals: Address
  chainId: number
  signatureTtlSeconds: number
  /** x402 middleware for POST /verify; undefined = free (local development). */
  payment?: RequestHandler
  payments: Record<string, unknown>
  demoToken?: string
  corsOrigin?: string
  log: Logger
  now?: () => bigint
}

const dealIdInput = z.union([
  z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform((v) => BigInt(v)),
  z.string().regex(/^\d{1,78}$/).transform((v) => BigInt(v)),
  z.number().int().nonnegative().transform((v) => BigInt(v)),
])

export const verifyRequest = z.object({
  dealId: dealIdInput,
  shipmentRef: z.object({
    containerNo: z.string().trim().min(1).max(32),
    blRef: z.string().trim().max(64).default(""),
  }),
})

const scenarioBody = z.object({ scenario: z.enum(SCENARIOS) })

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

const VERIFIABLE_STATES: number[] = [DealState.Claimed, DealState.Pending]

export function createApp(deps: AppDeps) {
  const { reader, signer, scenarios, tradeDeals, chainId, log } = deps
  const now = deps.now ?? (() => BigInt(Math.floor(Date.now() / 1000)))
  const app = express()

  app.disable("x-powered-by")
  app.set("trust proxy", true)
  app.use(cors(deps.corsOrigin ?? "*"))
  app.use(express.json({ limit: "32kb" }))

  const info = () => ({
    service: "trustmebro-verifier",
    signer: signer.address,
    chainId,
    tradeDeals,
    domain: verificationDomain(tradeDeals, chainId),
    payments: deps.payments,
    endpoints: {
      verify: "POST /verify (paid via x402 when payments are on)",
      health: "GET /health",
      scenarios: "GET /demo/scenarios",
    },
  })

  app.get("/", (_req, res) => {
    res.json(info())
  })

  app.get("/health", async (_req, res) => {
    try {
      const onChain = await reader.verifierAddress()
      const matches = onChain.toLowerCase() === signer.address.toLowerCase()
      res.status(matches ? 200 : 503).json({ ok: matches, verifierOnChain: onChain, ...info() })
    } catch (err) {
      res.status(503).json({ ok: false, error: "chain_unavailable", detail: errorMessage(err), ...info() })
    }
  })

  if (deps.payment) app.use(deps.payment)

  app.post("/verify", async (req, res) => {
    const parsed = verifyRequest.safeParse(req.body)
    if (!parsed.success) throw new HttpError(400, "bad_request", z.prettifyError(parsed.error))
    const { dealId, shipmentRef } = parsed.data

    const deal = await readDeal(dealId)
    if (!deal) throw new HttpError(404, "deal_not_found", `Deal ${dealId} does not exist`)
    if (!VERIFIABLE_STATES.includes(deal.state)) {
      throw new HttpError(409, "wrong_state", `Deal ${dealId} is in state ${deal.state}, not Claimed (3) or Pending (4)`)
    }
    if (
      deal.containerNo.toUpperCase() !== shipmentRef.containerNo.toUpperCase() ||
      deal.blRef !== shipmentRef.blRef
    ) {
      throw new HttpError(400, "shipment_ref_mismatch", "shipmentRef does not match the exporter's on-chain claim")
    }

    const scenario = scenarios.get(deal.containerNo)
    const observed = observe(deal, scenario)

    // Strictly newer than the claim and the previous check, or the contract rejects it as stale.
    const t = now()
    let observedAt = t
    if (observedAt <= deal.claimTime) observedAt = deal.claimTime + BigInt(1)
    if (observedAt <= deal.observedAt) observedAt = deal.observedAt + BigInt(1)

    const message: VerificationMessage = {
      dealId: dealIdToBytes32(dealId),
      observedKg: observed.observedKg,
      statusCode: observed.statusCode,
      docHash: observed.docHash,
      observedAt,
      nonce: randomNonce(),
      expiry: t + BigInt(deps.signatureTtlSeconds),
    }
    const signature = await signer.sign(message, tradeDeals, chainId)
    const expected = judge(
      {
        declaredKg: deal.declaredKg,
        claimedStatus: deal.claimedStatus,
        docHash: deal.docHash,
        verifyDeadline: deal.verifyDeadline,
      },
      message,
    )

    log.info("signed observation", {
      dealId,
      scenario,
      check: deal.checks + 1,
      observedKg: message.observedKg,
      statusCode: message.statusCode,
      expected: OUTCOME_NAMES[expected.outcome],
    })

    res.json({
      dealId: dealId.toString(),
      verification: toWire(message),
      signature,
      signer: signer.address,
      sigHash: sigHash(signature),
      domain: { ...verificationDomain(tradeDeals, chainId) },
      expected: { outcome: OUTCOME_NAMES[expected.outcome], falsifiedMask: expected.falsifiedMask },
      evidence: evidenceFor(deal, observed),
      check: deal.checks + 1,
      demo: { scenario },
    })
  })

  const demoAuth: RequestHandler = (req, _res, next) => {
    if (deps.demoToken && req.get("x-demo-token") !== deps.demoToken) {
      throw new HttpError(401, "unauthorized", "Missing or wrong x-demo-token header")
    }
    next()
  }

  app.get("/demo/scenarios", (_req, res) => {
    res.json({ ...scenarios.list(), available: SCENARIO_INFO })
  })

  app.put("/demo/scenarios/default", demoAuth, (req, res) => {
    const body = scenarioBody.safeParse(req.body)
    if (!body.success) throw new HttpError(400, "bad_request", z.prettifyError(body.error))
    scenarios.setDefault(body.data.scenario)
    log.info("default scenario set", { scenario: body.data.scenario })
    res.json(scenarios.list())
  })

  app.put("/demo/scenarios/:containerNo", demoAuth, (req, res) => {
    const containerNo = String(req.params.containerNo).trim()
    if (containerNo.length === 0 || containerNo.length > 32) {
      throw new HttpError(400, "bad_request", "containerNo must be 1-32 characters")
    }
    const body = scenarioBody.safeParse(req.body)
    if (!body.success) throw new HttpError(400, "bad_request", z.prettifyError(body.error))
    scenarios.set(containerNo, body.data.scenario)
    log.info("container scenario set", { containerNo, scenario: body.data.scenario })
    res.json(scenarios.list())
  })

  app.delete("/demo/scenarios/:containerNo", demoAuth, (req, res) => {
    scenarios.remove(String(req.params.containerNo))
    res.json(scenarios.list())
  })

  app.use((_req, _res) => {
    throw new HttpError(404, "not_found", "No such route")
  })

  // 4xx and 5xx responses are never settled by the x402 middleware, so the agent isn't charged for them.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.code, message: err.message })
      return
    }
    if (isBodyParseError(err)) {
      res.status(400).json({ error: "bad_request", message: "Body must be valid JSON" })
      return
    }
    log.error("unhandled error", { error: errorMessage(err) })
    res.status(500).json({ error: "internal_error", message: "Verifier failed; you were not charged" })
  })

  async function readDeal(dealId: bigint) {
    try {
      return await reader.deal(dealId)
    } catch (err) {
      log.warn("chain read failed", { dealId, error: errorMessage(err) })
      throw new HttpError(502, "chain_unavailable", "Could not read the deal from Whitechain; try again")
    }
  }

  return app
}

function cors(origin: string): RequestHandler {
  return (req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", origin)
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, X-Demo-Token, PAYMENT-SIGNATURE, X-PAYMENT, Access-Control-Expose-Headers",
    )
    res.setHeader("Access-Control-Expose-Headers", "PAYMENT-REQUIRED, PAYMENT-RESPONSE, X-PAYMENT-RESPONSE")
    if (req.method === "OPTIONS") {
      res.status(204).end()
      return
    }
    next()
  }
}

function isBodyParseError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { type?: string }).type === "entity.parse.failed"
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
