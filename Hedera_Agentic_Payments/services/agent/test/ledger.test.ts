import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SpendLedger } from "../src/ledger.ts";

test("two processes sharing one ledger file keep both payments (no lost update)", () => {
  const dir = mkdtempSync(join(tmpdir(), "tmb-ledger-"));
  try {
    const file = join(dir, "ledger.json");
    // Both open the (empty) ledger before either records, like two concurrent agent:once runs.
    const a = new SpendLedger(file);
    const b = new SpendLedger(file);
    const at = Date.parse("2026-11-06T10:00:00Z");
    a.recordPayment({ dealId: "0x01", checkNo: 1, exporter: "0xe1", payTo: "0.0.5005", amount: 300000n, at, hederaTxId: "tx-a" });
    b.recordPayment({ dealId: "0x02", checkNo: 1, exporter: "0xe1", payTo: "0.0.5005", amount: 300000n, at, hederaTxId: "tx-b" });

    assert.equal(a.spentOnDay(at), 600000n, "process A sees B's payment for the daily cap");
    assert.equal(a.alreadyPaid("0x02", 1), true);
    assert.equal(new SpendLedger(file).spentOnDay(at), 600000n, "file holds both");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("deal ids are per contract: a redeployed TradeDeals' deal 1 is a new deal, but the daily cap still counts both", async () => {
  const { contractScope } = await import("../src/ledger.ts");
  const l = new SpendLedger();
  const old = contractScope(31337, "0xAAAA000000000000000000000000000000000001");
  const redeployed = contractScope(31337, "0xBBBB000000000000000000000000000000000002");
  const deal1 = "0x" + "0".repeat(63) + "1";
  l.recordPayment({ contract: old, dealId: deal1, checkNo: 1, exporter: "0xe", payTo: "0.0.1", amount: 300_000n, at: 0 });
  assert.equal(l.alreadyPaid(deal1, 1, old), true);
  assert.equal(l.alreadyPaid(deal1, 1, redeployed), false);
  assert.equal(l.checksPaid(deal1, redeployed), 0);
  assert.equal(l.spentOnDeal(deal1, redeployed), 0n);
  assert.equal(l.spentOnDay(0), 300_000n);
  assert.equal(contractScope(1874, "0xAbC"), "1874:0xabc");
});
