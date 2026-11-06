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
        title: "Fractional deal tokens",
        description: "Restricted tokens for allowlisted investors",
      },
      {
        icon: "lock",
        title: "Locked USDT",
        description: "Money held by code until the check matches",
      },
      {
        icon: "split",
        title: "Settlement waterfall",
        description: "Investors, then platform, then exporter, in one step",
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
            description: "Fund invoices in USDT",
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
    "Investors fund invoices in USDT, and code releases the money only once a paid, independent check proves the shipment claims.",
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
      statement: "Each check costs the agent 0.30 USDC.",
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
      name: "ERC-1155",
      logo: "ethereum.svg",
      tag: "Tokens",
      href: links.openZeppelin,
      statement: "One restricted token id for every deal.",
      role: "Fractional deal tokens",
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
      body: "Turn an approved invoice into fractional deal tokens, priced by reputation.",
    },
    {
      kicker: "Your claims",
      title: "Declare",
      body: "Ship the goods, then commit your weight, status and document claims onchain.",
    },
    {
      kicker: "Our agent",
      title: "Verify",
      body: "An AI agent pays for an independent check. It delivers the answer and never judges it.",
    },
    {
      kicker: "Our contract",
      title: "Release",
      body: "The contract compares the signed answer with your claims, then pays or refunds.",
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
        "Get paid in minutes, not 60 days. Create an invoice, ship, declare your claims, and the advance lands the moment the check matches.",
      bullets: [
        { icon: "trend", label: "Advances up to 90%" },
        { icon: "swap", label: "Paid in USDT" },
        { icon: "shield", label: "A Risk Score that falls with honesty" },
      ],
      image: "wash-ember",
      mock: {
        title: "Ravi Exports",
        subtitle: "New exporter",
        tag: "Released",
        tone: "success",
        statLabel: "Advance released",
        stat: "18,000.00 USDT",
        cells: [
          { label: "Invoice", value: "30,000 USDT" },
          { label: "Advance", value: "60.0%" },
          { label: "Risk Score", value: "33.34%" },
          { label: "Last score", value: "50.00%" },
        ],
        feedTitle: "Deal timeline",
        feed: [
          { name: "Invoice", detail: "Created", value: "30,000" },
          { name: "Importer", detail: "Approved", value: "Signed" },
          {
            name: "Claims",
            detail: "Verified",
            value: "3 of 3",
            tone: "success",
          },
          {
            name: "Advance",
            detail: "Released",
            value: "+18,000",
            tone: "success",
          },
        ],
      },
      api: {
        state: "Released",
        invoice: "30000.00",
        advanceBps: 6000,
        advance: "18000.00",
        currency: "USDT",
        claims: {
          weight: true,
          status_code: true,
          document_verification: true,
        },
        exporterRiskBps: { before: 5000, after: 3334 },
      },
    },
    {
      title: "Investors",
      description:
        "Replace the bank. See the deal, both scores and the terms, then buy fractional deal tokens with USDT.",
      bullets: [
        { icon: "shield", label: "Locked until verified" },
        { icon: "swap", label: "100% back if a claim is false" },
        { icon: "trend", label: "Paid first at settlement" },
      ],
      image: "wash-teal",
      mock: {
        title: "Open deal",
        subtitle: "30,000 USDT invoice",
        tag: "Funded",
        tone: "success",
        statLabel: "Principal + yield",
        stat: "18,495.00 USDT",
        cells: [
          { label: "Principal", value: "18,000 USDT" },
          { label: "Yield", value: "2.75%" },
          { label: "Exporter risk", value: "50%" },
          { label: "Importer trust", value: "80%" },
        ],
        feedTitle: "Your position",
        feed: [
          { name: "Bought", detail: "Deal tokens", value: "18,000" },
          { name: "Locked", detail: "In contract", value: "18,000" },
          {
            name: "Yield",
            detail: "At settlement",
            value: "+495",
            tone: "success",
          },
          {
            name: "Repaid",
            detail: "Redeemable",
            value: "18,495",
            tone: "success",
          },
        ],
      },
      api: {
        state: "Funded",
        principal: "18000.00",
        yieldBps: 275,
        expectedReturn: "18495.00",
        currency: "USDT",
        exporterRiskBps: 5000,
        importerScoreBps: 8000,
        allowlisted: true,
      },
    },
    {
      title: "Importers",
      description:
        "Accept the debt onchain and pay in full on the due date. Nothing moves without your approval, and every on-time payment lifts your score.",
      bullets: [
        { icon: "shield", label: "Fixed Trust Code at onboarding" },
        { icon: "swap", label: "Your approval starts the deal" },
        { icon: "trend", label: "Reliable importers lower the yield" },
      ],
      image: "wash-violet",
      mock: {
        title: "Ahmed Imports",
        subtitle: "Trust Code 80%",
        tag: "Settled",
        tone: "success",
        statLabel: "Invoice paid",
        stat: "30,000.00 USDT",
        cells: [
          { label: "Trust Score", value: "86.66%" },
          { label: "Last score", value: "80.00%" },
          { label: "Yield set", value: "2.75%" },
          { label: "Paid", value: "On time" },
        ],
        feedTitle: "Waterfall",
        feed: [
          { name: "Investors", detail: "Principal + yield", value: "-18,495" },
          { name: "Platform", detail: "Fee", value: "-150" },
          { name: "Ravi", detail: "The rest", value: "-11,355" },
          {
            name: "Total",
            detail: "Settled",
            value: "30,000",
            tone: "success",
          },
        ],
      },
      api: {
        state: "Settled",
        paid: "30000.00",
        currency: "USDT",
        waterfall: {
          investors: "18495.00",
          platformFee: "150.00",
          exporter: "11355.00",
        },
        importerScoreBps: { before: 8000, after: 8666 },
      },
    },
    {
      title: "AI verification agent",
      description:
        "An agent that pays and never judges. It sees the claims, clears its spending checks and pays POST /verify with no human.",
      bullets: [
        { icon: "shield", label: "No LLM on the money path" },
        { icon: "swap", label: "1.00 USDC cap per call" },
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
          { label: "Deal cap", value: "2.00 USDC" },
          { label: "Payee", value: "Allowlisted" },
          { label: "Repeat", value: "Blocked" },
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
          weight: true,
          statusCode: true,
          documents: true,
        },
        signature: "0x7c1e...e41b",
      },
    },
    {
      title: "Risk Score",
      description:
        "Honesty sets the price. Every claim is checked, and the result moves a score that fixes your advance and your investors' yield.",
      bullets: [
        { icon: "shield", label: "Three weighted checks" },
        { icon: "trend", label: "Falsified claims cost double" },
        { icon: "swap", label: "Recorded onchain" },
      ],
      image: "wash-moss",
      mock: {
        title: "Exporter record",
        subtitle: "5 honest deals",
        tag: "Low risk",
        tone: "success",
        statLabel: "Risk Score",
        stat: "14.29%",
        cells: [
          { label: "Weight", value: "0.40" },
          { label: "Documents", value: "0.35" },
          { label: "Status", value: "0.25" },
          { label: "Advance", value: "86.8%" },
        ],
        feedTitle: "Score history",
        feed: [
          {
            name: "Deal 1",
            detail: "Honest",
            value: "33.34%",
            tone: "success",
          },
          {
            name: "Deal 2",
            detail: "Honest",
            value: "25.00%",
            tone: "success",
          },
          {
            name: "Deal 3",
            detail: "Honest",
            value: "20.00%",
            tone: "success",
          },
          {
            name: "Deal 5",
            detail: "Honest",
            value: "14.29%",
            tone: "success",
          },
        ],
      },
      api: {
        riskBps: 1429,
        badge: "Low risk",
        evidence: { good: 5, bad: 0 },
        prior: { a: 1, b: 1 },
        termsBps: { advance: 8678 },
      },
    },
    {
      title: "Disputes and refunds",
      description:
        "Lying is unprofitable and permanent. If a claim comes back false, investors are made whole and only the cheat's record suffers.",
      bullets: [
        { icon: "swap", label: "100% of locked funds refunded" },
        { icon: "shield", label: "Only the falsifier drops" },
        { icon: "trend", label: "No penalty for honest cancels" },
      ],
      image: "wash-rose",
      mock: {
        title: "Faked weight",
        subtitle: "Claim did not match",
        tag: "Disputed",
        tone: "danger",
        statLabel: "Refunded to investors",
        stat: "18,000.00 USDT",
        cells: [
          { label: "Claimed", value: "true" },
          { label: "Observed", value: "false" },
          { label: "Advance", value: "0 USDT" },
          { label: "Risk Score", value: "73.69%" },
        ],
        feedTitle: "Deal timeline",
        feed: [
          { name: "Claims", detail: "Declared", value: "3 of 3" },
          {
            name: "Weight",
            detail: "Mismatch",
            value: "False",
            tone: "danger",
          },
          {
            name: "Exporter",
            detail: "Risk Score",
            value: "+23.69",
            tone: "danger",
          },
          {
            name: "Investors",
            detail: "Refund",
            value: "+18,000",
            tone: "success",
          },
        ],
      },
      api: {
        state: "Disputed",
        falsified: ["weight"],
        refund: "18000.00",
        currency: "USDT",
        exporterRiskBps: { before: 5000, after: 7369 },
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
      stat: "60%",
      statLabel: "Advance",
      title: "A new exporter takes 18,000 USDT against a 30,000 USDT invoice",
      label: "New exporter",
    },
    {
      image: "wash-gold",
      stat: "90%",
      statLabel: "Advance",
      title:
        "A veteran exporter takes 27,000 USDT, and a reliable importer cuts the yield to 2%",
      label: "Veteran exporter",
    },
    {
      image: "wash-rose",
      stat: "0%",
      statLabel: "Advance",
      title:
        "A cheat gets nothing, investors get a full refund, and the Risk Score jumps to 73.69%",
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
    "dealId": "0x8f2a...c01d",
    "shipmentRef": "SHIP-2041",
    "claims": {
      "weight": true,
      "status_code": true,
      "document_verification": true
    }
  }'`,
    response: `{
  "dealId": "0x8f2a...c01d",
  "weight": true,
  "statusCode": true,
  "documents": true,
  "nonce": 41,
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
