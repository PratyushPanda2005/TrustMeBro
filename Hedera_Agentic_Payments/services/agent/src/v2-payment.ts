import type { Settlement } from "./x402.ts"

type MirrorTransaction = {
  result: string
  name: string
  consensus_timestamp: string
  token_transfers: {
    token_id: string
    account: string
    amount: number
  }[]
}

// Mirror Node lags consensus by a few seconds, so a just-settled payment can be missing at first.
const MIRROR_ATTEMPTS = 11
const MIRROR_WAIT_MS = 3000
const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms))

/** Returns nothing until Mirror Node has the transaction. */
async function lookup(id: string, fetcher: typeof fetch) {
  try {
    const res = await fetcher(
      `https://testnet.mirrornode.hedera.com/api/v1/transactions/${id}`,
      { signal: AbortSignal.timeout(10000) },
    )
    if (!res.ok) return undefined
    const body = (await res.json()) as { transactions?: MirrorTransaction[] }
    return body.transactions?.length ? body.transactions : undefined
  } catch {
    return undefined
  }
}

/** Read-only corroboration of the exact transfer; never initiates a payment. */
export async function confirmHederaPayment(
  s: Settlement,
  q: { network: string; asset: string; payTo: string; amount: string },
  payer: string,
  notBeforeMs: number,
  fetcher: typeof fetch = fetch,
  wait: (ms: number) => Promise<void> = sleep,
): Promise<boolean> {
  if (
    !s.success ||
    s.payer !== payer ||
    !s.txId ||
    q.network !== "hedera:testnet"
  )
    return false
  const id = s.txId.replace("@", "-").replace(/\.(\d+)$/, "-$1")
  if (!/^0\.0\.\d+-\d+-\d+$/.test(id)) return false

  let transactions = await lookup(id, fetcher)
  for (let attempt = 1; !transactions && attempt < MIRROR_ATTEMPTS; attempt++) {
    await wait(MIRROR_WAIT_MS)
    transactions = await lookup(id, fetcher)
  }
  if (!transactions) return false

  // Once Mirror Node has answered, a mismatch is final, so it isn't retried.
  try {
    return transactions.some((t) => {
      const stamp = Number(t.consensus_timestamp) * 1000
      if (
        t.result !== "SUCCESS" ||
        t.name !== "CRYPTOTRANSFER" ||
        !Number.isFinite(stamp) ||
        stamp < notBeforeMs - 60000
      )
        return false
      const transfers =
        t.token_transfers?.filter((x) => x.token_id === q.asset) ?? []
      const net = (who: string) =>
        transfers
          .filter((x) => x.account === who)
          .reduce((sum, x) => {
            if (!Number.isSafeInteger(x.amount))
              throw Error("Unsafe token units")
            return sum + BigInt(x.amount)
          }, 0n)
      return (
        net(payer) === -BigInt(q.amount) && net(q.payTo) === BigInt(q.amount)
      )
    })
  } catch {
    return false
  }
}
