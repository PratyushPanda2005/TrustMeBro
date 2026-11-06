import {
  appendAudit,
  approve,
  buy,
  createInvoice,
  declareShipment,
  getDeal,
  hashText,
  newExporter,
  onboardImporter,
  redeem,
  settle,
  submitVerification,
  type Ctx,
} from "./engine"
import { VERIFY_PRICE } from "./score"
import type { Claims, Scenario, TradeState, TxRef } from "./types"

/** The accounts each role acts as until wallets are connected. */
export const personas = {
  exporter: "ravi",
  importer: "ahmed",
  investor: "aanya",
} as const

const day = (iso: string) => Date.parse(`${iso}T09:00:00Z`)

const fakeHex = (seed: string, words: number) =>
  Array.from({ length: words }, (_, i) => hashText(`${seed}:${i}`)).join("")

export const mockWallet = (seed: string) => `0x${fakeHex(seed, 5)}`

const ALL_TRUE: Claims = { weight: true, statusCode: true, documents: true }

export const observedFor = (scenario: Scenario): Claims => ({
  ...ALL_TRUE,
  weight: scenario !== "fake-weight",
  documents: scenario !== "fake-docs",
})

/**
 * Demo data, built by running the engine itself, so every score, term and
 * payout below is what the rules produce rather than a typed-in number.
 */
function build(): TradeState {
  const start = day("2026-06-20")
  let state: TradeState = {
    parties: [
      newExporter({
        id: "ravi",
        name: "Ravi Exports",
        wallet: mockWallet("ravi"),
        at: start,
      }),
      newExporter({
        id: "meera",
        name: "Meera Textiles",
        wallet: mockWallet("meera"),
        at: start,
      }),
      {
        id: "aanya",
        name: "Aanya Capital",
        role: "investor",
        wallet: mockWallet("aanya"),
        rep: { r: 0, s: 0, a: 0, b: 0 },
        history: [],
        allowlisted: true,
      },
      {
        id: "rohan",
        name: "Rohan Ventures",
        role: "investor",
        wallet: mockWallet("rohan"),
        rep: { r: 0, s: 0, a: 0, b: 0 },
        history: [],
        allowlisted: true,
      },
      {
        id: "sara",
        name: "Sara Holdings",
        role: "investor",
        wallet: mockWallet("sara"),
        rep: { r: 0, s: 0, a: 0, b: 0 },
        history: [],
        allowlisted: false,
      },
    ],
    deals: [],
    audit: [],
    pending: [],
    limits: { perCall: 1, perDeal: 2, perDay: 10 },
  }

  const wc = (seed: string, now: number): Ctx => ({
    now,
    tx: { chain: "whitechain", hash: `0x${fakeHex(seed, 8)}` },
  })

  state = onboardImporter(
    state,
    {
      id: "ahmed",
      name: "Ahmed Imports",
      wallet: mockWallet("ahmed"),
      trustCodeBps: 8_000,
    },
    { now: start },
  )
  state = onboardImporter(
    state,
    {
      id: "lena",
      name: "Lena Trading",
      wallet: mockWallet("lena"),
      trustCodeBps: 7_000,
    },
    { now: start },
  )

  const open = (
    id: string,
    exporterId: string,
    importerId: string,
    goods: string,
    amount: number,
    created: string,
    due: string,
  ) => {
    state = createInvoice(
      state,
      {
        id,
        invoiceRef: `INV-${id.slice(2)}`,
        exporterId,
        importerId,
        goods,
        amount,
        dueAt: day(due),
      },
      wc(`${id}-create`, day(created)),
    )
    state = approve(state, id, wc(`${id}-approve`, day(created) + 3_600_000))
  }

  const fund = (id: string, split: [string, number][], at: string) => {
    split.forEach(([investorId, share], index) => {
      const amount =
        index === split.length - 1
          ? getDeal(state, id).target -
            getDeal(state, id).positions.reduce((s, p) => s + p.amount, 0)
          : Math.round(getDeal(state, id).target * share)
      state = buy(
        state,
        { dealId: id, investorId, amount },
        wc(`${id}-buy-${index}`, day(at) + index * 3_600_000),
      )
    })
  }

  const verify = (id: string, scenario: Scenario, at: string) => {
    const now = day(at)
    state = declareShipment(
      state,
      { dealId: id, claims: ALL_TRUE, scenario },
      wc(`${id}-claims`, now),
    )
    const hedera: TxRef = {
      chain: "hedera",
      hash: `0.0.8123@${Math.floor(now / 1000)}.${hashText(id).slice(0, 6)}`,
    }
    const step = (kind: "quote" | "gate" | "payment" | "relay", text: string) =>
      appendAudit(
        state,
        {
          dealId: id,
          kind,
          message: text,
          amount: kind === "payment" ? VERIFY_PRICE : undefined,
          tx: kind === "payment" ? hedera : undefined,
        },
        { now: now + 60_000 },
      )
    state = step("quote", "402 quote received: 0.30 USDC")
    state = step("gate", "Spending gate passed")
    state = step("payment", "Paid 0.30 USDC for POST /verify")
    state = submitVerification(
      state,
      { dealId: id, observed: observedFor(scenario) },
      wc(`${id}-verify`, now + 120_000),
    )
    state = step("relay", "Signed result relayed to Whitechain")
  }

  const finish = (id: string, at: string, investors: string[]) => {
    state = settle(state, { dealId: id }, wc(`${id}-settle`, day(at)))
    investors.forEach((investorId, index) => {
      state = redeem(
        state,
        { dealId: id, investorId },
        wc(`${id}-redeem-${index}`, day(at) + 3_600_000),
      )
    })
  }

  open(
    "D-1001",
    "ravi",
    "ahmed",
    "Cotton yarn",
    30_000,
    "2026-07-01",
    "2026-08-05",
  )
  fund(
    "D-1001",
    [
      ["aanya", 0.5],
      ["rohan", 0.5],
    ],
    "2026-07-02",
  )
  verify("D-1001", "honest", "2026-07-06")
  finish("D-1001", "2026-08-04", ["aanya", "rohan"])

  open(
    "D-1002",
    "ravi",
    "ahmed",
    "Whole spices",
    24_000,
    "2026-08-03",
    "2026-09-08",
  )
  fund("D-1002", [["aanya", 1]], "2026-08-04")
  verify("D-1002", "honest", "2026-08-09")
  finish("D-1002", "2026-09-07", ["aanya"])

  open(
    "D-1003",
    "ravi",
    "lena",
    "Handloom textiles",
    18_000,
    "2026-09-02",
    "2026-10-06",
  )
  fund(
    "D-1003",
    [
      ["aanya", 0.4],
      ["rohan", 0.6],
    ],
    "2026-09-03",
  )
  verify("D-1003", "honest", "2026-09-08")
  finish("D-1003", "2026-10-05", ["aanya", "rohan"])

  open(
    "D-1004",
    "meera",
    "ahmed",
    "Ceramic tiles",
    12_000,
    "2026-09-14",
    "2026-10-20",
  )
  fund("D-1004", [["aanya", 1]], "2026-09-15")
  verify("D-1004", "fake-weight", "2026-09-19")

  open(
    "D-1005",
    "ravi",
    "ahmed",
    "Basmati rice",
    40_000,
    "2026-10-12",
    "2026-12-10",
  )
  fund(
    "D-1005",
    [
      ["aanya", 0.6],
      ["rohan", 0.4],
    ],
    "2026-10-13",
  )
  verify("D-1005", "honest", "2026-10-18")

  open(
    "D-1006",
    "ravi",
    "lena",
    "Brass hardware",
    16_000,
    "2026-10-26",
    "2026-12-20",
  )
  fund("D-1006", [["rohan", 1]], "2026-10-28")

  open(
    "D-1007",
    "ravi",
    "ahmed",
    "Leather goods",
    28_000,
    "2026-11-02",
    "2027-01-05",
  )

  open(
    "D-1008",
    "meera",
    "lena",
    "Jute bags",
    15_000,
    "2026-11-03",
    "2027-01-12",
  )
  state = buy(
    state,
    { dealId: "D-1008", investorId: "rohan", amount: 3_000 },
    wc("D-1008-buy", day("2026-11-04")),
  )

  state = createInvoice(
    state,
    {
      id: "D-1009",
      invoiceRef: "INV-1009",
      exporterId: "ravi",
      importerId: "ahmed",
      goods: "Stainless cookware",
      amount: 22_000,
      dueAt: day("2027-01-20"),
    },
    wc("D-1009-create", day("2026-11-05")),
  )

  return state
}

export const seedState: TradeState = build()
