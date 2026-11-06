import type { Claims, Scenario, TxRef } from "@/lib/trade/types"

type VerifyInput = { dealId: string; claims: Claims; scenario?: Scenario }

const decode = (header: string | null) =>
  header ? JSON.parse(atob(header)) : null

const toBody = ({ dealId, claims, scenario }: VerifyInput) =>
  JSON.stringify({
    dealId,
    shipmentRef: `SHIP-${dealId}`,
    claims: {
      weight: claims.weight,
      status_code: claims.statusCode,
      document_verification: claims.documents,
    },
    scenario,
  })

const post = (input: VerifyInput, headers: Record<string, string> = {}) =>
  fetch("/api/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: toBody(input),
  })

/** First leg: asks unpaid and returns the price from the 402. */
export async function requestQuote(input: VerifyInput) {
  const response = await post(input)
  if (response.status !== 402) {
    throw new Error(`Expected a 402 quote, got ${response.status}`)
  }
  const quote = decode(response.headers.get("PAYMENT-REQUIRED"))
  return { price: Number(String(quote.price).replace("$", "")) }
}

/** Second leg: pays. At integration `wrapFetchWithPayment` does this. */
export async function payAndVerify(input: VerifyInput) {
  const response = await post(input, { "PAYMENT-SIGNATURE": "mock-signed-tx" })
  if (!response.ok) throw new Error(`Verification failed: ${response.status}`)
  const body = await response.json()
  const receipt = decode(response.headers.get("PAYMENT-RESPONSE"))
  const observed: Claims = {
    weight: body.weight,
    statusCode: body.statusCode,
    documents: body.documents,
  }
  const tx: TxRef = { chain: "hedera", hash: receipt.transaction }
  return { observed, tx }
}
