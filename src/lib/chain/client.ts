import "server-only"

import { createPublicClient, defineChain, http } from "viem"

import type { Deployment } from "./deployment"

export const chainFor = (deployment: Deployment) =>
  defineChain({
    id: deployment.chainId,
    name: deployment.name,
    nativeCurrency: { name: "Gas", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [deployment.rpcUrl] } },
  })

export const publicClient = (deployment: Deployment) =>
  createPublicClient({
    chain: chainFor(deployment),
    transport: http(deployment.rpcUrl, { retryCount: 0, timeout: 4_000 }),
  })
