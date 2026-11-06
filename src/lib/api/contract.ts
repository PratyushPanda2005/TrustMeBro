import type { TxRef } from "@/lib/trade/types"

/** Swap this body for wagmi/viem `writeContract` at integration. */
export async function sendTransaction(
  method: string,
  args: unknown,
): Promise<TxRef> {
  const response = await fetch("/api/contract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ method, args }),
  })
  if (!response.ok) throw new Error(`Contract call failed: ${method}`)
  const receipt = await response.json()
  return { chain: "whitechain", hash: receipt.txHash }
}
