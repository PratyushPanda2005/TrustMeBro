import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored Claude Code skills.
    ".claude/**",
    // Foundry project (Solidity, build output, npm-vendored libraries).
    "contracts/**",
    // Backend services have their own tsconfig and tests.
    "services/**",
  ]),
])

export default eslintConfig
