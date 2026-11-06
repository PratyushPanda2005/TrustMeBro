import {
  StartupError,
  requireVariables,
  rpcFor,
  DEFAULT_RPC,
} from "@trustmebro/shared/v2-startup";
import { configSchema } from "./config.js";

export function verifierConfig(env: NodeJS.ProcessEnv) {
  requireVariables(env, ["SERVICE_SIGNER_PRIVATE_KEY", "VERIFIER_PAYTO"]);
  const selected: NodeJS.ProcessEnv = {
    VERIFIER_SIGNER_PK: env.SERVICE_SIGNER_PRIVATE_KEY,
    RPC_URL: rpcFor("verifier", env) ?? DEFAULT_RPC,
  };
  for (const key of [
    "PORT",
    "PAYMENTS",
    "PRICE",
    "HEDERA_NETWORK",
    "HEDERA_USDC",
    "VERIFIER_PAYTO",
    "FACILITATOR_URL",
  ])
    if (env[key] !== undefined) selected[key] = env[key];
  const parsed = configSchema.safeParse(selected);
  if (!parsed.success) {
    const names = [
      ...new Set(
        parsed.error.issues.map((i) =>
          i.path[0] === "VERIFIER_SIGNER_PK"
            ? "SERVICE_SIGNER_PRIVATE_KEY"
            : String(i.path[0]),
        ),
      ),
    ];
    throw new StartupError(
      "CONFIG_INVALID",
      `Invalid environment variables: ${names.join(", ")}`,
      "Correct their formats using the V2 configuration guide. Values are suppressed.",
    );
  }
  if (parsed.data.PAYMENTS !== "on")
    throw new StartupError(
      "PAYMENTS_DISABLED",
      "PAYMENTS must be on for the merchant runtime.",
      "Use local tests for mocked payments. Starting the merchant does not initiate a purchase.",
    );
  if (parsed.data.HEDERA_NETWORK !== "hedera:testnet")
    throw new StartupError(
      "PAYMENT_NETWORK_INVALID",
      "HEDERA_NETWORK must be hedera:testnet for this V2 integration.",
      "Select the same Hedera testnet network as the agent.",
    );
  return parsed.data;
}
