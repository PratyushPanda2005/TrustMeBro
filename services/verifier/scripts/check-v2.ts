import { createPublicClient, http, type Address } from "viem";
import {
  V2_FINANCE,
  V2_CHAIN,
  financeV2Abi,
  attestationHash,
  commitment,
  type Attestation,
} from "@trustmebro/shared/v2";
import { chainReader } from "../src/v2.js";

// Public reads only: no environment key, wallet client, signature or transaction.
const rpc = process.env.WHITECHAIN_RPC ?? "https://rpc.testnet.whitechain.io";
const reader = chainReader(rpc),
  client = createPublicClient({
    transport: http(rpc, { timeout: 15000, retryCount: 1 }),
  });
const id = BigInt(process.env.V2_CHECK_TRADE_ID ?? "1"),
  deal = await reader.deal(id),
  now = await reader.time();
const a: Attestation = {
  tradeId: id,
  termsHash: deal.termsHash,
  documentHash: deal.terms.documentHash,
  quantity: deal.terms.quantity,
  stage: deal.terms.minimumStage,
  reportHash: commitment({ readOnlyParityCheck: true }),
  nonce: 1n,
  timestamp: now,
  expiry: now + 300n,
};
if ((await reader.digest(a)) !== attestationHash(a))
  throw Error("Deployed V2 digest mismatch");
const d = await client.readContract({
  address: V2_FINANCE,
  abi: financeV2Abi,
  functionName: "eip712Domain",
});
if (
  d[1] !== "TrustMeBro Trade Finance" ||
  d[2] !== "2" ||
  d[3] !== BigInt(V2_CHAIN) ||
  d[4].toLowerCase() !== V2_FINANCE.toLowerCase()
)
  throw Error("Deployed domain mismatch");
console.log(
  "PASS: deployed V2 domain and attestationDigest match shared EIP-712 encoding. No signature or transaction created.",
);
if (process.env.VERIFIER_ADDRESS)
  console.log(
    "Dedicated signer authorized:",
    await reader.authorized(process.env.VERIFIER_ADDRESS as Address),
  );
