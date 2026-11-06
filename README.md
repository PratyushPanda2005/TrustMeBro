# trustmebro

Next.js App Router, TypeScript, Tailwind CSS v4 and shadcn/ui on Base UI.

## Getting started

```bash
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

## Running the full product

The dashboards read live contract state, so they need the backend:

```bash
npm install
(cd contracts && npm install && npx forge build)
(cd services/verifier && npm install)

npm run stack    # local chain, contracts, verifier, agent stand-in and seeded deals
npm run dev      # in a second terminal
```

`npm run stack` wipes the chain each time it starts. It signs with public test keys, on the local chain only.

### Using the real agent

The stand-in relays checks without paying. To run the Hedera agent instead, fill in `Hedera_Agentic_Payments/.env`, then:

```bash
PAYMENTS=on VERIFIER_PAYTO=0.0.x LOCAL_AGENT=off npm run stack
cd Hedera_Agentic_Payments && CHAIN_ADAPTER=local pnpm agent
```

### Moving to Whitechain

Deploy the contracts, then set these for the dashboard:

```bash
CHAIN=whitechain
TRADEDEALS_ADDRESS=0x...
REGISTRY_ADDRESS=0x...
USDT_ADDRESS=0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7
VERIFIER_URL=https://...
PARTIES='{"0x...":{"name":"Ravi Exports","role":"exporter"}}'
PERSONAS='{"exporter":"0x...","importer":"0x...","investor":"0x..."}'
```

Reads work straight away. Writes need wallet signing, which is the remaining step: on a real network the dashboard shows a "connect a wallet" notice instead of acting.

## Scripts

| Command             | What it does         |
| ------------------- | -------------------- |
| `npm run stack`     | Start the backend    |
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
