import type { Settlement } from "./x402.ts";

/** Read-only corroboration of the exact transfer; never initiates a payment. */
export async function confirmHederaPayment(
  s: Settlement,
  q: { network: string; asset: string; payTo: string; amount: string },
  payer: string,
  notBeforeMs: number,
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  if (
    !s.success ||
    s.payer !== payer ||
    !s.txId ||
    q.network !== "hedera:testnet"
  )
    return false;
  const id = s.txId.replace("@", "-").replace(/\.(\d+)$/, "-$1");
  if (!/^0\.0\.\d+-\d+-\d+$/.test(id)) return false;
  try {
    const res = await fetcher(
      `https://testnet.mirrornode.hedera.com/api/v1/transactions/${id}`,
      { signal: AbortSignal.timeout(10000) },
    );
    if (!res.ok) return false;
    const body = (await res.json()) as {
      transactions?: {
        result: string;
        name: string;
        consensus_timestamp: string;
        token_transfers: {
          token_id: string;
          account: string;
          amount: number;
        }[];
      }[];
    };
    return (
      body.transactions?.some((t) => {
        const stamp = Number(t.consensus_timestamp) * 1000;
        if (
          t.result !== "SUCCESS" ||
          t.name !== "CRYPTOTRANSFER" ||
          !Number.isFinite(stamp) ||
          stamp < notBeforeMs - 60000
        )
          return false;
        const transfers =
          t.token_transfers?.filter((x) => x.token_id === q.asset) ?? [];
        const net = (who: string) =>
          transfers
            .filter((x) => x.account === who)
            .reduce((sum, x) => {
              if (!Number.isSafeInteger(x.amount))
                throw Error("Unsafe token units");
              return sum + BigInt(x.amount);
            }, 0n);
        return (
          net(payer) === -BigInt(q.amount) && net(q.payTo) === BigInt(q.amount)
        );
      }) ?? false
    );
  } catch {
    return false;
  }
}
