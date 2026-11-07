import { test } from "node:test";
import assert from "node:assert/strict";
import { confirmHederaPayment } from "../src/v2-payment.ts";
import { parseSettlement } from "../src/x402.ts";

test("settlement success must be boolean true, not a truthy string", () => {
  assert.equal(
    parseSettlement(
      Buffer.from(JSON.stringify({ success: "false" })).toString("base64"),
    ).success,
    false,
  );
});
test("Mirror confirmation requires exact asset, payer, recipient, amount and recent successful transaction", async () => {
  const s = {
      success: true,
      payer: "0.0.9001",
      txId: "0.0.7162784@1800000000.000000001",
    },
    q = {
      network: "hedera:testnet",
      asset: "0.0.429274",
      payTo: "0.0.5005",
      amount: "300000",
    };
  const body = {
    transactions: [
      {
        result: "SUCCESS",
        name: "CRYPTOTRANSFER",
        consensus_timestamp: "1800000000.1",
        token_transfers: [
          { token_id: q.asset, account: s.payer, amount: -300000 },
          { token_id: q.asset, account: q.payTo, amount: 300000 },
        ],
      },
    ],
  };
  const fetcher = (async () =>
    new Response(JSON.stringify(body))) as typeof fetch;
  assert.equal(
    await confirmHederaPayment(s, q, s.payer, 1800000000000, fetcher),
    true,
  );
  assert.equal(
    await confirmHederaPayment(
      s,
      { ...q, amount: "1" },
      s.payer,
      1800000000000,
      fetcher,
    ),
    false,
  );
  assert.equal(
    await confirmHederaPayment(s, q, "0.0.9999", 1800000000000, fetcher),
    false,
  );
  assert.equal(
    await confirmHederaPayment(s, q, s.payer, 1800001000000, fetcher),
    false,
  );
  body.transactions[0].result = "FAIL_INVALID";
  assert.equal(
    await confirmHederaPayment(s, q, s.payer, 1800000000000, fetcher),
    false,
  );
});

const lagSettlement = {
    success: true,
    payer: "0.0.9001",
    txId: "0.0.7162784@1800000000.000000001",
  },
  lagQuote = {
    network: "hedera:testnet",
    asset: "0.0.429274",
    payTo: "0.0.5005",
    amount: "300000",
  },
  lagBody = (amount = 300000) =>
    JSON.stringify({
      transactions: [
        {
          result: "SUCCESS",
          name: "CRYPTOTRANSFER",
          consensus_timestamp: "1800000000.1",
          token_transfers: [
            {
              token_id: lagQuote.asset,
              account: lagSettlement.payer,
              amount: -amount,
            },
            { token_id: lagQuote.asset, account: lagQuote.payTo, amount },
          ],
        },
      ],
    });
const lagConfirm = (fetcher: typeof fetch, wait: () => Promise<void>) =>
  confirmHederaPayment(
    lagSettlement,
    lagQuote,
    lagSettlement.payer,
    1800000000000,
    fetcher,
    wait,
  );

test("Mirror lag is waited out: a 404, a network error and an empty list all retry", async () => {
  const answers = [
    () => new Response("", { status: 404 }),
    () => {
      throw Error("network");
    },
    () => new Response(JSON.stringify({ transactions: [] })),
    () => new Response(lagBody()),
  ];
  let calls = 0,
    waits = 0;
  const confirmed = await lagConfirm(
    (async () => answers[calls++]()) as typeof fetch,
    async () => {
      waits++;
    },
  );
  assert.equal(confirmed, true);
  assert.equal(calls, 4);
  assert.equal(waits, 3);
});

test("Mirror retries stop after about 30 seconds and stay unconfirmed", async () => {
  let calls = 0,
    waits = 0;
  const confirmed = await lagConfirm(
    (async () => {
      calls++;
      return new Response("", { status: 404 });
    }) as typeof fetch,
    async () => {
      waits++;
    },
  );
  assert.equal(confirmed, false);
  assert.equal(calls, 11);
  assert.equal(waits, 10);
});

test("A visible mismatch is final and is not retried", async () => {
  let calls = 0,
    waits = 0;
  const confirmed = await lagConfirm(
    (async () => {
      calls++;
      return new Response(lagBody(1));
    }) as typeof fetch,
    async () => {
      waits++;
    },
  );
  assert.equal(confirmed, false);
  assert.equal(calls, 1);
  assert.equal(waits, 0);
});
