#!/usr/bin/env npx tsx
/**
 * Delete all catalog tracks and dependent rows:
 * - `tracks` (parent metadata + artwork key references)
 * - `track_versions` (FK cascade)
 * - `playlist_tracks` (FK cascade — playlists themselves stay; they become empty)
 *
 * Does not delete `profiles`, `subscriptions`, or `playlists`.
 * Does not remove objects from S3 or LOCAL_UPLOAD_DIR (orphan files are left on disk).
 *
 * Usage (from `apps/api` or via pnpm filter):
 *   pnpm reset-catalog -- --dry-run              # counts only, no changes
 *   pnpm reset-catalog -- --yes                  # truncate after confirmation flag
 *   RESET_CATALOG=1 pnpm reset-catalog           # confirm via env (no flag)
 *
 * Repo root:
 *   pnpm reset-catalog -- --dry-run
 *   pnpm reset-catalog -- --yes
 */

import postgres from "postgres";

import "../src/env.js";

function parseArgv() {
  const argv = process.argv.slice(2).filter((a) => a !== "--");
  return {
    help: argv.includes("--help") || argv.includes("-h"),
    dryRun: argv.includes("--dry-run"),
    yes: argv.includes("--yes") || argv.includes("-y"),
  };
}

const flags = parseArgv();

if (flags.help) {
  console.log(`reset-catalog — delete all tracks (and track_versions + playlist_tracks).

  --dry-run     Show row counts; do not modify the database.
  --yes, -y     Required to truncate (unless RESET_CATALOG=1 is set in the environment).

Examples:
  pnpm --filter @bp/api exec tsx scripts/reset-catalog.ts --dry-run
  pnpm --filter @bp/api exec tsx scripts/reset-catalog.ts --yes
  RESET_CATALOG=1 pnpm --filter @bp/api exec tsx scripts/reset-catalog.ts
`);
  process.exit(0);
}

const url =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const confirmed = flags.yes || process.env.RESET_CATALOG === "1";

type Counts = {
  tracks: number;
  trackVersions: number;
  playlistTracks: number;
};

async function loadCounts(sql: postgres.Sql): Promise<Counts> {
  const [row] = await sql<Counts[]>`
    SELECT
      (SELECT count(*)::int FROM tracks) AS "tracks",
      (SELECT count(*)::int FROM track_versions) AS "trackVersions",
      (SELECT count(*)::int FROM playlist_tracks) AS "playlistTracks"
  `;
  return row ?? { tracks: 0, trackVersions: 0, playlistTracks: 0 };
}

function printCounts(label: string, c: Counts) {
  console.log(`${label}
  tracks           ${c.tracks}
  track_versions   ${c.trackVersions}
  playlist_tracks  ${c.playlistTracks}`);
}

async function main() {
  const sql = postgres(url, { max: 1 });
  try {
    const before = await loadCounts(sql);
    printCounts("Current rows:", before);

    if (flags.dryRun) {
      console.log("\n--dry-run: no changes made.");
      return;
    }

    if (!confirmed) {
      console.error(`
Refusing to truncate without confirmation.

  Pass --yes (or -y), or set RESET_CATALOG=1 in the environment.

  pnpm reset-catalog -- --yes
`);
      process.exit(1);
    }

    await sql`TRUNCATE TABLE tracks CASCADE`;

    const after = await loadCounts(sql);
    printCounts("\nAfter TRUNCATE:", after);

    if (after.tracks !== 0 || after.trackVersions !== 0 || after.playlistTracks !== 0) {
      console.error("Unexpected: some catalog rows remain. Check FKs and table names.");
      process.exit(1);
    }

    console.log(
      "\nCatalog reset complete. Re-upload via admin or pnpm bulk-upload. Orphan S3/local files were not deleted.",
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
