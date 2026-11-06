/**
 * Runbook step 1: associate testnet USDC with the agent (payer) and verifier (payTo) accounts.
 * The Circle faucet and x402 settlement both fail against an account without the association.
 *   pnpm associate-usdc
 * Idempotent: asks the mirror node first, so an already-associated account costs nothing
 * (a TokenAssociate on an associated account still charges ~0.7 HBAR and fails).
 */
import "@tmb/shared/env";
import { Client, PrivateKey, TokenAssociateTransaction } from "@hiero-ledger/sdk";

const MIRROR = "https://testnet.mirrornode.hedera.com/api/v1";
const token = process.env.HEDERA_USDC_TOKEN_ID ?? "0.0.429274";

const accounts = [
  { role: "agent", id: process.env.AGENT_HEDERA_ACCOUNT_ID, key: process.env.AGENT_HEDERA_PRIVATE_KEY },
  { role: "verifier", id: process.env.VERIFIER_PAYTO, key: process.env.VERIFIER_HEDERA_PRIVATE_KEY },
];

async function usdcBalance(accountId: string): Promise<number | null> {
  const res = await fetch(`${MIRROR}/accounts/${accountId}/tokens?token.id=${token}`);
  if (!res.ok) throw new Error(`mirror node ${res.status} for ${accountId}`);
  const body = (await res.json()) as { tokens: { balance: number }[] };
  return body.tokens.length ? body.tokens[0].balance : null;
}

let failed = false;
for (const { role, id, key } of accounts) {
  if (!id || !key || id.includes("x") || key === "0x...") {
    console.log(`⏭  ${role}: account id or Hedera private key not set, skipped`);
    continue;
  }
  const balance = await usdcBalance(id);
  if (balance !== null) {
    console.log(`✅ ${role} ${id}: already associated, ${balance / 1e6} USDC`);
    continue;
  }
  const client = Client.forTestnet().setOperator(id, PrivateKey.fromStringECDSA(key));
  try {
    const tx = await new TokenAssociateTransaction().setAccountId(id).setTokenIds([token]).execute(client);
    const receipt = await tx.getReceipt(client);
    console.log(`✅ ${role} ${id}: ${receipt.status.toString()} https://hashscan.io/testnet/transaction/${tx.transactionId}`);
  } catch (e) {
    failed = true;
    console.error(`❌ ${role} ${id}: ${(e as Error).message}`);
  } finally {
    client.close();
  }
}
if (failed) process.exitCode = 1;
