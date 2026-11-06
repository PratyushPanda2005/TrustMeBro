@AGENTS.md

# trustmebro

Next.js App Router, TypeScript, Tailwind CSS v4, shadcn/ui on Base UI (`base-nova` style). Uses npm.

## Commands

- `npm run stack`: start the local backend (chain, contracts, verifier, agent stand-in, seeded deals)
- `npm run dev`: start the dev server
- `npm run build`: production build
- `npm run lint`: ESLint
- `npm run typecheck`: TypeScript with no emit
- `npm run format`: Prettier

## Conventions

- shadcn components live in `src/components/ui`. They use Base UI, so compose with the `render` prop rather than Radix's `asChild`.
- Add components with `npx shadcn@latest add <name>`. `add --all` has skipped components here, so check the file exists afterwards.
- Style with the semantic tokens in `src/app/globals.css` (`bg-background`, `text-muted-foreground`), not raw colors.
- Providers are mounted in the two root layouts, `src/app/(marketing)/layout.tsx` and `src/app/(dashboard)/layout.tsx`.
- Dashboards read and write through `/api/trade`. `src/lib/chain` is the only code that talks to the contracts.
- Project skills live in `.claude/skills`.
