/**
 * All landing page copy and data. Figures come from the master plan
 * (docs/TMB-00-master-plan.md): keep them in sync if the scoring rules change.
 */

export const links = {
  app: "/dashboard/exporter",
  repo: "https://github.com/PratyushPanda2005/TrustMeBro",
  whitechainDocs: "https://docs.whitechain.io/",
  whitechainExplorer: "https://explorer.testnet.whitechain.io/",
  hederaX402: "https://docs.hedera.com/solutions/ai/x402",
  hashscan: "https://hashscan.io/testnet",
  x402Repo: "https://github.com/x402-foundation/x402",
  erc8004: "https://eips.ethereum.org/EIPS/eip-8004",
  openZeppelin: "https://docs.openzeppelin.com/contracts/5.x/",
  viemTyped: "https://viem.sh/docs/actions/wallet/signTypedData",
  faucet: "https://faucet.testnet.whitechain.io/",
  ethglobal: "https://ethglobal.com/events/mumbai",
} as const

export type NavLink = { label: string; href: string; description?: string }
export type NavGroup = { label: string; items: NavLink[] }
export type NavEntry =
  { label: string; href: string } | { label: string; groups: NavGroup[] }

export const productGroups = [
  {
    title: "Deal finance",
    items: [
      {
        icon: "fileCheck",
        title: "Invoice financing",
        description: "Hash-locked invoices that can never be financed twice",
      },
      {
        icon: "coins",
        title: "Receivable NFT",
        description: "Restricted to KYC'd investors, one per deal",
      },
      {
        icon: "lock",
        title: "Evidence-gated funding",
        description: "No investor money moves until the check passes",
      },
      {
        icon: "split",
        title: "Settlement waterfall",
        description:
          "On repayment, the investor first and the exporter the rest",
      },
    ],
  },
  {
    title: "Reputation",
    items: [
      {
        icon: "gauge",
        title: "Risk and Trust Scores",
        description: "Onchain scores that set the advance and the yield",
      },
    ],
  },
  {
    title: "Verification",
    items: [
      {
        icon: "eye",
        title: "x402 claims check",
        description: "A paid, signed and independent shipment check",
      },
    ],
  },
  {
    title: "Audit",
    items: [
      {
        icon: "scroll",
        title: "Hedera audit log",
        description: "Every quote, payment and refusal on a public topic",
      },
    ],
  },
] as const

export const navEntries: NavEntry[] = [
  {
    label: "Products",
    groups: productGroups.map((group) => ({
      label: group.title,
      items: group.items.map((item) => ({
        label: item.title,
        description: item.description,
        href: "#how-it-works",
      })),
    })),
  },
  {
    label: "Solutions",
    groups: [
      {
        label: "Who it's for",
        items: [
          {
            label: "Exporters",
            description: "Paid in minutes, not 60 days",
            href: "#solutions",
          },
          {
            label: "Investors",
            description: "Fund verified invoices in USDT",
            href: "#solutions",
          },
          {
            label: "Importers",
            description: "Approve onchain, pay on the due date",
            href: "#solutions",
          },
        ],
      },
    ],
  },
  { label: "Pricing", href: "#pricing" },
  { label: "Developers", href: "#developers" },
  {
    label: "Resources",
    groups: [
      {
        label: "Networks",
        items: [
          {
            label: "Whitechain docs",
            description: "Where deals and scores live",
            href: links.whitechainDocs,
          },
          {
            label: "Hedera x402 docs",
            description: "How the agent pays for checks",
            href: links.hederaX402,
          },
        ],
      },
      {
        label: "Project",
        items: [
          {
            label: "GitHub",
            description: "Contracts, agent and verifier",
            href: links.repo,
          },
        ],
      },
    ],
  },
]

export const hero = {
  title: ["The trade finance", "you can verify"],
  lead: "Exporters are paid in minutes, not 60 days.",
  support:
    "An AI agent pays for an independent shipment check, then one investor funds the verified invoice in USDT.",
  primary: { label: "Start a deal", href: links.app },
  secondary: { label: "See how it works", href: "#how-it-works" },
  aside: { label: "Investors replace the bank", href: "#pricing" },
}

export const rails = {
  title: { dim: "Built on", bright: "open rails" },
  items: [
    {
      name: "Whitechain",
      logo: "whitechain.svg",
      tag: "Settlement",
      href: links.whitechainDocs,
      statement: "Deals, scores and the waterfall all live here.",
      role: "Chain 1874",
    },
    {
      name: "Hedera",
      logo: "hedera.svg",
      tag: "Payments",
      href: links.hederaX402,
      statement: "The agent pays for each check on Hedera, with no human.",
      role: "x402 payment network",
    },
    {
      name: "x402",
      logo: "x402.svg",
      tag: "Protocol",
      href: links.x402Repo,
      statement: "HTTP 402 turns an API call into a machine payment.",
      role: "Paid POST /verify",
    },
    {
      name: "USDT",
      logo: "usdt.svg",
      tag: "Funding",
      href: links.whitechainExplorer,
      statement: "Investors fund, and importers repay, in USDT.",
      role: "Deal currency",
    },
    {
      name: "USDC",
      logo: "usdc.svg",
      tag: "Agent fees",
      href: links.hashscan,
      statement: "Each check costs the agent 0.30 USDC on Hedera.",
      role: "Verification fee",
    },
    {
      name: "HCS",
      logo: "hedera.svg",
      tag: "Audit",
      href: links.hashscan,
      statement: "Every quote, payment and refusal is publicly logged.",
      role: "Hedera Consensus Service",
    },
    {
      name: "EIP-712",
      logo: "ethereum.svg",
      tag: "Signatures",
      href: links.viemTyped,
      statement: "The verifier signs its answer, so the agent can't alter it.",
      role: "Typed signed data",
    },
    {
      name: "ERC-721",
      logo: "ethereum.svg",
      tag: "Tokens",
      href: links.openZeppelin,
      statement: "One restricted receivable NFT for every funded deal.",
      role: "Receivable NFT",
    },
    {
      name: "ERC-8004",
      logo: "ethereum.svg",
      tag: "Reputation",
      href: links.erc8004,
      statement: "Score updates emit standards-style feedback events.",
      role: "Trustless reputation",
    },
    {
      name: "OpenZeppelin",
      logo: "openzeppelin.svg",
      tag: "Contracts",
      href: links.openZeppelin,
      statement: "Audited building blocks for tokens, signatures and safety.",
      role: "Contract library",
    },
  ],
}

export const stack = {
  title: { lead: "Trade finance built to", emphasis: "prove" },
  body: {
    before:
      "Your shipment claims are your collateral, and code holds the money.",
    link: { label: "Agentic payments.", href: links.hederaX402 },
    after: "Stablecoin settlement. A score that remembers.",
  },
  steps: [
    {
      kicker: "Your invoice",
      title: "Tokenize",
      body: "Create an invoice and have the importer approve it onchain. Its hash means it can never be financed twice.",
    },
    {
      kicker: "Your claims",
      title: "Declare",
      body: "Ship the goods, then commit the weight, status and document hash onchain.",
    },
    {
      kicker: "Our agent",
      title: "Verify",
      body: "An AI agent pays for an independent check straight away. It delivers the answer and never judges it.",
    },
    {
      kicker: "Our contract",
      title: "Release",
      body: "If the contract finds a match, one investor funds the deal and you are paid in the same transaction.",
      cta: { label: "Start a deal", href: links.app },
    },
  ],
}

export type MockTone = "default" | "success" | "danger"

export type Solution = {
  title: string
  description: string
  bullets: { icon: "shield" | "swap" | "trend"; label: string }[]
  image: string
  mock: {
    title: string
    subtitle: string
    tag: string
    tone: MockTone
    statLabel: string
    stat: string
    cells: { label: string; value: string }[]
    feedTitle: string
    feed: { name: string; detail: string; value: string; tone?: MockTone }[]
  }
  api: Record<string, unknown>
}

export const solutions: { title: string; items: Solution[] } = {
  title: "Designed for every side of the deal",
  items: [
    {
      title: "Exporters",
      description:
        "Get paid in minutes, not 60 days. Create an invoice, ship, declare your claims, and an investor can fund you as soon as the check matches.",
      bullets: [
        { icon: "trend", label: "Advance equals your Trust Score" },
        { icon: "swap", label: "Paid in USDT" },
        { icon: "shield", label: "Honest deals raise your limit" },
      ],
      image: "wash-ember",
      mock: {
        title: "Ravi Exports",
        subtitle: "Trust Score 70%",
        tag: "Funded",
        tone: "success",
        statLabel: "You received",
        stat: "69,300.00 USDT",
        cells: [
          { label: "Invoice", value: "100,000 USDT" },
          { label: "Advance", value: "70.00%" },
          { label: "Fee", value: "700 USDT" },
          { label: "At due date", value: "27,200" },
        ],
        feedTitle: "Deal timeline",
        feed: [
          { name: "Invoice", detail: "Created", value: "100,000" },
          { name: "Importer", detail: "Approved", value: "Signed" },
          {
            name: "Claims",
            detail: "Verified",
            value: "3 of 3",
            tone: "success",
          },
          {
            name: "Investor",
            detail: "Funded",
            value: "+69,300",
            tone: "success",
          },
        ],
      },
      api: {
        state: "Funded",
        invoice: "100000.00",
        advanceBps: 7000,
        advance: "70000.00",
        fee: "700.00",
        exporterNet: "69300.00",
        currency: "USDT",
        claims: { declaredKg: 10000, status: "LOADED" },
        observed: { observedKg: 9850, status: "DEPARTED" },
      },
    },
    {
      title: "Investors",
      description:
        "Replace the bank. See the paid evidence, both scores and the terms, then fund one deal and hold its receivable NFT.",
      bullets: [
        { icon: "shield", label: "Verified before you fund" },
        { icon: "swap", label: "One deal, one investor" },
        { icon: "trend", label: "Paid first on repayment" },
      ],
      image: "wash-teal",
      mock: {
        title: "Verified deal",
        subtitle: "100,000 USDT invoice",
        tag: "Verified",
        tone: "success",
        statLabel: "You get back",
        stat: "72,800.00 USDT",
        cells: [
          { label: "You fund", value: "70,000 USDT" },
          { label: "Yield", value: "4.00%" },
          { label: "Exporter trust", value: "70%" },
          { label: "Importer risk", value: "4%" },
        ],
        feedTitle: "Evidence",
        feed: [
          { name: "Weight", detail: "Weighbridge", value: "9,850 kg" },
          { name: "Status", detail: "Carrier", value: "Departed" },
          {
            name: "Documents",
            detail: "eBL hash",
            value: "Match",
            tone: "success",
          },
          {
            name: "Yield",
            detail: "On repayment",
            value: "+2,800",
            tone: "success",
          },
        ],
      },
      api: {
        state: "Verified",
        advance: "70000.00",
        yieldBps: 400,
        investorDue: "72800.00",
        currency: "USDT",
        exporterTrustBps: 7000,
        importerRiskBps: 400,
        kyc: true,
      },
    },
    {
      title: "Importers",
      description:
        "Accept the debt onchain and pay the contract on the due date. Paying on time lowers your Risk Score, which is the yield investors earn on your deals.",
      bullets: [
        { icon: "shield", label: "Risk Score from 2% to 8%" },
        { icon: "swap", label: "Your approval starts the deal" },
        { icon: "trend", label: "Late payment raises your score" },
      ],
      image: "wash-violet",
      mock: {
        title: "Ahmed Imports",
        subtitle: "Risk Score 3.33%",
        tag: "Settled",
        tone: "success",
        statLabel: "Invoice paid",
        stat: "100,000.00 USDT",
        cells: [
          { label: "Risk Score", value: "3.33%" },
          { label: "Last score", value: "4.00%" },
          { label: "Paid", value: "On time" },
          { label: "To the contract", value: "Yes" },
        ],
        feedTitle: "Waterfall",
        feed: [
          { name: "Investor", detail: "Principal + yield", value: "-72,800" },
          { name: "Exporter", detail: "The rest", value: "-27,200" },
          {
            name: "Total",
            detail: "Settled",
            value: "100,000",
            tone: "success",
          },
        ],
      },
      api: {
        state: "Settled",
        paid: "100000.00",
        currency: "USDT",
        waterfall: { investor: "72800.00", exporter: "27200.00" },
        importerRiskBps: { before: 400, after: 333 },
      },
    },
    {
      title: "AI verification agent",
      description:
        "An agent that pays and never judges. It sees the claim, clears its spending gate and pays POST /verify with no human.",
      bullets: [
        { icon: "shield", label: "No LLM on the money path" },
        { icon: "swap", label: "1.00 USDC cap per deal" },
        { icon: "trend", label: "10.00 USDC cap per day" },
      ],
      image: "wash-gold",
      mock: {
        title: "Agent run",
        subtitle: "Spending gate passed",
        tag: "Paid",
        tone: "success",
        statLabel: "Paid for the check",
        stat: "0.30 USDC",
        cells: [
          { label: "Network", value: "Hedera" },
          { label: "Checks", value: "Max 3" },
          { label: "Payee", value: "Allowlisted" },
          { label: "Over a cap", value: "Human" },
        ],
        feedTitle: "Audit log",
        feed: [
          { name: "POST /verify", detail: "Unpaid", value: "402" },
          { name: "Gate", detail: "Under limits", value: "Pass" },
          { name: "Payment", detail: "Settled", value: "200", tone: "success" },
          {
            name: "Relay",
            detail: "To Whitechain",
            value: "Sent",
            tone: "success",
          },
        ],
      },
      api: {
        status: 200,
        price: "$0.30",
        network: "hedera:testnet",
        verification: {
          observedKg: 9850,
          statusCode: 4,
          docHash: "0x4b1a...90ce",
        },
        signature: "0x7c1e...e41b",
      },
    },
    {
      title: "Trust Score",
      description:
        "Honesty sets the price. Your score is your advance, and every settled deal raises it and your credit limit.",
      bullets: [
        { icon: "shield", label: "Three weighted checks" },
        { icon: "trend", label: "Falsified claims cost double" },
        { icon: "swap", label: "Below 40% you can't open deals" },
      ],
      image: "wash-moss",
      mock: {
        title: "Exporter record",
        subtitle: "5 honest deals",
        tag: "High",
        tone: "success",
        statLabel: "Trust Score",
        stat: "85.71%",
        cells: [
          { label: "Weight", value: "0.40" },
          { label: "Documents", value: "0.35" },
          { label: "Status", value: "0.25" },
          { label: "Advance", value: "85.71%" },
        ],
        feedTitle: "Score history",
        feed: [
          {
            name: "Deal 1",
            detail: "Settled",
            value: "66.67%",
            tone: "success",
          },
          {
            name: "Deal 2",
            detail: "Settled",
            value: "75.00%",
            tone: "success",
          },
          {
            name: "Deal 3",
            detail: "Settled",
            value: "80.00%",
            tone: "success",
          },
          {
            name: "Deal 5",
            detail: "Settled",
            value: "85.71%",
            tone: "success",
          },
        ],
      },
      api: {
        trustBps: 8571,
        advanceBps: 8571,
        evidence: { r: 50000, s: 0 },
        prior: { a: 10000, b: 10000 },
      },
    },
    {
      title: "Caught lying",
      description:
        "Lying is unprofitable and permanent. A false claim is rejected before any investor money moves, and only the liar's score drops.",
      bullets: [
        { icon: "swap", label: "No investor money ever moved" },
        { icon: "shield", label: "Only the liar drops" },
        { icon: "trend", label: "Blocked below a 40% score" },
      ],
      image: "wash-rose",
      mock: {
        title: "Short shipment",
        subtitle: "Weight didn't match",
        tag: "Rejected",
        tone: "danger",
        statLabel: "Investor money moved",
        stat: "0.00 USDT",
        cells: [
          { label: "Claimed", value: "10,000 kg" },
          { label: "Observed", value: "8,020 kg" },
          { label: "Advance", value: "0 USDT" },
          { label: "Trust Score", value: "26.32%" },
        ],
        feedTitle: "Deal timeline",
        feed: [
          { name: "Claims", detail: "Declared", value: "10,000 kg" },
          {
            name: "Weight",
            detail: "Falsified",
            value: "8,020 kg",
            tone: "danger",
          },
          {
            name: "Exporter",
            detail: "Trust Score",
            value: "-23.68",
            tone: "danger",
          },
          { name: "New deals", detail: "Blocked", value: "Below 40%" },
        ],
      },
      api: {
        state: "Rejected",
        falsified: ["weight"],
        fundsMoved: "0.00",
        currency: "USDT",
        exporterTrustBps: { before: 5000, after: 2632 },
      },
    },
  ],
}

export const stories = {
  id: "pricing",
  title: "Honesty sets the price",
  cta: { label: "View the repo", href: links.repo },
  items: [
    {
      image: "wash-teal",
      stat: "50%",
      statLabel: "Advance",
      title: "A new exporter takes 50,000 USDT against a 100,000 USDT invoice",
      label: "New exporter",
    },
    {
      image: "wash-gold",
      stat: "90%",
      statLabel: "Advance",
      title:
        "A veteran exporter takes 90,000 USDT, and a reliable importer cuts the yield to 2.80%",
      label: "Veteran exporter",
    },
    {
      image: "wash-rose",
      stat: "0%",
      statLabel: "Advance",
      title:
        "A cheat gets nothing, no investor money moves, and the Trust Score falls to 26.32%",
      label: "Caught lying",
    },
  ],
}

export const developers = {
  title: "Start verifying today",
  features: [
    {
      title: "Paid endpoint",
      description: "POST /verify over x402, for 0.30 USDC on Hedera",
    },
    {
      title: "Signed answers",
      description: "EIP-712 results the contract checks for itself",
    },
    {
      title: "Immutable audit",
      description: "Every quote and payment on a public HCS topic",
    },
    {
      title: "No LLM on the money path",
      description: "The agent delivers data, and the contract judges it",
    },
    {
      title: "Bad requests are free",
      description: "Settlement happens only on success, so errors cost nothing",
    },
  ],
  primary: { label: "Start a deal", href: links.app },
  secondary: { label: "View the repo", href: links.repo },
  panel: {
    title: "Verify shipment",
    fieldLabel: "Deal status:",
    fieldValue: "Claims matched",
    request: `curl "$VERIFIER_URL/verify" \\
  -X 'POST' \\
  -H 'Content-Type: application/json' \\
  -H "PAYMENT-SIGNATURE: $SIGNED_HEDERA_TX" \\
  --data '{
    "dealId": "12",
    "shipmentRef": {
      "containerNo": "MSKU1234567",
      "blRef": "BL-001"
    }
  }'`,
    response: `{
  "dealId": "12",
  "verification": {
    "observedKg": 9850,
    "statusCode": 4,
    "docHash": "0x4b1a...90ce"
  },
  "signature": "0x7c1e...e41b",
  "expected": { "outcome": "Verified" }
}`,
  },
}

export const closing = {
  title: "Finance, verify and settle your trade deals on one onchain platform.",
  cta: { label: "Start a deal", href: links.app },
}

export const footer = {
  legal: [
    "TrustMeBro is a hackathon project built for ETHGlobal Mumbai 2026. It runs on testnets, and its verifier uses simulated shipment data.",
    "TrustMeBro is not a bank and isn't a regulated financial service. Nothing here is investment advice.",
  ],
  columns: [
    {
      title: "Products",
      links: productGroups.flatMap((group) =>
        group.items.map((item) => ({
          label: item.title,
          href: "#how-it-works",
        })),
      ),
    },
    {
      title: "Solutions",
      links: solutions.items.map((item) => ({
        label: item.title,
        href: "#solutions",
      })),
    },
    {
      title: "Resources",
      links: [
        { label: "Whitechain docs", href: links.whitechainDocs },
        { label: "Hedera x402 docs", href: links.hederaX402 },
        { label: "x402 protocol", href: links.x402Repo },
        { label: "ERC-8004", href: links.erc8004 },
      ],
    },
    {
      title: "Developers",
      links: [
        { label: "GitHub", href: links.repo },
        { label: "Whitechain explorer", href: links.whitechainExplorer },
        { label: "HashScan", href: links.hashscan },
        { label: "Whitechain faucet", href: links.faucet },
      ],
    },
  ],
  copyright: "© 2026 TrustMeBro",
  note: "Built at ETHGlobal Mumbai 2026 for Whitechain and Hedera.",
}
