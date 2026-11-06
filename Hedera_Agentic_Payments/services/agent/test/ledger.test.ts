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
    a.recordPayment({ dealId: "0x01", stage: "departure", payTo: "0.0.5005", amount: 300000n, at, hederaTxId: "tx-a" });
    b.recordPayment({ dealId: "0x02", stage: "departure", payTo: "0.0.5005", amount: 300000n, at, hederaTxId: "tx-b" });

    assert.equal(a.spentOnDay(at), 600000n, "process A sees B's payment for the daily cap");
    assert.equal(a.alreadyPaid("0x02", "departure"), true);
    assert.equal(new SpendLedger(file).spentOnDay(at), 600000n, "file holds both");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
