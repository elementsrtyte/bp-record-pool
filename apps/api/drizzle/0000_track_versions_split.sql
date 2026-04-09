-- Split audio storage: one `standard` row in `track_versions` per `tracks` row, then drop legacy columns.
--
-- Safe to re-run:
-- - Skips inserts where a version already exists for that track + kind.
-- - If `tracks.master_key` still exists, copies keys and drops the columns afterward.
-- - If those columns are already gone (e.g. after a failed push), inserts empty keys so every
--   track still has a version row (previews/downloads stay empty until you re-upload or fix keys).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE "public"."track_version_kind" AS ENUM (
    'standard',
    'clean',
    'dirty',
    'intro',
    'radio',
    'instrumental',
    'extended',
    'acapella'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "track_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "track_id" uuid NOT NULL,
  "kind" "public"."track_version_kind" NOT NULL,
  "master_key" text NOT NULL,
  "preview_key" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "track_versions_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "track_versions_track_id_kind_unique" UNIQUE ("track_id", "kind")
);

DO $$
DECLARE
  has_legacy_audio boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tracks'
      AND column_name = 'master_key'
  ) INTO has_legacy_audio;

  IF has_legacy_audio THEN
    INSERT INTO "track_versions" ("track_id", "kind", "master_key", "preview_key", "created_at")
    SELECT
      t.id,
      'standard'::"public"."track_version_kind",
      COALESCE(t.master_key, ''),
      COALESCE(t.preview_key, ''),
      t.created_at
    FROM "tracks" t
    WHERE NOT EXISTS (
      SELECT 1 FROM "track_versions" v WHERE v.track_id = t.id AND v.kind = 'standard'::"public"."track_version_kind"
    );

    ALTER TABLE "tracks" DROP COLUMN IF EXISTS "master_key";
    ALTER TABLE "tracks" DROP COLUMN IF EXISTS "preview_key";
  ELSE
    INSERT INTO "track_versions" ("track_id", "kind", "master_key", "preview_key", "created_at")
    SELECT
      t.id,
      'standard'::"public"."track_version_kind",
      '',
      '',
      t.created_at
    FROM "tracks" t
    WHERE NOT EXISTS (
      SELECT 1 FROM "track_versions" v WHERE v.track_id = t.id AND v.kind = 'standard'::"public"."track_version_kind"
    );
  END IF;
END $$;
