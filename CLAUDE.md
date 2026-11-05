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
- Theme, tooltip and toast providers are already mounted in `src/app/layout.tsx`.
- Project skills live in `.claude/skills`.
