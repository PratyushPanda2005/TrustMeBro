import { createHash, randomInt } from "node:crypto"

/**
 * PLACEHOLDER for the x402 verifier (master plan §5). It speaks the real
 * protocol shape: no payment gets 402, payment gets a signed result. Nothing is
 * really paid or signed, and shipment data is simulated from `scenario`.
 */
const USDC = "0.0.429274"
const SCENARIOS = ["honest", "fake-weight", "fake-docs", "overpriced"]

const encode = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString("base64")

const isClaim = (value: unknown) => typeof value === "boolean"

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const claims = body?.claims
  if (
    typeof body?.dealId !== "string" ||
    !isClaim(claims?.weight) ||
    !isClaim(claims?.status_code) ||
    !isClaim(claims?.document_verification)
  ) {
    return Response.json(
      { error: "Expected dealId and three boolean claims" },
      { status: 400 },
    )
  }

  const scenario = SCENARIOS.includes(body.scenario) ? body.scenario : "honest"
  const price = scenario === "overpriced" ? "$5.00" : "$0.30"
  const signed = request.headers.get("PAYMENT-SIGNATURE")

  if (!signed) {
    const quote = {
      scheme: "exact",
      network: "hedera:testnet",
      asset: USDC,
      price,
      payTo: "0.0.8123",
    }
    return Response.json(
      { error: "Payment Required", ...quote, mock: true },
      { status: 402, headers: { "PAYMENT-REQUIRED": encode(quote) } },
    )
  }

  const now = Math.floor(Date.now() / 1000)
  const result = {
    dealId: body.dealId,
    weight: scenario !== "fake-weight",
    statusCode: true,
    documents: scenario !== "fake-docs",
    nonce: randomInt(1, 1_000_000),
    expiry: now + 600,
  }
  const signature = `0x${createHash("sha256")
    .update(JSON.stringify(result))
    .digest("hex")}`

  return Response.json(
    { ...result, signature, mock: true },
    {
      headers: {
        "PAYMENT-RESPONSE": encode({
          success: true,
          network: "hedera:testnet",
          transaction: `0.0.8123@${now}.${randomInt(1e8, 1e9)}`,
        }),
      },
    },
  )
}
