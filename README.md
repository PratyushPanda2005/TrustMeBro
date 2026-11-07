# TrustMeBro

Trade finance where an AI agent pays for shipment checks over x402 on Hedera, and a contract on Whitechain decides what gets funded.

An exporter needs cash now, but the importer pays in 60 days. An investor advances the money, and the importer repays the contract at the due date. Before any money moves, an agent buys an independent shipment check with no human approving it.

## x402 payment flow

1. The exporter creates an invoice, and the importer confirms it on Whitechain.
2. The agent sees the confirmed trade and calls the verifier's `POST /verify`, which answers `402 Payment Required`.
3. The agent checks its spending limits: network, token, merchant allowlist, per-call, per-deal and daily budgets, and checks per exporter.
4. It pays 0.30 USDC on Hedera testnet through the Blocky402 facilitator, then retries with payment.
5. The verifier checks the evidence and signs an EIP-712 answer.
6. The agent confirms the payment on the Mirror Node, then relays the answer to Finance V2 from a wallet with no roles.
7. The contract checks the signer, terms, nonce and expiry, then marks the deal Verified so an investor can fund it.
8. Every step is logged to HCS topic `0.0.11336190`.

### A settled payment with no human approving

| What             | Reference                                                                                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Trade            | 7, importer Trust Score 76                                                                                                                                                           |
| Hedera payment   | [`0.0.7162784@1794010184.118241140`](https://hashscan.io/testnet/transaction/0.0.7162784@1794010184.118241140)                                                                       |
| Whitechain relay | [`0x33c2b9a50723dc8ac28ca56b994bb39327e42be94c7c6a641b2db247d52d0985`](https://explorer.testnet.whitechain.io/tx/0x33c2b9a50723dc8ac28ca56b994bb39327e42be94c7c6a641b2db247d52d0985) |
| Audit topic      | [`0.0.11336190`](https://hashscan.io/testnet/topic/0.0.11336190)                                                                                                                     |

**The shipment evidence is simulated.** The payment, signature, relay and contract rules are real testnet activity. No shipping data provider is connected, so the verifier generates evidence labelled `DEMO_SIMULATION`, which always matches the invoice. A real provider plugs in through `SHIPPING_PROVIDER_MODULE`.

## Architecture

| Part                                             | Path                                     | Runs on           |
| ------------------------------------------------ | ---------------------------------------- | ----------------- |
| Dashboards and landing page                      | `src/`                                   | Next.js           |
| AI agent, x402 payer, spending limits, audit log | `Hedera_Agentic_Payments/services/agent` | Long-running Node |
| x402 verifier                                    | `services/verifier`                      | Long-running Node |
| Shared ABIs and rules                            | `packages/shared`                        | Library           |
| Finance V2, Reputation, ReceivableNote           | Deployed on Whitechain Sepolia           | Chain 1874        |

| Contract            | Address                                      |
| ------------------- | -------------------------------------------- |
| Finance V2          | `0x71e3c6aE367A0D8517A0DA7cC480cBa9e954DfC7` |
| Importer reputation | `0xdeDa59a4Fe774A0F553e9fBEa78D4bd96f0c2673` |
| ReceivableNote      | `0x7a403A382fc3AFbe985ba1a00bA973674167BAD0` |
| Test USDT           | `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7` |

Flow charts are in `docs/diagrams`, and the product spec is `docs/PRD.md`. Parts of the charts and the PRD's sections 6 to 9 describe the original plan. Its "Live contract update" section lists where the deployed contract differs.

## How a deal is priced

The importer's Trust Score comes from the Reputation contract. New importers start at 60, and it's capped at 93.

```
Base           = floor(Invoice × 97%)
Advance        = floor(Base × Trust Score ÷ 100)
InvestorProfit = floor(Advance × 3%)
PlatformFee    = floor(Invoice × 1%)
ExporterFinal  = Invoice − Advance − InvestorProfit − PlatformFee
```

## Running the automatic agent

Create both `.env` files with `npm run setup:v2-demo -- "--credentials=PATH"` in `services/verifier`, and set a funded, non-admin `RELAYER_PRIVATE_KEY` in the agent's `.env`.

```bash
# services/verifier
DEMO_EVIDENCE_AUTO=I_UNDERSTAND_SHIPMENT_EVIDENCE_IS_SIMULATED \
V2_DEMO_ACK=I_UNDERSTAND_SHIPMENT_EVIDENCE_IS_SIMULATED npm run start:v2

# Hedera_Agentic_Payments/services/agent
V2_EXECUTE=I_AUTHORIZE_LIVE_HEDERA_PAYMENTS_AND_WHITECHAIN_RELAYS \
V2_DEMO_ACK=I_UNDERSTAND_SHIPMENT_EVIDENCE_IS_SIMULATED npm run start:v2
```

Once running, the agent spends 0.30 USDC on every newly confirmed trade, within its limits, until you stop it.

## Use of AI tools

This project used Claude Code (Anthropic) as a development assistant. The team set the product, the trade finance design and the decisions on what to build, reviewed the results, and ran the live testnet deals.

| Area                                          | How AI was used                                                                      |
| --------------------------------------------- | ------------------------------------------------------------------------------------ |
| `src/` landing page and dashboards            | Generated with Claude Code from the team's direction, then adjusted through review   |
| `src/lib/chain`, `src/lib/trade`, role access | Written with Claude Code to connect the dashboards to the team's contracts and agent |
| `services/verifier`                           | Claude Code added per-trade demo evidence and its tests                              |
| `Hedera_Agentic_Payments/services/agent`      | Claude Code added Mirror Node retries, trade reloading and the heartbeat             |
| `docs/PRD.md`, `docs/diagrams`                | Drafted with Claude Code from the team's plan                                        |

The planning documents are in `docs/`. Project skills are in `.claude/skills`. No LLM makes any money decision in the product: spending limits, evidence checks and contract rules are fixed code.

## Getting started

```bash
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

## Running the full product

The dashboards read Finance V2 live on Whitechain Sepolia (chain 1874), and every action is signed in MetaMask. The server holds no keys.

```bash
npm install
npm run dev
```

| Role     | Wallet                                       |
| -------- | -------------------------------------------- |
| Exporter | `0x4DCdA2a3b4b8c8aC71d3e9224e5a80FBF9a4219C` |
| Importer | `0xEd450f58f5287d37Ca9200930F14EbcaFa44CFF4` |
| Investor | `0x0dfd32c23580B576bCfEFcd418861162F4053873` |
| Admin    | `0xB758E119133050305520E2F47362cfDd9E55A325` |

A trade's check comes from one of three places:

- **Automatic paid check:** see "Running the automatic agent" above.
- **One-off paid check:** follow `V2_METAMASK_DEMO.md`. For a trade made in the dashboard, run `npm run demo-evidence -- --trade-id=ID` just before the check. The agent's signed answer appears on the admin deal page, ready to relay from MetaMask.
- **Manual check:** the admin records it from the same page, with no x402 payment. This is what trades 1 and 2 used.

Connecting a wallet opens the dashboard for its role on Finance V2. The admin adds and removes parties on the Parties page, and `PARTY_NAMES` sets the names of existing ones. New trades write their shipment details to `Hedera_Agentic_Payments/services/agent/.state/v2/`, where the agent reads them. This needs a writable disk, so hosting needs a small database instead.

## Scripts

| Command             | What it does         |
| ------------------- | -------------------- |
| `npm run dev`       | Start the dev server |
| `npm run build`     | Build for production |
| `npm run start`     | Serve the build      |
| `npm run lint`      | Run ESLint           |
| `npm run typecheck` | Check types          |
| `npm run format`    | Format with Prettier |

## Project layout

- `src/app`: routes, root layout and theme tokens (`globals.css`)
- `src/components/ui`: shadcn components, which you own and can edit
- `.claude/skills`: Claude Code skills for this project

## Claude Code skills

`.claude/skills` holds the Apache-2.0 skills from [anthropics/skills](https://github.com/anthropics/skills) and the MIT-licensed `shadcn` skill from [shadcn-ui/ui](https://github.com/shadcn-ui/ui). Each skill keeps its own license file.

The `docx`, `pdf`, `pptx` and `xlsx` skills are proprietary and can't be copied into a repository. To install them, run this in Claude Code:

```
/plugin marketplace add anthropics/skills
/plugin install document-skills@anthropic-agent-skills
```
