#!/usr/bin/env npx tsx
/**
 * Legacy one-off script — prefer the checked-in Drizzle migration instead:
 *
 *   pnpm --filter @bp/api db:migrate
 *
 * That runs `drizzle/0000_track_versions_split.sql`, which:
 * - Creates `track_version_kind` + `track_versions` if needed
 * - Inserts one `standard` version per track (from `master_key`/`preview_key` when those columns exist,
 *   otherwise empty keys so every track still has a row)
 * - Drops legacy audio columns from `tracks` when present
 *
 * This file remains for emergencies / CI that cannot run drizzle-kit migrate.
 */

import postgres from "postgres";

import "../src/env.js";

const url =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const sql = postgres(url, { max: 1 });

async function main() {
  const col = await sql`
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tracks'
      AND column_name = 'master_key'
    LIMIT 1
  `;
  if (col.length === 0) {
    console.log("migrate-track-versions: no tracks.master_key column — already migrated or fresh schema.");
    await sql.end({ timeout: 1 });
    return;
  }

  await sql.unsafe(`
    DO $$ BEGIN
      CREATE TYPE track_version_kind AS ENUM (
        'standard', 'clean', 'dirty', 'intro', 'radio', 'instrumental', 'extended', 'acapella'
      );
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await sql`
    CREATE TABLE IF NOT EXISTS track_versions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      track_id uuid NOT NULL REFERENCES tracks (id) ON DELETE CASCADE,
      kind track_version_kind NOT NULL,
      master_key text NOT NULL,
      preview_key text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (track_id, kind)
    )
  `;

  const inserted = await sql`
    INSERT INTO track_versions (track_id, kind, master_key, preview_key, created_at)
    SELECT
      t.id,
      'standard'::track_version_kind,
      COALESCE(t.master_key, ''),
      COALESCE(t.preview_key, ''),
      t.created_at
    FROM tracks t
    WHERE NOT EXISTS (SELECT 1 FROM track_versions tv WHERE tv.track_id = t.id)
    RETURNING id
  `;

  await sql`ALTER TABLE tracks DROP COLUMN IF EXISTS master_key`;
  await sql`ALTER TABLE tracks DROP COLUMN IF EXISTS preview_key`;

  console.log(
    `migrate-track-versions: inserted ${inserted.length} version row(s); dropped legacy audio columns from tracks.`,
  );
  await sql.end({ timeout: 2 });
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
