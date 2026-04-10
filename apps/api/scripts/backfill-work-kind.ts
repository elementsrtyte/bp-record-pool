#!/usr/bin/env npx tsx
/**
 * Recompute `tracks.work_kind` using the same rule as the admin API:
 * {@link resolveTrackWorkKind} — title regexes force **remix**; otherwise the stored value is kept.
 *
 * Usage (repo root):
 *   pnpm backfill-work-kind
 *   pnpm --filter @bp/api exec tsx scripts/backfill-work-kind.ts --dry-run
 *
 * Options:
 *   --dry-run Print changes only (default)
 *   --apply       Write updates
 *   --limit N     Max rows to scan
 *   --id UUID     Single track
 *
 * Env: DATABASE_URL (via monorepo `.env.local`, same as API).
 */

import { parseArgs } from "node:util";

import { eq } from "drizzle-orm";
import { resolveTrackWorkKind } from "@bp/shared";

import "../src/env.js";
import { db } from "../src/db/client.js";
import { tracks } from "../src/db/schema.js";

const { values: flags } = parseArgs({
  options: {
    apply: { type: "boolean", default: false },
    limit: { type: "string", default: "" },
    id: { type: "string", default: "" },
    help: { type: "boolean", default: false },
  },
});

if (flags.help) {
  console.log("backfill-work-kind — see scripts/backfill-work-kind.ts header.");
  process.exit(0);
}

/** When false, rows are updated. Default is dry-run only (`--apply` to write). */
const dryRun = !flags.apply;
const limitN = flags.limit.trim() ? Math.max(1, parseInt(flags.limit, 10) || 0) : null;
const singleId = flags.id.trim();

async function main() {
  const cols = { id: tracks.id, title: tracks.title, workKind: tracks.workKind };
  const rows = singleId
    ? await db.select(cols).from(tracks).where(eq(tracks.id, singleId))
    : limitN != null
      ? await db.select(cols).from(tracks).limit(limitN)
      : await db.select(cols).from(tracks);

  let wouldChange = 0;
  for (const row of rows) {
    const next = resolveTrackWorkKind(row.title.trim(), row.workKind);
    if (next === row.workKind) continue;
    wouldChange += 1;
    console.log(`${dryRun ? "[dry-run] " : ""}${row.id}  ${row.workKind} → ${next}  | ${row.title}`);
    if (!dryRun) {
      await db.update(tracks).set({ workKind: next }).where(eq(tracks.id, row.id));
    }
  }
  console.log(
    dryRun
      ? `\n${wouldChange} row(s) would change (run with --apply to write).`
      : `\nUpdated ${wouldChange} row(s).`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
