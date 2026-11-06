/**
 * Loads the repo-root .env from any workspace. pnpm runs workspace scripts with
 * cwd = the package dir, so a bare `import "dotenv/config"` would miss the root .env
 * the runbook asks you to fill. Shell variables always win (VAR=x pnpm …).
 * Side-effect import: `import "@tmb/shared/env"`.
 */
import { config } from "dotenv";
import { fileURLToPath } from "node:url";

export const ROOT_ENV = fileURLToPath(new URL("../../../.env", import.meta.url));

export function loadEnv(path: string = ROOT_ENV) {
  config({ path });
}

loadEnv();
