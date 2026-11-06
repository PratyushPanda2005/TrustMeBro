"use client"

import { useSyncExternalStore } from "react"

import { USDT_ADDRESS, whitechainTestnet } from "@trustmebro/shared"
import { V2_CHAIN, V2_FINANCE, financeV2Abi } from "@trustmebro/shared/v2"
import {
  createPublicClient,
  createWalletClient,
  custom,
  encodeAbiParameters,
  erc20Abi,
  keccak256,
  numberToHex,
  type Address,
  type EIP1193Provider,
  type Hash,
  type Hex,
} from "viem"

declare global {
  interface Window {
    ethereum?: EIP1193Provider
  }
}

export type Wallet = { address?: Address; chainId?: number; installed: boolean }

const chain = {
  ...whitechainTestnet,
  rpcUrls: {
    default: { http: [...whitechainTestnet.rpcUrls.default.http] },
  },
}

let wallet: Wallet = { installed: false }
const listeners = new Set<() => void>()

const publish = (next: Wallet) => {
  wallet = next
  listeners.forEach((listener) => listener())
}

async function read() {
  const provider = window.ethereum
  if (!provider) return publish({ installed: false })
  const [accounts, chainId] = await Promise.all([
    provider.request({ method: "eth_accounts" }),
    provider.request({ method: "eth_chainId" }),
  ])
  publish({
    installed: true,
    address: accounts[0],
    chainId: Number(chainId),
  })
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (listeners.size === 1) {
    void read()
    window.ethereum?.on("accountsChanged", read as never)
    window.ethereum?.on("chainChanged", read as never)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      window.ethereum?.removeListener("accountsChanged", read as never)
      window.ethereum?.removeListener("chainChanged", read as never)
    }
  }
}

const empty: Wallet = { installed: false }

export const useWallet = () =>
  useSyncExternalStore(
    subscribe,
    () => wallet,
    () => empty,
  )

export async function connectWallet() {
  const provider = window.ethereum
  if (!provider) throw new Error("Install MetaMask to sign transactions.")
  await provider.request({ method: "eth_requestAccounts" })
  await switchChain()
  await read()
}

async function switchChain() {
  const provider = window.ethereum as EIP1193Provider
  const chainId = numberToHex(V2_CHAIN)
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId }],
    })
  } catch {
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId,
          chainName: chain.name,
          nativeCurrency: chain.nativeCurrency,
          rpcUrls: [...chain.rpcUrls.default.http],
          blockExplorerUrls: ["https://explorer.testnet.whitechain.io"],
        },
      ],
    })
  }
}

/** Reads and writes go through the wallet, so each transaction is the user's. */
async function clients(required: string) {
  const provider = window.ethereum
  if (!provider) throw new Error("Install MetaMask to sign transactions.")
  const [account] = await provider.request({ method: "eth_requestAccounts" })
  if (account.toLowerCase() !== required.toLowerCase()) {
    throw new Error(`Switch MetaMask to ${required}.`)
  }
  await switchChain()
  const transport = custom(provider)
  return {
    account,
    reader: createPublicClient({ chain, transport }),
    writer: createWalletClient({ account, chain, transport }),
  }
}

type Call = { functionName: string; args: readonly unknown[] }

async function send(required: string, call: Call) {
  const { account, reader, writer } = await clients(required)
  const { request } = await reader.simulateContract({
    account,
    address: V2_FINANCE,
    abi: financeV2Abi,
    ...call,
  } as never)
  const hash = await writer.writeContract(request as never)
  return reader.waitForTransactionReceipt({ hash })
}

/** `fund` and `repay` pull USDT, so the contract needs an allowance first. */
async function allow(required: string, amount: bigint) {
  const { account, reader, writer } = await clients(required)
  const current = await reader.readContract({
    address: USDT_ADDRESS,
    abi: erc20Abi,
    functionName: "allowance",
    args: [account, V2_FINANCE],
  })
  if (current >= amount) return
  const hash: Hash = await writer.writeContract({
    address: USDT_ADDRESS,
    abi: erc20Abi,
    functionName: "approve",
    args: [V2_FINANCE, amount],
  })
  await reader.waitForTransactionReceipt({ hash })
}

const QUOTE_FIELDS = Array.from({ length: 6 }, () => ({ type: "uint256" }))

/** `fund` commits to the exact quote, so terms can't change under the investor. */
export const quoteHash = (raw: readonly string[]) =>
  keccak256(encodeAbiParameters(QUOTE_FIELDS, raw.map(BigInt)))

const LISTING_MINUTES = 10

export const chainActions = {
  createTrade: async (exporter: string, terms: unknown) => {
    const receipt = await send(exporter, {
      functionName: "createTrade",
      args: [terms],
    })
    const log = receipt.logs.find(
      (entry) => entry.address.toLowerCase() === V2_FINANCE.toLowerCase(),
    )
    if (!log?.topics[1]) throw new Error("The trade id wasn't in the receipt.")
    return BigInt(log.topics[1]).toString()
  },
  confirm: (importer: string, id: string) =>
    send(importer, { functionName: "confirmAgreement", args: [BigInt(id)] }),
  reject: (importer: string, id: string) =>
    send(importer, { functionName: "rejectTrade", args: [BigInt(id)] }),
  verifyManual: (
    admin: string,
    id: string,
    documentHash: Hex,
    quantity: bigint,
    stage: number,
    reportHash: Hex,
  ) =>
    send(admin, {
      functionName: "verifyManual",
      args: [BigInt(id), documentHash, quantity, stage, reportHash],
    }),
  relay: async (from: string, to: Address, data: Hex) => {
    const { reader, writer, account } = await clients(from)
    const hash = await writer.sendTransaction({ account, to, data })
    return reader.waitForTransactionReceipt({ hash })
  },
  fund: async (
    investor: string,
    id: string,
    raw: readonly string[],
    treasury: string,
  ) => {
    await allow(investor, BigInt(raw[1]))
    return send(investor, {
      functionName: "fund",
      args: [
        BigInt(id),
        quoteHash(raw),
        treasury,
        BigInt(Math.floor(Date.now() / 1000) + LISTING_MINUTES * 60),
      ],
    })
  },
  repay: async (importer: string, id: string, face: bigint) => {
    await allow(importer, face)
    return send(importer, { functionName: "repay", args: [BigInt(id)] })
  },
  markDefault: (caller: string, id: string) =>
    send(caller, { functionName: "markDefault", args: [BigInt(id)] }),
}
