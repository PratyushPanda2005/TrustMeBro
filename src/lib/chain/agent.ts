import "server-only"

import type { PendingApproval } from "@/lib/trade/types"

const API = process.env.AGENT_API_URL ?? "http://127.0.0.1:4002"

type Approval = {
  id: string
  dealId: string
  checkNo: number
  payTo: string
  amount: string
  reason: string
  status: string
  createdAt: string
}

/** The Hedera agent's human approval queue, when that agent is running. */
export async function readApprovals(): Promise<{
  online: boolean
  pending: PendingApproval[]
}> {
  try {
    const response = await fetch(`${API}/approvals`, {
      signal: AbortSignal.timeout(800),
    })
    const { approvals } = (await response.json()) as { approvals: Approval[] }
    return {
      online: true,
      pending: approvals
        .filter((item) => item.status === "pending")
        .map((item) => ({
          id: item.id,
          dealId: BigInt(item.dealId).toString(),
          checkNo: item.checkNo,
          payTo: item.payTo,
          price: Number(item.amount) / 1_000_000,
          reason: item.reason,
          at: Date.parse(item.createdAt),
        })),
    }
  } catch {
    return { online: false, pending: [] }
  }
}

export async function decideApproval(
  id: string,
  decision: "approve" | "reject",
) {
  const response = await fetch(`${API}/approvals/${id}/${decision}`, {
    method: "POST",
    headers: process.env.AGENT_API_TOKEN
      ? { authorization: `Bearer ${process.env.AGENT_API_TOKEN}` }
      : {},
  })
  if (!response.ok) throw new Error(`The agent refused: ${response.status}`)
}
