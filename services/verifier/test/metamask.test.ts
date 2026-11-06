import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fixture } from "./v2-fixture.js";
import {
  ADMIN,
  V2_FINANCE,
  VERIFIER_ROLE,
  financeV2Abi,
  attestationTypes,
} from "@trustmebro/shared/v2";

const require = createRequire(
  "D:/TrustMeBroo/packages/contracts-v2/package.json",
);
const real = require("ethers");
const template = readFileSync(
  new URL("../scripts/remix/v2-metamask.template.js", import.meta.url),
  "utf8",
);
const script = (operation: string) =>
  template
    .replace("__OPERATION__", JSON.stringify(operation))
    .replace("__ABI__", JSON.stringify(financeV2Abi))
    .replace("__TYPES__", JSON.stringify(attestationTypes))
    .trimEnd();
test("generated grant and relay scripts support Remix expression wrapping", () => {
  for (const op of ["grant", "relay"])
    new vm.Script("const ret = " + script(op));
});
async function run(
  options: {
    chain?: number;
    account?: string;
    send?: boolean;
    confirm?: string;
    authorized?: boolean;
  } = {},
) {
  let sends = 0;
  const logs: unknown[][] = [];
  const wallet = {
    getAddress: async () => options.account ?? ADMIN,
    sendTransaction: async () => {
      sends++;
      throw Error("Test never broadcasts");
    },
  };
  class Provider {
    getSigner = async () => wallet;
    send = async (method: string) =>
      method === "eth_chainId"
        ? "0x" + (options.chain ?? 1874).toString(16)
        : [options.account ?? ADMIN];
    getCode = async () => "0x1234";
    call = async () => "0x";
    estimateGas = async () => 51999n;
    getFeeData = async () => ({ maxFeePerGas: 10000000000n });
    getBalance = async () => 10n ** 18n;
  }
  class Contract {
    interface = new real.Interface(financeV2Abi);
    VERIFIER_ROLE = async () => VERIFIER_ROLE;
    DEFAULT_ADMIN_ROLE = async () => real.ZeroHash;
    hasRole = async (role: string) =>
      role === real.ZeroHash || !!options.authorized;
  }
  let source = script("grant");
  if (options.send)
    source = source.replace(
      "const ACTION = 'preflight'",
      "const ACTION = 'send'",
    );
  if (options.confirm)
    source = source.replace(
      "const CONFIRM = ''",
      "const CONFIRM = " + JSON.stringify(options.confirm),
    );
  await vm.runInNewContext(source, {
    require: () => ({
      ethers: { ...real, BrowserProvider: Provider, Contract },
    }),
    web3Provider: {},
    console: {
      log: (...x: unknown[]) => logs.push(x),
      error: (...x: unknown[]) => logs.push(x),
    },
  });
  return { sends, logs };
}
test("MetaMask grant defaults to preflight, checks actual ABI calldata and never requests a transaction", async () => {
  const result = await run();
  assert.equal(result.sends, 0);
  const preflight = JSON.parse(
    result.logs.find(
      (x) => typeof x[0] === "string" && x[0].startsWith("{"),
    )![0] as string,
  );
  assert.equal(preflight.to, V2_FINANCE);
  assert.equal(preflight.from, ADMIN);
  assert.equal(preflight.chainId, 1874);
  const decoded = new real.Interface(financeV2Abi).decodeFunctionData(
    "grantRole",
    preflight.data,
  );
  assert.equal(decoded[0], VERIFIER_ROLE);
  assert.equal(decoded[1], "0x76b4B8FFaa84901d5b2aDFB5c6a3592E4e63B1E8");
});
for (const [name, options] of [
  ["wrong chain", { chain: 1 }],
  ["wrong account", { account: V2_FINANCE }],
  ["missing explicit phrase", { send: true }],
  ["already granted", { authorized: true }],
] as const)
  test(`MetaMask ${name} never requests a transaction`, async () =>
    assert.equal((await run(options)).sends, 0));

const invoiceTemplate = readFileSync(
  new URL("../scripts/remix/v2-invoice.template.js", import.meta.url),
  "utf8",
);
async function invoiceRun(
  operation: "create" | "confirm",
  options: {
    admin?: boolean;
    duplicate?: boolean;
    wrongReceipt?: boolean;
    send?: boolean;
  } = {},
) {
  const base = fixture(),
    invoice = {
      exporter: base.input.exporter,
      importer: base.input.importer,
      terms: JSON.parse(
        JSON.stringify(base.deal.terms, (_, v) =>
          typeof v === "bigint" ? v.toString() : v,
        ),
      ),
      metadata: base.metadata,
    };
  let sends = 0;
  const logs: unknown[][] = [];
  const iface = new real.Interface(financeV2Abi),
    hash = "0x" + "12".repeat(32),
    expected = operation === "create" ? invoice.exporter : invoice.importer;
  const encoded = iface.encodeEventLog(iface.getEvent("TradeCreated"), [
    47n,
    invoice.exporter,
    invoice.importer,
    base.deal.termsHash,
    base.deal.terms.face,
  ]);
  const wallet = {
    getAddress: async () => (options.admin ? ADMIN : expected),
    sendTransaction: async () => {
      sends++;
      throw Error("No real transaction");
    },
  };
  class Provider {
    getSigner = async () => wallet;
    send = async (method: string) =>
      method === "eth_chainId" ? "0x752" : [options.admin ? ADMIN : expected];
    getCode = async () => "0x1234";
    getBlock = async () => ({ timestamp: 1800000000 });
    getBlockNumber = async () => 20;
    call = async () => "0x";
    estimateGas = async () => 100000n;
    getFeeData = async () => ({ maxFeePerGas: 1n });
    getBalance = async () => 10n ** 18n;
    getTransactionReceipt = async () => ({
      status: 1,
      blockNumber: 10,
      logs: [
        { address: options.wrongReceipt ? ADMIN : V2_FINANCE, ...encoded },
      ],
    });
    getTransaction = async () => ({
      chainId: 1874,
      from: invoice.exporter,
      to: V2_FINANCE,
      value: 0n,
      data: iface.encodeFunctionData("createTrade", [invoice.terms]),
    });
  }
  class Contract {
    interface = iface;
    EXPORTER_ROLE = async () => real.id("EXPORTER_ROLE");
    IMPORTER_ROLE = async () => real.id("IMPORTER_ROLE");
    hasRole = async () => true;
    invoiceUsed = async () => !!options.duplicate;
    getDeal = async () => base.deal;
  }
  let source = invoiceTemplate
    .replace("__OPERATION__", JSON.stringify(operation))
    .replace("__INVOICE__", JSON.stringify(invoice))
    .replace("__ABI__", JSON.stringify(financeV2Abi))
    .trimEnd();
  if (operation === "confirm")
    source = source.replace(
      "const CREATION_TX_HASH = ''",
      "const CREATION_TX_HASH = " + JSON.stringify(hash),
    );
  // The fixture's default importerApproved is true; a new invoice is unconfirmed.
  base.deal.importerApproved = false;
  if (options.send)
    source = source.replace(
      "const ACTION = 'preflight'",
      "const ACTION = 'send'",
    );
  new vm.Script("const ret = " + source);
  await vm.runInNewContext(source, {
    require: () => ({
      ethers: { ...real, BrowserProvider: Provider, Contract },
    }),
    web3Provider: {},
    console: {
      log: (...x: unknown[]) => logs.push(x),
      error: (...x: unknown[]) => logs.push(x),
    },
  });
  return { sends, logs, iface };
}
test("invoice creation preflight encodes exact fixture without wallet submission", async () => {
  const r = await invoiceRun("create");
  assert.equal(r.sends, 0);
  const result = JSON.parse(
    r.logs.find(
      (x) => typeof x[0] === "string" && x[0].includes("confirmationRequired"),
    )![0] as string,
  );
  assert.equal(result.from, fixture().input.exporter);
  assert.equal(
    r.iface.decodeFunctionData("createTrade", result.data)[0].documentHash,
    fixture().deal.terms.documentHash,
  );
});
test("confirmation derives ID 47 from matching receipt rather than predicting ID 3", async () => {
  const r = await invoiceRun("confirm");
  assert.equal(r.sends, 0);
  const result = JSON.parse(
    r.logs.find(
      (x) => typeof x[0] === "string" && x[0].includes("confirmationRequired"),
    )![0] as string,
  );
  assert.equal(result.actualTradeId, "47");
  assert.equal(
    r.iface.decodeFunctionData("confirmAgreement", result.data)[0],
    47n,
  );
});
for (const [name, op, options] of [
  ["Admin is not the exporter", "create", { admin: true }],
  ["duplicate invoice", "create", { duplicate: true }],
  ["wrong creation receipt", "confirm", { wrongReceipt: true }],
  ["missing confirmation phrase", "create", { send: true }],
] as const)
  test(`invoice ${name} never submits`, async () => {
    const r = await invoiceRun(op, options);
    assert.equal(r.sends, 0);
    assert.ok(r.logs.some((x) => x[0] === "STOP:"));
  });
