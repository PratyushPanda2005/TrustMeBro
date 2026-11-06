import { z } from "zod"

import { SCENARIOS } from "./scenarios"

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "must be a 0x address")
const privateKey = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "must be a 0x-prefixed 32-byte hex key")
const hederaAccount = z.string().regex(/^0\.0\.\d+$/, "must look like 0.0.12345")
const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v)

const schema = z
  .object({
    PORT: z.coerce.number().int().positive().default(4021),
    RPC_URL: z.string().url().default("https://rpc.testnet.whitechain.io"),
    TRADEDEALS_ADDRESS: z.preprocess(emptyToUndefined, address.optional()),
    VERIFIER_SIGNER_PK: privateKey,
    SIGNATURE_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(600),
    PAYMENTS: z.enum(["on", "off"]).default("on"),
    PRICE: z.string().default("$0.30"),
    HEDERA_NETWORK: z.enum(["hedera:testnet", "hedera:mainnet"]).default("hedera:testnet"),
    HEDERA_USDC: hederaAccount.default("0.0.429274"),
    VERIFIER_PAYTO: z.preprocess(emptyToUndefined, hederaAccount.optional()),
    FACILITATOR_URL: z.string().url().default("https://api.testnet.blocky402.com"),
    DEFAULT_SCENARIO: z.enum(SCENARIOS).default("honest"),
    DEMO_TOKEN: z.preprocess(emptyToUndefined, z.string().min(8).optional()),
    CORS_ORIGIN: z.string().default("*"),
  })
  .refine((c) => c.PAYMENTS === "off" || c.VERIFIER_PAYTO !== undefined, {
    message: "VERIFIER_PAYTO is required when PAYMENTS=on",
    path: ["VERIFIER_PAYTO"],
  })

export type Config = z.infer<typeof schema>

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env)
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`)
    throw new Error(`Invalid verifier config:\n${lines.join("\n")}`)
  }
  return parsed.data
}
