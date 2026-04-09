-- Run this if `pnpm db:push` failed partway (e.g. releases dropped but tracks still has release_id).
-- From repo root, with DB URL in env:
--   psql "$DATABASE_URL" -f apps/api/scripts/recover-tracks-schema.sql
-- Local Supabase example:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f apps/api/scripts/recover-tracks-schema.sql

BEGIN;

-- New columns on tracks (idempotent)
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS artist text;
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS genre text;
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS release_date date;
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS artwork_key text;

-- Copy metadata from releases when both exist
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'releases'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tracks' AND column_name = 'release_id'
  ) THEN
    UPDATE tracks t SET
      artist = r.artist,
      genre = r.genre,
      release_date = r.release_date,
      artwork_key = r.artwork_key
    FROM releases r
    WHERE t.release_id = r.id;
  END IF;
END $$;

UPDATE tracks SET artist = 'Unknown' WHERE artist IS NULL OR btrim(artist) = '';
UPDATE tracks SET release_date = COALESCE(
  release_date,
  (created_at AT TIME ZONE 'UTC')::date
) WHERE release_date IS NULL;

ALTER TABLE tracks ALTER COLUMN artist SET NOT NULL;
ALTER TABLE tracks ALTER COLUMN release_date SET NOT NULL;

ALTER TABLE tracks DROP CONSTRAINT IF EXISTS tracks_release_id_releases_id_fk;
ALTER TABLE tracks DROP COLUMN IF EXISTS release_id;
ALTER TABLE tracks DROP COLUMN IF EXISTS track_number;
ALTER TABLE tracks DROP COLUMN IF EXISTS duration_seconds;

DROP TABLE IF EXISTS releases;

CREATE TABLE IF NOT EXISTS playlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tracks ADD COLUMN IF NOT EXISTS bpm integer;
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS musical_key text;

CREATE TABLE IF NOT EXISTS playlist_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id uuid NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  track_id uuid NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  position integer NOT NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT playlist_tracks_playlist_id_track_id_unique UNIQUE (playlist_id, track_id)
);

COMMIT;
