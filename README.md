# trustmebro

Next.js App Router, TypeScript, Tailwind CSS v4 and shadcn/ui on Base UI.

## Getting started

```bash
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

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
