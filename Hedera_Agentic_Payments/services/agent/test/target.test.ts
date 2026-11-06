import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { privateKeyToAccount } from "viem/accounts";
import { chainTarget } from "../src/target.ts";

const DEALS = "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0";
const KEY = "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6"; // anvil #9, never funded

test("whitechain: the agent needs only the verifier's address, not its key", () => {
  const t = chainTarget({ CHAIN_ADAPTER: "whitechain", TRADE_DEALS_ADDRESS: DEALS, VERIFIER_ADDRESS: "0x76b4B8FFaa84901d5b2aDFB5c6a3592E4e63B1E8" });
  assert.equal(t.kind, "whitechain");
  assert.equal(t.chainId, 1874);
  assert.equal(t.expectedSigner, "0x76b4B8FFaa84901d5b2aDFB5c6a3592E4e63B1E8");
});

test("whitechain: with our demo verifier's key in .env, its address is derived", () => {
  const t = chainTarget({ CHAIN_ADAPTER: "whitechain", VERIFIER_EVM_PRIVATE_KEY: KEY });
  assert.equal(t.expectedSigner, privateKeyToAccount(KEY).address);
});

test("local: chain, contract, verifier and relayer come from lane C's local-deployment.json", () => {
  const dir = mkdtempSync(join(tmpdir(), "tmb-target-"));
  try {
    const file = join(dir, "local-deployment.json");
    writeFileSync(file, JSON.stringify({
      rpcUrl: "http://127.0.0.1:8545", chainId: 31337, tradeDeals: DEALS,
      wallets: { verifier: { address: "0xa0Ee7A142d267C1f36714E4a8F75612F20a79720", privateKey: KEY }, agent: { address: "0x15d3", privateKey: "0xabc" } },
    }));
    const t = chainTarget({ CHAIN_ADAPTER: "local", LOCAL_DEPLOYMENT: file });
    assert.deepEqual(t, { kind: "local", chainId: 31337, rpcUrl: "http://127.0.0.1:8545", tradeDeals: DEALS, expectedSigner: "0xa0Ee7A142d267C1f36714E4a8F75612F20a79720", relayerKey: "0xabc" });
    assert.equal(chainTarget({ CHAIN_ADAPTER: "local", LOCAL_DEPLOYMENT: file, VERIFIER_ADDRESS: "0x76b4" }).expectedSigner, "0x76b4");
    assert.throws(() => chainTarget({ CHAIN_ADAPTER: "local", LOCAL_DEPLOYMENT: join(dir, "missing.json") }), /npm run local/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
