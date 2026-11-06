import { test } from "node:test";
import assert from "node:assert/strict";
import { PLACEHOLDER_TRADE_DEALS, tradeDealsOrPlaceholder } from "../src/config.ts";

test("TRADE_DEALS_ADDRESS placeholder from .env.example falls back to a valid address", () => {
  const saved = process.env.TRADE_DEALS_ADDRESS;
  try {
    for (const v of ["0x...", "", "0x1234"]) {
      process.env.TRADE_DEALS_ADDRESS = v;
      assert.equal(tradeDealsOrPlaceholder(), PLACEHOLDER_TRADE_DEALS);
    }
    delete process.env.TRADE_DEALS_ADDRESS;
    assert.equal(tradeDealsOrPlaceholder(), PLACEHOLDER_TRADE_DEALS);
    const real = "0x" + "ab".repeat(20);
    process.env.TRADE_DEALS_ADDRESS = real;
    assert.equal(tradeDealsOrPlaceholder(), real);
  } finally {
    if (saved === undefined) delete process.env.TRADE_DEALS_ADDRESS;
    else process.env.TRADE_DEALS_ADDRESS = saved;
  }
});
