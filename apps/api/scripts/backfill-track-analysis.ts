#!/usr/bin/env npx tsx
/**
 * Re-run BPM / musical-key detection (and tag read) for tracks already in the database.
 *
 * Uses the same pipeline as new uploads: music-metadata tags, then decode + analysis.
 *
 * Usage (from repo root):
 *   pnpm backfill-track-analysis
 *   pnpm --filter @bp/api exec tsx scripts/backfill-track-analysis.ts --dry-run
 *
 * Options:
 *   --dry-run          Print actions only
 *   --force            Overwrite existing bpm / musical_key
 *   --all              Include tracks that already have both fields (requires --force to change)
 *   --limit N          Max tracks to process
 *   --id UUID          Single track id
 *   --concurrency N    Parallel workers (default: 1, max 8)
 *
 * By default only rows with missing bpm OR missing musical_key are selected.
 *
 * Env: DATABASE_URL, S3_* or local uploads (same as API). Loads monorepo `.env.local` via env module.
 */

import path from "node:path";
import { parseArgs } from "node:util";

import { desc, eq, isNull, or } from "drizzle-orm";

import "../src/env.js";
import { analyzeMasterAudio } from "../src/lib/audioAnalysis.js";
import { readObject } from "../src/lib/storage.js";
import { db } from "../src/db/client.js";
import { tracks } from "../src/db/schema.js";

const { values: flags } = parseArgs({
  options: {
    "dry-run": { type: "boolean", default: false },
    force: { type: "boolean", default: false },
    all: { type: "boolean", default: false },
    limit: { type: "string", default: "" },
    id: { type: "string", default: "" },
    concurrency: { type: "string", default: "1" },
    help: { type: "boolean", default: false },
  },
});

if (flags.help) {
  console.log("backfill-track-analysis — see scripts/backfill-track-analysis.ts header.");
  process.exit(0);
}

const dryRun = flags["dry-run"];
const force = flags.force;
const processAll = flags.all;
const limitN = flags.limit.trim() ? Math.max(1, parseInt(flags.limit, 10) || 0) : null;
const singleId = flags.id.trim();
const concurrency = Math.max(1, Math.min(8, parseInt(flags.concurrency, 10) || 1));

const selectCols = {
  id: tracks.id,
  masterKey: tracks.masterKey,
  bpm: tracks.bpm,
  musicalKey: tracks.musicalKey,
};

type Row = {
  id: string;
  masterKey: string;
  bpm: number | null;
  musicalKey: string | null;
};

async function loadTargets(): Promise<Row[]> {
  if (singleId) {
    return db
      .select(selectCols)
      .from(tracks)
      .where(eq(tracks.id, singleId))
      .limit(1);
  }

  if (processAll) {
    if (limitN != null) {
      return db
        .select(selectCols)
        .from(tracks)
        .orderBy(desc(tracks.createdAt))
        .limit(limitN);
    }
    return db.select(selectCols).from(tracks).orderBy(desc(tracks.createdAt));
  }

  if (limitN != null) {
    return db
      .select(selectCols)
      .from(tracks)
      .where(or(isNull(tracks.bpm), isNull(tracks.musicalKey)))
      .orderBy(desc(tracks.createdAt))
      .limit(limitN);
  }
  return db
    .select(selectCols)
    .from(tracks)
    .where(or(isNull(tracks.bpm), isNull(tracks.musicalKey)))
    .orderBy(desc(tracks.createdAt));
}

async function runOne(row: Row): Promise<{ ok: boolean; msg: string }> {
  if (!force && row.bpm != null && row.musicalKey != null) {
    return { ok: true, msg: "skip (already complete; use --force)" };
  }

  const filenameHint = path.basename(row.masterKey) || `track-${row.id}.mp3`;

  let buf: Buffer;
  try {
    buf = await readObject(row.masterKey);
  } catch (e) {
    return {
      ok: false,
      msg: `read ${row.masterKey}: ${(e as Error).message}`,
    };
  }

  let analyzed: { bpm: number | null; musicalKey: string | null };
  try {
    analyzed = await analyzeMasterAudio(buf, filenameHint);
  } catch (e) {
    return {
      ok: false,
      msg: `analyze: ${(e as Error).message}`,
    };
  }

  const nextBpm = force || row.bpm == null ? analyzed.bpm : row.bpm;
  const nextKey = force || row.musicalKey == null ? analyzed.musicalKey : row.musicalKey;

  if (
    !force &&
    nextBpm === row.bpm &&
    nextKey === row.musicalKey
  ) {
    return { ok: true, msg: "unchanged" };
  }

  if (dryRun) {
    return {
      ok: true,
      msg: `would set bpm=${nextBpm} musical_key=${nextKey}`,
    };
  }

  await db
    .update(tracks)
    .set({ bpm: nextBpm, musicalKey: nextKey })
    .where(eq(tracks.id, row.id));

  return {
    ok: true,
    msg: `bpm=${nextBpm} key=${nextKey}`,
  };
}

async function main() {
  if (processAll && !force) {
    console.warn("Note: --all includes complete rows; without --force they will be skipped.\n");
  }

  const targetRows = await loadTargets();
  if (targetRows.length === 0) {
    console.log("No tracks matched.");
    process.exit(0);
  }

  console.log(
    `Processing ${targetRows.length} track(s) (dry-run=${dryRun}, force=${force}, concurrency=${concurrency})…\n`,
  );

  const results: { row: Row; ok: boolean; msg: string }[] = new Array(targetRows.length);

  if (concurrency === 1) {
    for (let i = 0; i < targetRows.length; i++) {
      const row = targetRows[i]!;
      const r = await runOne(row);
      results[i] = { row, ...r };
      console.log(`${i + 1}/${targetRows.length} ${row.id} ${r.ok ? "✓" : "✗"} ${r.msg}`);
    }
  } else {
    let k = 0;
    async function worker() {
      for (;;) {
        const i = k++;
        if (i >= targetRows.length) return;
        const row = targetRows[i]!;
        results[i] = { row, ...(await runOne(row)) };
      }
    }
    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    for (let i = 0; i < targetRows.length; i++) {
      const e = results[i]!;
      console.log(`${i + 1}/${targetRows.length} ${e.row.id} ${e.ok ? "✓" : "✗"} ${e.msg}`);
    }
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nDone. ${targetRows.length - failed} ok, ${failed} failed.`);
  process.exit(failed > 0 ? 1 : 0);
}

void main();
