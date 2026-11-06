import { privateKeyToAccount } from "viem/accounts";
import { type Hex } from "viem";
import { StartupError } from "@trustmebro/shared/v2-startup";

/** Optional example values are absent credentials, never candidate signing keys. */
export function isCredentialPlaceholder(value: string) {
  return /^(?:0x)?\.{2,}$|^(?:change[-_ ]?me|your(?:_|\b)|<|TODO\b|REPLACE\b|DEDICATED_SERVICE_KEY_ONLY)/i.test(
    value.trim(),
  );
}
export function selectEvmCredential(
  candidates: readonly { name: string; value: string | undefined }[],
  notices: string[],
) {
  for (const { name, value } of candidates) {
    if (!value?.trim()) continue;
    if (isCredentialPlaceholder(value)) {
      notices.push(
        `[OPTIONAL_CREDENTIAL_PLACEHOLDER] ${name}: placeholder ignored; configure an existing key to use this account.`,
      );
      continue;
    }
    const key = value.trim();
    if (!/^0x[0-9a-fA-F]{64}$/.test(key))
      throw new StartupError(
        "EVM_KEY_FORMAT_INVALID",
        `${name} is not a 0x-prefixed 32-byte EVM key.`,
        "Correct this variable privately or leave an optional relayer unset. No credential value is printed.",
      );
    try {
      return {
        key: key as Hex,
        address: privateKeyToAccount(key as Hex).address,
        sourceName: name,
      };
    } catch {
      throw new StartupError(
        "EVM_KEY_SCALAR_INVALID",
        `${name} is not a valid secp256k1 private key.`,
        "Provide the existing account credential privately. Do not generate a replacement or use the Admin key.",
      );
    }
  }
  return undefined;
}
export function validateHederaSetup(
  network: string | undefined,
  asset: string,
  payer: string,
  payTo: string,
  expectedAsset: string,
) {
  const invalid: string[] = [];
  if (network && network !== "hedera:testnet") invalid.push("HEDERA_NETWORK");
  if (asset !== expectedAsset) invalid.push("HEDERA_USDC_TOKEN_ID/HEDERA_USDC");
  if (!/^0\.0\.\d+$/.test(payer)) invalid.push("AGENT_HEDERA_ACCOUNT_ID");
  if (!/^0\.0\.\d+$/.test(payTo)) invalid.push("VERIFIER_PAYTO");
  if (invalid.length)
    throw new StartupError(
      "HEDERA_CONFIG_INVALID",
      `Invalid testnet configuration: ${invalid.join(", ")}`,
      "Use the existing Hedera testnet accounts and configured USDC token. Old TradeDeals addresses are not used for V2.",
    );
}
