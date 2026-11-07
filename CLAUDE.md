@AGENTS.md

# trustmebro

Next.js App Router, TypeScript, Tailwind CSS v4, shadcn/ui on Base UI (`base-nova` style). Uses npm.

## Commands

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
- Dashboards read Finance V2 through `/api/trade` and `src/lib/chain`. Transactions are signed in the browser wallet by `src/lib/trade/wallet.ts`. The server holds no keys.
- A wallet's role on Finance V2 decides its dashboard (`roleOf` in `src/lib/trade/store.ts`). There is no role switcher.
- Project skills live in `.claude/skills`.
