import { createPublicClient, http, type Address, type Hex, type PublicClient } from "viem"

import { tradeDealsAbi } from "@trustmebro/shared"

/** The on-chain facts the verifier needs about one deal. */
export type DealSnapshot = {
  dealId: bigint
  state: number
  declaredKg: number
  claimedStatus: number
  docHash: Hex
  claimTime: bigint
  verifyDeadline: bigint
  observedAt: bigint
  checks: number
  containerNo: string
  blRef: string
}

export interface DealReader {
  chainId(): Promise<number>
  verifierAddress(): Promise<Address>
  /** undefined if the deal does not exist. */
  deal(dealId: bigint): Promise<DealSnapshot | undefined>
  /** Latest block time, the clock the contract judges with. */
  chainTime(): Promise<bigint>
}

export function createDealReader(rpcUrl: string, tradeDeals: Address): DealReader {
  const client: PublicClient = createPublicClient({ transport: http(rpcUrl, { retryCount: 2, timeout: 10_000 }) })
  let cachedChainId: number | undefined

  return {
    async chainId() {
      cachedChainId ??= await client.getChainId()
      return cachedChainId
    },
    verifierAddress() {
      return client.readContract({ address: tradeDeals, abi: tradeDealsAbi, functionName: "verifier" })
    },
    async deal(dealId) {
      const [d, shipment] = await Promise.all([
        client.readContract({ address: tradeDeals, abi: tradeDealsAbi, functionName: "getDeal", args: [dealId] }),
        client.readContract({ address: tradeDeals, abi: tradeDealsAbi, functionName: "getShipment", args: [dealId] }),
      ])
      if (d.state === 0) return undefined
      return {
        dealId,
        state: d.state,
        declaredKg: d.declaredKg,
        claimedStatus: d.claimedStatus,
        docHash: d.docHash,
        claimTime: d.claimTime,
        verifyDeadline: d.verifyDeadline,
        observedAt: d.observedAt,
        checks: d.checks,
        containerNo: shipment.containerNo,
        blRef: shipment.blRef,
      }
    },
    async chainTime() {
      const block = await client.getBlock({ blockTag: "latest" })
      return block.timestamp
    },
  }
}
