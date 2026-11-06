import { randomBytes, randomInt } from "node:crypto"

/**
 * PLACEHOLDER for `TradeDeals` and `TrustRegistry` on Whitechain (master plan
 * §6). It only mints a mock receipt for a known method: the state change itself
 * happens in the mock engine, as the client would read it back from the chain.
 */
const METHODS = [
  "createInvoice",
  "approve",
  "buy",
  "declareShipment",
  "submitVerification",
  "settle",
  "markDefault",
  "expire",
  "redeem",
  "onboardImporter",
  "setAllowlisted",
]

export function GET() {
  return Response.json({ chainId: 1874, methods: METHODS, mock: true })
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  if (!METHODS.includes(body?.method)) {
    return Response.json({ error: "Unknown contract method" }, { status: 400 })
  }
  return Response.json({
    method: body.method,
    chainId: 1874,
    status: "success",
    txHash: `0x${randomBytes(32).toString("hex")}`,
    blockNumber: randomInt(1_000_000, 9_000_000),
    mock: true,
  })
}
