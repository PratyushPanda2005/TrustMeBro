# trustmebro

Next.js App Router, TypeScript, Tailwind CSS v4 and shadcn/ui on Base UI.

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

A trade's check comes from one of two places:

- **Paid check:** follow `V2_METAMASK_DEMO.md`, using `npm run setup:v2-demo -- "--credentials=PATH"` in `services/verifier` to create both `.env` files. For a trade made in the dashboard, run `npm run demo-evidence -- --trade-id=ID` just before the check. The agent's signed answer appears on the admin deal page, ready to relay from MetaMask.
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
