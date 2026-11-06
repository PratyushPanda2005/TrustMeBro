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
        title: "Receivable note",
        description: "Held by the investor, repaid first",
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
        title: "Onchain reputation",
        description: "A score that sets the advance on every deal",
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
      statement: "One receivable note for every funded deal.",
      role: "Receivable note",
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
      body: "Create an invoice and have the importer confirm it onchain. Its hash means it can never be financed twice.",
    },
    {
      kicker: "Your claims",
      title: "Declare",
      body: "The invoice commits the quantity, shipment reference and document hash onchain.",
    },
    {
      kicker: "Our agent",
      title: "Verify",
      body: "An AI agent pays for an independent check straight away. It delivers the answer and never judges it.",
    },
    {
      kicker: "Our contract",
      title: "Release",
      body: "Once the check is recorded, one investor funds the deal and you are paid in the same transaction.",
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
        "Get paid in minutes, not 60 days. Create an invoice, ship, and an investor can fund you as soon as the check is recorded onchain.",
      bullets: [
        { icon: "trend", label: "Advance set by the deal score" },
        { icon: "swap", label: "Paid in USDT on Whitechain" },
        { icon: "shield", label: "The rest arrives at settlement" },
      ],
      image: "wash-ember",
      mock: {
        title: "Ravi Exports",
        subtitle: "Deal score 76",
        tag: "Funded",
        tone: "success",
        statLabel: "You received",
        stat: "73,720.00 USDT",
        cells: [
          { label: "Invoice", value: "100,000 USDT" },
          { label: "Deal score", value: "76" },
          { label: "Fee", value: "1,000 USDT" },
          { label: "At settlement", value: "23,068.40" },
        ],
        feedTitle: "Deal timeline",
        feed: [
          { name: "Invoice", detail: "Created", value: "100,000" },
          { name: "Importer", detail: "Confirmed", value: "Signed" },
          {
            name: "Shipment",
            detail: "Verified",
            value: "Valid",
            tone: "success",
          },
          {
            name: "Investor",
            detail: "Funded",
            value: "+73,720",
            tone: "success",
          },
        ],
      },
      api: {
        state: "Funded",
        face: "100000.00",
        score: 76,
        advance: "73720.00",
        fee: "1000.00",
        exporterAtSettlement: "23068.40",
        currency: "USDT",
      },
    },
    {
      title: "Investors",
      description:
        "Replace the bank. See the recorded check and the contract's quote, then fund one deal and hold its receivable note.",
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
        stat: "75,931.60 USDT",
        cells: [
          { label: "You fund", value: "73,720 USDT" },
          { label: "Profit", value: "2,211.60 USDT" },
          { label: "Deal score", value: "76" },
          { label: "Term", value: "60 days" },
        ],
        feedTitle: "Evidence",
        feed: [
          { name: "Quantity", detail: "Recorded", value: "Match" },
          { name: "Stage", detail: "Recorded", value: "In transit" },
          {
            name: "Documents",
            detail: "Hash",
            value: "Match",
            tone: "success",
          },
          {
            name: "Profit",
            detail: "On repayment",
            value: "+2,211.60",
            tone: "success",
          },
        ],
      },
      api: {
        state: "Verified",
        advance: "73720.00",
        profit: "2211.60",
        investorDue: "75931.60",
        currency: "USDT",
        score: 76,
        verification: "Valid",
      },
    },
    {
      title: "Importers",
      description:
        "Confirm the debt onchain and repay the contract. Each on-time repayment lowers your Risk Score and lifts the terms on your next deal.",
      bullets: [
        { icon: "shield", label: "Your confirmation starts the deal" },
        { icon: "swap", label: "Repay the contract, not the exporter" },
        { icon: "trend", label: "Repayment improves your score" },
      ],
      image: "wash-violet",
      mock: {
        title: "Ahmed Imports",
        subtitle: "Risk Score 24",
        tag: "Settled",
        tone: "success",
        statLabel: "Invoice repaid",
        stat: "100,000.00 USDT",
        cells: [
          { label: "Risk Score", value: "24" },
          { label: "Last score", value: "32" },
          { label: "Paid", value: "On time" },
          { label: "To the contract", value: "Yes" },
        ],
        feedTitle: "Waterfall",
        feed: [
          { name: "Holder", detail: "Principal + profit", value: "-75,931.60" },
          { name: "Platform", detail: "1% fee", value: "-1,000" },
          { name: "Exporter", detail: "The rest", value: "-23,068.40" },
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
        waterfall: { holder: "75931.60", fee: "1000.00", exporter: "23068.40" },
      },
    },
    {
      title: "AI verification agent",
      description:
        "An agent that pays and never judges. It sees the confirmed trade, clears its spending gate and pays POST /verify with no human.",
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
        attestation: {
          quantity: "1000",
          stage: 2,
          documentHash: "0x4b1a...90ce",
        },
        signature: "0x7c1e...e41b",
      },
    },
    {
      title: "Deal score",
      description:
        "Honesty sets the price. Repayment history lifts the deal score, and the deal score sets the advance.",
      bullets: [
        { icon: "shield", label: "Stored in an onchain Reputation contract" },
        { icon: "trend", label: "Each repayment raises it" },
        { icon: "swap", label: "Frozen when an investor funds" },
      ],
      image: "wash-moss",
      mock: {
        title: "Live on Whitechain",
        subtitle: "Same importer",
        tag: "Rising",
        tone: "success",
        statLabel: "Deal score today",
        stat: "76",
        cells: [
          { label: "Trade 1", value: "60" },
          { label: "Trade 2", value: "70" },
          { label: "Today", value: "76" },
          { label: "Fee", value: "1%" },
        ],
        feedTitle: "Score history",
        feed: [
          { name: "Trade 1", detail: "Settled", value: "60", tone: "success" },
          { name: "Trade 2", detail: "Settled", value: "70", tone: "success" },
          { name: "Next deal", detail: "Quoted", value: "76", tone: "success" },
        ],
      },
      api: {
        importerScore: 76,
        history: [60, 70, 76],
        advanceFormula: "face x score x 97%",
      },
    },
    {
      title: "No proof, no money",
      description:
        "A shipment that can't be proven gets no signature, so the contract never quotes it. No investor money moves.",
      bullets: [
        { icon: "swap", label: "No signature, no funding" },
        { icon: "shield", label: "Payment isn't proof of shipment" },
        { icon: "trend", label: "The agent can't change the answer" },
      ],
      image: "wash-rose",
      mock: {
        title: "Insufficient evidence",
        subtitle: "Check failed",
        tag: "Not financeable",
        tone: "danger",
        statLabel: "Investor money moved",
        stat: "0.00 USDT",
        cells: [
          { label: "Signature", value: "None" },
          { label: "Quote", value: "Refused" },
          { label: "Advance", value: "0 USDT" },
          { label: "Cost", value: "0.30 USDC" },
        ],
        feedTitle: "Deal timeline",
        feed: [
          { name: "Trade", detail: "Confirmed", value: "Signed" },
          {
            name: "Evidence",
            detail: "Insufficient",
            value: "No signature",
            tone: "danger",
          },
          {
            name: "Contract",
            detail: "Quote",
            value: "Reverts",
            tone: "danger",
          },
          { name: "Funding", detail: "Blocked", value: "0 USDT" },
        ],
      },
      api: {
        result: "insufficient_evidence",
        signature: null,
        quote: "not financeable",
        fundsMoved: "0.00",
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
      stat: "60",
      statLabel: "Deal score",
      title: "Trade 1 advanced 5.82 USDT against a 10 USDT invoice",
      label: "First deal",
    },
    {
      image: "wash-gold",
      stat: "70",
      statLabel: "Deal score",
      title: "One repayment later, the same importer's next deal scored 70",
      label: "Second deal",
    },
    {
      image: "wash-rose",
      stat: "0",
      statLabel: "USDT moved",
      title:
        "A shipment with no proof gets no signature, and it can't be funded",
      label: "No proof",
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
    "tradeId": "4",
    "chainId": 1874,
    "finance": "0x71e3...DfC7",
    "termsHash": "0x4cf0...7068",
    "metadata": { "shipmentReference": "MSKU7654321" }
  }'`,
    response: `{
  "v": 2,
  "result": "passing",
  "attestation": {
    "tradeId": "4",
    "quantity": "1000",
    "stage": 2,
    "expiry": "1794000000"
  },
  "signature": "0x7c1e...e41b"
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
