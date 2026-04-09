import { config } from "dotenv";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Directory containing this file (…/apps/api/src). */
const here = path.dirname(fileURLToPath(import.meta.url));
/** …/apps/api */
const apiRoot = path.resolve(here, "..");
/**
 * Monorepo root (…/bp-record-pool). Must go up from `src/`: apiRoot → apps → repo root.
 * Using only `../..` from `here` wrongly lands on `apps/`, so `.env.local` was never found.
 */
const monorepoRoot = path.resolve(apiRoot, "..", "..");

function loadEnvFile(filePath: string, override = false) {
  if (!existsSync(filePath)) return;
  config({ path: filePath, override });
}

// Base first, then *.local with override so empty keys in .env never win over .env.local
loadEnvFile(path.join(monorepoRoot, ".env"));
loadEnvFile(path.join(monorepoRoot, ".env.local"), true);
loadEnvFile(path.join(apiRoot, ".env"));
loadEnvFile(path.join(apiRoot, ".env.local"), true);
