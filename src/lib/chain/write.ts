import "server-only"

import { writeFileSync } from "node:fs"

import { erc20Abi, tradeDealsAbi } from "@trustmebro/shared"
import {
  BaseError,
  ContractFunctionRevertedError,
  createWalletClient,
  http,
  keccak256,
  parseUnits,
  stringToHex,
  type Abi,
  type Address,
} from "viem"
import { privateKeyToAccount } from "viem/accounts"

import type { Role } from "@/lib/trade/types"

import { decideApproval } from "./agent"
import { chainFor, publicClient } from "./client"
import { loadDeployment, metaPath, readMeta } from "./deployment"

const TERMS = keccak256(
  stringToHex("TrustMeBro T&C v1: pay to the TradeDeals contract"),
)
// Short windows so a demo plays out in minutes, per plan v5 §3.
const DURATIONS = {
  verifyWindow: 90,
  listingWindow: 86_400,
  graceWindow: 86_400,
}

export type TradeAction =
  | {
      type: "createDeal"
      goods: string
      invoiceRef: string
      amount: number
      dueAt: number
      importerId: string
    }
  | { type: "approveDeal"; dealId: string }
  | {
      type: "declareClaims"
      dealId: string
      declaredKg: number
      status: number
      documents: string
      containerNo: string
      blRef: string
      scenario: string
    }
  | { type: "fund"; dealId: string }
  | { type: "pay"; dealId: string; amount: number }
  | { type: "cancel"; dealId: string }
  | { type: "markDefault"; dealId: string }
  | { type: "expire"; dealId: string }
  | { type: "decideApproval"; id: string; decision: "approve" | "reject" }

const errors: Record<string, string> = {
  CreditLimitExceeded: "That's over your credit limit.",
  ScoreTooLow: "A Trust Score below 40% can't open new deals.",
  InvoiceInUse: "This invoice has already been financed.",
  InvalidDueDate: "Pick a due date between tomorrow and the maximum tenor.",
  InvalidAmount: "Invoices start at 10 USDT.",
  InvalidClaim: "Status must be Loaded or later, and weight above zero.",
  InvalidShipmentRef: "Check the container and bill of lading references.",
  ListingClosed: "The listing window for this deal has closed.",
  AdvanceTooSmall: "The advance doesn't cover the minimum fee.",
  SlippageExceeded: "The terms changed. Check them and try again.",
  WrongState: "This deal has moved on. Refresh and check its state.",
  NotKyced: "That wallet isn't KYC'd for this role.",
  NotParty: "Only a party to this deal can do that.",
  PastDueDate: "The due date has passed.",
}

/** Turns a revert into a sentence, and leaves other errors as they are. */
export function explain(error: unknown) {
  if (error instanceof BaseError) {
    const revert = error.walk(
      (cause) => cause instanceof ContractFunctionRevertedError,
    ) as ContractFunctionRevertedError | undefined
    const name = revert?.data?.errorName
    if (name) return errors[name] ?? `The contract refused: ${name}`
    return error.shortMessage
  }
  return error instanceof Error ? error.message : "Something went wrong"
}

const units = (value: number) => parseUnits(value.toString(), 6)

export async function runAction(action: TradeAction) {
  if (action.type === "decideApproval") {
    return decideApproval(action.id, action.decision)
  }

  const deployment = loadDeployment()
  if (!deployment.keys) {
    throw new Error(
      "This network signs in the wallet, which isn't connected yet.",
    )
  }

  const client = publicClient(deployment)
  const chain = chainFor(deployment)
  const tradeDeals = {
    address: deployment.tradeDeals,
    abi: tradeDealsAbi as Abi,
  }

  const send = async (
    role: Role,
    target: { address: Address; abi: Abi },
    functionName: string,
    args: readonly unknown[],
  ) => {
    const key = deployment.keys?.[role]
    if (!key) throw new Error(`No test key for ${role}`)
    const account = privateKeyToAccount(key)
    const { request } = await client.simulateContract({
      ...target,
      account,
      functionName,
      args,
    })
    const wallet = createWalletClient({
      account,
      chain,
      transport: http(deployment.rpcUrl),
    })
    const hash = await wallet.writeContract(request)
    await client.waitForTransactionReceipt({ hash })
    return hash
  }

  const usdt = { address: deployment.usdt, abi: erc20Abi as Abi }

  switch (action.type) {
    case "createDeal": {
      await send("exporter", tradeDeals, "createDeal", [
        units(action.amount),
        BigInt(Math.floor(action.dueAt / 1000)),
        action.importerId,
        keccak256(stringToHex(`${action.invoiceRef} ${action.goods}`)),
        TERMS,
        DURATIONS,
      ])
      const count = await client.readContract({
        address: deployment.tradeDeals,
        abi: tradeDealsAbi,
        functionName: "dealCount",
      })
      const meta = readMeta()
      meta[count.toString()] = {
        goods: action.goods,
        invoiceRef: action.invoiceRef,
      }
      writeFileSync(metaPath, JSON.stringify(meta, null, 2))
      return
    }
    case "approveDeal":
      await send("importer", tradeDeals, "approveDeal", [
        BigInt(action.dealId),
        TERMS,
      ])
      return
    case "declareClaims": {
      // Set first: the agent checks the moment the claim lands.
      await fetch(
        `${deployment.verifierUrl}/demo/scenarios/${encodeURIComponent(action.containerNo)}`,
        {
          method: "PUT",
          headers: {
            "content-type": "application/json",
            "x-demo-token": deployment.demoToken ?? "",
          },
          body: JSON.stringify({ scenario: action.scenario }),
        },
      )
      await send("exporter", tradeDeals, "declareClaims", [
        BigInt(action.dealId),
        action.declaredKg,
        action.status,
        keccak256(stringToHex(action.documents)),
        action.containerNo,
        action.blRef,
      ])
      return
    }
    case "fund": {
      const quote = await client.readContract({
        address: deployment.tradeDeals,
        abi: tradeDealsAbi,
        functionName: "quote",
        args: [BigInt(action.dealId)],
      })
      await send("investor", usdt, "approve", [
        deployment.tradeDeals,
        quote.advance,
      ])
      await send("investor", tradeDeals, "fund", [
        BigInt(action.dealId),
        quote.advance,
        quote.yieldBps,
      ])
      return
    }
    case "pay":
      await send("importer", usdt, "approve", [
        deployment.tradeDeals,
        units(action.amount),
      ])
      await send("importer", tradeDeals, "pay", [
        BigInt(action.dealId),
        units(action.amount),
      ])
      return
    case "cancel":
      await send("exporter", tradeDeals, "cancel", [BigInt(action.dealId)])
      return
    case "markDefault":
      await send("admin", tradeDeals, "markDefault", [BigInt(action.dealId)])
      return
    case "expire":
      await send("admin", tradeDeals, "expire", [BigInt(action.dealId)])
      return
  }
}
