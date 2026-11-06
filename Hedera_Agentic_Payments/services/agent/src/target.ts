/**
 * Which TradeDeals the agent works for. One switch, CHAIN_ADAPTER:
 *   mock | whitechain → Whitechain testnet (1874), TRADE_DEALS_ADDRESS, verifier key from .env
 *   local             → lane C's local stack (`npm run local` in services/verifier at the repo root):
 *                       anvil 31337, addresses and test keys from its local-deployment.json
 * The verifier signs for exactly this chain and contract; buy.ts refuses anything else.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createPublicClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { tradeDealsAgentAbi, bytes32ToDealId, dealIdToBytes32, WHITECHAIN_CHAIN_ID, WHITECHAIN_RPC } from "@tmb/shared";
import type { ClaimedEvent } from "./chain.ts";
import { need, tradeDealsOrPlaceholder } from "./config.ts";

export interface ChainTarget {
  kind: "whitechain" | "local";
  chainId: number;
  rpcUrl: string;
  tradeDeals: Hex;
  /** The EIP-712 signer the agent accepts (TradeDeals.verifier()). */
  expectedSigner: Hex;
  /** Sends submitVerification (needs gas on that chain). */
  relayerKey?: Hex;
}

/** lane C writes it next to their verifier; the repo root is four levels above this file. */
export const DEFAULT_LOCAL_DEPLOYMENT = fileURLToPath(new URL("../../../../services/verifier/local-deployment.json", import.meta.url));

interface LocalDeploymentFile {
  rpcUrl: string;
  chainId: number;
  tradeDeals: Hex;
  wallets: Record<string, { address: Hex; privateKey: Hex }>;
}

export function chainTarget(env: NodeJS.ProcessEnv = process.env): ChainTarget {
  if (env.CHAIN_ADAPTER === "local") {
    const path = env.LOCAL_DEPLOYMENT ?? DEFAULT_LOCAL_DEPLOYMENT;
    if (!existsSync(path)) throw new Error(`${path} not found: start lane C's stack first (cd services/verifier && npm run local)`);
    const dep = JSON.parse(readFileSync(path, "utf8")) as LocalDeploymentFile;
    return {
      kind: "local",
      chainId: dep.chainId,
      rpcUrl: dep.rpcUrl,
      tradeDeals: dep.tradeDeals,
      expectedSigner: dep.wallets.verifier.address,
      relayerKey: dep.wallets.agent.privateKey,
    };
  }
  const verifierKey = env.VERIFIER_EVM_PRIVATE_KEY ?? need("VERIFIER_EVM_PRIVATE_KEY");
  return {
    kind: "whitechain",
    chainId: WHITECHAIN_CHAIN_ID,
    rpcUrl: env.WHITECHAIN_RPC ?? WHITECHAIN_RPC,
    tradeDeals: tradeDealsOrPlaceholder() as Hex,
    expectedSigner: privateKeyToAccount(verifierKey as Hex).address,
    relayerKey: env.RELAYER_PRIVATE_KEY as Hex | undefined,
  };
}

/** A deal's claim as the agent would get it from the Claimed event, read back from TradeDeals. */
export async function readClaim(t: ChainTarget, dealId: bigint | Hex): Promise<ClaimedEvent & { state: number; checks: number }> {
  const id = typeof dealId === "bigint" ? dealId : bytes32ToDealId(dealId);
  const pub = createPublicClient({ transport: http(t.rpcUrl) });
  const [deal, ship] = await Promise.all([
    pub.readContract({ address: t.tradeDeals, abi: tradeDealsAgentAbi, functionName: "getDeal", args: [id] }) as Promise<any>,
    pub.readContract({ address: t.tradeDeals, abi: tradeDealsAgentAbi, functionName: "getShipment", args: [id] }) as Promise<any>,
  ]);
  return {
    dealId: dealIdToBytes32(id),
    exporter: deal.exporter,
    declaredKg: Number(deal.declaredKg),
    claimedStatus: Number(deal.claimedStatus),
    docHash: deal.docHash,
    containerNo: ship.containerNo ?? ship[0],
    blRef: ship.blRef ?? ship[1],
    verifyDeadline: BigInt(deal.verifyDeadline),
    state: Number(deal.state),
    checks: Number(deal.checks),
  };
}
