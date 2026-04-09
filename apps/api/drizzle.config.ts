import { config } from "dotenv";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "drizzle-kit";

const apiRoot = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.resolve(apiRoot, "../..");

function load(filePath: string, override: boolean) {
  if (existsSync(filePath)) config({ path: filePath, override });
}

load(path.join(monorepoRoot, ".env"), false);
load(path.join(monorepoRoot, ".env.local"), true);
load(path.join(apiRoot, ".env"), false);
load(path.join(apiRoot, ".env.local"), true);

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  },
});
